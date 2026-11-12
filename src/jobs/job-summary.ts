export type JobKind = "image" | "video" | "audio" | "compose";
export type EventSig = {
  type: string;
  mode: string;
  status: string;
  count: number;
};
export type JobProgress = {
  total: number;
  complete: number;
  running: number;
  pending: number;
  failed: number;
};
export type MediaType = "image" | "video" | "audio";
export type JobThumb = {
  subfolder: string;
  filename: string;
  mediaType: MediaType;
};

const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
const VIDEO_EXTS = ["mp4", "mov", "avi", "mkv", "webm"];
const AUDIO_EXTS = [
  "mp3",
  "wav",
  "flac",
  "ogg",
  "m4a",
  "aac",
  "wma",
  "opus",
  "aiff",
];

export function mediaTypeFromFilename(filename: string): MediaType | null {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = filename.slice(dot + 1).toLowerCase();
  if (!ext) return null;
  if (IMAGE_EXTS.includes(ext)) return "image";
  if (VIDEO_EXTS.includes(ext)) return "video";
  if (AUDIO_EXTS.includes(ext)) return "audio";
  return null;
}

export function deriveJobKind(
  job: {
    workflow?: string | null;
    image_model?: string | null;
    video_model?: string | null;
    audio_model?: string | null;
  },
  sigs: readonly EventSig[],
): JobKind {
  const types = new Set(sigs.map((s) => s.type));
  if (types.has("new_text_prompt") || job.workflow === "autocut") {
    return "compose";
  }
  if (job.workflow === "hypercut") return "video";
  if (
    job.workflow === "video" ||
    types.has("new_video_prompt") ||
    types.has("new_transition_prompt")
  ) {
    return "video";
  }
  if (types.has("new_audio_prompt")) {
    return "audio";
  }
  if (types.has("new_image_prompt")) {
    return "image";
  }
  if (job.audio_model && !job.image_model && !job.video_model) {
    return "audio";
  }
  if (job.video_model && job.audio_model) {
    return "compose";
  }
  if (job.video_model) {
    return "video";
  }
  return "image";
}

export function aggregateProgress(sigs: readonly EventSig[]): JobProgress {
  let complete = 0;
  let running = 0;
  let pending = 0;
  let failed = 0;
  for (const s of sigs) {
    const count = Number(s.count) || 0;
    if (s.status === "complete") complete += count;
    else if (s.status === "running") running += count;
    else if (s.status === "pending") pending += count;
    else if (s.status === "failed") failed += count;
  }
  const total = complete + running + pending + failed;
  return { total, complete, running, pending, failed };
}

export function pickThumb(
  rows: readonly { filename: string; subfolder: string }[],
): JobThumb | null {
  let firstVideo: JobThumb | null = null;
  for (const row of rows) {
    const mediaType = mediaTypeFromFilename(row.filename);
    if (mediaType === "image") {
      return {
        subfolder: row.subfolder,
        filename: row.filename,
        mediaType: "image",
      };
    }
    if (mediaType === "video" && !firstVideo) {
      firstVideo = {
        subfolder: row.subfolder,
        filename: row.filename,
        mediaType: "video",
      };
    }
  }
  return firstVideo;
}

export function takePage<T>(
  items: readonly T[],
  offset: number,
  limit: number,
  scan?: { scannedCount: number; scanLimit: number },
): { slice: T[]; total: number; hasMore: boolean } {
  const safeOffset = Math.max(0, offset);
  const safeLimit = Math.max(0, limit);
  const end = safeOffset + safeLimit;
  const hitScanCap = Boolean(
    scan &&
    scan.scanLimit > 0 &&
    scan.scannedCount >= scan.scanLimit &&
    items.length <= end,
  );
  return {
    slice: items.slice(safeOffset, end),
    total: Math.min(items.length, end),
    hasMore: items.length > end || hitScanCap,
  };
}

export type FinalizeDecisionInput = {
  job: {
    workflow?: string | null;
    image_model?: string | null;
    video_model?: string | null;
    audio_model?: string | null;
  };
  events: readonly {
    type: string;
    status: string;
  }[];
};

export function isStandaloneAudioJob(
  job: FinalizeDecisionInput["job"],
  events: FinalizeDecisionInput["events"],
): boolean {
  return Boolean(
    job.audio_model &&
    !job.image_model &&
    !job.video_model &&
    events.length > 0 &&
    events.every((e) => e.type === "new_audio_prompt"),
  );
}

export function finalizeDecision(
  input: FinalizeDecisionInput,
): "complete" | "failed" | "wait" {
  const { job, events } = input;
  if (events.some((e) => e.status === "failed")) {
    return "failed";
  }
  if (job.workflow === "video") {
    const hasCompleteVideo = events.some(
      (e) => e.type === "new_video_prompt" && e.status === "complete",
    );
    if (!hasCompleteVideo) {
      return "wait";
    }
  }
  if (job.workflow === "compose") {
    const hasImageEvent = events.some((e) => e.type === "new_image_prompt");
    if (!hasImageEvent && !isStandaloneAudioJob(job, events)) {
      return "wait";
    }
  }
  return "complete";
}
