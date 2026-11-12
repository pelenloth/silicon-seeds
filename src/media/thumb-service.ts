import { mkdir, readdir, rename, rm, stat as fsStat } from "node:fs/promises";
import path from "node:path";
import { Logger } from "../logger/logger";
import {
  ffmpegThumbArgs,
  resolveMediaPath,
  thumbCacheFile,
  thumbKind,
  type ThumbWidth,
} from "./thumbs";

export type ThumbProcess = {
  exited: Promise<number>;
  stderr: ReadableStream<Uint8Array> | null;
  kill(signal?: number | NodeJS.Signals): void;
};

export type ThumbServiceDeps = {
  outputDir: string;
  cacheDir: string;
  spawn: (args: string[]) => ThumbProcess; // args = ["ffmpeg", ...]
  timeoutMs?: number; // default 20_000
  killGraceMs?: number; // default 2_000
  maxConcurrent?: number; // default 2
  maxQueued?: number; // default 64
  failureTtlMs?: number; // default 300_000
  now?: () => number; // default Date.now
};

export type ThumbResult =
  | { ok: true; file: string }
  | { ok: false; reason: "not-found" | "unsupported" | "failed" | "busy" };

const NEGATIVE_CACHE_MAX = 500;
const STALE_TMP_AGE_MS = 10 * 60 * 1000;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const STDERR_CAP_BYTES = 2048;

async function readStderrCapped(
  reader: ReadableStreamDefaultReader<Uint8Array> | null,
): Promise<string> {
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let kept = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0 && kept < STDERR_CAP_BYTES) {
        const take = Math.min(value.byteLength, STDERR_CAP_BYTES - kept);
        chunks.push(
          take === value.byteLength ? value : value.subarray(0, take),
        );
        kept += take;
      }
    }
  } catch {}
  if (kept === 0) return "";
  const out = new Uint8Array(kept);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(out);
}

