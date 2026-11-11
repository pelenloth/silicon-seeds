import { describe, expect, test } from "bun:test";
import { ApiError, parseApiError } from "./api-client";

describe("parseApiError", () => {
  test("our own error shape with fields", () => {
    expect(
      parseApiError(
        400,
        '{"error":"Prompt is required","fields":{"prompt":"Prompt is required"}}',
      ),
    ).toEqual({
      message: "Prompt is required",
      fields: { prompt: "Prompt is required" },
    });
  });
  test("onError shape and plain message", () => {
    expect(
      parseApiError(500, '{"name":"Error","message":"boom"}').message,
    ).toBe("boom");
    expect(
      parseApiError(409, '{"error":"Cancel the job before deleting it"}')
        .message,
    ).toBe("Cancel the job before deleting it");
  });
  test("raw zod validator bodies never leak JSON", () => {
    const issues = [
      { code: "too_small", path: ["prompt"], message: "Prompt is required" },
    ];
    const v4 = JSON.stringify({
      success: false,
      error: { name: "ZodError", message: JSON.stringify(issues) },
    });
    const v3 = JSON.stringify({ success: false, error: { issues } });
    for (const body of [v4, v3]) {
      const out = parseApiError(400, body);
      expect(out.message).toBe("Prompt is required");
      expect(out.fields).toEqual({ prompt: "Prompt is required" });
    }
  });
  test("text, html, empty and oversized bodies", () => {
    expect(parseApiError(404, "Not found").message).toBe("Not found");
    expect(
      parseApiError(502, "<html><body>Bad gateway</body></html>").message,
    ).toBe("Request failed (502)");
    expect(parseApiError(500, "").message).toBe("Request failed (500)");
    expect(
      parseApiError(500, "x".repeat(900)).message.length,
    ).toBeLessThanOrEqual(300);
    expect(parseApiError(500, '{"weird":true}').message).toBe(
      "Request failed (500)",
    );
  });
  test("ApiError carries status and fields", () => {
    const e = new ApiError(400, "Nope", { a: "b" });
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(400);
    expect(e.message).toBe("Nope");
    expect(e.fields).toEqual({ a: "b" });
  });
});
