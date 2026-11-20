import { describe, expect, test } from "bun:test";
import {
  buildSegmentNormalizeFfmpegArgs,
  compositionFps,
  nextContinuationIndex,
} from "./video-generator";

describe("VideoGenerator audio-safe normalization & sequencing helpers", () => {
  test("preserves existing clip audio stream when hasAudioStream is true", () => {
    const args = buildSegmentNormalizeFfmpegArgs({
      sourceFile: "/tmp/in.mp4",
      normalizedFile: "/tmp/out.mp4",
      width: 1376,
      height: 768,
      fps: 24,
      hasAudioStream: true,
    });
    expect(args).toContain("-c:a");
    expect(args).toContain("aac");
    expect(args).not.toContain(
      "anullsrc=channel_layout=stereo:sample_rate=48000",
    );
  });

  test("injects silent stereo 48kHz audio track when source clip has no audio stream", () => {
    const args = buildSegmentNormalizeFfmpegArgs({
      sourceFile: "/tmp/silent.mp4",
      normalizedFile: "/tmp/out.mp4",
      width: 1280,
      height: 720,
      fps: 24,
      hasAudioStream: false,
    });
    expect(args).toContain("anullsrc=channel_layout=stereo:sample_rate=48000");
    expect(args).toContain("-shortest");
    expect(args).toContain("aac");
  });
});

describe("nextContinuationIndex", () => {
  const settings = {
    sequence_mode: "continuation" as const,
    sequence_prompts: ["shot 1", "shot 2", "shot 3"],
  };

  test("schedules the next clip when it does not exist yet", () => {
    expect(
      nextContinuationIndex(settings, 0, [
        { type: "new_video_prompt", index: 0 },
      ]),
    ).toBe(1);
  });

  test("does not schedule a duplicate when the next clip already exists", () => {
    expect(
      nextContinuationIndex(settings, 0, [
        { type: "new_video_prompt", index: 0 },
        { type: "new_video_prompt", index: 1 },
      ]),
    ).toBeNull();
  });

  test("ignores non-video events at the next index", () => {
    expect(
      nextContinuationIndex(settings, 1, [
        { type: "new_video_prompt", index: 1 },
        { type: "new_transition_prompt", index: 2 },
      ]),
    ).toBe(2);
  });

  test("stops at the end of the chain and for non-continuation jobs", () => {
    expect(nextContinuationIndex(settings, 2, [])).toBeNull();
    expect(
      nextContinuationIndex(
        { sequence_mode: "transition", sequence_prompts: ["a", "b"] },
        0,
        [],
      ),
    ).toBeNull();
    expect(nextContinuationIndex(null, 0, [])).toBeNull();
  });
});

describe("compositionFps", () => {
  test("MiniMax H3 compositions always render at the native 24 fps", () => {
    expect(compositionFps({ video_model: "minimax-h3", fps: 16 })).toBe(24);
    expect(compositionFps({ video_model: "minimax-h3", fps: null })).toBe(24);
  });

  test("other models keep the job fps", () => {
    expect(compositionFps({ video_model: "wan2.2", fps: 16 })).toBe(16);
    expect(compositionFps({ video_model: "ltx2.3", fps: 12 })).toBe(12);
  });
});
