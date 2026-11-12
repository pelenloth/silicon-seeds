import { describe, expect, test } from "bun:test";
import {
  aggregateProgress,
  deriveJobKind,
  finalizeDecision,
  mediaTypeFromFilename,
  pickThumb,
  type EventSig,
} from "./job-summary";

const sig = (
  type: string,
  mode: string,
  status = "complete",
  count = 1,
): EventSig => ({ type, mode, status, count });

describe("deriveJobKind (shapes taken from live data)", () => {
  test("image batch stored with the default compose workflow is an image job", () => {
    expect(
      deriveJobKind({ workflow: "compose", image_model: "z-image-turbo" }, [
        sig("new_image_prompt", "image"),
      ]),
    ).toBe("image");
  });
  test("a script-driven pipeline is compose", () => {
    expect(
      deriveJobKind(
        { workflow: "compose", video_model: "wan2.2", audio_model: "sa3" },
        [
          sig("new_text_prompt", "text"),
          sig("new_audio_prompt", "speech"),
          sig("new_image_prompt", "video"),
        ],
      ),
    ).toBe("compose");
    expect(
      deriveJobKind({ workflow: "autocut" }, [
        sig("new_video_composition", "video"),
      ]),
    ).toBe("compose");
  });
  test("video workflow stays video even with a composition event", () => {
    expect(
      deriveJobKind({ workflow: "video", video_model: "ltx2.3" }, [
        sig("new_video_prompt", "video"),
      ]),
    ).toBe("video");
    expect(
      deriveJobKind({ workflow: "video", video_model: "wan2.2" }, [
        sig("new_video_prompt", "video"),
        sig("new_video_composition", "video"),
        sig("new_image_prompt", "video"),
      ]),
    ).toBe("video");
  });
  test("audio-only events are an audio job", () => {
    expect(
      deriveJobKind({ workflow: "compose", audio_model: "ace-step-1.5" }, [
        sig("new_audio_prompt", "song"),
      ]),
    ).toBe("audio");
  });
  test("no events falls back on model columns", () => {
    expect(
      deriveJobKind({ workflow: "compose", audio_model: "ace-step-1.5" }, []),
    ).toBe("audio");
    expect(
      deriveJobKind(
        {
          workflow: "compose",
          video_model: "wan2.2",
          audio_model: "sa3",
          image_model: "z",
        },
        [],
      ),
    ).toBe("compose");
    expect(
      deriveJobKind({ workflow: "video", video_model: "wan2.2" }, []),
    ).toBe("video");
    expect(
      deriveJobKind({ workflow: "compose", image_model: "z-image-turbo" }, []),
    ).toBe("image");
    expect(deriveJobKind({}, [])).toBe("image");
  });
  test("hypercut workflow is video unless overridden by new_text_prompt", () => {
    expect(deriveJobKind({ workflow: "hypercut" }, [])).toBe("video");
    expect(
      deriveJobKind({ workflow: "hypercut" }, [sig("new_text_prompt", "text")]),
    ).toBe("compose");
  });
});

describe("aggregateProgress", () => {
  test("sums counts per status", () => {
    expect(
      aggregateProgress([
        sig("new_image_prompt", "image", "complete", 7),
        sig("new_image_prompt", "image", "running", 1),
        sig("new_image_prompt", "image", "pending", 6),
        sig("new_video_prompt", "video", "failed", 2),
      ]),
    ).toEqual({ total: 16, complete: 7, running: 1, pending: 6, failed: 2 });
    expect(aggregateProgress([])).toEqual({
      total: 0,
      complete: 0,
      running: 0,
      pending: 0,
      failed: 0,
    });
  });
});

