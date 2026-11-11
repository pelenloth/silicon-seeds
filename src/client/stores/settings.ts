import { createSignal } from "solid-js";
import { apiGet } from "../lib/api-client";
import {
  FALLBACK_DEFAULTS,
  toGenerationDefaults,
  type GenerationDefaults,
} from "../lib/defaults";

const [defaultsSignal, setDefaultsSignal] =
  createSignal<GenerationDefaults>(FALLBACK_DEFAULTS);

export const generationDefaults: () => GenerationDefaults = defaultsSignal;

let cachedPromise: Promise<GenerationDefaults> | null = null;
let generation = 0;
let hasLoadedOnce = false;

export function loadDefaults(): Promise<GenerationDefaults> {
  if (cachedPromise) return cachedPromise;
  const gen = ++generation;
  const p = apiGet<Record<string, string>>("/api/settings")
    .then((map) => {
      const defs = toGenerationDefaults(map);
      if (gen === generation) {
        hasLoadedOnce = true;
        setDefaultsSignal(defs);
      }
      return defs;
    })
    .catch(() => {
      if (cachedPromise === p) {
        cachedPromise = null;
      }
      if (!hasLoadedOnce) {
        const defs = { ...FALLBACK_DEFAULTS };
        if (gen === generation) {
          setDefaultsSignal(defs);
        }
        return defs;
      }
      return defaultsSignal();
    });
  cachedPromise = p;
  return p;
}

export function invalidateDefaults(): void {
  generation++;
  cachedPromise = null;
  void loadDefaults();
}
