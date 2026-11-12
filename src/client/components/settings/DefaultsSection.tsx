import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { apiGet, apiSend } from "../../lib/api-client";
import {
  FALLBACK_DEFAULTS,
  IMAGE_MODELS,
  RESOLUTIONS,
  toGenerationDefaults,
  VIDEO_MODELS,
} from "../../lib/defaults";
import { invalidateDefaults } from "../../stores/settings";
import { toast } from "../../stores/toast";
import StylePresetSelect from "../StylePresetSelect";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";

type DefaultsFormEntries = {
  default_style_preset: string;
  default_resolution: string;
  default_image_model: string;
  default_video_model: string;
  default_fps: string;
  default_clip_duration: string;
  default_transition_duration: string;
};

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
  let disposed = false;

  const isDirty = () => KEYS.some((k) => form[k] !== snapshot[k]);

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

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (saving()) return;
    setSaving(true);
    const payload: DefaultsFormEntries = {
      default_style_preset: form.default_style_preset,
      default_resolution: form.default_resolution,
      default_image_model: form.default_image_model,
      default_video_model: form.default_video_model,
      default_fps: form.default_fps,
      default_clip_duration: form.default_clip_duration,
      default_transition_duration: form.default_transition_duration,
    };
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
    <form class="panel flex flex-col gap-4 p-4" onSubmit={handleSubmit}>
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

        <Field label="Default FPS (1–24)" for="default_fps">
          <input
            id="default_fps"
            name="default_fps"
            type="number"
            min="1"
            max="24"
            class="input input-sm w-full"
            value={form.default_fps}
            onInput={(e) => setForm("default_fps", e.currentTarget.value)}
          />
        </Field>

        <Field
          label="Default clip duration (1–10s)"
          for="default_clip_duration"
        >
          <input
            id="default_clip_duration"
            name="default_clip_duration"
            type="number"
            min="1"
            max="10"
            class="input input-sm w-full"
            value={form.default_clip_duration}
            onInput={(e) =>
              setForm("default_clip_duration", e.currentTarget.value)
            }
          />
        </Field>

        <Field
          label="Default transition duration (1–10s)"
          for="default_transition_duration"
        >
          <input
            id="default_transition_duration"
            name="default_transition_duration"
            type="number"
            min="1"
            max="10"
            class="input input-sm w-full"
            value={form.default_transition_duration}
            onInput={(e) =>
              setForm("default_transition_duration", e.currentTarget.value)
            }
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
    </form>
  );
}
