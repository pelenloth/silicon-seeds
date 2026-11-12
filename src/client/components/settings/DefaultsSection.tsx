import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { apiGet, apiSend } from "../../lib/api-client";
import {
  FALLBACK_DEFAULTS,
  IMAGE_MODELS,
  normalizeDefaults,
  RESOLUTIONS,
  toGenerationDefaults,
  VIDEO_MODELS,
  type DefaultsFieldErrors,
  type DefaultsFormEntries,
} from "../../lib/defaults";
import { invalidateDefaults } from "../../stores/settings";
import { toast } from "../../stores/toast";
import StylePresetSelect from "../StylePresetSelect";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";

const INITIAL_ENTRIES: DefaultsFormEntries = {
  default_style_preset: FALLBACK_DEFAULTS.style_preset,
  default_resolution: FALLBACK_DEFAULTS.resolution,
  default_image_model: FALLBACK_DEFAULTS.image_model,
  default_video_model: FALLBACK_DEFAULTS.video_model,
  default_fps: String(FALLBACK_DEFAULTS.fps),
  default_clip_duration: String(FALLBACK_DEFAULTS.clip_duration),
  default_transition_duration: String(FALLBACK_DEFAULTS.transition_duration),
};

const KEYS = Object.keys(INITIAL_ENTRIES) as (keyof DefaultsFormEntries)[];

const NUM_KEYS: (keyof DefaultsFormEntries)[] = [
  "default_fps",
  "default_clip_duration",
  "default_transition_duration",
];

function canonicalFormValue(
  key: keyof DefaultsFormEntries,
  val: string,
): string {
  if (
    key === "default_fps" ||
    key === "default_clip_duration" ||
    key === "default_transition_duration"
  ) {
    const trimmed = val.trim();
    if (/^-?\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      if (Number.isSafeInteger(n)) {
        return String(n);
      }
    }
  }
  return val;
}

function mapToEntries(
  map: Record<string, string> | null | undefined,
): DefaultsFormEntries {
  const defs = toGenerationDefaults(map);
  return {
    default_style_preset: defs.style_preset,
    default_resolution: defs.resolution,
    default_image_model: defs.image_model,
    default_video_model: defs.video_model,
    default_fps: String(defs.fps),
    default_clip_duration: String(defs.clip_duration),
    default_transition_duration: String(defs.transition_duration),
  };
}

// Module-level store so switching tabs within the same visit preserves unsaved edits
const [form, setForm] = createStore<DefaultsFormEntries>({
  ...INITIAL_ENTRIES,
});
const [snapshot, setSnapshot] = createStore<DefaultsFormEntries>({
  ...INITIAL_ENTRIES,
});
const [hasLoaded, setHasLoaded] = createSignal(false);

export function resetDefaultsDraftOnUnmount(): void {
  setHasLoaded(false);
  setForm({ ...INITIAL_ENTRIES });
  setSnapshot({ ...INITIAL_ENTRIES });
}

