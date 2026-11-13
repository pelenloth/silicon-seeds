import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { apiGet, apiSend } from "../../lib/api-client";
import {
  buildPresetPayload,
  type PresetFieldErrors,
  type PresetFormInput,
} from "../../lib/defaults";
import { confirmDialog } from "../../stores/confirm";
import { toast } from "../../stores/toast";
import { Icons } from "../Icons";
import { EmptyState } from "../ui/EmptyState";
import { Field } from "../ui/Field";
import { Modal } from "../ui/Modal";

export type StylePresetRow = {
  id: string;
  name: string;
  description: string | null;
  primary_style: string;
  secondary_trigger: string | null;
  styles: string[];
  texture: string | null;
};

const EMPTY_FORM: PresetFormInput = {
  name: "",
  description: "",
  primary_style: "",
  secondary_trigger: "",
  styles: "",
  texture: "",
};

const FIELD_ORDER: (keyof PresetFormInput)[] = [
  "name",
  "description",
  "primary_style",
  "secondary_trigger",
  "styles",
  "texture",
];

const FIELD_IDS: Record<keyof PresetFormInput, string> = {
  name: "preset-name",
  description: "preset-description",
  primary_style: "preset-primary-style",
  secondary_trigger: "preset-secondary-trigger",
  styles: "preset-styles",
  texture: "preset-texture",
};

