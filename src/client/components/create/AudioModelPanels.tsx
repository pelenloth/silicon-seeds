import { For, Show } from "solid-js";
import {
  listAudioModels,
  YUE2_SAMPLE_REFERENCE_FILENAME,
  type AudioModelId,
  type AudioModelSpec,
} from "../../../shared/audio-models";
import { Icons } from "../Icons";
import { Field } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { SelectField } from "../ui/SelectField";
import { SliderField } from "../ui/SliderField";
import { CollapsibleSection, Section } from "./Section";

export const KEY_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "C", label: "C" },
  { value: "C#", label: "C#" },
  { value: "D", label: "D" },
  { value: "D#", label: "D#" },
  { value: "E", label: "E" },
  { value: "F", label: "F" },
  { value: "F#", label: "F#" },
  { value: "G", label: "G" },
  { value: "G#", label: "G#" },
  { value: "A", label: "A" },
  { value: "A#", label: "A#" },
  { value: "B", label: "B" },
] as const;

export const SCALE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "major", label: "Major" },
  { value: "minor", label: "Minor" },
] as const;

export const KEYSCALE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "C major", label: "C major" },
  { value: "A minor", label: "A minor" },
  { value: "D minor", label: "D minor" },
  { value: "E minor", label: "E minor" },
  { value: "G major", label: "G major" },
  { value: "B minor", label: "B minor" },
  { value: "F# minor", label: "F# minor" },
] as const;

export const TIME_SIGNATURES: readonly { value: string; label: string }[] = [
  { value: "2", label: "2/4" },
  { value: "3", label: "3/4" },
  { value: "4", label: "4/4" },
  { value: "6", label: "6/8" },
] as const;

export const TIMESIGNATURE_OPTIONS = TIME_SIGNATURES;

export const YUE2_MODES: readonly { value: string; label: string }[] = [
  { value: "full", label: "Full Song" },
  { value: "melody", label: "Melody Cover" },
] as const;

export const YUE2_MODE_OPTIONS = YUE2_MODES;

export const BOOL_TOGGLE_OPTIONS: readonly { value: string; label: string }[] =
  [
    { value: "true", label: "Enabled" },
    { value: "false", label: "Disabled" },
  ] as const;

export const ABC_PLANNING_OPTIONS: readonly { value: string; label: string }[] =
  [
    { value: "true", label: "Enabled (ABC Score)" },
    { value: "false", label: "Disabled" },
  ] as const;

export const MINIMAX_PRECISIONS: readonly { value: string; label: string }[] = [
  { value: "int8", label: "INT8 (~18 GB)" },
  { value: "fp16", label: "FP16 (~28 GB)" },
] as const;

export const MINIMAX_PRECISION_OPTIONS = MINIMAX_PRECISIONS;

export const TILED_DECODE_OPTIONS = BOOL_TOGGLE_OPTIONS;

export const SA3_VARIANTS: readonly { value: string; label: string }[] = [
  { value: "medium", label: "Medium (8-step)" },
  { value: "medium_base", label: "Medium Base (50-step)" },
] as const;

export const SA3_VARIANT_OPTIONS = SA3_VARIANTS;

export const SA3_AUDIO_TYPES: readonly { value: string; label: string }[] = [
  { value: "Music", label: "Music" },
  { value: "Instrument", label: "Instrument" },
  { value: "SFX", label: "SFX" },
  { value: "One-shot", label: "One-shot" },
] as const;

export const SA3_AUDIO_TYPE_OPTIONS = SA3_AUDIO_TYPES;

export const USE_REPROMPT_OPTIONS: readonly { value: string; label: string }[] =
  [
    { value: "false", label: "Off" },
    { value: "true", label: "On (Qwen3.5)" },
  ] as const;

export const AUDIO_PRESET_SETTING_KEYS = [
  "duration",
  "bpm",
  "keyscale",
  "timesignature",
  "cfg_scale",
  "temperature",
  "top_p",
  "top_k",
  "steps",
  "yue2_mode",
  "abc_planning",
  "abc_temperature",
  "abc_top_p",
  "minimax_precision",
  "tiled_decode",
  "sa3_variant",
  "sa3_audio_type",
  "use_reprompt",
  "reference_audio_sample",
] as const;

