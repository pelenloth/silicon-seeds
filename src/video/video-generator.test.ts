import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSegmentNormalizeFfmpegArgs,
  compositionFps,
  continuationFrameArgs,
  nextContinuationIndex,
  VideoGenerator,
} from "./video-generator";
import { DB } from "../db/db";
import { JobOrchestrator } from "../jobs/jobs";
import { Event, JobMode, JobStatus, type JobEvent } from "../events/events";

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

describe("continuationFrameArgs", () => {
  test("decodes to the true final frame like video_frames", () => {
    const args = continuationFrameArgs("/tmp/clip.mp4", "/in/last.png");
    expect(args).toEqual([
      "ffmpeg",
      "-y",
      "-nostdin",
      "-sseof",
      "-2",
      "-i",
      "/tmp/clip.mp4",
      "-update",
      "1",
      "-q:v",
      "2",
      "/in/last.png",
    ]);
    expect(args).not.toContain("-frames:v");
  });
});

describe("continuation failure handling", () => {
  const event = {
    id: "evt-clip-0",
    jobId: "job-cont-1",
    type: Event.NewVideoPrompt,
    mode: JobMode.Video,
    status: JobStatus.Complete,
    index: 0,
  } as unknown as JobEvent;

  afterEach(() => {
    mock.restore();
  });

  test("advance_continuation propagates frame extraction errors without failing the job itself", async () => {
    const prevInputDir = Bun.env.INPUT_DIR;
    Bun.env.INPUT_DIR = mkdtempSync(join(tmpdir(), "cont-input-"));
    spyOn(DB.Jobs, "findById").mockResolvedValue({
      video_settings: JSON.stringify({
        sequence_mode: "continuation",
        sequence_prompts: ["shot 1", "shot 2"],
      }),
    } as never);
    spyOn(DB.Events, "findByJobId").mockResolvedValue([event] as never);
    const failJob = spyOn(DB.Jobs, "failJob").mockResolvedValue(undefined);

    try {
      // The clip file does not exist, so ffmpeg (or its spawn) fails.
      await expect(
        VideoGenerator.advance_continuation(event),
      ).rejects.toThrow();
      expect(failJob).not.toHaveBeenCalled();
    } finally {
      Bun.env.INPUT_DIR = prevInputDir;
    }
  });

  test("fail_media_event clears stale meta, marks the event Failed, then fails the job", async () => {
    const calls: string[] = [];
    const deleteMeta = spyOn(DB.Meta, "deleteByEventIds").mockImplementation(
      async (ids: string[]) => {
        calls.push(`meta:${ids.join(",")}`);
      },
    );
    const updateSchedule = spyOn(
      JobOrchestrator,
      "update_schedule",
    ).mockImplementation(async (e: JobEvent) => {
      calls.push(`event:${e.status}`);
      return e as never;
    });
    spyOn(DB.Jobs, "failJob").mockImplementation(async (id: string) => {
      calls.push(`job:${id}`);
    });

    await VideoGenerator.fail_media_event(event, "video sequence step failed");

    expect(calls).toEqual([
      "meta:evt-clip-0",
      `event:${JobStatus.Failed}`,
      "job:job-cont-1",
    ]);
    expect(deleteMeta).toHaveBeenCalledWith(["evt-clip-0"]);
    expect(updateSchedule.mock.calls[0][0]).toMatchObject({
      id: "evt-clip-0",
      status: JobStatus.Failed,
      error: "video sequence step failed",
    });
  });
});
