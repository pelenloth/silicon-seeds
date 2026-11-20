import z from "zod";
import {
  AUDIO_MODEL_IDS,
  getAudioModel,
  normalizeAudioModelId,
} from "../shared/audio-models";
import {
  getVideoModelSpec,
  MINIMAX_H3_MODES,
  MINIMAX_H3_REF_IMAGE_SIZES,
  MINIMAX_H3_SEQUENCE_MODES,
  MINIMAX_H3_STYLE_EMBEDDING_IDS,
  MINIMAX_H3_VARIANTS,
  VIDEO_MODEL_IDS,
  VIDEO_RESOLUTION_IDS,
} from "../shared/video-models";

const OptionalBoolPreprocess = z.preprocess((v) => {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "boolean") return v;
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return v;
}, z.boolean().optional());

const OptionalAudioFilePreprocess = z.preprocess((v) => {
  if (v === undefined || v === null || v === "") return undefined;
  if (v instanceof File && v.size === 0 && v.name === "") return undefined;
  return v;
}, z.instanceof(File).optional());

const AudioKeyscaleSchema = z.enum([
  "C major",
  "A minor",
  "D minor",
  "E minor",
  "G major",
  "B minor",
  "F# minor",
]);

const LoraItemSchema = z.object({
  name: z.string().min(1).max(200),
  strength: z.number().min(0.1).max(2),
});
const LorasPreprocess = z.preprocess((v) => {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return parsed;
    } catch {
      return v;
    }
  }
  return v;
}, z.array(LoraItemSchema).optional());

export const PostTextToImageSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  resolution: z.string().max(7).optional(),
  image_model: z.string().max(50),
  style_preset: z.string().min(1).max(50).optional(),
  style_guide: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  batch_size: z.coerce.number().int().positive().max(16).optional(),
  loras: LorasPreprocess,
});

export type PostTextToImage = z.infer<typeof PostTextToImageSchema>;

function isEmptyFormValue(v: unknown) {
  return (
    v === undefined ||
    v === null ||
    v === "" ||
    (v instanceof File && v.size === 0 && v.name === "")
  );
}

function parseJsonField(v: unknown) {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

const OptionalImageFilePreprocess = z.preprocess(
  (v) => (isEmptyFormValue(v) ? undefined : v),
  z.instanceof(File).optional(),
);

const ReferenceImagesPreprocess = z.preprocess(
  (v) => {
    if (isEmptyFormValue(v)) return undefined;
    const list = (Array.isArray(v) ? v : [v]).filter(
      (item) => !isEmptyFormValue(item),
    );
    return list.length > 0 ? list : undefined;
  },
  z
    .array(z.instanceof(File))
    .max(9, "At most 9 reference images are allowed")
    .optional(),
);

const KeyframeGuidesPreprocess = z.preprocess(
  (v) => (isEmptyFormValue(v) ? undefined : parseJsonField(v)),
  z
    .array(
      z.object({
        refIndex: z.coerce.number().int().min(0).max(8),
        frameIdx: z.coerce.number().int().min(0),
      }),
    )
    .max(9)
    .optional(),
);

const SequencePromptsPreprocess = z.preprocess(
  (v) => (isEmptyFormValue(v) ? undefined : parseJsonField(v)),
  z
    .array(z.string().trim().min(1, "Sequence prompts must not be empty"))
    .min(2, "Provide at least 2 sequence prompts")
    .max(8, "At most 8 sequence prompts are allowed")
    .optional(),
);

const OptionalTextField = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));

const OptionalEnumField = <T extends readonly [string, ...string[]]>(
  values: T,
) =>
  z.preprocess(
    (v) => (isEmptyFormValue(v) || v === "none" ? undefined : v),
    z.enum(values).optional(),
  );

export const PostTextToVideoSchema = z
  .object({
    prompt: z.string().trim().min(1, "Prompt is required"),
    resolution: z.enum(VIDEO_RESOLUTION_IDS),
    video_model: z.enum(VIDEO_MODEL_IDS),
    image_model: z.string().max(50).optional(),
    fps: z.coerce.number().int().min(1).max(24),
    clip_duration: z.coerce.number().int().min(1).max(15),
    style_preset: z.string().min(1).max(50).optional(),
    style_guide: OptionalTextField(2000),
    loras: LorasPreprocess,
    // MiniMax H3
    h3_mode: OptionalEnumField(MINIMAX_H3_MODES),
    h3_variant: OptionalEnumField(MINIMAX_H3_VARIANTS),
    ref_image_size: OptionalEnumField(MINIMAX_H3_REF_IMAGE_SIZES),
    soundscape: OptionalTextField(1000),
    music: OptionalTextField(1000),
    style_embedding: OptionalEnumField(MINIMAX_H3_STYLE_EMBEDDING_IDS),
    first_frame: OptionalImageFilePreprocess,
    last_frame: OptionalImageFilePreprocess,
    reference_images: ReferenceImagesPreprocess,
    keyframe_guides: KeyframeGuidesPreprocess,
    sequence_mode: OptionalEnumField(MINIMAX_H3_SEQUENCE_MODES),
    sequence_prompts: SequencePromptsPreprocess,
  })
  .superRefine((data, ctx) => {
    const spec = getVideoModelSpec(data.video_model);
    if (data.clip_duration > spec.maxDuration) {
      ctx.addIssue({
        code: "custom",
        path: ["clip_duration"],
        message: `Clip duration must be at most ${spec.maxDuration} seconds for ${spec.label}`,
      });
    }
    if (
      data.h3_mode === "multiframe" &&
      (data.reference_images?.length ?? 0) < 1
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["reference_images"],
        message: "Multi-frame mode needs at least 1 reference image",
      });
    }
    if (data.h3_mode === "fl2v") {
      if (!data.first_frame) {
        ctx.addIssue({
          code: "custom",
          path: ["first_frame"],
          message: "First-last-frame mode needs a first frame",
        });
      }
      if (!data.last_frame) {
        ctx.addIssue({
          code: "custom",
          path: ["last_frame"],
          message: "First-last-frame mode needs a last frame",
        });
      }
    }
    if (
      (data.sequence_mode === "continuation" ||
        data.sequence_mode === "transition") &&
      (data.sequence_prompts?.length ?? 0) < 2
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["sequence_prompts"],
        message: "Sequences need at least 2 prompts",
      });
    }
  });