export function createThumbService(deps: ThumbServiceDeps): {
  get(relPath: string, width: ThumbWidth): Promise<ThumbResult>;
} {
  const timeoutMs = deps.timeoutMs ?? 20_000;
  const killGraceMs = deps.killGraceMs ?? 2_000;
  const maxConcurrent = deps.maxConcurrent ?? 2;
  const maxQueued = deps.maxQueued ?? 64;
  const failureTtlMs = deps.failureTtlMs ?? 300_000;
  const now = deps.now ?? Date.now;

  let dirReady: Promise<unknown> | null = null;
  let lastSweepWallMs = 0;

  function ensureCacheDir(): Promise<unknown> {
    if (!dirReady) {
      dirReady = mkdir(deps.cacheDir, { recursive: true }).catch((err) => {
        dirReady = null;
        throw err;
      });
    }
    return dirReady;
  }

  async function sweepStaleTmp(): Promise<void> {
    const wallNow = Date.now();
    if (
      lastSweepWallMs !== 0 &&
      wallNow - lastSweepWallMs < SWEEP_INTERVAL_MS
    ) {
      return;
    }
    lastSweepWallMs = wallNow;
    try {
      const entries = await readdir(deps.cacheDir);
      const cutoff = wallNow - STALE_TMP_AGE_MS;
      for (const name of entries) {
        if (!name.endsWith(".tmp.jpg")) continue;
        const full = path.join(deps.cacheDir, name);
        try {
          const st = await fsStat(full);
          if (st.mtimeMs < cutoff) {
            await rm(full, { force: true });
          }
        } catch {}
      }
    } catch {}
  }

  let activeCount = 0;
  const waiters: (() => void)[] = [];

  async function withSlot<T>(
    fn: () => Promise<T>,
  ): Promise<{ busy: true } | { busy: false; value: T }> {
    if (activeCount >= maxConcurrent) {
      if (waiters.length >= maxQueued) {
        return { busy: true };
      }
      await new Promise<void>((resolve) => waiters.push(resolve));
    } else {
      activeCount++;
    }
    try {
      const value = await fn();
      return { busy: false, value };
    } finally {
      const next = waiters.shift();
      if (next) {
        next();
      } else {
        activeCount--;
      }
    }
  }

  const inFlight = new Map<string, Promise<ThumbResult>>();
  const negativeCache = new Map<string, number>();

  function isNegativelyCached(key: string): boolean {
    const failedAt = negativeCache.get(key);
    if (failedAt === undefined) return false;
    if (failureTtlMs <= 0 || now() - failedAt >= failureTtlMs) {
      negativeCache.delete(key);
      return false;
    }
    return true;
  }

  // Environment failures (ffmpeg missing, cache dir unwritable, rename
  // failure) are process-wide: remember them briefly so tile requests and
  // client retries do not spawn ffmpeg again every time.
  const ENV_FAILURE_WINDOW_MS = 60_000;
  let envFailedAt: number | null = null;

  function envFailureActive(): boolean {
    if (envFailedAt === null) return false;
    if (now() - envFailedAt >= ENV_FAILURE_WINDOW_MS) {
      envFailedAt = null;
      return false;
    }
    return true;
  }

  function recordEnvFailure(): void {
    if (envFailureActive()) return;
    envFailedAt = now();
    try {
      Logger.warn(
        `[Thumbs] environment failure, not retrying for ${ENV_FAILURE_WINDOW_MS / 1000}s`,
      );
    } catch {}
  }

  function recordFailure(key: string): void {
    if (failureTtlMs <= 0) return;
    if (negativeCache.has(key)) {
      negativeCache.delete(key);
    } else if (negativeCache.size >= NEGATIVE_CACHE_MAX) {
      const oldestKey = negativeCache.keys().next().value;
      if (oldestKey !== undefined) {
        negativeCache.delete(oldestKey);
      }
    }
    negativeCache.set(key, now());
  }

  async function generateThumb(
    abs: string,
    out: string,
    width: ThumbWidth,
    kind: "image" | "video",
  ): Promise<"ok" | "failed" | "env-failed"> {
    try {
      await ensureCacheDir();
    } catch (err) {
      try {
        Logger.warn(`[Thumbs] failed to create cache dir: ${String(err)}`);
      } catch {}
      return "env-failed";
    }

    await sweepStaleTmp();

    try {
      const existing = await fsStat(out);
      if (existing.isFile() && existing.size > 0) return "ok";
    } catch {}

    const tmp = `${out}.${crypto.randomUUID()}.tmp.jpg`;
    let exitCode = -1;
    let stderrText = "";
    let timedOut = false;
    let abandoned = false;
    let proc: ThumbProcess;

    try {
      proc = deps.spawn(["ffmpeg", ...ffmpegThumbArgs(abs, tmp, width, kind)]);
    } catch (err) {
      try {
        Logger.warn(`[Thumbs] failed to spawn ffmpeg: ${String(err)}`);
      } catch {}
      return "env-failed";
    }

    try {
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      try {
        reader = proc.stderr ? proc.stderr.getReader() : null;
      } catch {}

      let killTimer: ReturnType<typeof setTimeout> | undefined;
      let abandonTimer: ReturnType<typeof setTimeout> | undefined;
      let resolveAbandon!: (res: [number, string]) => void;
      const abandonPromise = new Promise<[number, string]>((r) => {
        resolveAbandon = r;
      });

      const termTimer = setTimeout(() => {
        timedOut = true;
        try {
          proc.kill("SIGTERM");
        } catch {}
        killTimer = setTimeout(() => {
          try {
            proc.kill("SIGKILL");
          } catch {}
          abandonTimer = setTimeout(() => {
            abandoned = true;
            try {
              void reader?.cancel().catch(() => {});
            } catch {}
            resolveAbandon([-1, "timed out after SIGKILL"]);
          }, killGraceMs);
        }, killGraceMs);
      }, timeoutMs);

      try {
        const stderrPromise = readStderrCapped(reader);
        const [code, stderr] = await Promise.race([
          Promise.all([proc.exited, stderrPromise]),
          abandonPromise,
        ]);
        exitCode = code;
        stderrText = stderr;
      } finally {
        clearTimeout(termTimer);
        if (killTimer !== undefined) clearTimeout(killTimer);
        if (abandonTimer !== undefined) clearTimeout(abandonTimer);
      }

      if (abandoned) {
        const delayedRm = setTimeout(
          () => {
            void rm(tmp, { force: true }).catch(() => {});
          },
          Math.max(killGraceMs, 100),
        );
        delayedRm.unref?.();
      } else if (!timedOut && exitCode === 0) {
        let usable = false;
        try {
          const tmpStat = await fsStat(tmp);
          usable = tmpStat.isFile() && tmpStat.size > 0;
        } catch {}
        if (usable) {
          try {
            await rename(tmp, out);
            return "ok";
          } catch (err) {
            try {
              await rm(tmp, { force: true });
            } catch {}
            try {
              Logger.warn(
                `[Thumbs] failed to rename thumbnail: ${String(err)}`,
              );
            } catch {}
            return "env-failed";
          }
        }
      }
    } catch (err) {
      stderrText = stderrText || String(err);
    }

    try {
      await rm(tmp, { force: true });
    } catch {}
    try {
      Logger.warn(
        `[Thumbs] ffmpeg failed (${exitCode}): ${stderrText.slice(0, 200)}`,
      );
    } catch {}
    return "failed";
  }

  return {
    async get(relPath: string, width: ThumbWidth): Promise<ThumbResult> {
      const abs = resolveMediaPath(deps.outputDir, relPath);
      if (!abs) return { ok: false, reason: "not-found" };
      const kind = thumbKind(abs);
      if (!kind) return { ok: false, reason: "unsupported" };

      let stat;
      try {
        stat = await Bun.file(abs).stat();
      } catch {
        return { ok: false, reason: "not-found" };
      }
      if (!stat.isFile()) return { ok: false, reason: "not-found" };

      const out = thumbCacheFile(
        deps.cacheDir,
        abs,
        stat.size,
        stat.mtime.getTime(),
        width,
      );

      try {
        const cachedStat = await Bun.file(out).stat();
        if (cachedStat.isFile() && cachedStat.size > 0) {
          return { ok: true, file: out };
        }
      } catch {}

      if (isNegativelyCached(out) || envFailureActive()) {
        return { ok: false, reason: "failed" };
      }

      let pending = inFlight.get(out);
      if (!pending) {
        pending = (async (): Promise<ThumbResult> => {
          const slotRes = await withSlot(() =>
            generateThumb(abs, out, width, kind),
          );
          if (slotRes.busy) {
            return { ok: false, reason: "busy" };
          }
          if (slotRes.value === "ok") {
            negativeCache.delete(out);
            return { ok: true, file: out };
          }
          if (slotRes.value === "failed") {
            recordFailure(out);
          } else if (slotRes.value === "env-failed") {
            recordEnvFailure();
          }
          return { ok: false, reason: "failed" };
        })().finally(() => {
          inFlight.delete(out);
        });
        inFlight.set(out, pending);
      }

      return pending;
    },
  };
}

let defaultService: ReturnType<typeof createThumbService> | null = null;

function getDefaultService(): ReturnType<typeof createThumbService> {
  if (!defaultService) {
    defaultService = createThumbService({
      outputDir: Bun.env.OUTPUT_DIR ?? "",
      cacheDir: Bun.env.THUMB_DIR ?? "data/thumbs",
      spawn: (args) => {
        const proc = Bun.spawn(args, {
          stdin: "ignore",
          stdout: "ignore",
          stderr: "pipe",
        });
        return {
          exited: proc.exited,
          stderr: proc.stderr,
          kill: (sig) => proc.kill(sig),
        };
      },
    });
  }
  return defaultService;
}

export namespace Thumbs {
  export type Result = ThumbResult;

  export async function get(
    relPath: string,
    width: ThumbWidth,
  ): Promise<ThumbResult> {
    return getDefaultService().get(relPath, width);
  }
}
