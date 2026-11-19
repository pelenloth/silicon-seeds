import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import z from "zod";
import {
  BUILTIN_SOUND_PRESETS,
  createCustomSoundPreset,
  isBuiltinSoundPresetId,
  listMergedSoundPresets,
  updateCustomSoundPreset,
} from "../audio/sound-presets";
import { DB } from "../db/db";
import {
  AUDIO_MODEL_IDS,
  SOUND_PRESET_CATEGORIES,
} from "../shared/audio-models";
import { validationHook } from "./validation";

const createSoundPresetSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  description: z.string().trim().max(500).optional().default(""),
  audio_model: z.enum(AUDIO_MODEL_IDS),
  category: z.enum(SOUND_PRESET_CATEGORIES).optional().default("Song"),
  instrumental_prompt: z
    .string()
    .trim()
    .min(1, "Instrumental prompt is required")
    .max(4000),
  lyric_prompt: z.string().max(8000).optional().default(""),
  settings: z.record(z.string(), z.unknown()).optional().default({}),
});

const updateSoundPresetSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  audio_model: z.enum(AUDIO_MODEL_IDS).optional(),
  category: z.enum(SOUND_PRESET_CATEGORIES).optional(),
  instrumental_prompt: z.string().trim().min(1).max(4000).optional(),
  lyric_prompt: z.string().max(8000).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

function collidesWithBuiltinName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return BUILTIN_SOUND_PRESETS.some((p) => p.name.toLowerCase() === lower);
}

const app = new Hono();

app.get("/", async (c) => {
  const model = c.req.query("model") ?? undefined;
  const category = c.req.query("category") ?? undefined;
  const presets = await listMergedSoundPresets({ model, category });
  return c.json({ presets });
});

app.post(
  "/",
  zValidator("json", createSoundPresetSchema, validationHook),
  async (c) => {
    const body = c.req.valid("json");
    if (collidesWithBuiltinName(body.name)) {
      return c.json({ error: "Preset name already exists" }, 409);
    }
    const dup = await DB.SoundPresets.findByName(body.name);
    if (dup) {
      return c.json({ error: "Preset name already exists" }, 409);
    }

    const created = await createCustomSoundPreset({
      name: body.name,
      description: body.description,
      audio_model: body.audio_model,
      category: body.category,
      instrumental_prompt: body.instrumental_prompt,
      lyric_prompt: body.lyric_prompt,
      settings: body.settings,
    });
    if (!created) return c.json({ error: "Create failed" }, 500);
    return c.json(created, 201);
  },
);

app.put(
  "/:id",
  zValidator("json", updateSoundPresetSchema, validationHook),
  async (c) => {
    const rawId = c.req.param("id");
    if (
      isBuiltinSoundPresetId(rawId) ||
      BUILTIN_SOUND_PRESETS.some((p) => p.id === rawId)
    ) {
      return c.json(
        { error: "Built-in sound presets cannot be modified" },
        403,
      );
    }
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: "Preset not found" }, 404);
    }

    const existing = await DB.SoundPresets.findById(id);
    if (!existing) return c.json({ error: "Preset not found" }, 404);

    const body = c.req.valid("json");
    if (
      body.name !== undefined &&
      body.name.toLowerCase() !== existing.name.toLowerCase()
    ) {
      if (collidesWithBuiltinName(body.name)) {
        return c.json({ error: "Preset name already exists" }, 409);
      }
      const dup = await DB.SoundPresets.findByName(body.name);
      if (dup) return c.json({ error: "Preset name already exists" }, 409);
    }

    const updated = await updateCustomSoundPreset(id, body);
    if (!updated) return c.json({ error: "Preset not found" }, 404);
    return c.json(updated);
  },
);

app.delete("/:id", async (c) => {
  const rawId = c.req.param("id");
  if (
    isBuiltinSoundPresetId(rawId) ||
    BUILTIN_SOUND_PRESETS.some((p) => p.id === rawId)
  ) {
    return c.json({ error: "Built-in sound presets cannot be deleted" }, 403);
  }
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "Preset not found" }, 404);
  }

  const existing = await DB.SoundPresets.findById(id);
  if (!existing) return c.json({ error: "Preset not found" }, 404);
  await DB.SoundPresets.remove(id);
  return c.json({ ok: true });
});

export default app;
