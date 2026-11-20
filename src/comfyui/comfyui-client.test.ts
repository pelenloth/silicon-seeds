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

describe("ComfyUIClient MiniMax H3 dispatch", () => {
  test("dispatches minimax-h3 T2V, I2V, transition, and multiframe workflows with UI extra_pnginfo", async () => {
    const { ComfyUIClient } = await import("./comfyui-client");
    let postedBody: Record<string, any> | null = null;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      postedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ prompt_id: "h3_evt_1" }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    try {
      const client = new ComfyUIClient({ baseUrl: "http://127.0.0.1:8188" });
      await client.generate(
        {
          id: "h3_evt_1",
          kind: "text-to-video",
          prompt: "Neon Tokyo street at midnight",
          settings: {
            h3_mode: "t2v",
            h3_variant: "turbo_8",
            soundscape: "Rain and footsteps",
          },
        } as any,
        {
          id: "job_h3",
          created_at: new Date().toISOString(),
          status: "active" as any,
          name: "H3 Test",
          video_model: "minimax-h3",
          resolution: "768p",
          clip_duration: 6,
          fps: 24,
        },
      );

      expect(postedBody).not.toBeNull();
      expect(postedBody!.prompt["4"].inputs.unet_name).toBe(
        "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
      );
      expect(postedBody!.prompt["10"].inputs.width).toBe(1344);
      expect(postedBody!.prompt["10"].inputs.height).toBe(768);
      // 6s @ 24 fps = 144 raw frames -> next 17k + 5 = 158
      expect(postedBody!.prompt["10"].inputs.length).toBe(158);
      expect(postedBody!.prompt["10"].inputs.prompt).toContain(
        "soundscape: Rain and footsteps",
      );
      expect(
        postedBody!.extra_data?.extra_pnginfo?.nodes?.length,
      ).toBeGreaterThan(5);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  const h3Job = (overrides: Record<string, unknown> = {}) => ({
    id: "job_h3_dispatch",
    created_at: new Date().toISOString(),
    status: "active" as any,
    name: "H3 Dispatch",
    video_model: "minimax-h3",
    resolution: "768p",
    clip_duration: 5,
    transition_duration: 3,
    fps: 24,
    ...overrides,
  });

  const buildApi = async (input: unknown, job: unknown) => {
    const { ComfyUIClient } = await import("./comfyui-client");
    const client = new ComfyUIClient({ baseUrl: "http://127.0.0.1:8188" });
    return (client as any).buildApi(input, job) as Record<string, any>;
  };

  test("image-to-video in an i2v job builds a first-frame-only fl2va graph", async () => {
    const graph = await buildApi(
      {
        id: "h3_i2v_evt",
        kind: "image-to-video",
        prompt: "Subject turns toward camera",
        imagePath: "start.png",
      },
      h3Job({
        video_settings: JSON.stringify({
          h3_mode: "i2v",
          last_frame: "stray_last.png",
        }),
      }),
    );
    expect(graph["10"].class_type).toBe("MiniMaxH3ImageToVideo");
    expect(graph["9_first"].inputs.image).toBe("start.png");
    expect(graph["10"].inputs.first_frame).toEqual(["9_first", 0]);
    expect(graph["9_last"]).toBeUndefined();
    expect(graph["10"].inputs.last_frame).toBeUndefined();
    expect(graph["10"].inputs.length).toBe(124);
  });

  test("image-to-video in a multiframe job keeps the ref2va reference graph", async () => {
    const graph = await buildApi(
      {
        id: "h3_mf_evt",
        kind: "image-to-video",
        prompt: "<Subject 1> walks forward",
        imagePath: "start.png",
      },
      h3Job({
        video_settings: JSON.stringify({
          h3_mode: "multiframe",
          reference_images: ["refimg_1.png", "refimg_2.png"],
          keyframe_guides: [{ refIndex: 1, frameIdx: -1 }],
        }),
      }),
    );
    expect(graph["10"].class_type).toBe("MiniMaxH3ReferenceToVideo");
    expect(graph["9_ref_0"].inputs.image).toBe("refimg_1.png");
    expect(graph["9_ref_1"].inputs.image).toBe("refimg_2.png");
    expect(graph["11_guide_0"].inputs.frame_idx).toBe(-1);
  });

  test("image-to-transition inside a multiframe sequence job builds fl2va, not ref2va", async () => {
    const graph = await buildApi(
      {
        id: "h3_tr_evt",
        kind: "image-to-transition",
        prompt: "Morph between the two shots",
        startImage: "clip0_last_frame.png",
        endImage: "clip1_first_frame.png",
      },
      h3Job({
        video_settings: JSON.stringify({
          h3_mode: "multiframe",
          reference_images: ["refimg_1.png"],
          keyframe_guides: [{ refIndex: 0, frameIdx: 0 }],
          sequence_mode: "transition",
        }),
      }),
    );
    const classTypes = Object.values(graph).map((n: any) => n.class_type);
    expect(graph["10"].class_type).toBe("MiniMaxH3ImageToVideo");
    expect(classTypes).not.toContain("MiniMaxH3ReferenceToVideo");
    expect(classTypes).not.toContain("MiniMaxH3AddGuide");
    expect(graph["4"].inputs.unet_name).toBe(
      "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
    );
    expect(graph["9_first"].inputs.image).toBe("clip0_last_frame.png");
    expect(graph["9_last"].inputs.image).toBe("clip1_first_frame.png");
    expect(graph["10"].inputs.first_frame).toEqual(["9_first", 0]);
    expect(graph["10"].inputs.last_frame).toEqual(["9_last", 0]);
    // transition_duration 3s -> 72 raw frames -> 73 (17k + 5)
    expect(graph["10"].inputs.length).toBe(73);
  });

  test("snaps off-grid presets to the H3 canvas (1080p -> 1344x768)", async () => {
    const graph = await buildApi(
      {
        id: "h3_1080_evt",
        kind: "text-to-video",
        prompt: "Skyline",
        settings: { h3_mode: "t2v" },
      },
      h3Job({ resolution: "1080p" }),
    );
    expect(graph["10"].inputs.width).toBe(1344);
    expect(graph["10"].inputs.height).toBe(768);
  });
});

describe("ComfyUIClient prepareInput video staging", () => {
  let tempRoot = "";
  let outputDir = "";
  let inputDir = "";
  let prevOutputDir: string | undefined;
  let prevInputDir: string | undefined;

  beforeEach(() => {
    prevOutputDir = Bun.env.OUTPUT_DIR;
    prevInputDir = Bun.env.INPUT_DIR;
    tempRoot = mkdtempSync(join(tmpdir(), "ss-comfy-stage-"));
    outputDir = join(tempRoot, "output");
    inputDir = join(tempRoot, "input");
    mkdirSync(join(outputDir, "reference_images"), { recursive: true });
    mkdirSync(inputDir, { recursive: true });
    Bun.env.OUTPUT_DIR = outputDir;
    Bun.env.INPUT_DIR = inputDir;
  });

  afterEach(() => {
    if (prevOutputDir === undefined) delete Bun.env.OUTPUT_DIR;
    else Bun.env.OUTPUT_DIR = prevOutputDir;
    if (prevInputDir === undefined) delete Bun.env.INPUT_DIR;
    else Bun.env.INPUT_DIR = prevInputDir;
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  });

  const prepareInput = async (input: unknown, job: unknown) => {
    const { ComfyUIClient } = await import("./comfyui-client");
    const client = new ComfyUIClient({ baseUrl: "http://127.0.0.1:8188" });
    await (client as any).prepareInput(input, job);
  };

  const job = (videoSettings: Record<string, unknown>) => ({
    id: "job1",
    created_at: new Date().toISOString(),
    status: "active" as any,
    name: "Stage",
    video_model: "minimax-h3",
    video_settings: JSON.stringify(videoSettings),
  });

  test("image-to-video stages an uploaded refimg_* from OUTPUT_DIR/reference_images", async () => {
    await Bun.write(
      join(outputDir, "reference_images", "job1_first_frame.png"),
      "png-bytes",
    );

    await prepareInput(
      {
        id: "evt-i2v",
        kind: "image-to-video",
        imagePath: "refimg_job1_first_frame.png",
        prompt: "p",
      },
      job({ h3_mode: "i2v", first_frame: "refimg_job1_first_frame.png" }),
    );

    expect(
      await Bun.file(join(inputDir, "refimg_job1_first_frame.png")).text(),
    ).toBe("png-bytes");
  });

  test("image-to-transition ignores absent job-level reference images", async () => {
    await Bun.write(join(inputDir, "a_last_frame.png"), "a");
    await Bun.write(join(inputDir, "b_first_frame.png"), "b");

    await expect(
      prepareInput(
        {
          id: "evt-tr",
          kind: "image-to-transition",
          startImage: "a_last_frame.png",
          endImage: "b_first_frame.png",
          prompt: "p",
        },
        job({
          h3_mode: "multiframe",
          first_frame: "missing_first.png",
          reference_images: ["missing_ref_1.png", "missing_ref_2.png"],
        }),
      ),
    ).resolves.toBeUndefined();
  });
});

describe("videoInputImagesToStage", () => {
  test("scopes staged images by event kind and H3 mode", async () => {
    const { videoInputImagesToStage } = await import("./comfyui-client");
    const merged = {
      h3_mode: "multiframe" as const,
      first_frame: "first.png",
      last_frame: "last.png",
      reference_images: ["r1.png", "r2.png"],
    };

    expect(
      videoInputImagesToStage(
        {
          id: "t",
          kind: "image-to-transition",
          startImage: "s.png",
          endImage: "e.png",
          prompt: "p",
        },
        merged,
      ),
    ).toEqual(["s.png", "e.png"]);

    expect(
      videoInputImagesToStage(
        { id: "i", kind: "image-to-video", imagePath: "img.png", prompt: "p" },
        merged,
      ),
    ).toEqual(["img.png", "last.png", "r1.png", "r2.png"]);

    expect(
      videoInputImagesToStage(
        { id: "i", kind: "image-to-video", imagePath: "img.png", prompt: "p" },
        { ...merged, h3_mode: "i2v" },
      ),
    ).toEqual(["img.png"]);

    expect(
      videoInputImagesToStage(
        { id: "v", kind: "text-to-video", prompt: "p" },
        merged,
      ),
    ).toEqual(["first.png", "last.png", "r1.png", "r2.png"]);
  });
});
