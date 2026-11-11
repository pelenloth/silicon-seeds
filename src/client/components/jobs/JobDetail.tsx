import { A, useNavigate } from "@solidjs/router";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  on,
  onCleanup,
  Show,
  Switch,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";
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
import { TabLink } from "../ui/TabLink";
import { JobMedia } from "./JobMedia";
import { JobOverview } from "./JobOverview";
import { JobTimeline } from "./JobTimeline";

export type JobDetailProps = {
  id: string;
  tab: "status" | "media" | "events";
  filter: string;
};

type KeyedMediaItem = MediaItem & { id: string };

function mediaItemKey(item: MediaItem & { id?: string }): string {
  if (typeof item.id === "string" && item.id) return item.id;
  return `${item.subfolder ?? ""}/${item.filename}`;
}

function isMobileViewport(): boolean {
  try {
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function"
    ) {
      return !window.matchMedia("(min-width: 1024px)").matches;
    }
  } catch {}
  return false;
}

const ACTION_META: Record<JobAction, { label: string; cls: string }> = {
  pause: { label: "Pause", cls: "btn btn-sm" },
  resume: { label: "Resume", cls: "btn btn-sm btn-primary" },
  retry: { label: "Retry", cls: "btn btn-sm btn-primary" },
  cancel: { label: "Cancel", cls: "btn btn-sm btn-ghost text-error" },
  delete: { label: "Delete", cls: "btn btn-sm btn-ghost text-error" },
};

