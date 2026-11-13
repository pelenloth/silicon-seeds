export async function planWithTimeout<T>(
  run: (signal: AbortSignal) => Promise<T | null>,
  opts: { timeoutMs: number; signal?: AbortSignal; onTimeout?: () => void },
): Promise<T | null> {
  if (opts.signal?.aborted) {
    return null;
  }

  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const abortPromise = new Promise<null>((resolve) => {
    ctrl.signal.addEventListener("abort", () => resolve(null), { once: true });
  });

  const onCallerAbort = () => {
    ctrl.abort();
  };

  if (opts.signal) {
    opts.signal.addEventListener("abort", onCallerAbort, { once: true });
  }

  const timeoutPromise = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      ctrl.abort();
      opts.onTimeout?.();
      resolve(null);
    }, opts.timeoutMs);
  });

  try {
    const runPromise = Promise.resolve()
      .then(() => run(ctrl.signal))
      .catch((err) => {
        if (ctrl.signal.aborted) {
          return null;
        }
        throw err;
      });

    return await Promise.race([runPromise, timeoutPromise, abortPromise]);
  } finally {
    if (timer !== null) clearTimeout(timer);
    if (opts.signal) {
      opts.signal.removeEventListener("abort", onCallerAbort);
    }
  }
}
