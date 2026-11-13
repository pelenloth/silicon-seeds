import { A } from "@solidjs/router";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  Show,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import { thumbUrl } from "../../lib/api-client";
import {
  formatRelativeTime,
  jobKindMeta,
  progressFraction,
  type countByStatus,
  type JobSummary,
} from "../../lib/job-view";
import { nowTick } from "../../stores/shell";
import { Icons, KIND_ICONS } from "../Icons";
import { EmptyState } from "../ui/EmptyState";
import { StatusBadge } from "../ui/StatusBadge";
import { TabLink } from "../ui/TabLink";

export type JobListProps = {
  jobs: JobSummary[];
  counts: ReturnType<typeof countByStatus>;
  selectedId?: string;
  filter: string;
  query: string;
  onQuery: (q: string) => void;
  filterHref: (f: string) => string;
  jobHref: (id: string) => string;
  loading: boolean;
  error: string | null;
  onRetryLoad: () => void;
  hasAnyJobs: boolean;
};

type FilterKey =
  "all" | "active" | "complete" | "failed" | "paused" | "cancelled";

const FILTERS: { key: FilterKey; label: string; always: boolean }[] = [
  { key: "all", label: "All", always: true },
  { key: "active", label: "Active", always: true },
  { key: "complete", label: "Completed", always: true },
  { key: "failed", label: "Failed", always: true },
  { key: "paused", label: "Paused", always: false },
  { key: "cancelled", label: "Cancelled", always: false },
];

function JobRow(props: { job: JobSummary; selected: boolean; href: string }) {
  const [thumbFailed, setThumbFailed] = createSignal(false);

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
    <li>
      <A
        href={props.href}
        class="flex items-center gap-3 rounded-field px-2 py-2 hover:bg-base-200"
        classList={{
          "bg-base-200 ring-1 ring-base-300": props.selected,
        }}
        aria-current={props.selected ? "true" : undefined}
      >
        <div class="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-field bg-base-300 text-base-content/40">
          <Show
            when={!thumbFailed() ? previewSrc() : null}
            fallback={
              <Dynamic component={KIND_ICONS[props.job.kind]} class="size-5" />
            }
          >
            {(src) => (
              <img
                src={src()}
                alt=""
                loading="lazy"
                decoding="async"
                class="size-full object-cover"
                onError={() => setThumbFailed(true)}
              />
            )}
          </Show>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-2">
            <span class="truncate text-sm font-medium">{props.job.name}</span>
            <span class="shrink-0 text-xs text-base-content/50">
              {formatRelativeTime(props.job.created_at, nowTick())}
            </span>
          </div>
          <div class="mt-0.5 flex items-center justify-between gap-2">
            <span class="truncate text-xs text-base-content/60">
              {jobKindMeta(props.job.kind).label}
              <Show when={progressFraction(props.job.progress)}>
                {(f) => ` · ${f()}`}
              </Show>
            </span>
            <StatusBadge
              kind="job"
              status={props.job.status}
              progress={props.job.progress}
            />
          </div>
          <Show
            when={props.job.status === "active" && props.job.progress.total > 0}
          >
            <progress
              class="progress progress-primary mt-1 h-1 w-full"
              value={props.job.progress.complete}
              max={props.job.progress.total}
            />
          </Show>
        </div>
      </A>
    </li>
  );
}

export function JobList(props: JobListProps) {
  const visibleFilters = createMemo(() =>
    FILTERS.filter(
      (f) => f.always || props.counts[f.key] > 0 || props.filter === f.key,
    ),
  );

  return (
    <aside id="job-list" class="flex h-full min-h-0 flex-col bg-base-100">
      <div class="flex items-center gap-2 border-b border-base-300 p-3">
        <label class="input input-sm flex-1">
          <Icons.Search class="size-4 opacity-50" />
          <input
            id="job-search"
            type="search"
            placeholder="Search jobs"
            aria-label="Search jobs"
            value={props.query}
            onInput={(e) => props.onQuery(e.currentTarget.value)}
          />
        </label>
      </div>
      <nav
        id="job-filter"
        aria-label="Filter jobs"
        class="scroll-thin relative flex flex-nowrap gap-px overflow-x-auto border-b border-base-300 px-1.5 py-2"
      >
        <For each={visibleFilters()}>
          {(f) => {
            const active = () => props.filter === f.key;
            return (
              <TabLink
                href={props.filterHref(f.key)}
                active={active()}
                variant="chip"
                size="xs"
                class="shrink-0 gap-0.5 px-1 text-[11px]"
              >
                {f.label} <span class="opacity-60">{props.counts[f.key]}</span>
              </TabLink>
            );
          }}
        </For>
      </nav>

      <ul class="relative min-h-0 flex-1 overflow-y-auto scroll-thin p-2">
        <Show when={props.loading && !props.hasAnyJobs}>
          <For each={[0, 1, 2, 3, 4, 5, 6, 7]}>
            {() => (
              <li class="flex items-center gap-3 px-2 py-2">
                <div class="skeleton size-11 rounded-field" />
                <div class="flex-1 space-y-2">
                  <div class="skeleton h-3 w-2/3" />
                  <div class="skeleton h-3 w-1/3" />
                </div>
              </li>
            )}
          </For>
        </Show>
        <Show when={props.error}>
          {(err) => (
            <li>
              <div role="alert" class="alert alert-error alert-soft text-sm">
                <span>{err()}</span>
                <button
                  type="button"
                  class="btn btn-xs"
                  onClick={() => props.onRetryLoad()}
                >
                  Try again
                </button>
              </div>
            </li>
          )}
        </Show>
        <Show when={!props.loading && !props.error && props.jobs.length === 0}>
          <li>
            <Show
              when={props.hasAnyJobs}
              fallback={
                <EmptyState
                  title="No jobs yet"
                  description="Create something and it will show up here."
                  action={
                    <A href="/" class="btn btn-primary btn-sm">
                      Create
                    </A>
                  }
                />
              }
            >
              <EmptyState
                title="No jobs match"
                description="Try another search or filter."
              />
            </Show>
          </li>
        </Show>
        <For each={props.jobs}>
          {(j) => (
            <JobRow
              job={j}
              selected={props.selectedId === j.id}
              href={props.jobHref(j.id)}
            />
          )}
        </For>
      </ul>
    </aside>
  );
}

export default JobList;
