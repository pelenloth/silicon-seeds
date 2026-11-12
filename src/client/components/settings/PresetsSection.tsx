import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { apiGet, apiSend } from "../../lib/api-client";
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

type PresetFormState = {
  name: string;
  description: string;
  primary_style: string;
  secondary_trigger: string;
  styles: string;
  texture: string;
};

const EMPTY_FORM: PresetFormState = {
  name: "",
  description: "",
  primary_style: "",
  secondary_trigger: "",
  styles: "",
  texture: "",
};

function parseStylesList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function PresetsSection() {
  const [presets, setPresets] = createStore<StylePresetRow[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [loadError, setLoadError] = createSignal<string | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [form, setForm] = createStore<PresetFormState>({ ...EMPTY_FORM });
  const [nameError, setNameError] = createSignal<string | undefined>(undefined);
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
    setNameError(undefined);
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
    setNameError(undefined);
    setModalError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving()) return;
    setModalOpen(false);
  };

  const handleSave = async () => {
    if (saving()) return;
    setNameError(undefined);
    setModalError(null);

    const name = form.name.trim();
    if (!name) {
      setNameError("Name is required");
      return;
    }

    const payload = {
      name,
      description: form.description.trim() || null,
      primary_style: form.primary_style.trim(),
      secondary_trigger: form.secondary_trigger.trim() || null,
      styles: parseStylesList(form.styles),
      texture: form.texture.trim() || null,
    };

    setSaving(true);
    const id = editingId();
    try {
      if (id) {
        const updated = await apiSend<Partial<StylePresetRow>>(
          "PUT",
          `/api/style-presets/${encodeURIComponent(id)}`,
          payload,
        );
        if (disposed) return;
        const nextList = presets.map((p) =>
          p.id === id
            ? {
                ...p,
                ...payload,
                ...(updated && typeof updated === "object" ? updated : {}),
                id,
              }
            : { ...p },
        );
        applyPresets(nextList);
        setModalOpen(false);
        toast.success(`Preset "${name}" saved`);
      } else {
        const created = await apiSend<Partial<StylePresetRow>>(
          "POST",
          "/api/style-presets",
          payload,
        );
        if (disposed) return;
        if (created && typeof created.id === "string") {
          const newRow: StylePresetRow = {
            id: created.id,
            name: created.name ?? payload.name,
            description:
              created.description !== undefined
                ? created.description
                : payload.description,
            primary_style: created.primary_style ?? payload.primary_style,
            secondary_trigger:
              created.secondary_trigger !== undefined
                ? created.secondary_trigger
                : payload.secondary_trigger,
            styles: Array.isArray(created.styles)
              ? created.styles
              : payload.styles,
            texture:
              created.texture !== undefined ? created.texture : payload.texture,
          };
          applyPresets([...presets.map((p) => ({ ...p })), newRow]);
        } else {
          await fetchPresets();
        }
        setModalOpen(false);
        toast.success(`Preset "${name}" created`);
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
      applyPresets(presets.filter((r) => r.id !== id).map((r) => ({ ...r })));
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
            <Field label="Name" for="preset-name" error={nameError()}>
              <input
                id="preset-name"
                name="name"
                type="text"
                required
                placeholder="e.g. anime"
                aria-invalid={nameError() ? "true" : undefined}
                class="input input-sm w-full font-mono"
                value={form.name}
                onInput={(e) => {
                  setForm("name", e.currentTarget.value);
                  if (nameError()) setNameError(undefined);
                }}
              />
            </Field>

            <Field label="Description" for="preset-description">
              <input
                id="preset-description"
                name="description"
                type="text"
                placeholder="Short description"
                class="input input-sm w-full"
                value={form.description}
                onInput={(e) => setForm("description", e.currentTarget.value)}
              />
            </Field>

            <Field label="Primary style" for="preset-primary-style">
              <input
                id="preset-primary-style"
                name="primary_style"
                type="text"
                placeholder="e.g. watercolor"
                class="input input-sm w-full"
                value={form.primary_style}
                onInput={(e) => setForm("primary_style", e.currentTarget.value)}
              />
            </Field>

            <Field label="Secondary trigger" for="preset-secondary-trigger">
              <input
                id="preset-secondary-trigger"
                name="secondary_trigger"
                type="text"
                placeholder="Optional trigger word"
                class="input input-sm w-full"
                value={form.secondary_trigger}
                onInput={(e) =>
                  setForm("secondary_trigger", e.currentTarget.value)
                }
              />
            </Field>
          </div>

          <Field
            label="Styles (one per line or comma-separated)"
            for="preset-styles"
          >
            <textarea
              id="preset-styles"
              name="styles"
              rows={3}
              placeholder="soft lighting&#10;cel shading"
              class="textarea textarea-sm w-full"
              value={form.styles}
              onInput={(e) => setForm("styles", e.currentTarget.value)}
            />
          </Field>

          <Field label="Texture" for="preset-texture">
            <input
              id="preset-texture"
              name="texture"
              type="text"
              placeholder="Optional texture prompt suffix"
              class="input input-sm w-full"
              value={form.texture}
              onInput={(e) => setForm("texture", e.currentTarget.value)}
            />
          </Field>
        </form>
      </Modal>
    </section>
  );
}
