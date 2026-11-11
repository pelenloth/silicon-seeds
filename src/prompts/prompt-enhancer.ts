import { LLM } from "../llm/llm";
import { DB } from "../db/db";
import { Logger } from "../logger/logger";
import { type EnhanceKind, resolveMessage } from "./enhance-prompts";

export {
  ENHANCE_KINDS,
  type EnhanceKind,
  MAX_INPUT_CHARS,
  KIND_HINT,
  kindHint,
  buildEnhancePrompt,
  buildInspirePrompt,
  resolveMessage,
} from "./enhance-prompts";

export async function enhancePrompt(
  text: string,
  kind: EnhanceKind,
  presetName?: string,
): Promise<string | null> {
  let presetText: string | undefined;
  if (presetName && presetName !== "none") {
    try {
      const row = await DB.StylePresets.findByName(presetName);
      // Keep raw styles_json for now; StylePrompt.system rendering is future work.
      if (row)
        presetText = `primary:${row.primary_style} secondary:${row.secondary_trigger ?? ""} styles:${row.styles_json} texture:${row.texture ?? ""}`;
    } catch (err) {
      Logger.warn(
        "Failed to load style preset for prompt enhance, continuing without preset",
        { presetName, err },
      );
      presetText = undefined;
    }
  }
  const msg = resolveMessage(text, kind, presetText);
  const res = await LLM.message(msg);
  if (!res?.content?.trim()) return null;
  return res.content.trim();
}
