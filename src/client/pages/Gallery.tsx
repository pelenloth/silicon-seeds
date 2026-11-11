import {
  createSignal,
  For,
  Show,
  onMount,
  createEffect,
  onCleanup,
  on,
  untrack,
} from "solid-js";
import { apiGet, type GalleryItem, getAssetPath } from "../lib/api-client";

function GalleryCard(props: { item: GalleryItem }) {
  const path = () => getAssetPath(props.item.subfolder, props.item.filename);
  return (
    <div class="card bg-base-100 border border-base-300 overflow-hidden rounded-box shadow-sm">
      <figure class="bg-base-300 overflow-hidden flex items-center justify-center">
        <Show
          when={props.item.mediaType === "image"}
          fallback={
            <Show
              when={props.item.mediaType === "video"}
              fallback={
                <div class="w-full p-4 flex flex-col gap-3 bg-base-200">
                  <div class="flex items-center gap-2 text-sm font-medium">
                    <span class="badge badge-sm badge-primary">audio</span>
                    <span class="truncate">{props.item.filename}</span>
                  </div>
                  <audio
                    controls
                    src={path()}
                    class="w-full"
                    preload="metadata"
                  />
                  <div class="text-xs opacity-60 truncate">
                    {props.item.subfolder || "root"} •{" "}
                    {new Date(props.item.created_at).toLocaleString()} •{" "}
                    {props.item.type}
                  </div>
                </div>
              }
            >
              <video
                src={path()}
                autoplay
                muted
                loop
                playsinline
                preload="metadata"
                controls
                class="w-full aspect-[4/3] object-cover"
              />
            </Show>
          }
        >
          <img
            src={path()}
            alt={props.item.filename}
            class="w-full aspect-[4/3] object-cover"
            loading="lazy"
            decoding="async"
          />
        </Show>
      </figure>
    </div>
  );
}

export default function Gallery() {
  const [type, setType] = createSignal<string>("all");
  const [cursor, setCursor] = createSignal<string | undefined>(undefined);
  const [items, setItems] = createSignal<GalleryItem[]>([]);
  const [hasMore, setHasMore] = createSignal(true);
  const [loading, setLoading] = createSignal(false);
  let abort: AbortController | null = null;

  const fetchItems = async (reset = false) => {
    if (untrack(() => loading())) return;
    if (untrack(() => !hasMore() && !reset)) return;
    setLoading(true);
    if (abort) abort.abort();
    abort = new AbortController();
    const c = reset ? undefined : untrack(() => cursor());
    const t = untrack(() => type());
    const q = new URLSearchParams();
    if (c) q.set("cursor", c);
    if (t && t !== "all") q.set("type", t);
    q.set("limit", "20");
    try {
      const data = await apiGet<{ items: GalleryItem[] }>(
        `/api/gallery/items?${q.toString()}`,
      );
      const fetched = data.items ?? [];
      if (reset) {
        setItems(fetched);
      } else {
        setItems((prev) => [...prev, ...fetched]);
      }
      if (fetched.length > 0) setCursor(fetched[fetched.length - 1].meta_id);
      if (fetched.length < 20) setHasMore(false);
      else setHasMore(true);
      if (fetched.length === 0) setHasMore(false);
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        console.error(e);
        setHasMore(false);
      }
    } finally {
      setLoading(false);
    }
  };

  // reset on type change - only track type, not loading/hasMore/cursor
  createEffect(
    on(type, () => {
      setItems([]);
      setCursor(undefined);
      setHasMore(true);
      void fetchItems(true);
    }),
  );

  // initial load
  onMount(() => {
    void fetchItems(true);
  });

  let sentinelRef: HTMLDivElement | undefined;
  let observer: IntersectionObserver | null = null;

  const observeSentinel = () => {
    if (observer) observer.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && untrack(() => hasMore() && !loading()))
          void fetchItems(false);
      },
      { rootMargin: "200px" },
    );
    if (sentinelRef) observer.observe(sentinelRef);
  };

  onMount(() => {
    observeSentinel();
  });

  createEffect(() => {
    // re-observe when items change (length)
    void items().length;
    observeSentinel();
  });

  onCleanup(() => {
    if (observer) observer.disconnect();
    if (abort) abort.abort();
  });

  return (
    <div
      class="flex flex-col bg-base-200 min-h-[calc(100vh-4rem)]"
      id="gallery-content"
    >
      <div class="flex items-center gap-6 px-6 py-4 bg-base-100 border-b border-base-300 sticky top-0 z-10">
        <div
          class="flex items-center gap-4"
          role="radiogroup"
          aria-label="Filter"
        >
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="gallery-type"
              value="all"
              checked={type() === "all"}
              onChange={() => setType("all")}
              class="radio radio-sm radio-primary"
            />
            <span class="text-sm font-semibold">All</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="gallery-type"
              value="image"
              checked={type() === "image"}
              onChange={() => setType("image")}
              class="radio radio-sm radio-primary"
            />
            <span class="text-sm font-semibold">Images</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="gallery-type"
              value="video"
              checked={type() === "video"}
              onChange={() => setType("video")}
              class="radio radio-sm radio-primary"
            />
            <span class="text-sm font-semibold">Videos</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="gallery-type"
              value="audio"
              checked={type() === "audio"}
              onChange={() => setType("audio")}
              class="radio radio-sm radio-primary"
            />
            <span class="text-sm font-semibold">Audio</span>
          </label>
        </div>
      </div>
      <div id="gallery-grid" class="p-6" aria-live="polite">
        <Show when={items().length === 0 && !loading() && !hasMore()}>
          <div class="text-center py-16 text-base-content/60">No items</div>
        </Show>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 items-start">
          <For each={items()}>{(item) => <GalleryCard item={item} />}</For>
        </div>
        <div ref={sentinelRef} id="gallery-sentinel" class="py-8 text-center">
          <Show when={loading()}>
            <span class="loading loading-spinner" />
          </Show>
          <Show when={!hasMore() && items().length > 0}>
            <div class="text-center py-8 text-base-content/60">
              No more items
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
