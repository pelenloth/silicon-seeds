import { describe, expect, test } from "bun:test";
import {
  availableJobActions,
  canRegenerate,
  countByStatus,
  eventKind,
  eventLabel,
  eventStatusMeta,
  filterJobs,
  formatDuration,
  formatRelativeTime,
  jobDurationMs,
  jobKindMeta,
  jobStatusMeta,
  jobToPrefill,
  splitPrompt,
  summarizeEvents,
  type JobSummary,
} from "./job-view";

const NOW = Date.parse("2026-11-11T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const P0 = { total: 0, complete: 0, running: 0, pending: 0, failed: 0 };
const job = (over: Partial<JobSummary>): JobSummary => ({
  id: "j1",
  name: "Dunes",
  status: "complete",
  created_at: ago(1000),
  kind: "image",
  progress: P0,
  thumb: null,
  ...over,
});

describe("status meta (B7)", () => {
  test("job statuses", () => {
    expect(jobStatusMeta("complete")).toEqual({
      label: "Completed",
      tone: "success",
    });
    expect(jobStatusMeta("failed")).toEqual({ label: "Failed", tone: "error" });
    expect(jobStatusMeta("cancelled")).toEqual({
      label: "Cancelled",
      tone: "neutral",
    });
    expect(jobStatusMeta("paused")).toEqual({
      label: "Paused",
      tone: "warning",
    });
    expect(jobStatusMeta("active", { ...P0, total: 4, running: 1 })).toEqual({
      label: "Running",
      tone: "info",
    });
    expect(jobStatusMeta("active", { ...P0, total: 4, pending: 4 })).toEqual({
      label: "Queued",
      tone: "neutral",
    });
    expect(jobStatusMeta("active")).toEqual({
      label: "Queued",
      tone: "neutral",
    });
    expect(jobStatusMeta("weird")).toEqual({ label: "Weird", tone: "neutral" });
  });
  test("event statuses are four distinct states", () => {
    expect(eventStatusMeta("pending")).toEqual({
      label: "Pending",
      tone: "neutral",
    });
    expect(eventStatusMeta("running")).toEqual({
      label: "Running",
      tone: "info",
    });
    expect(eventStatusMeta("complete")).toEqual({
      label: "Done",
      tone: "success",
    });
    expect(eventStatusMeta("failed")).toEqual({
      label: "Failed",
      tone: "error",
    });
  });
});

describe("events (B3)", () => {
  test("eventKind accepts snake_case and PascalCase", () => {
    expect(eventKind("new_image_prompt")).toBe("image");
    expect(eventKind("NewImagePrompt")).toBe("image");
    expect(eventKind("new_text_prompt")).toBe("text");
    expect(eventKind("new_video_prompt")).toBe("video");
    expect(eventKind("new_transition_prompt")).toBe("transition");
    expect(eventKind("new_audio_prompt")).toBe("audio");
    expect(eventKind("new_video_composition")).toBe("composition");
    expect(eventKind("comfy_executed")).toBe("other");
  });
  test("labels are human", () => {
    expect(eventLabel("new_image_prompt")).toBe("Image");
    expect(eventLabel("new_video_prompt")).toBe("Video clip");
    expect(eventLabel("new_transition_prompt")).toBe("Transition");
    expect(eventLabel("new_text_prompt")).toBe("Script");
    expect(eventLabel("new_video_composition")).toBe("Final cut");
    expect(eventLabel("new_audio_prompt", "speech")).toBe("Voiceover");
    expect(eventLabel("new_audio_prompt", "song")).toBe("Song");
    expect(eventLabel("new_audio_prompt", "instrumental")).toBe("Music");
    expect(eventLabel("new_audio_prompt")).toBe("Audio");
    expect(eventLabel("something_else")).toBe("something_else");
  });
  test("canRegenerate matches the server rule", () => {
    expect(canRegenerate("new_image_prompt")).toBe(true);
    expect(canRegenerate("new_video_prompt")).toBe(true);
    expect(canRegenerate("new_transition_prompt")).toBe(true);
    expect(canRegenerate("new_audio_prompt")).toBe(false);
    expect(canRegenerate("new_text_prompt")).toBe(false);
  });
  test("summarizeEvents counts by status and kind", () => {
    const s = summarizeEvents([
      { type: "new_image_prompt", status: "complete" },
      { type: "new_image_prompt", status: "complete" },
      { type: "new_image_prompt", status: "running" },
      { type: "new_video_prompt", status: "pending" },
      { type: "new_audio_prompt", mode: "speech", status: "failed" },
    ]);
    expect(s.total).toBe(5);
    expect([s.complete, s.running, s.pending, s.failed]).toEqual([2, 1, 1, 1]);
    expect(s.percent).toBe(40);
    expect(s.byKind.image).toBe(3);
    expect(s.byKind.video).toBe(1);
    expect(s.byKind.audio).toBe(1);
    expect(s.byKind.transition).toBe(0);
    expect(s.currentLabel).toBe("Image");
    expect(summarizeEvents([]).percent).toBe(0);
    expect(summarizeEvents([]).currentLabel).toBeNull();
  });
});

describe("time", () => {
  test("formatDuration", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(57_000)).toBe("57s");
    expect(formatDuration(192_000)).toBe("3m 12s");
    expect(formatDuration(3_720_000)).toBe("1h 02m");
    expect(formatDuration(-5)).toBe("0s");
  });
  test("formatRelativeTime", () => {
    expect(formatRelativeTime(ago(10_000), NOW)).toBe("just now");
    expect(formatRelativeTime(ago(5 * 60_000), NOW)).toBe("5m ago");
    expect(formatRelativeTime(ago(2 * 3_600_000), NOW)).toBe("2h ago");
    expect(formatRelativeTime(ago(30 * 3_600_000), NOW)).toBe("Yesterday");
    expect(formatRelativeTime(ago(3 * 86_400_000), NOW)).toBe("3d ago");
    expect(formatRelativeTime("2026-09-27T10:00:00.000Z", NOW)).toBe("Sep 27");
    expect(formatRelativeTime("2025-09-27T10:00:00.000Z", NOW)).toBe(
      "Sep 27, 2025",
    );
  });
  test("jobDurationMs: finished jobs end at the last event, active jobs at now", () => {
    const created = ago(100_000);
    const events = [{ created_at: ago(90_000) }, { created_at: ago(43_000) }];
    expect(jobDurationMs(created, events, "complete", NOW)).toBe(57_000);
    expect(jobDurationMs(created, events, "active", NOW)).toBe(100_000);
    expect(jobDurationMs(created, [], "complete", NOW)).toBe(0);
  });
});

