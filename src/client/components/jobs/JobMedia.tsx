import { For, Show } from "solid-js";
import type { MediaItem, MediaType } from "../../lib/api-client";
import { EmptyState } from "../ui/EmptyState";
import { MediaTile } from "../ui/MediaTile";

export type JobMediaProps = {
  media: MediaItem[];
  total?: number;
  loaded: boolean;
  onOpen: (item: MediaItem) => void;
  onShowAll?: () => void;
};

const GROUPS: { type: MediaType; label: string }[] = [
  { type: "image", label: "Images" },
  { type: "video", label: "Videos" },
  { type: "audio", label: "Audio" },
];

export function JobMedia(props: JobMediaProps) {
  const byType = (type: MediaType): MediaItem[] =>
    props.media.filter((item) => item.mediaType === type);

  const totalCount = () => Math.max(props.total ?? 0, props.media.length);

  return (
    <Show
      when={props.loaded || props.media.length > 0}
      fallback={
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          <For each={[0, 1, 2, 3, 4, 5]}>
            {() => <div class="skeleton aspect-video w-full rounded-box" />}
          </For>
        </div>
      }
    >
      <Show
        when={props.media.length > 0}
        fallback={
          <EmptyState
            title="No media yet"
            description="Outputs appear here as the job runs."
          />
        }
      >
        <div class="flex flex-col gap-6">
          <Show when={totalCount() > props.media.length}>
            <div class="flex items-center justify-between rounded-box border border-base-300 bg-base-100 px-3 py-2 text-xs text-base-content/70">
              <span>
                Showing {props.media.length} of {totalCount()}
              </span>
              <Show when={props.onShowAll}>
                {(showAll) => (
                  <button
                    type="button"
                    class="btn btn-xs btn-ghost"
                    onClick={() => showAll()()}
                  >
                    Show all
                  </button>
                )}
              </Show>
            </div>
          </Show>
          <For each={GROUPS}>
            {(group) => {
              const items = () => byType(group.type);
              return (
                <Show when={items().length > 0}>
                  <div class="space-y-2">
                    <div class="section-label">
                      {group.label} ({items().length})
                    </div>
                    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                      <For each={items()}>
                        {(item, i) => (
                          <MediaTile
                            item={item}
                            position={i() + 1}
                            aspect="video"
                            onOpen={() => props.onOpen(item)}
                          />
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              );
            }}
          </For>
        </div>
      </Show>
    </Show>
  );
}

export default JobMedia;
