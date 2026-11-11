import { afterEach, describe, expect, test } from "bun:test";
import { ApiError } from "./api-client";
import {
  AUDIO_DEFAULTS,
  CREATE_KINDS,
  quickCreateValues,
  submitCreateJob,
  toFormData,
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
});
