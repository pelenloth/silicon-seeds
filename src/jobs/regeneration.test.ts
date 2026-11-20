import { describe, expect, test } from "bun:test";
import { videoDerivativeIds } from "./regeneration";

const events = [
  { id: "clip0", type: "new_video_prompt", index: 0 },
  { id: "clip1", type: "new_video_prompt", index: 1 },
  { id: "clip2", type: "new_video_prompt", index: 2 },
  { id: "tr0", type: "new_transition_prompt", index: 0 },
  { id: "tr1", type: "new_transition_prompt", index: 1 },
  { id: "comp", type: "new_video_composition" },
];

describe("videoDerivativeIds", () => {
  test("continuation: regenerating a clip drops every later clip", () => {
    const ids = videoDerivativeIds(
      events,
      "clip1",
      JSON.stringify({
        sequence_mode: "continuation",
        sequence_prompts: ["a", "b", "c"],
      }),
    );
    expect(ids).toContain("clip2");
    expect(ids).toContain("comp");
    expect(ids).not.toContain("clip0");
    expect(ids).not.toContain("clip1");
  });

  test("continuation: regenerating the first clip drops all later clips", () => {
    const ids = videoDerivativeIds(
      events,
      "clip0",
      JSON.stringify({ sequence_mode: "continuation" }),
    );
    expect(ids.sort()).toEqual(["clip1", "clip2", "comp", "tr0"].sort());
  });

  test("non-continuation jobs keep sibling clips and drop adjacent transitions", () => {
    const ids = videoDerivativeIds(
      events,
      "clip1",
      JSON.stringify({ sequence_mode: "transition" }),
    );
    expect(ids.sort()).toEqual(["comp", "tr0", "tr1"].sort());
    expect(videoDerivativeIds(events, "clip1", null).sort()).toEqual(
      ["comp", "tr0", "tr1"].sort(),
    );
  });
});
