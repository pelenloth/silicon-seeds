function isInsideOpenDialog(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("dialog[open]") !== null;
}

export function onDismiss(
  root: () => HTMLElement | undefined,
  close: (byKeyboard?: boolean) => void,
): () => void {
  const onDocClick = (e: MouseEvent) => {
    if (isInsideOpenDialog(e.target)) return;
    const r = root();
    if (r && !r.contains(e.target as Node)) {
      close(false);
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    if (
      isInsideOpenDialog(e.target) ||
      document.querySelector("dialog[open]") !== null
    ) {
      return;
    }
    e.preventDefault();
    close(true);
  };
  document.addEventListener("mousedown", onDocClick);
  document.addEventListener("keydown", onKey);
  return () => {
    document.removeEventListener("mousedown", onDocClick);
    document.removeEventListener("keydown", onKey);
  };
}
