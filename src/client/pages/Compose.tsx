import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { getVideoModelSpec } from "../../shared/video-models";
import { Icons } from "../components/Icons";
import LoraSelector from "../components/LoraSelector";
import SoundPresetSelect from "../components/SoundPresetSelect";
import StylePresetSelect from "../components/StylePresetSelect";
import { useCreateForm } from "../components/create/create-form";
import { PromptField } from "../components/create/PromptField";
import { ResultPanel } from "../components/create/ResultPanel";
import { CollapsibleSection, Section } from "../components/create/Section";
import { StudioLayout } from "../components/create/StudioLayout";
import { SubmitBar } from "../components/create/SubmitBar";
import { Field } from "../components/ui/Field";
import { SelectField } from "../components/ui/SelectField";
import { SliderField } from "../components/ui/SliderField";
import { apiGet } from "../lib/api-client";
import {
  AUDIO_MODEL_OPTIONS,
  IMAGE_MODELS,
  labelOf,
  RESOLUTIONS,
  VIDEO_MODELS,
} from "../lib/defaults";

type VoiceProfile = {
  id: string;
  name: string;
  language: string;
  voiceType: string;
};

type VoiceOption = {
  value: string;
  label: string;
};

const DEFAULT_VOICE_OPTION: VoiceOption = {
  value: "preset:kokoro:af_bella",
  label: "Default (Kokoro)",
};

