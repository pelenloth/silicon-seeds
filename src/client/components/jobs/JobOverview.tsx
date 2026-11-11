import { useNavigate } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import type { MediaItem } from "../../lib/api-client";
import {
  eventLabel,
  formatDuration,
  isCancelledEvent,
  jobDurationMs,
  jobKindMeta,
  jobStatusMeta,
  plural,
  splitPrompt,
  summarizeEvents,
  type JobEvent,
  type JobSummary,
} from "../../lib/job-view";
import { nowTick } from "../../stores/shell";
import { CopyButton } from "../ui/CopyButton";
import { MediaTile } from "../ui/MediaTile";

export type JobOverviewProps = {
  job: JobSummary;
  events: JobEvent[];
  media: MediaItem[];
  mediaHasMore?: boolean;
  mediaHref: string;
  onOpenMedia: (item: MediaItem) => void;
};

function parseLoraNames(loras: string | null | undefined): string | null {
  if (!loras) return null;
  try {
    const parsed: unknown = JSON.parse(loras);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const names: string[] = [];
    for (const item of parsed) {
      if (typeof item === "string" && item.trim()) {
        names.push(item.trim());
      } else if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        const name = rec.name ?? rec.lora ?? rec.filename ?? rec.id;
        if (typeof name === "string" && name.trim()) {
          names.push(name.trim());
        }
      }
    }
    return names.length > 0 ? names.join(", ") : null;
  } catch {
    return null;
  }
}

