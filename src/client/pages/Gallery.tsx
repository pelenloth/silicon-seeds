import { A, useNavigate, useSearchParams } from "@solidjs/router";
import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { Icons } from "../components/Icons";
import { EmptyState } from "../components/ui/EmptyState";
import { Lightbox } from "../components/ui/Lightbox";
import { MediaTile } from "../components/ui/MediaTile";
import { Segmented } from "../components/ui/Segmented";
import {
  ApiError,
  apiGet,
  type GalleryItem,
  type GalleryPageResponse,
  type MediaItem,
  type MediaType,
} from "../lib/api-client";
import { setPrefill } from "../lib/form-state";
import {
  galleryPageDecision,
  jobToPrefill,
  plural,
  shouldShowNewMedia,
  type JobSummary,
} from "../lib/job-view";
import { jobs, jobsLoaded } from "../stores/jobs";
import { toast } from "../stores/toast";

type FilterType = "all" | MediaType;
type KeyedMediaItem = MediaItem & { id: string };

const FILTER_OPTIONS: readonly { value: FilterType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "audio", label: "Audio" },
];

const SKELETON_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const MAX_CONSECUTIVE_SKIPS = 10;

function parseFilterType(raw: string | string[] | undefined): FilterType {
  const val = Array.isArray(raw) ? raw[0] : raw;
  if (val === "image" || val === "video" || val === "audio") return val;
  return "all";
}

function galleryItemKey(item: {
  id?: string;
  meta_id?: string;
  subfolder?: string;
  filename: string;
}): string {
  if (typeof item.id === "string" && item.id) return item.id;
  if (typeof item.meta_id === "string" && item.meta_id) return item.meta_id;
  return `${item.subfolder ?? ""}/${item.filename}`;
}

function toKeyedMediaItems(raw: readonly GalleryItem[]): KeyedMediaItem[] {
  const out: KeyedMediaItem[] = [];
  for (const item of raw) {
    if (
      item.mediaType !== "image" &&
      item.mediaType !== "video" &&
      item.mediaType !== "audio"
    ) {
      continue;
    }
    const id = galleryItemKey(item);
    out.push({
      id,
      meta_id: item.meta_id,
      event_id: item.event_id,
      job_id: item.job_id,
      job_name: item.job_name,
      filename: item.filename,
      subfolder: item.subfolder,
      created_at: item.created_at,
      mediaType: item.mediaType,
    });
  }
  return out;
}

