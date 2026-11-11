import { createSignal } from "solid-js";
import { pushOverlay, removeOverlay, topOverlay } from "../lib/overlay-stack";

const [stackSignal, setStackSignal] = createSignal<number[]>([]);

let nextOverlayId = 1;

export function registerOverlay(): number {
  const id = nextOverlayId++;
  setStackSignal((prev) => pushOverlay(prev, id));
  return id;
}

export function unregisterOverlay(id: number): void {
  setStackSignal((prev) => removeOverlay(prev, id));
}

export function topOverlayId(): number | null {
  return topOverlay(stackSignal());
}
