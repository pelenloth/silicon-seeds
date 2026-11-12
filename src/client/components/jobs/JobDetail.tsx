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
import {
  ApiError,
  apiGet,
  type JobMediaResponse,
  type MediaItem,
} from "../../lib/api-client";
import { setPrefill } from "../../lib/form-state";
import {
  availableJobActions,
  canRegenerate,
  formatDuration,
  formatRelativeTime,
  jobDurationMs,
  jobKindMeta,
  jobToPrefill,
  plural,
  progressFraction,
  shouldMoveMobileFocusForActive,
  type JobAction,
  type JobEvent,
  type JobSummary,
  type MobileFocusLocation,
  mediaItemKey,
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

function shouldMoveMobileFocus(): boolean {
  if (!isMobileViewport() || typeof document === "undefined") return false;
  const active = document.activeElement;
  let activeIn: MobileFocusLocation = "other";
  if (!active || active === document.body) {
    activeIn = "body";
  } else if (
    active instanceof HTMLElement &&
    active.hasAttribute("data-skeleton-back")
  ) {
    activeIn = "skeleton-back";
  } else if (document.getElementById("job-list")?.contains(active)) {
    activeIn = "list";
  } else if (document.getElementById("job-detail")?.contains(active)) {
    activeIn = "detail";
  }
  return shouldMoveMobileFocusForActive({ activeIn });
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
  let fallbackFocusRef: HTMLElement | undefined;
  const [actionPending, setActionPending] = createSignal(false);
  const [lightboxKey, setLightboxKey] = createSignal<string | null>(null);

  const [jobData, setJobData] = createSignal<JobSummary | undefined>(undefined);
  const [eventsStore, setEventsStore] = createStore<JobEvent[]>([]);
  const [mediaStore, setMediaStore] = createStore<KeyedMediaItem[]>([]);
  const [mediaLoaded, setMediaLoaded] = createSignal(false);
  const [mediaHasMore, setMediaHasMore] = createSignal(false);
  const [mediaLimit, setMediaLimit] = createSignal(100);
  const [mediaLoadError, setMediaLoadError] = createSignal<string | null>(null);
  const [mediaRefetchError, setMediaRefetchError] = createSignal(false);

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

  const focusMobileTarget = (
    targetId: string,
    getEl: () => HTMLElement | undefined,
  ) => {
    if (focusedForJobId !== targetId && shouldMoveMobileFocus()) {
      focusedForJobId = targetId;
      queueMicrotask(() => {
        if (shouldMoveMobileFocus()) {
          getEl()?.focus();
        }
      });
    }
  };

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

      focusMobileTarget(targetId, () => headingRef);
    } catch (err) {
      if (disposed || targetId !== props.id || seq <= lastAppliedDetailSeq) {
        return;
      }
      lastAppliedDetailSeq = seq;
      setDetailLoading(false);
      if (err instanceof ApiError && err.status === 404) {
        // The job is gone (removed here or in another tab).
        setNotFound(true);
        setLoadError(null);
        setRefetchError(false);
        focusMobileTarget(targetId, () => fallbackFocusRef);
      } else if (jobData()) {
        setRefetchError(true);
      } else {
        setNotFound(false);
        const msg = err instanceof Error ? err.message : "Failed to load job";
        setLoadError(msg);
        focusMobileTarget(targetId, () => fallbackFocusRef);
      }
    }
  };

  const fetchMedia = async (targetId: string, customLimit?: number) => {
    const seq = ++mediaSeq;
    const lim = customLimit ?? mediaLimit();
    try {
      const data = await apiGet<JobMediaResponse>(
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
      setMediaHasMore(Boolean(data.hasMore));
      setMediaLoadError(null);
      setMediaRefetchError(false);
      setMediaLoaded(true);
    } catch (err) {
      if (disposed || targetId !== props.id || seq <= lastAppliedMediaSeq) {
        return;
      }
      lastAppliedMediaSeq = seq;
      if (mediaStore.length > 0) {
        setMediaRefetchError(true);
      } else {
        const msg = err instanceof Error ? err.message : "Failed to load media";
        setMediaLoadError(msg);
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
        lastAppliedDetailSeq = detailSeq;
        lastAppliedMediaSeq = mediaSeq;
        setJobData(undefined);
        setEventsStore(reconcile([], { key: "id", merge: true }));
        setMediaStore(reconcile([], { key: "id", merge: true }));
        setMediaLoaded(false);
        setMediaHasMore(false);
        setMediaLimit(100);
        setMediaLoadError(null);
        setMediaRefetchError(false);
        setNotFound(false);
        setLoadError(null);
        setRefetchError(false);
        setDetailLoading(true);
        setLightboxKey(null);
        if (shouldMoveMobileFocus()) {
          queueMicrotask(() => {
            if (shouldMoveMobileFocus()) {
              fallbackFocusRef?.focus();
            }
          });
        }
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
    setMediaLimit(1000);
    void fetchMedia(props.id, 1000);
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
    let started = false;
    try {
      const ok = await runJobAction(j, action, {
        onStart: () => {
          started = true;
          setActionPending(true);
        },
      });
      if (ok && action === "delete") {
        navigate(backHref());
      } else if (started) {
        refetchAll();
      }
    } finally {
      if (started) {
        setActionPending(false);
      }
    }
  };

  const handleRegenerate = async (eventId: string) => {
    if (actionPending()) return;
    let started = false;
    try {
      await regenerateEvent(props.id, eventId, {
        onStart: () => {
          started = true;
          setActionPending(true);
        },
      });
      if (started) {
        refetchAll();
      }
    } finally {
      if (started) {
        setActionPending(false);
      }
    }
  };

  const canRegenItem = (item: MediaItem) => {
    const evt = item.event_id
      ? eventsStore.find((e) => e.id === item.event_id)
      : undefined;
    return evt ? canRegenerate(evt.type) : false;
  };

  const BackToJobs = (backProps: {
    ref?: (el: HTMLAnchorElement) => void;
    skeleton?: boolean;
  }) => (
    <A
      ref={backProps.ref}
      href={backHref()}
      data-skeleton-back={backProps.skeleton ? "" : undefined}
      class="btn btn-ghost btn-xs mb-2 self-start lg:hidden"
    >
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
            <BackToJobs ref={(el) => (fallbackFocusRef = el)} skeleton />
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
                      <BackToJobs
                        ref={(el) => (fallbackFocusRef = el)}
                        skeleton
                      />
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
                  <BackToJobs ref={(el) => (fallbackFocusRef = el)} skeleton />
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
              const ms = jobDurationMs(
                currentJob().created_at,
                eventsStore,
                currentJob().status,
                nowTick(),
              );
              return ms !== null ? formatDuration(ms) : null;
            };
            const outputsText = () =>
              mediaHasMore()
                ? `${mediaStore.length}+ outputs`
                : plural(mediaStore.length, "output");

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
                          class="inline-flex items-center"
                        >
                          <StatusBadge
                            kind="job"
                            status={currentJob().status}
                            progress={currentJob().progress}
                            size="md"
                          />
                        </span>
                        <Show when={progressFraction(currentJob().progress)}>
                          {(f) => (
                            <span class="text-xs text-base-content/60 tabular-nums">
                              {f()}
                            </span>
                          )}
                        </Show>
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
                        {outputsText()}
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
                  <nav
                    class="tabs tabs-border -mb-px mt-3"
                    aria-label="Job sections"
                  >
                    <TabLink
                      href={tabHref("status")}
                      active={props.tab === "status"}
                      variant="tab"
                    >
                      Status
                    </TabLink>
                    <TabLink
                      href={tabHref("media")}
                      active={props.tab === "media"}
                      variant="tab"
                    >
                      Media
                      <span class="badge badge-ghost badge-xs ml-1">
                        {mediaStore.length}
                        {mediaHasMore() ? "+" : ""}
                      </span>
                    </TabLink>
                    <TabLink
                      href={tabHref("events")}
                      active={props.tab === "events"}
                      variant="tab"
                    >
                      Events
                      <span class="badge badge-ghost badge-xs ml-1">
                        {eventsStore.length}
                      </span>
                    </TabLink>
                  </nav>
                </header>
                <div class="page relative min-h-0 flex-1 overflow-y-auto scroll-thin">
                  <Switch>
                    <Match when={props.tab === "status"}>
                      <JobOverview
                        job={currentJob()}
                        events={eventsStore}
                        media={mediaStore}
                        mediaHasMore={mediaHasMore()}
                        mediaHref={tabHref("media")}
                        onOpenMedia={openLightboxForItem}
                      />
                    </Match>
                    <Match when={props.tab === "media"}>
                      <JobMedia
                        media={mediaStore}
                        hasMore={mediaHasMore()}
                        capped={mediaLimit() >= 1000}
                        loaded={mediaLoaded()}
                        error={mediaLoadError()}
                        refetchError={mediaRefetchError()}
                        onRetry={() => void fetchMedia(props.id)}
                        onOpen={openLightboxForItem}
                        onShowAll={
                          mediaLimit() >= 1000 ? undefined : handleShowAllMedia
                        }
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
