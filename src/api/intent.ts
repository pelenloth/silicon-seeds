import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { zValidator } from "@hono/zod-validator";
import z from "zod";
import { DB } from "../db/db";
import { LLM } from "../llm/llm";
import { Logger } from "../logger/logger";
import {
  buildIntentPrompt,
  IntentSchema,
  normalizePlan,
} from "../prompts/intent";
import { planWithTimeout } from "./plan-timeout";
import { validationHook } from "./validation";

const BodySchema = z.object({
  text: z.string().trim().min(3, "Describe what you want to create").max(4000),
});

const INTENT_TIMEOUT_MS = 45_000;
const INTENT_MAX_BODY_BYTES = 32 * 1024;

const app = new Hono();

app.post(
  "/",
  bodyLimit({
    maxSize: INTENT_MAX_BODY_BYTES,
    onError: (c) => c.json({ error: "Request body too large" }, 413),
  }),
  zValidator("json", BodySchema, validationHook),
  async (c) => {
    const { text } = c.req.valid("json");
    try {
      const [presets, settings] = await Promise.all([
        DB.StylePresets.list(),
        DB.Settings.getAll(),
      ]);
      const names = presets.map((p) => p.name);
      const prompt = buildIntentPrompt(text, names);
      const res = await planWithTimeout(
        (signal) => LLM.structured(prompt, IntentSchema, { signal }),
        {
          timeoutMs: INTENT_TIMEOUT_MS,
          signal: c.req.raw.signal,
          onTimeout: () =>
            Logger.warn("Intent planner timed out", {
              timeoutMs: INTENT_TIMEOUT_MS,
            }),
        },
      );
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
  },
);

export default app;
