import { describe, expect, test } from "bun:test";
import { buildCommands } from "./palette";
import { documentTitle, pageTitle, routeForPath, ROUTES } from "./routes";

describe("routes", () => {
  test("every sidebar id is unique and the table has the nine visible entries plus hidden /dev/kit", () => {
    expect(ROUTES.filter((r) => !r.hidden).map((r) => r.path)).toEqual([
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
    const devKit = ROUTES.find((r) => r.path === "/dev/kit");
    expect(devKit?.title).toBe("UI kit");
    expect(devKit?.hidden).toBe(true);
    expect(new Set(ROUTES.map((r) => r.sidebarId)).size).toBe(ROUTES.length);
    expect(ROUTES.find((r) => r.path === "/jobs")?.sidebarId).toBe(
      "sidebar-jobs-summary",
    );
  });
  test("routeForPath: exact root, nested job, longest prefix, and /dev/kit", () => {
    expect(routeForPath("/")?.title).toBe("Home");
    expect(routeForPath("/jobs/abc")?.title).toBe("Jobs");
    expect(routeForPath("/create/text-to-video")?.title).toBe("Text to Video");
    expect(routeForPath("/create/video")?.title).toBe("Video");
    expect(routeForPath("/dev/kit")?.title).toBe("UI kit");
    expect(routeForPath("/nope")).toBeUndefined();
  });
  test("titles", () => {
    expect(pageTitle("/gallery")).toBe("Gallery");
    expect(pageTitle("/dev/kit")).toBe("UI kit");
    expect(pageTitle("/nope")).toBe("Not found");
    expect(documentTitle("/gallery", 0)).toBe("Gallery · Silicon Seeds");
    expect(documentTitle("/dev/kit", 0)).toBe("UI kit · Silicon Seeds");
    expect(documentTitle("/jobs/x", 2)).toBe("(2) Jobs · Silicon Seeds");
  });
  test("hidden routes are omitted from palette commands", () => {
    const cmds = buildCommands({
      query: "",
      routes: ROUTES,
      jobs: [],
      themes: [],
      navigate: () => {},
      setTheme: () => {},
    });
    expect(cmds.some((c) => c.label === "UI kit")).toBe(false);
    expect(cmds.some((c) => c.id === "goto-/dev/kit")).toBe(false);
  });
});
