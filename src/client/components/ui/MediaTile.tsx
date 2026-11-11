import { createEffect, createSignal, Match, on, Show, Switch } from "solid-js";
import { mediaUrl, thumbUrl, type MediaItem } from "../../lib/api-client";
import { Icons } from "../Icons";

export type MediaTileProps = {
  item: MediaItem;
  onOpen?: () => void;
  class?: string;
  aspect?: "video" | "square" | "photo";
};

const ASPECT: Record<"video" | "square" | "photo", string> = {
  video: "aspect-video",
  square: "aspect-square",
  photo: "aspect-[4/3]",
};

export function MediaTile(props: MediaTileProps) {
  let v: HTMLVideoElement | undefined;
  const [failed, setFailed] = createSignal(false);
  const [imgFallback, setImgFallback] = createSignal(false);
  const [posterFailed, setPosterFailed] = createSignal(false);
  const [playing, setPlaying] = createSignal(false);

  const hasExplicitSrc = () => Boolean(props.item.src);
  const origSrc = () => mediaUrl(props.item);
  const thumbSrc = () => thumbUrl(props.item, 640);
  const imageSrc = () =>
    hasExplicitSrc() || imgFallback() ? origSrc() : thumbSrc();
  const useVideoPoster = () => !hasExplicitSrc() && !posterFailed();

  createEffect(
    on(
      () => [
        props.item.src,
        props.item.subfolder,
        props.item.filename,
        props.item.mediaType,
      ],
      () => {
        setFailed(false);
        setImgFallback(false);
        setPosterFailed(false);
        setPlaying(false);
      },
    ),
  );

  const onImageError = () => {
    if (!hasExplicitSrc() && !imgFallback()) {
      setImgFallback(true);
    } else {
      setFailed(true);
    }
  };

  const playVideo = () => {
    if (v) {
      v.play().catch(() => {});
    }
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

  return (
    <button
      type="button"
      aria-label={`Open ${props.item.filename}`}
      onClick={() => props.onOpen?.()}
      onPointerEnter={playVideo}
      onPointerLeave={stopVideo}
      onFocus={playVideo}
      onBlur={stopVideo}
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
                class="absolute inset-0 size-full object-cover"
                onError={() => setPosterFailed(true)}
              />
            </Show>
            <video
              src={origSrc()}
              muted
              loop
              playsinline
              preload={useVideoPoster() ? "none" : "metadata"}
              class="size-full object-cover"
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
              <span class="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span class="flex size-9 items-center justify-center rounded-full bg-base-100/80">
                  <Icons.Play class="size-4" />
                </span>
              </span>
            </Show>
          </Match>
          <Match when={props.item.mediaType === "audio"}>
            <div class="flex size-full flex-col items-center justify-center gap-2 bg-base-200 text-base-content/50">
              <Icons.Audio />
              <span class="max-w-[90%] truncate text-xs">
                {props.item.filename}
              </span>
            </div>
          </Match>
        </Switch>
      </Show>
      <Show when={props.item.mediaType !== "image"}>
        <span class="badge badge-neutral badge-sm absolute left-2 top-2 capitalize">
          {props.item.mediaType}
        </span>
      </Show>
    </button>
  );
}

export default MediaTile;
