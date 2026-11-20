import { describe, expect, test } from "bun:test";
import {
  adaptMiniMaxH3Canvas,
  alignMiniMaxH3Frames,
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
      width: 1344,
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

  test("clamps duration per model and computes 17k + 5 H3 frame lengths", () => {
    expect(clampVideoDuration("wan2.2", 14)).toBe(10);
    expect(clampVideoDuration("minimax-h3", 14)).toBe(14);
    expect(clampVideoDuration("minimax-h3", 20)).toBe(15);
    expect(clampVideoDuration("minimax-h3", 0)).toBe(1);

    // 24 fps raw frames rounded up to 17k + 5: 24->39, 120->124, 240->243, 360->362
    expect(computeVideoFrameLength("minimax-h3", 1)).toBe(39);
    expect(computeVideoFrameLength("minimax-h3", 5)).toBe(124);
    expect(computeVideoFrameLength("minimax-h3", 10)).toBe(243);
    expect(computeVideoFrameLength("minimax-h3", 15)).toBe(362);
    expect(computeVideoFrameLength("ltx2.3", 5)).toBe(126);
    expect(computeVideoFrameLength("wan2.2", 5)).toBe(121);
  });

  test("alignMiniMaxH3Frames rounds up to the next 17k + 5 length (min 5)", () => {
    expect(alignMiniMaxH3Frames(0)).toBe(5);
    expect(alignMiniMaxH3Frames(5)).toBe(5);
    expect(alignMiniMaxH3Frames(6)).toBe(22);
    expect(alignMiniMaxH3Frames(22)).toBe(22);
    expect(alignMiniMaxH3Frames(24)).toBe(39);
    expect(alignMiniMaxH3Frames(120)).toBe(124);
    expect(alignMiniMaxH3Frames(240)).toBe(243);
    expect(alignMiniMaxH3Frames(360)).toBe(362);
    for (let raw = 1; raw <= 400; raw++) {
      const aligned = alignMiniMaxH3Frames(raw);
      expect((aligned - 5) % 17).toBe(0);
      expect(aligned).toBeGreaterThanOrEqual(raw);
    }
  });

  test("adaptMiniMaxH3Canvas snaps to the 32px grid and caps area at 768*1344", () => {
    expect(adaptMiniMaxH3Canvas(1344, 768)).toEqual({
      width: 1344,
      height: 768,
    });
    expect(adaptMiniMaxH3Canvas(1376, 768)).toEqual({
      width: 1344,
      height: 768,
    });
    expect(adaptMiniMaxH3Canvas(1280, 720)).toEqual({
      width: 1344,
      height: 768,
    });
    expect(adaptMiniMaxH3Canvas(1920, 1080)).toEqual({
      width: 1344,
      height: 768,
    });
    expect(adaptMiniMaxH3Canvas(720, 1280)).toEqual({
      width: 768,
      height: 1344,
    });
    expect(adaptMiniMaxH3Canvas(1000, 1000)).toEqual({
      width: 768,
      height: 768,
    });
    for (const [w, h] of [
      [1920, 1080],
      [1080, 1920],
      [3000, 1000],
      [517, 913],
    ]) {
      const out = adaptMiniMaxH3Canvas(w, h);
      expect(out.width % 32).toBe(0);
      expect(out.height % 32).toBe(0);
      expect(out.width * out.height).toBeLessThanOrEqual(768 * 1344);
    }
  });

  test("resolveVideoDimensions adapts off-grid presets for minimax-h3 only", () => {
    expect(resolveVideoDimensions("1080p", "minimax-h3")).toEqual({
      width: 1344,
      height: 768,
    });
    expect(resolveVideoDimensions("720p", "minimax-h3")).toEqual({
      width: 1344,
      height: 768,
    });
    expect(resolveVideoDimensions("9_16_HD", "minimax-h3")).toEqual({
      width: 768,
      height: 1344,
    });
    // Presets already on the H3 grid and under the cap pass through exactly.
    expect(resolveVideoDimensions("768p", "minimax-h3")).toEqual({
      width: 1344,
      height: 768,
    });
    expect(resolveVideoDimensions("1_1_768", "minimax-h3")).toEqual({
      width: 768,
      height: 768,
    });
    expect(resolveVideoDimensions("4_3_768", "minimax-h3")).toEqual({
      width: 1120,
      height: 832,
    });
    // Other models keep the raw table entries.
    expect(resolveVideoDimensions("1080p", "wan2.2")).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(resolveVideoDimensions("720p", "ltx2.3")).toEqual({
      width: 1280,
      height: 720,
    });
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
    // 5s -> 124 aligned frames -> last frame at (124 - 1) / 24 = 5.125s
    expect(formatted).toContain(
      "For the target video, at 5.13 seconds into the target video, <Picture 2> is fully referenced.",
    );
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
