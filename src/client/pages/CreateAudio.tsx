import { createMemo, createSignal, For, Show } from "solid-js";
import {
  AUDIO_MODELS,
  clampAudioDuration,
  getAudioModel,
  listAudioModels,
  MINIMAX_CAPTION_SCAFFOLD,
  normalizeAudioModelId,
  SECTION_TAG_PILLS,
  YUE2_SAMPLE_REFERENCE_FILENAME,
  type AudioModelId,
} from "../../shared/audio-models";
import { Icons } from "../components/Icons";
import SoundPresetSelect, {
  type ClientSoundPreset,
} from "../components/SoundPresetSelect";
import { useCreateForm } from "../components/create/create-form";
import { PromptField } from "../components/create/PromptField";
import { ResultPanel } from "../components/create/ResultPanel";
import { CollapsibleSection, Section } from "../components/create/Section";
import { StudioLayout } from "../components/create/StudioLayout";
import { SubmitBar } from "../components/create/SubmitBar";
import { Field } from "../components/ui/Field";
import { Segmented } from "../components/ui/Segmented";
import { SelectField } from "../components/ui/SelectField";
import { SliderField } from "../components/ui/SliderField";
import { AUDIO_DEFAULTS } from "../lib/create-job";
import { AUDIO_MODEL_OPTIONS } from "../lib/defaults";

const KEYSCALE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "C major", label: "C major" },
  { value: "A minor", label: "A minor" },
  { value: "D minor", label: "D minor" },
  { value: "E minor", label: "E minor" },
  { value: "G major", label: "G major" },
  { value: "B minor", label: "B minor" },
  { value: "F# minor", label: "F# minor" },
] as const;

const TIMESIGNATURE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "2", label: "2/4" },
  { value: "3", label: "3/4" },
  { value: "4", label: "4/4" },
  { value: "6", label: "6/8" },
] as const;

const YUE2_MODE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "full", label: "Full Song" },
  { value: "melody", label: "Melody Cover" },
] as const;

const ABC_PLANNING_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "true", label: "Enabled (ABC Score)" },
  { value: "false", label: "Disabled" },
] as const;

const MINIMAX_PRECISION_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "int8", label: "INT8 (~18 GB)" },
  { value: "fp16", label: "FP16 (~28 GB)" },
] as const;

const TILED_DECODE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "true", label: "Enabled" },
  { value: "false", label: "Disabled" },
] as const;

const SA3_VARIANT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "medium", label: "Medium (8-step)" },
  { value: "medium_base", label: "Medium Base (50-step)" },
] as const;

const SA3_AUDIO_TYPE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "Music", label: "Music" },
  { value: "Instrument", label: "Instrument" },
  { value: "SFX", label: "SFX" },
  { value: "One-shot", label: "One-shot" },
] as const;

const USE_REPROMPT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "false", label: "Off" },
  { value: "true", label: "On (Qwen3.5)" },
] as const;

const ALL_AUDIO_MODELS = listAudioModels();

