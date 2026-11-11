import { describe, expect, test } from "bun:test";
import { documentTitle, pageTitle, routeForPath, ROUTES } from "./routes";

describe("routes", () => {
  test("every sidebar id is unique and the table has the nine entries", () => {
    expect(ROUTES.map((r) => r.path)).toEqual([
      "/",
      "/jobs",
      "/gallery",
      "/create/image",
      "/create/video",
      "/create/text-to-video",
      "/create/audio",
      "/compose",
      "/settings",
    ]);
    expect(new Set(ROUTES.map((r) => r.sidebarId)).size).toBe(ROUTES.length);
    expect(ROUTES.find((r) => r.path === "/jobs")?.sidebarId).toBe(
      "sidebar-jobs-summary",
    );
  });
  test("routeForPath: exact root, nested job, longest prefix", () => {
    expect(routeForPath("/")?.title).toBe("Home");
    expect(routeForPath("/jobs/abc")?.title).toBe("Jobs");
    expect(routeForPath("/create/text-to-video")?.title).toBe("Text to Video");
    expect(routeForPath("/create/video")?.title).toBe("Video");
    expect(routeForPath("/nope")).toBeUndefined();
  });
  test("titles", () => {
    expect(pageTitle("/gallery")).toBe("Gallery");
    expect(pageTitle("/nope")).toBe("Not found");
    expect(documentTitle("/gallery", 0)).toBe("Gallery · Silicon Seeds");
    expect(documentTitle("/jobs/x", 2)).toBe("(2) Jobs · Silicon Seeds");
  });
});
