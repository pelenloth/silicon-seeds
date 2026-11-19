import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("ComfyUIClient audio workflow dispatch", () => {
  let tempRoot = "";
  let outputDir = "";
  let inputDir = "";
  const originalFetch = globalThis.fetch;
  let prevOutputDir: string | undefined;
  let prevInputDir: string | undefined;
  let prevComfyBaseUrl: string | undefined;

  beforeEach(() => {
    prevOutputDir = Bun.env.OUTPUT_DIR;
    prevInputDir = Bun.env.INPUT_DIR;
    prevComfyBaseUrl = Bun.env.COMFYUI_BASE_URL;
    tempRoot = mkdtempSync(join(tmpdir(), "ss-comfy-audio-"));
    outputDir = join(tempRoot, "output");
    inputDir = join(tempRoot, "input");
    mkdirSync(join(outputDir, "uploads"), { recursive: true });
    mkdirSync(inputDir, { recursive: true });
    Bun.env.OUTPUT_DIR = outputDir;
    Bun.env.INPUT_DIR = inputDir;
    Bun.env.COMFYUI_BASE_URL = "http://127.0.0.1:8188";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (prevOutputDir === undefined) delete Bun.env.OUTPUT_DIR;
    else Bun.env.OUTPUT_DIR = prevOutputDir;
    if (prevInputDir === undefined) delete Bun.env.INPUT_DIR;
    else Bun.env.INPUT_DIR = prevInputDir;
    if (prevComfyBaseUrl === undefined) delete Bun.env.COMFYUI_BASE_URL;
    else Bun.env.COMFYUI_BASE_URL = prevComfyBaseUrl;
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  });

  test("routes job.audio_model to minimax-music-3 and stages reference audio for yue2", async () => {
    const { ComfyUIClient } = await import("./comfyui-client");
    const client = new ComfyUIClient({ baseUrl: "http://127.0.0.1:8188" });

    const submittedBodies: any[] = [];
    globalThis.fetch = (async (_url: any, init?: RequestInit) => {
      submittedBodies.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ prompt_id: "pid-1" }), {
        status: 200,
      });
    }) as any;

    await client.generate(
      {
        id: "evt-mm-1",
        kind: "text-to-song",
        prompt: "Overview: Indie Soul.",
        duration: 120,
        lyrics: "[Verse]\nTest",
        settings: { tiled_decode: true },
      },
      {
        id: "job-mm-1",
        created_at: new Date().toISOString(),
        status: "active" as any,
        name: "mm-job",
        audio_model: "minimax-music-3",
      },
    );

    expect(submittedBodies[0].prompt["13"].class_type).toBe(
      "MiniMaxMusic3TextEncode",
    );

    // Stage reference audio and test YuE2 copy into INPUT_DIR
    const refRel = "uploads/ref_job-yue_test.flac";
    await Bun.write(join(outputDir, refRel), new Uint8Array([1, 2, 3, 4]));

    await client.generate(
      {
        id: "evt-yue-1",
        kind: "text-to-song",
        prompt: "Genre: Pop.",
        duration: 90,
        lyrics: "[Verse]\nCover",
        settings: {
          reference_audio_path: refRel,
          reference_audio_filename: "ref_job-yue_test.flac",
        },
      },
      {
        id: "job-yue-1",
        created_at: new Date().toISOString(),
        status: "active" as any,
        name: "yue-job",
        audio_model: "yue2",
      },
    );

    expect(submittedBodies[1].prompt["41"].class_type).toBe(
      "SheetSage2AudioToABC",
    );
    expect(
      await Bun.file(join(inputDir, "ref_job-yue_test.flac")).exists(),
    ).toBe(true);
  });
});
