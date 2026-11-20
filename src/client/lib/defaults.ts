import {
  AUDIO_MODEL_IDS,
  AUDIO_MODELS,
  isAudioModelId,
  normalizeAudioModelId,
  SOUND_PRESET_CATEGORIES,
  type AudioModelId,
  type SoundPresetCategory,
} from "../../shared/audio-models";
import {
  getVideoModelSpec,
  VIDEO_MODEL_IDS,
  VIDEO_MODELS as SHARED_VIDEO_MODELS,
  VIDEO_RESOLUTIONS,
  type VideoResolutionId,
} from "../../shared/video-models";

export type GenerationDefaults = {
  style_preset: string;
  fps: number;
  clip_duration: number;
  transition_duration: number;
  resolution: string;
  image_model: string;
  video_model: string;
  audio_model: AudioModelId;
  compose_audio_model: AudioModelId;
};

// Compact labels for selects and summaries; ids come from the shared catalog.
const RESOLUTION_LABELS: Record<VideoResolutionId, string> = {
  "480p": "480p",
  "720p": "720p",
  "768p": "768p (H3 native)",
  "1080p": "1080p",
  "9_16_SD": "9:16 (SD)",
  "9_16_HD": "9:16 (HD)",
  "1_1_768": "1:1 (768)",
  "4_3_768": "4:3 (768)",
};

export const RESOLUTIONS: readonly { value: string; label: string }[] =
  VIDEO_RESOLUTIONS.map((r) => ({
    value: r.value,
    label: RESOLUTION_LABELS[r.value],
  }));

export const IMAGE_MODELS: readonly { value: string; label: string }[] = [
  { value: "z-image-turbo", label: "Z-Image-Turbo" },
] as const;

export const VIDEO_MODELS: readonly { value: string; label: string }[] =
  VIDEO_MODEL_IDS.map((id) => ({
    value: id,
    label: SHARED_VIDEO_MODELS[id].label,
  }));

export const AUDIO_MODEL_OPTIONS: readonly {
  value: AudioModelId;
  label: string;
}[] = AUDIO_MODEL_IDS.map((id) => ({
  value: id,
  label: AUDIO_MODELS[id].label,
}));

export const FALLBACK_DEFAULTS: GenerationDefaults = {
  style_preset: "none",
  fps: 16,
  clip_duration: 5,
  transition_duration: 2,
  resolution: "720p",
  image_model: "z-image-turbo",
  video_model: "wan2.2",
  audio_model: "ace-step-1.5",
  compose_audio_model: "stable-audio-3",
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

  const maxClipDuration = getVideoModelSpec(videoModel).maxDuration;
  const clipDuration = clampInt(
    map.default_clip_duration,
    1,
    maxClipDuration,
    FALLBACK_DEFAULTS.clip_duration,
  );

  const audioModel = normalizeAudioModelId(
    map.default_audio_model,
    FALLBACK_DEFAULTS.audio_model,
  );

  const composeAudioModel = normalizeAudioModelId(
    map.default_compose_audio_model,
    FALLBACK_DEFAULTS.compose_audio_model,
  );

  return {
    style_preset: stylePreset,
    fps,
    clip_duration: clipDuration,
    transition_duration: transitionDuration,
    resolution,
    image_model: imageModel,
    video_model: videoModel,
    audio_model: audioModel,
    compose_audio_model: composeAudioModel,
  };
}