export default function Compose() {
  const [voiceOptions, setVoiceOptions] = createSignal<readonly VoiceOption[]>([
    DEFAULT_VOICE_OPTION,
  ]);
  const [voicesLoaded, setVoicesLoaded] = createSignal(false);
  const [fileName, setFileName] = createSignal("");
  let fileInput: HTMLInputElement | undefined;
  let formEl: HTMLFormElement | undefined;
  let disposed = false;

  const f = useCreateForm({
    kind: "compose",
    fallback: (d) => ({
      script: "",
      style_guide: "",
      voice_id: DEFAULT_VOICE_OPTION.value,
      image_model: d.image_model,
      video_model: d.video_model,
      audio_model: d.compose_audio_model,
      sound_preset: "none",
      resolution: d.resolution,
      style_preset: d.style_preset,
      clip_duration: String(d.clip_duration),
      transition_duration: String(d.transition_duration),
      fps: String(d.fps),
    }),
    required: [],
    maxLengths: [{ field: "style_guide", max: 2000, label: "Style guide" }],
    ranges: [
      {
        field: "clip_duration",
        min: 1,
        max: 15,
        integer: true,
        label: "Clip",
      },
      {
        field: "transition_duration",
        min: 1,
        max: 10,
        integer: true,
        label: "Transition",
      },
      {
        field: "fps",
        min: 1,
        max: 24,
        integer: true,
        label: "FPS",
      },
    ],
    validate: (values) => {
      const errors: Record<string, string> = {};
      const spec = getVideoModelSpec(values.video_model);
      const clip = Number(values.clip_duration);
      if (Number.isFinite(clip) && clip > spec.maxDuration) {
        errors.clip_duration = `Clip must be at most ${spec.maxDuration}s for ${spec.label}`;
      }
      const hasFile = Boolean(
        fileName() ||
        (fileInput?.files &&
          fileInput.files.length > 0 &&
          (fileInput.files[0]?.size ?? 0) > 0),
      );
      if (values.script.trim().length < 3 && !hasFile) {
        errors.script = "Write a script or upload a file";
      }
      return errors;
    },
    labels: {
      script: "Video script",
      script_file: "Script file",
      style_guide: "Style guide",
      voice_id: "Voice",
      style_preset: "Style preset",
      image_model: "Image model",
      video_model: "Video model",
      audio_model: "Audio model",
      sound_preset: "Sound preset",
      resolution: "Resolution",
      clip_duration: "Clip",
      transition_duration: "Transition",
      loras: "LoRAs",
      fps: "FPS",
    },
    beforeSubmit: (fd) => {
      const file = fd.get("script_file");
      if (
        !(file instanceof File) ||
        (file.size === 0 && file.name === "") ||
        !fileName()
      ) {
        fd.delete("script_file");
      }
    },
  });

  const displayedVoiceOptions = createMemo<readonly VoiceOption[]>(() => {
    const opts = voiceOptions();
    if (voicesLoaded()) return opts;
    const current = f.values.voice_id;
    if (!current || opts.some((o) => o.value === current)) return opts;
    return [...opts, { value: current, label: current }];
  });

  const syncVoiceSelection = (opts: readonly VoiceOption[]) => {
    const first = opts[0]?.value ?? DEFAULT_VOICE_OPTION.value;
    const current = f.values.voice_id;
    if (!current || !opts.some((o) => o.value === current)) {
      f.setUntouched("voice_id", first);
    }
  };

  const fetchVoices = async () => {
    try {
      const data = await apiGet<VoiceProfile[]>("/api/tts/profiles");
      if (disposed) return;
      const mapped: VoiceOption[] = Array.isArray(data)
        ? data
            .filter((v) => v && typeof v.id === "string" && v.id.trim())
            .map((v) => ({
              value: v.id,
              label: `${v.name} (${v.language}, ${v.voiceType})`,
            }))
        : [];
      const next = mapped.length > 0 ? mapped : [DEFAULT_VOICE_OPTION];
      setVoiceOptions(next);
      setVoicesLoaded(true);
      syncVoiceSelection(next);
    } catch {
      if (disposed) return;
      const next = [DEFAULT_VOICE_OPTION];
      setVoiceOptions(next);
      setVoicesLoaded(true);
      syncVoiceSelection(next);
    }
  };

  onMount(() => {
    void fetchVoices();
  });

  onCleanup(() => {
    disposed = true;
  });

  createEffect(() => {
    if (!voicesLoaded()) return;
    syncVoiceSelection(voiceOptions());
  });

  const clearFile = () => {
    if (fileInput) {
      fileInput.value = "";
    }
    setFileName("");
  };

  const handleReset = () => {
    clearFile();
    f.reset();
    if (voicesLoaded()) {
      syncVoiceSelection(voiceOptions());
    }
  };

  const clipDuration = () => Number(f.values.clip_duration) || 5;
  const maxClipDuration = () =>
    getVideoModelSpec(f.values.video_model).maxDuration;

  // Keep the clip length inside the selected model's range when switching
  // away from a longer-clip model.
  createEffect(
    on(
      () => f.values.video_model,
      () => {
        const max = maxClipDuration();
        if (Number(f.values.clip_duration) > max) {
          f.setUntouched("clip_duration", String(max));
        }
      },
      { defer: true },
    ),
  );
  const transitionDuration = () => Number(f.values.transition_duration) || 2;
  const fps = () => Number(f.values.fps) || 16;
  const summary = () =>
    `${clipDuration()}s clips · ${labelOf(RESOLUTIONS, f.values.resolution)} · ${labelOf(VIDEO_MODELS, f.values.video_model)}`;

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
          <PromptField
            label="Video script"
            name="script"
            id="co-script"
            rows={5}
            required
            value={f.values.script}
            onInput={(v) => f.set("script", v)}
            placeholder="Write your video script here..."
            enhanceKind="script"
            getPreset={() => f.values.style_preset}
            error={f.errors().script}
          >
            <div class="flex items-center gap-2 pb-1 text-xs">
              <label class="btn btn-ghost btn-xs gap-1">
                <Icons.Upload class="size-4" />
                Upload .txt / .md
                <input
                  type="file"
                  name="script_file"
                  accept=".txt,.md"
                  class="hidden"
                  ref={(el) => {
                    fileInput = el;
                  }}
                  onChange={(e) => {
                    const name = e.currentTarget.files?.[0]?.name ?? "";
                    setFileName(name);
                    if (name) {
                      f.clearError("script");
                    }
                  }}
                />
              </label>
              <Show when={fileName()}>
                <span class="truncate font-mono">{fileName()}</span>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs btn-square"
                  aria-label="Remove file"
                  onClick={clearFile}
                >
                  <Icons.XMark class="size-4" />
                </button>
              </Show>
            </div>
          </PromptField>
          <CollapsibleSection
            title="Style guide"
            hint="optional"
            open={
              f.values.style_guide.length > 0 || Boolean(f.errors().style_guide)
            }
          >
            <PromptField
              bare
              label="Style guide"
              name="style_guide"
              id="co-style"
              rows={4}
              maxLength={2000}
              value={f.values.style_guide}
              onInput={(v) => f.set("style_guide", v)}
              placeholder="Palette, medium, things to avoid"
              enhanceKind="style_guide"
              getPreset={() => f.values.style_preset}
              error={f.errors().style_guide}
            />
          </CollapsibleSection>
          <Section title="Settings">
            <div class="grid grid-cols-2 gap-2.5">
              <SelectField
                label="Voice"
                name="voice_id"
                value={f.values.voice_id}
                onChange={(v) => f.set("voice_id", v)}
                options={displayedVoiceOptions()}
                error={f.errors().voice_id}
              />
              <Field
                label="Style preset"
                for="co-preset"
                error={f.errors().style_preset}
              >
                <StylePresetSelect
                  id="co-preset"
                  name="style_preset"
                  class="select select-sm w-full"
                  value={f.values.style_preset}
                  onChange={(v) => f.set("style_preset", v)}
                />
              </Field>
              <SelectField
                label="Image model"
                name="image_model"
                value={f.values.image_model}
                onChange={(v) => f.set("image_model", v)}
                options={IMAGE_MODELS}
                error={f.errors().image_model}
              />
              <SelectField
                label="Video model"
                name="video_model"
                value={f.values.video_model}
                onChange={(v) => f.set("video_model", v)}
                options={VIDEO_MODELS}
                error={f.errors().video_model}
              />
              <Show when={f.values.video_model === "minimax-h3"}>
                <div class="col-span-2">
                  <span class="badge badge-info badge-sm h-auto py-0.5">
                    MiniMax H3 generates native 24 fps stereo audio per clip
                  </span>
                </div>
              </Show>
              <SelectField
                label="Audio model"
                name="audio_model"
                value={f.values.audio_model}
                onChange={(v) => {
                  f.set("audio_model", v);
                  f.set("sound_preset", "none");
                }}
                options={AUDIO_MODEL_OPTIONS}
                error={f.errors().audio_model}
              />
              <Field
                label="Sound preset"
                for="co-sound-preset"
                error={f.errors().sound_preset}
              >
                <SoundPresetSelect
                  id="co-sound-preset"
                  name="sound_preset"
                  class="select select-sm w-full"
                  audioModel={f.values.audio_model}
                  value={f.values.sound_preset}
                  onChange={(v) => f.set("sound_preset", v)}
                />
              </Field>
              <div class="col-span-2">
                <SelectField
                  label="Resolution"
                  name="resolution"
                  value={f.values.resolution}
                  onChange={(v) => f.set("resolution", v)}
                  options={RESOLUTIONS}
                  error={f.errors().resolution}
                />
              </div>
              <SliderField
                label="Clip"
                name="clip_duration"
                min={1}
                max={maxClipDuration()}
                value={clipDuration()}
                onInput={(v) => f.set("clip_duration", String(v))}
                format={(v) => `${v}s`}
                error={f.errors().clip_duration}
              />
              <SliderField
                label="Transition"
                name="transition_duration"
                min={1}
                max={10}
                value={transitionDuration()}
                onInput={(v) => f.set("transition_duration", String(v))}
                format={(v) => `${v}s`}
                error={f.errors().transition_duration}
              />
            </div>
          </Section>
          <CollapsibleSection
            title="LoRAs"
            count={f.loras().length}
            open={Boolean(f.errors().loras)}
          >
            <LoraSelector
              value={f.loras()}
              onChange={f.setLoras}
              error={f.errors().loras}
            />
          </CollapsibleSection>
          <CollapsibleSection title="Advanced" open={Boolean(f.errors().fps)}>
            <SliderField
              label="FPS"
              name="fps"
              min={1}
              max={24}
              value={fps()}
              onInput={(v) => f.set("fps", String(v))}
              format={(v) => `${v} fps`}
              error={f.errors().fps}
            />
          </CollapsibleSection>
          <SubmitBar
            label="Generate Video"
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
          kind="compose"
          emptyTitle="Your video appears here"
          emptyHint="Write a script and press Generate Video. Scenes, clips and narration are produced step by step."
          pending={f.submitting()}
          onGenerateAgain={() => formEl?.requestSubmit()}
        />
      }
    />
  );
}
