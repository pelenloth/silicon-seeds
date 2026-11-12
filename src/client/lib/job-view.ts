import type { MediaType } from "./api-client";
import { JOB_CANCELLED_ERROR } from "../../shared/job-cancel";

export { JOB_CANCELLED_ERROR };

export type JobKind = "image" | "video" | "audio" | "compose";
export type Tone = "neutral" | "info" | "success" | "warning" | "error";
export type EventKind =
  "text" | "image" | "video" | "transition" | "audio" | "composition" | "other";
export type JobAction = "pause" | "resume" | "retry" | "cancel" | "delete";
export type JobProgress = {
  total: number;
  complete: number;
  running: number;
  pending: number;
  failed: number;
};
export type JobThumb = {
  subfolder: string;
  filename: string;
  mediaType: MediaType;
};
export type JobSummary = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  kind: JobKind;
  progress: JobProgress;
  thumb: JobThumb | null;
  original_prompt?: string | null;
  workflow?: string | null;
  fps?: number | null;
  clip_duration?: number | null;
  transition_duration?: number | null;
  resolution?: string | null;
  image_model?: string | null;
  video_model?: string | null;
  audio_model?: string | null;
  style_preset?: string | null;
  style_guide?: string | null;
  loras?: string | null;
};
export type JobEvent = {
  id: string;
  jobId: string;
  type: string;
  mode: string;
  status: string;
  created_at: string;
  index?: number | null;
  prompt?: string | null;
  text?: string | null;
  lyrics?: string | null;
  error?: string | null;
  attempt_count?: number;
  filename?: string | null;
};

