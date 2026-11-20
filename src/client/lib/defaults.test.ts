import { describe, expect, test } from "bun:test";
import {
  buildPresetPayload,
  dedupeLoras,
  FALLBACK_DEFAULTS,
  normalizeDefaults,
  RESOLUTIONS,
  toGenerationDefaults,
  VIDEO_MODELS,
  type SoundPresetFormInput,
} from "./defaults";
import * as defaultsModule from "./defaults";

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
        default_audio_model: "yue2",
        default_compose_audio_model: "minimax-music-3",
      }),
    ).toEqual({
      style_preset: "watercolor",
      fps: 24,
      clip_duration: 7,
      transition_duration: 3,
      resolution: "1080p",
      image_model: "z-image-turbo",
      video_model: "ltx2.3",
      audio_model: "yue2",
      compose_audio_model: "minimax-music-3",
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
      audio_model: "ace-step-1.5",
      compose_audio_model: "stable-audio-3",
    });
  });
  test("audio model defaults and the sa3 alias normalize per surface", () => {
    expect(FALLBACK_DEFAULTS.audio_model).toBe("ace-step-1.5");
    expect(FALLBACK_DEFAULTS.compose_audio_model).toBe("stable-audio-3");

    const aliased = toGenerationDefaults({
      default_audio_model: "sa3",
      default_compose_audio_model: "sa3",
    });
    expect(aliased.audio_model).toBe("stable-audio-3");
    expect(aliased.compose_audio_model).toBe("stable-audio-3");

    const unknown = toGenerationDefaults({
      default_audio_model: "not-a-model",
      default_compose_audio_model: "not-a-model",
    });
    expect(unknown.audio_model).toBe("ace-step-1.5");
    expect(unknown.compose_audio_model).toBe("stable-audio-3");
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

describe("buildSoundPresetPayload", () => {
  const baseSoundForm: SoundPresetFormInput = {
    name: "  Midnight Neo-Soul  ",
    description: "  Warm studio ballad  ",
    audio_model: "minimax-music-3",
    category: "Song",
    instrumental_prompt: "  Global Metadata: Warm neo-soul at 88 BPM  ",
    lyric_prompt: "  [Verse]\nLate rain on the glass  ",
    duration: "120",
  };

  test("trims fields and merges the duration into the base settings", () => {
    const res = defaultsModule.buildSoundPresetPayload(baseSoundForm, {
      bpm: 88,
      minimax_precision: "int8",
    });
    expect("payload" in res).toBe(true);
    if ("payload" in res) {
      expect(res.payload).toEqual({
        name: "Midnight Neo-Soul",
        description: "Warm studio ballad",
        audio_model: "minimax-music-3",
        category: "Song",
        instrumental_prompt: "Global Metadata: Warm neo-soul at 88 BPM",
        lyric_prompt: "[Verse]\nLate rain on the glass",
        settings: { bpm: 88, minimax_precision: "int8", duration: 120 },
      });
    }
  });

  test("omits stale duplicated model settings when baseSettings is reset on model change", () => {
    const res = defaultsModule.buildSoundPresetPayload(
      {
        ...baseSoundForm,
        audio_model: "yue2",
        duration: "150",
      },
      {},
    );
    expect("payload" in res).toBe(true);
    if ("payload" in res) {
      expect(res.payload.audio_model).toBe("yue2");
      expect(res.payload.settings).toEqual({ duration: 150 });
    }
  });

  test("requires a name of at most 80 characters", () => {
    const empty = defaultsModule.buildSoundPresetPayload({
      ...baseSoundForm,
      name: "   ",
    });
    expect("errors" in empty && Boolean(empty.errors.name)).toBe(true);

    const atLimit = defaultsModule.buildSoundPresetPayload({
      ...baseSoundForm,
      name: "a".repeat(80),
    });
    expect("payload" in atLimit).toBe(true);

    const tooLong = defaultsModule.buildSoundPresetPayload({
      ...baseSoundForm,
      name: "a".repeat(81),
    });
    expect("errors" in tooLong && Boolean(tooLong.errors.name)).toBe(true);
  });

  test("requires an instrumental prompt of at most 4000 characters", () => {
    const empty = defaultsModule.buildSoundPresetPayload({
      ...baseSoundForm,
      instrumental_prompt: "   ",
    });
    expect("errors" in empty && Boolean(empty.errors.instrumental_prompt)).toBe(
      true,
    );

    const atLimit = defaultsModule.buildSoundPresetPayload({
      ...baseSoundForm,
      instrumental_prompt: "x".repeat(4000),
    });
    expect("payload" in atLimit).toBe(true);

    const tooLong = defaultsModule.buildSoundPresetPayload({
      ...baseSoundForm,
      instrumental_prompt: "x".repeat(4001),
    });
    expect(
      "errors" in tooLong && Boolean(tooLong.errors.instrumental_prompt),
    ).toBe(true);
  });

  test("falls back to a valid audio model and category for unknown values", () => {
    const res = defaultsModule.buildSoundPresetPayload({
      ...baseSoundForm,
      audio_model: "bogus-model" as SoundPresetFormInput["audio_model"],
      category: "Nope" as SoundPresetFormInput["category"],
    });
    expect("payload" in res).toBe(true);
    if ("payload" in res) {
      expect(res.payload.audio_model).toBe("ace-step-1.5");
      expect(res.payload.category).toBe("Song");
    }
  });

  test("enforces per-model duration bounds", () => {
    const sa3: SoundPresetFormInput = {
      ...baseSoundForm,
      audio_model: "stable-audio-3",
      lyric_prompt: "",
      duration: "200",
    };
    const tooLong = defaultsModule.buildSoundPresetPayload(sa3);
    expect("errors" in tooLong && Boolean(tooLong.errors.duration)).toBe(true);
    if ("errors" in tooLong) {
      expect(tooLong.errors.duration).toContain("5 and 180");
    }

    const tooShort = defaultsModule.buildSoundPresetPayload({
      ...sa3,
      duration: "2",
    });
    expect("errors" in tooShort && Boolean(tooShort.errors.duration)).toBe(
      true,
    );

    const ok = defaultsModule.buildSoundPresetPayload({
      ...sa3,
      duration: "180",
    });
    expect("payload" in ok).toBe(true);
    if ("payload" in ok) {
      expect(ok.payload.settings.duration).toBe(180);
    }

    const yue2TooLong = defaultsModule.buildSoundPresetPayload({
      ...baseSoundForm,
      audio_model: "yue2",
      duration: "400",
    });
    expect(
      "errors" in yue2TooLong && Boolean(yue2TooLong.errors.duration),
    ).toBe(true);
  });

  test("drops lyrics for models that do not support them", () => {
    const res = defaultsModule.buildSoundPresetPayload({
      ...baseSoundForm,
      audio_model: "stable-audio-3",
      instrumental_prompt: "Warm analog synth arpeggio underscore",
      lyric_prompt: "[Verse]\nIgnored by Stable Audio",
      duration: "30",
    });
    expect("payload" in res).toBe(true);
    if ("payload" in res) {
      expect(res.payload.lyric_prompt).toBe("");
      expect(res.payload.settings.duration).toBe(30);
    }
  });
});

describe("normalizeDefaults", () => {
  const validForm = {
    default_style_preset: "none",
    default_resolution: "720p",
    default_image_model: "z-image-turbo",
    default_video_model: "wan2.2",
    default_audio_model: "yue2",
    default_compose_audio_model: "minimax-music-3",
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

  test("preserves the audio model defaults", () => {
    const res = normalizeDefaults(validForm);
    expect("values" in res).toBe(true);
    if ("values" in res) {
      expect(res.values.default_audio_model).toBe("yue2");
      expect(res.values.default_compose_audio_model).toBe("minimax-music-3");
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

describe("MiniMax H3 video defaults & duration bounds", () => {
  test("VIDEO_MODELS includes minimax-h3 and RESOLUTIONS includes 768p/1:1/4:3", () => {
    expect(VIDEO_MODELS.map((m) => m.value)).toEqual([
      "wan2.2",
      "ltx2.3",
      "minimax-h3",
    ]);
    expect(RESOLUTIONS.map((r) => r.value)).toContain("768p");
    expect(RESOLUTIONS.map((r) => r.value)).toContain("1_1_768");
    expect(RESOLUTIONS.map((r) => r.value)).toContain("4_3_768");
  });

  test("normalizeDefaults allows 11..15s clip_duration for minimax-h3 while keeping max 10s for wan2.2", () => {
    const okH3 = normalizeDefaults({
      default_style_preset: "none",
      default_resolution: "768p",
      default_image_model: "z-image-turbo",
      default_video_model: "minimax-h3",
      default_fps: "24",
      default_clip_duration: "15",
      default_transition_duration: "2",
    });
    expect("values" in okH3).toBe(true);

    const badWan = normalizeDefaults({
      default_style_preset: "none",
      default_resolution: "720p",
      default_image_model: "z-image-turbo",
      default_video_model: "wan2.2",
      default_fps: "24",
      default_clip_duration: "11",
      default_transition_duration: "2",
    });
    expect("errors" in badWan).toBe(true);
  });
});
