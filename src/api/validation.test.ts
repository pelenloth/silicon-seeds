import { describe, expect, test } from "bun:test";
import { formatZodIssues, validationHook } from "./validation";

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
  test("handles Object.prototype property names like toString", () => {
    expect(
      formatZodIssues([{ path: ["toString"], message: "Bad" }]).fields,
    ).toEqual({ toString: "Bad" });
  });
});

describe("validationHook", () => {
  const fakeContext = {
    json: (body: unknown, status?: number) =>
      new Response(JSON.stringify(body), {
        status: status ?? 200,
        headers: { "Content-Type": "application/json" },
      }),
  } as unknown as Parameters<typeof validationHook>[1];

  test("returns undefined on success", () => {
    expect(validationHook({ success: true }, fakeContext)).toBeUndefined();
  });

  test("returns a 400 JSON response with formatted issues on failure", async () => {
    const res = validationHook(
      {
        success: false,
        error: {
          issues: [{ path: ["prompt"], message: "Prompt is required" }],
        },
      },
      fakeContext,
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    expect(await res!.json()).toEqual({
      error: "Prompt is required",
      fields: { prompt: "Prompt is required" },
    });
  });
});

describe("PostTextToImageSchema batch_size limit", () => {
  const fakeContext = {
    json: (body: unknown, status?: number) =>
      new Response(JSON.stringify(body), {
        status: status ?? 200,
        headers: { "Content-Type": "application/json" },
      }),
  } as unknown as Parameters<typeof validationHook>[1];

  test("accepts batch_size 16 and rejects 17 with a 400 validation error", async () => {
    const { PostTextToImageSchema } = await import("./schemas");
    const valid16 = PostTextToImageSchema.safeParse({
      prompt: "a fox",
      image_model: "z-image-turbo",
      batch_size: "16",
    });
    expect(valid16.success).toBe(true);
    if (valid16.success) {
      expect(valid16.data.batch_size).toBe(16);
    }

    const invalid17 = PostTextToImageSchema.safeParse({
      prompt: "a fox",
      image_model: "z-image-turbo",
      batch_size: "17",
    });
    expect(invalid17.success).toBe(false);
    if (!invalid17.success) {
      const res = validationHook(
        { success: false, error: invalid17.error },
        fakeContext,
      );
      expect(res).toBeDefined();
      expect(res!.status).toBe(400);
      const body = (await res!.json()) as {
        error: string;
        fields: Record<string, string>;
      };
      expect(body.fields.batch_size).toBeDefined();
    }
  });
});
