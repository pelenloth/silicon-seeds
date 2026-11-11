import { Match, Show, Switch } from "solid-js";
import { getAssetPath, type MediaItem } from "../../lib/api-client";
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

function mediaSrc(item: MediaItem): string {
  if (
    item.filename.startsWith("data:") ||
    item.filename.startsWith("blob:") ||
    item.filename.startsWith("http://") ||
    item.filename.startsWith("https://") ||
    item.filename.startsWith("/")
  ) {
    return item.filename;
  }
  return getAssetPath(item.subfolder, item.filename);
}

export function MediaTile(props: MediaTileProps) {
  let v: HTMLVideoElement | undefined;
  const src = () => mediaSrc(props.item);

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
      <Switch>
        <Match when={props.item.mediaType === "image"}>
          <img
            src={src()}
            alt=""
            loading="lazy"
            decoding="async"
            class="size-full object-cover opacity-0 transition-opacity duration-300"
            onLoad={(e) => e.currentTarget.classList.remove("opacity-0")}
          />
        </Match>
        <Match when={props.item.mediaType === "video"}>
          <video
            src={src()}
            muted
            loop
            playsinline
            preload="metadata"
            class="size-full object-cover"
            ref={v}
          />
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
      <Show when={props.item.mediaType !== "image"}>
        <span class="badge badge-neutral badge-sm absolute left-2 top-2 capitalize">
          {props.item.mediaType}
        </span>
      </Show>
    </button>
  );
}

export default MediaTile;
