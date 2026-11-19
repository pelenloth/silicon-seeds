import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { apiGet } from "../lib/api-client";
import type {
  AudioModelId,
  SoundPresetCategory,
} from "../../shared/audio-models";

export type ClientSoundPreset = {
  id: string;
  name: string;
  description: string;
  audio_model: AudioModelId;
  category: SoundPresetCategory;
  instrumental_prompt: string;
  lyric_prompt: string;
  settings: Record<string, unknown>;
  builtin: boolean;
};

export function SoundPresetSelect(props: {
  name?: string;
  id?: string;
  class?: string;
  value?: string;
  audioModel?: string;
  ariaLabel?: string;
  onChange?: (name: string, preset: ClientSoundPreset | undefined) => void;
}) {
  let selectRef: HTMLSelectElement | undefined;
  const [presets, setPresets] = createSignal<ClientSoundPreset[]>([]);
  const [loadError, setLoadError] = createSignal(false);
  let disposed = false;

  const fetchPresets = async () => {
    setLoadError(false);
    try {
      const data = await apiGet<{ presets?: ClientSoundPreset[] }>(
        "/api/sound-presets",
      );
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

  const filtered = createMemo(() => {
    const model = props.audioModel;
    const all = presets();
    if (!model) return all;
    return all.filter((p) => p.audio_model === model);
  });

  const builtins = createMemo(() => filtered().filter((p) => p.builtin));
  const customs = createMemo(() => filtered().filter((p) => !p.builtin));

  const extraValue = () => {
    const v = props.value;
    if (!v || v === "none") return undefined;
    if (filtered().some((p) => p.name === v)) return undefined;
    return v;
  };

  createEffect(() => {
    filtered();
    const v = props.value;
    if (selectRef && v !== undefined) {
      selectRef.value = v;
    }
  });

  return (
    <>
      <select
        ref={selectRef}
        name={props.name ?? "sound_preset"}
        id={props.id}
        aria-label={props.ariaLabel}
        class={props.class ?? "select select-sm w-full"}
        value={props.value ?? "none"}
        onChange={(e) => {
          const val = e.currentTarget.value;
          const match = presets().find((p) => p.name === val);
          props.onChange?.(val, match);
        }}
      >
        <option value="none">No sound preset</option>
        <Show when={extraValue()}>
          {(val) => <option value={val()}>{val()}</option>}
        </Show>
        <Show when={builtins().length > 0}>
          <optgroup label="Curated">
            <For each={builtins()}>
              {(p) => <option value={p.name}>{p.name}</option>}
            </For>
          </optgroup>
        </Show>
        <Show when={customs().length > 0}>
          <optgroup label="Custom">
            <For each={customs()}>
              {(p) => <option value={p.name}>{p.name}</option>}
            </For>
          </optgroup>
        </Show>
      </select>
      <Show when={loadError()}>
        <p class="mt-1 text-xs text-base-content/60">
          Could not load sound presets.{" "}
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

export default SoundPresetSelect;
