import { A, useLocation } from "@solidjs/router";
import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { thumbUrl } from "../../lib/api-client";
import { onDismiss } from "../../lib/dismiss";
import {
  jobKindMeta,
  progressFraction,
  type JobSummary,
} from "../../lib/job-view";
import {
  activeCount,
  jobs,
  recentFinished,
  runJobAction,
} from "../../stores/jobs";
import { Icons, KIND_ICONS } from "../Icons";
import { EmptyState } from "../ui/EmptyState";

function ActivityRow(props: { job: JobSummary; onClose: () => void }) {
  const [thumbFailed, setThumbFailed] = createSignal(false);
  const isRunning = () =>
    props.job.status === "active" && props.job.progress.running > 0;
  const isActive = () => props.job.status === "active";
  const isPaused = () => props.job.status === "paused";
  const previewSrc = () => {
    const t = props.job.thumb;
    if (!t || (t.mediaType !== "image" && t.mediaType !== "video")) return null;
    return thumbUrl(t, 96);
  };

  createEffect(
    on(previewSrc, () => {
      setThumbFailed(false);
    }),
  );

  return (
    <div class="flex flex-col gap-1.5 rounded-field p-2 hover:bg-base-200/70">
      <div class="flex items-center gap-2.5">
        <A
          href={`/jobs/${encodeURIComponent(props.job.id)}`}
          class="flex min-w-0 flex-1 items-center gap-2.5"
          onClick={() => props.onClose()}
        >
          <div class="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-field bg-base-200 text-base-content/70">
            <Show
              when={!thumbFailed() ? previewSrc() : null}
              fallback={
                <Dynamic
                  component={KIND_ICONS[props.job.kind]}
                  class="size-5"
                />
              }
            >
              {(src) => (
                <img
                  src={src()}
                  alt=""
                  class="size-full object-cover"
                  loading="lazy"
                  onError={() => setThumbFailed(true)}
                />
              )}
            </Show>
          </div>
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium">{props.job.name}</div>
            <div class="text-xs text-base-content/60">
              {jobKindMeta(props.job.kind).label}
              <Show when={progressFraction(props.job.progress)}>
                {(f) => ` · ${f()}`}
              </Show>
            </div>
          </div>
        </A>
        <Show when={isActive() || isPaused()}>
          <div class="flex shrink-0 items-center gap-1">
            <Show when={isActive()}>
              <button
                type="button"
                class="btn btn-ghost btn-sm btn-square"
                aria-label={`Pause ${props.job.name}`}
                onClick={() => void runJobAction(props.job, "pause")}
              >
                <Icons.Pause class="size-4" />
              </button>
            </Show>
            <Show when={isPaused()}>
              <button
                type="button"
                class="btn btn-ghost btn-sm btn-square"
                aria-label={`Resume ${props.job.name}`}
                onClick={() => void runJobAction(props.job, "resume")}
              >
                <Icons.Play class="size-4" />
              </button>
            </Show>
            <button
              type="button"
              class="btn btn-ghost btn-sm btn-square text-error"
              aria-label={`Cancel ${props.job.name}`}
              onClick={() => void runJobAction(props.job, "cancel")}
            >
              <Icons.Stop class="size-4" />
            </button>
          </div>
        </Show>
      </div>
      <Show when={isRunning()}>
        <progress
          class="progress progress-primary h-1 w-full"
          value={props.job.progress.complete}
          max={Math.max(1, props.job.progress.total)}
        />
      </Show>
    </div>
  );
}

export function ActivityCenter() {
  const [open, setOpen] = createSignal(false);
  const location = useLocation();
  let rootRef: HTMLDivElement | undefined;
  let triggerRef: HTMLButtonElement | undefined;

  const toggle = () => setOpen(!open());

  createEffect(
    on(
      () => location.pathname,
      () => setOpen(false),
    ),
  );

  createEffect(() => {
    if (!open()) return;
    const cleanup = onDismiss(
      () => rootRef,
      (byKeyboard) => {
        setOpen(false);
        if (byKeyboard) {
          triggerRef?.focus();
        }
      },
    );
    onCleanup(cleanup);
  });

  const runningJobs = () =>
    jobs().filter((j) => j.status === "active" && j.progress.running > 0);
  const queuedJobs = () =>
    jobs().filter((j) => j.status === "active" && j.progress.running === 0);
  const pausedJobs = () => jobs().filter((j) => j.status === "paused");
  const finishedJobs = () => recentFinished(5);
  const hasAny = () =>
    runningJobs().length > 0 ||
    queuedJobs().length > 0 ||
    pausedJobs().length > 0 ||
    finishedJobs().length > 0;

  const renderSection = (title: string, list: () => JobSummary[]) => (
    <Show when={list().length > 0}>
      <div class="flex flex-col gap-1">
        <div class="section-label px-2 pt-1">{title}</div>
        <For each={list()}>
          {(job) => <ActivityRow job={job} onClose={() => setOpen(false)} />}
        </For>
      </div>
    </Show>
  );

  return (
    <div ref={rootRef} class="relative">
      <button
        ref={triggerRef}
        id="activity-button"
        type="button"
        class="btn btn-ghost btn-sm gap-1"
        aria-haspopup="true"
        aria-expanded={open()}
        aria-label={
          activeCount() ? `Activity, ${activeCount()} running` : "Activity"
        }
        onClick={toggle}
      >
        <Show
          when={activeCount() > 0}
          fallback={<Icons.Activity class="size-5" />}
        >
          <span class="loading loading-spinner loading-xs text-primary" />
          <span class="text-xs font-semibold tabular-nums">
            {activeCount()}
          </span>
        </Show>
      </button>
      <Show when={open()}>
        <div
          role="region"
          aria-label="Activity"
          class="fixed inset-x-3 top-14 w-auto sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[22rem] sm:max-w-sm z-30 rounded-box border border-base-300 bg-base-100 shadow-xl"
        >
          <div class="relative max-h-[65vh] overflow-y-auto scroll-thin p-2">
            <Show
              when={hasAny()}
              fallback={
                <EmptyState
                  title="Nothing running"
                  description="Jobs you start show up here."
                />
              }
            >
              <div class="flex flex-col gap-2">
                {renderSection("Running", runningJobs)}
                {renderSection("Queued", queuedJobs)}
                {renderSection("Paused", pausedJobs)}
                {renderSection("Recently finished", finishedJobs)}
              </div>
            </Show>
          </div>
          <div class="border-t border-base-300 p-2 text-right">
            <A
              href="/jobs"
              class="btn btn-ghost btn-xs"
              onClick={() => setOpen(false)}
            >
              All jobs
            </A>
          </div>
        </div>
      </Show>
    </div>
  );
}

export default ActivityCenter;
