import { describe, expect, test } from "bun:test";
import { INSTRUMENTAL_TAG, resolveLyrics } from "./lyrics";

describe("resolveLyrics", () => {
  test("returns [instrumental] for empty, whitespace, null, or undefined on default ACE model", () => {
    expect(resolveLyrics("")).toBe(INSTRUMENTAL_TAG);
    expect(resolveLyrics("   \n\t  ")).toBe(INSTRUMENTAL_TAG);
    expect(resolveLyrics(null)).toBe(INSTRUMENTAL_TAG);
    expect(resolveLyrics(undefined)).toBe(INSTRUMENTAL_TAG);
  });

  test("trims non-empty lyric prompts", () => {
    expect(resolveLyrics("  city lights in rain  ")).toBe(
      "city lights in rain",
    );
  });

  test("uses model-specific instrumental markers for yue2, minimax-music-3, and stable-audio-3", () => {
    expect(resolveLyrics("", "yue2")).toBe("[Instrumental]");
    expect(resolveLyrics("", "minimax-music-3")).toBe("[Instrumental]");
    expect(resolveLyrics("some words", "stable-audio-3")).toBe("");
  });
});
