import { A, useNavigate } from "@solidjs/router";
import {
  createResource,
  createSignal,
  For,
  Match,
  Show,
  Switch,
} from "solid-js";
import { ApiError, apiGet, type MediaItem } from "../../lib/api-client";
import { setPrefill } from "../../lib/form-state";
import {
  availableJobActions,
  canRegenerate,
  formatDuration,
  formatRelativeTime,
  jobDurationMs,
  jobKindMeta,
  jobToPrefill,
  type JobAction,
  type JobEvent,
  type JobSummary,
} from "../../lib/job-view";
import { onJobUpdate } from "../../lib/sse";
import { jobs, regenerateEvent, runJobAction } from "../../stores/jobs";
import { nowTick } from "../../stores/shell";
import { Icons } from "../Icons";
import { CopyButton } from "../ui/CopyButton";
import { EmptyState } from "../ui/EmptyState";
import { Lightbox } from "../ui/Lightbox";
import { StatusBadge } from "../ui/StatusBadge";
import { JobMedia } from "./JobMedia";
import { JobOverview } from "./JobOverview";
import { JobTimeline } from "./JobTimeline";

export type JobDetailProps = {
  id: string;
  tab: "status" | "media" | "events";
  filter: string;
};

const ACTION_META: Record<JobAction, { label: string; cls: string }> = {
  pause: { label: "Pause", cls: "btn btn-sm" },
  resume: { label: "Resume", cls: "btn btn-sm btn-primary" },
  retry: { label: "Retry", cls: "btn btn-sm btn-primary" },
  cancel: { label: "Cancel", cls: "btn btn-sm btn-ghost text-error" },
  delete: { label: "Delete", cls: "btn btn-sm btn-ghost text-error" },
};

