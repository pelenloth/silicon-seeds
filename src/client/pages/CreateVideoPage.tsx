import { createEffect, createSignal, on, Show } from "solid-js";
import {
  computeVideoFrameLength,
  getVideoModelSpec,
  type KeyframeGuideSpec,
} from "../../shared/video-models";
import LoraSelector from "../components/LoraSelector";
import StylePresetSelect from "../components/StylePresetSelect";
import { useCreateForm } from "../components/create/create-form";
import { MiniMaxH3Panels } from "../components/create/MiniMaxH3Panels";
import { PromptField } from "../components/create/PromptField";
import { ResultPanel } from "../components/create/ResultPanel";
import { CollapsibleSection, Section } from "../components/create/Section";
import { StudioLayout } from "../components/create/StudioLayout";
import { SubmitBar } from "../components/create/SubmitBar";
import { Field } from "../components/ui/Field";
import { SelectField } from "../components/ui/SelectField";
import { SliderField } from "../components/ui/SliderField";
import { labelOf, RESOLUTIONS, VIDEO_MODELS } from "../lib/defaults";

// FormData keys that only the MiniMax H3 backend understands. Stripped for
// other video models so their payloads stay byte-identical.
const H3_ONLY_KEYS = [
  "h3_mode",
  "h3_variant",
  "ref_image_size",
  "soundscape",
  "music",
  "style_embedding",
  "sequence_mode",
  "sequence_prompts",
  "keyframe_guides",
  "first_frame",
  "last_frame",
  "reference_images",
] as const;

