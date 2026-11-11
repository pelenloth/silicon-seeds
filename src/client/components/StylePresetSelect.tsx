import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { apiGet } from "../lib/api-client";

type Preset = {
  id: string;
  name: string;
  description: string | null;
  primary_style: string;
  secondary_trigger: string | null;
  styles: string[];
  texture: string | null;
};

export function StylePresetSelect(props: {
  name?: string;
  id?: string;
  class?: string;
  value?: string;
  onChange?: (v: string) => void;
}) {
  let selectRef: HTMLSelectElement | undefined;
  const [presets, setPresets] = createSignal<Preset[]>([]);
  const [loadError, setLoadError] = createSignal(false);
  let disposed = false;

  const fetchPresets = async () => {
    setLoadError(false);
    try {
      const data = await apiGet<{ presets?: Preset[] }>("/api/style-presets");
      if (disposed) return;
      setPresets(Array.isArray(data?.presets) ? data.presets : []);
    } catch {
      if (disposed) return;
      setLoadError(true);
    }
  };

  onMount(() => {
    void fetchPresets();
  });

  onCleanup(() => {
    disposed = true;
  });

  const extraValue = () => {
    const v = props.value;
    if (!v || v === "none") return undefined;
    if (presets().some((p) => p.name === v)) return undefined;
    return v;
  };

  createEffect(() => {
    presets();
    const v = props.value;
    if (selectRef && v !== undefined) {
      selectRef.value = v;
    }
  });

  return (
    <>
      <select
        ref={selectRef}
        name={props.name ?? "style_preset"}
        id={props.id}
        class={props.class ?? "select select-sm w-full"}
        value={props.value ?? "none"}
        onChange={(e) => props.onChange?.(e.currentTarget.value)}
      >
        <option value="none">No preset</option>
        <Show when={extraValue()}>
          {(val) => <option value={val()}>{val()}</option>}
        </Show>
        <For each={presets()}>
          {(p) => <option value={p.name}>{p.name}</option>}
        </For>
      </select>
      <Show when={loadError()}>
        <p class="mt-1 text-xs text-base-content/60">
          Could not load presets.{" "}
          <button
            type="button"
            class="link"
            onClick={() => void fetchPresets()}
          >
            Try again
          </button>
        </p>
      </Show>
    </>
  );
}

export default StylePresetSelect;
