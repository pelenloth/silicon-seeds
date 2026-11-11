import { A } from "@solidjs/router";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  Show,
  Switch,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { apiGet, mediaUrl, type MediaItem } from "../../lib/api-client";
import { CREATE_KINDS, type CreateKind } from "../../lib/create-job";
import {
  eventKind,
  formatDuration,
  isCancelledEvent,
  jobDurationMs,
  jobStatusMeta,
  plural,
  summarizeEvents,
  type EventKind,
  type JobAction,
  type JobEvent,
  type JobSummary,
} from "../../lib/job-view";
import { onJobUpdate } from "../../lib/sse";
import { jobs, runJobAction } from "../../stores/jobs";
import { nowTick } from "../../stores/shell";
import { Icons, KIND_ICONS } from "../Icons";
import { EmptyState } from "../ui/EmptyState";
import { Lightbox } from "../ui/Lightbox";
import { MediaTile } from "../ui/MediaTile";
import { StatusBadge } from "../ui/StatusBadge";

export type ResultPanelProps = {
  jobId: string | undefined;
  kind: CreateKind;
  emptyTitle: string;
  emptyHint: string;
  pending?: boolean;
  pendingCount?: number;
  onGenerateAgain?: () => void;
};

type KeyedMediaItem = MediaItem & { id: string; jobId: string };

function mediaItemKey(item: MediaItem & { id?: string }): string {
  if (typeof item.id === "string" && item.id) return item.id;
  return `${item.subfolder ?? ""}/${item.filename}`;
}

const COMPOSE_STEPS: readonly { kind: EventKind; label: string }[] = [
  { kind: "text", label: "Script" },
  { kind: "image", label: "Images" },
  { kind: "video", label: "Video clips" },
  { kind: "transition", label: "Transitions" },
  { kind: "audio", label: "Audio" },
  { kind: "composition", label: "Final cut" },
];

