import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, spyOn, test } from "bun:test";
import { planWithTimeout } from "./plan-timeout";

describe("planWithTimeout", () => {
  test("1. timeout: resolves null, aborts signal given to run, calls onTimeout once", async () => {
    let capturedSignal: AbortSignal | undefined;
    let timeoutCalls = 0;

    const res = await planWithTimeout(
      (signal) => {
        capturedSignal = signal;
        return new Promise<string | null>(() => {});
      },
      {
        timeoutMs: 15,
        onTimeout: () => {
          timeoutCalls++;
        },
      },
    );

    expect(res).toBeNull();
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(true);
    expect(timeoutCalls).toBe(1);
  });

  test("2. caller abort while running: resolves null, aborts signal given to run, onTimeout not called", async () => {
    let capturedSignal: AbortSignal | undefined;
    let timeoutCalls = 0;
    const callerCtrl = new AbortController();

    const p = planWithTimeout(
      (signal) => {
        capturedSignal = signal;
        return new Promise<string | null>(() => {});
      },
      {
        timeoutMs: 10_000,
        signal: callerCtrl.signal,
        onTimeout: () => {
          timeoutCalls++;
        },
      },
    );

    await new Promise((r) => setTimeout(r, 5));
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);

    callerCtrl.abort();
    const res = await p;

    expect(res).toBeNull();
    expect(capturedSignal!.aborted).toBe(true);
    expect(timeoutCalls).toBe(0);
  });

  test("3. already-aborted caller signal: run not called, resolves null", async () => {
    let runCalls = 0;
    let timeoutCalls = 0;
    const callerCtrl = new AbortController();
    callerCtrl.abort();

    const res = await planWithTimeout(
      async () => {
        runCalls++;
        return "should not run";
      },
      {
        timeoutMs: 100,
        signal: callerCtrl.signal,
        onTimeout: () => {
          timeoutCalls++;
        },
      },
    );

    expect(res).toBeNull();
    expect(runCalls).toBe(0);
    expect(timeoutCalls).toBe(0);
  });

  test("4. normal result: passed through, timer cleared, signal not aborted, removeEventListener called", async () => {
    let capturedSignal: AbortSignal | undefined;
    let timeoutCalls = 0;
    const callerCtrl = new AbortController();
    const removeSpy = spyOn(callerCtrl.signal, "removeEventListener");

    const res = await planWithTimeout(
      async (signal) => {
        capturedSignal = signal;
        return { parsed: "ok" };
      },
      {
        timeoutMs: 20,
        signal: callerCtrl.signal,
        onTimeout: () => {
          timeoutCalls++;
        },
      },
    );

    expect(res).toEqual({ parsed: "ok" });
    expect(removeSpy).toHaveBeenCalled();

    await new Promise((r) => setTimeout(r, 50));
    expect(timeoutCalls).toBe(0);
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);
  });

  test("5. run rejects after timeout already won: no unhandled rejection", async () => {
    let rejectRun: ((reason?: unknown) => void) | undefined;

    const res = await planWithTimeout(
      () =>
        new Promise<string | null>((_resolve, reject) => {
          rejectRun = reject;
        }),
      {
        timeoutMs: 10,
      },
    );

    expect(res).toBeNull();
    expect(rejectRun).toBeDefined();
    rejectRun!(new Error("late failure after timeout"));
    await new Promise((r) => setTimeout(r, 20));
  });

  test("6. source of plan-timeout.ts contains no import from an llm path", () => {
    const src = readFileSync(join(import.meta.dir, "plan-timeout.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["'][^"']*llm[^"']*["']/i);
    expect(src).not.toMatch(/import\s*\(\s*["'][^"']*llm[^"']*["']\s*\)/i);
  });
});
