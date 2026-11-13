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
import { IMAGE_MODELS, labelOf, RESOLUTIONS } from "../lib/defaults";
import { plural } from "../lib/job-view";

export default function CreateImage() {
  const f = useCreateForm({
    kind: "image",
    fallback: (d) => ({
      prompt: "",
      style_guide: "",
      style_preset: d.style_preset,
      resolution: d.resolution,
      batch_size: "1",
      image_model: d.image_model,
    }),
    required: [{ field: "prompt", message: "Prompt is required" }],
    maxLengths: [{ field: "style_guide", max: 2000, label: "Style guide" }],
    ranges: [
      {
        field: "batch_size",
        min: 1,
        max: 16,
        integer: true,
        label: "Images",
      },
    ],
    labels: {
      prompt: "Prompt",
      style_guide: "Style guide",
      style_preset: "Style preset",
      resolution: "Resolution",
      batch_size: "Images",
      image_model: "Model",
      loras: "LoRAs",
    },
  });
  let formEl: HTMLFormElement | undefined;
  const n = () => Number(f.values.batch_size) || 1;
  const summary = () =>
    `${plural(n(), "image")} · ${labelOf(RESOLUTIONS, f.values.resolution)}${f.values.style_preset !== "none" ? ` · ${f.values.style_preset}` : ""}`;

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
            id="ci-prompt"
            rows={7}
            required
            value={f.values.prompt}
            onInput={(v) => f.set("prompt", v)}
            placeholder="Describe the image you want to generate"
            enhanceKind="image_prompt"
            getPreset={() => f.values.style_preset}
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
              id="ci-style"
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
            <div class="grid gap-3 sm:grid-cols-2">
              <Field
                label="Style preset"
                for="ci-preset"
                error={f.errors().style_preset}
              >
                <StylePresetSelect
                  id="ci-preset"
                  name="style_preset"
                  class="select select-sm w-full"
                  value={f.values.style_preset}
                  onChange={(v) => f.set("style_preset", v)}
                />
              </Field>
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
                  label="Images"
                  name="batch_size"
                  min={1}
                  max={16}
                  value={n()}
                  onInput={(v) => f.set("batch_size", String(v))}
                  format={(v) => plural(v, "image")}
                  error={f.errors().batch_size}
                />
              </div>
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
          <CollapsibleSection
            title="Advanced"
            open={Boolean(f.errors().image_model)}
          >
            <SelectField
              label="Model"
              name="image_model"
              value={f.values.image_model}
              onChange={(v) => f.set("image_model", v)}
              options={IMAGE_MODELS}
              error={f.errors().image_model}
            />
          </CollapsibleSection>
          <SubmitBar
            label="Generate"
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
          kind="image"
          emptyTitle="Your images appear here"
          emptyHint="Describe an image and press Generate."
          pending={f.submitting()}
          pendingCount={n()}
          onGenerateAgain={() => formEl?.requestSubmit()}
        />
      }
    />
  );
}
