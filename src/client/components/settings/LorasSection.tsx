import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { apiGet, apiSend } from "../../lib/api-client";
import { confirmDialog } from "../../stores/confirm";
import { toast } from "../../stores/toast";
import { Icons } from "../Icons";
import { EmptyState } from "../ui/EmptyState";

export type LoraRow = {
  id: string;
  comfyui_name: string;
  display_name: string;
  trigger_word: string | null;
  is_active: number;
  sort_order: number;
};

export default function LorasSection() {
  const [loras, setLoras] = createStore<LoraRow[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [loadError, setLoadError] = createSignal<string | null>(null);
  const [syncing, setSyncing] = createSignal(false);
  const [discovered, setDiscovered] = createSignal<string[]>([]);
  const [addingNames, setAddingNames] = createSignal<Record<string, boolean>>(
    {},
  );
  const [togglingIds, setTogglingIds] = createSignal<Record<string, boolean>>(
    {},
  );
  const [reordering, setReordering] = createSignal(false);
  const [deletingIds, setDeletingIds] = createSignal<Record<string, boolean>>(
    {},
  );
  let disposed = false;

  const applyLoras = (next: LoraRow[]) => {
    setLoras(reconcile(next, { key: "id", merge: true }));
  };

  const fetchLoras = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiGet<{ loras?: LoraRow[] }>("/api/loras");
      if (disposed) return;
      const list = Array.isArray(data?.loras) ? data.loras : [];
      applyLoras(list);
    } catch (err) {
      if (disposed) return;
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Could not load LoRAs.";
      setLoadError(msg);
    } finally {
      if (!disposed) {
        setLoading(false);
      }
    }
  };

  onMount(() => {
    void fetchLoras();
  });

  onCleanup(() => {
    disposed = true;
  });

  const unsavedDiscovered = () => {
    const savedNames = new Set(loras.map((l) => l.comfyui_name));
    return discovered().filter((name) => !savedNames.has(name));
  };

  const handleSync = async () => {
    if (syncing()) return;
    setSyncing(true);
    try {
      const data = await apiGet<{ loras?: string[] }>("/api/comfyui/loras");
      if (disposed) return;
      const names = Array.isArray(data?.loras) ? data.loras : [];
      setDiscovered(names);
      if (names.length > 0) {
        toast.info(`Found ${names.length} LoRAs on ComfyUI`);
      } else {
        toast.info("No LoRAs found on ComfyUI");
      }
    } catch (err) {
      if (disposed) return;
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Failed to sync from ComfyUI";
      toast.error(msg);
    } finally {
      if (!disposed) {
        setSyncing(false);
      }
    }
  };

  const handleAdd = async (comfyuiName: string) => {
    if (addingNames()[comfyuiName]) return;
    setAddingNames((prev) => ({ ...prev, [comfyuiName]: true }));
    const displayName = comfyuiName.replace(/\.safetensors$/i, "");
    try {
      const created = await apiSend<Partial<LoraRow>>("POST", "/api/loras", {
        comfyui_name: comfyuiName,
        display_name: displayName,
      });
      if (disposed) return;
      if (created && typeof created.id === "string") {
        const nextRow: LoraRow = {
          id: created.id,
          comfyui_name: created.comfyui_name ?? comfyuiName,
          display_name: created.display_name ?? displayName,
          trigger_word: created.trigger_word ?? null,
          is_active: created.is_active ?? 1,
          sort_order: created.sort_order ?? loras.length,
        };
        applyLoras([...loras.map((r) => ({ ...r })), nextRow]);
      } else {
        await fetchLoras();
      }
      toast.success(`Added ${displayName}`);
    } catch (err) {
      if (disposed) return;
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Failed to add LoRA";
      toast.error(msg);
    } finally {
      if (!disposed) {
        setAddingNames((prev) => {
          const copy = { ...prev };
          delete copy[comfyuiName];
          return copy;
        });
      }
    }
  };

  const handleToggle = async (row: LoraRow) => {
    const id = row.id;
    if (togglingIds()[id]) return;
    const prevValue = row.is_active ? 1 : 0;
    const nextValue = prevValue ? 0 : 1;
    const idx = loras.findIndex((r) => r.id === id);
    if (idx === -1) return;

    setTogglingIds((prev) => ({ ...prev, [id]: true }));
    setLoras(idx, "is_active", nextValue);

    try {
      await apiSend("PUT", `/api/loras/${encodeURIComponent(id)}`, {
        is_active: nextValue,
      });
      if (disposed) return;
      toast.success(
        `${row.display_name} ${nextValue ? "shown in create forms" : "hidden"}`,
      );
    } catch (err) {
      if (disposed) return;
      const rollbackIdx = loras.findIndex((r) => r.id === id);
      if (rollbackIdx !== -1) {
        setLoras(rollbackIdx, "is_active", prevValue);
      }
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Failed to update LoRA";
      toast.error(msg);
    } finally {
      if (!disposed) {
        setTogglingIds((prev) => {
          const copy = { ...prev };
          delete copy[id];
          return copy;
        });
      }
    }
  };

  const commitReorder = async (nextOrder: LoraRow[], prevOrder: LoraRow[]) => {
    if (reordering()) return;
    setReordering(true);
    applyLoras(nextOrder);
    const ids = nextOrder.map((r) => r.id);
    try {
      await apiSend("PUT", "/api/loras/reorder", { ids });
      if (disposed) return;
      toast.success("LoRA order updated");
    } catch (err) {
      if (disposed) return;
      applyLoras(prevOrder);
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Failed to reorder LoRAs";
      toast.error(msg);
    } finally {
      if (!disposed) {
        setReordering(false);
      }
    }
  };

  const move = (idx: number, dir: -1 | 1) => {
    if (reordering()) return;
    const target = idx + dir;
    if (target < 0 || target >= loras.length) return;
    const prevOrder = loras.map((r) => ({ ...r }));
    const nextOrder = prevOrder.map((r) => ({ ...r }));
    [nextOrder[idx], nextOrder[target]] = [nextOrder[target], nextOrder[idx]];
    nextOrder.forEach((r, i) => {
      r.sort_order = i;
    });
    void commitReorder(nextOrder, prevOrder);
  };

  const onDragStart = (e: DragEvent, idx: number) => {
    e.dataTransfer?.setData("text/plain", String(idx));
  };

  const onDrop = (e: DragEvent, idx: number) => {
    e.preventDefault();
    if (reordering()) return;
    const from = parseInt(e.dataTransfer?.getData("text/plain") ?? "", 10);
    if (
      Number.isNaN(from) ||
      from < 0 ||
      from >= loras.length ||
      from === idx
    ) {
      return;
    }
    const prevOrder = loras.map((r) => ({ ...r }));
    const nextOrder = prevOrder.map((r) => ({ ...r }));
    const [moved] = nextOrder.splice(from, 1);
    nextOrder.splice(idx, 0, moved);
    nextOrder.forEach((r, i) => {
      r.sort_order = i;
    });
    void commitReorder(nextOrder, prevOrder);
  };

  const handleDelete = async (row: LoraRow) => {
    const id = row.id;
    if (deletingIds()[id]) return;
    const ok = await confirmDialog({
      title: "Delete this LoRA?",
      body: row.display_name,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok || disposed) return;

    setDeletingIds((prev) => ({ ...prev, [id]: true }));
    try {
      await apiSend("DELETE", `/api/loras/${encodeURIComponent(id)}`);
      if (disposed) return;
      applyLoras(loras.filter((r) => r.id !== id).map((r) => ({ ...r })));
      toast.success("LoRA deleted");
    } catch (err) {
      if (disposed) return;
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Failed to delete LoRA";
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
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <h2 class="text-base font-semibold">LoRAs</h2>
          <p class="text-xs text-base-content/60">
            Order matters when LoRAs are stacked. Hidden LoRAs do not appear in
            create forms.
          </p>
        </div>
        <button
          type="button"
          class="btn btn-sm shrink-0"
          disabled={syncing()}
          onClick={() => void handleSync()}
        >
          <Show when={syncing()} fallback={<Icons.Refresh class="size-4" />}>
            <span class="loading loading-spinner loading-xs" />
          </Show>
          Sync from ComfyUI
        </button>
      </div>

      <Show when={unsavedDiscovered().length > 0}>
        <div class="flex flex-col gap-2 rounded-field border border-base-300 bg-base-200/50 p-3">
          <p class="text-xs font-medium text-base-content/70">
            Discovered on ComfyUI ({unsavedDiscovered().length})
          </p>
          <ul class="flex flex-col gap-2">
            <For each={unsavedDiscovered()}>
              {(name) => (
                <li class="flex items-center justify-between gap-2 rounded-field border border-base-300 bg-base-100 px-3 py-2">
                  <span class="min-w-0 flex-1 truncate font-mono text-xs">
                    {name}
                  </span>
                  <button
                    type="button"
                    class="btn btn-primary btn-xs shrink-0"
                    disabled={!!addingNames()[name]}
                    onClick={() => void handleAdd(name)}
                  >
                    <Show when={addingNames()[name]}>
                      <span class="loading loading-spinner loading-xs" />
                    </Show>
                    Add
                  </button>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>

      <Show when={loadError()}>
        {(msg) => (
          <div class="flex items-center justify-between gap-2 rounded-field border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
            <span>{msg()}</span>
            <button
              type="button"
              class="btn btn-ghost btn-xs"
              onClick={() => void fetchLoras()}
            >
              Try again
            </button>
          </div>
        )}
      </Show>

      <Show when={loading() && loras.length === 0}>
        <div class="flex flex-col gap-2">
          <div class="skeleton h-12 w-full" />
          <div class="skeleton h-12 w-full" />
        </div>
      </Show>

      <Show when={!loading() && !loadError() && loras.length === 0}>
        <EmptyState
          title="No LoRAs saved"
          description="Sync from ComfyUI to add some."
        />
      </Show>

      <Show when={loras.length > 0}>
        <ul class="flex flex-col gap-2">
          <For each={loras}>
            {(row, idx) => (
              <li
                class="flex min-w-0 items-center gap-2 sm:gap-3 rounded-field border border-base-300 bg-base-100 p-2"
                draggable
                onDragStart={(e) => onDragStart(e, idx())}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(e, idx())}
              >
                <span
                  class="cursor-grab select-none px-1 text-base-content/40"
                  aria-hidden="true"
                >
                  ≡
                </span>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium">{row.display_name}</p>
                  <p class="truncate font-mono text-xs text-base-content/50">
                    {row.comfyui_name}
                  </p>
                </div>
                <label class="flex shrink-0 items-center gap-2 text-xs">
                  <span class="hidden sm:inline text-base-content/60">
                    {row.is_active ? "Active" : "Hidden"}
                  </span>
                  <input
                    type="checkbox"
                    class="toggle toggle-primary toggle-sm"
                    checked={!!row.is_active}
                    disabled={!!togglingIds()[row.id]}
                    aria-label={`Show ${row.display_name} in create forms`}
                    onChange={() => void handleToggle(row)}
                  />
                </label>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs btn-square shrink-0"
                  aria-label="Move up"
                  title={`Move ${row.display_name} up`}
                  disabled={idx() === 0 || reordering()}
                  onClick={() => move(idx(), -1)}
                >
                  <Icons.ChevronDown class="size-4 rotate-180" />
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs btn-square shrink-0"
                  aria-label="Move down"
                  title={`Move ${row.display_name} down`}
                  disabled={idx() === loras.length - 1 || reordering()}
                  onClick={() => move(idx(), 1)}
                >
                  <Icons.ChevronDown class="size-4" />
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs btn-square shrink-0 text-error"
                  aria-label={`Delete ${row.display_name}`}
                  title={`Delete ${row.display_name}`}
                  disabled={!!deletingIds()[row.id]}
                  onClick={() => void handleDelete(row)}
                >
                  <Icons.Trash class="size-4" />
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}
