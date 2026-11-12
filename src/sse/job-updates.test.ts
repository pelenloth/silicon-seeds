import { describe, expect, test } from "bun:test";
import { createJobUpdates, JobUpdates } from "./job-updates";

const decoder = new TextDecoder();

function createFakeClock(initialNow = 1000) {
  let now = initialNow;
  let nextId = 1;
  const timeouts = new Map<number, { fn: () => void; at: number }>();
  const intervals = new Map<number, { fn: () => void; ms: number }>();

  return {
    now: () => now,
    advance(ms: number) {
      now += ms;
    },
    setTimeout: ((fn: () => void, ms?: number) => {
      const id = nextId++;
      timeouts.set(id, { fn, at: now + (ms ?? 0) });
      return id as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout,
    clearTimeout: ((id: ReturnType<typeof setTimeout>) => {
      timeouts.delete(id as unknown as number);
    }) as typeof clearTimeout,
    setInterval: ((fn: () => void, ms?: number) => {
      const id = nextId++;
      intervals.set(id, { fn, ms: ms ?? 0 });
      return id as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval,
    clearInterval: ((id: ReturnType<typeof setInterval>) => {
      intervals.delete(id as unknown as number);
    }) as typeof clearInterval,
    runDueTimeouts() {
      for (const [id, entry] of [...timeouts.entries()]) {
        if (entry.at <= now) {
          timeouts.delete(id);
          entry.fn();
        }
      }
    },
    runAllTimeouts() {
      for (const [id, entry] of [...timeouts.entries()]) {
        timeouts.delete(id);
        entry.fn();
      }
    },
    tickIntervals() {
      for (const entry of [...intervals.values()]) {
        entry.fn();
      }
    },
    timeoutCount: () => timeouts.size,
    intervalCount: () => intervals.size,
  };
}

async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<string> {
  const { value, done } = await reader.read();
  if (done || !value) return "";
  return decoder.decode(value);
}

describe("createJobUpdates (injected clock & timers)", () => {
  test("a new stream yields connected first", async () => {
    const clock = createFakeClock();
    const hub = createJobUpdates(clock);

    const allRes = hub.streamAll();
    expect(allRes.headers.get("Content-Type")).toBe("text/event-stream");
    const allReader = allRes.body!.getReader();
    expect(await readChunk(allReader)).toBe(
      'event: connected\ndata: {"jobId":"*"}\n\n',
    );
    await allReader.cancel();

    const jobRes = hub.stream("job-1");
    const jobReader = jobRes.body!.getReader();
    expect(await readChunk(jobReader)).toBe(
      'event: connected\ndata: {"jobId":"job-1"}\n\n',
    );
    await jobReader.cancel();
  });

  test("first publish is delivered at once, without any timer firing", async () => {
    const clock = createFakeClock();
    const hub = createJobUpdates(clock);

    const res = hub.streamAll();
    const reader = res.body!.getReader();
    await readChunk(reader); // connected

    hub.publish("job-a");
    // No timers fired yet!
    expect(await readChunk(reader)).toBe(
      'event: job-update\ndata: {"jobId":"job-a"}\n\n',
    );
    await reader.cancel();
  });

  test("three publishes inside the window give1 leading and 1 trailing event when the timer fires", async () => {
    const clock = createFakeClock();
    const hub = createJobUpdates(clock);

    const seen: string[] = [];
    const off = hub.subscribeAll((name, data) => {
      seen.push(`${name}:${data}`);
    });

    hub.publish("job-a");
    hub.publish("job-a");
    hub.publish("job-a");

    expect(seen).toEqual(['job-update:{"jobId":"job-a"}']);

    clock.advance(300);
    clock.runDueTimeouts();

    expect(seen).toEqual([
      'job-update:{"jobId":"job-a"}',
      'job-update:{"jobId":"job-a"}',
    ]);

    // And after the window closes, another publish sends immediately again
    hub.publish("job-a");
    expect(seen.length).toBe(3);
    off();
  });

  test("single publish inside window does not emit a second trailing event when timer fires", () => {
    const clock = createFakeClock();
    const hub = createJobUpdates(clock);

    const seen: string[] = [];
    const off = hub.subscribeAll((name, data) => {
      seen.push(`${name}:${data}`);
    });

    hub.publish("job-solo");
    expect(seen.length).toBe(1);

    clock.advance(300);
    clock.runDueTimeouts();
    expect(seen.length).toBe(1);
    off();
  });

  test("stale window: publish, never fire the timer, advance now by 2000 ms, publish again -> delivered at once", async () => {
    const clock = createFakeClock();
    const hub = createJobUpdates(clock);

    const res = hub.streamAll();
    const reader = res.body!.getReader();
    await readChunk(reader); // connected

    hub.publish("job-stale");
    expect(await readChunk(reader)).toBe(
      'event: job-update\ndata: {"jobId":"job-stale"}\n\n',
    );

    // Do NOT fire timers; advance clock past 1000ms stale threshold
    clock.advance(2000);
    hub.publish("job-stale");
    expect(await readChunk(reader)).toBe(
      'event: job-update\ndata: {"jobId":"job-stale"}\n\n',
    );

    await reader.cancel();
  });

  test("per-job stream only gets its own job; global stream gets all", async () => {
    const clock = createFakeClock();
    const hub = createJobUpdates(clock);

    const allReader = hub.streamAll().body!.getReader();
    const aReader = hub.stream("job-a").body!.getReader();
    const bReader = hub.stream("job-b").body!.getReader();

    await readChunk(allReader);
    await readChunk(aReader);
    await readChunk(bReader);

    hub.publish("job-a");
    expect(await readChunk(allReader)).toBe(
      'event: job-update\ndata: {"jobId":"job-a"}\n\n',
    );
    expect(await readChunk(aReader)).toBe(
      'event: job-update\ndata: {"jobId":"job-a"}\n\n',
    );

    hub.publish("job-b");
    expect(await readChunk(allReader)).toBe(
      'event: job-update\ndata: {"jobId":"job-b"}\n\n',
    );
    expect(await readChunk(bReader)).toBe(
      'event: job-update\ndata: {"jobId":"job-b"}\n\n',
    );

    await allReader.cancel();
    await aReader.cancel();
    await bReader.cancel();
  });

  test("reader.cancel() removes the subscriber and clears the heartbeat", async () => {
    const clock = createFakeClock();
    const hub = createJobUpdates(clock);

    expect(hub.subscriberCount()).toBe(0);
    expect(clock.intervalCount()).toBe(0);

    const allReader = hub.streamAll().body!.getReader();
    const jobReader = hub.stream("job-1").body!.getReader();
    expect(hub.subscriberCount()).toBe(2);
    expect(clock.intervalCount()).toBe(2);

    await allReader.cancel();
    expect(hub.subscriberCount()).toBe(1);
    expect(clock.intervalCount()).toBe(1);

    await jobReader.cancel();
    expect(hub.subscriberCount()).toBe(0);
    expect(clock.intervalCount()).toBe(0);
  });

  test("an enqueue that throws removes the subscriber and nothing propagates out of publish or heartbeat", async () => {
    const clock = createFakeClock();
    const hub = createJobUpdates(clock);

    const origEnqueue = ReadableStreamDefaultController.prototype.enqueue;
    let shouldThrow = false;
    ReadableStreamDefaultController.prototype.enqueue = function (
      chunk: Uint8Array,
    ) {
      if (shouldThrow) {
        throw new Error("Controller is already closed");
      }
      return origEnqueue.call(this, chunk);
    };

    try {
      const res1 = hub.streamAll();
      const res2 = hub.stream("job-err");
      const r1 = res1.body!.getReader();
      const r2 = res2.body!.getReader();
      await readChunk(r1);
      await readChunk(r2);
      expect(hub.subscriberCount()).toBe(2);

      shouldThrow = true;
      expect(() => hub.publish("job-err")).not.toThrow();
      expect(hub.subscriberCount()).toBe(0);
      expect(clock.intervalCount()).toBe(0);

      // Also verify heartbeat callback when enqueue throws
      shouldThrow = false;
      const res3 = hub.streamAll();
      const r3 = res3.body!.getReader();
      await readChunk(r3);
      expect(hub.subscriberCount()).toBe(1);

      shouldThrow = true;
      expect(() => clock.tickIntervals()).not.toThrow();
      expect(hub.subscriberCount()).toBe(0);
      expect(clock.intervalCount()).toBe(0);
    } finally {
      ReadableStreamDefaultController.prototype.enqueue = origEnqueue;
    }
  });

  test("the heartbeat callback emits event: ping", async () => {
    const clock = createFakeClock();
    const hub = createJobUpdates(clock);

    const reader = hub.streamAll().body!.getReader();
    expect(await readChunk(reader)).toBe(
      'event: connected\ndata: {"jobId":"*"}\n\n',
    );

    clock.tickIntervals();
    expect(await readChunk(reader)).toBe("event: ping\ndata: {}\n\n");

    await reader.cancel();
  });
});

describe("default JobUpdates instance", () => {
  test("a throwing subscriber is removed and does not block subsequent subscribers", () => {
    let throwCalls = 0;
    const received: Array<[string, string | undefined]> = [];
    const offThrow = JobUpdates.subscribeAll(() => {
      throwCalls++;
      throw new Error("boom");
    });
    const offOk = JobUpdates.subscribeAll((name, data) => {
      received.push([name, data]);
    });
    JobUpdates.publish("job-default-sync");
    expect(received).toEqual([["job-update", '{"jobId":"job-default-sync"}']]);
    expect(throwCalls).toBe(1);
    offThrow();
    offOk();
  });
});
