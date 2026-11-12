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

export default function CreateAudio() {
  const f = useCreateForm({
    kind: "audio",
    fallback: () => ({
      instrumental_prompt: "",
      lyric_prompt: "",
      ...AUDIO_DEFAULTS,
    }),
    required: [
      { field: "instrumental_prompt", message: "Describe the music first" },
    ],
    ranges: [
      {
        field: "duration",
        min: 10,
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
        max: 10,
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
    ],
    labels: {
      instrumental_prompt: "Style",
      lyric_prompt: "Lyrics",
      duration: "Duration",
      bpm: "BPM",
      keyscale: "Key / Scale",
      timesignature: "Time signature",
      cfg_scale: "CFG scale",
      temperature: "Temperature",
      top_p: "Top P",
    },
  });

  let formEl: HTMLFormElement | undefined;
  const duration = () => Number(f.values.duration) || 60;
  const bpm = () => Number(f.values.bpm) || 72;
  const cfgScale = () => {
    const n = Number(f.values.cfg_scale);
    return Number.isFinite(n) ? n : 2;
  };
  const temperature = () => {
    const n = Number(f.values.temperature);
    return Number.isFinite(n) ? n : 0.85;
  };
  const topP = () => {
    const n = Number(f.values.top_p);
    return Number.isFinite(n) ? n : 0.9;
  };
  const summary = () => `${duration()}s · ${bpm()} BPM · ${f.values.keyscale}`;

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
            label="Style"
            name="instrumental_prompt"
            id="ca-inst"
            rows={5}
            required
            value={f.values.instrumental_prompt}
            onInput={(v) => f.set("instrumental_prompt", v)}
            placeholder="slow burn ambient pop, intimate piano, glassy synths, soft sub bass"
            hint="Arrangement, instruments, groove, mood"
            enhanceKind="instrumental"
            error={f.errors().instrumental_prompt}
          />
          <PromptField
            label="Lyrics"
            name="lyric_prompt"
            id="ca-lyrics"
            rows={5}
            value={f.values.lyric_prompt}
            onInput={(v) => f.set("lyric_prompt", v)}
            placeholder="A short hook, imagery, or lyrical concept"
            hint="Leave blank for an instrumental track"
            enhanceKind="lyrics"
            error={f.errors().lyric_prompt}
          />
          <Section title="Timing">
            <div class="grid gap-3 sm:grid-cols-2">
              <SliderField
                label="Duration"
                name="duration"
                min={10}
                max={720}
                step={10}
                value={duration()}
                onInput={(v) => f.set("duration", String(v))}
                format={(v) => `${v}s`}
                error={f.errors().duration}
              />
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
            </div>
          </Section>
          <Section title="Musical framing">
            <div class="grid gap-3 sm:grid-cols-2">
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
                  value={f.values.timesignature}
                  onChange={(v) => f.set("timesignature", v)}
                  options={TIMESIGNATURE_OPTIONS}
                />
              </Field>
            </div>
          </Section>
          <CollapsibleSection
            title="Advanced"
            open={Boolean(
              f.errors().cfg_scale ||
              f.errors().temperature ||
              f.errors().top_p,
            )}
          >
            <div class="flex flex-col gap-3">
              <SliderField
                label="CFG scale"
                name="cfg_scale"
                min={0}
                max={10}
                step={0.5}
                value={cfgScale()}
                onInput={(v) => f.set("cfg_scale", String(v))}
                error={f.errors().cfg_scale}
              />
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
            </div>
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
