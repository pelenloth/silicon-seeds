import z from "zod";

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
  batch_size: z.coerce.number().int().positive().optional(),
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

export const PostDistinctAudioSchema = z.object({
  instrumental_prompt: z.string().min(1, "Instrumental prompt is required"),
  lyric_prompt: z.string().optional().default(""),
  duration: z.coerce.number().int().min(10).max(720),
  bpm: z.coerce.number().int().min(40).max(240),
  cfg_scale: z.coerce.number().min(0).max(10),
  temperature: z.coerce.number().min(0).max(2),
  top_p: z.coerce.number().min(0).max(1),
  keyscale: AudioKeyscaleSchema,
  timesignature: z.enum(["2", "3", "4", "6"]),
});

export type PostDistinctAudio = z.infer<typeof PostDistinctAudioSchema>;
