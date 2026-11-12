import { afterEach, describe, expect, test } from "bun:test";
import { ApiError } from "./api-client";
import {
  AUDIO_DEFAULTS,
  CREATE_KINDS,
  firstInvalidInOrder,
  isPlan,
  mapServerErrors,
  orderedFieldNamesFromDescriptors,
  planSummary,
  planToCreate,
  quickCreateValues,
  submitCreateJob,
  toFormData,
  validateCreateFields,
  type Plan,
} from "./create-job";
import { FALLBACK_DEFAULTS } from "./defaults";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});
function stubFetch(status: number, body: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}
const D = {
  ...FALLBACK_DEFAULTS,
  resolution: "1080p",
  style_preset: "watercolor",
  video_model: "ltx2.3",
  fps: 24,
  clip_duration: 7,
};

describe("CREATE_KINDS", () => {
  test("both video pages share one endpoint", () => {
    expect(CREATE_KINDS.image.endpoint).toBe("/api/jobs/images");
    expect(CREATE_KINDS.video.endpoint).toBe("/api/jobs/videos");
    expect(CREATE_KINDS["text-to-video"].endpoint).toBe("/api/jobs/videos");
    expect(CREATE_KINDS.audio.endpoint).toBe("/api/jobs/audio");
    expect(CREATE_KINDS.compose.endpoint).toBe("/api/jobs/videos/compose");
    expect(CREATE_KINDS["text-to-video"].route).toBe("/create/text-to-video");
  });
});

describe("quickCreateValues uses the saved defaults (B1)", () => {
  test("image", () => {
    expect(quickCreateValues("image", "a fox", D)).toEqual({
      prompt: "a fox",
      resolution: "1080p",
      image_model: "z-image-turbo",
      style_preset: "watercolor",
      batch_size: "1",
    });
  });
  test("video keeps the preset, text-to-video has none", () => {
    expect(quickCreateValues("video", "waves", D)).toEqual({
      prompt: "waves",
      resolution: "1080p",
      video_model: "ltx2.3",
      fps: "24",
      clip_duration: "7",
      style_preset: "watercolor",
    });
    expect(quickCreateValues("text-to-video", "waves", D)).toEqual({
      prompt: "waves",
      resolution: "1080p",
      video_model: "ltx2.3",
      fps: "24",
      clip_duration: "7",
    });
  });
  test("audio is instrumental by default", () => {
    expect(quickCreateValues("audio", "slow ambient", D)).toEqual({
      instrumental_prompt: "slow ambient",
      lyric_prompt: "",
      ...AUDIO_DEFAULTS,
    });
  });
  test("overrides win", () => {
    expect(
      quickCreateValues("image", "a fox", D, {
        batch_size: "4",
        resolution: "480p",
      }).batch_size,
    ).toBe("4");
    expect(
      quickCreateValues("image", "a fox", D, {
        batch_size: "4",
        resolution: "480p",
      }).resolution,
    ).toBe("480p");
  });
});