export function JobOverview(props: JobOverviewProps) {
  const navigate = useNavigate();
  const [expandedPrompt, setExpandedPrompt] = createSignal(false);

  const summary = () => summarizeEvents(props.events);
  const completeSteps = () =>
    props.events.length > 0 ? summary().complete : props.job.progress.complete;
  const totalSteps = () =>
    props.events.length > 0 ? summary().total : props.job.progress.total;

  const failedEvent = () =>
    props.events.find((e) => e.status === "failed" && !isCancelledEvent(e));

  const failedStepName = () => {
    const evt = failedEvent();
    if (!evt) return null;
    return `${eventLabel(evt.type, evt.mode)}${evt.index != null ? ` #${evt.index + 1}` : ""}`;
  };

  const failedErrorText = () => {
    const evt = failedEvent();
    const err = evt?.error?.trim();
    return err || null;
  };

  const split = () =>
    splitPrompt(props.job.original_prompt, props.job.style_guide);

  const detailsRows = () => {
    const j = props.job;
    const rows: { label: string; value: string }[] = [];

    if (j.kind) {
      rows.push({ label: "Kind", value: jobKindMeta(j.kind).label });
    }
    if (j.created_at) {
      const ts = Date.parse(j.created_at);
      rows.push({
        label: "Created",
        value: Number.isNaN(ts) ? j.created_at : new Date(ts).toLocaleString(),
      });
    }
    const dur = formatDuration(
      jobDurationMs(j.created_at, props.events, j.status, nowTick()),
    );
    if (dur && dur !== "0s") {
      rows.push({ label: "Duration", value: dur });
    }
    if (j.resolution) {
      rows.push({ label: "Resolution", value: j.resolution });
    }
    if (j.image_model) {
      rows.push({ label: "Image model", value: j.image_model });
    }
    if (j.video_model) {
      rows.push({ label: "Video model", value: j.video_model });
    }
    if (j.audio_model) {
      rows.push({ label: "Audio model", value: j.audio_model });
    }
    if (j.style_preset && j.style_preset !== "none") {
      rows.push({ label: "Style preset", value: j.style_preset });
    }
    if (j.fps != null) {
      rows.push({ label: "FPS", value: String(j.fps) });
    }
    if (j.clip_duration != null) {
      rows.push({ label: "Clip", value: `${j.clip_duration}s` });
    }
    if (j.transition_duration != null) {
      rows.push({ label: "Transition", value: `${j.transition_duration}s` });
    }
    const loraStr = parseLoraNames(j.loras);
    if (loraStr) {
      rows.push({ label: "LoRAs", value: loraStr });
    }
    return rows;
  };

  const stepChips = () => {
    const k = summary().byKind;
    const chips: string[] = [];
    if (k.image > 0) {
      chips.push(plural(k.image, "image"));
    }
    if (k.video > 0) {
      chips.push(plural(k.video, "video clip"));
    }
    if (k.transition > 0) {
      chips.push(plural(k.transition, "transition"));
    }
    if (k.audio > 0) {
      chips.push(plural(k.audio, "audio track"));
    }
    if (k.text > 0) {
      chips.push(`${k.text} script`);
    }
    if (k.composition > 0) {
      chips.push(`${k.composition} final cut`);
    }
    return chips;
  };

  const currentProgressLabel = () => {
    const label = summary().currentLabel;
    if (label) return label;
    const meta = jobStatusMeta(props.job.status, props.job.progress);
    if (meta.label === "Finishing") return "Finishing";
    return "Waiting in queue";
  };

  return (
    <div class="flex max-w-5xl flex-col gap-4">
      <Show
        when={props.job.status === "active" || props.job.status === "paused"}
      >
        <div class="panel space-y-2 p-4">
          <div class="section-label">Progress</div>
          <progress
            class="progress progress-primary w-full"
            value={completeSteps()}
            max={Math.max(1, totalSteps())}
          />
          <div class="flex items-center justify-between text-xs text-base-content/70">
            <span>
              {completeSteps()} of {plural(totalSteps(), "step")}
            </span>
            <span>{currentProgressLabel()}</span>
          </div>
        </div>
      </Show>

      <Show when={props.job.status === "failed"}>
        <div role="alert" class="alert alert-error alert-soft">
          <div class="flex flex-1 flex-col gap-0.5 text-sm">
            <span class="font-medium">
              This job failed
              <Show when={failedStepName()}>
                {(step) => <span> · {step()}</span>}
              </Show>
            </span>
            <Show when={failedErrorText()}>
              {(err) => <span class="text-xs opacity-90">{err()}</span>}
            </Show>
          </div>
        </div>
      </Show>

      <Show when={props.media.length > 0}>
        <div class="panel space-y-3 p-4">
          <div class="flex items-center justify-between">
            <span class="section-label">Outputs</span>
            <a
              href={props.mediaHref}
              class="link link-hover text-xs"
              onClick={(e) => {
                if (
                  e.defaultPrevented ||
                  e.button !== 0 ||
                  e.metaKey ||
                  e.ctrlKey ||
                  e.shiftKey ||
                  e.altKey
                ) {
                  return;
                }
                e.preventDefault();
                navigate(props.mediaHref);
              }}
            >
              View all {props.media.length}
              {props.mediaHasMore ? "+" : ""}
            </a>
          </div>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <For each={props.media.slice(0, 8)}>
              {(item, i) => (
                <MediaTile
                  item={item}
                  position={i() + 1}
                  aspect="video"
                  onOpen={() => props.onOpenMedia(item)}
                />
              )}
            </For>
          </div>
        </div>
      </Show>

      <div class="panel space-y-3 p-4">
        <div class="space-y-1">
          <div class="flex items-center justify-between">
            <span class="section-label">Prompt</span>
            <Show when={split().prompt}>
              <CopyButton text={split().prompt} label="Copy prompt" />
            </Show>
          </div>
          <Show
            when={split().prompt}
            fallback={
              <p class="text-sm text-base-content/50">No prompt recorded</p>
            }
          >
            <p
              class="whitespace-pre-wrap break-words text-sm leading-6"
              classList={{ "line-clamp-[8]": !expandedPrompt() }}
            >
              {split().prompt}
            </p>
            <Show when={split().prompt.length > 600}>
              <button
                type="button"
                class="btn btn-ghost btn-xs mt-1"
                onClick={() => setExpandedPrompt(!expandedPrompt())}
              >
                {expandedPrompt() ? "Show less" : "Show more"}
              </button>
            </Show>
          </Show>
        </div>

        <Show when={split().styleGuide}>
          <div class="space-y-1 border-t border-base-300 pt-3">
            <div class="flex items-center justify-between">
              <span class="section-label">Style guide</span>
              <CopyButton text={split().styleGuide} label="Copy style guide" />
            </div>
            <p class="whitespace-pre-wrap break-words text-sm leading-6">
              {split().styleGuide}
            </p>
          </div>
        </Show>
      </div>

      <div class="panel space-y-3 p-4">
        <div class="section-label">Details</div>
        <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <For each={detailsRows()}>
            {(row) => (
              <div>
                <dt class="text-xs text-base-content/60">{row.label}</dt>
                <dd class="mt-0.5 font-medium">{row.value}</dd>
              </div>
            )}
          </For>
          <Show when={props.job.id}>
            {(id) => (
              <div class="col-span-full">
                <dt class="text-xs text-base-content/60">Job ID</dt>
                <dd class="mt-0.5 flex items-center gap-2">
                  <span class="font-mono text-xs whitespace-nowrap break-all">
                    {id()}
                  </span>
                  <CopyButton text={id()} label="Copy ID" />
                </dd>
              </div>
            )}
          </Show>
        </dl>
        <Show when={stepChips().length > 0}>
          <div class="flex flex-wrap gap-1.5 border-t border-base-300 pt-3">
            <For each={stepChips()}>
              {(chip) => <span class="badge badge-ghost">{chip}</span>}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}

export default JobOverview;