export default function Gallery() {
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();

  const type = createMemo<FilterType>(() => parseFilterType(search.type));

  const setType = (next: string) => {
    const valid = parseFilterType(next);
    setSearch({ type: valid === "all" ? undefined : valid }, { replace: true });
  };

  const [items, setItems] = createStore<KeyedMediaItem[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [reloadError, setReloadError] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(true);
  const [stalled, setStalled] = createSignal(false);
  const [hasNew, setHasNew] = createSignal(false);
  const [loadedAnnouncement, setLoadedAnnouncement] = createSignal("");
  const [lightboxKey, setLightboxKey] = createSignal<string | null>(null);
  const [reusePending, setReusePending] = createSignal(false);

  let sentinelRef: HTMLDivElement | undefined;
  let observer: IntersectionObserver | null = null;
  let abortController: AbortController | null = null;
  let rearmFrame: number | null = null;
  let requestSeq = 0;
  let cursorValue: string | undefined;
  let inFlightCursor: string | null = null;
  let disposed = false;

  const cancelRearm = () => {
    if (rearmFrame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(rearmFrame);
      rearmFrame = null;
    }
  };

  const rearmObserver = () => {
    cancelRearm();
    if (typeof requestAnimationFrame !== "function") return;
    rearmFrame = requestAnimationFrame(() => {
      rearmFrame = null;
      if (disposed || !observer || !sentinelRef || !hasMore() || stalled())
        return;
      observer.unobserve(sentinelRef);
      observer.observe(sentinelRef);
    });
  };

  const abortInFlight = () => {
    cancelRearm();
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    inFlightCursor = null;
  };

  const fetchPage = async (mode: "reset" | "reload" | "append") => {
    const filterType = type();
    const c = mode === "append" ? cursorValue : undefined;
    const cursorKey = c ?? "__top__";

    if (mode === "append") {
      if (loading() || !hasMore()) return;
      if (inFlightCursor === cursorKey) return;
    } else {
      abortInFlight();
    }

    const seq = ++requestSeq;
    const controller = new AbortController();
    abortController = controller;
    inFlightCursor = cursorKey;

    if (mode === "reset") {
      batch(() => {
        setItems([]);
        setError(null);
        setReloadError(false);
        setHasMore(true);
        setStalled(false);
        setHasNew(false);
        setLoading(true);
      });
      cursorValue = undefined;
    } else if (mode === "reload") {
      batch(() => {
        setReloadError(false);
        setStalled(false);
        setLoading(true);
      });
    } else {
      batch(() => {
        setError(null);
        setStalled(false);
        setLoading(true);
      });
    }

    let shouldRearm = false;
    let pageCursor = c;
    const replacePending = mode !== "append";
    let skips = 0;
    try {
      for (;;) {
        const q = new URLSearchParams();
        if (pageCursor) q.set("cursor", pageCursor);
        if (filterType !== "all") q.set("type", filterType);
        q.set("limit", "20");

        const data = await apiGet<GalleryPageResponse>(
          `/api/gallery/items?${q.toString()}`,
          { signal: controller.signal },
        );
        if (disposed || seq !== requestSeq || filterType !== type()) {
          return;
        }

        const raw = Array.isArray(data?.items) ? data.items : [];
        const nextKeyed = toKeyedMediaItems(raw);
        const hasNextCursorField =
          data !== null &&
          typeof data === "object" &&
          "next_cursor" in data &&
          data.next_cursor !== undefined;

        const lastMetaId =
          raw.length > 0 ? raw[raw.length - 1]?.meta_id : undefined;
        const more = hasNextCursorField
          ? data.next_cursor !== null && Boolean(data.next_cursor)
          : raw.length >= 20 && Boolean(lastMetaId);
        const nextCursor = hasNextCursorField
          ? (data.next_cursor ?? undefined)
          : more
            ? lastMetaId
            : undefined;

        const deduped: KeyedMediaItem[] = [];
        const existingKeys = new Set(
          replacePending ? [] : items.map((it) => it.id),
        );
        for (const it of nextKeyed) {
          if (!existingKeys.has(it.id)) {
            existingKeys.add(it.id);
            deduped.push(it);
          }
        }

        const decision = galleryPageDecision({
          added: deduped.length,
          nextCursor,
          prevCursor: pageCursor,
        });
        if (decision === "stalled" && mode === "append") {
          batch(() => {
            setStalled(true);
            setError("Could not load more.");
            setLoading(false);
          });
          return;
        }
        if (decision === "skip" && nextCursor) {
          cursorValue = nextCursor;
          skips += 1;
          if (skips > MAX_CONSECUTIVE_SKIPS) {
            batch(() => {
              setStalled(true);
              setError("Could not load more.");
              setLoading(false);
            });
            return;
          }
          pageCursor = nextCursor;
          continue;
        }

        batch(() => {
          if (replacePending) {
            setItems(reconcile(deduped, { key: "id", merge: true }));
          } else if (deduped.length > 0) {
            setItems((prev) => [...prev, ...deduped]);
          }

          if (nextCursor) {
            cursorValue = nextCursor;
          } else if (mode !== "append") {
            cursorValue = undefined;
          }
          setHasMore(more);
          setStalled(false);
          setError(null);
          setReloadError(false);
          setLoading(false);
          setLoadedAnnouncement(`Loaded ${plural(items.length, "item")}`);
        });
        shouldRearm = more;
        break;
      }
    } catch (err) {
      if (
        disposed ||
        controller.signal.aborted ||
        seq !== requestSeq ||
        filterType !== type()
      ) {
        return;
      }
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load media";
      batch(() => {
        if (mode === "reload" && items.length > 0) {
          setReloadError(true);
        } else {
          setError(msg);
        }
        setLoading(false);
      });
    } finally {
      if (seq === requestSeq) {
        inFlightCursor = null;
        if (abortController === controller) {
          abortController = null;
        }
        if (shouldRearm) {
          rearmObserver();
        }
      }
    }
  };

  createEffect(
    on(type, () => {
      cancelRearm();
      void fetchPage("reset");
    }),
  );

  const completedJobsCount = createMemo(
    () => jobs().filter((j) => j.status === "complete").length,
  );

  let prevCompletedCount: number | null = jobsLoaded()
    ? completedJobsCount()
    : null;

  createEffect(() => {
    const loaded = jobsLoaded();
    const count = completedJobsCount();
    if (!loaded) return;
    if (shouldShowNewMedia(prevCompletedCount, count)) {
      setHasNew(true);
    }
    prevCompletedCount = count;
  });

  const reloadFromTop = () => {
    setHasNew(false);
    const main = document.getElementById("app-main");
    if (main) {
      main.scrollTop = 0;
    }
    void fetchPage("reload");
  };

  onMount(() => {
    if (typeof IntersectionObserver === "function" && sentinelRef) {
      observer = new IntersectionObserver(
        (entries) => {
          if (
            entries.some((e) => e.isIntersecting) &&
            hasMore() &&
            !stalled() &&
            !loading() &&
            !error() &&
            !reloadError()
          ) {
            void fetchPage("append");
          }
        },
        {
          root: document.getElementById("app-main"),
          rootMargin: "400px",
        },
      );
      observer.observe(sentinelRef);
    }
  });

  onCleanup(() => {
    disposed = true;
    cancelRearm();
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    abortInFlight();
  });

  const lightboxIndex = createMemo<number | null>(() => {
    const key = lightboxKey();
    if (!key) return null;
    const idx = items.findIndex((it) => it.id === key);
    return idx >= 0 ? idx : null;
  });

  createEffect(() => {
    if (lightboxKey() !== null && lightboxIndex() === null) {
      setLightboxKey(null);
    }
  });

  const reuse = async (item: MediaItem) => {
    if (!item.job_id || reusePending()) return;
    setReusePending(true);
    try {
      const data = await apiGet<{ job: JobSummary }>(
        `/api/jobs/${encodeURIComponent(item.job_id)}`,
      );
      if (disposed) return;
      const p = jobToPrefill(data.job);
      setPrefill(p.route, p.values);
      setLightboxKey(null);
      navigate(p.route);
    } catch (err) {
      if (disposed) return;
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load job settings";
      toast.error(msg);
    } finally {
      setReusePending(false);
    }
  };

  return (
    <div class="flex min-h-full flex-col fade-in" id="gallery-content">
      <div class="sticky top-0 z-10 flex items-center gap-3 border-b border-base-300 bg-base-100/90 px-4 py-2 backdrop-blur lg:px-6">
        <Segmented
          label="Filter"
          name="gallery-type"
          value={type()}
          onChange={setType}
          options={FILTER_OPTIONS}
        />
        <Show when={hasNew()}>
          <button
            type="button"
            class="btn btn-primary btn-xs ml-auto"
            onClick={reloadFromTop}
          >
            <Icons.Refresh class="size-4" />
            New media
          </button>
        </Show>
      </div>
      <div role="status" class="sr-only">
        {loadedAnnouncement()}
      </div>
      <div id="gallery-grid" class="page">
        <Show when={reloadError() && items.length > 0}>
          <div
            role="status"
            class="mb-4 flex items-center justify-between gap-2 rounded-field bg-base-200 px-3 py-1.5 text-xs text-base-content/80"
          >
            <span>Could not refresh.</span>
            <button
              type="button"
              class="btn btn-ghost btn-xs"
              onClick={reloadFromTop}
            >
              Try again
            </button>
          </div>
        </Show>
        <Show when={loading() && items.length === 0}>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            <For each={SKELETON_INDICES}>
              {() => <div class="skeleton aspect-[4/3] rounded-box" />}
            </For>
          </div>
        </Show>
        <Show when={Boolean(error()) && items.length === 0}>
          <div role="alert" class="alert alert-error alert-soft">
            <span class="flex-1 text-sm">{error()}</span>
            <button
              type="button"
              class="btn btn-xs"
              onClick={() => {
                if (stalled() && cursorValue) {
                  setStalled(false);
                  void fetchPage("append");
                } else {
                  void fetchPage("reset");
                }
              }}
            >
              Try again
            </button>
          </div>
        </Show>
        <Show when={!loading() && !error() && !hasMore() && items.length === 0}>
          <EmptyState
            title="Nothing here yet"
            description="Generated images, videos and audio collect here."
            action={
              <A href="/" class="btn btn-primary btn-sm">
                Create something
              </A>
            }
          />
        </Show>
        <Show when={items.length > 0}>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            <For each={items}>
              {(item, i) => (
                <MediaTile
                  item={item}
                  position={i() + 1}
                  onOpen={() => setLightboxKey(item.id)}
                />
              )}
            </For>
          </div>
        </Show>
        <div
          ref={sentinelRef}
          id="gallery-sentinel"
          class="py-6 text-center text-xs text-base-content/50"
        >
          <Show when={loading() && items.length > 0}>
            <span class="loading loading-spinner loading-sm" />
          </Show>
          <Show when={error() && items.length > 0}>
            <div class="inline-flex items-center gap-2 text-error">
              <span>Could not load more.</span>
              <button
                type="button"
                class="btn btn-ghost btn-xs"
                onClick={() => {
                  setStalled(false);
                  void fetchPage("append");
                }}
              >
                Try again
              </button>
            </div>
          </Show>
          <Show when={!loading() && !error() && !hasMore() && items.length > 0}>
            That is everything.
          </Show>
        </div>
      </div>
      <Lightbox
        items={items}
        index={lightboxIndex()}
        onIndexChange={(nextIdx) => {
          const nextItem = items[nextIdx];
          setLightboxKey(nextItem ? nextItem.id : null);
        }}
        onClose={() => setLightboxKey(null)}
        actions={(item) => (
          <>
            <Show when={item.job_id}>
              {(jobId) => (
                <A
                  class="btn btn-sm btn-ghost"
                  href={`/jobs/${encodeURIComponent(jobId())}?tab=media`}
                >
                  Open job
                </A>
              )}
            </Show>
            <Show when={item.job_id}>
              <button
                type="button"
                class="btn btn-sm btn-ghost"
                disabled={reusePending()}
                onClick={() => void reuse(item)}
              >
                Reuse settings
              </button>
            </Show>
          </>
        )}
      />
    </div>
  );
}
