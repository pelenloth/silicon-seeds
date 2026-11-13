import { useSearchParams } from "@solidjs/router";
import { createSignal, For, onMount, Show } from "solid-js";
import { Icons } from "../components/Icons";
import { CopyButton } from "../components/ui/CopyButton";
import { EmptyState } from "../components/ui/EmptyState";
import { Field } from "../components/ui/Field";
import { Lightbox } from "../components/ui/Lightbox";
import { MediaTile } from "../components/ui/MediaTile";
import { Modal } from "../components/ui/Modal";
import { Segmented } from "../components/ui/Segmented";
import { SelectField } from "../components/ui/SelectField";
import { SliderField } from "../components/ui/SliderField";
import { StatusBadge } from "../components/ui/StatusBadge";
import { TabLink } from "../components/ui/TabLink";
import { apiGet, type GalleryItem, type MediaItem } from "../lib/api-client";
import type { JobProgress } from "../lib/job-view";
import { confirmDialog } from "../stores/confirm";
import { toast } from "../stores/toast";

const FALLBACK_SVGS: readonly MediaItem[] = [
  {
    filename: "demo-1.svg",
    subfolder: "",
    mediaType: "image",
    src:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#4f46e5"/><text x="200" y="155" font-family="sans-serif" font-size="24" fill="#ffffff" text-anchor="middle">Sample 1</text></svg>',
      ),
  },
  {
    filename: "demo-2.svg",
    subfolder: "",
    mediaType: "image",
    src:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#0f766e"/><text x="200" y="155" font-family="sans-serif" font-size="24" fill="#ffffff" text-anchor="middle">Sample 2</text></svg>',
      ),
  },
  {
    filename: "demo-3.svg",
    subfolder: "",
    mediaType: "image",
    src:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#0369a1"/><text x="200" y="155" font-family="sans-serif" font-size="24" fill="#ffffff" text-anchor="middle">Sample 3</text></svg>',
      ),
  },
];

const P_RUNNING: JobProgress = {
  total: 4,
  complete: 1,
  running: 1,
  pending: 2,
  failed: 0,
};

const P_QUEUED: JobProgress = {
  total: 4,
  complete: 0,
  running: 0,
  pending: 4,
  failed: 0,
};

