import { A } from "@solidjs/router";
import {
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
import { Dynamic } from "solid-js/web";
import type { EnhanceKind } from "../../prompts/enhance-prompts";
import { Icons, KIND_ICONS } from "../components/Icons";
import StylePresetSelect from "../components/StylePresetSelect";
import { EmptyState } from "../components/ui/EmptyState";
import { Lightbox } from "../components/ui/Lightbox";
import { MediaTile } from "../components/ui/MediaTile";
import { Segmented } from "../components/ui/Segmented";
import { StatusBadge } from "../components/ui/StatusBadge";
import {
  ApiError,
  apiGet,
  apiSend,
  thumbUrl,
  type GalleryItem,
  type MediaItem,
} from "../lib/api-client";
import {
  CREATE_KINDS,
  quickCreateValues,
  submitCreateJob,
} from "../lib/create-job";
import { RESOLUTIONS, type GenerationDefaults } from "../lib/defaults";
import {
  clearDraft,
  loadDraft,
  saveDraft,
  setPrefill,
} from "../lib/form-state";
import {
  jobKindMeta,
  shouldShowNewMedia,
  type JobSummary,
} from "../lib/job-view";
import {
  activeJobs,
  jobs,
  jobsLoaded,
  refreshJobs,
  runJobAction,
  streamEpoch,
} from "../stores/jobs";
import { generationDefaults, loadDefaults } from "../stores/settings";
import { toast } from "../stores/toast";

type HomeMode = "image" | "video" | "text-to-video" | "audio";
type KeyedMediaItem = MediaItem & { id: string };

const MODE_OPTIONS: readonly { value: HomeMode; label: string }[] = [
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "text-to-video", label: "Text to Video" },
  { value: "audio", label: "Audio" },
] as const;

const COUNT_OPTIONS = [
  { value: "1", label: "1 image" },
  { value: "2", label: "2 images" },
  { value: "4", label: "4 images" },
  { value: "8", label: "8 images" },
] as const;

const DURATION_OPTIONS = [
  { value: "30", label: "30s" },
  { value: "60", label: "60s" },
  { value: "120", label: "120s" },
  { value: "180", label: "180s" },
] as const;

const SKELETON_INDICES = [0, 1, 2, 3, 4, 5] as const;

function readInitialMode(): HomeMode {
  try {
    const raw = localStorage.getItem("home:mode");
    if (
      raw === "image" ||
      raw === "video" ||
      raw === "text-to-video" ||
      raw === "audio"
    ) {
      return raw;
    }
  } catch {}
  return "image";
}

function readInitialEnhance(): boolean {
  try {
    const raw = localStorage.getItem("home:enhance");
    return raw === "1" || raw === "true";
  } catch {}
  return false;
}

