import { createSignal } from "solid-js";
import {
  MAX_TOASTS,
  pushToast,
  type ToastAction,
  type ToastItem,
  type ToastTone,
} from "../lib/toast-queue";

export {
  MAX_TOASTS,
  pushToast,
  type ToastAction,
  type ToastItem,
  type ToastTone,
};

const [toastsSignal, setToastsSignal] = createSignal<ToastItem[]>([]);
export const toasts: () => ToastItem[] = toastsSignal;

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export function dismissToast(id: number): void {
  const timer = timers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(id);
  }
  setToastsSignal((prev) => prev.filter((t) => t.id !== id));
}

type ToastOpts = { action?: ToastAction; duration?: number };

function addToast(
  tone: ToastTone,
  message: string,
  defaultDuration: number,
  opts?: ToastOpts,
): number {
  const id = nextId++;
  const duration = opts?.duration ?? defaultDuration;
  const item: ToastItem = {
    id,
    tone,
    message,
    ...(opts?.action ? { action: opts.action } : {}),
    duration,
  };
  setToastsSignal((prev) => {
    const next = pushToast(prev, item);
    const nextIds = new Set(next.map((t) => t.id));
    for (const old of prev) {
      if (!nextIds.has(old.id)) {
        const timer = timers.get(old.id);
        if (timer !== undefined) {
          clearTimeout(timer);
          timers.delete(old.id);
        }
      }
    }
    return next;
  });
  if (duration > 0) {
    const timer = setTimeout(() => {
      timers.delete(id);
      setToastsSignal((prev) => prev.filter((t) => t.id !== id));
    }, duration);
    timers.set(id, timer);
  }
  return id;
}

export const toast = {
  success(message: string, opts?: ToastOpts): number {
    return addToast("success", message, 5000, opts);
  },
  error(message: string, opts?: ToastOpts): number {
    return addToast("error", message, 8000, opts);
  },
  info(message: string, opts?: ToastOpts): number {
    return addToast("info", message, 5000, opts);
  },
  warning(message: string, opts?: ToastOpts): number {
    return addToast("warning", message, 6000, opts);
  },
};