describe("submitCreateJob", () => {
  test("posts form data to the kind's endpoint and returns the job id", async () => {
    const calls = stubFetch(200, { jobId: "j1", message: "job queued" });
    const out = await submitCreateJob("image", {
      prompt: "a fox",
      image_model: "z-image-turbo",
    });
    expect(out).toEqual({ jobId: "j1" });
    expect(calls[0].url).toBe("/api/jobs/images");
    expect(calls[0].init?.method).toBe("POST");
    const body = calls[0].init?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("prompt")).toBe("a fox");
  });
  test("passes a FormData body through untouched", async () => {
    const calls = stubFetch(200, { jobId: "j2" });
    const fd = toFormData({ script: "hello world" });
    await submitCreateJob("compose", fd);
    expect(calls[0].url).toBe("/api/jobs/videos/compose");
    expect(calls[0].init?.body).toBe(fd);
  });
  test("validation errors become an ApiError with fields", async () => {
    stubFetch(400, {
      error: "Prompt is required",
      fields: { prompt: "Prompt is required" },
    });
    const err = await submitCreateJob("image", { prompt: "" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("Prompt is required");
    expect(err.fields).toEqual({ prompt: "Prompt is required" });
  });
  test("a success without a job id is an error", async () => {
    stubFetch(200, { message: "job queued" });
    const err = await submitCreateJob("image", { prompt: "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("The server did not return a job id");
  });
  test("times out when the server does not answer in time", async () => {
    globalThis.fetch = (() => new Promise(() => {})) as unknown as typeof fetch;
    const err = await submitCreateJob(
      "image",
      { prompt: "slow" },
      { timeoutMs: 20 },
    ).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe(
      "The server did not answer. Check Jobs before trying again.",
    );
  });
});

describe("validateCreateFields and firstInvalidInOrder", () => {
  test("checks required fields, max lengths and numeric ranges", () => {
    const res1 = validateCreateFields(
      { prompt: "   ", style_guide: "a".repeat(2005), batch_size: "20" },
      {
        required: [{ field: "prompt", message: "Prompt is required" }],
        maxLengths: [{ field: "style_guide", max: 2000, label: "Style guide" }],
        ranges: [{ field: "batch_size", min: 1, max: 16, label: "Images" }],
      },
    );
    expect(res1.errors.prompt).toBe("Prompt is required");
    expect(res1.errors.style_guide).toContain("2000");
    expect(res1.errors.batch_size).toContain("16");

    const res2 = validateCreateFields(
      { prompt: "valid", style_guide: "short", batch_size: "4" },
      {
        required: [{ field: "prompt", message: "Prompt is required" }],
        maxLengths: [{ field: "style_guide", max: 2000, label: "Style guide" }],
        ranges: [{ field: "batch_size", min: 1, max: 16, label: "Images" }],
      },
    );
    expect(res2.errors).toEqual({});

    const res3 = validateCreateFields(
      { script: "ab" },
      {
        validate: (v) =>
          v.script.trim().length < 3
            ? { script: "Write a script or upload a file" }
            : undefined,
      },
    );
    expect(res3.errors).toEqual({
      script: "Write a script or upload a file",
    });
  });

  test("firstInvalidInOrder chooses the first invalid field by DOM order rather than rule order", () => {
    const { errors } = validateCreateFields(
      { prompt: "ok", style_guide: "a".repeat(2005), batch_size: "99" },
      {
        required: [{ field: "prompt", message: "Prompt is required" }],
        maxLengths: [{ field: "style_guide", max: 2000, label: "Style guide" }],
        ranges: [{ field: "batch_size", min: 1, max: 16, label: "Images" }],
        loras: [
          { name: "first.safetensors", strength: 0.7 },
          { name: "second.safetensors", strength: 5 },
        ],
      },
    );
    expect(
      firstInvalidInOrder(
        [
          "prompt",
          "batch_size",
          "style_guide",
          "loras.0.strength",
          "loras.1.strength",
        ],
        errors,
      ),
    ).toBe("batch_size");
    expect(
      firstInvalidInOrder(
        ["loras.0.strength", "loras.1.strength", "style_guide"],
        errors,
      ),
    ).toBe("loras.1.strength");
    expect(firstInvalidInOrder(["prompt", "batch_size"], {})).toBeNull();
  });

  test("LoRA focus target uses row key when any loras.N.strength error exists, and aggregate loras only when it is the sole LoRA error", () => {
    const formDescriptors = [
      { name: "prompt" },
      { name: "style_guide" },
      { name: "image_model" },
      { name: "resolution" },
      { name: "batch_size" },
      { name: "style_preset" },
      { isLoraSelect: true },
      { loraIndex: "0" },
      { loraIndex: "1" },
      { loraIndex: "2" },
    ];
    const ordered = orderedFieldNamesFromDescriptors(formDescriptors);

    // 1. Error in row 1 of 3 from real validateCreateFields
    const row1Validation = validateCreateFields(
      { prompt: "a fox", style_guide: "", batch_size: "1" },
      {
        required: [{ field: "prompt", message: "Prompt is required" }],
        loras: [
          { name: "first.safetensors", strength: 0.7 },
          { name: "second.safetensors", strength: 2.5 },
          { name: "third.safetensors", strength: 0.8 },
        ],
      },
    );
    expect(row1Validation.errors["loras.1.strength"]).toBeDefined();
    expect(row1Validation.errors.loras).toBeDefined();
    expect(firstInvalidInOrder(ordered, row1Validation.errors)).toBe(
      "loras.1.strength",
    );

    // Also via mapServerErrors for loras.1.strength
    const serverRow1 = mapServerErrors(
      "Invalid LoRA",
      { "loras.1.strength": "Strength out of range" },
      { knownFields: ["prompt", "loras"] },
    );
    expect(firstInvalidInOrder(ordered, serverRow1.fieldErrors)).toBe(
      "loras.1.strength",
    );

    // 2. Aggregate-only LoRA error
    const serverAggregate = mapServerErrors(
      "Too many LoRAs",
      { loras: "At most 4 LoRAs allowed" },
      { knownFields: ["prompt", "loras"] },
    );
    expect(firstInvalidInOrder(ordered, serverAggregate.fieldErrors)).toBe(
      "loras",
    );

    // 3. Prompt error plus LoRA error (prompt wins because it comes first in the form)
    const promptAndLora = validateCreateFields(
      { prompt: "   ", style_guide: "", batch_size: "1" },
      {
        required: [{ field: "prompt", message: "Prompt is required" }],
        loras: [
          { name: "first.safetensors", strength: 0.7 },
          { name: "second.safetensors", strength: 2.5 },
        ],
      },
    );
    expect(firstInvalidInOrder(ordered, promptAndLora.errors)).toBe("prompt");
  });
});

describe("mapServerErrors", () => {
  test("maps known fields, normalizes loras.N.strength to loras, and puts unowned fields into formError with labels", () => {
    const out1 = mapServerErrors(
      "Validation failed",
      {
        batch_size: "Too big",
        "loras.1.strength": "Number must be less than or equal to 2",
      },
      {
        knownFields: [
          "prompt",
          "style_guide",
          "style_preset",
          "resolution",
          "batch_size",
          "image_model",
          "loras",
        ],
        labels: {
          batch_size: "Images",
          loras: "LoRAs",
        },
      },
    );
    expect(out1.fieldErrors).toEqual({
      batch_size: "Too big",
      loras: "Number must be less than or equal to 2",
      "loras.1.strength": "Number must be less than or equal to 2",
    });
    expect(out1.formError).toBeNull();
    expect(out1.firstField).toBe("batch_size");
  });

  test("lists unowned field errors in formError as <label>: <message>", () => {
    const out2 = mapServerErrors(
      "Invalid value",
      {
        unknown_param: "Must be positive",
      },
      {
        knownFields: ["prompt"],
        labels: { unknown_param: "Unknown Param" },
      },
    );
    expect(out2.fieldErrors).toEqual({});
    expect(out2.formError).toBe("Unknown Param: Must be positive");
  });
});

describe("plans", () => {
  const base: Plan = {
    kind: "image",
    prompt: "a fox",
    count: 4,
    resolution: "9_16_HD",
    style_preset: "watercolor",
    duration_seconds: 0,
  };
  test("image plan", () => {
    const out = planToCreate(base, D);
    expect(out.kind).toBe("image");
    expect(out.values).toMatchObject({
      prompt: "a fox",
      batch_size: "4",
      resolution: "9_16_HD",
      style_preset: "watercolor",
    });
    expect(planSummary(base)).toBe("Image · 4 × 9:16 (HD) · watercolor");
    expect(
      planSummary({
        ...base,
        count: 1,
        style_preset: "none",
        resolution: "720p",
      }),
    ).toBe("Image · 1 × 720p");
  });
  test("video plan goes to text-to-video", () => {
    const plan: Plan = {
      ...base,
      kind: "video",
      count: 1,
      resolution: "720p",
      duration_seconds: 4,
    };
    const out = planToCreate(plan, D);
    expect(out.kind).toBe("text-to-video");
    expect(out.values).toMatchObject({
      prompt: "a fox",
      resolution: "720p",
      clip_duration: "4",
    });
    expect(out.values.style_preset).toBeUndefined();
    expect(planSummary(plan)).toBe("Video · 4s · 720p");
  });
  test("audio plan", () => {
    const plan: Plan = {
      ...base,
      kind: "audio",
      count: 1,
      duration_seconds: 90,
    };
    const out = planToCreate(plan, D);
    expect(out.kind).toBe("audio");
    expect(out.values).toMatchObject({
      instrumental_prompt: "a fox",
      lyric_prompt: "",
      duration: "90",
    });
    expect(planSummary(plan)).toBe("Audio · 90s");
  });
  test("isPlan validates plan shape and rejects missing, malformed, or unknown kinds", () => {
    expect(isPlan(base)).toBe(true);
    expect(isPlan({ ...base, kind: "video", duration_seconds: 5 })).toBe(true);
    expect(isPlan({ ...base, kind: "audio", duration_seconds: 60 })).toBe(true);
    expect(isPlan(null)).toBe(false);
    expect(isPlan(undefined)).toBe(false);
    expect(isPlan({})).toBe(false);
    expect(isPlan({ ...base, kind: "text-to-video" })).toBe(false);
    expect(isPlan({ ...base, kind: "compose" })).toBe(false);
    expect(isPlan({ ...base, prompt: "   " })).toBe(false);
    expect(isPlan({ ...base, count: 0 })).toBe(false);
    expect(isPlan({ ...base, count: "4" })).toBe(false);
    expect(isPlan({ ...base, resolution: "" })).toBe(false);
    expect(isPlan({ ...base, style_preset: "" })).toBe(false);
    expect(isPlan({ ...base, duration_seconds: -1 })).toBe(false);
    // count: integer 1-8
    expect(isPlan({ ...base, count: 1 })).toBe(true);
    expect(isPlan({ ...base, count: 8 })).toBe(true);
    expect(isPlan({ ...base, count: 9 })).toBe(false);
    expect(isPlan({ ...base, count: 2.5 })).toBe(false);
    // resolution: one of the known values
    expect(isPlan({ ...base, resolution: "480p" })).toBe(true);
    expect(isPlan({ ...base, resolution: "720p" })).toBe(true);
    expect(isPlan({ ...base, resolution: "1080p" })).toBe(true);
    expect(isPlan({ ...base, resolution: "9_16_SD" })).toBe(true);
    expect(isPlan({ ...base, resolution: "9_16_HD" })).toBe(true);
    expect(isPlan({ ...base, resolution: "4k" })).toBe(false);
    // style_preset: non-empty string of at most 50 characters
    expect(isPlan({ ...base, style_preset: "   " })).toBe(false);
    expect(isPlan({ ...base, style_preset: "a".repeat(50) })).toBe(true);
    expect(isPlan({ ...base, style_preset: "a".repeat(51) })).toBe(false);
    // duration_seconds: integer, 1-10 for video, 10-720 for audio, any non-negative integer for image
    expect(isPlan({ ...base, kind: "image", duration_seconds: 0 })).toBe(true);
    expect(isPlan({ ...base, kind: "image", duration_seconds: 15 })).toBe(true);
    expect(isPlan({ ...base, kind: "image", duration_seconds: 1.5 })).toBe(
      false,
    );
    expect(isPlan({ ...base, kind: "video", duration_seconds: 0 })).toBe(false);
    expect(isPlan({ ...base, kind: "video", duration_seconds: 1 })).toBe(true);
    expect(isPlan({ ...base, kind: "video", duration_seconds: 10 })).toBe(true);
    expect(isPlan({ ...base, kind: "video", duration_seconds: 11 })).toBe(
      false,
    );
    expect(isPlan({ ...base, kind: "video", duration_seconds: 5.5 })).toBe(
      false,
    );
    expect(isPlan({ ...base, kind: "audio", duration_seconds: 9 })).toBe(false);
    expect(isPlan({ ...base, kind: "audio", duration_seconds: 10 })).toBe(true);
    expect(isPlan({ ...base, kind: "audio", duration_seconds: 720 })).toBe(
      true,
    );
    expect(isPlan({ ...base, kind: "audio", duration_seconds: 721 })).toBe(
      false,
    );
    expect(isPlan({ ...base, kind: "audio", duration_seconds: 60.2 })).toBe(
      false,
    );
    // prompt: non-empty string of at most 4000 characters
    expect(isPlan({ ...base, prompt: "x".repeat(4000) })).toBe(true);
    expect(isPlan({ ...base, prompt: "x".repeat(4001) })).toBe(false);
  });
});
