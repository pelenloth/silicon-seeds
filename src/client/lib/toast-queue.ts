export type ToastTone = "success" | "error" | "info" | "warning";
export type ToastAction = {
  label: string;
  href?: string;
  onClick?: () => void;
};
export type ToastItem = {
  id: number;
  tone: ToastTone;
  message: string;
  action?: ToastAction;
  duration: number;
  createdAt?: number;
};
export const MAX_TOASTS = 4;

export function pushToast(
  list: readonly ToastItem[],
  item: ToastItem,
  max: number = MAX_TOASTS,
): ToastItem[] {
  const next = [...list, item];
  if (next.length > max) {
    return next.slice(next.length - max);
  }
  return next;
}
