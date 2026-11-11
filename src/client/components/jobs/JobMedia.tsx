import { For, Show } from "solid-js";
import type { MediaItem, MediaType } from "../../lib/api-client";
import { EmptyState } from "../ui/EmptyState";
import { MediaTile } from "../ui/MediaTile";

export type JobMediaProps = {
  media: MediaItem[];
  loaded: boolean;
  onOpen: (index: number) => void;
};

type IndexedItem = {
  item: MediaItem;
  index: number;
};

const GROUPS: { type: MediaType; label: string }[] = [
  { type: "image", label: "Images" },
  { type: "video", label: "Videos" },
  { type: "audio", label: "Audio" },
];

export function JobMedia(props: JobMediaProps) {
  const indexed = (): IndexedItem[] =>
    props.media.map((item, index) => ({ item, index }));

  const byType = (type: MediaType) =>
    indexed().filter((entry) => entry.item.mediaType === type);

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
                        {(entry) => (
                          <MediaTile
                            item={entry.item}
                            aspect="video"
                            onOpen={() => props.onOpen(entry.index)}
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
