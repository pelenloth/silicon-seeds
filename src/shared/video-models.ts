export const VIDEO_MODEL_IDS = ["wan2.2", "ltx2.3", "minimax-h3"] as const;
export type VideoModelId = (typeof VIDEO_MODEL_IDS)[number];

export const VIDEO_RESOLUTION_IDS = [
  "480p",
  "720p",
  "768p",
  "1080p",
  "9_16_SD",
  "9_16_HD",
  "1_1_768",
  "4_3_768",
] as const;
export type VideoResolutionId = (typeof VIDEO_RESOLUTION_IDS)[number];

export const VIDEO_RESOLUTIONS: readonly {
  value: VideoResolutionId;
  label: string;
  width: number;
  height: number;
}[] = [
  { value: "480p", label: "480p (640x480)", width: 640, height: 480 },
  { value: "720p", label: "720p (1280x720)", width: 1280, height: 720 },
  {
    value: "768p",
    label: "768p H3 Native (1344x768)",
    width: 1344,
    height: 768,
  },
  { value: "1080p", label: "1080p (1920x1080)", width: 1920, height: 1080 },
  { value: "9_16_SD", label: "9:16 SD (720x1280)", width: 720, height: 1280 },
  { value: "9_16_HD", label: "9:16 HD (1080x1920)", width: 1080, height: 1920 },
  { value: "1_1_768", label: "1:1 Square (768x768)", width: 768, height: 768 },
  {
    value: "4_3_768",
    label: "4:3 Classic (1120x832)",
    width: 1120,
    height: 832,
  },
] as const;

export const MINIMAX_H3_MODES = ["t2v", "i2v", "fl2v", "multiframe"] as const;
export type MiniMaxH3Mode = (typeof MINIMAX_H3_MODES)[number];

export const MINIMAX_H3_VARIANTS = [
  "turbo_8",
  "turbo_4",
  "fasth3",
  "standard",
] as const;
export type MiniMaxH3Variant = (typeof MINIMAX_H3_VARIANTS)[number];

export const MINIMAX_H3_REF_IMAGE_SIZES = ["match", "max"] as const;
export type MiniMaxH3RefImageSize = (typeof MINIMAX_H3_REF_IMAGE_SIZES)[number];

export const MINIMAX_H3_SEQUENCE_MODES = [
  "single",
  "continuation",
  "transition",
] as const;
export type MiniMaxH3SequenceMode = (typeof MINIMAX_H3_SEQUENCE_MODES)[number];

export const MINIMAX_H3_STYLE_EMBEDDING_IDS = [
  "art_is_explosion",
  "blooming_flowers",
  "bullet_time",
  "dark_magic",
  "fire_breath",
  "four_seasons",
  "kiss_camera",
  "spiral_ascent",
  "storm_magic",
  "truman_show",
] as const;
export type MiniMaxH3StyleEmbeddingId =
  (typeof MINIMAX_H3_STYLE_EMBEDDING_IDS)[number];

export type MiniMaxH3StyleEmbeddingSpec = {
  id: MiniMaxH3StyleEmbeddingId;
  label: string;
  token: string;
  filename: string;
};

