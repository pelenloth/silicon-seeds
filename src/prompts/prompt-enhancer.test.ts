import { describe, test, expect } from "bun:test";
import {
  buildEnhancePrompt,
  buildInspirePrompt,
  resolveMessage,
} from "./enhance-prompts";
describe("prompt-enhancer builders", () => {
  test("enhance includes original + kind hint", () => {
    const out = buildEnhancePrompt("a cat", "image_prompt", undefined);
    expect(out).toContain("a cat");
    expect(out.toLowerCase()).toContain("image");
  });
  test("inspire ignores empty and mentions kind", () => {
    const out = buildInspirePrompt("lyrics", undefined);
    expect(out.length).toBeGreaterThan(20);
    expect(out.toLowerCase()).toContain("lyrics");
  });
  test("preset text injected", () => {
    const out = buildEnhancePrompt(
      "a house",
      "style_guide",
      "watercolor, soft edges",
    );
    expect(out).toContain("watercolor");
  });
  test("resolveMessage empty selects inspire", () => {
    const msg = resolveMessage("   ", "lyrics");
    expect(msg.toLowerCase()).toContain("lyrics");
    expect(msg.toLowerCase()).toContain("invent");
  });
  test("resolveMessage truncates to 2000 and injects preset", () => {
    const long = "x".repeat(2500);
    const msg = resolveMessage(long, "image_prompt", "watercolor");
    expect(msg).toContain("x".repeat(2000));
    expect(msg).not.toContain("x".repeat(2001));
    expect(msg).toContain("watercolor");
  });
});