export default function CreateAudio() {
  const [refFileName, setRefFileName] = createSignal("");
  let refFileInput: HTMLInputElement | undefined;
  let formEl: HTMLFormElement | undefined;

  const f = useCreateForm({
    kind: "audio",
    fallback: (d) => ({
      ...AUDIO_DEFAULTS,
      audio_model: d.audio_model,
      sound_preset: "none",
      instrumental_prompt: "",
      lyric_prompt: "",
      steps: "50",
      top_k: "50",
      yue2_mode: "full",
      abc_planning: "true",
      abc_temperature: "0.7",
      abc_top_p: "0.9",
      minimax_precision: "int8",
      tiled_decode: "true",
      sa3_variant: "medium",
      sa3_audio_type: "Music",
      use_reprompt: "false",
      reference_audio_sample: "",
    }),
    required: [
      { field: "instrumental_prompt", message: "Describe the music first" },
    ],
    ranges: [
      {
        field: "duration",
        min: 5,
        max: 720,
        integer: true,
        label: "Duration",
      },
      {
        field: "bpm",
        min: 40,
        max: 240,
        integer: true,
        label: "BPM",
      },
      {
        field: "cfg_scale",
        min: 0,
        max: 15,
        label: "CFG scale",
      },
      {
        field: "temperature",
        min: 0,
        max: 2,
        label: "Temperature",
      },
      {
        field: "top_p",
        min: 0,
        max: 1,
        label: "Top P",
      },
      {
        field: "top_k",
        min: 1,
        max: 500,
        integer: true,
        label: "Top K",
      },
      {
        field: "steps",
        min: 1,
        max: 100,
        integer: true,
        label: "Steps",
      },
      {
        field: "abc_temperature",
        min: 0,
        max: 2,
        label: "ABC temperature",
      },
    ],
    validate: (values) => {
      const spec = getAudioModel(values.audio_model);
      const rawDur = values.duration.trim();
      if (rawDur) {
        const dur = Number(rawDur);
        if (
          !Number.isInteger(dur) ||
          dur < spec.minDuration ||
          dur > spec.maxDuration
        ) {
          return {
            duration: `Duration must be between ${spec.minDuration} and ${spec.maxDuration}`,
          };
        }
      }
      return undefined;
    },
    labels: {
      audio_model: "Audio model",
      sound_preset: "Sound preset",
      instrumental_prompt: "Style",
      lyric_prompt: "Lyrics",
      duration: "Duration",
      bpm: "BPM",
      keyscale: "Key / Scale",
      timesignature: "Time signature",
      yue2_mode: "Generation mode",
      abc_planning: "ABC Score planning",
      abc_temperature: "ABC temperature",
      minimax_precision: "Precision",
      tiled_decode: "Tiled VAE decode",
      sa3_variant: "Checkpoint variant",
      sa3_audio_type: "Audio category",
      use_reprompt: "Qwen3.5 Reprompting",
      reference_audio: "Reference audio",
      reference_audio_sample: "Sample melody",
      cfg_scale: "CFG scale",
      temperature: "Temperature",
      top_p: "Top P",
      top_k: "Top K",
      steps: "Steps",
    },
    beforeSubmit: (fd) => {
      const refFile = fd.get("reference_audio");
      if (
        !(refFile instanceof File) ||
        (refFile.size === 0 && refFile.name === "") ||
        !refFileName()
      ) {
        fd.delete("reference_audio");
      }
      const sampleVal = fd.get("reference_audio_sample");
      if (typeof sampleVal === "string" && !sampleVal.trim()) {
        fd.delete("reference_audio_sample");
      }
      if (!AUDIO_MODELS[modelId()].supportsLyrics && !fd.has("lyric_prompt")) {
        fd.set("lyric_prompt", "");
      }
    },
  });

  const modelId = createMemo<AudioModelId>(() =>
    normalizeAudioModelId(f.values.audio_model, "ace-step-1.5"),
  );
  const modelSpec = createMemo(() => AUDIO_MODELS[modelId()]);

  const clearReferenceAudio = () => {
    if (refFileInput) {
      refFileInput.value = "";
    }
    setRefFileName("");
    f.set("reference_audio_sample", "");
  };

  const handleModelChange = (nextRaw: string) => {
    const nextId = normalizeAudioModelId(nextRaw, "ace-step-1.5");
    const spec = AUDIO_MODELS[nextId];
    f.set("audio_model", nextId);
    f.set("sound_preset", "none");
    const curDur = Number(f.values.duration);
    const nextDur = Number.isFinite(curDur)
      ? clampAudioDuration(nextId, curDur)
      : spec.defaultDuration;
    f.set("duration", String(nextDur));
    for (const [k, v] of Object.entries(spec.defaultSettings)) {
      if (k === "duration") continue;
      if (Object.hasOwn(f.values, k)) {
        f.set(k as keyof typeof f.values, v);
      }
    }
    if (nextId !== "yue2") {
      clearReferenceAudio();
    }
  };

  const applySoundPreset = (
    name: string,
    preset: ClientSoundPreset | undefined,
  ) => {
    f.set("sound_preset", name);
    if (!preset || name === "none") return;

    if (preset.audio_model && preset.audio_model !== modelId()) {
      f.set("audio_model", preset.audio_model);
    }
    const spec = AUDIO_MODELS[preset.audio_model ?? modelId()];
    if (preset.instrumental_prompt) {
      f.set("instrumental_prompt", preset.instrumental_prompt);
    }
    if (spec.supportsLyrics && typeof preset.lyric_prompt === "string") {
      f.set("lyric_prompt", preset.lyric_prompt);
    }

    const s = preset.settings ?? {};
    const settingKeys = [
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

    for (const key of settingKeys) {
      const val = s[key];
      if (val !== undefined && val !== null) {
        f.set(key, String(val));
      }
    }
    if (typeof s.reference_audio_sample === "string" && s.reference_audio_sample) {
      if (refFileInput) refFileInput.value = "";
      setRefFileName("");
    }
  };

  const insertSectionTag = (tag: string) => {
    const cur = f.values.lyric_prompt;
    const prefix = cur.trim().length > 0 ? `${cur.trimEnd()}\n\n` : "";
    f.set("lyric_prompt", `${prefix}${tag}\n`);
  };

  const handleReset = () => {
    clearReferenceAudio();
    f.reset();
  };

  const duration = () =>
    clampAudioDuration(
      modelId(),
      Number(f.values.duration) || modelSpec().defaultDuration,
    );
  const bpm = () => Number(f.values.bpm) || 72;
  const cfgScale = () => {
    const n = Number(f.values.cfg_scale);
    return Number.isFinite(n)
      ? n
      : Number(modelSpec().defaultSettings.cfg_scale ?? 2);
  };
  const temperature = () => {
    const n = Number(f.values.temperature);
    return Number.isFinite(n)
      ? n
      : Number(modelSpec().defaultSettings.temperature ?? 0.85);
  };
  const topP = () => {
    const n = Number(f.values.top_p);
    return Number.isFinite(n)
      ? n
      : Number(modelSpec().defaultSettings.top_p ?? 0.9);
  };
  const topK = () => {
    const n = Number(f.values.top_k);
    return Number.isFinite(n)
      ? n
      : Number(modelSpec().defaultSettings.top_k ?? 50);
  };
  const steps = () => {
    const n = Number(f.values.steps);
    return Number.isFinite(n)
      ? n
      : Number(modelSpec().defaultSettings.steps ?? 32);
  };
  const abcTemperature = () => {
    const n = Number(f.values.abc_temperature);
    return Number.isFinite(n) ? n : 0.7;
  };

  const summary = () => {
    const id = modelId();
    if (id === "ace-step-1.5") {
      return `${duration()}s · ${bpm()} BPM · ${f.values.keyscale}`;
    }
    if (id === "yue2") {
      const modeLabel =
        f.values.yue2_mode === "melody" ? "Melody Cover" : "Full Song";
      return `${modelSpec().label} · ${duration()}s · ${modeLabel}`;
    }
    if (id === "minimax-music-3") {
      return `${modelSpec().label} · ${duration()}s · ${f.values.minimax_precision.toUpperCase()}`;
    }
    return `${modelSpec().label} · ${duration()}s · ${f.values.sa3_audio_type}`;
  };

  return (
    <StudioLayout
      formRef={(el) => {
        formEl = el;
      }}
      onSubmit={(form) => {
        formEl = form;
        void f.submit(form);
      }}
      form={
        <>
          <section class="panel p-3">
            <div class="grid grid-cols-2 gap-3">
              <SelectField
                label="Audio model"
                name="audio_model"
                id="ca-model"
                value={modelId()}
                onChange={handleModelChange}
                options={AUDIO_MODEL_OPTIONS}
                error={f.errors().audio_model}
              />
              <Field
                label="Sound preset"
                for="ca-sound-preset"
                error={f.errors().sound_preset}
              >
                <SoundPresetSelect
                  id="ca-sound-preset"
                  name="sound_preset"
                  class="select select-sm w-full"
                  audioModel={modelId()}
                  value={f.values.sound_preset}
                  onChange={applySoundPreset}
                />
              </Field>
            </div>
            <div class="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="badge badge-primary badge-xs">
                  {modelSpec().badge}
                </span>
                <span class="badge badge-ghost badge-xs">
                  {modelSpec().vramHint}
                </span>
              </div>
              <details class="group">
                <summary class="cursor-pointer list-none font-medium text-primary hover:underline">
                  Prompting &amp; structure tips
                </summary>
                <div class="mt-2 rounded-box border border-base-300 bg-base-200/50 p-2.5 text-xs text-base-content/80">
                  <p class="font-medium text-base-content">
                    {modelSpec().recommendation}
                  </p>
                  <ul class="mt-1.5 list-disc space-y-1 pl-4">
                    <For each={modelSpec().tips}>{(tip) => <li>{tip}</li>}</For>
                  </ul>
                  <div class="mt-2 border-t border-base-300 pt-2">
                    <p class="mb-1 font-semibold text-base-content">
                      Model quick comparison
                    </p>
                    <div class="grid grid-cols-2 gap-1.5">
                      <For each={ALL_AUDIO_MODELS}>
                        {(m) => (
                          <div class="rounded border border-base-300 bg-base-100/70 px-2 py-1">
                            <div class="font-semibold text-base-content">
                              {m.label}
                            </div>
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
          </section>

          <PromptField
            label={modelSpec().promptLabel}
            name="instrumental_prompt"
            id="ca-inst"
            rows={3}
            required
            value={f.values.instrumental_prompt}
            onInput={(v) => f.set("instrumental_prompt", v)}
            placeholder={modelSpec().promptPlaceholder}
            hint={modelSpec().promptHint}
            enhanceKind="instrumental"
            error={f.errors().instrumental_prompt}
          >
            <Show when={modelId() === "minimax-music-3"}>
              <div class="flex items-center gap-2 pb-1 text-xs">
                <button
                  type="button"
                  class="btn btn-ghost btn-xs"
                  onClick={() =>
                    f.set("instrumental_prompt", MINIMAX_CAPTION_SCAFFOLD)
                  }
                >
                  Insert 3-part scaffold
                </button>
              </div>
            </Show>
          </PromptField>

          <Show when={modelId() === "yue2"}>
            <section class="panel p-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 class="text-xs font-semibold">
                    Reference Audio (Melody Cover)
                  </h2>
                  <p class="text-xs text-base-content/60">
                    Optional SheetSage2 melody conditioning (.flac, .mp3, .wav,
                    .ogg, .m4a)
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
                      ref={(el) => {
                        refFileInput = el;
                      }}
                      onChange={(e) => {
                        const name = e.currentTarget.files?.[0]?.name ?? "";
                        setRefFileName(name);
                        if (name) {
                          f.set("reference_audio_sample", "");
                          f.set("yue2_mode", "melody");
                        }
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    class="btn btn-xs"
                    classList={{
                      "btn-primary":
                        f.values.reference_audio_sample ===
                        YUE2_SAMPLE_REFERENCE_FILENAME,
                      "btn-ghost":
                        f.values.reference_audio_sample !==
                        YUE2_SAMPLE_REFERENCE_FILENAME,
                    }}
                    aria-pressed={
                      f.values.reference_audio_sample ===
                      YUE2_SAMPLE_REFERENCE_FILENAME
                    }
                    onClick={() => {
                      const isSample =
                        f.values.reference_audio_sample ===
                        YUE2_SAMPLE_REFERENCE_FILENAME;
                      if (isSample) {
                        f.set("reference_audio_sample", "");
                      } else {
                        if (refFileInput) refFileInput.value = "";
                        setRefFileName("");
                        f.set(
                          "reference_audio_sample",
                          YUE2_SAMPLE_REFERENCE_FILENAME,
                        );
                        f.set("yue2_mode", "melody");
                      }
                    }}
                  >
                    Use sample melody
                  </button>
                  <Show
                    when={
                      Boolean(refFileName()) ||
                      Boolean(f.values.reference_audio_sample)
                    }
                  >
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs"
                      aria-label="Clear reference audio"
                      onClick={clearReferenceAudio}
                    >
                      Clear
                    </button>
                  </Show>
                </div>
              </div>
              <Show
                when={
                  Boolean(refFileName()) ||
                  Boolean(f.values.reference_audio_sample)
                }
              >
                <p class="mt-1.5 truncate font-mono text-xs text-base-content/70">
                  Active:{" "}
                  {refFileName() || f.values.reference_audio_sample}
                </p>
              </Show>
              <Show when={f.values.reference_audio_sample}>
                <input
                  type="hidden"
                  name="reference_audio_sample"
                  value={f.values.reference_audio_sample}
                />
              </Show>
              <Show when={f.errors().reference_audio}>
                <p class="mt-1 text-xs text-error" role="alert">
                  {f.errors().reference_audio}
                </p>
              </Show>
            </section>
          </Show>

          <Show when={modelSpec().supportsLyrics}>
            <PromptField
              label="Lyrics"
              name="lyric_prompt"
              id="ca-lyrics"
              rows={3}
              value={f.values.lyric_prompt}
              onInput={(v) => f.set("lyric_prompt", v)}
              placeholder={modelSpec().lyricsPlaceholder}
              hint={modelSpec().lyricsHint}
              enhanceKind="lyrics"
              error={f.errors().lyric_prompt}
            >
              <div class="flex flex-wrap items-center gap-1 pb-1">
                <For each={SECTION_TAG_PILLS}>
                  {(tag) => (
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs font-mono text-[11px]"
                      onClick={() => insertSectionTag(tag)}
                    >
                      {tag}
                    </button>
                  )}
                </For>
              </div>
            </PromptField>
          </Show>

          <Section title="Timing">
            <div class="grid grid-cols-2 gap-3">
              <SliderField
                label="Duration"
                name="duration"
                min={modelSpec().minDuration}
                max={modelSpec().maxDuration}
                step={1}
                value={duration()}
                onInput={(v) => f.set("duration", String(v))}
                format={(v) => `${v}s`}
                error={f.errors().duration}
              />
              <Show when={modelId() === "ace-step-1.5"}>
                <SliderField
                  label="BPM"
                  name="bpm"
                  min={40}
                  max={240}
                  value={bpm()}
                  onInput={(v) => f.set("bpm", String(v))}
                  format={(v) => `${v} BPM`}
                  error={f.errors().bpm}
                />
              </Show>
              <Show when={modelId() === "yue2"}>
                <SelectField
                  label="Generation mode"
                  name="yue2_mode"
                  value={f.values.yue2_mode}
                  onChange={(v) => f.set("yue2_mode", v)}
                  options={YUE2_MODE_OPTIONS}
                  error={f.errors().yue2_mode}
                />
              </Show>
              <Show when={modelId() === "minimax-music-3"}>
                <SelectField
                  label="Precision"
                  name="minimax_precision"
                  value={f.values.minimax_precision}
                  onChange={(v) => f.set("minimax_precision", v)}
                  options={MINIMAX_PRECISION_OPTIONS}
                  error={f.errors().minimax_precision}
                />
              </Show>
              <Show when={modelId() === "stable-audio-3"}>
                <SelectField
                  label="Audio category"
                  name="sa3_audio_type"
                  value={f.values.sa3_audio_type}
                  onChange={(v) => f.set("sa3_audio_type", v)}
                  options={SA3_AUDIO_TYPE_OPTIONS}
                  error={f.errors().sa3_audio_type}
                />
              </Show>
            </div>
          </Section>

          <Show when={modelId() === "ace-step-1.5"}>
            <Section title="Musical framing">
              <div class="grid grid-cols-2 gap-3">
                <SelectField
                  label="Key / Scale"
                  name="keyscale"
                  value={f.values.keyscale}
                  onChange={(v) => f.set("keyscale", v)}
                  options={KEYSCALE_OPTIONS}
                  error={f.errors().keyscale}
                />
                <Field label="Time signature" error={f.errors().timesignature}>
                  <Segmented
                    label="Time signature"
                    name="timesignature"
                    size="xs"
                    value={f.values.timesignature}
                    onChange={(v) => f.set("timesignature", v)}
                    options={TIMESIGNATURE_OPTIONS}
                  />
                </Field>
              </div>
            </Section>
          </Show>

          <Show when={modelId() === "yue2"}>
            <Section title="Symbolic planning">
              <SelectField
                label="ABC Score planning"
                name="abc_planning"
                value={f.values.abc_planning}
                onChange={(v) => f.set("abc_planning", v)}
                options={ABC_PLANNING_OPTIONS}
                error={f.errors().abc_planning}
              />
            </Section>
          </Show>

          <Show when={modelId() === "minimax-music-3"}>
            <Section title="Decoder framing">
              <SelectField
                label="Tiled VAE decode"
                name="tiled_decode"
                value={f.values.tiled_decode}
                onChange={(v) => f.set("tiled_decode", v)}
                options={TILED_DECODE_OPTIONS}
                error={f.errors().tiled_decode}
              />
            </Section>
          </Show>

          <Show when={modelId() === "stable-audio-3"}>
            <Section title="Synthesis options">
              <div class="grid grid-cols-2 gap-3">
                <SelectField
                  label="Checkpoint variant"
                  name="sa3_variant"
                  value={f.values.sa3_variant}
                  onChange={(v) => {
                    f.set("sa3_variant", v);
                    if (v === "medium_base") {
                      f.set("steps", "50");
                      f.set("cfg_scale", "7");
                    } else {
                      f.set("steps", "8");
                      f.set("cfg_scale", "1");
                    }
                  }}
                  options={SA3_VARIANT_OPTIONS}
                  error={f.errors().sa3_variant}
                />
                <SelectField
                  label="Qwen3.5 Reprompting"
                  name="use_reprompt"
                  value={f.values.use_reprompt}
                  onChange={(v) => f.set("use_reprompt", v)}
                  options={USE_REPROMPT_OPTIONS}
                  error={f.errors().use_reprompt}
                />
              </div>
            </Section>
          </Show>

          <CollapsibleSection
            title="Advanced"
            open={Boolean(
              f.errors().cfg_scale ||
                f.errors().temperature ||
                f.errors().top_p ||
                f.errors().top_k ||
                f.errors().steps ||
                f.errors().abc_temperature,
            )}
          >
            <div class="flex flex-col gap-3">
              <SliderField
                label="CFG scale"
                name="cfg_scale"
                min={0}
                max={10}
                step={0.1}
                value={cfgScale()}
                onInput={(v) => f.set("cfg_scale", String(v))}
                error={f.errors().cfg_scale}
              />
              <SliderField
                label="Steps"
                name="steps"
                min={1}
                max={100}
                step={1}
                value={steps()}
                onInput={(v) => f.set("steps", String(v))}
                error={f.errors().steps}
              />
              <Show
                when={modelId() === "ace-step-1.5" || modelId() === "yue2"}
              >
                <SliderField
                  label="Temperature"
                  name="temperature"
                  min={0}
                  max={2}
                  step={0.05}
                  value={temperature()}
                  onInput={(v) => f.set("temperature", String(v))}
                  format={(v) => v.toFixed(2)}
                  error={f.errors().temperature}
                />
                <SliderField
                  label="Top P"
                  name="top_p"
                  min={0}
                  max={1}
                  step={0.01}
                  value={topP()}
                  onInput={(v) => f.set("top_p", String(v))}
                  format={(v) => v.toFixed(2)}
                  error={f.errors().top_p}
                />
              </Show>
              <Show when={modelId() === "yue2"}>
                <SliderField
                  label="ABC temperature"
                  name="abc_temperature"
                  min={0}
                  max={2}
                  step={0.05}
                  value={abcTemperature()}
                  onInput={(v) => f.set("abc_temperature", String(v))}
                  format={(v) => v.toFixed(2)}
                  error={f.errors().abc_temperature}
                />
              </Show>
              <Show when={modelId() === "minimax-music-3"}>
                <SliderField
                  label="Top K"
                  name="top_k"
                  min={1}
                  max={250}
                  step={1}
                  value={topK()}
                  onInput={(v) => f.set("top_k", String(v))}
                  error={f.errors().top_k}
                />
              </Show>
            </div>
          </CollapsibleSection>

          <SubmitBar
            label="Generate"
            summary={summary()}
            submitting={f.submitting()}
            formError={f.formError()}
            onReset={handleReset}
          />
        </>
      }
      result={
        <ResultPanel
          jobId={f.jobId()}
          kind="audio"
          emptyTitle="Your track appears here"
          emptyHint="Describe the music and press Generate."
          pending={f.submitting()}
          onGenerateAgain={() => formEl?.requestSubmit()}
        />
      }
    />
  );
}
