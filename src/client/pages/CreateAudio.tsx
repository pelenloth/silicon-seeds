import { createMemo, createSignal, For, Show } from "solid-js";
import {
  AUDIO_MODELS,
  clampAudioDuration,
  getAudioModel,
  MINIMAX_CAPTION_SCAFFOLD,
  normalizeAudioModelId,
  SECTION_TAG_PILLS,
  YUE2_SAMPLE_REFERENCE_FILENAME,
  type AudioModelId,
} from "../../shared/audio-models";
import SoundPresetSelect, {
  type ClientSoundPreset,
} from "../components/SoundPresetSelect";
import {
  AUDIO_PRESET_SETTING_KEYS,
  AudioAdvancedSection,
  AudioModelFramingSection,
  AudioModelTipsDrawer,
  AudioTimingSection,
  Yue2ReferenceAudioPanel,
} from "../components/create/AudioModelPanels";
import { useCreateForm } from "../components/create/create-form";
import { PromptField } from "../components/create/PromptField";
import { ResultPanel } from "../components/create/ResultPanel";
import { StudioLayout } from "../components/create/StudioLayout";
import { SubmitBar } from "../components/create/SubmitBar";
import { Field } from "../components/ui/Field";
import { SelectField } from "../components/ui/SelectField";
import { AUDIO_DEFAULTS } from "../lib/create-job";
import { AUDIO_MODEL_OPTIONS } from "../lib/defaults";

export default function CreateAudio() {
  const [refFileName, setRefFileName] = createSignal("");
  let refFileInput: HTMLInputElement | undefined;
  let formEl: HTMLFormElement | undefined;

  const f = useCreateForm({
    kind: "audio",
    fallback: (d) => ({
      ...AUDIO_DEFAULTS,
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
      ...AUDIO_MODELS[d.audio_model].defaultSettings,
      audio_model: d.audio_model,
    }),
    required: [
      { field: "instrumental_prompt", message: "Describe the music first" },
    ],
    ranges: [
      { field: "duration", min: 5, max: 720, integer: true, label: "Duration" },
      { field: "bpm", min: 40, max: 240, integer: true, label: "BPM" },
      { field: "cfg_scale", min: 0, max: 15, label: "CFG scale" },
      { field: "temperature", min: 0, max: 2, label: "Temperature" },
      { field: "top_p", min: 0, max: 1, label: "Top P" },
      { field: "top_k", min: 1, max: 500, integer: true, label: "Top K" },
      { field: "steps", min: 1, max: 100, integer: true, label: "Steps" },
      { field: "abc_temperature", min: 0, max: 2, label: "ABC temperature" },
    ],
    validate: (values) => {
      const spec = getAudioModel(values.audio_model);
      const rawDur = values.duration.trim();
      if (!rawDur) return undefined;
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
        refFile.size === 0 ||
        modelId() !== "yue2"
      ) {
        fd.delete("reference_audio");
      }
      const sampleVal = fd.get("reference_audio_sample");
      if (
        modelId() !== "yue2" ||
        typeof sampleVal !== "string" ||
        !sampleVal.trim()
      ) {
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
    if (refFileInput) refFileInput.value = "";
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
      if (k !== "duration" && Object.hasOwn(f.values, k)) {
        f.set(k as keyof typeof f.values, v);
      }
    }
    if (nextId !== "yue2") clearReferenceAudio();
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
    for (const key of AUDIO_PRESET_SETTING_KEYS) {
      const val = s[key];
      if (val !== undefined && val !== null) f.set(key, String(val));
    }
    if (
      typeof s.reference_audio_sample === "string" &&
      s.reference_audio_sample
    ) {
      if (refFileInput) refFileInput.value = "";
      setRefFileName("");
    }
  };

  const insertSectionTag = (tag: string) => {
    const cur = f.values.lyric_prompt;
    const prefix = cur.trim().length > 0 ? `${cur.trimEnd()}\n\n` : "";
    f.set("lyric_prompt", `${prefix}${tag}\n`);
  };

  const numOrDefault = (raw: string, fallbackKey: string, fallback: number) => {
    const n = Number(raw);
    return Number.isFinite(n)
      ? n
      : Number(modelSpec().defaultSettings[fallbackKey] ?? fallback);
  };

  const duration = () =>
    clampAudioDuration(
      modelId(),
      Number(f.values.duration) || modelSpec().defaultDuration,
    );
  const bpm = () => Number(f.values.bpm) || 72;

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
            <AudioModelTipsDrawer spec={modelSpec()} />
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
            <Yue2ReferenceAudioPanel
              refFileName={refFileName()}
              sampleValue={f.values.reference_audio_sample}
              error={f.errors().reference_audio}
              onFileInputRef={(el) => {
                refFileInput = el;
              }}
              onFileChange={(name) => {
                setRefFileName(name);
                if (name) {
                  f.set("reference_audio_sample", "");
                  f.set("yue2_mode", "melody");
                }
              }}
              onToggleSample={() => {
                if (
                  f.values.reference_audio_sample ===
                  YUE2_SAMPLE_REFERENCE_FILENAME
                ) {
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
              onClear={clearReferenceAudio}
            />
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

          <AudioTimingSection
            modelId={modelId()}
            spec={modelSpec()}
            duration={duration()}
            bpm={bpm()}
            yue2Mode={f.values.yue2_mode}
            minimaxPrecision={f.values.minimax_precision}
            sa3AudioType={f.values.sa3_audio_type}
            errors={f.errors()}
            set={f.set}
          />

          <AudioModelFramingSection
            modelId={modelId()}
            values={f.values}
            errors={f.errors()}
            set={f.set}
          />

          <AudioAdvancedSection
            modelId={modelId()}
            cfgScale={numOrDefault(f.values.cfg_scale, "cfg_scale", 2)}
            steps={numOrDefault(f.values.steps, "steps", 32)}
            temperature={numOrDefault(
              f.values.temperature,
              "temperature",
              0.85,
            )}
            topP={numOrDefault(f.values.top_p, "top_p", 0.9)}
            abcTemperature={numOrDefault(
              f.values.abc_temperature,
              "abc_temperature",
              0.7,
            )}
            topK={numOrDefault(f.values.top_k, "top_k", 50)}
            errors={f.errors()}
            set={f.set}
          />

          <SubmitBar
            label="Generate"
            summary={summary()}
            submitting={f.submitting()}
            formError={f.formError()}
            onReset={() => {
              clearReferenceAudio();
              f.reset();
            }}
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
