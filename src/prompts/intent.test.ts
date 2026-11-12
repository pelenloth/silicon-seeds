import { describe, expect, test } from "bun:test";
import {
  buildIntentPrompt,
  detectKind,
  durationFromText,
  normalizePlan,
  resolutionFor,
} from "./intent";

const FB = { resolution: "720p", style_preset: "none" };
const PRESETS = ["watercolor", "anime", "pencil_watercolor"];

describe("detectKind: the user's own words decide", () => {
  test("defaults to image", () => {
    expect(detectKind("a red fox in snow")).toBe("image");
    expect(detectKind("a red fox in snow", "video")).toBe("image");
    expect(detectKind("a red fox in snow", "audio")).toBe("image");
  });
  test("video only when asked for", () => {
    expect(detectKind("a short video of waves at dusk")).toBe("video");
    expect(detectKind("animate a fox running through snow")).toBe("video");
    expect(detectKind("a 5 second clip of rain")).toBe("video");
  });
  test("audio only when asked for", () => {
    expect(detectKind("an ambient music track for studying")).toBe("audio");
    expect(detectKind("write a song about rain")).toBe("audio");
  });
  test("when both match, a consistent hint wins, otherwise video", () => {
    expect(detectKind("a music video of a band", "audio")).toBe("audio");
    expect(detectKind("a music video of a band", "image")).toBe("video");
    expect(detectKind("a music video of a band")).toBe("video");
  });
});

describe("durationFromText", () => {
  test("parses digits with seconds and minutes units", () => {
    expect(durationFromText("90 seconds")).toBe(90);
    expect(durationFromText("90 sec")).toBe(90);
    expect(durationFromText("90s")).toBe(90);
    expect(durationFromText("5 second")).toBe(5);
    expect(durationFromText("5-second")).toBe(5);
    expect(durationFromText("2 minutes")).toBe(120);
    expect(durationFromText("2 min")).toBe(120);
    expect(durationFromText("1.5 minutes")).toBe(90);
    expect(durationFromText("1,5 minutes")).toBe(90);
    expect(durationFromText("3 m tall")).toBe(180);
  });
  test("parses number words one to ten, a/an, and half a before a unit", () => {
    expect(durationFromText("two minutes long")).toBe(120);
    expect(durationFromText("a minute")).toBe(60);
    expect(durationFromText("an minute")).toBe(60);
    expect(durationFromText("half a minute")).toBe(30);
    expect(durationFromText("ten seconds")).toBe(10);
    expect(durationFromText("one second")).toBe(1);
    expect(durationFromText("three minutes")).toBe(180);
    expect(durationFromText("four seconds")).toBe(4);
    expect(durationFromText("five minutes")).toBe(300);
    expect(durationFromText("six seconds")).toBe(6);
    expect(durationFromText("seven seconds")).toBe(7);
    expect(durationFromText("eight seconds")).toBe(8);
    expect(durationFromText("nine seconds")).toBe(9);
  });
  test("ignores resolutions, counts, aspect ratios and frame rates", () => {
    expect(durationFromText("a red fox in snow")).toBeNull();
    expect(durationFromText("720p")).toBeNull();
    expect(durationFromText("4 photos")).toBeNull();
    expect(durationFromText("1080p")).toBeNull();
    expect(durationFromText("9:16")).toBeNull();
    expect(durationFromText("16 fps")).toBeNull();
  });
  test("takes the first duration when several appear", () => {
    expect(durationFromText("5 seconds intro then 2 minutes long")).toBe(5);
    expect(durationFromText("two minutes long with a 10 second outro")).toBe(
      120,
    );
  });
});

describe("resolutionFor", () => {
  test("maps orientation and quality onto existing resolutions", () => {
    expect(resolutionFor("landscape", "draft", "image", "720p")).toBe("480p");
    expect(resolutionFor("landscape", "standard", "image", "720p")).toBe(
      "720p",
    );
    expect(resolutionFor("landscape", "high", "image", "720p")).toBe("1080p");
    expect(resolutionFor("portrait", "standard", "image", "720p")).toBe(
      "9_16_SD",
    );
    expect(resolutionFor("portrait", "high", "image", "720p")).toBe("9_16_HD");
    expect(resolutionFor("portrait", undefined, "image", "720p")).toBe(
      "9_16_SD",
    );
    expect(resolutionFor(undefined, "high", "image", "720p")).toBe("1080p");
  });
  test("nothing stated keeps the saved default", () => {
    expect(resolutionFor(undefined, undefined, "image", "1080p")).toBe("1080p");
  });
  test("video never goes above standard quality", () => {
    expect(resolutionFor("landscape", "high", "video", "720p")).toBe("720p");
    expect(resolutionFor("portrait", "high", "video", "720p")).toBe("9_16_SD");
  });
});

