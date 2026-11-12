import {
  createEffect,
  createMemo,
  createSignal,
  Match,
  on,
  onCleanup,
  Show,
  Switch,
} from "solid-js";
import { mediaUrl, thumbUrl, type MediaItem } from "../../lib/api-client";
import {
  createPointerLatch,
  mediaKindLabel,
  mediaTitle,
  shouldPreviewOnFocus,
} from "../../lib/job-view";
import { Icons } from "../Icons";

export type MediaTileProps = {
  item: MediaItem;
  onOpen?: () => void;
  class?: string;
  aspect?: "video" | "square" | "photo";
  /** Plain 1-based list position; shifts when newer items arrive ahead of it. */
  position?: number;
};

const ASPECT: Record<"video" | "square" | "photo", string> = {
  video: "aspect-video",
  square: "aspect-square",
  photo: "aspect-[4/3]",
};

function prefersReducedMotion(): boolean {
  try {
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function"
    ) {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
  } catch {}
  return false;
}

export function MediaTile(props: MediaTileProps) {
  let v: HTMLVideoElement | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let thumbAttemptedRetry = false;
  const pointerLatch = createPointerLatch();

  const [failed, setFailed] = createSignal(false);
  const [thumbRetry, setThumbRetry] = createSignal(false);
  const [imgFallback, setImgFallback] = createSignal(false);
  const [posterFailed, setPosterFailed] = createSignal(false);
  const [playing, setPlaying] = createSignal(false);

  const clearRetryTimer = () => {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  onCleanup(clearRetryTimer);

  const hasExplicitSrc = () => Boolean(props.item.src);
  const origSrc = () => mediaUrl(props.item);
  const thumbSrc = () =>
    `${thumbUrl(props.item, 640)}${thumbRetry() ? "&r=1" : ""}`;
  const imageSrc = () =>
    hasExplicitSrc() || imgFallback() ? origSrc() : thumbSrc();
  const useVideoPoster = () => !hasExplicitSrc() && !posterFailed();
  const title = () => mediaTitle(props.item);
  const accessibleName = () => {
    const base = `Open ${title()}, ${mediaKindLabel(props.item).toLowerCase()}`;
    return props.position !== undefined ? `${base} ${props.position}` : base;
  };

  const itemKey = createMemo(
    () =>
      `${props.item.src ?? ""}|${props.item.subfolder ?? ""}|${props.item.filename}|${props.item.mediaType ?? ""}`,
  );

  createEffect(
    on(
      itemKey,
      () => {
        clearRetryTimer();
        thumbAttemptedRetry = false;
        setThumbRetry(false);
        setFailed(false);
        setImgFallback(false);
        setPosterFailed(false);
        setPlaying(false);
      },
      { defer: true },
    ),
  );

  const onImageError = () => {
    if (!hasExplicitSrc() && !imgFallback()) {
      if (!thumbAttemptedRetry) {
        if (retryTimer !== null) return;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          thumbAttemptedRetry = true;
          setThumbRetry(true);
        }, 1500);
        return;
      }
      clearRetryTimer();
      setImgFallback(true);
    } else {
      clearRetryTimer();
      setFailed(true);
    }
  };

  const onPosterError = () => {
    if (!thumbAttemptedRetry) {
      if (retryTimer !== null) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        thumbAttemptedRetry = true;
        setThumbRetry(true);
      }, 1500);
      return;
    }
    clearRetryTimer();
    setPosterFailed(true);
  };

  const playVideo = () => {
    if (prefersReducedMotion()) return;
    if (v) {
      v.play().catch(() => {});
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    pointerLatch.note(e.pointerType || null);
  };

  const onPointerCancel = () => {
    pointerLatch.clear();
  };

  const onPointerEnter = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    playVideo();
  };

  const onFocus = (e: FocusEvent & { currentTarget: HTMLButtonElement }) => {
    const pointerType = pointerLatch.consume();
    if (!shouldPreviewOnFocus(pointerType)) return;
    try {
      if (!e.currentTarget.matches(":focus-visible")) return;
    } catch {
      return;
    }
    playVideo();
  };

  const stopVideo = () => {
    if (v) {
      v.pause();
      try {
        v.currentTime = 0;
      } catch {}
    }
    setPlaying(false);
  };

  const onBlur = () => {
    pointerLatch.clear();
    stopVideo();
  };

  return (
    <button
      type="button"
      aria-label={accessibleName()}
      title={title()}
      onClick={() => props.onOpen?.()}
      onPointerDown={onPointerDown}
      onPointerCancel={onPointerCancel}
      onPointerEnter={onPointerEnter}
      onPointerLeave={stopVideo}
      onFocus={onFocus}
      onBlur={onBlur}
      class={`group relative block w-full overflow-hidden rounded-box border border-base-300 bg-base-300 ${ASPECT[props.aspect ?? "photo"]} ${props.class ?? ""}`}
    >
      <Show
        when={!failed()}
        fallback={
          <div class="flex size-full flex-col items-center justify-center gap-1 text-base-content/50">
            <Icons.Image />
            <span class="text-xs">Unavailable</span>
          </div>
        }
      >
        <Switch>
          <Match when={props.item.mediaType === "image"}>
            <img
              src={imageSrc()}
              alt=""
              loading="lazy"
              decoding="async"
              class="size-full object-cover opacity-0 transition-opacity duration-300"
              onLoad={(e) => e.currentTarget.classList.remove("opacity-0")}
              onError={onImageError}
            />
          </Match>
          <Match when={props.item.mediaType === "video"}>
            <Show when={useVideoPoster()}>
              <img
                src={thumbSrc()}
                alt=""
                loading="lazy"
                decoding="async"
                class="absolute inset-0 z-0 size-full object-cover"
                onError={onPosterError}
              />
            </Show>
            <video
              src={origSrc()}
              muted
              loop
              playsinline
              preload={useVideoPoster() ? "none" : "metadata"}
              class="absolute inset-0 z-10 size-full object-cover transition-opacity duration-150"
              classList={{
                "opacity-0": useVideoPoster() && !playing(),
                "opacity-100": !useVideoPoster() || playing(),
              }}
              ref={v}
              onPlaying={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onError={() => setFailed(true)}
            />
            <Show when={useVideoPoster() && !playing()}>
              <span class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                <span class="flex size-9 items-center justify-center rounded-full bg-base-100/80">
                  <Icons.Play class="size-4" />
                </span>
              </span>
            </Show>
          </Match>
          <Match when={props.item.mediaType === "audio"}>
            <div class="flex size-full flex-col items-center justify-center gap-1.5 bg-base-200 px-3 text-base-content">
              <Icons.Audio class="size-6 shrink-0 text-base-content/60" />
              <span class="line-clamp-2 text-center text-sm font-medium leading-snug">
                {title()}
              </span>
              <span class="text-xs text-base-content/50">
                {mediaKindLabel(props.item)}
              </span>
            </div>
          </Match>
        </Switch>
      </Show>
      <Show
        when={
          props.item.mediaType !== "image" && props.item.mediaType !== "audio"
        }
      >
        <span class="badge badge-neutral badge-sm absolute left-2 top-2 z-20 capitalize">
          {props.item.mediaType}
        </span>
      </Show>
    </button>
  );
}

export default MediaTile;
