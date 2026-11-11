import { describe, expect, test } from "bun:test";
import { JobUpdates } from "./job-updates";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("JobUpdates global fan-out", () => {
  test("subscribeAll receives one debounced update per job and can unsubscribe", async () => {
    const seen: string[] = [];
    const off = JobUpdates.subscribeAll((name, data) =>
      seen.push(`${name}:${data}`),
    );
    JobUpdates.publish("job-a");
    JobUpdates.publish("job-a");
    JobUpdates.publish("job-b");
    await wait(450);
    expect(seen.filter((s) => s.includes("job-a")).length).toBe(1);
    expect(seen.filter((s) => s.includes("job-b")).length).toBe(1);
    expect(seen[0]).toBe('job-update:{"jobId":"job-a"}');
    off();
    JobUpdates.publish("job-c");
    await wait(450);
    expect(seen.some((s) => s.includes("job-c"))).toBe(false);
  });
  test("streamAll answers with an event stream", () => {
    const res = JobUpdates.streamAll();
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    void res.body?.cancel();
  });
  test("a throwing subscriber is removed and does not block subsequent subscribers", async () => {
    let throwCalls = 0;
    const received: Array<[string, string | undefined]> = [];
    const offThrow = JobUpdates.subscribeAll(() => {
      throwCalls++;
      throw new Error("boom");
    });
    const offOk = JobUpdates.subscribeAll((name, data) => {
      received.push([name, data]);
    });
    JobUpdates.publish("job-x");
    await wait(450);
    expect(received).toEqual([["job-update", '{"jobId":"job-x"}']]);
    expect(throwCalls).toBe(1);
    JobUpdates.publish("job-x");
    await wait(450);
    expect(throwCalls).toBe(1);
    expect(received.length).toBe(2);
    offThrow();
    offOk();
  });
});
