import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { apiGet } from "../lib/api-client";
import { Icons } from "./Icons";

export type LoraSpec = { name: string; strength: number };

type LoraRow = {
  id: string;
  comfyui_name: string;
  display_name: string;
  trigger_word: string | null;
  is_active: number;
  sort_order: number;
};

export function LoraSelector(props: {
  value: LoraSpec[];
  onChange: (v: LoraSpec[]) => void;
}) {
  const [loras, setLoras] = createSignal<LoraRow[]>([]);
  const [loadError, setLoadError] = createSignal(false);
  const [selectedName, setSelectedName] = createSignal("");
  let disposed = false;

  const fetchLoras = async () => {
    setLoadError(false);
    try {
      const data = await apiGet<{ loras?: LoraRow[] }>("/api/loras");
      if (disposed) return;
      const list = Array.isArray(data?.loras)
        ? data.loras.filter((l) => l.is_active)
        : [];
      setLoras(list);
    } catch {
      if (disposed) return;
      setLoadError(true);
    }
  };

  onMount(() => {
    void fetchLoras();
  });

  onCleanup(() => {
    disposed = true;
  });

  const add = () => {
    const name = selectedName();
    if (!name) return;
    if (props.value.some((v) => v.name === name)) return;
    props.onChange([...props.value, { name, strength: 0.7 }]);
    setSelectedName("");
  };

  const remove = (idx: number) =>
    props.onChange(props.value.filter((_, i) => i !== idx));

  const updateStrength = (idx: number, s: number) => {
    const copy = [...props.value];
    copy[idx] = { ...copy[idx], strength: s };
    props.onChange(copy);
  };

  const move = (idx: number, dir: number) => {
    const arr = [...props.value];
    const t = idx + dir;
    if (t < 0 || t >= arr.length) return;
    [arr[idx], arr[t]] = [arr[t], arr[idx]];
    props.onChange(arr);
  };

  const onDragStart = (e: DragEvent, idx: number) =>
    e.dataTransfer?.setData("text/plain", String(idx));

  const onDrop = (e: DragEvent, idx: number) => {
    e.preventDefault();
    const from = parseInt(e.dataTransfer?.getData("text/plain") ?? "", 10);
    if (Number.isNaN(from) || from < 0 || from >= props.value.length) return;
    const arr = [...props.value];
    const [moved] = arr.splice(from, 1);
    arr.splice(idx, 0, moved);
    props.onChange(arr);
  };

  return (
    <div class="flex flex-col gap-2">
      <div class="flex gap-2">
        <select
          class="select select-sm flex-1"
          aria-label="Select LoRA"
          value={selectedName()}
          onChange={(e) => setSelectedName(e.currentTarget.value)}
        >
          <option value="">Select LoRA</option>
          <For each={loras()}>
            {(l) => <option value={l.comfyui_name}>{l.display_name}</option>}
          </For>
        </select>
        <button type="button" class="btn btn-primary btn-sm" onClick={add}>
          Add
        </button>
      </div>
      <Show when={loadError()}>
        <p class="text-xs text-base-content/60">
          Could not load LoRAs.{" "}
          <button type="button" class="link" onClick={() => void fetchLoras()}>
            Try again
          </button>
        </p>
      </Show>
      <Show when={props.value.length === 0}>
        <p class="text-xs text-base-content/60">No LoRAs added</p>
      </Show>
      <Show when={props.value.length > 0}>
        <div class="flex flex-col gap-2">
          <For each={props.value}>
            {(spec, idx) => (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(e, idx())}
                class="flex items-center gap-2 rounded-field border border-base-300 bg-base-200 p-2"
              >
                <span
                  draggable
                  aria-hidden="true"
                  onDragStart={(e) => onDragStart(e, idx())}
                  class="cursor-grab select-none px-1 text-base-content/50 active:cursor-grabbing"
                >
                  <Icons.Bars3 class="size-4" />
                </span>
                <span class="min-w-0 flex-1 truncate font-mono text-xs">
                  {spec.name}
                </span>
                <input
                  type="range"
                  min="0.1"
                  max="2"
                  step="0.1"
                  aria-label={`Strength for ${spec.name}`}
                  value={String(spec.strength)}
                  onInput={(e) =>
                    updateStrength(idx(), parseFloat(e.currentTarget.value))
                  }
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  class="range range-primary range-xs w-28 cursor-pointer"
                  style="touch-action: pan-x;"
                />
                <span class="w-8 text-center text-xs tabular-nums">
                  {spec.strength.toFixed(1)}
                </span>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs btn-square"
                  aria-label="Move up"
                  onClick={() => move(idx(), -1)}
                >
                  <Icons.ChevronDown class="size-4 rotate-180" />
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs btn-square"
                  aria-label="Move down"
                  onClick={() => move(idx(), 1)}
                >
                  <Icons.ChevronDown class="size-4" />
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs btn-square text-error"
                  aria-label="Remove"
                  onClick={() => remove(idx())}
                >
                  <Icons.XMark class="size-4" />
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

export default LoraSelector;
