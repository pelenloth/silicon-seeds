import { createSignal, For, Index, onCleanup, onMount, Show } from "solid-js";
import {
  MINIMAX_H3_STYLE_EMBEDDINGS,
  type KeyframeGuideSpec,
} from "../../../shared/video-models";
import { apiGet } from "../../lib/api-client";
import { Icons } from "../Icons";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import { CollapsibleSection, Section } from "./Section";

const H3_MODE_OPTIONS = [
  { value: "t2v", label: "Text to Video (T2V)" },
  { value: "i2v", label: "Image to Video (First Frame)" },
  { value: "fl2v", label: "First + Last Frame (FL2V)" },
  { value: "multiframe", label: "Multi-Frame Reference (<Picture 1..9>)" },
] as const;

const H3_VARIANT_OPTIONS = [
  { value: "turbo_8", label: "8-Step Turbo LoRA (Recommended)" },
  { value: "turbo_4", label: "4-Step Turbo LoRA (Fastest)" },
  { value: "fasth3", label: "FastH3 8-Step VSA (T2V / I2V)" },
  { value: "standard", label: "20-Step Standard (Full Quality)" },
] as const;

const REF_SIZE_OPTIONS = [
  { value: "match", label: "Match target resolution" },
  { value: "max", label: "Preserve max reference resolution" },
] as const;

const SEQUENCE_OPTIONS = [
  { value: "single", label: "Single clip" },
  {
    value: "continuation",
    label: "Multi-clip continuation (last-frame chain)",
  },
  { value: "transition", label: "Multi-clip with AI transitions" },
] as const;

const STYLE_EMBEDDING_OPTIONS = [
  { value: "", label: "None" },
  ...MINIMAX_H3_STYLE_EMBEDDINGS.map((e) => ({
    value: e.id,
    label: e.label,
  })),
];

const MAX_REFERENCE_IMAGES = 9;
const MIN_SEQUENCE_PROMPTS = 2;
const MAX_SEQUENCE_PROMPTS = 8;

type ComfyH3Status = {
  ready: boolean;
  missing: string[];
};

