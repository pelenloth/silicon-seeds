import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import z from "zod";
import { DB } from "../db/db";
import { LLM } from "../llm/llm";
import { Logger } from "../logger/logger";
import {
  buildIntentPrompt,
  IntentSchema,
  normalizePlan,
  type RawIntent,
} from "../prompts/intent";
import { validationHook } from "./validation";

const BodySchema = z.object({
  text: z.string().trim().min(3, "Describe what you want to create").max(4000),
});

const INTENT_TIMEOUT_MS = 45_000;

async function planWithTimeout(
  prompt: string,
): Promise<{ parsed: RawIntent } | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      Logger.warn("Intent planner timed out", { timeoutMs: INTENT_TIMEOUT_MS });
      resolve(null);
    }, INTENT_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      LLM.structured(prompt, IntentSchema),
      timeoutPromise,
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

const app = new Hono();

app.post("/", zValidator("json", BodySchema, validationHook), async (c) => {
  const { text } = c.req.valid("json");
  try {
    const [presets, settings] = await Promise.all([
      DB.StylePresets.list(),
      DB.Settings.getAll(),
    ]);
    const names = presets.map((p) => p.name);
    const res = await planWithTimeout(buildIntentPrompt(text, names));
    if (!res?.parsed) {
      Logger.warn("Intent planner returned no parsed plan");
      return c.json({ error: "Planner unavailable" }, 502);
    }
    const plan = normalizePlan(res.parsed, text, names, {
      resolution: settings.default_resolution || "720p",
      style_preset: settings.default_style_preset || "none",
    });
    return c.json({ plan });
  } catch (err) {
    Logger.error("Intent planner failed", {
      message: err instanceof Error ? err.message : "unknown error",
    });
    return c.json({ error: "Planner unavailable" }, 502);
  }
});

export default app;