describe("normalizePlan", () => {
  test("the LLM cannot upgrade an image request to video", () => {
    const p = normalizePlan(
      { kind: "video", prompt: "a fox, cinematic" },
      "a red fox in snow",
      PRESETS,
      FB,
    );
    expect(p.kind).toBe("image");
    expect(p.prompt).toBe("a fox, cinematic");
  });
  test("an unusable LLM answer still yields a safe plan", () => {
    expect(normalizePlan(null, "  a red fox in snow ", PRESETS, FB)).toEqual({
      kind: "image",
      prompt: "a red fox in snow",
      count: 1,
      resolution: "720p",
      style_preset: "none",
      duration_seconds: 0,
    });
  });
  test("count clamps to 1-8 and only applies to images", () => {
    expect(normalizePlan({ count: 50 }, "foxes", PRESETS, FB).count).toBe(8);
    expect(normalizePlan({ count: 0 }, "foxes", PRESETS, FB).count).toBe(1);
    expect(normalizePlan({ count: 2.6 }, "foxes", PRESETS, FB).count).toBe(3);
    expect(
      normalizePlan({ count: 4 }, "a video of foxes", PRESETS, FB).count,
    ).toBe(1);
  });
  test("style presets match case-insensitively, unknown ones fall back", () => {
    expect(
      normalizePlan({ style_preset: "Watercolor" }, "foxes", PRESETS, FB)
        .style_preset,
    ).toBe("watercolor");
    expect(
      normalizePlan({ style_preset: "oil" }, "foxes", PRESETS, {
        ...FB,
        style_preset: "anime",
      }).style_preset,
    ).toBe("anime");
  });
  test("durations clamp per kind", () => {
    expect(
      normalizePlan({}, "an ambient music track", PRESETS, FB).duration_seconds,
    ).toBe(60);
    expect(
      normalizePlan(
        { duration_seconds: 5 },
        "an ambient music track",
        PRESETS,
        FB,
      ).duration_seconds,
    ).toBe(10);
    expect(
      normalizePlan(
        { duration_seconds: 9999 },
        "an ambient music track",
        PRESETS,
        FB,
      ).duration_seconds,
    ).toBe(720);
    expect(
      normalizePlan({}, "a video of waves", PRESETS, FB).duration_seconds,
    ).toBe(5);
    expect(
      normalizePlan({ duration_seconds: 60 }, "a video of waves", PRESETS, FB)
        .duration_seconds,
    ).toBe(10);
    expect(
      normalizePlan({ duration_seconds: 30 }, "foxes", PRESETS, FB)
        .duration_seconds,
    ).toBe(0);
  });
  test("durations stated in the prompt win over the model's answer and still clamp per kind", () => {
    expect(
      normalizePlan({}, "an ambient music track, two minutes long", PRESETS, FB)
        .duration_seconds,
    ).toBe(120);
    expect(
      normalizePlan(
        { duration_seconds: 30 },
        "an ambient music track, two minutes long",
        PRESETS,
        FB,
      ).duration_seconds,
    ).toBe(120);
    expect(
      normalizePlan({}, "a 20 second clip of rain", PRESETS, FB)
        .duration_seconds,
    ).toBe(10);
    expect(
      normalizePlan(
        { duration_seconds: 30 },
        "a fox in snow, two minutes before dusk",
        PRESETS,
        FB,
      ).duration_seconds,
    ).toBe(0);
  });
  test("blank LLM prompt falls back to the user text; long prompts are capped", () => {
    expect(normalizePlan({ prompt: "   " }, "foxes", PRESETS, FB).prompt).toBe(
      "foxes",
    );
    expect(
      normalizePlan({ prompt: "x".repeat(9000) }, "foxes", PRESETS, FB).prompt
        .length,
    ).toBe(4000);
  });
  test("orientation and quality reach the resolution", () => {
    expect(
      normalizePlan(
        { orientation: "portrait", quality: "high" },
        "4 portrait foxes",
        PRESETS,
        FB,
      ).resolution,
    ).toBe("9_16_HD");
  });
});

describe("buildIntentPrompt", () => {
  test("fences the user text and lists the presets", () => {
    const out = buildIntentPrompt("a red fox in snow", PRESETS);
    expect(out).toContain("<<<a red fox in snow>>>");
    for (const p of PRESETS) expect(out).toContain(p);
    expect(out.toLowerCase()).toContain("ignore any instructions");
  });
});