export default function DefaultsSection() {
  const [loading, setLoading] = createSignal(!hasLoaded());
  const [loadError, setLoadError] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [fieldErrors, setFieldErrors] = createSignal<DefaultsFieldErrors>({});
  let disposed = false;

  const isDirty = () =>
    hasLoaded() &&
    KEYS.some(
      (k) =>
        canonicalFormValue(k, form[k]) !== canonicalFormValue(k, snapshot[k]),
    );

  const fetchDefaults = async (force = false) => {
    if (!force && hasLoaded() && isDirty()) {
      setLoading(false);
      return;
    }
    if (!hasLoaded()) {
      setLoading(true);
    }
    setLoadError(null);
    try {
      const data = await apiGet<Record<string, string>>("/api/settings");
      if (disposed) return;
      const entries = mapToEntries(data);
      setSnapshot(entries);
      if (force || !hasLoaded() || !isDirty()) {
        setForm(entries);
        setFieldErrors({});
      }
      setHasLoaded(true);
    } catch (err) {
      if (disposed) return;
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Could not load defaults.";
      setLoadError(msg);
    } finally {
      if (!disposed) {
        setLoading(false);
      }
    }
  };

  onMount(() => {
    void fetchDefaults(false);
  });

  onCleanup(() => {
    disposed = true;
  });

  const clearFieldError = (key: keyof DefaultsFormEntries) => {
    if (fieldErrors()[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (saving() || !hasLoaded()) return;
    setFieldErrors({});

    const normalized = normalizeDefaults(form);
    if ("errors" in normalized) {
      setFieldErrors(normalized.errors);
      const firstKey = NUM_KEYS.find((k) => Boolean(normalized.errors[k]));
      if (firstKey) {
        queueMicrotask(() => {
          document.getElementById(firstKey)?.focus();
        });
      }
      return;
    }

    const payload = normalized.values;
    setForm(payload);

    setSaving(true);
    try {
      await apiSend("PUT", "/api/settings", payload);
      if (disposed) return;
      setSnapshot(payload);
      invalidateDefaults();
      toast.success("Defaults saved");
    } catch (err) {
      if (disposed) return;
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Failed to save defaults";
      toast.error(msg);
    } finally {
      if (!disposed) {
        setSaving(false);
      }
    }
  };

  return (
    <form
      class="panel flex flex-col gap-4 p-4"
      novalidate
      onSubmit={handleSubmit}
    >
      <div>
        <h2 class="text-base font-semibold">Generation defaults</h2>
        <p class="text-xs text-base-content/60">
          Used to prefill every create form.
        </p>
      </div>

      <Show when={loadError()}>
        {(msg) => (
          <div class="flex items-center justify-between gap-2 rounded-field border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
            <span>{msg()}</span>
            <button
              type="button"
              class="btn btn-ghost btn-xs"
              onClick={() => void fetchDefaults(true)}
            >
              Try again
            </button>
          </div>
        )}
      </Show>

      <Show when={loading() && !hasLoaded()}>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div class="skeleton h-14 w-full" />
          <div class="skeleton h-14 w-full" />
          <div class="skeleton h-14 w-full" />
        </div>
      </Show>

      <Show when={hasLoaded()}>
        <>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Default style preset" for="default_style_preset">
              <StylePresetSelect
                id="default_style_preset"
                name="default_style_preset"
                class="select select-sm w-full"
                value={form.default_style_preset}
                onChange={(v) => setForm("default_style_preset", v)}
              />
            </Field>

            <SelectField
              label="Default resolution"
              id="default_resolution"
              name="default_resolution"
              value={form.default_resolution}
              onChange={(v) => setForm("default_resolution", v)}
              options={RESOLUTIONS}
            />

            <SelectField
              label="Default image model"
              id="default_image_model"
              name="default_image_model"
              value={form.default_image_model}
              onChange={(v) => setForm("default_image_model", v)}
              options={IMAGE_MODELS}
            />

            <SelectField
              label="Default video model"
              id="default_video_model"
              name="default_video_model"
              value={form.default_video_model}
              onChange={(v) => setForm("default_video_model", v)}
              options={VIDEO_MODELS}
            />

            <Field
              label="Default FPS (1–24)"
              for="default_fps"
              error={fieldErrors().default_fps}
            >
              <input
                id="default_fps"
                name="default_fps"
                type="number"
                required
                min="1"
                max="24"
                step="1"
                aria-invalid={fieldErrors().default_fps ? "true" : undefined}
                aria-describedby={
                  fieldErrors().default_fps ? "default_fps-error" : undefined
                }
                class="input input-sm w-full"
                value={form.default_fps}
                onInput={(e) => {
                  setForm("default_fps", e.currentTarget.value);
                  clearFieldError("default_fps");
                }}
              />
            </Field>

            <Field
              label="Default clip duration (1–10s)"
              for="default_clip_duration"
              error={fieldErrors().default_clip_duration}
            >
              <input
                id="default_clip_duration"
                name="default_clip_duration"
                type="number"
                required
                min="1"
                max="10"
                step="1"
                aria-invalid={
                  fieldErrors().default_clip_duration ? "true" : undefined
                }
                aria-describedby={
                  fieldErrors().default_clip_duration
                    ? "default_clip_duration-error"
                    : undefined
                }
                class="input input-sm w-full"
                value={form.default_clip_duration}
                onInput={(e) => {
                  setForm("default_clip_duration", e.currentTarget.value);
                  clearFieldError("default_clip_duration");
                }}
              />
            </Field>

            <Field
              label="Default transition duration (1–10s)"
              for="default_transition_duration"
              error={fieldErrors().default_transition_duration}
            >
              <input
                id="default_transition_duration"
                name="default_transition_duration"
                type="number"
                required
                min="1"
                max="10"
                step="1"
                aria-invalid={
                  fieldErrors().default_transition_duration ? "true" : undefined
                }
                aria-describedby={
                  fieldErrors().default_transition_duration
                    ? "default_transition_duration-error"
                    : undefined
                }
                class="input input-sm w-full"
                value={form.default_transition_duration}
                onInput={(e) => {
                  setForm("default_transition_duration", e.currentTarget.value);
                  clearFieldError("default_transition_duration");
                }}
              />
            </Field>
          </div>

          <div class="flex items-center justify-end gap-3 pt-1">
            <Show when={isDirty()}>
              <span class="text-xs text-warning">Unsaved changes</span>
            </Show>
            <button
              type="submit"
              class="btn btn-primary btn-sm"
              disabled={saving()}
            >
              <Show when={saving()}>
                <span class="loading loading-spinner loading-xs" />
              </Show>
              Save Defaults
            </button>
          </div>
        </>
      </Show>
    </form>
  );
}
