import { createHash } from "node:crypto";
import path from "node:path";

export const THUMB_VERSION = 2;
export const THUMB_WIDTHS = [96, 320, 640] as const;
export type ThumbWidth = (typeof THUMB_WIDTHS)[number];

const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "avif",
  "bmp",
]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "mkv"]);

/** Smallest allowed width that covers the request; 320 for missing/invalid input; 640 above 640. */
export function clampThumbWidth(
  raw: string | number | null | undefined,
): ThumbWidth {
  if (raw === null || raw === undefined || raw === "") return 320;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 320;
  for (const w of THUMB_WIDTHS) {
    if (w >= n) return w;
  }
  return 640;
}

/** "image" | "video" by file extension (case-insensitive), null for audio and everything else. */
export function thumbKind(filename: string): "image" | "video" | null {
  const dot = filename.lastIndexOf(".");
  if (dot < 0 || dot === filename.length - 1) return null;
  const ext = filename.slice(dot + 1).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return "image";
  if (VIDEO_EXTS.has(ext)) return "video";
  return null;
}

/** Absolute path of relPath inside outputDir, or null when relPath is empty, absolute, contains a NUL byte, or escapes outputDir after normalisation. */
export function resolveMediaPath(
  outputDir: string,
  relPath: string,
): string | null {
  if (
    !outputDir ||
    !relPath ||
    relPath.includes("\0") ||
    path.isAbsolute(relPath)
  ) {
    return null;
  }
  const root = path.resolve(outputDir);
  const abs = path.resolve(root, relPath);
  const prefix = root === path.sep ? path.sep : root + path.sep;
  if (abs !== root && abs.startsWith(prefix)) {
    return abs;
  }
  return null;
}

/** `${cacheDir}/${first 32 hex chars of sha1(`${version}|${absPath}|${size}|${mtimeMs}`)}-${width}.jpg` */
export function thumbCacheFile(
  cacheDir: string,
  absPath: string,
  size: number,
  mtimeMs: number,
  width: ThumbWidth,
  version: number = THUMB_VERSION,
): string {
  const hash = createHash("sha1")
    .update(`${version}|${absPath}|${size}|${mtimeMs}`)
    .digest("hex")
    .slice(0, 32);
  return path.join(cacheDir, `${hash}-${width}.jpg`);
}

/** ffmpeg arguments (without the binary name) producing one downscaled JPEG frame. */
export function ffmpegThumbArgs(
  input: string,
  output: string,
  width: ThumbWidth,
  kind: "image" | "video",
): string[] {
  const vf =
    kind === "video"
      ? `thumbnail=48,scale='min(${width},iw)':-2`
      : `scale='min(${width},iw)':-2`;
  return [
    "-v",
    "error",
    "-y",
    "-protocol_whitelist",
    "file",
    "-i",
    input,
    "-frames:v",
    "1",
    "-vf",
    vf,
    "-q:v",
    "5",
    output,
  ];
}
