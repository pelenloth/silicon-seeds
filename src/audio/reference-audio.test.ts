import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  copyReferenceAudioToInputDir,
  MAX_REFERENCE_AUDIO_BYTES,
  stageReferenceAudioUpload,
  validateReferenceAudioFile,
} from "./reference-audio";

describe("reference-audio staging & validation", () => {
  let tempRoot = "";
  let outputDir = "";
  let inputDir = "";

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "ss-ref-audio-"));
    outputDir = join(tempRoot, "output");
    inputDir = join(tempRoot, "input");
  });

  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  });

  test("rejects empty, unsupported extension, and oversized files", () => {
    const empty = new File([new Uint8Array(0)], "empty.mp3", {
      type: "audio/mpeg",
    });
    expect(() => validateReferenceAudioFile(empty)).toThrow(/empty/i);

    const badExt = new File([new Uint8Array([1, 2, 3])], "malicious.exe", {
      type: "application/octet-stream",
    });
    expect(() => validateReferenceAudioFile(badExt)).toThrow(
      /Unsupported reference audio format/i,
    );

    const fakeHuge = {
      name: "huge.wav",
      size: MAX_REFERENCE_AUDIO_BYTES + 1,
    } as File;
    expect(() => validateReferenceAudioFile(fakeHuge)).toThrow(/50 MB/i);
  });

  test("stages uploaded file to OUTPUT_DIR/uploads and copies basename to INPUT_DIR", async () => {
    const payload = new Uint8Array([0x66, 0x4c, 0x61, 0x43, 1, 2, 3, 4]);
    const file = new File([payload], "My Melody Demo.FLAC", {
      type: "audio/flac",
    });

    const staged = await stageReferenceAudioUpload({
      file,
      jobId: "job-123",
      outputDir,
    });

    expect(staged.relativePath).toMatch(
      /^uploads\/ref_job-123_[a-z0-9-]+\.flac$/,
    );
    expect(staged.comfyInputFilename).toMatch(/^ref_job-123_[a-z0-9-]+\.flac$/);
    expect(await Bun.file(join(outputDir, staged.relativePath)).exists()).toBe(
      true,
    );

    await copyReferenceAudioToInputDir({
      relativePath: staged.relativePath,
      comfyInputFilename: staged.comfyInputFilename,
      outputDir,
      inputDir,
    });

    const copiedBytes = new Uint8Array(
      await Bun.file(join(inputDir, staged.comfyInputFilename)).arrayBuffer(),
    );
    expect(copiedBytes).toEqual(payload);
  });
});