export const MINIMAX_H3_STYLE_EMBEDDINGS: readonly MiniMaxH3StyleEmbeddingSpec[] =
  [
    {
      id: "art_is_explosion",
      label: "Art Is Explosion",
      token: "embedding:minimaxh3_art_is_explosion",
      filename: "minimaxh3_art_is_explosion.safetensors",
    },
    {
      id: "blooming_flowers",
      label: "Blooming Flowers",
      token: "embedding:minimaxh3_blooming_flowers",
      filename: "minimaxh3_blooming_flowers.safetensors",
    },
    {
      id: "bullet_time",
      label: "Bullet Time",
      token: "embedding:minimaxh3_bullet_time",
      filename: "minimaxh3_bullet_time.safetensors",
    },
    {
      id: "dark_magic",
      label: "Dark Magic",
      token: "embedding:minimaxh3_dark_magic",
      filename: "minimaxh3_dark_magic.safetensors",
    },
    {
      id: "fire_breath",
      label: "Fire Breath",
      token: "embedding:minimaxh3_fire_breath",
      filename: "minimaxh3_fire_breath.safetensors",
    },
    {
      id: "four_seasons",
      label: "Four Seasons",
      token: "embedding:minimaxh3_four_seasons",
      filename: "minimaxh3_four_seasons.safetensors",
    },
    {
      id: "kiss_camera",
      label: "Kiss Camera",
      token: "embedding:minimaxh3_kiss_camera",
      filename: "minimaxh3_kiss_camera.safetensors",
    },
    {
      id: "spiral_ascent",
      label: "Spiral Ascent",
      token: "embedding:minimaxh3_spiral_ascent",
      filename: "minimaxh3_spiral_ascent.safetensors",
    },
    {
      id: "storm_magic",
      label: "Storm Magic",
      token: "embedding:minimaxh3_storm_magic",
      filename: "minimaxh3_storm_magic.safetensors",
    },
    {
      id: "truman_show",
      label: "Truman Show",
      token: "embedding:minimaxh3_truman_show",
      filename: "minimaxh3_truman_show.safetensors",
    },
  ] as const;

export type KeyframeGuideSpec = {
  refIndex: number;
  frameIdx: number;
};

export type VideoJobSettings = {
  h3_mode?: MiniMaxH3Mode;
  h3_variant?: MiniMaxH3Variant;
  ref_image_size?: MiniMaxH3RefImageSize;
  soundscape?: string;
  music?: string;
  style_embedding?: MiniMaxH3StyleEmbeddingId;
  first_frame?: string;
  last_frame?: string;
  reference_images?: string[];
  keyframe_guides?: KeyframeGuideSpec[];
  sequence_mode?: MiniMaxH3SequenceMode;
  sequence_prompts?: string[];
};

export type VideoModelSpec = {
  id: VideoModelId;
  label: string;
  shortDesc: string;
  nativeFps: number;
  minDuration: number;
  maxDuration: number;
  defaultDuration: number;
  defaultResolution: VideoResolutionId;
  generatesNativeAudio: boolean;
  supportsFirstLastFrame: boolean;
  supportsReferenceImages: boolean;
  maxReferenceImages: number;
  supportsKeyframeGuides: boolean;
  supportsStyleEmbeddings: boolean;
  supportsLoRAs: boolean;
};

export const VIDEO_MODELS: Record<VideoModelId, VideoModelSpec> = {
  "wan2.2": {
    id: "wan2.2",
    label: "Wan 2.2",
    shortDesc: "14B Image-to-Video & First-Last-Frame Transition",
    nativeFps: 24,
    minDuration: 1,
    maxDuration: 10,
    defaultDuration: 5,
    defaultResolution: "720p",
    generatesNativeAudio: false,
    supportsFirstLastFrame: true,
    supportsReferenceImages: false,
    maxReferenceImages: 0,
    supportsKeyframeGuides: false,
    supportsStyleEmbeddings: false,
    supportsLoRAs: true,
  },
  "ltx2.3": {
    id: "ltx2.3",
    label: "LTX 2.3",
    shortDesc: "Fast Text-to-Video, Image-to-Video & Style Transitions",
    nativeFps: 25,
    minDuration: 1,
    maxDuration: 10,
    defaultDuration: 5,
    defaultResolution: "720p",
    generatesNativeAudio: false,
    supportsFirstLastFrame: true,
    supportsReferenceImages: false,
    maxReferenceImages: 0,
    supportsKeyframeGuides: false,
    supportsStyleEmbeddings: false,
    supportsLoRAs: true,
  },
  "minimax-h3": {
    id: "minimax-h3",
    label: "MiniMax H3",
    shortDesc:
      "Omni-modal Video + Native Stereo Audio (T2V, I2V, FL2V, Multi-Frame Ref & Continuations)",
    nativeFps: 24,
    minDuration: 1,
    maxDuration: 15,
    defaultDuration: 5,
    defaultResolution: "768p",
    generatesNativeAudio: true,
    supportsFirstLastFrame: true,
    supportsReferenceImages: true,
    maxReferenceImages: 9,
    supportsKeyframeGuides: true,
    supportsStyleEmbeddings: true,
    supportsLoRAs: false,
  },
};

