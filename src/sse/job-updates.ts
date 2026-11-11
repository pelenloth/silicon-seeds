const encoder = new TextEncoder();

type Subscriber = (eventName: string, data?: string) => void;

export namespace JobUpdates {
  const subscribers = new Map<string, Set<Subscriber>>();
  const globalSubscribers = new Set<Subscriber>();
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const pendingJobs = new Set<string>();

  export function publish(jobId: string) {
    if (debounceTimers.has(jobId)) {
      pendingJobs.add(jobId);
      return;
    }
    pendingJobs.add(jobId);
    const timer = setTimeout(() => {
      debounceTimers.delete(jobId);
      if (!pendingJobs.has(jobId)) return;
      pendingJobs.delete(jobId);
      const payload = JSON.stringify({ jobId });
      const listeners = subscribers.get(jobId);
      if (listeners) {
        for (const send of listeners) {
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
      for (const send of globalSubscribers) {
        try {
          send("job-update", payload);
        } catch {
          globalSubscribers.delete(send);
        }
      }
    }, 300);
    debounceTimers.set(jobId, timer);
  }

  export function subscribeAll(send: Subscriber): () => void {
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

    const stream = new ReadableStream({
      start(controller) {
        let closed = false;

        const send = (eventName: string, data = "{}") => {
          if (closed) return;

          controller.enqueue(
            encoder.encode(`event: ${eventName}\ndata: ${data}\n\n`),
          );
        };

        const unregister = register(send);

        const keepAlive = setInterval(() => {
          if (closed) return;
          controller.enqueue(encoder.encode(`: keep-alive\n\n`));
        }, 15000);

        cleanup = () => {
          if (closed) return;
          closed = true;

          clearInterval(keepAlive);
          unregister();

          try {
            controller.close();
          } catch {
            // Ignore close errors from already-closed streams.
          }
        };

        send("connected", hello);
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

  export function stream(jobId: string): Response {
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

  export function streamAll(): Response {
    return createStream(
      (send) => subscribeAll(send),
      JSON.stringify({ jobId: "*" }),
    );
  }
}
