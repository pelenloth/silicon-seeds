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
});