export function JobDetail(props: JobDetailProps) {
  const navigate = useNavigate();
  let headingRef: HTMLHeadingElement | undefined;
  const [actionPending, setActionPending] = createSignal(false);
  const [lightboxKey, setLightboxKey] = createSignal<string | null>(null);

  const [jobData, setJobData] = createSignal<JobSummary | undefined>(undefined);
  const [eventsStore, setEventsStore] = createStore<JobEvent[]>([]);
  const [mediaStore, setMediaStore] = createStore<KeyedMediaItem[]>([]);
  const [mediaLoaded, setMediaLoaded] = createSignal(false);
  const [mediaTotal, setMediaTotal] = createSignal(0);
  const [mediaLimit, setMediaLimit] = createSignal(100);

  const [detailLoading, setDetailLoading] = createSignal(true);
  const [notFound, setNotFound] = createSignal(false);
  const [loadError, setLoadError] = createSignal<string | null>(null);
  const [refetchError, setRefetchError] = createSignal(false);

  let disposed = false;
  let detailSeq = 0;
  let lastAppliedDetailSeq = 0;
  let mediaSeq = 0;
  let lastAppliedMediaSeq = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let focusedForJobId: string | null = null;

  const clearDebounce = () => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  };

  onCleanup(() => {
    disposed = true;
    clearDebounce();
  });

  const fetchDetail = async (targetId: string) => {
    const seq = ++detailSeq;
    if (!jobData()) {
      setDetailLoading(true);
    }
    try {
      const data = await apiGet<{ job: JobSummary; events: JobEvent[] }>(
        `/api/jobs/${encodeURIComponent(targetId)}`,
      );
      if (disposed || targetId !== props.id || seq <= lastAppliedDetailSeq) {
        return;
      }
      lastAppliedDetailSeq = seq;
      setJobData(data.job);
      setEventsStore(reconcile(data.events ?? [], { key: "id", merge: true }));
      setNotFound(false);
      setLoadError(null);
      setRefetchError(false);
      setDetailLoading(false);

      if (focusedForJobId !== targetId && isMobileViewport()) {
        focusedForJobId = targetId;
        queueMicrotask(() => headingRef?.focus());
      }
    } catch (err) {
      if (disposed || targetId !== props.id || seq <= lastAppliedDetailSeq) {
        return;
      }
      setDetailLoading(false);
      if (jobData()) {
        setRefetchError(true);
      } else if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
        setLoadError(null);
      } else {
        setNotFound(false);
        const msg = err instanceof Error ? err.message : "Failed to load job";
        setLoadError(msg);
      }
    }
  };

  const fetchMedia = async (targetId: string, customLimit?: number) => {
    const seq = ++mediaSeq;
    const lim = customLimit ?? mediaLimit();
    try {
      const data = await apiGet<{ items: MediaItem[]; total?: number }>(
        `/api/jobs/${encodeURIComponent(targetId)}/media?limit=${lim}`,
      );
      if (disposed || targetId !== props.id || seq <= lastAppliedMediaSeq) {
        return;
      }
      lastAppliedMediaSeq = seq;
      const nextItems: KeyedMediaItem[] = (data.items ?? []).map((it) => ({
        ...it,
        id: mediaItemKey(it),
      }));
      setMediaStore(reconcile(nextItems, { key: "id", merge: true }));
      setMediaTotal(
        typeof data.total === "number"
          ? Math.max(data.total, nextItems.length)
          : nextItems.length,
      );
      setMediaLoaded(true);
    } catch {
      if (disposed || targetId !== props.id || seq <= lastAppliedMediaSeq) {
        return;
      }
      setMediaLoaded(true);
    }
  };

  const refetchAll = () => {
    clearDebounce();
    const currentId = props.id;
    void fetchDetail(currentId);
    void fetchMedia(currentId);
  };

  createEffect(
    on(
      () => props.id,
      (currentId) => {
        clearDebounce();
        focusedForJobId = null;
        setJobData(undefined);
        setEventsStore(reconcile([], { key: "id", merge: true }));
        setMediaStore(reconcile([], { key: "id", merge: true }));
        setMediaLoaded(false);
        setMediaTotal(0);
        setMediaLimit(100);
        setNotFound(false);
        setLoadError(null);
        setRefetchError(false);
        setDetailLoading(true);
        setLightboxKey(null);
        void fetchDetail(currentId);
        void fetchMedia(currentId, 100);
      },
    ),
  );

  const scheduleDebouncedRefetch = () => {
    if (debounceTimer !== null) return;
    const scheduledId = props.id;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (!disposed && props.id === scheduledId) {
        void fetchDetail(scheduledId);
        void fetchMedia(scheduledId);
      }
    }, 400);
  };

  onJobUpdate(() => props.id, scheduleDebouncedRefetch);

  const job = createMemo<JobSummary | undefined>(() => {
    const d = jobData();
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
  });

  const lightboxIndex = createMemo<number | null>(() => {
    const key = lightboxKey();
    if (!key) return null;
    const idx = mediaStore.findIndex((it) => mediaItemKey(it) === key);
    return idx >= 0 ? idx : null;
  });

  createEffect(() => {
    if (lightboxKey() !== null && lightboxIndex() === null) {
      setLightboxKey(null);
    }
  });

  const openLightboxForItem = (item: MediaItem) => {
    setLightboxKey(mediaItemKey(item));
  };

  const handleShowAllMedia = () => {
    const nextLim = Math.max(mediaTotal(), mediaStore.length + 100, 500);
    setMediaLimit(nextLim);
    void fetchMedia(props.id, nextLim);
  };

  const tabHref = (t: "status" | "media" | "events") =>
    `/jobs/${encodeURIComponent(props.id)}?tab=${encodeURIComponent(t)}&filter=${encodeURIComponent(props.filter)}`;

  const backHref = () => `/jobs?filter=${encodeURIComponent(props.filter)}`;

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
      if (ok && action === "delete") {
        navigate(backHref());
      } else {
        refetchAll();
      }
    } finally {
      setActionPending(false);
    }
  };

  const handleRegenerate = async (eventId: string) => {
    if (actionPending()) return;
    setActionPending(true);
    try {
      await regenerateEvent(props.id, eventId);
      refetchAll();
    } finally {
      setActionPending(false);
    }
  };

  const canRegenItem = (item: MediaItem) => {
    const evt = item.event_id
      ? eventsStore.find((e) => e.id === item.event_id)
      : undefined;
    return evt ? canRegenerate(evt.type) : false;
  };

  const BackToJobs = () => (
    <A href={backHref()} class="btn btn-ghost btn-xs mb-2 self-start lg:hidden">
      <Icons.ChevronLeft class="size-4" />
      Jobs
    </A>
  );

  return (
    <section id="job-detail" class="flex h-full min-h-0 flex-col">
      <Show
        when={!notFound()}
        fallback={
          <div class="page flex flex-1 flex-col">
            <BackToJobs />
            <div class="flex flex-1 items-center justify-center">
              <EmptyState
                title="Job not found"
                action={
                  <A href="/jobs" class="btn btn-sm">
                    All jobs
                  </A>
                }
              />
            </div>
          </div>
        }
      >
        <Show
          when={job()}
          fallback={
            <Show
              when={loadError()}
              fallback={
                <Show when={detailLoading()}>
                  <>
                    <header class="shrink-0 border-b border-base-300 bg-base-100 px-4 pt-4 pb-3 lg:px-6">
                      <BackToJobs />
                      <div class="skeleton h-6 w-48" />
                      <div class="skeleton mt-2 h-4 w-64" />
                    </header>
                    <div class="page flex-1 space-y-4">
                      <div class="skeleton h-28 w-full max-w-5xl rounded-box" />
                      <div class="skeleton h-40 w-full max-w-5xl rounded-box" />
                    </div>
                  </>
                </Show>
              }
            >
              {(errMsg) => (
                <div class="page flex flex-col">
                  <BackToJobs />
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
          {(currentJob) => {
            const primaryActions = () =>
              availableJobActions(currentJob().status).filter(
                (a) => a !== "delete",
              );
            const canDelete = () =>
              availableJobActions(currentJob().status).includes("delete");
            const durationText = () => {
              const d = formatDuration(
                jobDurationMs(
                  currentJob().created_at,
                  eventsStore,
                  currentJob().status,
                  nowTick(),
                ),
              );
              return d && d !== "0s" ? d : null;
            };

            return (
              <>
                <header class="shrink-0 border-b border-base-300 bg-base-100 px-4 pt-4 lg:px-6">
                  <BackToJobs />
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <h2
                          ref={headingRef}
                          tabindex="-1"
                          class="truncate text-lg font-semibold focus:outline-none"
                        >
                          {currentJob().name}
                        </h2>
                        <span
                          aria-live="polite"
                          class="inline-flex items-center gap-2"
                        >
                          <StatusBadge
                            kind="job"
                            status={currentJob().status}
                            progress={currentJob().progress}
                            size="md"
                          />
                          <Show when={currentJob().progress.total > 0}>
                            <span class="text-xs text-base-content/60 tabular-nums">
                              {currentJob().progress.complete}/
                              {currentJob().progress.total}
                            </span>
                          </Show>
                        </span>
                      </div>
                      <p class="mt-1 text-xs text-base-content/60">
                        {jobKindMeta(currentJob().kind).label} ·{" "}
                        <time
                          datetime={currentJob().created_at}
                          title={new Date(
                            currentJob().created_at,
                          ).toLocaleString()}
                        >
                          {formatRelativeTime(
                            currentJob().created_at,
                            nowTick(),
                          )}
                        </time>
                        <Show when={durationText()}>
                          {(dur) => (
                            <>
                              {" · "}
                              {dur()}
                            </>
                          )}
                        </Show>
                        {" · "}
                        {mediaStore.length} outputs
                      </p>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                      <For each={primaryActions()}>
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
                      <Show when={canDelete()}>
                        <span
                          class="mx-0.5 h-4 w-px bg-base-300"
                          aria-hidden="true"
                        />
                        <button
                          type="button"
                          class={ACTION_META.delete.cls}
                          disabled={actionPending()}
                          onClick={() => void handleAction("delete")}
                        >
                          {ACTION_META.delete.label}
                        </button>
                      </Show>
                    </div>
                  </div>
                  <Show when={refetchError()}>
                    <div
                      role="status"
                      class="mt-2 flex items-center justify-between gap-2 rounded-field bg-base-200 px-3 py-1.5 text-xs text-base-content/80"
                    >
                      <span>Could not refresh.</span>
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs"
                        onClick={refetchAll}
                      >
                        Try again
                      </button>
                    </div>
                  </Show>
                  <div
                    role="tablist"
                    class="tabs tabs-border -mb-px mt-3"
                    aria-label="Job sections"
                  >
                    <TabLink
                      href={tabHref("status")}
                      active={props.tab === "status"}
                    >
                      Status
                    </TabLink>
                    <TabLink
                      href={tabHref("media")}
                      active={props.tab === "media"}
                    >
                      Media
                      <span class="badge badge-ghost badge-xs ml-1">
                        {mediaStore.length}
                      </span>
                    </TabLink>
                    <TabLink
                      href={tabHref("events")}
                      active={props.tab === "events"}
                    >
                      Events
                      <span class="badge badge-ghost badge-xs ml-1">
                        {eventsStore.length}
                      </span>
                    </TabLink>
                  </div>
                </header>
                <div class="page min-h-0 flex-1 overflow-y-auto scroll-thin">
                  <Switch>
                    <Match when={props.tab === "status"}>
                      <JobOverview
                        job={currentJob()}
                        events={eventsStore}
                        media={mediaStore}
                        mediaHref={tabHref("media")}
                        onOpenMedia={openLightboxForItem}
                      />
                    </Match>
                    <Match when={props.tab === "media"}>
                      <JobMedia
                        media={mediaStore}
                        total={mediaTotal()}
                        loaded={mediaLoaded()}
                        onOpen={openLightboxForItem}
                        onShowAll={handleShowAllMedia}
                      />
                    </Match>
                    <Match when={props.tab === "events"}>
                      <JobTimeline
                        events={eventsStore}
                        actionPending={actionPending()}
                        onRegenerate={(evtId) => void handleRegenerate(evtId)}
                      />
                    </Match>
                  </Switch>
                </div>
                <Lightbox
                  items={mediaStore}
                  index={lightboxIndex()}
                  onIndexChange={(nextIdx) => {
                    const item = mediaStore[nextIdx];
                    setLightboxKey(item ? mediaItemKey(item) : null);
                  }}
                  onClose={() => setLightboxKey(null)}
                  actions={(item) => (
                    <Show when={canRegenItem(item)}>
                      <button
                        type="button"
                        class="btn btn-sm btn-ghost"
                        disabled={actionPending()}
                        onClick={() => void handleRegenerate(item.event_id!)}
                      >
                        <Icons.Refresh class="size-4" />
                        Regenerate
                      </button>
                    </Show>
                  )}
                />
              </>
            );
          }}
        </Show>
      </Show>
    </section>
  );
}

export default JobDetail;
