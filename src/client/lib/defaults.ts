export type GenerationDefaults = {
  style_preset: string;
  fps: number;
  clip_duration: number;
  transition_duration: number;
  resolution: string;
  image_model: string;
  video_model: string;
};

export const RESOLUTIONS: readonly { value: string; label: string }[] = [
  { value: "480p", label: "480p" },
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
  { value: "9_16_SD", label: "9:16 (SD)" },
  { value: "9_16_HD", label: "9:16 (HD)" },
] as const;

export const IMAGE_MODELS: readonly { value: string; label: string }[] = [
  { value: "z-image-turbo", label: "Z-Image-Turbo" },
] as const;

export const VIDEO_MODELS: readonly { value: string; label: string }[] = [
  { value: "wan2.2", label: "Wan 2.2" },
  { value: "ltx2.3", label: "LTX 2.3" },
] as const;

export const FALLBACK_DEFAULTS: GenerationDefaults = {
  style_preset: "none",
  fps: 16,
  clip_duration: 5,
  transition_duration: 2,
  resolution: "720p",
  image_model: "z-image-turbo",
  video_model: "wan2.2",
};

const VALID_RESOLUTIONS = new Set(RESOLUTIONS.map((r) => r.value));
const VALID_IMAGE_MODELS = new Set(IMAGE_MODELS.map((m) => m.value));
const VALID_VIDEO_MODELS = new Set(VIDEO_MODELS.map((m) => m.value));

function clampInt(
  raw: string | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function toGenerationDefaults(
  map: Record<string, string> | null | undefined,
): GenerationDefaults {
  if (!map) return { ...FALLBACK_DEFAULTS };

  const stylePreset = map.default_style_preset?.trim()
    ? map.default_style_preset.trim()
    : FALLBACK_DEFAULTS.style_preset;

  const fps = clampInt(map.default_fps, 1, 24, FALLBACK_DEFAULTS.fps);
  const clipDuration = clampInt(
    map.default_clip_duration,
    1,
    10,
    FALLBACK_DEFAULTS.clip_duration,
  );
  const transitionDuration = clampInt(
    map.default_transition_duration,
    1,
    10,
    FALLBACK_DEFAULTS.transition_duration,
  );

  const resolution =
    map.default_resolution && VALID_RESOLUTIONS.has(map.default_resolution)
      ? map.default_resolution
      : FALLBACK_DEFAULTS.resolution;

  const imageModel =
    map.default_image_model && VALID_IMAGE_MODELS.has(map.default_image_model)
      ? map.default_image_model
      : FALLBACK_DEFAULTS.image_model;

  const videoModel =
    map.default_video_model && VALID_VIDEO_MODELS.has(map.default_video_model)
      ? map.default_video_model
      : FALLBACK_DEFAULTS.video_model;

  return {
    style_preset: stylePreset,
    fps,
    clip_duration: clipDuration,
    transition_duration: transitionDuration,
    resolution,
    image_model: imageModel,
    video_model: videoModel,
  };
}

export function labelOf(
  options: readonly { value: string; label: string }[],
  value: string,
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}