export function isVideoModelId(value: unknown): value is VideoModelId {
  return (
    typeof value === "string" &&
    (VIDEO_MODEL_IDS as readonly string[]).includes(value)
  );
}

export function normalizeVideoModelId(
  value: unknown,
  fallback: VideoModelId = "wan2.2",
): VideoModelId {
  return isVideoModelId(value) ? value : fallback;
}

export function getVideoModelSpec(
  id: string | null | undefined,
): VideoModelSpec {
  return VIDEO_MODELS[normalizeVideoModelId(id)];
}

export function isMiniMaxH3StyleEmbeddingId(
  value: unknown,
): value is MiniMaxH3StyleEmbeddingId {
  return (
    typeof value === "string" &&
    (MINIMAX_H3_STYLE_EMBEDDING_IDS as readonly string[]).includes(value)
  );
}

const MINIMAX_H3_BASE_SHORT_EDGE = 768;
export const MINIMAX_H3_MAX_PIXELS = 768 * 1344;
export const MINIMAX_H3_CANVAS_MULTIPLE = 32;

/**
 * Mirrors ComfyUI `nodes_minimax_h3.py` `adapt_canvas`: keep the aspect
 * ratio, anchor the short edge at 768, cap the area at 768*1344 and snap both
 * edges to the 32px latent grid.
 */
export function adaptMiniMaxH3Canvas(
  width: number,
  height: number,
): { width: number; height: number } {
  const ratio = width / height;
  let nomW =
    ratio >= 1
      ? MINIMAX_H3_BASE_SHORT_EDGE * ratio
      : MINIMAX_H3_BASE_SHORT_EDGE;
  let nomH =
    ratio >= 1
      ? MINIMAX_H3_BASE_SHORT_EDGE
      : MINIMAX_H3_BASE_SHORT_EDGE / ratio;
  if (nomW * nomH > MINIMAX_H3_MAX_PIXELS) {
    const s = Math.sqrt(MINIMAX_H3_MAX_PIXELS / (nomW * nomH));
    nomW *= s;
    nomH *= s;
  }
  const m = MINIMAX_H3_CANVAS_MULTIPLE;
  return {
    width: Math.max(m, Math.round(nomW / m) * m),
    height: Math.max(m, Math.round(nomH / m) * m),
  };
}

/** True when H3 takes these dimensions as-is (32px grid, under the cap). */
export function isMiniMaxH3NativeCanvas(
  width: number,
  height: number,
): boolean {
  return (
    width % MINIMAX_H3_CANVAS_MULTIPLE === 0 &&
    height % MINIMAX_H3_CANVAS_MULTIPLE === 0 &&
    width * height <= MINIMAX_H3_MAX_PIXELS
  );
}

/**
 * Pixel size for a resolution preset. MiniMax H3 snaps off-grid or oversized
 * presets through `adaptMiniMaxH3Canvas`; other models use the table as-is.
 */
export function resolveVideoDimensions(
  resolution: string | null | undefined,
  model?: string | null,
): {
  width: number;
  height: number;
} {
  const found = VIDEO_RESOLUTIONS.find((r) => r.value === resolution);
  const base = found
    ? { width: found.width, height: found.height }
    : { width: 1280, height: 720 };
  if (
    model === "minimax-h3" &&
    !isMiniMaxH3NativeCanvas(base.width, base.height)
  ) {
    return adaptMiniMaxH3Canvas(base.width, base.height);
  }
  return base;
}

