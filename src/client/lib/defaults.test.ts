import { describe, expect, test } from "bun:test";
import { FALLBACK_DEFAULTS, toGenerationDefaults } from "./defaults";

describe("toGenerationDefaults (B1)", () => {
  test("maps the saved settings keys", () => {
    expect(
      toGenerationDefaults({
        default_style_preset: "watercolor",
        default_fps: "24",
        default_clip_duration: "7",
        default_transition_duration: "3",
        default_resolution: "1080p",
        default_image_model: "z-image-turbo",
        default_video_model: "ltx2.3",
      }),
    ).toEqual({
      style_preset: "watercolor",
      fps: 24,
      clip_duration: 7,
      transition_duration: 3,
      resolution: "1080p",
      image_model: "z-image-turbo",
      video_model: "ltx2.3",
    });
  });
  test("missing, empty and null maps fall back", () => {
    expect(toGenerationDefaults(null)).toEqual(FALLBACK_DEFAULTS);
    expect(toGenerationDefaults({})).toEqual(FALLBACK_DEFAULTS);
    expect(
      toGenerationDefaults({
        default_style_preset: "",
        default_resolution: "",
      }),
    ).toEqual(FALLBACK_DEFAULTS);
    expect(FALLBACK_DEFAULTS).toEqual({
      style_preset: "none",
      fps: 16,
      clip_duration: 5,
      transition_duration: 2,
      resolution: "720p",
      image_model: "z-image-turbo",
      video_model: "wan2.2",
    });
  });
  test("numbers clamp to the schema ranges, junk falls back", () => {
    const d = toGenerationDefaults({
      default_fps: "99",
      default_clip_duration: "0",
      default_transition_duration: "abc",
      default_resolution: "8k",
      default_video_model: "sora",
    });
    expect(d.fps).toBe(24);
    expect(d.clip_duration).toBe(1);
    expect(d.transition_duration).toBe(2);
    expect(d.resolution).toBe("720p");
    expect(d.video_model).toBe("wan2.2");
  });
});
