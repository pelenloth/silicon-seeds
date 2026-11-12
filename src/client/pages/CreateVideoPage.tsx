import { Show } from "solid-js";
import LoraSelector from "../components/LoraSelector";
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
import { labelOf, RESOLUTIONS, VIDEO_MODELS } from "../lib/defaults";

export default function CreateVideoPage(props: {
  variant: "video" | "text-to-video";
}) {
  const isVideo = () => props.variant === "video";
  const idPrefix = () => (isVideo() ? "cv" : "ctv");

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
        max: 10,
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
    labels: {
      prompt: "Prompt",
      style_guide: "Style guide",
      video_model: "Model",
      resolution: "Resolution",
      clip_duration: "Duration",
      fps: "FPS",
      style_preset: "Style preset",
      loras: "LoRAs",
    },
    beforeSubmit: (fd) => {
      if (!isVideo()) {
        fd.delete("style_preset");
        fd.delete("loras");
      }
    },
  });

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
                  max={10}
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
          <Show when={isVideo()}>
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
            onReset={f.reset}
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