export function ResultPanel(props: ResultPanelProps) {
  const [jobStore, setJobStore] = createStore<JobSummary[]>([]);
  const [eventsStore, setEventsStore] = createStore<JobEvent[]>([]);
  const [mediaStore, setMediaStore] = createStore<KeyedMediaItem[]>([]);

  const [detailLoading, setDetailLoading] = createSignal(false);
  const [loadError, setLoadError] = createSignal<string | null>(null);
  const [refetchError, setRefetchError] = createSignal(false);
  const [actionPending, setActionPending] = createSignal(false);
  const [lightboxKey, setLightboxKey] = createSignal<string | null>(null);

  let disposed = false;
  let detailSeq = 0;
  let lastAppliedDetailSeq = 0;
  let mediaSeq = 0;
  let lastAppliedMediaSeq = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let prevJobId: string | undefined = "\0";

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
    if (!jobStore[0] || jobStore[0].id !== targetId) {
      setDetailLoading(true);
    }
    try {
      const data = await apiGet<{ job: JobSummary; events: JobEvent[] }>(
        `/api/jobs/${encodeURIComponent(targetId)}`,
      );
      if (disposed || targetId !== props.jobId || seq <= lastAppliedDetailSeq) {
        return;
      }
      lastAppliedDetailSeq = seq;
      if (data?.job) {
        setJobStore(reconcile([data.job], { key: "id", merge: true }));
      }
      setEventsStore(reconcile(data?.events ?? [], { key: "id", merge: true }));
      setLoadError(null);
      setRefetchError(false);
      setDetailLoading(false);
    } catch (err) {
      if (disposed || targetId !== props.jobId || seq <= lastAppliedDetailSeq) {
        return;
      }
      setDetailLoading(false);
      if (
        jobStore[0]?.id === targetId ||
        jobs().some((j) => j.id === targetId)
      ) {
        setRefetchError(true);
      } else {
        setLoadError(err instanceof Error ? err.message : "Failed to load job");
      }
    }
  };

  const fetchMedia = async (targetId: string) => {
    const seq = ++mediaSeq;
    try {
      const data = await apiGet<{ items: MediaItem[] }>(
        `/api/jobs/${encodeURIComponent(targetId)}/media?limit=100`,
      );
      if (disposed || targetId !== props.jobId || seq <= lastAppliedMediaSeq) {
        return;
      }
      lastAppliedMediaSeq = seq;
      const nextItems: KeyedMediaItem[] = (data?.items ?? []).map((it) => ({
        ...it,
        id: mediaItemKey(it),
        jobId: targetId,
      }));
      setMediaStore(reconcile(nextItems, { key: "id", merge: true }));
    } catch {
      if (disposed || targetId !== props.jobId || seq <= lastAppliedMediaSeq) {
        return;
      }
      if (
        jobStore[0]?.id === targetId ||
        mediaStore.some((m) => m.jobId === targetId)
      ) {
        setRefetchError(true);
      }
    }
  };

  const refetchAll = () => {
    clearDebounce();
    const id = props.jobId;
    if (!id) return;
    void fetchDetail(id);
    void fetchMedia(id);
  };

  createEffect(() => {
    const currentId = props.jobId;
    if (currentId === prevJobId) return;
    prevJobId = currentId;
    clearDebounce();
    lastAppliedDetailSeq = detailSeq;
    lastAppliedMediaSeq = mediaSeq;
    setJobStore([]);
    setEventsStore([]);
    setMediaStore([]);
    setLoadError(null);
    setRefetchError(false);
    setLightboxKey(null);
    if (!currentId) {
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    void fetchDetail(currentId);
    void fetchMedia(currentId);
  });

  const scheduleDebouncedRefetch = () => {
    if (debounceTimer !== null) return;
    const scheduledId = props.jobId;
    if (!scheduledId) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (!disposed && props.jobId === scheduledId) {
        void fetchDetail(scheduledId);
        void fetchMedia(scheduledId);
      }
    }, 400);
  };

  onJobUpdate(() => props.jobId, scheduleDebouncedRefetch);

  const job = createMemo<JobSummary | undefined>(() => {
    const id = props.jobId;
    if (!id) return undefined;
    const d = jobStore[0];
    const s = jobs().find((j) => j.id === id);
    if (d && d.id === id) {
      return s
        ? {
            ...d,
            status: s.status,
            progress: s.progress,
            thumb: s.thumb ?? d.thumb,
          }
        : d;
    }
    return s;
  });

  const currentMedia = createMemo<KeyedMediaItem[]>(() => {
    const id = props.jobId;
    if (!id) return [];
    return mediaStore.filter((m) => m.jobId === id);
  });

  const currentEvents = createMemo<JobEvent[]>(() => {
    const id = props.jobId;
    if (!id) return [];
    return eventsStore.filter((e) => !e.jobId || e.jobId === id);
  });

  const lightboxIndex = createMemo<number | null>(() => {
    const key = lightboxKey();
    if (!key) return null;
    const idx = currentMedia().findIndex((it) => mediaItemKey(it) === key);
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

  const failedError = () => {
    const evt = currentEvents().find(
      (e) =>
        e.status === "failed" &&
        !isCancelledEvent(e) &&
        Boolean(e.error?.trim()),
    );
    return evt?.error?.trim() || "Generation failed";
  };

  const statusLine = () => {
    const j = job();
    if (!j) return "";
    switch (j.status) {
      case "active": {
        const currentLabel = summarizeEvents(currentEvents()).currentLabel;
        const meta = jobStatusMeta(j.status, j.progress);
        const label =
          currentLabel ??
          (meta.label === "Finishing" ? "Finishing" : "Waiting in queue");
        return `${j.progress.complete} of ${j.progress.total} · ${label}`;
      }
      case "complete": {
        const dur = formatDuration(
          jobDurationMs(j.created_at, currentEvents(), j.status, nowTick()),
        );
        return `${plural(currentMedia().length, "output")} · ${dur}`;
      }
      case "failed":
        return failedError();
      case "paused":
        return "Paused";
      case "cancelled":
        return "Cancelled";
      default:
        return j.status;
    }
  };

  const handleAction = async (action: JobAction) => {
    const j = job();
    if (!j || actionPending()) return;
    setActionPending(true);
    try {
      await runJobAction(j, action);
      refetchAll();
    } finally {
      setActionPending(false);
    }
  };

  const pageJobKind = () => CREATE_KINDS[props.kind].jobKind;

  const kindIcon = () => {
    const Icon = KIND_ICONS[pageJobKind()];
    return <Icon class="size-8" />;
  };

  const imageItems = () =>
    currentMedia().filter((m) => m.mediaType === "image");
  const videoItems = () =>
    currentMedia().filter((m) => m.mediaType === "video");
  const audioItems = () =>
    currentMedia().filter((m) => m.mediaType === "audio");

  const pendingTileCount = () => Math.max(1, props.pendingCount ?? 1);

  return (
    <section
      id="result-panel"
      class="panel flex min-h-[20rem] min-w-0 flex-col xl:sticky xl:top-6 xl:max-h-[calc(100dvh-6.5rem)]"
    >
      <Show
        when={!props.pending}
        fallback={
          <>
            <header class="flex items-center justify-between gap-2 border-b border-base-300 px-4 py-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold">Starting your job</p>
                <p class="text-xs text-base-content/60" aria-live="polite">
                  Naming and queueing. This can take a few seconds.
                </p>
              </div>
            </header>
            <progress class="progress progress-primary h-1 w-full rounded-none" />
            <div class="min-h-0 flex-1 overflow-y-auto scroll-thin p-4">
              <div
                class={`grid gap-2 ${pendingTileCount() === 1 ? "grid-cols-1" : "grid-cols-2"}`}
              >
                <For
                  each={Array.from({ length: pendingTileCount() }, (_, i) => i)}
                >
                  {() => <div class="skeleton aspect-video rounded-box" />}
                </For>
              </div>
            </div>
          </>
        }
      >
        <Show
          when={job()}
          fallback={
            <Show
              when={Boolean(props.jobId && loadError())}
              fallback={
                <Show
                  when={props.jobId && detailLoading()}
                  fallback={
                    <EmptyState
                      class="flex-1"
                      icon={kindIcon()}
                      title={props.emptyTitle}
                      description={props.emptyHint}
                    />
                  }
                >
                  <div class="flex flex-1 flex-col gap-3 p-4">
                    <div class="skeleton h-5 w-48" />
                    <div class="skeleton aspect-video w-full rounded-box" />
                  </div>
                </Show>
              }
            >
              <div class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                <p class="text-sm text-error" role="alert">
                  {loadError()}
                </p>
                <button type="button" class="btn btn-xs" onClick={refetchAll}>
                  Try again
                </button>
              </div>
            </Show>
          }
        >
          {(currentJob) => {
            const isKindMismatch = () => currentJob().kind !== pageJobKind();
            const skeletonImageCount = () =>
              currentJob().status === "active"
                ? Math.max(currentJob().progress.total - imageItems().length, 0)
                : 0;
            const totalImageTiles = () =>
              imageItems().length + skeletonImageCount();

            return (
              <Show
                when={!isKindMismatch()}
                fallback={
                  <EmptyState
                    class="flex-1"
                    title={`This job is a ${currentJob().kind} job`}
                    action={
                      <A
                        class="btn btn-sm btn-primary"
                        href={`/jobs/${encodeURIComponent(currentJob().id)}`}
                      >
                        Open job
                      </A>
                    }
                  />
                }
              >
                <>
                  <header class="flex items-center justify-between gap-2 border-b border-base-300 px-4 py-3">
                    <div class="min-w-0">
                      <p class="truncate text-sm font-semibold">
                        {currentJob().name}
                      </p>
                      <p
                        class="text-xs text-base-content/60"
                        aria-live="polite"
                      >
                        {statusLine()}
                      </p>
                    </div>
                    <StatusBadge
                      kind="job"
                      status={currentJob().status}
                      progress={currentJob().progress}
                      size="md"
                    />
                  </header>
                  <Show when={refetchError()}>
                    <div
                      role="status"
                      class="mx-4 mt-2 flex items-center justify-between gap-2 rounded-field bg-base-200 px-3 py-1.5 text-xs text-base-content/80"
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
                  <Show when={currentJob().status === "active"}>
                    <progress
                      class="progress progress-primary h-1 w-full rounded-none"
                      value={currentJob().progress.complete}
                      max={Math.max(currentJob().progress.total, 1)}
                    />
                  </Show>
                  <div class="min-h-0 flex-1 overflow-y-auto scroll-thin p-4">
                    <Show
                      when={
                        !(
                          currentJob().status === "failed" &&
                          currentMedia().length === 0
                        )
                      }
                      fallback={
                        <EmptyState
                          title="Generation failed"
                          description={failedError()}
                        />
                      }
                    >
                      <Switch>
                        <Match when={props.kind === "image"}>
                          <div
                            class={`grid gap-2 ${totalImageTiles() === 1 ? "grid-cols-1" : "grid-cols-2"}`}
                          >
                            <For each={imageItems()}>
                              {(item) => (
                                <MediaTile
                                  item={item}
                                  aspect="video"
                                  onOpen={() => openLightboxForItem(item)}
                                />
                              )}
                            </For>
                            <For
                              each={Array.from(
                                { length: skeletonImageCount() },
                                (_, i) => i,
                              )}
                            >
                              {() => (
                                <div class="skeleton aspect-video rounded-box" />
                              )}
                            </For>
                          </div>
                        </Match>
                        <Match
                          when={
                            props.kind === "video" ||
                            props.kind === "text-to-video"
                          }
                        >
                          <div class="flex flex-col gap-4">
                            <Show
                              when={videoItems()[videoItems().length - 1]}
                              fallback={
                                <div class="skeleton aspect-video w-full rounded-box" />
                              }
                            >
                              {(newestVideo) => (
                                <MediaTile
                                  item={newestVideo()}
                                  aspect="video"
                                  onOpen={() =>
                                    openLightboxForItem(newestVideo())
                                  }
                                />
                              )}
                            </Show>
                            <Show
                              when={
                                props.kind === "video" &&
                                imageItems().length > 0
                              }
                            >
                              <div class="space-y-2">
                                <div class="section-label">
                                  Intermediate image (used for I2V)
                                </div>
                                <div class="max-w-xs">
                                  <MediaTile
                                    item={imageItems()[0]}
                                    aspect="video"
                                    onOpen={() =>
                                      openLightboxForItem(imageItems()[0])
                                    }
                                  />
                                </div>
                              </div>
                            </Show>
                          </div>
                        </Match>
                        <Match when={props.kind === "audio"}>
                          <div class="flex flex-col gap-2">
                            <For each={audioItems()}>
                              {(item) => (
                                <div class="panel p-3">
                                  <div class="flex items-center justify-between gap-2">
                                    <p class="truncate font-mono text-xs">
                                      {item.filename}
                                    </p>
                                    <button
                                      type="button"
                                      class="btn btn-ghost btn-xs"
                                      onClick={() => openLightboxForItem(item)}
                                    >
                                      Open
                                    </button>
                                  </div>
                                  <audio
                                    controls
                                    preload="none"
                                    src={mediaUrl(item)}
                                    class="mt-2 w-full"
                                  />
                                </div>
                              )}
                            </For>
                            <Show
                              when={
                                currentJob().status === "active" &&
                                audioItems().length === 0
                              }
                            >
                              <div class="skeleton h-14 w-full rounded-box" />
                            </Show>
                          </div>
                        </Match>
                        <Match when={props.kind === "compose"}>
                          <div class="flex flex-col gap-4">
                            <ul class="divide-y divide-base-300 rounded-box border border-base-300">
                              <For
                                each={COMPOSE_STEPS.filter(
                                  (s) =>
                                    summarizeEvents(currentEvents()).byKind[
                                      s.kind
                                    ] > 0,
                                )}
                              >
                                {(step) => {
                                  const stepEvents = () =>
                                    currentEvents().filter(
                                      (e) => eventKind(e.type) === step.kind,
                                    );
                                  const allComplete = () =>
                                    stepEvents().length > 0 &&
                                    stepEvents().every(
                                      (e) => e.status === "complete",
                                    );
                                  const anyRunning = () =>
                                    stepEvents().some(
                                      (e) => e.status === "running",
                                    );
                                  return (
                                    <li class="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                                      <span>{step.label}</span>
                                      <span class="flex items-center gap-2 text-xs text-base-content/60 tabular-nums">
                                        <span>{stepEvents().length}</span>
                                        <Show
                                          when={allComplete()}
                                          fallback={
                                            <Show when={anyRunning()}>
                                              <span class="loading loading-spinner loading-xs text-primary" />
                                            </Show>
                                          }
                                        >
                                          <Icons.Check class="size-4 text-success" />
                                        </Show>
                                      </span>
                                    </li>
                                  );
                                }}
                              </For>
                            </ul>
                            <Show
                              when={
                                currentJob().status === "complete" &&
                                videoItems()[videoItems().length - 1]
                              }
                            >
                              {(finalCut) => (
                                <MediaTile
                                  item={finalCut()}
                                  aspect="video"
                                  onOpen={() => openLightboxForItem(finalCut())}
                                />
                              )}
                            </Show>
                          </div>
                        </Match>
                      </Switch>
                    </Show>
                  </div>
                  <footer class="flex flex-wrap items-center justify-end gap-2 border-t border-base-300 px-4 py-3">
                    <Show when={currentJob().status === "paused"}>
                      <button
                        type="button"
                        class="btn btn-sm"
                        disabled={actionPending()}
                        onClick={() => void handleAction("resume")}
                      >
                        Resume
                      </button>
                    </Show>
                    <Show
                      when={
                        currentJob().status === "active" ||
                        currentJob().status === "paused"
                      }
                    >
                      <button
                        type="button"
                        class="btn btn-sm btn-ghost text-error"
                        disabled={actionPending()}
                        onClick={() => void handleAction("cancel")}
                      >
                        Cancel
                      </button>
                    </Show>
                    <Show when={currentJob().status === "failed"}>
                      <button
                        type="button"
                        class="btn btn-sm"
                        disabled={actionPending()}
                        onClick={() => void handleAction("retry")}
                      >
                        Retry
                      </button>
                    </Show>
                    <Show
                      when={
                        (currentJob().status === "complete" ||
                          currentJob().status === "failed" ||
                          currentJob().status === "cancelled") &&
                        props.onGenerateAgain
                      }
                    >
                      <button
                        type="button"
                        class="btn btn-sm btn-ghost"
                        onClick={() => props.onGenerateAgain?.()}
                      >
                        Generate again
                      </button>
                    </Show>
                    <A
                      class="btn btn-sm btn-primary"
                      href={`/jobs/${encodeURIComponent(currentJob().id)}`}
                    >
                      Open job
                    </A>
                  </footer>
                  <Lightbox
                    items={currentMedia()}
                    index={lightboxIndex()}
                    onIndexChange={(nextIdx) => {
                      const item = currentMedia()[nextIdx];
                      setLightboxKey(item ? mediaItemKey(item) : null);
                    }}
                    onClose={() => setLightboxKey(null)}
                  />
                </>
              </Show>
            );
          }}
        </Show>
      </Show>
    </section>
  );
}

export default ResultPanel;
