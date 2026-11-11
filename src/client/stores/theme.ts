import { createSignal } from "solid-js";
import {
  normalizeThemePref,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ThemeId,
  type ThemePref,
} from "../lib/themes";

function readStorage(): string | null {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(THEME_STORAGE_KEY);
    }
  } catch {}
  return null;
}

function readPrefersDark(): boolean {
  try {
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function"
    ) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
  } catch {}
  return false;
}

function applyDomTheme(theme: ThemeId): void {
  try {
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.setAttribute("data-theme", theme);
    }
  } catch {}
}

const [themePref, setThemePrefSignal] = createSignal<ThemePref>(
  normalizeThemePref(readStorage()),
);
export const [prefersDark, setPrefersDark] =
  createSignal<boolean>(readPrefersDark());
export const activeTheme: () => ThemeId = () =>
  resolveTheme(themePref(), prefersDark());

export { themePref };

export function setThemePref(pref: ThemePref): void {
  setThemePrefSignal(pref);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(THEME_STORAGE_KEY, pref);
    }
  } catch {}
  applyDomTheme(activeTheme());
}

let initialized = false;

export function initTheme(): void {
  if (initialized) return;
  initialized = true;
  setThemePrefSignal(normalizeThemePref(readStorage()));
  setPrefersDark(readPrefersDark());
  applyDomTheme(activeTheme());

  try {
    if (typeof window !== "undefined") {
      if (typeof window.matchMedia === "function") {
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        mq.addEventListener?.("change", (e) => {
          setPrefersDark(e.matches);
          applyDomTheme(activeTheme());
        });
      }
      window.addEventListener("storage", (e: StorageEvent) => {
        if (e.key === THEME_STORAGE_KEY) {
          setThemePrefSignal(normalizeThemePref(e.newValue));
          applyDomTheme(activeTheme());
        }
      });
    }
  } catch {}
}
