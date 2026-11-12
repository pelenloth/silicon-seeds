import { describe, expect, test } from "bun:test";
import {
  buildPresetPayload,
  dedupeLoras,
  FALLBACK_DEFAULTS,
  normalizeDefaults,
  toGenerationDefaults,
} from "./defaults";

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

describe("buildPresetPayload", () => {
  const baseForm = {
    name: "  Anime  ",
    description: "  Soft cel look  ",
    primary_style: "",
    secondary_trigger: "  cel  ",
    styles: "soft lighting, cel shading\n\n  vibrant , ",
    texture: "  paper  ",
  };

  test("blank primary style on create falls back to trimmed name; styles parsed from lines and commas, trimmed, empty dropped", () => {
    const res = buildPresetPayload(baseForm, "create");
    expect("payload" in res).toBe(true);
    if ("payload" in res) {
      expect(res.payload).toEqual({
        name: "Anime",
        description: "Soft cel look",
        primary_style: "Anime",
        secondary_trigger: "cel",
        styles: ["soft lighting", "cel shading", "vibrant"],
        texture: "paper",
      });
    }
  });

  test("blank primary style on update omits primary_style key", () => {
    const res = buildPresetPayload(baseForm, "update");
    expect("payload" in res).toBe(true);
    if ("payload" in res) {
      expect(Object.hasOwn(res.payload, "primary_style")).toBe(false);
      expect(res.payload).toEqual({
        name: "Anime",
        description: "Soft cel look",
        secondary_trigger: "cel",
        styles: ["soft lighting", "cel shading", "vibrant"],
        texture: "paper",
      });
    }
  });

  test("non-blank primary style on create and update uses trimmed primary_style", () => {
    const resCreate = buildPresetPayload(
      { ...baseForm, primary_style: "  watercolor  " },
      "create",
    );
    expect("payload" in resCreate && resCreate.payload.primary_style).toBe(
      "watercolor",
    );
    const resUpdate = buildPresetPayload(
      { ...baseForm, primary_style: "  watercolor  " },
      "update",
    );
    expect("payload" in resUpdate && resUpdate.payload.primary_style).toBe(
      "watercolor",
    );
  });

  test("rejects missing or too long name (1-50)", () => {
    const empty = buildPresetPayload({ ...baseForm, name: "   " }, "create");
    expect("errors" in empty && Boolean(empty.errors.name)).toBe(true);

    const tooLong = buildPresetPayload(
      { ...baseForm, name: "a".repeat(51) },
      "create",
    );
    expect("errors" in tooLong && Boolean(tooLong.errors.name)).toBe(true);
  });

  test("rejects 101 styles and style over 1000 characters", () => {
    const manyStyles = Array.from({ length: 101 }, (_, i) => `s${i}`).join(
      "\n",
    );
    const resMany = buildPresetPayload(
      { ...baseForm, styles: manyStyles },
      "create",
    );
    expect("errors" in resMany && Boolean(resMany.errors.styles)).toBe(true);

    const longStyle = buildPresetPayload(
      { ...baseForm, styles: "x".repeat(1001) },
      "create",
    );
    expect("errors" in longStyle && Boolean(longStyle.errors.styles)).toBe(
      true,
    );
  });

  test("rejects over-limit description, primary_style, secondary_trigger, and texture", () => {
    const res = buildPresetPayload(
      {
        name: "Valid",
        description: "d".repeat(501),
        primary_style: "p".repeat(51),
        secondary_trigger: "t".repeat(101),
        styles: "ok",
        texture: "x".repeat(501),
      },
      "create",
    );
    expect("errors" in res).toBe(true);
    if ("errors" in res) {
      expect(Boolean(res.errors.description)).toBe(true);
      expect(Boolean(res.errors.primary_style)).toBe(true);
      expect(Boolean(res.errors.secondary_trigger)).toBe(true);
      expect(Boolean(res.errors.texture)).toBe(true);
    }
  });
});

describe("normalizeDefaults", () => {
  const validForm = {
    default_style_preset: "none",
    default_resolution: "720p",
    default_image_model: "z-image-turbo",
    default_video_model: "wan2.2",
    default_fps: "08",
    default_clip_duration: " 5 ",
    default_transition_duration: "02",
  };

  test("normalizes valid integer strings to canonical form ('08' -> '8')", () => {
    const res = normalizeDefaults(validForm);
    expect("values" in res).toBe(true);
    if ("values" in res) {
      expect(res.values.default_fps).toBe("8");
      expect(res.values.default_clip_duration).toBe("5");
      expect(res.values.default_transition_duration).toBe("2");
    }
  });

  test("rejects empty, non-integer, or out-of-range numeric fields", () => {
    const emptyFps = normalizeDefaults({ ...validForm, default_fps: "" });
    expect("errors" in emptyFps && Boolean(emptyFps.errors.default_fps)).toBe(
      true,
    );

    const outOfRange = normalizeDefaults({
      ...validForm,
      default_fps: "25",
      default_clip_duration: "0",
      default_transition_duration: "11",
    });
    expect("errors" in outOfRange).toBe(true);
    if ("errors" in outOfRange) {
      expect(Boolean(outOfRange.errors.default_fps)).toBe(true);
      expect(Boolean(outOfRange.errors.default_clip_duration)).toBe(true);
      expect(Boolean(outOfRange.errors.default_transition_duration)).toBe(true);
    }

    const decimal = normalizeDefaults({ ...validForm, default_fps: "8.5" });
    expect("errors" in decimal && Boolean(decimal.errors.default_fps)).toBe(
      true,
    );
  });
});

describe("dedupeLoras", () => {
  test("removes duplicate names while preserving order", () => {
    expect(
      dedupeLoras(["a.safetensors", "a.safetensors", "b.safetensors"]),
    ).toEqual(["a.safetensors", "b.safetensors"]);
  });
});
