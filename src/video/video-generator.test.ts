import { describe, expect, test } from "bun:test";
import { buildSegmentNormalizeFfmpegArgs } from "./video-generator";

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
