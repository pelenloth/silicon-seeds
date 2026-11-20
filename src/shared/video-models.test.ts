import { describe, expect, test } from "bun:test";
import {
  clampVideoDuration,
  computeVideoFrameLength,
  formatMiniMaxH3Prompt,
  getVideoModelSpec,
  isVideoModelId,
  MINIMAX_H3_MODES,
  MINIMAX_H3_SEQUENCE_MODES,
  MINIMAX_H3_STYLE_EMBEDDINGS,
  MINIMAX_H3_VARIANTS,
  normalizeVideoModelId,
  resolveVideoDimensions,
  VIDEO_MODEL_IDS,
  VIDEO_MODELS,
  VIDEO_RESOLUTION_IDS,
} from "./video-models";

describe("video-models catalog", () => {
  test("registers wan2.2, ltx2.3, and minimax-h3 with accurate capability flags", () => {
    expect(VIDEO_MODEL_IDS).toEqual(["wan2.2", "ltx2.3", "minimax-h3"]);
    expect(isVideoModelId("minimax-h3")).toBe(true);
    expect(isVideoModelId("wan2.2")).toBe(true);
    expect(isVideoModelId("sora")).toBe(false);
    expect(normalizeVideoModelId("minimax-h3")).toBe("minimax-h3");
    expect(normalizeVideoModelId("unknown", "wan2.2")).toBe("wan2.2");

    const h3 = getVideoModelSpec("minimax-h3");
    expect(h3.label).toBe("MiniMax H3");
    expect(h3.nativeFps).toBe(24);
    expect(h3.minDuration).toBe(1);
    expect(h3.maxDuration).toBe(15);
    expect(h3.defaultDuration).toBe(5);
    expect(h3.generatesNativeAudio).toBe(true);
    expect(h3.supportsFirstLastFrame).toBe(true);
    expect(h3.supportsReferenceImages).toBe(true);
    expect(h3.maxReferenceImages).toBe(9);
    expect(h3.supportsKeyframeGuides).toBe(true);
    expect(h3.supportsStyleEmbeddings).toBe(true);
    expect(h3.supportsLoRAs).toBe(false);

    expect(VIDEO_MODELS["wan2.2"].maxDuration).toBe(10);
    expect(VIDEO_MODELS["wan2.2"].generatesNativeAudio).toBe(false);
    expect(VIDEO_MODELS["ltx2.3"].nativeFps).toBe(25);
    expect(VIDEO_MODELS["ltx2.3"].maxDuration).toBe(10);
  });

  test("resolves all 8 resolutions including H3 768p/1:1/4:3 presets", () => {
    expect(VIDEO_RESOLUTION_IDS).toEqual([
      "480p",
      "720p",
      "768p",
      "1080p",
      "9_16_SD",
      "9_16_HD",
      "1_1_768",
      "4_3_768",
    ]);
    expect(resolveVideoDimensions("768p")).toEqual({
      width: 1376,
      height: 768,
    });
    expect(resolveVideoDimensions("1_1_768")).toEqual({
      width: 768,
      height: 768,
    });
    expect(resolveVideoDimensions("4_3_768")).toEqual({
      width: 1120,
      height: 832,
    });
    expect(resolveVideoDimensions("9_16_HD")).toEqual({
      width: 1080,
      height: 1920,
    });
    expect(resolveVideoDimensions("unknown")).toEqual({
      width: 1280,
      height: 720,
    });
  });

  test("clamps duration per model and computes 4k + 1 frame lengths", () => {
    expect(clampVideoDuration("wan2.2", 14)).toBe(10);
    expect(clampVideoDuration("minimax-h3", 14)).toBe(14);
    expect(clampVideoDuration("minimax-h3", 20)).toBe(15);
    expect(clampVideoDuration("minimax-h3", 0)).toBe(1);

    // 5s @ 24fps = 121 (already 4*30 + 1)
    expect(computeVideoFrameLength("minimax-h3", 5)).toBe(121);
    // 10s @ 24fps = 241 (4*60 + 1)
    expect(computeVideoFrameLength("minimax-h3", 10)).toBe(241);
    // 15s @ 24fps = 361 (4*90 + 1)
    expect(computeVideoFrameLength("minimax-h3", 15)).toBe(361);
    // LTX 5s @ 25fps = 125 -> 126 (25*5+1)
    expect(computeVideoFrameLength("ltx2.3", 5)).toBe(126);
  });

  test("exposes all 10 official MiniMax H3 style embeddings and mode/variant enums", () => {
    expect(MINIMAX_H3_MODES).toEqual(["t2v", "i2v", "fl2v", "multiframe"]);
    expect(MINIMAX_H3_VARIANTS).toEqual([
      "turbo_8",
      "turbo_4",
      "fasth3",
      "standard",
    ]);
    expect(MINIMAX_H3_SEQUENCE_MODES).toEqual([
      "single",
      "continuation",
      "transition",
    ]);
    expect(MINIMAX_H3_STYLE_EMBEDDINGS).toHaveLength(10);
    expect(MINIMAX_H3_STYLE_EMBEDDINGS[0]).toEqual({
      id: "art_is_explosion",
      label: "Art Is Explosion",
      token: "embedding:minimaxh3_art_is_explosion",
      filename: "minimaxh3_art_is_explosion.safetensors",
    });
  });

  test("formatMiniMaxH3Prompt preserves raw prompts when already structured and formats multimodal fields cleanly", () => {
    // Plain T2V prompt with no extra H3 audio/embedding/reference fields stays clean
    expect(formatMiniMaxH3Prompt({ prompt: "A fox running in snow" })).toBe(
      "A fox running in snow",
    );

    // Structured prompt with style embedding, I2V first/last frame anchor, soundscape, and music
    const formatted = formatMiniMaxH3Prompt({
      prompt: "[Shot 1] Neon rain reflects off wet asphalt.",
      mode: "fl2v",
      hasFirstFrame: true,
      hasLastFrame: true,
      durationSec: 5,
      styleEmbedding: "bullet_time",
      soundscape: "Heavy rain, distant thunder, tires hissing on wet pavement",
      music: "Dark synthwave bassline at 90 BPM",
    });
    expect(formatted).toContain("embedding:minimaxh3_bullet_time");
    expect(formatted).toContain(
      "For the target video, at 0.00 seconds into the target video, <Picture 1> is fully referenced.",
    );
    expect(formatted).toContain("<Picture 2>");
    expect(formatted).toContain("integrated_multimodal_description:");
    expect(formatted).toContain(
      "soundscape: Heavy rain, distant thunder, tires hissing on wet pavement",
    );
    expect(formatted).toContain("music: Dark synthwave bassline at 90 BPM");

    // Already structured prompt is not double-wrapped
    const rawStructured =
      "subject_definitions:\n<Subject 1> is the woman in <Picture 1>.\nintegrated_multimodal_description: [Shot 1] Walking forward.";
    expect(
      formatMiniMaxH3Prompt({
        prompt: rawStructured,
        mode: "multiframe",
        referenceCount: 2,
      }),
    ).toBe(rawStructured);
  });
});
