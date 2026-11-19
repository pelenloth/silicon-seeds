import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import {
  AUDIO_MODELS,
  SOUND_PRESET_CATEGORIES,
  type AudioModelId,
  type SoundPresetCategory,
} from "../../../shared/audio-models";
import { apiGet, apiSend } from "../../lib/api-client";
import {
  AUDIO_MODEL_OPTIONS,
  buildSoundPresetPayload,
  type SoundPresetFieldErrors,
  type SoundPresetFormInput,
} from "../../lib/defaults";
import { confirmDialog } from "../../stores/confirm";
import { toast } from "../../stores/toast";
import { Icons } from "../Icons";
import { EmptyState } from "../ui/EmptyState";
import { Field } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { SelectField } from "../ui/SelectField";

export type SoundPresetRow = {
  id: string;
  name: string;
  description: string | null;
  audio_model: AudioModelId;
  category: SoundPresetCategory;
  instrumental_prompt: string;
  lyric_prompt: string | null;
  settings?: Record<string, unknown>;
  duration?: number;
  builtin: boolean;
};

const EMPTY_SOUND_FORM: SoundPresetFormInput = {
  name: "",
  description: "",
  audio_model: "ace-step-1.5",
  category: "Song",
  instrumental_prompt: "",
  lyric_prompt: "",
  duration: "60",
};

const SOUND_FIELD_ORDER: (keyof SoundPresetFormInput)[] = [
  "name",
  "description",
  "audio_model",
  "category",
  "duration",
  "instrumental_prompt",
  "lyric_prompt",
];

const SOUND_FIELD_IDS: Record<keyof SoundPresetFormInput, string> = {
  name: "sound-preset-name",
  description: "sound-preset-description",
  audio_model: "sound-preset-audio-model",
  category: "sound-preset-category",
  duration: "sound-preset-duration",
  instrumental_prompt: "sound-preset-instrumental-prompt",
  lyric_prompt: "sound-preset-lyric-prompt",
};

const CATEGORY_OPTIONS = SOUND_PRESET_CATEGORIES.map((c) => ({
  value: c,
  label: c,
}));

const FILTER_OPTIONS: readonly { value: "all" | AudioModelId; label: string }[] = [
  { value: "all", label: "All" },
  ...AUDIO_MODEL_OPTIONS,
];

function rowDuration(p: SoundPresetRow): number {
  const fromSettings = p.settings?.duration;
  if (typeof fromSettings === "number" && Number.isFinite(fromSettings)) {
    return fromSettings;
  }
  if (typeof p.duration === "number" && Number.isFinite(p.duration)) {
    return p.duration;
  }
  return AUDIO_MODELS[p.audio_model]?.defaultDuration ?? 60;
}

