import { describe, expect, test } from "bun:test";
import { INSTRUMENTAL_TAG, resolveLyrics } from "./lyrics";

describe("resolveLyrics", () => {
  test("blank lyrics become the instrumental tag (B11)", () => {
    expect(resolveLyrics("")).toBe(INSTRUMENTAL_TAG);
    expect(resolveLyrics("   \n ")).toBe(INSTRUMENTAL_TAG);
    expect(resolveLyrics(undefined)).toBe(INSTRUMENTAL_TAG);
    expect(resolveLyrics(null)).toBe(INSTRUMENTAL_TAG);
  });
  test("real lyrics pass through trimmed", () => {
    expect(resolveLyrics("  a hook about rain ")).toBe("a hook about rain");
  });
});
