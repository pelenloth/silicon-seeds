import { createSignal } from "solid-js";

function readCollapsed(): boolean {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem("sidebar") === "collapsed";
    }
  } catch {}
  return false;
}

const [sidebarCollapsedSignal, setSidebarCollapsedSignal] =
  createSignal<boolean>(readCollapsed());
export const sidebarCollapsed: () => boolean = sidebarCollapsedSignal;

export function toggleSidebar(): void {
  const next = !sidebarCollapsedSignal();
  setSidebarCollapsedSignal(next);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("sidebar", next ? "collapsed" : "expanded");
    }
  } catch {}
}

const [mobileNavOpenSignal, setMobileNavOpenSignal] =
  createSignal<boolean>(false);
export const mobileNavOpen: () => boolean = mobileNavOpenSignal;

export function setMobileNavOpen(open: boolean): void {
  setMobileNavOpenSignal(open);
}

const [paletteOpenSignal, setPaletteOpenSignal] = createSignal<boolean>(false);
export const paletteOpen: () => boolean = paletteOpenSignal;

export function setPaletteOpen(open: boolean): void {
  setPaletteOpenSignal(open);
}

const [nowTickSignal, setNowTickSignal] = createSignal<number>(Date.now());
export const nowTick: () => number = nowTickSignal;

if (typeof setInterval === "function") {
  const timer = setInterval(() => {
    setNowTickSignal(Date.now());
  }, 30_000);
  if (typeof timer === "object" && timer !== null && "unref" in timer) {
    (timer as { unref?: () => void }).unref?.();
  }
}
