export function pushOverlay(stack: readonly number[], id: number): number[] {
  const rest = stack.filter((x) => x !== id);
  return [...rest, id];
}

export function removeOverlay(stack: readonly number[], id: number): number[] {
  return stack.filter((x) => x !== id);
}

export function topOverlay(stack: readonly number[]): number | null {
  return stack.length > 0 ? stack[stack.length - 1] : null;
}