function enhanceKindForMode(mode: HomeMode): EnhanceKind {
  switch (mode) {
    case "image":
      return "image_prompt";
    case "video":
    case "text-to-video":
      return "video_prompt";
    case "audio":
      return "instrumental";
  }
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
  const seen = new Set<string>();
  for (const item of raw) {
    if (
      item.mediaType !== "image" &&
      item.mediaType !== "video" &&
      item.mediaType !== "audio"
    ) {
      continue;
    }
    const id = galleryItemKey(item);
    if (seen.has(id)) continue;
    seen.add(id);
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

function ActiveJobCard(props: { job: JobSummary }) {
  const [thumbFailed, setThumbFailed] = createSignal(false);

  const previewSrc = () => {
    const t = props.job.thumb;
    if (!t || (t.mediaType !== "image" && t.mediaType !== "video")) return null;
    return thumbUrl(t, 96);
  };

  createEffect(
    on(previewSrc, () => {
      setThumbFailed(false);
    }),
  );

  return (
    <div class="panel flex items-center gap-3 p-3">
      <A
        href={`/jobs/${encodeURIComponent(props.job.id)}`}
        class="flex min-w-0 flex-1 items-center gap-3"
      >
        <div class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-field bg-base-300 text-base-content/50">
          <Show
            when={!thumbFailed() ? previewSrc() : null}
            fallback={
              <Dynamic component={KIND_ICONS[props.job.kind]} class="size-5" />
            }
          >
            {(src) => (
              <img
                src={src()}
                alt=""
                loading="lazy"
                decoding="async"
                class="size-full object-cover"
                onError={() => setThumbFailed(true)}
              />
            )}
          </Show>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-2">
            <span class="truncate text-sm font-medium">{props.job.name}</span>
            <StatusBadge
              kind="job"
              status={props.job.status}
              progress={props.job.progress}
            />
          </div>
          <div class="mt-0.5 text-xs text-base-content/60">
            {jobKindMeta(props.job.kind).label} · {props.job.progress.complete}/
            {props.job.progress.total}
          </div>
          <progress
            class="progress progress-primary mt-1 h-1 w-full"
            value={props.job.progress.complete}
            max={Math.max(1, props.job.progress.total)}
          />
        </div>
      </A>
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-square shrink-0 text-error"
        aria-label={`Cancel ${props.job.name}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void runJobAction(props.job, "cancel");
        }}
      >
        <Icons.Stop class="size-4" />
      </button>
    </div>
  );
}

export default function Home() {
  let promptRef: HTMLTextAreaElement | undefined;
  let disposed = false;

  const initialDraft = loadDraft("/");
  const initialDefs = generationDefaults();

  const [prompt, setPromptSignal] = createSignal(initialDraft?.prompt ?? "");
  const [mode, setModeSignal] = createSignal<HomeMode>(readInitialMode());
  const [resolution, setResolutionSignal] = createSignal(
    initialDefs.resolution,
  );
  const [preset, setPresetSignal] = createSignal(initialDefs.style_preset);
  const [count, setCountSignal] = createSignal("1");
  const [duration, setDurationSignal] = createSignal("60");
  const [enhanceFirst, setEnhanceFirstSignal] =
    createSignal(readInitialEnhance());
  const [busy, setBusy] = createSignal<"" | "Enhancing…" | "Queueing…">("");
  const [error, setError] = createSignal<string | null>(null);

  let resolutionTouched = false;
  let presetTouched = false;
  let inFlight = false;
  let enhanceAbort: AbortController | null = null;

  const applyDefaultsIfUntouched = (d: GenerationDefaults) => {
    if (disposed) return;
    if (!resolutionTouched) {
      setResolutionSignal(d.resolution);
    }
    if (!presetTouched) {
      setPresetSignal(d.style_preset);
    }
  };

  void loadDefaults().then(applyDefaultsIfUntouched);

  createEffect(() => {
    applyDefaultsIfUntouched(generationDefaults());
  });

  const setPrompt = (val: string) => {
    setPromptSignal(val);
    if (error()) setError(null);
    if (val) {
      saveDraft("/", { prompt: val });
    } else {
      clearDraft("/");
    }
  };

  const setMode = (next: string) => {
    if (
      next !== "image" &&
      next !== "video" &&
      next !== "text-to-video" &&
      next !== "audio"
    ) {
      return;
    }
    setModeSignal(next);
    try {
      localStorage.setItem("home:mode", next);
    } catch {}
  };

  const setEnhanceFirst = (checked: boolean) => {
    setEnhanceFirstSignal(checked);
    try {
      localStorage.setItem("home:enhance", checked ? "1" : "0");
    } catch {}
  };

  const overrides = (): Record<string, string> => {
    switch (mode()) {
      case "image":
        return {
          resolution: resolution(),
          style_preset: preset(),
          batch_size: count(),
        };
      case "video":
        return {
          resolution: resolution(),
          style_preset: preset(),
        };
      case "text-to-video":
        return {
          resolution: resolution(),
        };
      case "audio":
        return {
          duration: duration(),
        };
    }
  };

  const handOff = () => {
    const currentMode = mode();
    const route = CREATE_KINDS[currentMode].route;
    const promptField =
      currentMode === "audio" ? "instrumental_prompt" : "prompt";
    setPrefill(route, {
      [promptField]: prompt(),
      ...overrides(),
    });
  };

  const onSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (inFlight || busy()) return;

    const rawPrompt = prompt();
    if (!rawPrompt.trim()) {
      setError("Describe what you want to create");
      promptRef?.focus();
      return;
    }

    setError(null);
    inFlight = true;
    const currentMode = mode();
    const currentOverrides = overrides();
    const currentPreset = preset();
    let finalText = rawPrompt;

    try {
      if (enhanceFirst()) {
        setBusy("Enhancing…");
        const ctrl = new AbortController();
        enhanceAbort = ctrl;
        const timer = setTimeout(() => ctrl.abort(), 60_000);
        try {
          const res = await apiSend<{ enhanced?: string }>(
            "POST",
            "/api/enhance",
            {
              text: rawPrompt,
              kind: enhanceKindForMode(currentMode),
              style_preset:
                currentMode === "image" || currentMode === "video"
                  ? currentPreset
                  : undefined,
            },
            { signal: ctrl.signal },
          );
          const next = res?.enhanced?.trim();
          if (next) {
            finalText = next;
          } else {
            toast.warning("Could not enhance the prompt, using it as written");
          }
        } catch {
          if (disposed) return;
          toast.warning("Could not enhance the prompt, using it as written");
        } finally {
          clearTimeout(timer);
          if (enhanceAbort === ctrl) {
            enhanceAbort = null;
          }
        }
      }

      if (disposed) return;
      setBusy("Queueing…");
      const { jobId } = await submitCreateJob(
        currentMode,
        quickCreateValues(
          currentMode,
          finalText,
          generationDefaults(),
          currentOverrides,
        ),
      );
      if (!disposed) {
        setPromptSignal("");
        clearDraft("/");
      }
      void refreshJobs();
      toast.success(`Queued ${CREATE_KINDS[currentMode].label.toLowerCase()}`, {
        action: {
          label: "View",
          href: `/jobs/${encodeURIComponent(jobId)}`,
        },
      });
    } catch (err) {
      if (!disposed) {
        setError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Could not queue the job",
        );
      }
    } finally {
      inFlight = false;
      if (!disposed) {
        setBusy("");
      }
    }
  };

  const ctrlEnterSubmits = (
    e: KeyboardEvent & { currentTarget: HTMLFormElement },
  ) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.requestSubmit();
    }
  };

  // Recent creations store keyed by item identity
  const [recent, setRecent] = createStore<KeyedMediaItem[]>([]);
  const [recentLoading, setRecentLoading] = createSignal(true);
  const [lightboxKey, setLightboxKey] = createSignal<string | null>(null);
  let recentSeq = 0;

  const fetchRecent = async () => {
    const seq = ++recentSeq;
    try {
      const data = await apiGet<{ items?: GalleryItem[] }>(
        "/api/gallery/items?limit=12",
      );
      if (disposed || seq !== recentSeq) return;
      const raw = Array.isArray(data?.items) ? data.items : [];
      const keyed = toKeyedMediaItems(raw);
      setRecent(reconcile(keyed, { key: "id", merge: true }));
    } catch {
      // Failed reload keeps any tiles already shown
    } finally {
      if (!disposed && seq === recentSeq) {
        setRecentLoading(false);
      }
    }
  };

  const completedJobsCount = createMemo(
    () => jobs().filter((j) => j.status === "complete").length,
  );

  let prevCompletedCount: number | null = jobsLoaded()
    ? completedJobsCount()
    : null;
  let prevEpoch = streamEpoch();

  createEffect(() => {
    const loaded = jobsLoaded();
    const countVal = completedJobsCount();
    const epochVal = streamEpoch();
    let shouldReload = false;

    if (loaded) {
      if (shouldShowNewMedia(prevCompletedCount, countVal)) {
        shouldReload = true;
      }
      prevCompletedCount = countVal;
    }
    if (epochVal !== prevEpoch) {
      prevEpoch = epochVal;
      shouldReload = true;
    }
    if (shouldReload) {
      void fetchRecent();
    }
  });

  const lightboxIndex = createMemo<number | null>(() => {
    const key = lightboxKey();
    if (!key) return null;
    const idx = recent.findIndex((it) => it.id === key);
    return idx >= 0 ? idx : null;
  });

  createEffect(() => {
    if (lightboxKey() !== null && lightboxIndex() === null) {
      setLightboxKey(null);
    }
  });

  onMount(() => {
    void fetchRecent();
    try {
      if (
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(hover: hover) and (pointer: fine)").matches
      ) {
        queueMicrotask(() => {
          if (!disposed) {
            promptRef?.focus();
          }
        });
      }
    } catch {}
  });

  onCleanup(() => {
    disposed = true;
    enhanceAbort?.abort();
  });

  return (
    <div class="page fade-in">
      <div class="mx-auto flex max-w-4xl flex-col gap-6">
        <form
          class="panel p-4"
          novalidate
          onSubmit={(e) => void onSubmit(e)}
          onKeyDown={ctrlEnterSubmits}
        >
          <label for="home-prompt" class="text-lg font-semibold">
            What do you want to create?
          </label>
          <textarea
            ref={promptRef}
            id="home-prompt"
            rows={4}
            class="textarea textarea-ghost mt-2 w-full resize-y px-0 text-base leading-relaxed focus:outline-none"
            placeholder="A misty pine forest at dawn, watercolor…"
            value={prompt()}
            onInput={(e) => setPrompt(e.currentTarget.value)}
            aria-invalid={error() ? "true" : undefined}
          />
          <Show when={error()}>
            <p class="text-xs text-error" role="alert">
              {error()}
            </p>
          </Show>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <Segmented
              label="Mode"
              name="home-mode"
              value={mode()}
              onChange={setMode}
              options={MODE_OPTIONS}
              class="max-w-full overflow-x-auto scroll-thin"
            />
            <Show
              when={
                mode() === "image" ||
                mode() === "video" ||
                mode() === "text-to-video"
              }
            >
              <select
                name="home-resolution"
                aria-label="Resolution"
                class="select select-sm w-auto"
                value={resolution()}
                onChange={(e) => {
                  resolutionTouched = true;
                  setResolutionSignal(e.currentTarget.value);
                }}
              >
                <For each={RESOLUTIONS}>
                  {(r) => (
                    <option value={r.value} selected={resolution() === r.value}>
                      {r.label}
                    </option>
                  )}
                </For>
              </select>
            </Show>
            <Show when={mode() === "image" || mode() === "video"}>
              <div class="w-auto">
                <StylePresetSelect
                  name="home-preset"
                  ariaLabel="Style preset"
                  class="select select-sm w-auto"
                  value={preset()}
                  onChange={(v) => {
                    presetTouched = true;
                    setPresetSignal(v);
                  }}
                />
              </div>
            </Show>
            <Show when={mode() === "image"}>
              <select
                name="home-count"
                aria-label="Count"
                class="select select-sm w-auto"
                value={count()}
                onChange={(e) => setCountSignal(e.currentTarget.value)}
              >
                <For each={COUNT_OPTIONS}>
                  {(c) => (
                    <option value={c.value} selected={count() === c.value}>
                      {c.label}
                    </option>
                  )}
                </For>
              </select>
            </Show>
            <Show when={mode() === "audio"}>
              <select
                name="home-duration"
                aria-label="Duration"
                class="select select-sm w-auto"
                value={duration()}
                onChange={(e) => setDurationSignal(e.currentTarget.value)}
              >
                <For each={DURATION_OPTIONS}>
                  {(d) => (
                    <option value={d.value} selected={duration() === d.value}>
                      {d.label}
                    </option>
                  )}
                </For>
              </select>
            </Show>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-3 border-t border-base-300 pt-3">
            <label class="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                class="toggle toggle-primary toggle-xs"
                checked={enhanceFirst()}
                onChange={(e) => setEnhanceFirst(e.currentTarget.checked)}
              />
              Enhance prompt first
            </label>
            <A
              href={CREATE_KINDS[mode()].route}
              class="link link-hover text-xs"
              onClick={handOff}
            >
              More options
            </A>
            <button
              type="submit"
              id="home-generate"
              class="btn btn-primary btn-sm ml-auto gap-2 px-5"
              disabled={Boolean(busy())}
            >
              <Show when={busy()}>
                <span class="loading loading-spinner loading-xs" />
              </Show>
              {busy() || "Generate"}
              <kbd class="kbd kbd-xs hidden text-base-content lg:inline-flex">
                Ctrl ↵
              </kbd>
            </button>
          </div>
        </form>

        <Show when={activeJobs().length > 0}>
          <section>
            <h2 class="section-label mb-2">In progress</h2>
            <div class="grid gap-3 sm:grid-cols-2">
              <For each={activeJobs()}>
                {(job) => <ActiveJobCard job={job} />}
              </For>
            </div>
          </section>
        </Show>

        <section>
          <div class="mb-2 flex items-center justify-between">
            <h2 class="section-label">Recent creations</h2>
            <A href="/gallery" class="link link-hover text-xs">
              Open gallery
            </A>
          </div>
          <Show when={recentLoading() && recent.length === 0}>
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <For each={SKELETON_INDICES}>
                {() => <div class="skeleton aspect-square rounded-box" />}
              </For>
            </div>
          </Show>
          <Show when={!recentLoading() && recent.length === 0}>
            <EmptyState
              title="Nothing yet"
              description="Your first creation will show up here."
            />
          </Show>
          <Show when={recent.length > 0}>
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <For each={recent}>
                {(item, i) => (
                  <MediaTile
                    item={item}
                    aspect="square"
                    position={i() + 1}
                    onOpen={() => setLightboxKey(item.id)}
                  />
                )}
              </For>
            </div>
          </Show>
        </section>

        <A
          href="/compose"
          class="panel flex items-center gap-3 p-4 hover:bg-base-100/60"
        >
          <Icons.Compose class="size-6 shrink-0 text-primary" />
          <div class="min-w-0">
            <p class="text-sm font-semibold">
              Compose a narrated video from a script
            </p>
            <p class="text-xs text-base-content/60">
              Scenes, clips, transitions, voiceover and music, assembled into a
              final cut.
            </p>
          </div>
          <Icons.ChevronRight class="ml-auto size-4 shrink-0" />
        </A>
      </div>
      <Lightbox
        items={recent}
        index={lightboxIndex()}
        onIndexChange={(nextIdx) => {
          const nextItem = recent[nextIdx];
          setLightboxKey(nextItem ? nextItem.id : null);
        }}
        onClose={() => setLightboxKey(null)}
        actions={(item) => (
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
        )}
      />
    </div>
  );
}
