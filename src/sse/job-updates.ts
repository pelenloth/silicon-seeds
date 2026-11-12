const encoder = new TextEncoder();

export type Subscriber = (eventName: string, data?: string) => void;

export type JobUpdatesClock = {
  now?: () => number;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
};

const WINDOW_MS = 300;
const STALE_WINDOW_MS = 1000;
const HEARTBEAT_MS = 15_000;

export function createJobUpdates(clock: JobUpdatesClock = {}) {
  const nowFn = clock.now ?? (() => Date.now());
  const setTimeoutFn = clock.setTimeout ?? setTimeout;
  const clearTimeoutFn = clock.clearTimeout ?? clearTimeout;
  const setIntervalFn = clock.setInterval ?? setInterval;
  const clearIntervalFn = clock.clearInterval ?? clearInterval;

  const subscribers = new Map<string, Set<Subscriber>>();
  const globalSubscribers = new Set<Subscriber>();
  const debounceWindows = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; openedAt: number }
  >();
  const pendingJobs = new Set<string>();

  function emitJobUpdate(jobId: string): void {
    const payload = JSON.stringify({ jobId });
    const listeners = subscribers.get(jobId);
    if (listeners) {
      for (const send of [...listeners]) {
        try {
          send("job-update", payload);
        } catch {
          listeners.delete(send);
        }
      }
      if (listeners.size === 0) {
        subscribers.delete(jobId);
      }
    }
    for (const send of [...globalSubscribers]) {
      try {
        send("job-update", payload);
      } catch {
        globalSubscribers.delete(send);
      }
    }
  }

  function openWindow(jobId: string, now: number): void {
    const timer = setTimeoutFn(() => {
      debounceWindows.delete(jobId);
      if (!pendingJobs.has(jobId)) return;
      pendingJobs.delete(jobId);
      emitJobUpdate(jobId);
    }, WINDOW_MS);
    debounceWindows.set(jobId, { timer, openedAt: now });
  }

  function publish(jobId: string): void {
    const now = nowFn();
    const existing = debounceWindows.get(jobId);
    if (existing) {
      if (now - existing.openedAt < STALE_WINDOW_MS) {
        pendingJobs.add(jobId);
        return;
      }
      clearTimeoutFn(existing.timer);
      debounceWindows.delete(jobId);
      pendingJobs.delete(jobId);
    }
    emitJobUpdate(jobId);
    openWindow(jobId, now);
  }

  function subscribeAll(send: Subscriber): () => void {
    globalSubscribers.add(send);
    return () => {
      globalSubscribers.delete(send);
    };
  }

  function createStream(
    register: (send: Subscriber) => () => void,
    hello: string,
  ): Response {
    let cleanup: (() => void) | undefined;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let keepAlive: ReturnType<typeof setInterval> | undefined;

        const enqueueEvent = (eventName: string, data = "{}") => {
          if (closed) return;
          try {
            controller.enqueue(
              encoder.encode(`event: ${eventName}\ndata: ${data}\n\n`),
            );
          } catch {
            cleanup?.();
          }
        };

        const unregister = register(enqueueEvent);

        cleanup = () => {
          if (closed) return;
          closed = true;
          if (keepAlive !== undefined) {
            clearIntervalFn(keepAlive);
            keepAlive = undefined;
          }
          unregister();
          try {
            controller.close();
          } catch {
            // Ignore close errors from already-closed streams.
          }
        };

        keepAlive = setIntervalFn(() => {
          enqueueEvent("ping", "{}");
        }, HEARTBEAT_MS);

        enqueueEvent("connected", hello);
      },
      cancel() {
        cleanup?.();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  function stream(jobId: string): Response {
    return createStream((send) => {
      const listeners = subscribers.get(jobId) ?? new Set<Subscriber>();
      listeners.add(send);
      subscribers.set(jobId, listeners);
      return () => {
        listeners.delete(send);
        if (listeners.size === 0) {
          subscribers.delete(jobId);
        }
      };
    }, JSON.stringify({ jobId }));
  }

  function streamAll(): Response {
    return createStream(
      (send) => subscribeAll(send),
      JSON.stringify({ jobId: "*" }),
    );
  }

  function subscriberCount(): number {
    let count = globalSubscribers.size;
    for (const set of subscribers.values()) {
      count += set.size;
    }
    return count;
  }

  return {
    publish,
    subscribeAll,
    stream,
    streamAll,
    subscriberCount,
  };
}

const defaultHub = createJobUpdates();

export namespace JobUpdates {
  export function publish(jobId: string): void {
    defaultHub.publish(jobId);
  }

  export function subscribeAll(send: Subscriber): () => void {
    return defaultHub.subscribeAll(send);
  }

  export function stream(jobId: string): Response {
    return defaultHub.stream(jobId);
  }

  export function streamAll(): Response {
    return defaultHub.streamAll();
  }

  export function subscriberCount(): number {
    return defaultHub.subscriberCount();
  }
}
