import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readdir,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createThumbService, type ThumbProcess } from "./thumb-service";

describe("createThumbService", () => {
  let root: string;
  let outputDir: string;
  let cacheDir: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "ss-thumb-test-"));
    outputDir = path.join(root, "out");
    cacheDir = path.join(root, "cache");
    await mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function okSpawn(
    onCall?: (args: string[]) => void | Promise<void>,
  ): (args: string[]) => ThumbProcess {
    return (args) => {
      const outPath = args[args.length - 1];
      const exited = (async () => {
        if (onCall) await onCall(args);
        await writeFile(outPath, "fake-jpeg-bytes");
        return 0;
      })();
      return {
        exited,
        stderr: null,
        kill: () => {},
      };
    };
  }

  test("stat errors (missing file, ENAMETOOLONG, directory) return not-found and unsupported extensions return unsupported", async () => {
    await mkdir(path.join(outputDir, "subdir"), { recursive: true });
    await writeFile(path.join(outputDir, "clip.mp3"), "audio");

    let spawns = 0;
    const svc = createThumbService({
      outputDir,
      cacheDir,
      spawn: okSpawn(() => {
        spawns++;
      }),
    });

    expect(await svc.get("missing.png", 320)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await svc.get(`${"a".repeat(5000)}.png`, 320)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await svc.get("subdir.png", 320)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await svc.get("clip.mp3", 320)).toEqual({
      ok: false,
      reason: "unsupported",
    });
    expect(spawns).toBe(0);
  });

  test("dedupes concurrent get calls for the same file and width", async () => {
    await writeFile(path.join(outputDir, "img.png"), "source");
    let spawns = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });

    const svc = createThumbService({
      outputDir,
      cacheDir,
      spawn: okSpawn(async () => {
        spawns++;
        await gate;
      }),
    });

    const p1 = svc.get("img.png", 320);
    const p2 = svc.get("img.png", 320);
    await new Promise((r) => setTimeout(r, 10));
    release();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(spawns).toBe(1);
    expect(r1.ok).toBe(true);
    expect(r2).toEqual(r1);

    // Subsequent call hits disk cache without spawning
    const r3 = await svc.get("img.png", 320);
    expect(r3).toEqual(r1);
    expect(spawns).toBe(1);
  });

  test("never runs more than maxConcurrent processes and hands slots directly to waiters", async () => {
    for (let i = 0; i < 6; i++) {
      await writeFile(path.join(outputDir, `f${i}.png`), `src-${i}`);
    }

    let live = 0;
    let peak = 0;
    const svc = createThumbService({
      outputDir,
      cacheDir,
      maxConcurrent: 2,
      spawn: okSpawn(async () => {
        live++;
        if (live > peak) peak = live;
        await new Promise((r) => setTimeout(r, 15));
        live--;
      }),
    });

    const results = await Promise.all(
      [0, 1, 2, 3, 4, 5].map((i) => svc.get(`f${i}.png`, 320)),
    );
    for (const r of results) {
      expect(r.ok).toBe(true);
    }
    expect(peak).toBe(2);
    expect(live).toBe(0);
  });

  test("bounded queue returns busy immediately when more than maxQueued are waiting", async () => {
    for (let i = 0; i < 4; i++) {
      await writeFile(path.join(outputDir, `q${i}.png`), `src-${i}`);
    }

    const gates: (() => void)[] = [];
    const svc = createThumbService({
      outputDir,
      cacheDir,
      maxConcurrent: 1,
      maxQueued: 1,
      spawn: okSpawn(
        () =>
          new Promise<void>((r) => {
            gates.push(r);
          }),
      ),
    });

    const p0 = svc.get("q0.png", 320); // takes active slot
    await new Promise((r) => setTimeout(r, 10));
    const p1 = svc.get("q1.png", 320); // takes the 1 queue slot
    await new Promise((r) => setTimeout(r, 10));
    const p2 = svc.get("q2.png", 320); // exceeds maxQueued -> busy immediately

    expect(await p2).toEqual({ ok: false, reason: "busy" });

    gates.shift()?.();
    await new Promise((r) => setTimeout(r, 10));
    gates.shift()?.();

    expect((await p0).ok).toBe(true);
    expect((await p1).ok).toBe(true);
  });

  test("timeout sends SIGTERM after timeoutMs and SIGKILL after killGraceMs, returning failed", async () => {
    await writeFile(path.join(outputDir, "hang.mp4"), "video");
    const signals: (number | NodeJS.Signals | undefined)[] = [];

    const svc = createThumbService({
      outputDir,
      cacheDir,
      timeoutMs: 20,
      killGraceMs: 20,
      spawn: () => {
        let resolveExit!: (code: number) => void;
        const exited = new Promise<number>((r) => {
          resolveExit = r;
        });
        return {
          exited,
          stderr: null,
          kill: (sig) => {
            signals.push(sig);
            if (sig === "SIGKILL" || sig === 9) {
              resolveExit(137);
            }
          },
        };
      },
    });

    const res = await svc.get("hang.mp4", 320);
    expect(res).toEqual({ ok: false, reason: "failed" });
    expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
  });

  test("negative cache remembers failed generation for failureTtlMs and caps at 500 entries", async () => {
    await writeFile(path.join(outputDir, "bad.png"), "corrupt");
    let nowMs = 1_000_000;
    let shouldSucceed = false;
    let spawns = 0;

    const svc = createThumbService({
      outputDir,
      cacheDir,
      failureTtlMs: 300_000,
      now: () => nowMs,
      spawn: (args) => {
        spawns++;
        const outPath = args[args.length - 1];
        const exited = (async () => {
          if (shouldSucceed) {
            await writeFile(outPath, "valid-jpeg");
            return 0;
          }
          return 1;
        })();
        return { exited, stderr: null, kill: () => {} };
      },
    });

    expect(await svc.get("bad.png", 320)).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(spawns).toBe(1);

    // Within TTL -> no spawn
    nowMs += 100_000;
    expect(await svc.get("bad.png", 320)).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(spawns).toBe(1);

    // After TTL -> retries and succeeds
    nowMs += 200_001;
    shouldSucceed = true;
    const retryRes = await svc.get("bad.png", 320);
    expect(retryRes.ok).toBe(true);
    expect(spawns).toBe(2);
  });

  test("negative cache caps at 500 entries by evicting the oldest", async () => {
    let nowMs = 1_000;
    let spawns = 0;
    const svc = createThumbService({
      outputDir,
      cacheDir,
      failureTtlMs: 300_000,
      maxConcurrent: 16,
      maxQueued: 600,
      now: () => nowMs,
      spawn: () => {
        spawns++;
        return { exited: Promise.resolve(1), stderr: null, kill: () => {} };
      },
    });

    for (let i = 0; i < 501; i++) {
      const name = `fail-${i}.png`;
      await writeFile(path.join(outputDir, name), `x-${i}`);
      nowMs += 10;
      await svc.get(name, 320);
    }
    expect(spawns).toBe(501);

    // Entry 1..500 should still be in negative cache (no new spawn for fail-500)
    await svc.get("fail-500.png", 320);
    expect(spawns).toBe(501);

    // Entry 0 was evicted when 501st was added, so requesting fail-0 spawns again
    await svc.get("fail-0.png", 320);
    expect(spawns).toBe(502);
  });

  test("clears memoised cache dir promise if mkdir fails so a later call can succeed", async () => {
    await writeFile(path.join(outputDir, "img.png"), "data");
    // Block cacheDir creation by placing a regular file at cacheDir path
    await writeFile(cacheDir, "blocking-file");

    const svc = createThumbService({
      outputDir,
      cacheDir,
      failureTtlMs: 0,
      spawn: okSpawn(),
    });

    const first = await svc.get("img.png", 320);
    expect(first).toEqual({ ok: false, reason: "failed" });

    // Remove the blocking file so mkdir can succeed on the next call
    await rm(cacheDir, { force: true });
    const second = await svc.get("img.png", 320);
    expect(second.ok).toBe(true);
  });

  test("removes temp file on empty output or failure, and sweeps stale *.tmp.jpg older than 10 minutes on first generation", async () => {
    await mkdir(cacheDir, { recursive: true });
    const staleTmp = path.join(cacheDir, "old.123.tmp.jpg");
    const freshTmp = path.join(cacheDir, "fresh.456.tmp.jpg");
    await writeFile(staleTmp, "stale");
    await writeFile(freshTmp, "fresh");
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000);
    await utimes(staleTmp, twentyMinAgo, twentyMinAgo);

    await writeFile(path.join(outputDir, "empty.png"), "src");
    const svc = createThumbService({
      outputDir,
      cacheDir,
      spawn: (args) => {
        const outPath = args[args.length - 1];
        // Write 0-byte file with exit code 0 -> must count as failed and remove tmp
        const exited = (async () => {
          await writeFile(outPath, "");
          return 0;
        })();
        return { exited, stderr: null, kill: () => {} };
      },
    });

    const res = await svc.get("empty.png", 320);
    expect(res).toEqual({ ok: false, reason: "failed" });

    const files = await readdir(cacheDir);
    expect(files).not.toContain("old.123.tmp.jpg");
    expect(files).toContain("fresh.456.tmp.jpg");
    // The failed generation's own tmp file was also cleaned up
    expect(files.filter((f) => f.endsWith(".tmp.jpg"))).toEqual([
      "fresh.456.tmp.jpg",
    ]);
  });
});