describe("media helpers", () => {
  test("mediaTypeFromFilename", () => {
    expect(mediaTypeFromFilename("a.PNG")).toBe("image");
    expect(mediaTypeFromFilename("clip.mp4")).toBe("video");
    expect(mediaTypeFromFilename("song.flac")).toBe("audio");
    expect(mediaTypeFromFilename("notes.txt")).toBeNull();
    expect(mediaTypeFromFilename("noext")).toBeNull();
  });
  test("pickThumb prefers the first image, then the first video, never audio", () => {
    expect(
      pickThumb([
        { filename: "a.mp4", subfolder: "" },
        { filename: "b.png", subfolder: "x" },
      ]),
    ).toEqual({
      subfolder: "x",
      filename: "b.png",
      mediaType: "image",
    });
    expect(pickThumb([{ filename: "a.mp4", subfolder: "" }])).toEqual({
      subfolder: "",
      filename: "a.mp4",
      mediaType: "video",
    });
    expect(pickThumb([{ filename: "a.wav", subfolder: "" }])).toBeNull();
    expect(pickThumb([])).toBeNull();
  });
  test("pickThumb carries the meta_id of the chosen row", () => {
    expect(
      pickThumb([
        { filename: "a.mp4", subfolder: "", meta_id: "m1" },
        { filename: "b.png", subfolder: "x", meta_id: "m2" },
      ]),
    ).toEqual({
      subfolder: "x",
      filename: "b.png",
      mediaType: "image",
      meta_id: "m2",
    });
    expect(
      pickThumb([{ filename: "a.mp4", subfolder: "", meta_id: "m1" }]),
    ).toMatchObject({ mediaType: "video", meta_id: "m1" });
  });
  test("takePage slices items, computes total up to offset + limit, and reports hasMore from look-ahead or scan-cap", async () => {
    const { takePage } = await import("./job-summary");
    expect(takePage(["a", "b", "c"], 0, 2)).toEqual({
      slice: ["a", "b"],
      total: 2,
      hasMore: true,
    });
    expect(takePage(["a", "b"], 0, 2)).toEqual({
      slice: ["a", "b"],
      total: 2,
      hasMore: false,
    });
    expect(takePage(["a", "b", "c", "d"], 1, 2)).toEqual({
      slice: ["b", "c"],
      total: 3,
      hasMore: true,
    });
    expect(takePage(["a", "b", "c"], 1, 2)).toEqual({
      slice: ["b", "c"],
      total: 3,
      hasMore: false,
    });
    expect(takePage([], 0, 12)).toEqual({
      slice: [],
      total: 0,
      hasMore: false,
    });
    // offset past the end
    expect(takePage(["a", "b"], 5, 2)).toEqual({
      slice: [],
      total: 2,
      hasMore: false,
    });
    // limit 0
    expect(takePage(["a", "b"], 0, 0)).toEqual({
      slice: [],
      total: 0,
      hasMore: true,
    });
    // negative input
    expect(takePage(["a", "b", "c"], -3, -2)).toEqual({
      slice: [],
      total: 0,
      hasMore: true,
    });
    // scan-cap case: fewer than offset + limit + 1 existing items found, but scan hit its cap
    expect(takePage(["a"], 0, 2, { scannedCount: 5, scanLimit: 5 })).toEqual({
      slice: ["a"],
      total: 1,
      hasMore: true,
    });
    expect(takePage(["a"], 0, 2, { scannedCount: 4, scanLimit: 5 })).toEqual({
      slice: ["a"],
      total: 1,
      hasMore: false,
    });
  });
});

describe("finalizeDecision", () => {
  test("standalone audio settled -> complete", () => {
    expect(
      finalizeDecision({
        job: {
          workflow: "compose",
          audio_model: "ace-step-1.5",
          image_model: null,
          video_model: null,
        },
        events: [{ type: "new_audio_prompt", status: "complete" }],
      }),
    ).toBe("complete");
  });

  test("Compose job with only a complete text event -> wait", () => {
    expect(
      finalizeDecision({
        job: {
          workflow: "compose",
          audio_model: "sa3",
          image_model: "z-image-turbo",
          video_model: "wan2.2",
        },
        events: [{ type: "new_text_prompt", status: "complete" }],
      }),
    ).toBe("wait");
  });

  test("Compose job with a narration audio event, image_model set, no image event yet -> wait", () => {
    expect(
      finalizeDecision({
        job: {
          workflow: "compose",
          audio_model: "sa3",
          image_model: "z-image-turbo",
          video_model: "wan2.2",
        },
        events: [{ type: "new_audio_prompt", status: "complete" }],
      }),
    ).toBe("wait");
  });

  test("Compose job with image events -> complete", () => {
    expect(
      finalizeDecision({
        job: {
          workflow: "compose",
          audio_model: "sa3",
          image_model: "z-image-turbo",
          video_model: "wan2.2",
        },
        events: [
          { type: "new_text_prompt", status: "complete" },
          { type: "new_audio_prompt", status: "complete" },
          { type: "new_image_prompt", status: "complete" },
        ],
      }),
    ).toBe("complete");
  });

  test("video workflow without a complete video event -> wait", () => {
    expect(
      finalizeDecision({
        job: {
          workflow: "video",
          image_model: "z-image-turbo",
          video_model: "ltx2.3",
        },
        events: [{ type: "new_image_prompt", status: "complete" }],
      }),
    ).toBe("wait");
    expect(
      finalizeDecision({
        job: {
          workflow: "video",
          image_model: "z-image-turbo",
          video_model: "ltx2.3",
        },
        events: [
          { type: "new_image_prompt", status: "complete" },
          { type: "new_video_prompt", status: "complete" },
        ],
      }),
    ).toBe("complete");
  });

  test("any failed event -> failed", () => {
    expect(
      finalizeDecision({
        job: {
          workflow: "compose",
          audio_model: "ace-step-1.5",
        },
        events: [{ type: "new_audio_prompt", status: "failed" }],
      }),
    ).toBe("failed");
    expect(
      finalizeDecision({
        job: {
          workflow: "video",
          video_model: "ltx2.3",
        },
        events: [{ type: "new_image_prompt", status: "failed" }],
      }),
    ).toBe("failed");
  });
});