export default function CreateVideoPage(props: {
  variant: "video" | "text-to-video";
}) {
  const isVideo = () => props.variant === "video";
  const idPrefix = () => (isVideo() ? "cv" : "ctv");

  const [firstFrameFile, setFirstFrameFile] = createSignal<File | null>(null);
  const [lastFrameFile, setLastFrameFile] = createSignal<File | null>(null);
  const [referenceFiles, setReferenceFiles] = createSignal<File[]>([]);
  const [keyframeGuides, setKeyframeGuides] = createSignal<KeyframeGuideSpec[]>(
    [],
  );
  const [sequencePrompts, setSequencePrompts] = createSignal<string[]>([]);

  const f = useCreateForm({
    kind: props.variant,
    fallback: (d) => {
      const base: Record<string, string> = {
        prompt: "",
        style_guide: "",
        video_model: d.video_model,
        resolution: d.resolution,
        clip_duration: String(d.clip_duration),
        fps: String(d.fps),
        h3_mode: "t2v",
        h3_variant: "turbo_8",
        ref_image_size: "match",
        soundscape: "",
        music: "",
        style_embedding: "",
        sequence_mode: "single",
      };
      if (isVideo()) {
        base.style_preset = d.style_preset;
      }
      return base;
    },
    required: [{ field: "prompt", message: "Prompt is required" }],
    maxLengths: [{ field: "style_guide", max: 2000, label: "Style guide" }],
    ranges: [
      {
        field: "clip_duration",
        min: 1,
        max: 15,
        integer: true,
        label: "Duration",
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
      const duration = Number(values.clip_duration);
      if (Number.isFinite(duration) && duration > spec.maxDuration) {
        errors.clip_duration = `Duration must be at most ${spec.maxDuration}s for ${spec.label}`;
      }
      if (values.video_model !== "minimax-h3") return errors;
      const mode = values.h3_mode || "t2v";
      if ((mode === "i2v" || mode === "fl2v") && !firstFrameFile()) {
        errors.first_frame = "First frame image is required";
      }
      if (mode === "fl2v" && !lastFrameFile()) {
        errors.last_frame = "Last frame image is required";
      }
      if (mode === "multiframe" && referenceFiles().length < 1) {
        errors.reference_images = "Add at least 1 reference picture";
      }
      if (
        (values.sequence_mode || "single") !== "single" &&
        sequencePrompts().filter((p) => p.trim().length > 0).length < 2
      ) {
        errors.sequence_prompts = "Sequences need at least 2 clip prompts";
      }
      return errors;
    },
    labels: {
      prompt: "Prompt",
      style_guide: "Style guide",
      video_model: "Model",
      resolution: "Resolution",
      clip_duration: "Duration",
      fps: "FPS",
      style_preset: "Style preset",
      loras: "LoRAs",
      h3_mode: "Generation mode",
      h3_variant: "Quality / speed variant",
      ref_image_size: "Reference image sizing",
      soundscape: "Soundscape",
      music: "Music",
      style_embedding: "Style embedding",
      sequence_mode: "Sequence mode",
      sequence_prompts: "Clip prompts",
      first_frame: "First frame",
      last_frame: "Last frame",
      reference_images: "Reference pictures",
    },
    beforeSubmit: (fd) => {
      if (!isVideo()) {
        fd.delete("style_preset");
        fd.delete("loras");
      }
      if (!isMiniMaxH3()) {
        for (const key of H3_ONLY_KEYS) fd.delete(key);
        return;
      }
      fd.delete("loras");
      const mode = f.values.h3_mode || "t2v";
      const first = firstFrameFile();
      const last = lastFrameFile();
      if (first && (mode === "i2v" || mode === "fl2v")) {
        fd.set("first_frame", first);
      }
      if (last && mode === "fl2v") fd.set("last_frame", last);
      if (mode === "multiframe") {
        fd.delete("reference_images");
        for (const file of referenceFiles()) {
          fd.append("reference_images", file);
        }
        const guides = keyframeGuides().filter(
          (g) => g.refIndex < referenceFiles().length,
        );
        if (guides.length > 0) {
          fd.set("keyframe_guides", JSON.stringify(guides));
        }
      }
      if ((f.values.sequence_mode || "single") !== "single") {
        fd.set(
          "sequence_prompts",
          JSON.stringify(
            sequencePrompts()
              .map((p) => p.trim())
              .filter((p) => p.length > 0),
          ),
        );
      }
    },
  });

  const isMiniMaxH3 = () => f.values.video_model === "minimax-h3";
  const modelSpec = () => getVideoModelSpec(f.values.video_model);
  const maxDuration = () => modelSpec().maxDuration;

  // Keep the duration inside the selected model's range when switching away
  // from a longer-clip model.
  createEffect(
    on(
      () => f.values.video_model,
      () => {
        const max = maxDuration();
        if (Number(f.values.clip_duration) > max) {
          f.setUntouched("clip_duration", String(max));
        }
      },
      { defer: true },
    ),
  );

  // MiniMax H3 always renders at its native 24 fps; keep the submitted fps in
  // sync so compositions and the UI agree.
  createEffect(
    on(
      () => f.values.video_model,
      (model) => {
        if (model !== "minimax-h3") return;
        const nativeFps = String(getVideoModelSpec(model).nativeFps);
        if (f.values.fps !== nativeFps) {
          f.setUntouched("fps", nativeFps);
        }
      },
    ),
  );

  const resetAll = () => {
    f.reset();
    setFirstFrameFile(null);
    setLastFrameFile(null);
    setReferenceFiles([]);
    setKeyframeGuides([]);
    setSequencePrompts([]);
  };

  const insertPromptToken = (token: string) => {
    const current = f.values.prompt;
    const sep = current.length === 0 || /\s$/.test(current) ? "" : " ";
    f.set("prompt", `${current}${sep}${token}`);
  };

  let formEl: HTMLFormElement | undefined;
  const clipDuration = () => Number(f.values.clip_duration) || 5;
  const fps = () => Number(f.values.fps) || 16;
  const summary = () =>
    `${clipDuration()}s · ${labelOf(RESOLUTIONS, f.values.resolution)} · ${labelOf(VIDEO_MODELS, f.values.video_model)}`;

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
            label="Prompt"
            name="prompt"
            id="video-prompt"
            rows={7}
            required
            value={f.values.prompt}
            onInput={(v) => f.set("prompt", v)}
            placeholder="Describe the video: subject, motion, camera"
            enhanceKind="video_prompt"
            getPreset={isVideo() ? () => f.values.style_preset : undefined}
            error={f.errors().prompt}
          />
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
              id="style-guide"
              rows={4}
              maxLength={2000}
              value={f.values.style_guide}
              onInput={(v) => f.set("style_guide", v)}
              placeholder="Palette, medium, things to avoid"
              enhanceKind="style_guide"
              getPreset={isVideo() ? () => f.values.style_preset : undefined}
              error={f.errors().style_guide}
            />
          </CollapsibleSection>
          <Section title="Settings">
            <div class="grid gap-3 sm:grid-cols-2">
              <SelectField
                label="Model"
                name="video_model"
                value={f.values.video_model}
                onChange={(v) => f.set("video_model", v)}
                options={VIDEO_MODELS}
                error={f.errors().video_model}
              />
              <SelectField
                label="Resolution"
                name="resolution"
                value={f.values.resolution}
                onChange={(v) => f.set("resolution", v)}
                options={RESOLUTIONS}
                error={f.errors().resolution}
              />
              <div class="sm:col-span-2">
                <SliderField
                  label="Duration"
                  name="clip_duration"
                  min={1}
                  max={maxDuration()}
                  value={clipDuration()}
                  onInput={(v) => f.set("clip_duration", String(v))}
                  format={(v) => `${v}s`}
                  error={f.errors().clip_duration}
                />
              </div>
              <Show when={isVideo()}>
                <div class="sm:col-span-2">
                  <Field
                    label="Style preset"
                    for={`${idPrefix()}-preset`}
                    error={f.errors().style_preset}
                  >
                    <StylePresetSelect
                      id={`${idPrefix()}-preset`}
                      name="style_preset"
                      class="select select-sm w-full"
                      value={f.values.style_preset}
                      onChange={(v) => f.set("style_preset", v)}
                    />
                  </Field>
                </div>
              </Show>
            </div>
          </Section>
          <Show when={isMiniMaxH3()}>
            <MiniMaxH3Panels
              values={f.values}
              set={(field, value) => f.set(field, value)}
              errors={f.errors()}
              maxFrames={computeVideoFrameLength(
                f.values.video_model,
                clipDuration(),
              )}
              onInsertPromptToken={insertPromptToken}
              firstFrameFile={firstFrameFile()}
              setFirstFrameFile={setFirstFrameFile}
              lastFrameFile={lastFrameFile()}
              setLastFrameFile={setLastFrameFile}
              referenceFiles={referenceFiles()}
              setReferenceFiles={setReferenceFiles}
              keyframeGuides={keyframeGuides()}
              setKeyframeGuides={setKeyframeGuides}
              sequencePrompts={sequencePrompts()}
              setSequencePrompts={setSequencePrompts}
            />
          </Show>
          <Show when={isVideo() && modelSpec().supportsLoRAs}>
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
          </Show>
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
            onReset={resetAll}
          />
        </>
      }
      result={
        <ResultPanel
          jobId={f.jobId()}
          kind={props.variant}
          emptyTitle="Your video appears here"
          emptyHint="Describe a clip and press Generate Video."
          pending={f.submitting()}
          onGenerateAgain={() => formEl?.requestSubmit()}
        />
      }
    />
  );
}
