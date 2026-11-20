import { describe, expect, test } from "bun:test";

describe("POST /api/jobs/videos MiniMax H3", () => {
  test("accepts minimax-h3 up to 15s and 768p resolution, rejects >10s for wan2.2", async () => {
    const { PostTextToVideoSchema } = await import("./schemas");

    const badWan = PostTextToVideoSchema.safeParse({
      prompt: "ocean waves",
      resolution: "720p",
      video_model: "wan2.2",
      fps: 24,
      clip_duration: 14,
    });
    expect(badWan.success).toBe(false);

    const goodH3 = PostTextToVideoSchema.safeParse({
      prompt: "ocean waves",
      resolution: "768p",
      video_model: "minimax-h3",
      fps: 24,
      clip_duration: 14,
      h3_mode: "t2v",
      h3_variant: "turbo_8",
      soundscape: "Crashing surf and seagulls",
      style_embedding: "storm_magic",
      sequence_mode: "continuation",
      sequence_prompts: JSON.stringify(["Clip 1 surf", "Clip 2 lightning"]),
    });
    expect(goodH3.success).toBe(true);
    if (goodH3.success) {
      expect(goodH3.data.sequence_prompts).toEqual([
        "Clip 1 surf",
        "Clip 2 lightning",
      ]);
    }
  });

  const png = (name: string) =>
    new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, {
      type: "image/png",
    });
  const h3Base = {
    prompt: "hero shot",
    resolution: "768p",
    video_model: "minimax-h3",
    fps: 24,
    clip_duration: 5,
  };

  test("accepts keyframe guides pinned to the final frame (frameIdx -1)", async () => {
    const { PostTextToVideoSchema } = await import("./schemas");
    const res = PostTextToVideoSchema.safeParse({
      ...h3Base,
      h3_mode: "multiframe",
      reference_images: [png("a.png"), png("b.png")],
      keyframe_guides: JSON.stringify([
        { refIndex: 0, frameIdx: 0 },
        { refIndex: 1, frameIdx: -1 },
      ]),
    });
    expect(res.success).toBe(true);
  });

  test("rejects i2v without a first_frame", async () => {
    const { PostTextToVideoSchema } = await import("./schemas");
    const res = PostTextToVideoSchema.safeParse({ ...h3Base, h3_mode: "i2v" });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.map((i) => i.path.join("."))).toContain(
        "first_frame",
      );
    }
    expect(
      PostTextToVideoSchema.safeParse({
        ...h3Base,
        h3_mode: "i2v",
        first_frame: png("start.png"),
      }).success,
    ).toBe(true);
  });

  test("rejects keyframe guides with out-of-range refIndex or frameIdx", async () => {
    const { PostTextToVideoSchema } = await import("./schemas");
    const badRef = PostTextToVideoSchema.safeParse({
      ...h3Base,
      h3_mode: "multiframe",
      reference_images: [png("a.png")],
      keyframe_guides: JSON.stringify([{ refIndex: 1, frameIdx: 0 }]),
    });
    expect(badRef.success).toBe(false);

    // 5s -> 124 frames, so 124 is one past the last valid index.
    const badFrame = PostTextToVideoSchema.safeParse({
      ...h3Base,
      h3_mode: "multiframe",
      reference_images: [png("a.png")],
      keyframe_guides: JSON.stringify([{ refIndex: 0, frameIdx: 124 }]),
    });
    expect(badFrame.success).toBe(false);
    if (!badFrame.success) {
      expect(badFrame.error.issues.map((i) => i.path.join("."))).toContain(
        "keyframe_guides",
      );
    }

    const lastValid = PostTextToVideoSchema.safeParse({
      ...h3Base,
      h3_mode: "multiframe",
      reference_images: [png("a.png")],
      keyframe_guides: JSON.stringify([{ refIndex: 0, frameIdx: 123 }]),
    });
    expect(lastValid.success).toBe(true);

    const belowMin = PostTextToVideoSchema.safeParse({
      ...h3Base,
      h3_mode: "multiframe",
      reference_images: [png("a.png")],
      keyframe_guides: JSON.stringify([{ refIndex: 0, frameIdx: -2 }]),
    });
    expect(belowMin.success).toBe(false);
  });
});
