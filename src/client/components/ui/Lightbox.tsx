import { createEffect, Match, Show, Switch, type JSX } from "solid-js";
import { getAssetPath, type MediaItem } from "../../lib/api-client";
import { Icons } from "../Icons";

export type LightboxProps = {
  items: readonly MediaItem[];
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  actions?: (item: MediaItem) => JSX.Element;
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

export function Lightbox(props: LightboxProps) {
  let ref!: HTMLDialogElement;

  const isOpen = () =>
    props.index !== null &&
    props.index >= 0 &&
    props.index < props.items.length;

  const currentItem = () => (isOpen() ? props.items[props.index!] : undefined);

  createEffect(() => {
    if (!ref) return;
    if (isOpen()) {
      if (!ref.open) {
        ref.showModal();
      }
    } else {
      if (ref.open) {
        ref.close();
      }
    }
  });

  const step = (delta: number) => {
    const len = props.items.length;
    if (len <= 1 || props.index === null) return;
    const next = (props.index + delta + len) % len;
    props.onIndexChange(next);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    }
  };

  return (
    <dialog
      ref={ref}
      class="modal"
      aria-label="Media viewer"
      onKeyDown={handleKeyDown}
      onClose={() => props.onClose()}
    >
      <Show when={currentItem()}>
        {(item) => {
          const src = () => mediaSrc(item());
          return (
            <div class="modal-box flex h-[92dvh] w-[96vw] max-w-none flex-col gap-3 bg-base-100 p-3">
              <div class="flex items-center gap-3">
                <span
                  data-testid="lightbox-position"
                  class="text-xs font-medium tabular-nums text-base-content/70"
                >
                  {(props.index ?? 0) + 1} / {props.items.length}
                </span>
                <span class="font-mono text-xs truncate">
                  {item().filename}
                </span>
                <div class="flex-1" />
                {props.actions?.(item())}
                <a
                  class="btn btn-sm btn-ghost"
                  href={src()}
                  download={item().filename}
                >
                  <Icons.Download class="size-4" />
                  Download
                </a>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm btn-square"
                  aria-label="Close"
                  onClick={() => props.onClose()}
                >
                  <Icons.XMark class="size-4" />
                </button>
              </div>
              <div class="relative flex min-h-0 flex-1 items-center justify-center rounded-box bg-base-300">
                <Switch>
                  <Match when={item().mediaType === "image"}>
                    <img
                      src={src()}
                      alt={item().filename}
                      class="max-h-full max-w-full object-contain"
                    />
                  </Match>
                  <Match when={item().mediaType === "video"}>
                    <video
                      src={src()}
                      controls
                      autoplay
                      class="max-h-full max-w-full"
                    />
                  </Match>
                  <Match when={item().mediaType === "audio"}>
                    <audio src={src()} controls autoplay />
                  </Match>
                </Switch>
                <Show when={props.items.length > 1}>
                  <button
                    type="button"
                    class="btn btn-circle btn-sm absolute left-2"
                    aria-label="Previous"
                    onClick={() => step(-1)}
                  >
                    <Icons.ChevronLeft class="size-4" />
                  </button>
                  <button
                    type="button"
                    class="btn btn-circle btn-sm absolute right-2"
                    aria-label="Next"
                    onClick={() => step(1)}
                  >
                    <Icons.ChevronRight class="size-4" />
                  </button>
                </Show>
              </div>
            </div>
          );
        }}
      </Show>
      <form method="dialog" class="modal-backdrop">
        <button aria-label="Close">close</button>
      </form>
    </dialog>
  );
}

export default Lightbox;
