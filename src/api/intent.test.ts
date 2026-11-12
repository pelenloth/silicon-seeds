import { beforeAll, describe, expect, test } from "bun:test";
import { Logger } from "../logger/logger";
import { planWithTimeout } from "./intent";
import type { RawIntent } from "../prompts/intent";

beforeAll(async () => {
  await Logger.init();
});

describe("planWithTimeout", () => {
  test("timeout resolves null and aborts the signal passed to structured", async () => {
    let capturedSignal: AbortSignal | undefined;
    const structured = (
      _prompt: string,
      _schema: unknown,
      opts?: { signal?: AbortSignal },
    ) => {
      capturedSignal = opts?.signal;
      return new Promise<{ parsed: RawIntent } | null>(() => {});
    };

    const res = await planWithTimeout("test prompt", {
      timeoutMs: 15,
      structured,
    });
    expect(res).toBeNull();
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(true);
  });

  test("client abort aborts the signal passed to structured", async () => {
    let capturedSignal: AbortSignal | undefined;
    const clientCtrl = new AbortController();

    const structured = (
      _prompt: string,
      _schema: unknown,
      opts?: { signal?: AbortSignal },
    ) => {
      capturedSignal = opts?.signal;
      return new Promise<{ parsed: RawIntent } | null>((resolve) => {
        opts?.signal?.addEventListener("abort", () => resolve(null), {
          once: true,
        });
      });
    };

    const p = planWithTimeout("test prompt", {
      timeoutMs: 10_000,
      signal: clientCtrl.signal,
      structured,
    });

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);

    clientCtrl.abort();
    const res = await p;
    expect(res).toBeNull();
    expect(capturedSignal!.aborted).toBe(true);
  });

  test("normal result is passed through and timer is cleared without aborting", async () => {
    let capturedSignal: AbortSignal | undefined;
    const expected: { parsed: RawIntent } = {
      parsed: { kind: "image", prompt: "a fox" },
    };

    const structured = async (
      _prompt: string,
      _schema: unknown,
      opts?: { signal?: AbortSignal },
    ) => {
      capturedSignal = opts?.signal;
      return expected;
    };

    const res = await planWithTimeout("test prompt", {
      timeoutMs: 50,
      structured,
    });
    expect(res).toEqual(expected);
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);
  });
});