export function parseKeyscale(raw: string): { key: string; scale: string } {
  const parts = raw.trim().split(/\s+/);
  const key = KEY_OPTIONS.find((k) => k.value === parts[0])?.value ?? "E";
  const scale = parts[1]?.toLowerCase() === "major" ? "major" : "minor";
  return { key, scale };
}

const ALL_AUDIO_MODELS = listAudioModels();

export function AudioModelTipsDrawer(props: { spec: AudioModelSpec }) {
  return (
    <div class="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="badge badge-primary badge-xs">{props.spec.badge}</span>
        <span class="badge badge-ghost badge-xs">{props.spec.vramHint}</span>
      </div>
      <details class="group">
        <summary class="cursor-pointer list-none font-medium text-primary hover:underline">
          Prompting &amp; structure tips
        </summary>
        <div class="mt-2 rounded-box border border-base-300 bg-base-200/50 p-2.5 text-xs text-base-content/80">
          <p class="font-medium text-base-content">
            {props.spec.recommendation}
          </p>
          <ul class="mt-1.5 list-disc space-y-1 pl-4">
            <For each={props.spec.tips}>{(tip) => <li>{tip}</li>}</For>
          </ul>
          <div class="mt-2 border-t border-base-300 pt-2">
            <p class="mb-1 font-semibold text-base-content">
              Model quick comparison
            </p>
            <div class="grid grid-cols-2 gap-1.5">
              <For each={ALL_AUDIO_MODELS}>
                {(m) => (
                  <div class="rounded border border-base-300 bg-base-100/70 px-2 py-1">
                    <div class="font-semibold text-base-content">{m.label}</div>
                    <div class="text-[11px] text-base-content/60">
                      {m.badge} · {m.minDuration}–{m.maxDuration}s ·{" "}
                      {m.vramHint}
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

export function Yue2ReferenceAudioPanel(props: {
  refFileName: string;
  sampleValue: string;
  error?: string;
  onFileInputRef: (el: HTMLInputElement) => void;
  onFileChange: (fileName: string) => void;
  onToggleSample: () => void;
  onClear: () => void;
}) {
  const isSample = () => props.sampleValue === YUE2_SAMPLE_REFERENCE_FILENAME;
  const hasActive = () =>
    Boolean(props.refFileName) || Boolean(props.sampleValue);

  return (
    <section class="panel p-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 class="text-xs font-semibold">Reference Audio (Melody Cover)</h2>
          <p class="text-xs text-base-content/60">
            Optional SheetSage2 melody conditioning (.flac, .mp3, .wav, .ogg,
            .m4a)
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <label class="btn btn-ghost btn-xs gap-1">
            <Icons.Upload class="size-3.5" />
            Upload audio
            <input
              type="file"
              name="reference_audio"
              accept=".flac,.mp3,.wav,.ogg,.m4a"
              class="hidden"
              ref={props.onFileInputRef}
              onChange={(e) => {
                const name = e.currentTarget.files?.[0]?.name ?? "";
                props.onFileChange(name);
              }}
            />
          </label>
          <button
            type="button"
            class="btn btn-xs"
            classList={{
              "btn-primary": isSample(),
              "btn-ghost": !isSample(),
            }}
            aria-pressed={isSample()}
            onClick={props.onToggleSample}
          >
            Use sample melody
          </button>
          <Show when={hasActive()}>
            <button
              type="button"
              class="btn btn-ghost btn-xs"
              aria-label="Clear reference audio"
              onClick={props.onClear}
            >
              Clear
            </button>
          </Show>
        </div>
      </div>
      <Show when={hasActive()}>
        <p class="mt-1.5 truncate font-mono text-xs text-base-content/70">
          Active: {props.refFileName || props.sampleValue}
        </p>
      </Show>
      <Show when={props.sampleValue}>
        <input
          type="hidden"
          name="reference_audio_sample"
          value={props.sampleValue}
        />
      </Show>
      <Show when={props.error}>
        <p class="mt-1 text-xs text-error" role="alert">
          {props.error}
        </p>
      </Show>
    </section>
  );
}

export function AudioTimingSection(props: {
  modelId: AudioModelId;
  spec: AudioModelSpec;
  duration: number;
  bpm: number;
  yue2Mode: string;
  minimaxPrecision: string;
  sa3AudioType: string;
  errors: Record<string, string | undefined>;
  set: (
    field:
      "duration" | "bpm" | "yue2_mode" | "minimax_precision" | "sa3_audio_type",
    value: string,
  ) => void;
}) {
  return (
    <Section title="Timing">
      <div class="grid grid-cols-2 gap-3">
        <SliderField
          label="Duration"
          name="duration"
          min={props.spec.minDuration}
          max={props.spec.maxDuration}
          step={1}
          value={props.duration}
          onInput={(v) => props.set("duration", String(v))}
          format={(v) => `${v}s`}
          error={props.errors.duration}
        />
        <Show when={props.modelId === "ace-step-1.5"}>
          <SliderField
            label="BPM"
            name="bpm"
            min={40}
            max={240}
            value={props.bpm}
            onInput={(v) => props.set("bpm", String(v))}
            format={(v) => `${v} BPM`}
            error={props.errors.bpm}
          />
        </Show>
        <Show when={props.modelId === "yue2"}>
          <SelectField
            label="Generation mode"
            name="yue2_mode"
            value={props.yue2Mode}
            onChange={(v) => props.set("yue2_mode", v)}
            options={YUE2_MODE_OPTIONS}
            error={props.errors.yue2_mode}
          />
        </Show>
        <Show when={props.modelId === "minimax-music-3"}>
          <SelectField
            label="Precision"
            name="minimax_precision"
            value={props.minimaxPrecision}
            onChange={(v) => props.set("minimax_precision", v)}
            options={MINIMAX_PRECISION_OPTIONS}
            error={props.errors.minimax_precision}
          />
        </Show>
        <Show when={props.modelId === "stable-audio-3"}>
          <SelectField
            label="Audio category"
            name="sa3_audio_type"
            value={props.sa3AudioType}
            onChange={(v) => props.set("sa3_audio_type", v)}
            options={SA3_AUDIO_TYPE_OPTIONS}
            error={props.errors.sa3_audio_type}
          />
        </Show>
      </div>
    </Section>
  );
}

export type AudioModelControlsValues = {
  keyscale: string;
  timesignature: string;
  yue2_mode: string;
  abc_planning: string;
  minimax_precision: string;
  tiled_decode: string;
  sa3_variant: string;
  sa3_audio_type: string;
  use_reprompt: string;
};

export function AudioModelFramingSection(props: {
  modelId: AudioModelId;
  values: AudioModelControlsValues;
  errors: Record<string, string | undefined>;
  set: (
    field: keyof AudioModelControlsValues | "steps" | "cfg_scale",
    value: string,
  ) => void;
}) {
  return (
    <>
      <Show when={props.modelId === "ace-step-1.5"}>
        <Section title="Musical framing">
          <div class="grid grid-cols-2 gap-3">
            <SelectField
              label="Key / Scale"
              name="keyscale"
              value={props.values.keyscale}
              onChange={(v) => props.set("keyscale", v)}
              options={KEYSCALE_OPTIONS}
              error={props.errors.keyscale}
            />
            <Field label="Time signature" error={props.errors.timesignature}>
              <Segmented
                label="Time signature"
                name="timesignature"
                size="xs"
                value={props.values.timesignature}
                onChange={(v) => props.set("timesignature", v)}
                options={TIMESIGNATURE_OPTIONS}
              />
            </Field>
          </div>
        </Section>
      </Show>

      <Show when={props.modelId === "yue2"}>
        <Section title="Symbolic planning">
          <SelectField
            label="ABC Score planning"
            name="abc_planning"
            value={props.values.abc_planning}
            onChange={(v) => props.set("abc_planning", v)}
            options={ABC_PLANNING_OPTIONS}
            error={props.errors.abc_planning}
          />
        </Section>
      </Show>

      <Show when={props.modelId === "minimax-music-3"}>
        <Section title="Decoder framing">
          <SelectField
            label="Tiled VAE decode"
            name="tiled_decode"
            value={props.values.tiled_decode}
            onChange={(v) => props.set("tiled_decode", v)}
            options={TILED_DECODE_OPTIONS}
            error={props.errors.tiled_decode}
          />
        </Section>
      </Show>

      <Show when={props.modelId === "stable-audio-3"}>
        <Section title="Synthesis options">
          <div class="grid grid-cols-2 gap-3">
            <SelectField
              label="Checkpoint variant"
              name="sa3_variant"
              value={props.values.sa3_variant}
              onChange={(v) => {
                props.set("sa3_variant", v);
                if (v === "medium_base") {
                  props.set("steps", "50");
                  props.set("cfg_scale", "7");
                } else {
                  props.set("steps", "8");
                  props.set("cfg_scale", "1");
                }
              }}
              options={SA3_VARIANT_OPTIONS}
              error={props.errors.sa3_variant}
            />
            <SelectField
              label="Qwen3.5 Reprompting"
              name="use_reprompt"
              value={props.values.use_reprompt}
              onChange={(v) => props.set("use_reprompt", v)}
              options={USE_REPROMPT_OPTIONS}
              error={props.errors.use_reprompt}
            />
          </div>
        </Section>
      </Show>
    </>
  );
}

export function AudioAdvancedSection(props: {
  modelId: AudioModelId;
  cfgScale: number;
  steps: number;
  temperature: number;
  topP: number;
  abcTemperature: number;
  topK: number;
  errors: Record<string, string | undefined>;
  set: (
    field:
      | "cfg_scale"
      | "steps"
      | "temperature"
      | "top_p"
      | "abc_temperature"
      | "top_k",
    value: string,
  ) => void;
}) {
  return (
    <CollapsibleSection
      title="Advanced"
      open={Boolean(
        props.errors.cfg_scale ||
        props.errors.temperature ||
        props.errors.top_p ||
        props.errors.top_k ||
        props.errors.steps ||
        props.errors.abc_temperature,
      )}
    >
      <div class="flex flex-col gap-3">
        <SliderField
          label="CFG scale"
          name="cfg_scale"
          min={0}
          max={10}
          step={0.1}
          value={props.cfgScale}
          onInput={(v) => props.set("cfg_scale", String(v))}
          error={props.errors.cfg_scale}
        />
        <SliderField
          label="Steps"
          name="steps"
          min={1}
          max={100}
          step={1}
          value={props.steps}
          onInput={(v) => props.set("steps", String(v))}
          error={props.errors.steps}
        />
        <Show
          when={props.modelId === "ace-step-1.5" || props.modelId === "yue2"}
        >
          <SliderField
            label="Temperature"
            name="temperature"
            min={0}
            max={2}
            step={0.05}
            value={props.temperature}
            onInput={(v) => props.set("temperature", String(v))}
            format={(v) => v.toFixed(2)}
            error={props.errors.temperature}
          />
          <SliderField
            label="Top P"
            name="top_p"
            min={0}
            max={1}
            step={0.01}
            value={props.topP}
            onInput={(v) => props.set("top_p", String(v))}
            format={(v) => v.toFixed(2)}
            error={props.errors.top_p}
          />
        </Show>
        <Show when={props.modelId === "yue2"}>
          <SliderField
            label="ABC temperature"
            name="abc_temperature"
            min={0}
            max={2}
            step={0.05}
            value={props.abcTemperature}
            onInput={(v) => props.set("abc_temperature", String(v))}
            format={(v) => v.toFixed(2)}
            error={props.errors.abc_temperature}
          />
        </Show>
        <Show when={props.modelId === "minimax-music-3"}>
          <SliderField
            label="Top K"
            name="top_k"
            min={1}
            max={250}
            step={1}
            value={props.topK}
            onInput={(v) => props.set("top_k", String(v))}
            error={props.errors.top_k}
          />
        </Show>
      </div>
    </CollapsibleSection>
  );
}
