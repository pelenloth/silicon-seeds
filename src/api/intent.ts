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
  type RawIntent,
} from "../prompts/intent";
import { validationHook } from "./validation";

const BodySchema = z.object({
  text: z.string().trim().min(3, "Describe what you want to create").max(4000),
});

const INTENT_TIMEOUT_MS = 45_000;
const INTENT_MAX_BODY_BYTES = 32 * 1024;

export type PlanWithTimeoutOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
  structured?: (
    prompt: string,
    schema: typeof IntentSchema,
    opts?: { signal?: AbortSignal },
  ) => Promise<{ parsed: RawIntent } | null>;
};

export async function planWithTimeout(
  prompt: string,
  opts?: PlanWithTimeoutOptions,
): Promise<{ parsed: RawIntent } | null> {
  const timeoutMs = opts?.timeoutMs ?? INTENT_TIMEOUT_MS;
  const structuredFn = opts?.structured ?? LLM.structured;
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const onClientAbort = () => {
    ctrl.abort();
  };

  if (opts?.signal) {
    if (opts.signal.aborted) {
      ctrl.abort();
    } else {
      opts.signal.addEventListener("abort", onClientAbort, { once: true });
    }
  }

  const timeoutPromise = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      Logger.warn("Intent planner timed out", { timeoutMs });
      ctrl.abort();
      resolve(null);
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      structuredFn(prompt, IntentSchema, { signal: ctrl.signal }),
      timeoutPromise,
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
    if (opts?.signal) {
      opts.signal.removeEventListener("abort", onClientAbort);
    }
  }
}

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
      const res = await planWithTimeout(buildIntentPrompt(text, names), {
        signal: c.req.raw.signal,
      });
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