export function JobDetail(props: JobDetailProps) {
  const navigate = useNavigate();
  const [actionPending, setActionPending] = createSignal(false);
  const [lightboxIndex, setLightboxIndex] = createSignal<number | null>(null);

  const [detail, { refetch: refetchDetail }] = createResource(
    () => props.id,
    (id) => apiGet<{ job: JobSummary; events: JobEvent[] }>(`/api/jobs/${id}`),
  );
  const [media, { refetch: refetchMedia }] = createResource(
    () => props.id,
    (id) => apiGet<{ items: MediaItem[] }>(`/api/jobs/${id}/media?limit=100`),
  );

  const refetchAll = () => {
    void refetchDetail();
    void refetchMedia();
  };
  onJobUpdate(() => props.id, refetchAll);

  const job = (): JobSummary | undefined => {
    const d = detail.latest?.job;
    if (!d) return undefined;
    const s = jobs().find((j) => j.id === props.id);
    return s
      ? {
          ...d,
          status: s.status,
          progress: s.progress,
          thumb: s.thumb ?? d.thumb,
        }
      : d;
  };
  const events = (): JobEvent[] => detail.latest?.events ?? [];
  const mediaItems = (): MediaItem[] => media.latest?.items ?? [];

  const isNotFound = () => {
    const err = detail.error as unknown;
    return err instanceof ApiError && err.status === 404;
  };
  const otherError = () => {
    const err = detail.error as unknown;
    if (!err || isNotFound()) return null;
    return err instanceof Error ? err.message : "Failed to load job";
  };

  const tabHref = (t: "status" | "media" | "events") =>
    `/jobs/${props.id}?tab=${t}&filter=${props.filter}`;

  const reuse = () => {
    const j = job();
    if (!j) return;
    const p = jobToPrefill(j);
    setPrefill(p.route, p.values);
    navigate(p.route);
  };

  const handleAction = async (action: JobAction) => {
    const j = job();
    if (!j || actionPending()) return;
    setActionPending(true);
    try {
      const ok = await runJobAction(j, action);
      if (ok && action === "delete") navigate(`/jobs?filter=${props.filter}`);
      else if (ok) refetchAll();
    } finally {
      setActionPending(false);
    }
  };

  const handleRegenerate = async (eventId: string) => {
    if (await regenerateEvent(props.id, eventId)) refetchAll();
  };

  const canRegenItem = (item: MediaItem) => {
    const evt = item.event_id
      ? events().find((e) => e.id === item.event_id)
      : undefined;
    return evt ? canRegenerate(evt.type) : false;
  };

  return (
    <section id="job-detail" class="flex h-full min-h-0 flex-col">
      <Show
        when={!isNotFound()}
        fallback={
          <div class="page flex flex-1 items-center justify-center">
            <EmptyState
              title="Job not found"
              action={
                <A href="/jobs" class="btn btn-sm">
                  All jobs
                </A>
              }
            />
          </div>
        }
      >
        <Show
          when={job()}
          fallback={
            <Show
              when={otherError()}
              fallback={
                <>
                  <header class="shrink-0 border-b border-base-300 bg-base-100 px-4 pt-4 pb-3 lg:px-6">
                    <div class="skeleton h-6 w-48" />
                    <div class="skeleton mt-2 h-4 w-64" />
                  </header>
                  <div class="page flex-1 space-y-4">
                    <div class="skeleton h-28 w-full max-w-5xl rounded-box" />
                    <div class="skeleton h-40 w-full max-w-5xl rounded-box" />
                  </div>
                </>
              }
            >
              {(errMsg) => (
                <div class="page">
                  <div role="alert" class="alert alert-error alert-soft">
                    <span class="flex-1 text-sm">{errMsg()}</span>
                    <button
                      type="button"
                      class="btn btn-xs"
                      onClick={refetchAll}
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}
            </Show>
          }
        >
          {(currentJob) => (
            <>
              <header class="shrink-0 border-b border-base-300 bg-base-100 px-4 pt-4 lg:px-6">
                <A
                  href={`/jobs?filter=${props.filter}`}
                  class="btn btn-ghost btn-xs mb-2 lg:hidden"
                >
                  <Icons.ChevronLeft class="size-4" />
                  Jobs
                </A>
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <h2 class="truncate text-lg font-semibold">
                        {currentJob().name}
                      </h2>
                      <StatusBadge
                        kind="job"
                        status={currentJob().status}
                        progress={currentJob().progress}
                        size="md"
                      />
                    </div>
                    <p class="mt-1 text-xs text-base-content/60">
                      {jobKindMeta(currentJob().kind).label} ·{" "}
                      <time
                        datetime={currentJob().created_at}
                        title={new Date(
                          currentJob().created_at,
                        ).toLocaleString()}
                      >
                        {formatRelativeTime(currentJob().created_at, nowTick())}
                      </time>
                      {" · "}
                      {formatDuration(
                        jobDurationMs(
                          currentJob().created_at,
                          events(),
                          currentJob().status,
                          nowTick(),
                        ),
                      )}{" "}
                      · {mediaItems().length} outputs
                    </p>
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <For each={availableJobActions(currentJob().status)}>
                      {(action) => (
                        <button
                          type="button"
                          class={ACTION_META[action].cls}
                          disabled={actionPending()}
                          onClick={() => void handleAction(action)}
                        >
                          {ACTION_META[action].label}
                        </button>
                      )}
                    </For>
                    <button
                      type="button"
                      class="btn btn-sm btn-ghost"
                      onClick={reuse}
                    >
                      Reuse settings
                    </button>
                    <CopyButton text={currentJob().id} label="Copy job ID" />
                  </div>
                </div>
                <nav
                  class="tabs tabs-border -mb-px mt-3"
                  aria-label="Job sections"
                >
                  <A
                    href={tabHref("status")}
                    class="tab"
                    classList={{ "tab-active": props.tab === "status" }}
                    aria-current={props.tab === "status" ? "page" : undefined}
                  >
                    Status
                  </A>
                  <A
                    href={tabHref("media")}
                    class="tab"
                    classList={{ "tab-active": props.tab === "media" }}
                    aria-current={props.tab === "media" ? "page" : undefined}
                  >
                    Media
                    <span class="badge badge-ghost badge-xs ml-1">
                      {mediaItems().length}
                    </span>
                  </A>
                  <A
                    href={tabHref("events")}
                    class="tab"
                    classList={{ "tab-active": props.tab === "events" }}
                    aria-current={props.tab === "events" ? "page" : undefined}
                  >
                    Events
                    <span class="badge badge-ghost badge-xs ml-1">
                      {events().length}
                    </span>
                  </A>
                </nav>
              </header>
              <div class="page min-h-0 flex-1 overflow-y-auto scroll-thin">
                <Switch>
                  <Match when={props.tab === "status"}>
                    <JobOverview
                      job={currentJob()}
                      events={events()}
                      media={mediaItems()}
                      mediaHref={tabHref("media")}
                      onOpenMedia={setLightboxIndex}
                      onRetry={() => void handleAction("retry")}
                    />
                  </Match>
                  <Match when={props.tab === "media"}>
                    <JobMedia
                      media={mediaItems()}
                      loaded={Boolean(media.latest)}
                      onOpen={setLightboxIndex}
                    />
                  </Match>
                  <Match when={props.tab === "events"}>
                    <JobTimeline
                      events={events()}
                      onRegenerate={(evtId) => void handleRegenerate(evtId)}
                    />
                  </Match>
                </Switch>
              </div>
              <Lightbox
                items={mediaItems()}
                index={lightboxIndex()}
                onIndexChange={setLightboxIndex}
                onClose={() => setLightboxIndex(null)}
                actions={(item) => (
                  <Show when={canRegenItem(item)}>
                    <button
                      type="button"
                      class="btn btn-sm btn-ghost"
                      onClick={() => void handleRegenerate(item.event_id!)}
                    >
                      <Icons.Refresh class="size-4" />
                      Regenerate
                    </button>
                  </Show>
                )}
              />
            </>
          )}
        </Show>
      </Show>
    </section>
  );
}

export default JobDetail;