export default function PresetsSection() {
  const [presets, setPresets] = createStore<StylePresetRow[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [loadError, setLoadError] = createSignal<string | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [form, setForm] = createStore<PresetFormInput>({ ...EMPTY_FORM });
  const [fieldErrors, setFieldErrors] = createSignal<PresetFieldErrors>({});
  const [modalError, setModalError] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [deletingIds, setDeletingIds] = createSignal<Record<string, boolean>>(
    {},
  );
  let disposed = false;

  const applyPresets = (next: StylePresetRow[]) => {
    setPresets(reconcile(next, { key: "id", merge: true }));
  };

  const fetchPresets = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiGet<{ presets?: StylePresetRow[] }>(
        "/api/style-presets",
      );
      if (disposed) return;
      const list = Array.isArray(data?.presets) ? data.presets : [];
      applyPresets(list);
    } catch (err) {
      if (disposed) return;
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Could not load style presets.";
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
    setForm({ ...EMPTY_FORM });
    setFieldErrors({});
    setModalError(null);
    setModalOpen(true);
  };

  const openEditModal = (p: StylePresetRow) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      description: p.description ?? "",
      primary_style: p.primary_style ?? "",
      secondary_trigger: p.secondary_trigger ?? "",
      styles: Array.isArray(p.styles) ? p.styles.join("\n") : "",
      texture: p.texture ?? "",
    });
    setFieldErrors({});
    setModalError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving()) return;
    setModalOpen(false);
  };

  const clearFieldError = (key: keyof PresetFormInput) => {
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
    const res = buildPresetPayload(form, id ? "update" : "create");
    if ("errors" in res) {
      setFieldErrors(res.errors);
      const firstKey = FIELD_ORDER.find((k) => Boolean(res.errors[k]));
      if (firstKey) {
        queueMicrotask(() => {
          document.getElementById(FIELD_IDS[firstKey])?.focus();
        });
      }
      return;
    }

    const { payload } = res;

    setSaving(true);
    try {
      if (id) {
        await apiSend<Partial<StylePresetRow>>(
          "PUT",
          `/api/style-presets/${encodeURIComponent(id)}`,
          payload,
        );
        if (disposed) return;
        await fetchPresets();
        if (disposed) return;
        setModalOpen(false);
        toast.success(`Preset "${payload.name}" saved`);
      } else {
        await apiSend<Partial<StylePresetRow>>(
          "POST",
          "/api/style-presets",
          payload,
        );
        if (disposed) return;
        await fetchPresets();
        if (disposed) return;
        setModalOpen(false);
        toast.success(`Preset "${payload.name}" created`);
      }
    } catch (err) {
      if (disposed) return;
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Failed to save preset";
      setModalError(msg);
    } finally {
      if (!disposed) {
        setSaving(false);
      }
    }
  };

  const handleDelete = async (p: StylePresetRow) => {
    const id = p.id;
    if (deletingIds()[id]) return;
    const ok = await confirmDialog({
      title: "Delete this preset?",
      body: p.name,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok || disposed) return;

    setDeletingIds((prev) => ({ ...prev, [id]: true }));
    try {
      await apiSend("DELETE", `/api/style-presets/${encodeURIComponent(id)}`);
      if (disposed) return;
      await fetchPresets();
      if (disposed) return;
      toast.success("Preset deleted");
    } catch (err) {
      if (disposed) return;
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Failed to delete preset";
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
    <section class="panel flex flex-col gap-4 p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <h2 class="text-base font-semibold">Style presets</h2>
          <span class="badge badge-soft badge-sm tabular-nums">
            {presets.length}
          </span>
        </div>
        <button
          type="button"
          class="btn btn-primary btn-sm shrink-0"
          onClick={openNewModal}
        >
          <Icons.Plus class="size-4" />
          New preset
        </button>
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

      <Show when={!loading() && !loadError() && presets.length === 0}>
        <EmptyState
          title="No style presets"
          description="Create a preset to reuse style tags and textures across prompts."
        />
      </Show>

      <Show when={presets.length > 0}>
        <ul class="flex flex-col gap-2">
          <For each={presets}>
            {(p) => (
              <li class="min-w-0 rounded-field border border-base-300 p-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-mono text-sm font-medium">
                      {p.name}
                    </p>
                    <Show when={p.description}>
                      <p class="truncate text-xs text-base-content/60">
                        {p.description}
                      </p>
                    </Show>
                  </div>
                  <div class="flex shrink-0 gap-1">
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
                  </div>
                </div>
                <div class="mt-2 flex min-w-0 flex-wrap gap-1 text-xs">
                  <Show when={p.primary_style}>
                    <span class="badge badge-ghost badge-sm max-w-full truncate">
                      {p.primary_style}
                    </span>
                  </Show>
                  <Show when={p.secondary_trigger}>
                    <span class="badge badge-outline badge-sm max-w-full truncate">
                      {p.secondary_trigger}
                    </span>
                  </Show>
                  <For each={p.styles}>
                    {(s) => (
                      <span class="badge badge-ghost badge-sm max-w-full truncate">
                        {s}
                      </span>
                    )}
                  </For>
                  <Show when={p.texture}>
                    <span class="badge badge-ghost badge-sm max-w-full truncate">
                      {p.texture}
                    </span>
                  </Show>
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
        title={editingId() ? "Edit preset" : "New preset"}
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
            <Field label="Name" for="preset-name" error={fieldErrors().name}>
              <input
                id="preset-name"
                name="name"
                type="text"
                required
                maxLength={50}
                placeholder="e.g. anime"
                aria-invalid={fieldErrors().name ? "true" : undefined}
                aria-describedby={
                  fieldErrors().name ? "preset-name-error" : undefined
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
              for="preset-description"
              error={fieldErrors().description}
            >
              <input
                id="preset-description"
                name="description"
                type="text"
                maxLength={500}
                placeholder="Short description"
                aria-invalid={fieldErrors().description ? "true" : undefined}
                aria-describedby={
                  fieldErrors().description
                    ? "preset-description-error"
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

            <Field
              label="Primary style"
              for="preset-primary-style"
              error={fieldErrors().primary_style}
            >
              <input
                id="preset-primary-style"
                name="primary_style"
                type="text"
                maxLength={50}
                placeholder="e.g. watercolor"
                aria-invalid={fieldErrors().primary_style ? "true" : undefined}
                aria-describedby={
                  fieldErrors().primary_style
                    ? "preset-primary-style-error"
                    : undefined
                }
                class="input input-sm w-full"
                value={form.primary_style}
                onInput={(e) => {
                  setForm("primary_style", e.currentTarget.value);
                  clearFieldError("primary_style");
                }}
              />
            </Field>

            <Field
              label="Secondary trigger"
              for="preset-secondary-trigger"
              error={fieldErrors().secondary_trigger}
            >
              <input
                id="preset-secondary-trigger"
                name="secondary_trigger"
                type="text"
                maxLength={100}
                placeholder="Optional trigger word"
                aria-invalid={
                  fieldErrors().secondary_trigger ? "true" : undefined
                }
                aria-describedby={
                  fieldErrors().secondary_trigger
                    ? "preset-secondary-trigger-error"
                    : undefined
                }
                class="input input-sm w-full"
                value={form.secondary_trigger}
                onInput={(e) => {
                  setForm("secondary_trigger", e.currentTarget.value);
                  clearFieldError("secondary_trigger");
                }}
              />
            </Field>
          </div>

          <Field
            label="Styles (one per line or comma-separated)"
            for="preset-styles"
            error={fieldErrors().styles}
          >
            <textarea
              id="preset-styles"
              name="styles"
              rows={3}
              placeholder="soft lighting&#10;cel shading"
              aria-invalid={fieldErrors().styles ? "true" : undefined}
              aria-describedby={
                fieldErrors().styles ? "preset-styles-error" : undefined
              }
              class="textarea textarea-sm w-full"
              value={form.styles}
              onInput={(e) => {
                setForm("styles", e.currentTarget.value);
                clearFieldError("styles");
              }}
            />
          </Field>

          <Field
            label="Texture"
            for="preset-texture"
            error={fieldErrors().texture}
          >
            <input
              id="preset-texture"
              name="texture"
              type="text"
              maxLength={500}
              placeholder="Optional texture prompt suffix"
              aria-invalid={fieldErrors().texture ? "true" : undefined}
              aria-describedby={
                fieldErrors().texture ? "preset-texture-error" : undefined
              }
              class="input input-sm w-full"
              value={form.texture}
              onInput={(e) => {
                setForm("texture", e.currentTarget.value);
                clearFieldError("texture");
              }}
            />
          </Field>
        </form>
      </Modal>
    </section>
  );
}
