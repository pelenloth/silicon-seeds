import { describe, expect, test } from "bun:test";
import {
  clampThumbWidth,
  ffmpegThumbArgs,
  resolveMediaPath,
  THUMB_VERSION,
  THUMB_WIDTHS,
  thumbCacheFile,
  thumbKind,
} from "./thumbs";

describe("clampThumbWidth", () => {
  test("picks the smallest allowed width that covers the request", () => {
    expect(clampThumbWidth("96")).toBe(96);
    expect(clampThumbWidth(40)).toBe(96);
    expect(clampThumbWidth("200")).toBe(320);
    expect(clampThumbWidth(320)).toBe(320);
    expect(clampThumbWidth("321")).toBe(640);
    expect(clampThumbWidth("5000")).toBe(640);
  });
  test("falls back to 320 for missing or invalid input", () => {
    for (const v of [
      undefined,
      null,
      "",
      "abc",
      "-5",
      "0",
      "NaN",
      Number.NaN,
    ]) {
      expect(clampThumbWidth(v)).toBe(320);
    }
  });
  test("only ever returns an allowed width", () => {
    for (const v of [1, 95, 96, 97, 319, 320, 321, 639, 640, 641, 99999]) {
      expect(THUMB_WIDTHS).toContain(clampThumbWidth(v));
    }
  });
});

describe("thumbKind", () => {
  test("images and videos by extension, case-insensitive", () => {
    for (const f of [
      "a.png",
      "a.JPG",
      "a.jpeg",
      "a.webp",
      "a.gif",
      "a.avif",
      "a.bmp",
    ])
      expect(thumbKind(f)).toBe("image");
    for (const f of ["a.mp4", "a.WEBM", "a.mov", "a.mkv"])
      expect(thumbKind(f)).toBe("video");
  });
  test("audio and unknown files have no thumbnail", () => {
    for (const f of ["a.mp3", "a.wav", "a.flac", "a.txt", "a", "a.png.txt", ""])
      expect(thumbKind(f)).toBeNull();
  });
});

describe("resolveMediaPath", () => {
  const root = "/data/out";
  test("joins plain and nested paths", () => {
    expect(resolveMediaPath(root, "a.png")).toBe("/data/out/a.png");
    expect(resolveMediaPath(root, "sub/dir/a.png")).toBe(
      "/data/out/sub/dir/a.png",
    );
  });
  test("inner dot segments that stay inside are normalised", () => {
    expect(resolveMediaPath(root, "sub/../a.png")).toBe("/data/out/a.png");
  });
  test("preserves backslashes as literal filename characters", () => {
    expect(resolveMediaPath(root, "sub\\a.png")).toBe("/data/out/sub\\a.png");
    expect(resolveMediaPath(root, "..\\secret.png")).toBe(
      "/data/out/..\\secret.png",
    );
  });
  test("rejects traversal, absolute relPath, empty input and NUL bytes", () => {
    for (const p of [
      "",
      "/",
      "/a.png",
      "/data/out/a.png",
      "..",
      "../secret.png",
      "a/../../secret.png",
      "sub/../../out2/a.png",
      "a/\0b.png",
    ]) {
      expect(resolveMediaPath(root, p)).toBeNull();
    }
  });
  test("a sibling directory sharing the prefix is not inside the root", () => {
    expect(resolveMediaPath(root, "../out-evil/a.png")).toBeNull();
  });
  test("an empty output directory never resolves", () => {
    expect(resolveMediaPath("", "a.png")).toBeNull();
  });
});

describe("normalizeRelPath", () => {
  test("strips leading slashes, decodes once, and rejects malformed percent-encoding", async () => {
    const { normalizeRelPath } = await import("./thumbs");
    expect(normalizeRelPath("x.png")).toBe("x.png");
    expect(normalizeRelPath("/x.png")).toBe("x.png");
    expect(normalizeRelPath("//x.png")).toBe("x.png");
    expect(normalizeRelPath("a%20b.png")).toBe("a b.png");
    expect(normalizeRelPath("%E0%A4%A")).toBeNull();

    const traversal = normalizeRelPath("..%2Fx");
    expect(traversal).toBe("../x");
    expect(resolveMediaPath("/data/out", traversal!)).toBeNull();

    const encodedSlashes = normalizeRelPath("%2F%2Fetc/passwd");
    expect(encodedSlashes).toBe("etc/passwd");
    const resolved = resolveMediaPath("/data/out", encodedSlashes!);
    expect(resolved).toBe("/data/out/etc/passwd");
    expect(resolved?.startsWith("/data/out/")).toBe(true);
  });
});

describe("thumbCacheFile", () => {
  test("is deterministic and width-specific", () => {
    expect(THUMB_VERSION).toBe(2);
    const a = thumbCacheFile("/cache", "/data/out/a.png", 100, 5, 320);
    expect(a).toMatch(/^\/cache\/[0-9a-f]{32}-320\.jpg$/);
    expect(thumbCacheFile("/cache", "/data/out/a.png", 100, 5, 320)).toBe(a);
    expect(thumbCacheFile("/cache", "/data/out/a.png", 100, 5, 96)).toBe(
      a.replace("-320.jpg", "-96.jpg"),
    );
  });
  test("changes when the file or version changes", () => {
    const a = thumbCacheFile("/cache", "/data/out/a.png", 100, 5, 320);
    expect(thumbCacheFile("/cache", "/data/out/a.png", 101, 5, 320)).not.toBe(
      a,
    );
    expect(thumbCacheFile("/cache", "/data/out/a.png", 100, 6, 320)).not.toBe(
      a,
    );
    expect(thumbCacheFile("/cache", "/data/out/b.png", 100, 5, 320)).not.toBe(
      a,
    );
    expect(
      thumbCacheFile("/cache", "/data/out/a.png", 100, 5, 320, 1),
    ).not.toBe(a);
    expect(
      thumbCacheFile("/cache", "/data/out/a.png", 100, 5, 320, THUMB_VERSION),
    ).toBe(a);
  });
});

describe("ffmpegThumbArgs", () => {
  test("image: protocol whitelist before -i, downscale-only JPEG frame, no hardware acceleration", () => {
    const args = ffmpegThumbArgs("/in/a.png", "/c/x.jpg", 320, "image");
    expect(args).toEqual([
      "-v",
      "error",
      "-y",
      "-protocol_whitelist",
      "file",
      "-i",
      "/in/a.png",
      "-frames:v",
      "1",
      "-vf",
      "scale='min(320,iw)':-2",
      "-q:v",
      "5",
      "/c/x.jpg",
    ]);
    expect(args.join(" ")).not.toMatch(/hwaccel|cuda|nvenc|vaapi/);
  });

  test("video: uses thumbnail=48 filter before scale to skip flat gray opening frames", () => {
    const args = ffmpegThumbArgs("/in/a.mp4", "/c/x.jpg", 640, "video");
    expect(args).toEqual([
      "-v",
      "error",
      "-y",
      "-protocol_whitelist",
      "file",
      "-i",
      "/in/a.mp4",
      "-frames:v",
      "1",
      "-vf",
      "thumbnail=48,scale='min(640,iw)':-2",
      "-q:v",
      "5",
      "/c/x.jpg",
    ]);
    expect(args.join(" ")).not.toMatch(/hwaccel|cuda|nvenc|vaapi/);
  });
});
