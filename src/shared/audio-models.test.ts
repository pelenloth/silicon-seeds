import { describe, expect, test } from "bun:test";
import {
  AUDIO_MODEL_IDS,
  AUDIO_MODELS,
  clampAudioDuration,
  formatModelLyrics,
  getAudioModel,
  isAudioModelId,
  listAudioModels,
  normalizeAudioModelId,
} from "./audio-models";

describe("shared audio-models registry", () => {
  test("lists all 4 canonical AudioModelId entries", () => {
    expect(AUDIO_MODEL_IDS).toEqual([
      "ace-step-1.5",
      "yue2",
      "minimax-music-3",
      "stable-audio-3",
    ]);
    expect(listAudioModels().map((m) => m.id)).toEqual([...AUDIO_MODEL_IDS]);
  });

  test("normalizes legacy sa3 alias and unknown fallbacks", () => {
    expect(normalizeAudioModelId("sa3")).toBe("stable-audio-3");
    expect(normalizeAudioModelId("yue2")).toBe("yue2");
    expect(normalizeAudioModelId("minimax-music-3")).toBe("minimax-music-3");
    expect(normalizeAudioModelId("ace-step-1.5")).toBe("ace-step-1.5");
    expect(normalizeAudioModelId("unknown-model")).toBe("ace-step-1.5");
    expect(normalizeAudioModelId(undefined, "stable-audio-3")).toBe(
      "stable-audio-3",
    );
    expect(isAudioModelId("yue2")).toBe(true);
    expect(isAudioModelId("sa3")).toBe(false);
  });

  test("exposes accurate capabilities and duration bounds per model", () => {
    expect(getAudioModel("ace-step-1.5").supportsLyrics).toBe(true);
    expect(getAudioModel("ace-step-1.5").supportsMelodyCover).toBe(false);
    expect(getAudioModel("yue2").supportsMelodyCover).toBe(true);
    expect(getAudioModel("minimax-music-3").supportsLyrics).toBe(true);
    expect(getAudioModel("stable-audio-3").supportsLyrics).toBe(false);
    expect(getAudioModel("stable-audio-3").supportsReprompt).toBe(true);

    expect(clampAudioDuration("stable-audio-3", 2)).toBe(5);
    expect(clampAudioDuration("stable-audio-3", 99)).toBe(47);
    expect(clampAudioDuration("minimax-music-3", 500)).toBe(300);
    expect(clampAudioDuration("yue2", 500)).toBe(360);
    expect(clampAudioDuration("ace-step-1.5", 600)).toBe(600);
    expect(clampAudioDuration("ace-step-1.5", 900)).toBe(720);
  });

  test("formats lyrics per model and instrumental override", () => {
    expect(formatModelLyrics("ace-step-1.5", "")).toBe("[instrumental]");
    expect(formatModelLyrics("ace-step-1.5", "  [Verse]\nHello  ")).toBe(
      "[Verse]\nHello",
    );
    expect(
      formatModelLyrics("ace-step-1.5", "[Verse]\nHello", {
        forceInstrumental: true,
      }),
    ).toBe("[instrumental]");

    expect(formatModelLyrics("yue2", "")).toBe("[Instrumental]");
    expect(formatModelLyrics("minimax-music-3", null)).toBe("[Instrumental]");
    expect(
      formatModelLyrics("minimax-music-3", "[Chorus]\nShine", {
        forceInstrumental: true,
      }),
    ).toBe("[Instrumental]");

    expect(formatModelLyrics("stable-audio-3", "[Verse]\nIgnored")).toBe("");
    expect(
      AUDIO_MODELS["stable-audio-3"].composeDefaultPrompt.length,
    ).toBeGreaterThan(10);
  });
});