function capitalize(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function jobStatusMeta(
  status: string,
  progress?: JobProgress,
): { label: string; tone: Tone } {
  switch (status) {
    case "complete":
      return { label: "Completed", tone: "success" };
    case "failed":
      return { label: "Failed", tone: "error" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    case "paused":
      return { label: "Paused", tone: "warning" };
    case "active":
      if (progress && progress.running > 0) {
        return { label: "Running", tone: "info" };
      }
      if (
        progress &&
        progress.running === 0 &&
        progress.pending === 0 &&
        progress.total > 0 &&
        progress.complete === progress.total
      ) {
        return { label: "Finishing", tone: "info" };
      }
      return { label: "Queued", tone: "neutral" };
    default:
      return { label: capitalize(status), tone: "neutral" };
  }
}

export function progressFraction(
  progress: Pick<JobProgress, "complete" | "total"> | null | undefined,
): string | null {
  if (!progress || progress.total <= 0) return null;
  return `${progress.complete}/${progress.total}`;
}

export function isCancelledEvent(event: {
  status: string;
  error?: string | null;
}): boolean {
  return (
    event.status === "failed" &&
    (event.error ?? "").trim().toLowerCase() === JOB_CANCELLED_ERROR
  );
}

export function eventDisplayStatus(event: {
  status: string;
  error?: string | null;
}): string {
  if (isCancelledEvent(event)) {
    return "cancelled";
  }
  return event.status;
}

export function eventStatusMeta(status: string): { label: string; tone: Tone } {
  switch (status) {
    case "pending":
      return { label: "Pending", tone: "neutral" };
    case "running":
      return { label: "Running", tone: "info" };
    case "complete":
      return { label: "Done", tone: "success" };
    case "failed":
      return { label: "Failed", tone: "error" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    default:
      return { label: capitalize(status), tone: "neutral" };
  }
}

export function eventKind(type: string): EventKind {
  switch (type) {
    case "new_text_prompt":
    case "NewTextPrompt":
      return "text";
    case "new_image_prompt":
    case "NewImagePrompt":
      return "image";
    case "new_video_prompt":
    case "NewVideoPrompt":
      return "video";
    case "new_transition_prompt":
    case "NewTransitionPrompt":
      return "transition";
    case "new_audio_prompt":
    case "NewAudioPrompt":
      return "audio";
    case "new_video_composition":
    case "NewVideoComposition":
      return "composition";
    default:
      return "other";
  }
}

export function eventLabel(type: string, mode?: string): string {
  const kind = eventKind(type);
  switch (kind) {
    case "image":
      return "Image";
    case "video":
      return "Video clip";
    case "transition":
      return "Transition";
    case "text":
      return "Script";
    case "composition":
      return "Final cut";
    case "audio":
      if (mode === "speech") return "Voiceover";
      if (mode === "song") return "Song";
      if (mode === "instrumental") return "Music";
      return "Audio";
    default:
      return type;
  }
}

export function canRegenerate(type: string): boolean {
  const kind = eventKind(type);
  return kind === "image" || kind === "video" || kind === "transition";
}

export function summarizeEvents(
  events: readonly {
    type: string;
    mode?: string;
    status: string;
    error?: string | null;
  }[],
): {
  total: number;
  complete: number;
  running: number;
  pending: number;
  failed: number;
  percent: number;
  byKind: Record<EventKind, number>;
  currentLabel: string | null;
} {
  let complete = 0;
  let running = 0;
  let pending = 0;
  let failed = 0;
  const byKind: Record<EventKind, number> = {
    text: 0,
    image: 0,
    video: 0,
    transition: 0,
    audio: 0,
    composition: 0,
    other: 0,
  };
  let runningEvent: { type: string; mode?: string } | undefined;
  let pendingEvent: { type: string; mode?: string } | undefined;

  for (const e of events) {
    if (e.status === "complete") complete++;
    else if (e.status === "running") {
      running++;
      if (!runningEvent) runningEvent = e;
    } else if (e.status === "pending") {
      pending++;
      if (!pendingEvent) pendingEvent = e;
    } else if (e.status === "failed" && !isCancelledEvent(e)) {
      failed++;
    }
    byKind[eventKind(e.type)]++;
  }

  const total = events.length;
  const percent = total > 0 ? Math.round((complete / total) * 100) : 0;
  const activeEvt = runningEvent ?? pendingEvent;
  const currentLabel = activeEvt
    ? eventLabel(activeEvt.type, activeEvt.mode)
    : null;

  return {
    total,
    complete,
    running,
    pending,
    failed,
    percent,
    byKind,
    currentLabel,
  };
}

export function jobDurationMs(
  createdAt: string,
  _events: readonly { created_at: string }[],
  status: string,
  now: number,
): number | null {
  if (status !== "active") return null;
  const start = Date.parse(createdAt);
  if (Number.isNaN(start)) return null;
  return Math.max(0, now - start);
}

export function formatDuration(ms: number): string {
  if (ms <= 0 || Number.isNaN(ms)) return "0s";
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (totalMin < 60) {
    return `${totalMin}m ${sec}s`;
  }
  const hours = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return `${hours}h ${String(min).padStart(2, "0")}m`;
}

export function formatRelativeTime(iso: string, now: number): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  const diffMs = Math.max(0, now - ts);
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(diffMs / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(diffMs / 3_600_000);
  if (hr < 24) return `${hr}h ago`;
  if (hr < 48) return "Yesterday";
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 7) return `${days}d ago`;

  const d = new Date(ts);
  const nowDate = new Date(now);
  const monthDay = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const year = d.getUTCFullYear();
  if (year !== nowDate.getUTCFullYear()) {
    return `${monthDay}, ${year}`;
  }
  return monthDay;
}

export function jobKindMeta(kind: JobKind): { label: string; route: string } {
  switch (kind) {
    case "image":
      return { label: "Image", route: "/create/image" };
    case "video":
      return { label: "Video", route: "/create/video" };
    case "audio":
      return { label: "Audio", route: "/create/audio" };
    case "compose":
      return { label: "Compose", route: "/compose" };
  }
}

export function filterJobs<
  T extends {
    status: string;
    name: string;
    original_prompt?: string | null;
    created_at: string;
  },
>(jobs: readonly T[], opts: { status?: string; query?: string }): T[] {
  const statusFilter =
    opts.status && opts.status !== "all" && opts.status !== "recent"
      ? opts.status
      : null;
  const q = opts.query?.trim().toLowerCase() ?? "";

  return jobs
    .filter((j) => {
      if (statusFilter && j.status !== statusFilter) return false;
      if (q) {
        const inName = j.name.toLowerCase().includes(q);
        const inPrompt = (j.original_prompt ?? "").toLowerCase().includes(q);
        if (!inName && !inPrompt) return false;
      }
      return true;
    })
    .slice()
    .sort(
      (a, b) =>
        (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0),
    );
}

export function countByStatus(jobs: readonly { status: string }[]): {
  all: number;
  active: number;
  complete: number;
  failed: number;
  paused: number;
  cancelled: number;
} {
  const counts = {
    all: jobs.length,
    active: 0,
    complete: 0,
    failed: 0,
    paused: 0,
    cancelled: 0,
  };
  for (const j of jobs) {
    if (j.status === "active") counts.active++;
    else if (j.status === "complete") counts.complete++;
    else if (j.status === "failed") counts.failed++;
    else if (j.status === "paused") counts.paused++;
    else if (j.status === "cancelled") counts.cancelled++;
  }
  return counts;
}

export function availableJobActions(status: string): JobAction[] {
  switch (status) {
    case "active":
      return ["pause", "cancel"];
    case "paused":
      return ["resume", "cancel"];
    case "failed":
      return ["retry", "delete"];
    case "complete":
    case "cancelled":
      return ["delete"];
    default:
      return [];
  }
}

export function splitPrompt(
  originalPrompt: string | null | undefined,
  styleGuide: string | null | undefined,
): { prompt: string; styleGuide: string } {
  const sg = (styleGuide ?? "").trim();
  let p = originalPrompt ?? "";
  if (sg) {
    const suffix1 = `\n\nStyle Guide: ${sg}`;
    const suffix2 = `\n\nStyle guide: ${sg}`;
    if (p.endsWith(suffix1)) {
      p = p.slice(0, -suffix1.length);
    } else if (p.endsWith(suffix2)) {
      p = p.slice(0, -suffix2.length);
    }
  }
  return { prompt: p, styleGuide: sg };
}

function hasNonEmptyLoras(loras: string | null | undefined): boolean {
  if (!loras) return false;
  try {
    const parsed: unknown = JSON.parse(loras);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

export function jobToPrefill(job: JobSummary): {
  route: string;
  values: Record<string, string>;
} {
  const { prompt, styleGuide } = splitPrompt(
    job.original_prompt,
    job.style_guide,
  );
  const values: Record<string, string> = {};

  if (job.kind === "audio") {
    if (prompt) values.instrumental_prompt = prompt;
    return { route: "/create/audio", values };
  }

  if (job.kind === "compose") {
    if (prompt) values.script = prompt;
  } else {
    if (prompt) values.prompt = prompt;
  }

  if (styleGuide) values.style_guide = styleGuide;
  if (job.resolution) values.resolution = job.resolution;
  if (job.image_model) values.image_model = job.image_model;
  if (job.video_model) values.video_model = job.video_model;
  if (job.fps != null) values.fps = String(job.fps);
  if (job.clip_duration != null)
    values.clip_duration = String(job.clip_duration);
  if (job.transition_duration != null)
    values.transition_duration = String(job.transition_duration);
  if (job.style_preset && job.style_preset !== "none") {
    values.style_preset = job.style_preset;
  }
  const hasLoras = hasNonEmptyLoras(job.loras);
  if (hasLoras && job.loras) {
    values.loras = job.loras;
  }

  if (job.kind === "image") {
    return { route: "/create/image", values };
  }
  if (job.kind === "compose") {
    return { route: "/compose", values };
  }
  const route =
    values.style_preset || hasLoras ? "/create/video" : "/create/text-to-video";
  return { route, values };
}

export type JobTransition = {
  id: string;
  name: string;
  from: string;
  to: "complete" | "failed";
};

export function detectTransitions(
  prev: ReadonlyMap<string, string>,
  next: readonly { id: string; name: string; status: string }[],
): JobTransition[] {
  const out: JobTransition[] = [];
  for (const j of next) {
    const from = prev.get(j.id);
    if (
      (from === "active" || from === "paused") &&
      (j.status === "complete" || j.status === "failed")
    ) {
      out.push({ id: j.id, name: j.name, from, to: j.status });
    }
  }
  return out;
}

export function shouldApplyResponse(seq: number, lastApplied: number): boolean {
  return seq > lastApplied;
}

export function nextBackoffMs(attempt: number): number {
  const exp = Math.max(0, attempt);
  return Math.min(30_000, 1000 * 2 ** exp);
}

function isIdLikeStem(stem: string): boolean {
  const trimmed = stem.trim();
  if (!trimmed) return true;
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  const withoutCounters = trimmed.replace(/_+\d+_*/g, "_");
  const cleaned = withoutCounters.replace(/^[_-]+|[_-]+$/g, "").trim();
  if (!cleaned) return true;
  const tokens = cleaned.split(/[_-]+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every(
    (t) => /^\d+$/.test(t) || (/^[0-9a-f]{6,}$/i.test(t) && /\d/.test(t)),
  );
}

export function mediaTitle(item: {
  job_name?: string | null;
  filename: string;
  mediaType: MediaType;
}): string {
  const name = item.job_name?.trim();
  if (name) return name;

  const base = item.filename.split(/[\\/]/).pop() ?? "";
  const dotIdx = base.lastIndexOf(".");
  const stem = (dotIdx > 0 ? base.slice(0, dotIdx) : base).trim();

  if (stem && !isIdLikeStem(stem)) {
    return stem;
  }

  switch (item.mediaType) {
    case "video":
      return "Untitled video";
    case "audio":
      return "Untitled audio";
    default:
      return "Untitled image";
  }
}

export function mediaKindLabel(item: {
  mediaType: MediaType;
  subfolder?: string | null;
  filename?: string | null;
}): string {
  if (item.mediaType === "audio") {
    const sub = (item.subfolder ?? "").replace(/^\/+|\/+$/g, "").trim();
    const fn = (item.filename ?? "").replace(/^\/+/, "").trim();
    if (sub === "tts" || sub.startsWith("tts/") || fn.startsWith("tts/")) {
      return "Voiceover";
    }
    return "Audio";
  }
  if (item.mediaType === "video") return "Video";
  return "Image";
}

export function plural(
  n: number,
  singular: string,
  pluralWord = `${singular}s`,
): string {
  return `${n} ${n === 1 ? singular : pluralWord}`;
}

export function shouldShowNewMedia(
  prevCompleted: number | null,
  nextCompleted: number,
): boolean {
  return typeof prevCompleted === "number" && nextCompleted > prevCompleted;
}

export type GalleryPageOutcome = "continue" | "end" | "stalled";

export function galleryPageDecision(opts: {
  added: number;
  nextCursor: string | null | undefined;
  prevCursor: string | null | undefined;
}): GalleryPageOutcome {
  if (!opts.nextCursor) {
    return "end";
  }
  if (opts.nextCursor === opts.prevCursor || opts.added <= 0) {
    return "stalled";
  }
  return "continue";
}

export type MobileFocusLocation =
  "body" | "list" | "detail" | "skeleton-back" | "other";

export function shouldMoveMobileFocusForActive(opts: {
  activeIn: MobileFocusLocation;
}): boolean {
  return (
    opts.activeIn === "body" ||
    opts.activeIn === "list" ||
    opts.activeIn === "skeleton-back"
  );
}

export function shouldPreviewOnFocus(lastPointerType: string | null): boolean {
  return lastPointerType !== "touch";
}

export function createPointerLatch(
  now: () => number = () => Date.now(),
  ttlMs = 700,
): {
  note: (type: string | null | undefined) => void;
  consume: () => string | null;
  clear: () => void;
} {
  let storedType: string | null = null;
  let storedAt = 0;

  return {
    note(type: string | null | undefined) {
      if (!type) {
        storedType = null;
        storedAt = 0;
        return;
      }
      storedType = type;
      storedAt = now();
    },
    consume(): string | null {
      const current = storedType;
      const at = storedAt;
      storedType = null;
      storedAt = 0;
      if (!current) return null;
      if (now() - at > ttlMs) return null;
      return current;
    },
    clear() {
      storedType = null;
      storedAt = 0;
    },
  };
}

export const MEDIA_RETRY_BACKOFF_MS: readonly number[] = [
  1000, 2000, 4000, 8000,
];

export function shouldRetryMedia(opts: {
  status: string;
  completeEvents: number;
  items: number;
  attempt: number;
}): boolean {
  const settled =
    opts.status === "complete" ||
    opts.status === "failed" ||
    opts.status === "cancelled";
  if (!settled) return false;
  if (opts.completeEvents < 1) return false;
  if (opts.items >= opts.completeEvents) return false;
  return opts.attempt >= 0 && opts.attempt < MEDIA_RETRY_BACKOFF_MS.length;
}

export function isStreamStale(
  lastMessageAt: number | null | undefined,
  now: number,
  timeoutMs = 40_000,
): boolean {
  if (typeof lastMessageAt !== "number") return false;
  return now - lastMessageAt >= timeoutMs;
}

export function jobSignature(job: JobSummary): string {
  const p = job.progress;
  return `${job.status}:${p.total}:${p.complete}:${p.running}:${p.pending}:${p.failed}`;
}

export function changedJobIds(
  prev: ReadonlyMap<string, string>,
  next: readonly JobSummary[],
  skip?: ReadonlySet<string>,
): string[] {
  const changed: string[] = [];
  const seen = new Set<string>();
  for (const j of next) {
    seen.add(j.id);
    const sig = jobSignature(j);
    if (prev.get(j.id) !== sig && !skip?.has(j.id)) {
      changed.push(j.id);
    }
  }
  for (const id of prev.keys()) {
    if (!seen.has(id) && !skip?.has(id)) {
      changed.push(id);
    }
  }
  return changed;
}