export default function DevKit() {
  const [searchParams] = useSearchParams<{ tab?: string }>();
  const activeTab = () => searchParams.tab ?? "all";
  const [confirmResult, setConfirmResult] = createSignal("idle");
  const [modalOpen, setModalOpen] = createSignal(false);
  const [modalMounted, setModalMounted] = createSignal(true);
  const [modalDismissible, setModalDismissible] = createSignal(true);
  const [modalCloseCount, setModalCloseCount] = createSignal(0);
  const [segVal, setSegVal] = createSignal("all");
  const [lockedSegVal, setLockedSegVal] = createSignal("all");
  const [sliderVal, setSliderVal] = createSignal(4);
  const [selectVal, setSelectVal] = createSignal("720p");
  const [lightboxIdx, setLightboxIdx] = createSignal<number | null>(null);
  const [lightboxCloseCount, setLightboxCloseCount] = createSignal(0);
  const [galleryData, setGalleryData] = createSignal<{
    images: GalleryItem[];
    videos: GalleryItem[];
  }>({ images: [], videos: [] });

  onMount(() => {
    void (async () => {
      try {
        const [imgs, vids] = await Promise.all([
          apiGet<{ items: GalleryItem[] }>(
            "/api/gallery/items?limit=12&type=image",
          ),
          apiGet<{ items: GalleryItem[] }>(
            "/api/gallery/items?limit=4&type=video",
          ),
        ]);
        setGalleryData({
          images: imgs.items ?? [],
          videos: vids.items ?? [],
        });
      } catch {
        setGalleryData({ images: [], videos: [] });
      }
    })();
  });

  const tiles = (): MediaItem[] => {
    const toMediaItem = (
      i: GalleryItem,
      fallbackType: "image" | "video",
    ): MediaItem => ({
      filename: i.filename,
      subfolder: i.subfolder,
      mediaType: i.mediaType ?? fallbackType,
      created_at: i.created_at,
      job_id: i.job_id,
      job_name: i.job_name,
      event_id: i.event_id,
      meta_id: i.meta_id,
    });
    const imgs = galleryData()
      .images.filter((i) => i.mediaType === "image" || !i.mediaType)
      .slice(0, 3)
      .map((i) => toMediaItem(i, "image"));
    const firstVid = galleryData().videos.find(
      (i) => i.mediaType === "video" || !i.mediaType,
    );
    const out: MediaItem[] = [];
    if (firstVid) {
      out.push(...imgs.slice(0, 2), toMediaItem(firstVid, "video"));
    } else {
      out.push(...imgs.slice(0, 3));
    }
    while (out.length < 3) {
      out.push(FALLBACK_SVGS[out.length]);
    }
    return out;
  };

  const handleConfirm = async () => {
    const ok = await confirmDialog({
      title: "Delete this?",
      body: "This cannot be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    setConfirmResult(ok ? "confirmed" : "cancelled");
  };

  return (
    <div class="page flex flex-col gap-6 max-w-4xl mx-auto">
      <h2 class="text-xl font-semibold">UI kit</h2>

      <section class="panel p-4 flex flex-col gap-3">
        <span class="section-label">Toasts</span>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="btn btn-sm btn-primary"
            onClick={() => toast.success("Saved")}
          >
            Success toast
          </button>
          <button
            type="button"
            class="btn btn-sm"
            onClick={() => toast.error("Something went wrong")}
          >
            Error toast
          </button>
          <button
            type="button"
            class="btn btn-sm"
            onClick={() =>
              toast.info("Job queued", {
                action: { label: "View jobs", href: "/jobs" },
              })
            }
          >
            Info toast with action
          </button>
        </div>
      </section>

      <section class="panel p-4 flex flex-col gap-3">
        <span class="section-label">Confirm & Modal</span>
        <div class="flex flex-wrap items-center gap-3">
          <button type="button" class="btn btn-sm" onClick={handleConfirm}>
            Ask to confirm
          </button>
          <span
            data-testid="confirm-result"
            class="text-xs font-mono text-base-content/70"
          >
            {confirmResult()}
          </span>
          <button
            type="button"
            class="btn btn-sm"
            onClick={() => {
              setModalMounted(true);
              setModalDismissible(true);
              setModalOpen(true);
            }}
          >
            Open modal
          </button>
          <span
            data-testid="modal-close-count"
            class="text-xs font-mono text-base-content/70"
          >
            {modalCloseCount()}
          </span>
        </div>
        <Show when={modalMounted()}>
          <Modal
            open={modalOpen()}
            dismissible={modalDismissible()}
            onClose={() => {
              setModalCloseCount((c) => c + 1);
              setModalOpen(false);
            }}
            title="Example modal"
            actions={
              <>
                <button
                  type="button"
                  class="btn btn-sm"
                  onClick={() => toast.info("Toast above the modal")}
                >
                  Toast from modal
                </button>
                <button
                  type="button"
                  class="btn btn-sm"
                  onClick={() => {
                    void handleConfirm();
                    toast.info("Toast on confirm");
                  }}
                >
                  Confirm from modal
                </button>
                <button
                  type="button"
                  class="btn btn-sm"
                  onClick={() => setModalMounted(false)}
                >
                  Unmount modal
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-primary"
                  onClick={() => setModalOpen(false)}
                >
                  Done
                </button>
              </>
            }
          >
            <p class="text-sm text-base-content/80">
              Press Escape or click the backdrop to close.
            </p>
            <div class="mt-2">
              <button
                type="button"
                class="btn btn-xs"
                onClick={() => setModalDismissible((d) => !d)}
              >
                {modalDismissible() ? "Lock modal" : "Unlock modal"}
              </button>
            </div>
          </Modal>
        </Show>
      </section>

      <section class="panel p-4 flex flex-col gap-3">
        <span class="section-label">Tabs</span>
        <nav aria-label="Demo tabs" class="tabs tabs-border">
          <TabLink
            href="/dev/kit?tab=all"
            active={activeTab() === "all"}
            variant="tab"
          >
            All
          </TabLink>
          <TabLink
            href="/dev/kit?tab=active"
            active={activeTab() === "active"}
            variant="tab"
          >
            Active
          </TabLink>
          <TabLink
            href="/dev/kit?tab=failed"
            active={activeTab() === "failed"}
            variant="tab"
          >
            Failed
          </TabLink>
        </nav>
        <nav aria-label="Demo chips" class="flex flex-wrap gap-1">
          <TabLink
            href="/dev/kit?tab=all"
            active={activeTab() === "all"}
            variant="chip"
          >
            All
          </TabLink>
          <TabLink
            href="/dev/kit?tab=active"
            active={activeTab() === "active"}
            variant="chip"
          >
            Active
          </TabLink>
          <TabLink
            href="/dev/kit?tab=failed"
            active={activeTab() === "failed"}
            variant="chip"
          >
            Failed
          </TabLink>
        </nav>
      </section>

      <section class="panel p-4 flex flex-col gap-3">
        <span class="section-label">Segmented</span>
        <div class="flex flex-wrap items-center gap-3">
          <Segmented
            label="Media type"
            name="kit_type"
            value={segVal()}
            onChange={setSegVal}
            options={[
              { value: "all", label: "All" },
              { value: "image", label: "Images" },
              { value: "video", label: "Videos" },
              { value: "audio", label: "Audio" },
            ]}
          />
          <span
            data-testid="segmented-value"
            class="text-xs font-mono text-base-content/70"
          >
            {segVal()}
          </span>
          <Segmented
            label="Media type (audio locked)"
            name="kit_type_locked"
            value={lockedSegVal()}
            onChange={(v) => {
              if (v !== "audio") setLockedSegVal(v);
            }}
            options={[
              { value: "all", label: "All" },
              { value: "image", label: "Images" },
              { value: "audio", label: "Audio" },
            ]}
          />
        </div>
      </section>

      <section class="panel p-4 flex flex-col gap-4">
        <span class="section-label">Form fields</span>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="flex flex-col gap-1">
            <SliderField
              label="Clip duration"
              name="kit_slider"
              min={1}
              max={10}
              value={sliderVal()}
              onInput={setSliderVal}
              format={(n) => `${n}s`}
              hint="Duration in seconds"
            />
            <span
              data-testid="slider-value"
              class="text-xs font-mono text-base-content/70"
            >
              {`${sliderVal()}s`}
            </span>
          </div>
          <SelectField
            label="Resolution"
            name="kit_resolution"
            value={selectVal()}
            onChange={setSelectVal}
            options={[
              { value: "480p", label: "480p" },
              { value: "720p", label: "720p" },
            ]}
            hint="Output resolution"
          />
          <Field label="Prompt" for="kit-prompt" error="Prompt is required">
            <input
              id="kit-prompt"
              type="text"
              class="input input-sm w-full"
              placeholder="Describe a scene..."
            />
          </Field>
        </div>
      </section>

      <section class="panel p-4 flex flex-col gap-3">
        <span class="section-label">Status badges</span>
        <div class="flex flex-wrap items-center gap-2">
          <StatusBadge kind="job" status="active" progress={P_RUNNING} />
          <StatusBadge kind="job" status="active" progress={P_QUEUED} />
          <StatusBadge kind="job" status="paused" />
          <StatusBadge kind="job" status="complete" />
          <StatusBadge kind="job" status="failed" />
          <StatusBadge kind="job" status="cancelled" />
          <StatusBadge kind="event" status="pending" />
          <StatusBadge kind="event" status="running" />
          <StatusBadge kind="event" status="complete" />
          <StatusBadge kind="event" status="failed" />
        </div>
      </section>

      <section class="panel p-4 flex flex-col gap-3">
        <span class="section-label">Empty state</span>
        <EmptyState
          icon={<Icons.Gallery class="size-8" />}
          title="Nothing here yet"
          description="Generated items will appear here once a job completes."
        />
      </section>

      <section class="panel p-4 flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <span class="section-label">Media tiles & Lightbox</span>
          <span
            data-testid="lightbox-close-count"
            class="text-xs font-mono text-base-content/70"
          >
            {lightboxCloseCount()}
          </span>
        </div>
        <div data-testid="kit-tiles" class="grid grid-cols-3 gap-3">
          <For each={tiles()}>
            {(item, i) => (
              <MediaTile item={item} onOpen={() => setLightboxIdx(i())} />
            )}
          </For>
        </div>
        <Lightbox
          items={tiles()}
          index={lightboxIdx()}
          onIndexChange={setLightboxIdx}
          onClose={() => {
            setLightboxCloseCount((c) => c + 1);
            setLightboxIdx(null);
          }}
        />
      </section>

      <section class="panel p-4 flex flex-col gap-3">
        <span class="section-label">Copy button</span>
        <div class="flex items-center gap-2">
          <CopyButton text="silicon-seeds-sample-prompt" label="Copy prompt" />
        </div>
      </section>
    </div>
  );
}
