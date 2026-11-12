import { describe, expect, test } from "bun:test";
import {
  availableJobActions,
  canRegenerate,
  countByStatus,
  detectTransitions,
  eventDisplayStatus,
  eventKind,
  eventLabel,
  eventStatusMeta,
  filterJobs,
  formatDuration,
  formatRelativeTime,
  galleryPageDecision,
  isCancelledEvent,
  JOB_CANCELLED_ERROR,
  jobDurationMs,
  jobKindMeta,
  jobStatusMeta,
  jobToPrefill,
  mediaKindLabel,
  mediaTitle,
  nextBackoffMs,
  plural,
  shouldApplyResponse,
  shouldMoveMobileFocusForActive,
  shouldPreviewOnFocus,
  shouldRetryMedia,
  shouldShowNewMedia,
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
    expect(jobStatusMeta("active", { ...P0, total: 1, complete: 1 })).toEqual({
      label: "Finishing",
      tone: "info",
    });
    expect(jobStatusMeta("active")).toEqual({
      label: "Queued",
      tone: "neutral",
    });
    expect(jobStatusMeta("weird")).toEqual({ label: "Weird", tone: "neutral" });
  });
  test("event statuses include cancelled", () => {
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
    expect(eventStatusMeta("cancelled")).toEqual({
      label: "Cancelled",
      tone: "neutral",
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
  test("jobDurationMs: active jobs return elapsed ms, finished/other statuses return null", () => {
    const created = ago(100_000);
    const events = [{ created_at: ago(90_000) }, { created_at: ago(43_000) }];
    expect(jobDurationMs(created, events, "active", NOW)).toBe(100_000);
    expect(jobDurationMs(created, events, "complete", NOW)).toBeNull();
    expect(jobDurationMs(created, [], "complete", NOW)).toBeNull();
    expect(jobDurationMs(created, events, "failed", NOW)).toBeNull();
    expect(jobDurationMs(created, events, "paused", NOW)).toBeNull();
    expect(jobDurationMs(created, events, "cancelled", NOW)).toBeNull();
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

describe("detectTransitions", () => {
  test("only jobs seen running in this session that just finished or failed", () => {
    const prev = new Map([
      ["a", "active"],
      ["b", "active"],
      ["c", "complete"],
      ["d", "paused"],
      ["f", "active"],
    ]);
    const next = [
      { id: "a", name: "A", status: "complete" },
      { id: "b", name: "B", status: "active" },
      { id: "c", name: "C", status: "complete" },
      { id: "d", name: "D", status: "failed" },
      { id: "e", name: "E", status: "complete" },
      { id: "f", name: "F", status: "cancelled" },
    ];
    expect(detectTransitions(prev, next)).toEqual([
      { id: "a", name: "A", from: "active", to: "complete" },
      { id: "d", name: "D", from: "paused", to: "failed" },
    ]);
    expect(detectTransitions(new Map(), next)).toEqual([]);
  });
});

describe("shouldApplyResponse", () => {
  test("applies only when seq is strictly greater than lastApplied", () => {
    expect(shouldApplyResponse(1, 0)).toBe(true);
    expect(shouldApplyResponse(2, 1)).toBe(true);
    expect(shouldApplyResponse(2, 2)).toBe(false);
    expect(shouldApplyResponse(1, 2)).toBe(false);
  });
});

describe("nextBackoffMs", () => {
  test("exponential backoff starting at 1000ms, doubling, capped at 30000ms", () => {
    expect(nextBackoffMs(0)).toBe(1000);
    expect(nextBackoffMs(1)).toBe(2000);
    expect(nextBackoffMs(2)).toBe(4000);
    expect(nextBackoffMs(3)).toBe(8000);
    expect(nextBackoffMs(4)).toBe(16000);
    expect(nextBackoffMs(5)).toBe(30000);
    expect(nextBackoffMs(10)).toBe(30000);
    expect(nextBackoffMs(-1)).toBe(1000);
  });
});

describe("mediaTitle and mediaKindLabel", () => {
  test("mediaTitle returns trimmed job_name when non-empty", () => {
    expect(
      mediaTitle({
        filename: "01a1c5d1-d113-7000-b503-09218cc141ed_00001_.png",
        mediaType: "image",
        job_name: "  Neon Fox  ",
      }),
    ).toBe("Neon Fox");
  });

  test("mediaTitle falls back to filename stem when readable and not an ID token", () => {
    expect(
      mediaTitle({
        filename: "demo-1.svg",
        mediaType: "image",
        job_name: null,
      }),
    ).toBe("demo-1");
    expect(
      mediaTitle({
        filename: "sub/dir/sunset_beach_01.mp4",
        mediaType: "video",
        job_name: "   ",
      }),
    ).toBe("sunset_beach_01");
  });

  test("mediaTitle returns Untitled <kind> when filename remainder is only id-like tokens", () => {
    expect(
      mediaTitle({
        filename: "01a1c5d1-d113-7000-b503-09218cc141ed_00001_.png",
        mediaType: "image",
      }),
    ).toBe("Untitled image");
    expect(
      mediaTitle({
        filename: "tts/01a1c55b-4b23-7000-a131-b84012345678.flac",
        mediaType: "audio",
        job_name: "",
      }),
    ).toBe("Untitled audio");
    expect(
      mediaTitle({
        filename: "a1b2c3d4e5f60001_00002_.mp4",
        mediaType: "video",
      }),
    ).toBe("Untitled video");
    expect(
      mediaTitle({
        filename: "_00001_.png",
        mediaType: "image",
      }),
    ).toBe("Untitled image");
    expect(
      mediaTitle({
        filename: "1234567890.wav",
        mediaType: "audio",
      }),
    ).toBe("Untitled audio");
  });

  test("mediaTitle keeps real hex-letter words (facade, decade, effaced) as titles while treating hex+digit tokens as id-like", () => {
    for (const word of ["facade", "decade", "effaced"]) {
      expect(
        mediaTitle({
          filename: `${word}.png`,
          mediaType: "image",
        }),
      ).toBe(word);
    }
    expect(
      mediaTitle({
        filename: "a1b2c3d4e5f60001.png",
        mediaType: "image",
      }),
    ).toBe("Untitled image");
  });

  test("mediaTitle handles multi-dot extensions, embedded counters, UUIDs with or without trailing underscores, and whitespace-only job_name", () => {
    expect(
      mediaTitle({
        filename: "01a1c5d1-d113-7000-b503-09218cc141ed_00001_.png",
        mediaType: "image",
      }),
    ).toBe("Untitled image");
    expect(
      mediaTitle({
        filename: "01a1c5d1-d113-7000-b503-09218cc141ed_00001.png",
        mediaType: "image",
      }),
    ).toBe("Untitled image");
    expect(
      mediaTitle({
        filename: "tts/01a1c5d1-d113-7000-b503-09218cc141ed.wav",
        mediaType: "audio",
      }),
    ).toBe("Untitled audio");
    expect(
      mediaTitle({
        filename: "my.final.cut.mp4",
        mediaType: "video",
      }),
    ).toBe("my.final.cut");
    expect(
      mediaTitle({
        filename: "cafe_1_bad.png",
        mediaType: "image",
      }),
    ).toBe("cafe_1_bad");
    expect(
      mediaTitle({
        filename: "01a1c5d1-d113-7000-b503-09218cc141ed.png",
        mediaType: "image",
        job_name: "   \t\n  ",
      }),
    ).toBe("Untitled image");
  });

  test("mediaKindLabel distinguishes Voiceover, Audio, Video and Image", () => {
    expect(mediaKindLabel({ mediaType: "audio", subfolder: "tts" })).toBe(
      "Voiceover",
    );
    expect(mediaKindLabel({ mediaType: "audio", subfolder: "tts/2026" })).toBe(
      "Voiceover",
    );
    expect(mediaKindLabel({ mediaType: "audio", subfolder: "/tts/2026" })).toBe(
      "Voiceover",
    );
    expect(
      mediaKindLabel({
        mediaType: "audio",
        subfolder: "",
        filename: "tts/01a1c5d1-d113-7000-b503-09218cc141ed.wav",
      }),
    ).toBe("Voiceover");
    expect(mediaKindLabel({ mediaType: "audio", subfolder: "music" })).toBe(
      "Audio",
    );
    expect(mediaKindLabel({ mediaType: "audio", subfolder: "" })).toBe("Audio");
    expect(mediaKindLabel({ mediaType: "video", subfolder: "" })).toBe("Video");
    expect(mediaKindLabel({ mediaType: "image", subfolder: "" })).toBe("Image");
  });
});

describe("cancelled events, plural and shouldShowNewMedia", () => {
  test("isCancelledEvent and eventDisplayStatus distinguish user-cancelled steps from real failures", () => {
    const cancelledEvt = {
      status: "failed",
      error: "job cancelled by user",
    };
    const failedEvt = {
      status: "failed",
      error: "CUDA out of memory",
    };
    const doneEvt = {
      status: "complete",
      error: null,
    };

    expect(isCancelledEvent(cancelledEvt)).toBe(true);
    expect(isCancelledEvent(failedEvt)).toBe(false);
    expect(isCancelledEvent(doneEvt)).toBe(false);

    expect(eventDisplayStatus(cancelledEvt)).toBe("cancelled");
    expect(eventDisplayStatus(failedEvt)).toBe("failed");
    expect(eventDisplayStatus(doneEvt)).toBe("complete");

    const s = summarizeEvents([
      { type: "new_image_prompt", status: "complete" },
      {
        type: "new_image_prompt",
        status: "failed",
        error: "job cancelled by user",
      },
      {
        type: "new_image_prompt",
        status: "failed",
        error: "job cancelled by user",
      },
      {
        type: "new_image_prompt",
        status: "failed",
        error: "job cancelled by user",
      },
    ]);
    expect(s.total).toBe(4);
    expect(s.complete).toBe(1);
    expect(s.failed).toBe(0);
  });

  test("plural formats singular and plural counts", () => {
    expect(plural(1, "output")).toBe("1 output");
    expect(plural(0, "output")).toBe("0 outputs");
    expect(plural(4, "output")).toBe("4 outputs");
    expect(plural(1, "image")).toBe("1 image");
    expect(plural(3, "image")).toBe("3 images");
    expect(plural(1, "item")).toBe("1 item");
    expect(plural(20, "item")).toBe("20 items");
    expect(plural(1, "step")).toBe("1 step");
    expect(plural(2, "step")).toBe("2 steps");
  });

  test("shouldShowNewMedia returns true only when prevCompleted is a number and nextCompleted rises", () => {
    expect(shouldShowNewMedia(null, 0)).toBe(false);
    expect(shouldShowNewMedia(null, 5)).toBe(false);
    expect(shouldShowNewMedia(5, 5)).toBe(false);
    expect(shouldShowNewMedia(5, 4)).toBe(false);
    expect(shouldShowNewMedia(0, 1)).toBe(true);
    expect(shouldShowNewMedia(5, 6)).toBe(true);
  });

  test("galleryPageDecision handles continue, end, and stalled cases", () => {
    expect(
      galleryPageDecision({
        added: 20,
        nextCursor: "c2",
        prevCursor: "c1",
      }),
    ).toBe("continue");
    expect(
      galleryPageDecision({
        added: 20,
        nextCursor: null,
        prevCursor: "c1",
      }),
    ).toBe("end");
    expect(
      galleryPageDecision({
        added: 0,
        nextCursor: undefined,
        prevCursor: "c1",
      }),
    ).toBe("end");
    expect(
      galleryPageDecision({
        added: 20,
        nextCursor: "c1",
        prevCursor: "c1",
      }),
    ).toBe("stalled");
    expect(
      galleryPageDecision({
        added: 0,
        nextCursor: "c2",
        prevCursor: "c1",
      }),
    ).toBe("stalled");
  });

  test("shouldMoveMobileFocusForActive moves focus only for body, list or skeleton-back", () => {
    expect(shouldMoveMobileFocusForActive({ activeIn: "body" })).toBe(true);
    expect(shouldMoveMobileFocusForActive({ activeIn: "list" })).toBe(true);
    expect(shouldMoveMobileFocusForActive({ activeIn: "skeleton-back" })).toBe(
      true,
    );
    expect(shouldMoveMobileFocusForActive({ activeIn: "detail" })).toBe(false);
    expect(shouldMoveMobileFocusForActive({ activeIn: "other" })).toBe(false);
  });

  test("JOB_CANCELLED_ERROR matches server cancel sentinel", () => {
    // Must stay in sync with src/db/db.ts cancelJob
    expect(JOB_CANCELLED_ERROR).toBe("job cancelled by user");
  });

  test("shouldPreviewOnFocus: touch then focus -> no preview; next focus with no pointer -> preview; mouse -> preview", () => {
    expect(shouldPreviewOnFocus("touch")).toBe(false);
    expect(shouldPreviewOnFocus(null)).toBe(true);
    expect(shouldPreviewOnFocus("mouse")).toBe(true);
  });

  test("shouldRetryMedia retries with bounded backoff (1s, 2s, 4s, 8s; then stop) when settled job has fewer items than completed media events", () => {
    expect(
      shouldRetryMedia({
        status: "complete",
        completeEvents: 1,
        items: 0,
        attempt: 0,
      }),
    ).toBe(true);
    expect(
      shouldRetryMedia({
        status: "complete",
        completeEvents: 1,
        items: 0,
        attempt: 3,
      }),
    ).toBe(true);
    expect(
      shouldRetryMedia({
        status: "complete",
        completeEvents: 1,
        items: 0,
        attempt: 4,
      }),
    ).toBe(false);
    expect(
      shouldRetryMedia({
        status: "complete",
        completeEvents: 1,
        items: 1,
        attempt: 0,
      }),
    ).toBe(false);
    expect(
      shouldRetryMedia({
        status: "complete",
        completeEvents: 2,
        items: 1,
        attempt: 0,
      }),
    ).toBe(true);
    expect(
      shouldRetryMedia({
        status: "failed",
        completeEvents: 1,
        items: 0,
        attempt: 0,
      }),
    ).toBe(true);
    expect(
      shouldRetryMedia({
        status: "cancelled",
        completeEvents: 1,
        items: 0,
        attempt: 0,
      }),
    ).toBe(true);
    expect(
      shouldRetryMedia({
        status: "active",
        completeEvents: 1,
        items: 0,
        attempt: 0,
      }),
    ).toBe(false);
    expect(
      shouldRetryMedia({
        status: "complete",
        completeEvents: 0,
        items: 0,
        attempt: 0,
      }),
    ).toBe(false);
  });
});
