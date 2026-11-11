import { describe, expect, test } from "bun:test";
import { formatZodIssues } from "./validation";

describe("formatZodIssues", () => {
  test("first issue becomes the error, each path gets a field message", () => {
    const out = formatZodIssues([
      { path: ["prompt"], message: "Prompt is required" },
      { path: ["fps"], message: "Too big" },
    ]);
    expect(out.error).toBe("Prompt is required");
    expect(out.fields).toEqual({
      prompt: "Prompt is required",
      fps: "Too big",
    });
  });
  test("keeps the first message per field and joins nested paths with dots", () => {
    const out = formatZodIssues([
      { path: ["loras", 0, "strength"], message: "Too small" },
      { path: ["loras", 0, "strength"], message: "Second" },
    ]);
    expect(out.fields).toEqual({ "loras.0.strength": "Too small" });
  });
  test("path-less issues only set the error; empty input has a generic error", () => {
    expect(
      formatZodIssues([
        { path: [], message: "Either script or script_file must be provided" },
      ]),
    ).toEqual({
      error: "Either script or script_file must be provided",
      fields: {},
    });
    expect(formatZodIssues([])).toEqual({
      error: "Invalid request",
      fields: {},
    });
  });
});
