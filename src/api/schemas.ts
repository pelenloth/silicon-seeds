import z from "zod";
import {
  AUDIO_MODEL_IDS,
  getAudioModel,
  normalizeAudioModelId,
} from "../shared/audio-models";

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

export const PostTextToVideoSchema = z.object({
  prompt: z.string().trim().min(1, "Prompt is required"),
  resolution: z.enum(["480p", "720p", "1080p", "9_16_SD", "9_16_HD"]),
  video_model: z.enum(["wan2.2", "ltx2.3"]),
  image_model: z.string().max(50).optional(),
  fps: z.coerce.number().int().min(1).max(24),
  clip_duration: z.coerce.number().int().min(1).max(10),
  style_preset: z.string().min(1).max(50).optional(),
  style_guide: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  loras: LorasPreprocess,
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
    video_model: z.string().max(50),
    audio_model: z.enum(AUDIO_MODEL_IDS).optional(),
    sound_preset: z
      .string()
      .trim()
      .max(80)
      .optional()
      .transform((v) => (v && v !== "none" ? v : undefined)),
    resolution: z.string().max(7),
    fps: z.coerce.number().min(1).max(24),
    clip_duration: z.coerce.number().min(1).max(10),
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
  );

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
      if (data.duration < spec.minDuration || data.duration > spec.maxDuration) {
        ctx.addIssue({
          code: "custom",
          path: ["duration"],
          message: `Duration must be between ${spec.minDuration} and ${spec.maxDuration} seconds for ${spec.label}`,
        });
      }
    }
  });

export type PostDistinctAudio = z.infer<typeof PostDistinctAudioSchema>;