describe("lists and actions", () => {
  const jobs = [
    job({
      id: "a",
      name: "Desert Dunes",
      status: "complete",
      created_at: ago(3000),
    }),
    job({
      id: "b",
      name: "Night City",
      status: "failed",
      created_at: ago(1000),
      original_prompt: "neon desert rain",
    }),
    job({ id: "c", name: "Ocean", status: "active", created_at: ago(2000) }),
  ];
  test("filterJobs sorts newest first, filters by status and query", () => {
    expect(filterJobs(jobs, {}).map((j) => j.id)).toEqual(["b", "c", "a"]);
    expect(filterJobs(jobs, { status: "all" }).length).toBe(3);
    expect(filterJobs(jobs, { status: "recent" }).length).toBe(3);
    expect(filterJobs(jobs, { status: "failed" }).map((j) => j.id)).toEqual([
      "b",
    ]);
    expect(filterJobs(jobs, { query: "DESERT" }).map((j) => j.id)).toEqual([
      "b",
      "a",
    ]);
    expect(filterJobs(jobs, { status: "complete", query: "night" })).toEqual(
      [],
    );
  });
  test("filterJobs sorts unparsable created_at dates last", () => {
    const mixed = [
      job({ id: "older", created_at: "2026-01-02T00:00:00Z" }),
      job({ id: "bad", created_at: "garbage" }),
      job({ id: "newest", created_at: "2026-01-03T00:00:00Z" }),
    ];
    expect(filterJobs(mixed, {}).map((j) => j.id)).toEqual([
      "newest",
      "older",
      "bad",
    ]);
  });
  test("countByStatus", () => {
    expect(countByStatus(jobs)).toEqual({
      all: 3,
      active: 1,
      complete: 1,
      failed: 1,
      paused: 0,
      cancelled: 0,
    });
  });
  test("availableJobActions (B6)", () => {
    expect(availableJobActions("active")).toEqual(["pause", "cancel"]);
    expect(availableJobActions("paused")).toEqual(["resume", "cancel"]);
    expect(availableJobActions("failed")).toEqual(["retry", "delete"]);
    expect(availableJobActions("complete")).toEqual(["delete"]);
    expect(availableJobActions("cancelled")).toEqual(["delete"]);
    expect(availableJobActions("weird")).toEqual([]);
  });
  test("jobKindMeta", () => {
    expect(jobKindMeta("image")).toEqual({
      label: "Image",
      route: "/create/image",
    });
    expect(jobKindMeta("compose")).toEqual({
      label: "Compose",
      route: "/compose",
    });
  });
});

