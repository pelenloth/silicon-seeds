import { createSignal } from "solid-js";

export type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
};

const [pendingConfirmSignal, setPendingConfirmSignal] =
  createSignal<ConfirmOptions | null>(null);
export const pendingConfirm: () => ConfirmOptions | null = pendingConfirmSignal;

let currentResolver: ((ok: boolean) => void) | null = null;

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  if (currentResolver) {
    const prev = currentResolver;
    currentResolver = null;
    prev(false);
  }
  setPendingConfirmSignal(opts);
  return new Promise<boolean>((resolve) => {
    currentResolver = resolve;
  });
}

export function resolveConfirm(ok: boolean): void {
  const resolver = currentResolver;
  currentResolver = null;
  setPendingConfirmSignal(null);
  if (resolver) {
    resolver(ok);
  }
}