export function clampVideoDuration(
  modelId: string | null | undefined,
  durationSec: number,
): number {
  const spec = getVideoModelSpec(modelId);
  if (!Number.isFinite(durationSec)) return spec.defaultDuration;
  return Math.min(
    spec.maxDuration,
    Math.max(spec.minDuration, Math.round(durationSec)),
  );
}

export function computeVideoFrameLength(
  modelId: string | null | undefined,
  durationSec: number,
): number {
  const normalized = normalizeVideoModelId(modelId);
  const clamped = clampVideoDuration(normalized, durationSec);
  const spec = VIDEO_MODELS[normalized];
  if (normalized === "minimax-h3") {
    return alignMiniMaxH3Frames(Math.round(clamped * spec.nativeFps));
  }
  return clamped * spec.nativeFps + 1;
}

/**
 * ComfyUI `nodes_minimax_h3.py` only accepts `17k + 5` frame counts (min 5);
 * round the raw count up to the next valid length.
 */
export function alignMiniMaxH3Frames(rawFrames: number): number {
  if (!Number.isFinite(rawFrames) || rawFrames <= 5) return 5;
  return 5 + Math.ceil((rawFrames - 5) / 17) * 17;
}

export function formatMiniMaxH3Prompt(opts: {
  prompt: string;
  mode?: MiniMaxH3Mode;
  hasFirstFrame?: boolean;
  hasLastFrame?: boolean;
  referenceCount?: number;
  durationSec?: number;
  styleEmbedding?: string | null;
  soundscape?: string | null;
  music?: string | null;
}): string {
  const basePrompt = opts.prompt.trim();
  const embeddingSpec = opts.styleEmbedding
    ? MINIMAX_H3_STYLE_EMBEDDINGS.find((e) => e.id === opts.styleEmbedding)
    : undefined;
  const soundscape = opts.soundscape?.trim() ?? "";
  const music = opts.music?.trim() ?? "";

  const alreadyStructured =
    basePrompt.includes("integrated_multimodal_description:") ||
    basePrompt.includes("subject_definitions:");

  const hasExtras = Boolean(
    embeddingSpec ||
    soundscape ||
    music ||
    opts.hasFirstFrame ||
    opts.hasLastFrame,
  );

  if (alreadyStructured && !embeddingSpec && !soundscape && !music) {
    return basePrompt;
  }

  if (!hasExtras && (!opts.referenceCount || opts.referenceCount === 0)) {
    return basePrompt;
  }

  const lines: string[] = [];

  if (opts.hasFirstFrame && !basePrompt.includes("<Picture 1>")) {
    lines.push(
      "For the target video, at 0.00 seconds into the target video, <Picture 1> is fully referenced.",
    );
  }
  if (opts.hasLastFrame && !basePrompt.includes("<Picture 2>")) {
    // The last frame sits at (length - 1) / fps on the aligned timeline.
    const alignedFrames = computeVideoFrameLength(
      "minimax-h3",
      opts.durationSec ?? 5,
    );
    const endSec = ((alignedFrames - 1) / 24).toFixed(2);
    const picTag = opts.hasFirstFrame ? "<Picture 2>" : "<Picture 1>";
    lines.push(
      `For the target video, at ${endSec} seconds into the target video, ${picTag} is fully referenced.`,
    );
  }

  const prefixToken =
    embeddingSpec && !basePrompt.includes(embeddingSpec.token)
      ? `${embeddingSpec.token} `
      : "";

  if (alreadyStructured) {
    lines.push(`${prefixToken}${basePrompt}`);
  } else {
    lines.push(
      `integrated_multimodal_description: ${prefixToken}${basePrompt}`,
    );
  }

  if (soundscape) {
    lines.push(`soundscape: ${soundscape}`);
  }
  if (music) {
    lines.push(`music: ${music}`);
  }

  return lines.join("\n");
}