export function labelOf(
  options: readonly { value: string; label: string }[],
  value: string,
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

export type PresetFormInput = {
  name: string;
  description: string;
  primary_style: string;
  secondary_trigger: string;
  styles: string;
  texture: string;
};

export type PresetPayload = {
  name: string;
  description: string | null;
  primary_style?: string;
  secondary_trigger: string | null;
  styles: string[];
  texture: string | null;
};

export type PresetFieldErrors = Partial<Record<keyof PresetFormInput, string>>;

export function buildPresetPayload(
  form: PresetFormInput,
  mode: "create" | "update",
): { payload: PresetPayload } | { errors: PresetFieldErrors } {
  const errors: PresetFieldErrors = {};

  const name = form.name.trim();
  if (!name) {
    errors.name = "Name is required";
  } else if (name.length > 50) {
    errors.name = "Name must be at most 50 characters";
  }

  const description = form.description.trim();
  if (description.length > 500) {
    errors.description = "Description must be at most 500 characters";
  }

  const primaryStyle = form.primary_style.trim();
  if (primaryStyle.length > 50) {
    errors.primary_style = "Primary style must be at most 50 characters";
  }

  const secondaryTrigger = form.secondary_trigger.trim();
  if (secondaryTrigger.length > 100) {
    errors.secondary_trigger =
      "Secondary trigger must be at most 100 characters";
  }

  const styles = form.styles
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (styles.length > 100) {
    errors.styles = "At most 100 styles are allowed";
  } else if (styles.some((s) => s.length > 1000)) {
    errors.styles = "Each style must be at most 1000 characters";
  }

  const texture = form.texture.trim();
  if (texture.length > 500) {
    errors.texture = "Texture must be at most 500 characters";
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  const payload: PresetPayload = {
    name,
    description: description || null,
    secondary_trigger: secondaryTrigger || null,
    styles,
    texture: texture || null,
  };

  if (mode === "create") {
    payload.primary_style = primaryStyle || name;
  } else if (primaryStyle) {
    payload.primary_style = primaryStyle;
  }

  return { payload };
}

export type SoundPresetFormInput = {
  name: string;
  description: string;
  audio_model: AudioModelId;
  category: SoundPresetCategory;
  instrumental_prompt: string;
  lyric_prompt: string;
  duration: string;
};

export type SoundPresetPayload = {
  name: string;
  description: string;
  audio_model: AudioModelId;
  category: SoundPresetCategory;
  instrumental_prompt: string;
  lyric_prompt: string;
  settings: Record<string, unknown>;
};

export type SoundPresetFieldErrors = Partial<
  Record<keyof SoundPresetFormInput, string>
>;

export function buildSoundPresetPayload(
  form: SoundPresetFormInput,
  baseSettings: Record<string, unknown> = {},
): { payload: SoundPresetPayload } | { errors: SoundPresetFieldErrors } {
  const errors: SoundPresetFieldErrors = {};
  const name = form.name.trim();
  if (!name) {
    errors.name = "Name is required";
  } else if (name.length > 80) {
    errors.name = "Name must be at most 80 characters";
  }

  const description = form.description.trim();
  if (description.length > 500) {
    errors.description = "Description must be at most 500 characters";
  }

  const modelId: AudioModelId = isAudioModelId(form.audio_model)
    ? form.audio_model
    : "ace-step-1.5";
  const spec = AUDIO_MODELS[modelId];

  const category: SoundPresetCategory = (
    SOUND_PRESET_CATEGORIES as readonly string[]
  ).includes(form.category)
    ? form.category
    : "Song";

  const inst = form.instrumental_prompt.trim();
  if (!inst) {
    errors.instrumental_prompt = "Style / caption prompt is required";
  } else if (inst.length > 4000) {
    errors.instrumental_prompt = "Prompt must be at most 4000 characters";
  }

  const lyric = form.lyric_prompt.trim();
  if (lyric.length > 8000) {
    errors.lyric_prompt = "Lyrics must be at most 8000 characters";
  }

  const nextSettings: Record<string, unknown> = { ...baseSettings };
  const rawDur = form.duration.trim();
  if (rawDur) {
    const durNum = Number(rawDur);
    if (
      !Number.isInteger(durNum) ||
      durNum < spec.minDuration ||
      durNum > spec.maxDuration
    ) {
      errors.duration = `Duration must be between ${spec.minDuration} and ${spec.maxDuration}s`;
    } else {
      nextSettings.duration = durNum;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    payload: {
      name,
      description,
      audio_model: modelId,
      category,
      instrumental_prompt: inst,
      lyric_prompt: spec.supportsLyrics ? lyric : "",
      settings: nextSettings,
    },
  };
}

export type DefaultsFormEntries = {
  default_style_preset: string;
  default_resolution: string;
  default_image_model: string;
  default_video_model: string;
  default_audio_model?: string;
  default_compose_audio_model?: string;
  default_fps: string;
  default_clip_duration: string;
  default_transition_duration: string;
};

export type DefaultsFieldErrors = Partial<
  Record<keyof DefaultsFormEntries, string>
>;

function parseCanonicalInt(
  raw: string,
  min: number,
  max: number,
  label: string,
): { value: string } | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { error: `${label} is required` };
  }
  if (!/^-?\d+$/.test(trimmed)) {
    return {
      error: `${label} must be a whole number between ${min} and ${max}`,
    };
  }
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    return { error: `${label} must be between ${min} and ${max}` };
  }
  return { value: String(n) };
}

export function normalizeDefaults(
  form: DefaultsFormEntries,
): { values: Required<DefaultsFormEntries> } | { errors: DefaultsFieldErrors } {
  const errors: DefaultsFieldErrors = {};

  const fpsRes = parseCanonicalInt(form.default_fps, 1, 24, "Default FPS");
  const maxClipDuration = getVideoModelSpec(
    form.default_video_model,
  ).maxDuration;
  const clipRes = parseCanonicalInt(
    form.default_clip_duration,
    1,
    maxClipDuration,
    "Default clip duration",
  );
  const transRes = parseCanonicalInt(
    form.default_transition_duration,
    1,
    10,
    "Default transition duration",
  );

  if ("error" in fpsRes) errors.default_fps = fpsRes.error;
  if ("error" in clipRes) errors.default_clip_duration = clipRes.error;
  if ("error" in transRes) errors.default_transition_duration = transRes.error;

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    values: {
      default_style_preset: form.default_style_preset,
      default_resolution: form.default_resolution,
      default_image_model: form.default_image_model,
      default_video_model: form.default_video_model,
      default_audio_model: normalizeAudioModelId(
        form.default_audio_model,
        FALLBACK_DEFAULTS.audio_model,
      ),
      default_compose_audio_model: normalizeAudioModelId(
        form.default_compose_audio_model,
        FALLBACK_DEFAULTS.compose_audio_model,
      ),
      default_fps: "value" in fpsRes ? fpsRes.value : form.default_fps,
      default_clip_duration:
        "value" in clipRes ? clipRes.value : form.default_clip_duration,
      default_transition_duration:
        "value" in transRes ? transRes.value : form.default_transition_duration,
    },
  };
}

export function dedupeLoras(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}
