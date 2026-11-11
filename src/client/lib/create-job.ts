import { ApiError, apiSend } from "./api-client";
import type { GenerationDefaults } from "./defaults";
import type { JobKind } from "./job-view";

export type CreateKind =
  "image" | "video" | "text-to-video" | "audio" | "compose";

export const CREATE_KINDS: Record<
  CreateKind,
  { label: string; route: string; endpoint: string; jobKind: JobKind }
> = {
  image: {
    label: "Image",
    route: "/create/image",
    endpoint: "/api/jobs/images",
    jobKind: "image",
  },
  video: {
    label: "Video",
    route: "/create/video",
    endpoint: "/api/jobs/videos",
    jobKind: "video",
  },
  "text-to-video": {
    label: "Text to Video",
    route: "/create/text-to-video",
    endpoint: "/api/jobs/videos",
    jobKind: "video",
  },
  audio: {
    label: "Audio",
    route: "/create/audio",
    endpoint: "/api/jobs/audio",
    jobKind: "audio",
  },
  compose: {
    label: "Compose",
    route: "/compose",
    endpoint: "/api/jobs/videos/compose",
    jobKind: "compose",
  },
};

export const AUDIO_DEFAULTS = {
  duration: "60",
  bpm: "72",
  cfg_scale: "2",
  temperature: "0.85",
  top_p: "0.9",
  keyscale: "E minor",
  timesignature: "4",
} as const;

export function quickCreateValues(
  kind: Exclude<CreateKind, "compose">,
  prompt: string,
  d: GenerationDefaults,
  overrides?: Record<string, string>,
): Record<string, string> {
  switch (kind) {
    case "image":
      return {
        prompt,
        resolution: d.resolution,
        image_model: d.image_model,
        style_preset: d.style_preset,
        batch_size: "1",
        ...overrides,
      };
    case "video":
      return {
        prompt,
        resolution: d.resolution,
        video_model: d.video_model,
        fps: String(d.fps),
        clip_duration: String(d.clip_duration),
        style_preset: d.style_preset,
        ...overrides,
      };
    case "text-to-video":
      return {
        prompt,
        resolution: d.resolution,
        video_model: d.video_model,
        fps: String(d.fps),
        clip_duration: String(d.clip_duration),
        ...overrides,
      };
    case "audio":
      return {
        instrumental_prompt: prompt,
        lyric_prompt: "",
        ...AUDIO_DEFAULTS,
        ...overrides,
      };
  }
}

export function toFormData(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) {
    fd.append(k, v);
  }
  return fd;
}

export async function submitCreateJob(
  kind: CreateKind,
  body: FormData | Record<string, string>,
): Promise<{ jobId: string }> {
  const fd = body instanceof FormData ? body : toFormData(body);
  const res = await apiSend<{ jobId?: string }>(
    "POST",
    CREATE_KINDS[kind].endpoint,
    fd,
  );
  if (!res || typeof res.jobId !== "string" || !res.jobId) {
    throw new ApiError(500, "The server did not return a job id");
  }
  return { jobId: res.jobId };
}
