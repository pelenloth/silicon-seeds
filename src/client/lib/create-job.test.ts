import { afterEach, describe, expect, test } from "bun:test";
import { ApiError } from "./api-client";
import {
  AUDIO_DEFAULTS,
  CREATE_KINDS,
  mapServerErrors,
  quickCreateValues,
  submitCreateJob,
  toFormData,
  validateCreateFields,
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

describe("validateCreateFields", () => {
  test("checks required fields, max lengths and numeric ranges", () => {
    const res1 = validateCreateFields(
      { prompt: "   ", style_guide: "a".repeat(2005), batch_size: "20" },
      {
        required: [{ field: "prompt", message: "Prompt is required" }],
        maxLengths: [{ field: "style_guide", max: 2000, label: "Style guide" }],
        ranges: [{ field: "batch_size", min: 1, max: 16, label: "Images" }],
      },
    );
    expect(res1.firstInvalid).toBe("prompt");
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
    expect(res2.firstInvalid).toBeNull();
    expect(res2.errors).toEqual({});
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
