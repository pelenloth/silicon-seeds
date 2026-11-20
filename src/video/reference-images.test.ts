import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  copyReferenceImageToInputDir,
  ReferenceImageValidationError,
  saveUploadedReferenceImage,
  stageVideoInputImages,
} from "./reference-images";

const tempDirs: string[] = [];
function makeTmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), "ref-img-test-"));
  tempDirs.push(d);
  return d;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

// Minimal valid PNG header + IEND
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
]);

describe("reference-images staging", () => {
  test("saves uploaded PNG to OUTPUT_DIR/reference_images and stages to INPUT_DIR", async () => {
    const outDir = makeTmpDir();
    const inDir = makeTmpDir();
    const file = new File([PNG_BYTES], "hero_pose.png", { type: "image/png" });

    const saved = await saveUploadedReferenceImage(file, {
      jobId: "job_123",
      slot: "ref_0",
      outputDir: outDir,
    });

    expect(saved.relativePath).toBe("reference_images/job_123_ref_0.png");
    expect(saved.comfyInputFilename).toBe("refimg_job_123_ref_0.png");
    expect(existsSync(join(outDir, saved.relativePath))).toBe(true);

    const copied = await copyReferenceImageToInputDir({
      relativePath: saved.relativePath,
      comfyInputFilename: saved.comfyInputFilename,
      outputDir: outDir,
      inputDir: inDir,
    });
    expect(existsSync(copied)).toBe(true);
  });

  test("rejects unsupported extensions, empty files, and path traversal", async () => {
    const outDir = makeTmpDir();
    const inDir = makeTmpDir();

    const badExt = new File([PNG_BYTES], "malware.exe", {
      type: "application/octet-stream",
    });
    await expect(
      saveUploadedReferenceImage(badExt, {
        jobId: "job_1",
        slot: "first",
        outputDir: outDir,
      }),
    ).rejects.toBeInstanceOf(ReferenceImageValidationError);

    const empty = new File([new Uint8Array(0)], "empty.png", {
      type: "image/png",
    });
    await expect(
      saveUploadedReferenceImage(empty, {
        jobId: "job_1",
        slot: "first",
        outputDir: outDir,
      }),
    ).rejects.toBeInstanceOf(ReferenceImageValidationError);

    await expect(
      copyReferenceImageToInputDir({
        relativePath: "../etc/passwd",
        comfyInputFilename: "evil.png",
        outputDir: outDir,
        inputDir: inDir,
      }),
    ).rejects.toThrow(/escapes output directory/);
  });

  test("stageVideoInputImages resolves gallery filenames or staged paths into INPUT_DIR", async () => {
    const outDir = makeTmpDir();
    const inDir = makeTmpDir();
    await Bun.write(join(outDir, "gallery_shot.png"), PNG_BYTES);

    await stageVideoInputImages({
      filenames: ["gallery_shot.png"],
      outputDir: outDir,
      inputDir: inDir,
    });
    expect(existsSync(join(inDir, "gallery_shot.png"))).toBe(true);
  });

  test("re-stages a saved refimg_* from OUTPUT_DIR/reference_images after INPUT_DIR is wiped", async () => {
    const outDir = makeTmpDir();
    const inDir = makeTmpDir();
    const contentDir = makeTmpDir();
    const file = new File([PNG_BYTES], "hero.png", { type: "image/png" });
    const saved = await saveUploadedReferenceImage(file, {
      jobId: "job_9",
      slot: "ref_1",
      outputDir: outDir,
    });
    const staged = await copyReferenceImageToInputDir({
      relativePath: saved.relativePath,
      comfyInputFilename: saved.comfyInputFilename,
      outputDir: outDir,
      inputDir: inDir,
    });
    rmSync(staged);
    expect(existsSync(staged)).toBe(false);

    // No stagedPaths mapping: e.g. a regeneration after ComfyUI input cleanup.
    await stageVideoInputImages({
      filenames: [saved.comfyInputFilename],
      outputDir: outDir,
      inputDir: inDir,
      contentLibraryDir: contentDir,
    });
    expect(existsSync(join(inDir, saved.comfyInputFilename))).toBe(true);
  });
});
