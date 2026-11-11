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

export function loadDefaults(): Promise<GenerationDefaults> {
  if (cachedPromise) return cachedPromise;
  cachedPromise = apiGet<Record<string, string>>("/api/settings")
    .then((map) => {
      const defs = toGenerationDefaults(map);
      setDefaultsSignal(defs);
      return defs;
    })
    .catch(() => {
      const defs = { ...FALLBACK_DEFAULTS };
      setDefaultsSignal(defs);
      return defs;
    });
  return cachedPromise;
}

export function invalidateDefaults(): void {
  cachedPromise = null;
  void loadDefaults();
}