export type PostTextToVideo = z.infer<typeof PostTextToVideoSchema>;

export const PostComposeSchema = z
  .object({
    script: z.string().optional(),
    script_file: z.preprocess((v) => {
      if (v instanceof File && v.size === 0 && v.name === "") return undefined;
      return v;
    }, z.instanceof(File).optional()),
    image_model: z.string().max(50),
    video_model: z.enum(VIDEO_MODEL_IDS).optional(),
    audio_model: z.enum(AUDIO_MODEL_IDS).optional(),
    sound_preset: z
      .string()
      .trim()
      .max(80)
      .optional()
      .transform((v) => (v && v !== "none" ? v : undefined)),
    resolution: z.string().max(12),
    fps: z.coerce.number().min(1).max(24),
    clip_duration: z.coerce.number().min(1).max(15),
    transition_duration: z.coerce.number().min(1).max(10),
    style_preset: z.string().min(1).max(50),
    voice_id: z.string().optional(),
    loras: LorasPreprocess,
    style_guide: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
  })
  .refine(
    (data) => {
      const hasScript = data.script && data.script.trim().length >= 3;
      const hasFile = data.script_file !== undefined;
      return hasScript || hasFile;
    },
    {
      message: "Either script or script_file must be provided",
    },
  )
  .superRefine((data, ctx) => {
    const spec = getVideoModelSpec(data.video_model);
    if (data.clip_duration > spec.maxDuration) {
      ctx.addIssue({
        code: "custom",
        path: ["clip_duration"],
        message: `Clip duration must be at most ${spec.maxDuration} seconds for ${spec.label}`,
      });
    }
  });

export type PostCompose = z.infer<typeof PostComposeSchema>;

export const PostDistinctAudioSchema = z
  .object({
    audio_model: z.enum(AUDIO_MODEL_IDS).optional().default("ace-step-1.5"),
    sound_preset: z
      .string()
      .trim()
      .max(80)
      .optional()
      .transform((v) => (v && v !== "none" ? v : undefined)),
    instrumental_prompt: z
      .string()
      .trim()
      .min(1, "Instrumental prompt is required"),
    lyric_prompt: z.string().optional().default(""),
    duration: z.coerce.number().int().min(5).max(720).optional(),
    bpm: z.coerce.number().int().min(40).max(240).optional(),
    cfg_scale: z.coerce.number().min(0).max(15).optional(),
    temperature: z.coerce.number().min(0).max(2).optional(),
    top_p: z.coerce.number().min(0).max(1).optional(),
    top_k: z.coerce.number().int().min(1).max(500).optional(),
    steps: z.coerce.number().int().min(1).max(100).optional(),
    keyscale: AudioKeyscaleSchema.optional(),
    timesignature: z.enum(["2", "3", "4", "6"]).optional(),
    yue2_mode: z.enum(["full", "melody"]).optional(),
    abc_planning: OptionalBoolPreprocess,
    abc_temperature: z.coerce.number().min(0).max(2).optional(),
    abc_top_p: z.coerce.number().min(0).max(1).optional(),
    minimax_precision: z.enum(["int8", "fp16"]).optional(),
    tiled_decode: OptionalBoolPreprocess,
    sa3_variant: z.enum(["medium", "medium_base"]).optional(),
    sa3_audio_type: z
      .enum(["Music", "Instrument", "SFX", "One-shot"])
      .optional(),
    use_reprompt: OptionalBoolPreprocess,
    reference_audio: OptionalAudioFilePreprocess,
    reference_audio_sample: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
  })
  .superRefine((data, ctx) => {
    const spec = getAudioModel(normalizeAudioModelId(data.audio_model));
    if (data.duration !== undefined) {
      if (
        data.duration < spec.minDuration ||
        data.duration > spec.maxDuration
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["duration"],
          message: `Duration must be between ${spec.minDuration} and ${spec.maxDuration} seconds for ${spec.label}`,
        });
      }
    }
  });

export type PostDistinctAudio = z.infer<typeof PostDistinctAudioSchema>;
