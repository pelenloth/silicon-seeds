import { mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import { Metadata } from "../meta/meta";

export const ALLOWED_REFERENCE_AUDIO_EXTENSIONS = new Set([
  ".flac",
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
]);

export const MAX_REFERENCE_AUDIO_BYTES = 50 * 1024 * 1024;

export class ReferenceAudioValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "ReferenceAudioValidationError";
  }
}

export function validateReferenceAudioFile(file: File): string {
  if (!file || typeof file.size !== "number" || file.size <= 0) {
    throw new ReferenceAudioValidationError("Reference audio file is empty");
  }
  if (file.size > MAX_REFERENCE_AUDIO_BYTES) {
    throw new ReferenceAudioValidationError(
      "Reference audio file must be at most 50 MB",
    );
  }
  const ext = extname(file.name || "").toLowerCase();
  if (!ALLOWED_REFERENCE_AUDIO_EXTENSIONS.has(ext)) {
    throw new ReferenceAudioValidationError(
      "Unsupported reference audio format. Allowed: .flac, .mp3, .wav, .ogg, .m4a",
    );
  }
  return ext;
}

export async function stageReferenceAudioUpload(opts: {
  file: File;
  jobId: string;
  outputDir?: string;
}): Promise<{ relativePath: string; comfyInputFilename: string }> {
  const ext = validateReferenceAudioFile(opts.file);
  const rootOutput = (opts.outputDir ?? Bun.env.OUTPUT_DIR ?? "").replace(
    /\/+$/,
    "",
  );
  if (!rootOutput) {
    throw new Error("OUTPUT_DIR environment variable is not configured");
  }

  const uploadsDir = join(rootOutput, "uploads");
  mkdirSync(uploadsDir, { recursive: true });

  const safeJob = opts.jobId.replace(/[^a-zA-Z0-9_-]/g, "");
  const comfyInputFilename = `ref_${safeJob}_${Metadata.randomId()}${ext}`;
  const relativePath = `uploads/${comfyInputFilename}`;
  const fullPath = join(rootOutput, relativePath);

  const bytes = await opts.file.arrayBuffer();
  await Bun.write(fullPath, bytes);

  return { relativePath, comfyInputFilename };
}

export async function copyReferenceAudioToInputDir(opts: {
  relativePath: string;
  comfyInputFilename: string;
  outputDir?: string;
  inputDir?: string;
}): Promise<void> {
  const rootOutput = (opts.outputDir ?? Bun.env.OUTPUT_DIR ?? "").replace(
    /\/+$/,
    "",
  );
  const rootInput = (opts.inputDir ?? Bun.env.INPUT_DIR ?? "").replace(
    /\/+$/,
    "",
  );
  if (!rootOutput || !rootInput) {
    throw new Error("OUTPUT_DIR and INPUT_DIR must be configured");
  }

  mkdirSync(rootInput, { recursive: true });
  const src = join(rootOutput, opts.relativePath.replace(/^\/+/, ""));
  const dst = join(rootInput, opts.comfyInputFilename);
  const buf = await Bun.file(src).arrayBuffer();
  await Bun.write(dst, buf);
}
