import { afterEach, describe, expect, test } from "bun:test";
import {
  ApiError,
  apiGet,
  apiSend,
  getAssetPath,
  mediaUrl,
  parseApiError,
} from "./api-client";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("mediaUrl", () => {
  test("protocol-relative filename goes through getAssetPath, not raw filename", () => {
    const url = mediaUrl({
      filename: "//evil.example/x.png",
      subfolder: "",
      mediaType: "image",
    });
    expect(url).toBe(getAssetPath("", "//evil.example/x.png"));
    expect(url).not.toBe("//evil.example/x.png");
  });

  test("uses explicit src when provided", () => {
    const url = mediaUrl({
      filename: "a.png",
      subfolder: "",
      mediaType: "image",
      src: "data:image/png;base64,AAAA",
    });
    expect(url).toBe("data:image/png;base64,AAAA");
  });
});

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
  test("zod issue with path ['constructor'] reports that field", () => {
    const issues = [{ code: "custom", path: ["constructor"], message: "Bad" }];
    const body = JSON.stringify({ success: false, error: { issues } });
    const out = parseApiError(400, body);
    expect(out.message).toBe("Bad");
    expect(out.fields).toEqual({ constructor: "Bad" });
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

describe("apiGet and apiSend", () => {
  test("apiGet rethrows AbortError without wrapping in ApiError", async () => {
    globalThis.fetch = (async () => {
      throw new DOMException("aborted", "AbortError");
    }) as unknown as typeof fetch;

    let caught: unknown;
    try {
      await apiGet("/x");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect((caught as Error).name).toBe("AbortError");
    expect(caught).not.toBeInstanceOf(ApiError);
  });

  test("apiGet wraps network TypeError in ApiError(0, 'Cannot reach the server')", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    let caught: unknown;
    try {
      await apiGet("/x");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(0);
    expect((caught as ApiError).message).toBe("Cannot reach the server");
  });

  test("apiGet wraps invalid JSON on 200 in ApiError(200, 'Unexpected response from the server')", async () => {
    globalThis.fetch = (async () =>
      new Response("not json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;

    let caught: unknown;
    try {
      await apiGet("/x");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(200);
    expect((caught as ApiError).message).toBe(
      "Unexpected response from the server",
    );
  });

  test("apiGet rejects with ApiError(200, 'Unexpected response from the server') for HTML body", async () => {
    globalThis.fetch = (async () =>
      new Response("<!doctype html><html></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })) as unknown as typeof fetch;

    let caught: unknown;
    try {
      await apiGet("/x");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(200);
    expect((caught as ApiError).message).toBe(
      "Unexpected response from the server",
    );
  });

  test("apiGet resolves undefined for 204 and empty 200, and parses JSON without JSON content-type", async () => {
    globalThis.fetch = (async () =>
      new Response(null, { status: 204 })) as unknown as typeof fetch;
    expect(await apiGet("/x")).toBeUndefined();

    globalThis.fetch = (async () =>
      new Response("", { status: 200 })) as unknown as typeof fetch;
    expect(await apiGet("/x")).toBeUndefined();

    globalThis.fetch = (async () =>
      new Response('{"ok":true}', { status: 200 })) as unknown as typeof fetch;
    expect(await apiGet<{ ok: boolean }>("/x")).toEqual({ ok: true });
  });

  test("apiSend rejects with ApiError status, message and fields on 400", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: "Prompt is required",
          fields: { prompt: "Prompt is required" },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      )) as unknown as typeof fetch;

    let caught: unknown;
    try {
      await apiSend("POST", "/x", { a: 1 });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(400);
    expect((caught as ApiError).message).toBe("Prompt is required");
    expect((caught as ApiError).fields).toEqual({
      prompt: "Prompt is required",
    });
  });
});