export function MiniMaxH3Panels(props: {
  values: Record<string, string>;
  set: (field: string, value: string) => void;
  errors: Record<string, string>;
  maxFrames: number;
  onInsertPromptToken: (token: string) => void;
  firstFrameFile: File | null;
  setFirstFrameFile: (f: File | null) => void;
  lastFrameFile: File | null;
  setLastFrameFile: (f: File | null) => void;
  referenceFiles: readonly File[];
  setReferenceFiles: (files: File[]) => void;
  keyframeGuides: readonly KeyframeGuideSpec[];
  setKeyframeGuides: (guides: KeyframeGuideSpec[]) => void;
  sequencePrompts: readonly string[];
  setSequencePrompts: (prompts: string[]) => void;
}) {
  const [status, setStatus] = createSignal<ComfyH3Status | null>(null);
  const controller = new AbortController();

  onMount(() => {
    void apiGet<ComfyH3Status>("/api/comfyui/minimax-h3/status", {
      signal: controller.signal,
    })
      .then((res) => {
        if (!controller.signal.aborted) setStatus(res);
      })
      .catch(() => {});
  });

  onCleanup(() => {
    controller.abort();
  });

  const mode = () => props.values.h3_mode || "t2v";
  const seqMode = () => props.values.sequence_mode || "single";

  const addGuide = () => {
    if (props.referenceFiles.length === 0) return;
    props.setKeyframeGuides([
      ...props.keyframeGuides,
      { refIndex: 0, frameIdx: 0 },
    ]);
  };

  const updateGuide = (idx: number, patch: Partial<KeyframeGuideSpec>) => {
    props.setKeyframeGuides(
      props.keyframeGuides.map((g, i) => (i === idx ? { ...g, ...patch } : g)),
    );
  };

  const removeGuide = (idx: number) => {
    props.setKeyframeGuides(props.keyframeGuides.filter((_, i) => i !== idx));
  };

  const addShotPrompt = () => {
    if (props.sequencePrompts.length >= MAX_SEQUENCE_PROMPTS) return;
    props.setSequencePrompts([...props.sequencePrompts, ""]);
  };

  const updateShotPrompt = (idx: number, text: string) => {
    props.setSequencePrompts(
      props.sequencePrompts.map((p, i) => (i === idx ? text : p)),
    );
  };

  const removeShotPrompt = (idx: number) => {
    if (props.sequencePrompts.length <= MIN_SEQUENCE_PROMPTS) return;
    props.setSequencePrompts(props.sequencePrompts.filter((_, i) => i !== idx));
  };

  return (
    <>
      <Show when={status() && !status()!.ready}>
        <div
          role="status"
          class="rounded-field border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-base-content"
        >
          <p class="font-medium">MiniMax H3 weights not detected in ComfyUI</p>
          <p class="mt-0.5 text-base-content/70">
            Run <code class="font-mono">bun run setup:minimax-h3</code> to
            install required models and templates.
          </p>
        </div>
      </Show>

      <Section title="MiniMax H3 Mode & Speed">
        <div class="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Generation mode"
            name="h3_mode"
            value={mode()}
            onChange={(v) => props.set("h3_mode", v)}
            options={H3_MODE_OPTIONS}
            error={props.errors.h3_mode}
          />
          <SelectField
            label="Quality / speed variant"
            name="h3_variant"
            value={props.values.h3_variant || "turbo_8"}
            onChange={(v) => props.set("h3_variant", v)}
            options={H3_VARIANT_OPTIONS}
            error={props.errors.h3_variant}
          />
          <div class="sm:col-span-2">
            <SelectField
              label="Style embedding"
              name="style_embedding"
              value={props.values.style_embedding || ""}
              onChange={(v) => props.set("style_embedding", v)}
              options={STYLE_EMBEDDING_OPTIONS}
              error={props.errors.style_embedding}
            />
          </div>
        </div>

        <Show when={mode() === "i2v" || mode() === "fl2v"}>
          <div class="mt-3 grid gap-3 sm:grid-cols-2">
            <Field
              label="First frame image"
              for="h3-first-frame"
              error={props.errors.first_frame}
            >
              <input
                id="h3-first-frame"
                type="file"
                accept=".png,.jpg,.jpeg,.webp"
                class="file-input file-input-bordered file-input-sm w-full"
                onChange={(e) => {
                  props.setFirstFrameFile(e.currentTarget.files?.[0] ?? null);
                }}
              />
              <Show when={props.firstFrameFile}>
                {(f) => (
                  <span class="mt-1 block truncate font-mono text-xs text-base-content/70">
                    {f().name}
                  </span>
                )}
              </Show>
            </Field>

            <Show when={mode() === "fl2v"}>
              <Field
                label="Last frame image"
                for="h3-last-frame"
                error={props.errors.last_frame}
              >
                <input
                  id="h3-last-frame"
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp"
                  class="file-input file-input-bordered file-input-sm w-full"
                  onChange={(e) => {
                    props.setLastFrameFile(e.currentTarget.files?.[0] ?? null);
                  }}
                />
                <Show when={props.lastFrameFile}>
                  {(f) => (
                    <span class="mt-1 block truncate font-mono text-xs text-base-content/70">
                      {f().name}
                    </span>
                  )}
                </Show>
              </Field>
            </Show>
          </div>
        </Show>

        <Show when={mode() === "multiframe"}>
          <div class="mt-3 flex flex-col gap-3">
            <SelectField
              label="Reference image sizing"
              name="ref_image_size"
              value={props.values.ref_image_size || "match"}
              onChange={(v) => props.set("ref_image_size", v)}
              options={REF_SIZE_OPTIONS}
              error={props.errors.ref_image_size}
            />

            <Field
              label="Reference pictures (1 to 9)"
              for="h3-ref-images"
              error={props.errors.reference_images}
            >
              <input
                id="h3-ref-images"
                type="file"
                multiple
                accept=".png,.jpg,.jpeg,.webp"
                class="file-input file-input-bordered file-input-sm w-full"
                onChange={(e) => {
                  const selected = Array.from(
                    e.currentTarget.files ?? [],
                  ).slice(0, MAX_REFERENCE_IMAGES);
                  props.setReferenceFiles(selected);
                  // Drop guides that point past the new reference list.
                  props.setKeyframeGuides(
                    props.keyframeGuides.filter(
                      (g) => g.refIndex < selected.length,
                    ),
                  );
                }}
              />
            </Field>

            <Show when={props.referenceFiles.length > 0}>
              <div class="flex flex-wrap gap-1.5">
                <For each={props.referenceFiles}>
                  {(file, idx) => (
                    <button
                      type="button"
                      class="btn btn-outline btn-xs font-mono"
                      onClick={() =>
                        props.onInsertPromptToken(`<Picture ${idx() + 1}>`)
                      }
                    >
                      Insert &lt;Picture {idx() + 1}&gt; ({file.name})
                    </button>
                  )}
                </For>
              </div>

              <div class="flex flex-col gap-2 rounded-field border border-base-300 p-2.5">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-medium">
                    Timeline keyframe guides (optional)
                  </span>
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs"
                    onClick={addGuide}
                  >
                    <Icons.Plus class="size-3.5" />
                    Add keyframe guide
                  </button>
                </div>
                <Index each={props.keyframeGuides}>
                  {(guide, gIdx) => (
                    <div class="flex items-center gap-2 text-xs">
                      <select
                        aria-label={`Guide ${gIdx + 1} picture`}
                        class="select select-xs"
                        value={String(guide().refIndex)}
                        onChange={(e) =>
                          updateGuide(gIdx, {
                            refIndex: Number(e.currentTarget.value),
                          })
                        }
                      >
                        <For each={props.referenceFiles}>
                          {(_, rIdx) => (
                            <option
                              value={String(rIdx())}
                              selected={guide().refIndex === rIdx()}
                            >
                              Picture {rIdx() + 1}
                            </option>
                          )}
                        </For>
                      </select>
                      <span>at frame</span>
                      <input
                        type="number"
                        aria-label={`Guide ${gIdx + 1} frame index`}
                        class="input input-xs w-24 font-mono"
                        min="-1"
                        max={String(Math.max(0, props.maxFrames - 1))}
                        value={String(guide().frameIdx)}
                        onInput={(e) =>
                          updateGuide(gIdx, {
                            frameIdx: Number(e.currentTarget.value) || 0,
                          })
                        }
                      />
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs btn-square"
                        aria-label={`Remove guide ${gIdx + 1}`}
                        onClick={() => removeGuide(gIdx)}
                      >
                        <Icons.XMark class="size-3.5" />
                      </button>
                    </div>
                  )}
                </Index>
              </div>
            </Show>
          </div>
        </Show>
      </Section>

      <CollapsibleSection
        title="Native Stereo Audio"
        hint="MiniMax H3 joint audio-video"
        open={Boolean(props.values.soundscape || props.values.music)}
      >
        <div class="flex flex-col gap-3">
          <Field
            label="Soundscape / SFX"
            for="h3-soundscape"
            error={props.errors.soundscape}
          >
            <input
              id="h3-soundscape"
              name="soundscape"
              type="text"
              maxLength={500}
              class="input input-sm w-full"
              placeholder="Ambient wind, footsteps on gravel, thunder..."
              value={props.values.soundscape || ""}
              onInput={(e) => props.set("soundscape", e.currentTarget.value)}
            />
          </Field>
          <Field
            label="Music underscore"
            for="h3-music"
            error={props.errors.music}
          >
            <input
              id="h3-music"
              name="music"
              type="text"
              maxLength={500}
              class="input input-sm w-full"
              placeholder="Warm analog synth arpeggio, subtle strings..."
              value={props.values.music || ""}
              onInput={(e) => props.set("music", e.currentTarget.value)}
            />
          </Field>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Sequence & Continuations"
        hint="multi-clip"
        open={seqMode() !== "single" || Boolean(props.errors.sequence_prompts)}
      >
        <div class="flex flex-col gap-3">
          <SelectField
            label="Sequence mode"
            name="sequence_mode"
            value={seqMode()}
            onChange={(v) => {
              props.set("sequence_mode", v);
              if (
                v !== "single" &&
                props.sequencePrompts.length < MIN_SEQUENCE_PROMPTS
              ) {
                props.setSequencePrompts([props.values.prompt || "", ""]);
              }
            }}
            options={SEQUENCE_OPTIONS}
            error={props.errors.sequence_mode}
          />

          <Show when={seqMode() !== "single"}>
            <div class="flex flex-col gap-2">
              <Index each={props.sequencePrompts}>
                {(shotPrompt, idx) => (
                  <Field label={`Clip ${idx + 1} prompt`} for={`h3-seq-${idx}`}>
                    <div class="flex gap-1.5">
                      <textarea
                        id={`h3-seq-${idx}`}
                        rows={2}
                        class="textarea textarea-bordered textarea-xs flex-1"
                        placeholder={`Describe clip ${idx + 1}...`}
                        value={shotPrompt()}
                        onInput={(e) =>
                          updateShotPrompt(idx, e.currentTarget.value)
                        }
                      />
                      <Show
                        when={
                          props.sequencePrompts.length > MIN_SEQUENCE_PROMPTS
                        }
                      >
                        <button
                          type="button"
                          class="btn btn-ghost btn-xs btn-square"
                          aria-label={`Remove clip ${idx + 1}`}
                          onClick={() => removeShotPrompt(idx)}
                        >
                          <Icons.XMark class="size-3.5" />
                        </button>
                      </Show>
                    </div>
                  </Field>
                )}
              </Index>
              <Show when={props.errors.sequence_prompts}>
                {(err) => <p class="text-xs text-error">{err()}</p>}
              </Show>
              <button
                type="button"
                class="btn btn-ghost btn-xs self-start"
                disabled={props.sequencePrompts.length >= MAX_SEQUENCE_PROMPTS}
                onClick={addShotPrompt}
              >
                <Icons.Plus class="size-3.5" />
                Add clip
              </button>
            </div>
          </Show>
        </div>
      </CollapsibleSection>
    </>
  );
}

export default MiniMaxH3Panels;
