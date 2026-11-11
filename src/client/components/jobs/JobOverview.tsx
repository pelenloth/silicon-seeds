import { A } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import type { MediaItem } from "../../lib/api-client";
import {
  formatDuration,
  jobDurationMs,
  jobKindMeta,
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
  mediaHref: string;
  onOpenMedia: (index: number) => void;
  onRetry: () => void;
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
  const [expandedPrompt, setExpandedPrompt] = createSignal(false);

  const summary = () => summarizeEvents(props.events);
  const completeSteps = () =>
    props.events.length > 0 ? summary().complete : props.job.progress.complete;
  const totalSteps = () =>
    props.events.length > 0 ? summary().total : props.job.progress.total;

  const failedError = () => {
    const failedEvt = props.events.find(
      (e) => e.status === "failed" && e.error && e.error.trim(),
    );
    return failedEvt?.error?.trim() || "This job failed.";
  };

  const split = () =>
    splitPrompt(props.job.original_prompt, props.job.style_guide);

  const detailsRows = () => {
    const j = props.job;
    const rows: { label: string; value: string; mono?: boolean }[] = [];

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
    if (dur) {
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
    if (j.id) {
      rows.push({ label: "Job ID", value: j.id, mono: true });
    }
    return rows;
  };

  const stepChips = () => {
    const k = summary().byKind;
    const chips: string[] = [];
    if (k.image > 0) {
      chips.push(`${k.image} ${k.image === 1 ? "image" : "images"}`);
    }
    if (k.video > 0) {
      chips.push(`${k.video} ${k.video === 1 ? "video clip" : "video clips"}`);
    }
    if (k.transition > 0) {
      chips.push(
        `${k.transition} ${k.transition === 1 ? "transition" : "transitions"}`,
      );
    }
    if (k.audio > 0) {
      chips.push(
        `${k.audio} ${k.audio === 1 ? "audio track" : "audio tracks"}`,
      );
    }
    if (k.text > 0) {
      chips.push(`${k.text} script`);
    }
    if (k.composition > 0) {
      chips.push(`${k.composition} final cut`);
    }
    return chips;
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
              {completeSteps()} of {totalSteps()} steps
            </span>
            <span>{summary().currentLabel ?? "Waiting in queue"}</span>
          </div>
        </div>
      </Show>

      <Show when={props.job.status === "failed"}>
        <div role="alert" class="alert alert-error alert-soft">
          <span class="flex-1 text-sm">{failedError()}</span>
          <button
            type="button"
            class="btn btn-sm btn-primary"
            onClick={() => props.onRetry()}
          >
            Retry
          </button>
        </div>
      </Show>

      <Show when={props.media.length > 0}>
        <div class="panel space-y-3 p-4">
          <div class="flex items-center justify-between">
            <span class="section-label">Outputs</span>
            <A href={props.mediaHref} class="link link-hover text-xs">
              View all {props.media.length}
            </A>
          </div>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <For each={props.media.slice(0, 8)}>
              {(item, idx) => (
                <MediaTile
                  item={item}
                  aspect="video"
                  onOpen={() => props.onOpenMedia(idx())}
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
              <CopyButton text={split().prompt} />
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
              <CopyButton text={split().styleGuide} />
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
                <dd
                  class={
                    row.mono
                      ? "mt-0.5 font-mono text-xs break-all"
                      : "mt-0.5 font-medium"
                  }
                >
                  {row.value}
                </dd>
              </div>
            )}
          </For>
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