export default function SoundPresetsPanel() {
  const [presets, setPresets] = createStore<SoundPresetRow[]>([]);
  const [modelFilter, setModelFilter] = createSignal<"all" | AudioModelId>("all");
  const [loading, setLoading] = createSignal(true);
  const [loadError, setLoadError] = createSignal<string | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [baseSettings, setBaseSettings] = createSignal<Record<string, unknown>>({});
  const [form, setForm] = createStore<SoundPresetFormInput>({
    ...EMPTY_SOUND_FORM,
  });
  const [fieldErrors, setFieldErrors] = createSignal<SoundPresetFieldErrors>({});
  const [modalError, setModalError] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [deletingIds, setDeletingIds] = createSignal<Record<string, boolean>>({});
  let disposed = false;

  const filteredPresets = createMemo(() => {
    const f = modelFilter();
    if (f === "all") return presets;
    return presets.filter((p) => p.audio_model === f);
  });

  const activeSpec = createMemo(
    () => AUDIO_MODELS[form.audio_model] ?? AUDIO_MODELS["ace-step-1.5"],
  );

  const applyPresets = (next: SoundPresetRow[]) => {
    setPresets(reconcile(next, { key: "id", merge: true }));
  };

  const fetchPresets = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiGet<{ presets?: SoundPresetRow[] }>(
        "/api/sound-presets",
      );
      if (disposed) return;
      const list = Array.isArray(data?.presets) ? data.presets : [];
      applyPresets(list);
    } catch (err) {
      if (disposed) return;
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Could not load sound presets.";
      setLoadError(msg);
    } finally {
      if (!disposed) {
        setLoading(false);
      }
    }
  };

  onMount(() => {
    void fetchPresets();
  });

  onCleanup(() => {
    disposed = true;
  });

  const openNewModal = () => {
    setEditingId(null);
    setBaseSettings({});
    setForm({ ...EMPTY_SOUND_FORM });
    setFieldErrors({});
    setModalError(null);
    setModalOpen(true);
  };

  const openDuplicateModal = (p: SoundPresetRow) => {
    setEditingId(null);
    setBaseSettings(p.settings ? { ...p.settings } : {});
    setForm({
      name: `${p.name} (Copy)`,
      description: p.description ?? "",
      audio_model: p.audio_model,
      category: p.category,
      instrumental_prompt: p.instrumental_prompt ?? "",
      lyric_prompt: p.lyric_prompt ?? "",
      duration: String(rowDuration(p)),
    });
    setFieldErrors({});
    setModalError(null);
    setModalOpen(true);
  };

  const openEditModal = (p: SoundPresetRow) => {
    setEditingId(p.id);
    setBaseSettings(p.settings ? { ...p.settings } : {});
    setForm({
      name: p.name,
      description: p.description ?? "",
      audio_model: p.audio_model,
      category: p.category,
      instrumental_prompt: p.instrumental_prompt ?? "",
      lyric_prompt: p.lyric_prompt ?? "",
      duration: String(rowDuration(p)),
    });
    setFieldErrors({});
    setModalError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving()) return;
    setModalOpen(false);
  };

  const clearFieldError = (key: keyof SoundPresetFormInput) => {
    if (fieldErrors()[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleSave = async () => {
    if (saving()) return;
    setFieldErrors({});
    setModalError(null);

    const id = editingId();
    const res = buildSoundPresetPayload(form, baseSettings());
    if ("errors" in res) {
      setFieldErrors(res.errors);
      const firstKey = SOUND_FIELD_ORDER.find((k) => Boolean(res.errors[k]));
      if (firstKey) {
        queueMicrotask(() => {
          document.getElementById(SOUND_FIELD_IDS[firstKey])?.focus();
        });
      }
      return;
    }

    const { payload } = res;
    setSaving(true);
    try {
      if (id) {
        await apiSend(
          "PUT",
          `/api/sound-presets/${encodeURIComponent(id)}`,
          payload,
        );
        if (disposed) return;
        await fetchPresets();
        if (disposed) return;
        setModalOpen(false);
        toast.success(`Sound preset "${payload.name}" saved`);
      } else {
        await apiSend("POST", "/api/sound-presets", payload);
        if (disposed) return;
        await fetchPresets();
        if (disposed) return;
        setModalOpen(false);
        toast.success(`Sound preset "${payload.name}" created`);
      }
    } catch (err) {
      if (disposed) return;
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Failed to save sound preset";
      setModalError(msg);
    } finally {
      if (!disposed) {
        setSaving(false);
      }
    }
  };

  const handleDelete = async (p: SoundPresetRow) => {
    const id = p.id;
    if (deletingIds()[id]) return;
    const ok = await confirmDialog({
      title: "Delete this sound preset?",
      body: p.name,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok || disposed) return;

    setDeletingIds((prev) => ({ ...prev, [id]: true }));
    try {
      await apiSend("DELETE", `/api/sound-presets/${encodeURIComponent(id)}`);
      if (disposed) return;
      await fetchPresets();
      if (disposed) return;
      toast.success("Sound preset deleted");
    } catch (err) {
      if (disposed) return;
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Failed to delete sound preset";
      toast.error(msg);
    } finally {
      if (!disposed) {
        setDeletingIds((prev) => {
          const copy = { ...prev };
          delete copy[id];
          return copy;
        });
      }
    }
  };

  return (
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <h2 class="text-base font-semibold">Sound & genre presets</h2>
          <span class="badge badge-soft badge-sm tabular-nums">
            {filteredPresets().length}
          </span>
        </div>
        <button
          type="button"
          class="btn btn-primary btn-sm shrink-0"
          onClick={openNewModal}
        >
          <Icons.Plus class="size-4" />
          New sound preset
        </button>
      </div>

      <div class="flex flex-wrap gap-1.5" role="group" aria-label="Filter by audio model">
        <For each={FILTER_OPTIONS}>
          {(opt) => (
            <button
              type="button"
              class={`btn btn-xs ${
                modelFilter() === opt.value ? "btn-primary" : "btn-ghost"
              }`}
              onClick={() => setModelFilter(opt.value)}
            >
              {opt.label}
            </button>
          )}
        </For>
      </div>

      <Show when={loadError()}>
        {(msg) => (
          <div class="flex items-center justify-between gap-2 rounded-field border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
            <span>{msg()}</span>
            <button
              type="button"
              class="btn btn-ghost btn-xs"
              onClick={() => void fetchPresets()}
            >
              Try again
            </button>
          </div>
        )}
      </Show>

      <Show when={loading() && presets.length === 0}>
        <div class="flex flex-col gap-2">
          <div class="skeleton h-16 w-full" />
          <div class="skeleton h-16 w-full" />
        </div>
      </Show>

      <Show when={!loading() && !loadError() && filteredPresets().length === 0}>
        <EmptyState
          title="No sound presets"
          description="Create or duplicate a preset to reuse model-specific music and sound templates."
        />
      </Show>

      <Show when={filteredPresets().length > 0}>
        <ul class="flex flex-col gap-2">
          <For each={filteredPresets()}>
            {(p) => (
              <li class="min-w-0 rounded-field border border-base-300 p-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-mono text-sm font-medium">{p.name}</p>
                    <Show when={p.description}>
                      <p class="truncate text-xs text-base-content/60">
                        {p.description}
                      </p>
                    </Show>
                  </div>
                  <div class="flex shrink-0 gap-1">
                    <Show
                      when={!p.builtin}
                      fallback={
                        <button
                          type="button"
                          class="btn btn-ghost btn-xs"
                          onClick={() => openDuplicateModal(p)}
                        >
                          Duplicate
                        </button>
                      }
                    >
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs"
                        onClick={() => openEditModal(p)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs text-error"
                        disabled={!!deletingIds()[p.id]}
                        onClick={() => void handleDelete(p)}
                      >
                        Delete
                      </button>
                    </Show>
                  </div>
                </div>
                <div class="mt-2 flex min-w-0 flex-wrap gap-1 text-xs">
                  <span class="badge badge-soft badge-sm max-w-full truncate">
                    {AUDIO_MODELS[p.audio_model]?.label ?? p.audio_model}
                  </span>
                  <span class="badge badge-outline badge-sm max-w-full truncate">
                    {p.category}
                  </span>
                  <span class="badge badge-ghost badge-sm tabular-nums">
                    {rowDuration(p)}s
                  </span>
                  <span class="badge badge-ghost badge-sm">
                    {p.builtin ? "Built-in" : "Custom"}
                  </span>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <Modal
        open={modalOpen()}
        onClose={closeModal}
        dismissible={!saving()}
        title={editingId() ? "Edit sound preset" : "New sound preset"}
        size="lg"
        actions={
          <>
            <button
              type="button"
              class="btn btn-sm btn-ghost"
              disabled={saving()}
              onClick={closeModal}
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn btn-sm btn-primary"
              disabled={saving()}
              onClick={() => void handleSave()}
            >
              <Show when={saving()}>
                <span class="loading loading-spinner loading-xs" />
              </Show>
              Save
            </button>
          </>
        }
      >
        <form
          class="flex flex-col gap-3"
          novalidate
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <Show when={modalError()}>
            {(err) => (
              <p
                role="alert"
                class="rounded-field border border-error/30 bg-error/10 px-3 py-2 text-xs text-error"
              >
                {err()}
              </p>
            )}
          </Show>

          <div class="grid gap-3 sm:grid-cols-2">
            <Field
              label="Name"
              for="sound-preset-name"
              error={fieldErrors().name}
            >
              <input
                id="sound-preset-name"
                name="name"
                type="text"
                required
                maxLength={80}
                placeholder="e.g. Dream Pop Hook"
                aria-invalid={fieldErrors().name ? "true" : undefined}
                aria-describedby={
                  fieldErrors().name ? "sound-preset-name-error" : undefined
                }
                class="input input-sm w-full font-mono"
                value={form.name}
                onInput={(e) => {
                  setForm("name", e.currentTarget.value);
                  clearFieldError("name");
                }}
              />
            </Field>

            <Field
              label="Description"
              for="sound-preset-description"
              error={fieldErrors().description}
            >
              <input
                id="sound-preset-description"
                name="description"
                type="text"
                maxLength={500}
                placeholder="Short description"
                aria-invalid={fieldErrors().description ? "true" : undefined}
                aria-describedby={
                  fieldErrors().description
                    ? "sound-preset-description-error"
                    : undefined
                }
                class="input input-sm w-full"
                value={form.description}
                onInput={(e) => {
                  setForm("description", e.currentTarget.value);
                  clearFieldError("description");
                }}
              />
            </Field>

            <SelectField
              label="Audio model"
              id="sound-preset-audio-model"
              name="audio_model"
              value={form.audio_model}
              onChange={(v) => {
                const nextModel = v as AudioModelId;
                setForm("audio_model", nextModel);
                clearFieldError("audio_model");
              }}
              options={AUDIO_MODEL_OPTIONS}
            />

            <SelectField
              label="Category"
              id="sound-preset-category"
              name="category"
              value={form.category}
              onChange={(v) => {
                setForm("category", v as SoundPresetCategory);
                clearFieldError("category");
              }}
              options={CATEGORY_OPTIONS}
            />

            <Field
              label={`Duration (${activeSpec().minDuration}–${activeSpec().maxDuration}s)`}
              for="sound-preset-duration"
              error={fieldErrors().duration}
            >
              <input
                id="sound-preset-duration"
                name="duration"
                type="number"
                min={activeSpec().minDuration}
                max={activeSpec().maxDuration}
                step="1"
                aria-invalid={fieldErrors().duration ? "true" : undefined}
                aria-describedby={
                  fieldErrors().duration
                    ? "sound-preset-duration-error"
                    : undefined
                }
                class="input input-sm w-full"
                value={form.duration}
                onInput={(e) => {
                  setForm("duration", e.currentTarget.value);
                  clearFieldError("duration");
                }}
              />
            </Field>
          </div>

          <Field
            label={activeSpec().promptLabel}
            for="sound-preset-instrumental-prompt"
            error={fieldErrors().instrumental_prompt}
          >
            <textarea
              id="sound-preset-instrumental-prompt"
              name="instrumental_prompt"
              rows={3}
              required
              placeholder={activeSpec().promptPlaceholder}
              aria-invalid={
                fieldErrors().instrumental_prompt ? "true" : undefined
              }
              aria-describedby={
                fieldErrors().instrumental_prompt
                  ? "sound-preset-instrumental-prompt-error"
                  : undefined
              }
              class="textarea textarea-sm w-full"
              value={form.instrumental_prompt}
              onInput={(e) => {
                setForm("instrumental_prompt", e.currentTarget.value);
                clearFieldError("instrumental_prompt");
              }}
            />
          </Field>

          <Show when={activeSpec().supportsLyrics}>
            <Field
              label="Lyrics / structure"
              for="sound-preset-lyric-prompt"
              error={fieldErrors().lyric_prompt}
            >
              <textarea
                id="sound-preset-lyric-prompt"
                name="lyric_prompt"
                rows={3}
                placeholder={activeSpec().lyricsPlaceholder}
                aria-invalid={fieldErrors().lyric_prompt ? "true" : undefined}
                aria-describedby={
                  fieldErrors().lyric_prompt
                    ? "sound-preset-lyric-prompt-error"
                    : undefined
                }
                class="textarea textarea-sm w-full"
                value={form.lyric_prompt}
                onInput={(e) => {
                  setForm("lyric_prompt", e.currentTarget.value);
                  clearFieldError("lyric_prompt");
                }}
              />
            </Field>
          </Show>
        </form>
      </Modal>
    </div>
  );
}