describe("reuse settings", () => {
  test("splitPrompt strips the appended style guide", () => {
    expect(splitPrompt("a fox\n\nStyle Guide: ink wash", "ink wash")).toEqual({
      prompt: "a fox",
      styleGuide: "ink wash",
    });
    expect(splitPrompt("a fox\n\nStyle guide: ink wash", "ink wash")).toEqual({
      prompt: "a fox",
      styleGuide: "ink wash",
    });
    expect(splitPrompt("a fox", null)).toEqual({
      prompt: "a fox",
      styleGuide: "",
    });
    expect(splitPrompt(null, null)).toEqual({ prompt: "", styleGuide: "" });
  });
  test("image job", () => {
    const out = jobToPrefill(
      job({
        kind: "image",
        original_prompt: "a fox\n\nStyle Guide: ink",
        style_guide: "ink",
        resolution: "720p",
        image_model: "z-image-turbo",
        style_preset: "watercolor",
        loras: '[{"name":"x.safetensors","strength":0.7}]',
      }),
    );
    expect(out.route).toBe("/create/image");
    expect(out.values).toEqual({
      prompt: "a fox",
      style_guide: "ink",
      resolution: "720p",
      image_model: "z-image-turbo",
      style_preset: "watercolor",
      loras: '[{"name":"x.safetensors","strength":0.7}]',
    });
  });
  test("video job goes to text-to-video unless it has a preset or LoRAs", () => {
    const plain = jobToPrefill(
      job({
        kind: "video",
        original_prompt: "waves",
        video_model: "ltx2.3",
        fps: 24,
        clip_duration: 4,
        resolution: "480p",
        style_preset: "none",
      }),
    );
    expect(plain.route).toBe("/create/text-to-video");
    expect(plain.values).toEqual({
      prompt: "waves",
      resolution: "480p",
      video_model: "ltx2.3",
      fps: "24",
      clip_duration: "4",
    });
    expect(
      jobToPrefill(
        job({ kind: "video", original_prompt: "waves", style_preset: "anime" }),
      ).route,
    ).toBe("/create/video");
    expect(
      jobToPrefill(
        job({
          kind: "video",
          original_prompt: "waves",
          loras: '[{"name":"a","strength":1}]',
        }),
      ).route,
    ).toBe("/create/video");
  });
  test("audio and compose jobs", () => {
    expect(
      jobToPrefill(job({ kind: "audio", original_prompt: "slow ambient pop" })),
    ).toEqual({
      route: "/create/audio",
      values: { instrumental_prompt: "slow ambient pop" },
    });
    const c = jobToPrefill(
      job({
        kind: "compose",
        original_prompt: "Once upon a time",
        transition_duration: 2,
        fps: 16,
      }),
    );
    expect(c.route).toBe("/compose");
    expect(c.values).toEqual({
      script: "Once upon a time",
      fps: "16",
      transition_duration: "2",
    });
  });
  test("a style guide alone keeps a video job on text-to-video", () => {
    const out = jobToPrefill(
      job({
        kind: "video",
        original_prompt: "waves\n\nStyle Guide: ink",
        style_guide: "ink",
        style_preset: "none",
      }),
    );
    expect(out.route).toBe("/create/text-to-video");
    expect(out.values.style_guide).toBe("ink");
    expect(out.values.prompt).toBe("waves");
  });
});
