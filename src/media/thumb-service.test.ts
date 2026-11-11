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
      spawn: okSpawn(),
    });

    const first = await svc.get("img.png", 320);
    expect(first).toEqual({ ok: false, reason: "failed" });

    // Remove the blocking file so mkdir can succeed on the next call (even with default failureTtlMs)
    await rm(cacheDir, { force: true });
    const second = await svc.get("img.png", 320);
    expect(second.ok).toBe(true);
  });

  test("removes temp file on empty output or failure, and sweeps stale *.tmp.jpg older than 10 minutes on first generation using wall clock", async () => {
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
      // Injected clock far in the future must NOT cause freshTmp to be swept
      now: () => Date.now() + 24 * 60 * 60 * 1000,
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

  test("timed-out process that exits 0 with non-empty file is still failed and its temp file is removed", async () => {
    await writeFile(path.join(outputDir, "late-ok.mp4"), "video");

    const svc = createThumbService({
      outputDir,
      cacheDir,
      timeoutMs: 20,
      killGraceMs: 50,
      spawn: (args) => {
        const outPath = args[args.length - 1];
        let resolveExit!: (code: number) => void;
        const exited = new Promise<number>((r) => {
          resolveExit = r;
        });
        return {
          exited,
          stderr: null,
          kill: (sig) => {
            if (sig === "SIGTERM") {
              void writeFile(outPath, "late-jpeg-bytes").then(() => {
                resolveExit(0);
              });
            }
          },
        };
      },
    });

    const res = await svc.get("late-ok.mp4", 320);
    expect(res).toEqual({ ok: false, reason: "failed" });
    const files = await readdir(cacheDir);
    expect(files).toEqual([]);
  });

  test("bounded wait after SIGKILL: if exited never resolves, get resolves failed and releases the slot", async () => {
    await writeFile(path.join(outputDir, "zombie.mp4"), "video");
    await writeFile(path.join(outputDir, "next.png"), "image");

    const svc = createThumbService({
      outputDir,
      cacheDir,
      maxConcurrent: 1,
      timeoutMs: 15,
      killGraceMs: 15,
      spawn: (args) => {
        const outPath = args[args.length - 1];
        const inputPath = args[args.indexOf("-i") + 1];
        if (inputPath.endsWith("zombie.mp4")) {
          return {
            exited: new Promise<number>(() => {}),
            stderr: new ReadableStream<Uint8Array>({
              start() {
                // never closes
              },
            }),
            kill: () => {},
          };
        }
        return {
          exited: writeFile(outPath, "ok-jpeg").then(() => 0),
          stderr: null,
          kill: () => {},
        };
      },
    });

    const r1 = await svc.get("zombie.mp4", 320);
    expect(r1).toEqual({ ok: false, reason: "failed" });

    const r2 = await svc.get("next.png", 320);
    expect(r2.ok).toBe(true);
  });

  test("synchronous spawn throw returns failed, releases the slot and clears in-flight entry", async () => {
    await writeFile(path.join(outputDir, "boom.png"), "image1");
    await writeFile(path.join(outputDir, "after.png"), "image2");
    let throwFirst = true;

    const svc = createThumbService({
      outputDir,
      cacheDir,
      maxConcurrent: 1,
      failureTtlMs: 0,
      spawn: (args) => {
        if (throwFirst) {
          throwFirst = false;
          throw new Error("spawn ENOENT");
        }
        const outPath = args[args.length - 1];
        return {
          exited: writeFile(outPath, "ok-jpeg").then(() => 0),
          stderr: null,
          kill: () => {},
        };
      },
    });

    const r1 = await svc.get("boom.png", 320);
    expect(r1).toEqual({ ok: false, reason: "failed" });

    // Slot was released so another file succeeds
    const r2 = await svc.get("after.png", 320);
    expect(r2.ok).toBe(true);

    // In-flight entry for boom.png was cleared so retrying boom.png spawns again and succeeds
    const r3 = await svc.get("boom.png", 320);
    expect(r3.ok).toBe(true);
  });

  test("drains stderr from a real ReadableStream that emits chunks before exit", async () => {
    await writeFile(path.join(outputDir, "noisy.png"), "image");
    let drained = false;

    const svc = createThumbService({
      outputDir,
      cacheDir,
      spawn: () => {
        const enc = new TextEncoder();
        let exitResolve!: (code: number) => void;
        const exited = new Promise<number>((r) => {
          exitResolve = r;
        });
        const stderr = new ReadableStream<Uint8Array>({
          async start(controller) {
            controller.enqueue(enc.encode("chunk-1 "));
            await new Promise((r) => setTimeout(r, 5));
            controller.enqueue(enc.encode("chunk-2 "));
            await new Promise((r) => setTimeout(r, 5));
            controller.enqueue(enc.encode("chunk-3"));
            drained = true;
            controller.close();
            exitResolve(1);
          },
        });
        return { exited, stderr, kill: () => {} };
      },
    });

    const res = await svc.get("noisy.png", 320);
    expect(res).toEqual({ ok: false, reason: "failed" });
    expect(drained).toBe(true);
  });

  test("hand-off order with maxConcurrent: 1 spawns A, B, C when C arrives in the same tick A finishes", async () => {
    await writeFile(path.join(outputDir, "a.png"), "a");
    await writeFile(path.join(outputDir, "b.png"), "b");
    await writeFile(path.join(outputDir, "c.png"), "c");

    const order: string[] = [];
    const gates = new Map<string, () => void>();

    const svc = createThumbService({
      outputDir,
      cacheDir,
      maxConcurrent: 1,
      spawn: (args) => {
        const inputPath = args[args.indexOf("-i") + 1];
        const name = path.basename(inputPath, ".png");
        order.push(name);
        const outPath = args[args.length - 1];
        const exited = new Promise<void>((r) => {
          gates.set(name, r);
        }).then(async () => {
          await writeFile(outPath, `jpeg-${name}`);
          return 0;
        });
        return { exited, stderr: null, kill: () => {} };
      },
    });

    const pA = svc.get("a.png", 320);
    await new Promise((r) => setTimeout(r, 10));
    const pB = svc.get("b.png", 320);
    await new Promise((r) => setTimeout(r, 10));

    // Finish A and immediately enqueue C in the same tick
    gates.get("a")?.();
    const pC = svc.get("c.png", 320);

    await new Promise((r) => setTimeout(r, 15));
    gates.get("b")?.();
    await new Promise((r) => setTimeout(r, 15));
    gates.get("c")?.();

    const [rA, rB, rC] = await Promise.all([pA, pB, pC]);
    expect(rA.ok).toBe(true);
    expect(rB.ok).toBe(true);
    expect(rC.ok).toBe(true);
    expect(order).toEqual(["a", "b", "c"]);
  });

  test("source file whose size or mtime changed gets a new cache key and is retried while old key is negatively cached", async () => {
    const file = path.join(outputDir, "changing.png");
    await writeFile(file, "v1");
    let spawns = 0;
    let shouldFail = true;

    const svc = createThumbService({
      outputDir,
      cacheDir,
      failureTtlMs: 300_000,
      spawn: (args) => {
        spawns++;
        const outPath = args[args.length - 1];
        if (shouldFail) {
          return { exited: Promise.resolve(1), stderr: null, kill: () => {} };
        }
        return {
          exited: writeFile(outPath, "ok-jpeg").then(() => 0),
          stderr: null,
          kill: () => {},
        };
      },
    });

    expect(await svc.get("changing.png", 320)).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(spawns).toBe(1);

    // Unchanged file hits negative cache
    expect(await svc.get("changing.png", 320)).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(spawns).toBe(1);

    // Modify file size and mtime -> new cache key -> spawns and succeeds
    shouldFail = false;
    await writeFile(file, "v2-longer-content");
    const future = new Date(Date.now() + 5000);
    await utimes(file, future, future);

    const res = await svc.get("changing.png", 320);
    expect(res.ok).toBe(true);
    expect(spawns).toBe(2);
  });

  test("busy results are not negative-cached and cache dir holds only final file after success", async () => {
    await writeFile(path.join(outputDir, "hold.png"), "hold");
    await writeFile(path.join(outputDir, "busy.png"), "busy");

    let releaseHold!: () => void;
    const holdGate = new Promise<void>((r) => {
      releaseHold = r;
    });

    const svc = createThumbService({
      outputDir,
      cacheDir,
      maxConcurrent: 1,
      maxQueued: 0,
      failureTtlMs: 300_000,
      spawn: (args) => {
        const inputPath = args[args.indexOf("-i") + 1];
        const outPath = args[args.length - 1];
        const exited = (async () => {
          if (inputPath.endsWith("hold.png")) {
            await holdGate;
          }
          await writeFile(outPath, "ok-jpeg");
          return 0;
        })();
        return { exited, stderr: null, kill: () => {} };
      },
    });

    const pHold = svc.get("hold.png", 320);
    await new Promise((r) => setTimeout(r, 10));

    // Queue is full (maxQueued: 0) -> returns busy
    const busyRes = await svc.get("busy.png", 320);
    expect(busyRes).toEqual({ ok: false, reason: "busy" });

    releaseHold();
    expect((await pHold).ok).toBe(true);

    // busy.png was NOT negative-cached, so now it succeeds
    const retryBusy = await svc.get("busy.png", 320);
    expect(retryBusy.ok).toBe(true);

    const files = await readdir(cacheDir);
    expect(files.length).toBe(2);
    expect(files.some((f) => f.endsWith(".tmp.jpg"))).toBe(false);
    expect(files.every((f) => f.endsWith("-320.jpg"))).toBe(true);
  });
});
