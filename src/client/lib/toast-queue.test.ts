import { describe, expect, test } from "bun:test";
import { MAX_TOASTS, pushToast, type ToastItem } from "./toast-queue";

const t = (id: number): ToastItem => ({
  id,
  tone: "info",
  message: `m${id}`,
  duration: 5000,
});

describe("pushToast", () => {
  test("appends and keeps at most MAX_TOASTS, dropping the oldest", () => {
    let list: ToastItem[] = [];
    for (let i = 1; i <= MAX_TOASTS + 2; i++) list = pushToast(list, t(i));
    expect(list.length).toBe(MAX_TOASTS);
    expect(list[0].id).toBe(3);
    expect(list.at(-1)?.id).toBe(MAX_TOASTS + 2);
  });
  test("does not mutate its input", () => {
    const a = [t(1)];
    const b = pushToast(a, t(2));
    expect(a.length).toBe(1);
    expect(b).not.toBe(a);
  });
});
