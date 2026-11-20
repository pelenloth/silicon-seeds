import { existsSync, mkdirSync } from "node:fs";
import { basename, extname, resolve, sep } from "node:path";

export const ALLOWED_REFERENCE_IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
] as const;

export const MAX_REFERENCE_IMAGE_BYTES = 20 * 1024 * 1024;

export class ReferenceImageValidationError extends Error {
  /** Form field the error belongs to, for `{ error, fields }` responses. */
  readonly field: string;

  constructor(message: string, field = "reference_images") {
    super(message);
    this.name = "ReferenceImageValidationError";
    this.field = field;
  }
}

function fieldForSlot(slot: string): string {
  return slot === "first_frame" || slot === "last_frame"
    ? slot
    : "reference_images";
}

function sanitizeToken(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

function assertWithinRoot(
  rootDir: string,
  candidatePath: string,
  label: string,
) {
  const resolvedRoot = resolve(rootDir);
  const resolvedTarget = resolve(candidatePath);
  if (
    resolvedTarget !== resolvedRoot &&
    !resolvedTarget.startsWith(`${resolvedRoot}${sep}`)
  ) {
    throw new Error(`Invalid ${label} path (escapes ${label} directory)`);
  }
  return resolvedTarget;
}

export async function saveUploadedReferenceImage(
  file: File,
  opts: {
    jobId: string;
    slot: string;
    outputDir?: string;
  },
): Promise<{
  relativePath: string;
  comfyInputFilename: string;
}> {
  const field = fieldForSlot(opts.slot);
  if (!(file instanceof File) || file.size <= 0) {
    throw new ReferenceImageValidationError(
      "Reference image file is empty",
      field,
    );
  }
  if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
    throw new ReferenceImageValidationError(
      "Reference image exceeds 20 MB limit",
      field,
    );
  }

  const ext = extname(file.name || "").toLowerCase();
  if (
    !(ALLOWED_REFERENCE_IMAGE_EXTENSIONS as readonly string[]).includes(ext)
  ) {
    throw new ReferenceImageValidationError(
      `Unsupported image format '${ext || "unknown"}'. Allowed: PNG, JPG, JPEG, WEBP.`,
      field,
    );
  }

  const outputDir = opts.outputDir ?? Bun.env.OUTPUT_DIR;
  if (!outputDir) {
    throw new Error("OUTPUT_DIR environment variable is not configured");
  }

  const safeJob = sanitizeToken(opts.jobId);
  const safeSlot = sanitizeToken(opts.slot);
  const relativePath = `reference_images/${safeJob}_${safeSlot}${ext}`;
  const comfyInputFilename = `refimg_${safeJob}_${safeSlot}${ext}`;

  const dest = assertWithinRoot(
    outputDir,
    resolve(outputDir, relativePath),
    "output",
  );
  mkdirSync(resolve(outputDir, "reference_images"), { recursive: true });
  await Bun.write(dest, await file.arrayBuffer());

  return { relativePath, comfyInputFilename };
}

export async function copyReferenceImageToInputDir(opts: {
  relativePath: string;
  comfyInputFilename: string;
  outputDir?: string;
  inputDir?: string;
}): Promise<string> {
  const outputDir = opts.outputDir ?? Bun.env.OUTPUT_DIR;
  const inputDir = opts.inputDir ?? Bun.env.INPUT_DIR;
  if (!outputDir || !inputDir) {
    throw new Error("OUTPUT_DIR / INPUT_DIR environment variables not set");
  }

  const safeOutPath = assertWithinRoot(
    outputDir,
    resolve(outputDir, opts.relativePath),
    "output",
  );
  const cleanName = basename(opts.comfyInputFilename);
  if (!cleanName || cleanName !== opts.comfyInputFilename) {
    throw new Error("Invalid ComfyUI input filename");
  }
  const safeInPath = assertWithinRoot(
    inputDir,
    resolve(inputDir, cleanName),
    "input",
  );

  mkdirSync(resolve(inputDir), { recursive: true });
  const bytes = await Bun.file(safeOutPath).arrayBuffer();
  await Bun.write(safeInPath, bytes);
  return safeInPath;
}

export async function stageVideoInputImages(opts: {
  filenames: readonly string[];
  stagedPaths?: Readonly<Record<string, string>>;
  outputDir?: string;
  inputDir?: string;
  contentLibraryDir?: string;
}): Promise<void> {
  const outputDir = opts.outputDir ?? Bun.env.OUTPUT_DIR;
  const inputDir = opts.inputDir ?? Bun.env.INPUT_DIR;
  const contentDir = opts.contentLibraryDir ?? Bun.env.CONTENT_LIBRARY_DIR;
  if (!inputDir) {
    throw new Error("INPUT_DIR environment variable is not configured");
  }
  mkdirSync(resolve(inputDir), { recursive: true });

  for (const rawName of opts.filenames) {
    const cleanName = basename(rawName.trim());
    if (!cleanName || cleanName !== rawName.trim()) {
      throw new Error(`Unsafe input image filename: ${rawName}`);
    }
    const targetPath = assertWithinRoot(
      inputDir,
      resolve(inputDir, cleanName),
      "input",
    );
    if (existsSync(targetPath)) {
      continue;
    }

    const mappedRel = opts.stagedPaths?.[cleanName];
    if (mappedRel && outputDir) {
      await copyReferenceImageToInputDir({
        relativePath: mappedRel,
        comfyInputFilename: cleanName,
        outputDir,
        inputDir,
      });
      continue;
    }

    const candidates: string[] = [];
    if (outputDir) {
      candidates.push(
        assertWithinRoot(outputDir, resolve(outputDir, cleanName), "output"),
      );
      // Uploaded references persist as reference_images/<job>_<slot>.<ext>
      // and are staged as refimg_<job>_<slot>.<ext>.
      for (const refName of new Set([
        cleanName,
        cleanName.replace(/^refimg_/, ""),
      ])) {
        candidates.push(
          assertWithinRoot(
            outputDir,
            resolve(outputDir, "reference_images", refName),
            "output",
          ),
        );
      }
    }
    if (contentDir) {
      candidates.push(
        assertWithinRoot(
          contentDir,
          resolve(contentDir, "image", cleanName),
          "content",
        ),
      );
    }

    const existingSrc = candidates.find((p) => existsSync(p));
    if (!existingSrc) {
      throw new ReferenceImageValidationError(
        `Input image '${cleanName}' not found in INPUT_DIR, OUTPUT_DIR, or gallery`,
      );
    }
    await Bun.write(targetPath, await Bun.file(existingSrc).arrayBuffer());
  }
}
