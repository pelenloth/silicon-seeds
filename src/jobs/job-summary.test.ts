import { describe, expect, test } from "bun:test";
import {
  aggregateProgress,
  deriveJobKind,
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
});
