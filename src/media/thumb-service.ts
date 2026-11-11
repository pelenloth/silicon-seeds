import { mkdir, rename, rm } from "node:fs/promises";
import { Logger } from "../logger/logger";
import {
  ffmpegThumbArgs,
  resolveMediaPath,
  thumbCacheFile,
  thumbKind,
  type ThumbWidth,
} from "./thumbs";

const cacheDir = Bun.env.THUMB_DIR ?? "data/thumbs";
let dirReady: Promise<unknown> | null = null;

function ensureCacheDir(): Promise<unknown> {
  if (!dirReady) {
    dirReady = mkdir(cacheDir, { recursive: true });
  }
  return dirReady;
}

const MAX_CONCURRENT = 2;
let activeCount = 0;
const waiters: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeCount >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  activeCount++;
  try {
    return await fn();
  } finally {
    activeCount--;
    const next = waiters.shift();
    if (next) next();
  }
}

const inFlight = new Map<string, Promise<boolean>>();

async function generateThumb(
  abs: string,
  out: string,
  width: ThumbWidth,
): Promise<boolean> {
  await ensureCacheDir();
  if (await Bun.file(out).exists()) return true;

  const tmp = `${out}.${crypto.randomUUID()}.tmp.jpg`;
  let exitCode = -1;
  let stderrText = "";

  try {
    const proc = Bun.spawn(["ffmpeg", ...ffmpegThumbArgs(abs, tmp, width)], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "pipe",
    });
    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {}
    }, 20_000);
    try {
      const [code, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stderr).text().catch(() => ""),
      ]);
      exitCode = code;
      stderrText = stderr;
    } finally {
      clearTimeout(timer);
    }

    const tmpFile = Bun.file(tmp);
    if (exitCode === 0 && (await tmpFile.exists())) {
      const tmpStat = await tmpFile.stat();
      if (tmpStat.size > 0) {
        await rename(tmp, out);
        return true;
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
  return false;
}

export namespace Thumbs {
  export type Result =
    | { ok: true; file: string }
    | { ok: false; reason: "not-found" | "unsupported" | "failed" };

  export async function get(
    relPath: string,
    width: ThumbWidth,
  ): Promise<Result> {
    const abs = resolveMediaPath(Bun.env.OUTPUT_DIR ?? "", relPath);
    if (!abs) return { ok: false, reason: "not-found" };
    if (!thumbKind(abs)) return { ok: false, reason: "unsupported" };

    const file = Bun.file(abs);
    if (!(await file.exists())) return { ok: false, reason: "not-found" };
    let stat;
    try {
      stat = await file.stat();
    } catch {
      return { ok: false, reason: "not-found" };
    }
    if (!stat.isFile()) return { ok: false, reason: "not-found" };

    const out = thumbCacheFile(
      cacheDir,
      abs,
      stat.size,
      stat.mtime.getTime(),
      width,
    );
    if (await Bun.file(out).exists()) {
      return { ok: true, file: out };
    }

    let pending = inFlight.get(out);
    if (!pending) {
      pending = withSlot(() => generateThumb(abs, out, width)).finally(() => {
        inFlight.delete(out);
      });
      inFlight.set(out, pending);
    }

    const ok = await pending;
    return ok ? { ok: true, file: out } : { ok: false, reason: "failed" };
  }
}
