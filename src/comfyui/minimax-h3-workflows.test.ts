import { describe, expect, test } from "bun:test";
import {
  buildMiniMaxH3Workflow,
  CANONICAL_MINIMAX_H3_TEMPLATES,
  MINIMAX_H3_WEIGHTS,
} from "./minimax-h3-workflows";

describe("buildMiniMaxH3Workflow", () => {
  test("builds pruned T2V turbo_8 workflow with zero LoadImage nodes and 8-step LoRA", () => {
    const graph = buildMiniMaxH3Workflow({
      eventId: "evt_t2v_1",
      prompt: "Cinematic orbital sunrise over ocean clouds",
      width: 1344,
      height: 768,
      durationSec: 5,
      seed: 42,
      settings: {
        h3_mode: "t2v",
        h3_variant: "turbo_8",
      },
    });

    const classTypes = Object.values(graph).map((n) => n.class_type);
    expect(classTypes).not.toContain("LoadImage");
    expect(classTypes).not.toContain("MiniMaxH3AddGuide");
    expect(classTypes).toContain("MiniMaxH3ImageToVideo");
    expect(classTypes).toContain("LoraLoaderModelOnly");
    expect(classTypes).toContain("VAEDecode");
    expect(classTypes).toContain("VAEDecodeAudio");
    expect(classTypes).toContain("CreateVideo");
    expect(classTypes).toContain("SaveVideo");

    expect(graph["1"].inputs).toEqual({
      clip_name: MINIMAX_H3_WEIGHTS.textEncoder,
      type: "minimax",
      device: "default",
    });
    expect(graph["4"].inputs).toEqual({
      unet_name: MINIMAX_H3_WEIGHTS.fl2vaUnet,
      weight_dtype: "default",
    });
    expect(graph["5"].inputs).toEqual({
      model: ["4", 0],
      lora_name: MINIMAX_H3_WEIGHTS.fl2vTurbo8Lora,
      strength_model: 1,
    });
    expect(graph["10"].inputs).toEqual({
      clip: ["1", 0],
      vae: ["2", 0],
      prompt: "Cinematic orbital sunrise over ocean clouds",
      width: 1344,
      height: 768,
      length: 124,
    });
    expect(graph["22"].inputs).toEqual({
      model: ["5", 0],
      scheduler: "simple",
      steps: 8,
      denoise: 1,
    });
    expect(graph["33"].inputs).toEqual({
      video: ["32", 0],
      filename_prefix: "evt_t2v_1",
      format: "auto",
      codec: "auto",
    });
  });

  test("builds FastH3 T2V/I2V workflow with SigmaShift + ModelAttentionBackend + BlockSparseAttention", () => {
    const graph = buildMiniMaxH3Workflow({
      eventId: "evt_fasth3",
      prompt: "Streetwear model walking forward",
      width: 768,
      height: 768,
      durationSec: 5,
      seed: 99,
      firstFrameFilename: "first_in.png",
      settings: {
        h3_mode: "i2v",
        h3_variant: "fasth3",
      },
    });

    expect(graph["4"].inputs.unet_name).toBe(MINIMAX_H3_WEIGHTS.fastH3Unet);
    expect(graph["5"]).toBeUndefined();
    expect(graph["6"].class_type).toBe("MiniMaxH3SigmaShift");
    expect(graph["6"].inputs).toEqual({
      model: ["4", 0],
      shift_video: 10,
      shift_audio: 3,
    });
    expect(graph["7"].class_type).toBe("ModelAttentionBackend");
    expect(graph["7"].inputs).toEqual({
      model: ["6", 0],
      attention: "comfy kitchen attention",
    });
    expect(graph["8"].class_type).toBe("BlockSparseAttention");
    expect(graph["8"].inputs).toMatchObject({
      model: ["7", 0],
      selection: "vsa",
      "selection.keep_percent": 10,
      start_percent: 0.2,
      end_percent: 1.0,
      min_tokens: 12288,
      extra_tokens: 256,
      sink_conditioning: "exact_kv_and_rows",
    });
    expect(graph["22"].inputs.model).toEqual(["8", 0]);
    expect(graph["22"].inputs.steps).toBe(8);
    expect(graph["9_first"].inputs.image).toBe("first_in.png");
    expect(graph["10"].inputs.first_frame).toEqual(["9_first", 0]);
  });

  test("transparently routes fasth3 to fl2va + turbo_8 when lastFrameFilename is present (fl2v)", () => {
    const graph = buildMiniMaxH3Workflow({
      eventId: "evt_fl2v",
      prompt: "Camera morphs smoothly between frames",
      width: 1280,
      height: 720,
      durationSec: 4,
      seed: 7,
      firstFrameFilename: "a.png",
      lastFrameFilename: "b.png",
      settings: {
        h3_mode: "fl2v",
        h3_variant: "fasth3",
      },
    });

    expect(graph["4"].inputs.unet_name).toBe(MINIMAX_H3_WEIGHTS.fl2vaUnet);
    expect(graph["5"].inputs.lora_name).toBe(MINIMAX_H3_WEIGHTS.fl2vTurbo8Lora);
    expect(graph["6"]).toBeUndefined();
    expect(graph["9_first"].inputs.image).toBe("a.png");
    expect(graph["9_last"].inputs.image).toBe("b.png");
    expect(graph["10"].inputs.first_frame).toEqual(["9_first", 0]);
    expect(graph["10"].inputs.last_frame).toEqual(["9_last", 0]);
  });

  test("builds multiframe reference workflow with autogrow ref_images and sorted MiniMaxH3AddGuide chain", () => {
    const graph = buildMiniMaxH3Workflow({
      eventId: "evt_ref",
      prompt:
        "subject_definitions:\n<Subject 1> is the hero in <Picture 1>.\nintegrated_multimodal_description: [Shot 1] Hero leaps across rooftops.",
      width: 1344,
      height: 768,
      durationSec: 6,
      seed: 1001,
      settings: {
        h3_mode: "multiframe",
        h3_variant: "turbo_4",
        ref_image_size: "max",
        reference_images: ["ref0.png", "ref1.png", "ref2.png"],
        keyframe_guides: [
          { refIndex: 2, frameIdx: 96 },
          { refIndex: 0, frameIdx: 0 },
        ],
      },
    });

    expect(graph["4"].inputs.unet_name).toBe(MINIMAX_H3_WEIGHTS.ref2vaUnet);
    expect(graph["5"].inputs.lora_name).toBe(
      MINIMAX_H3_WEIGHTS.ref2vTurbo4Lora,
    );
    expect(graph["22"].inputs.steps).toBe(4);
    expect(graph["10"].class_type).toBe("MiniMaxH3ReferenceToVideo");
    expect(graph["10"].inputs).toMatchObject({
      clip: ["1", 0],
      vae: ["2", 0],
      audio_vae: ["3", 0],
      ref_image_size: "max",
      "ref_images.ref_image_0": ["9_ref_0", 0],
      "ref_images.ref_image_1": ["9_ref_1", 0],
      "ref_images.ref_image_2": ["9_ref_2", 0],
    });
    expect(graph["9_ref_3"]).toBeUndefined();

    // Guides chained in ascending frame_idx order (0 then 96)
    expect(graph["11_guide_0"].class_type).toBe("MiniMaxH3AddGuide");
    expect(graph["11_guide_0"].inputs).toEqual({
      positive: ["10", 0],
      vae: ["2", 0],
      latent: ["10", 1],
      image: ["9_ref_0", 0],
      frame_idx: 0,
    });
    expect(graph["11_guide_1"].inputs).toEqual({
      positive: ["11_guide_0", 0],
      vae: ["2", 0],
      latent: ["10", 1],
      image: ["9_ref_2", 0],
      frame_idx: 96,
    });
    // BasicGuider consumes final guide output
    expect(graph["23"].inputs.conditioning).toEqual(["11_guide_1", 0]);
  });

  test("builds standard 20-step ref2va workflow with beta scheduler and zero LoRA", () => {
    const graph = buildMiniMaxH3Workflow({
      eventId: "evt_ref_std",
      prompt: "Standard quality reference shot",
      width: 1280,
      height: 720,
      durationSec: 5,
      seed: 12,
      settings: {
        h3_mode: "multiframe",
        h3_variant: "standard",
        reference_images: ["only_one.png"],
      },
    });

    expect(graph["5"]).toBeUndefined();
    expect(graph["22"].inputs).toEqual({
      model: ["4", 0],
      scheduler: "beta",
      steps: 20,
      denoise: 1,
    });
  });

  test("fl2v uses 17k + 5 frame length and the aligned last-frame timestamp", () => {
    const graph = buildMiniMaxH3Workflow({
      eventId: "evt_fl2v_ts",
      prompt: "Bridge the two poses",
      width: 1344,
      height: 768,
      durationSec: 5,
      seed: 3,
      firstFrameFilename: "a.png",
      lastFrameFilename: "b.png",
      settings: { h3_mode: "fl2v", h3_variant: "turbo_8" },
    });
    expect(graph["10"].inputs.length).toBe(124);
    expect(graph["10"].inputs.prompt).toContain(
      "at 5.13 seconds into the target video, <Picture 2> is fully referenced.",
    );
  });

  test("snaps off-grid or oversized canvases to the H3 32px grid and area cap", () => {
    const graph = buildMiniMaxH3Workflow({
      eventId: "evt_canvas",
      prompt: "Wide skyline",
      width: 1920,
      height: 1080,
      durationSec: 5,
      seed: 4,
      settings: { h3_mode: "t2v" },
    });
    expect(graph["10"].inputs.width).toBe(1344);
    expect(graph["10"].inputs.height).toBe(768);
  });

  test("a start + end frame pair inside a multiframe job builds fl2va, not ref2va", () => {
    const graph = buildMiniMaxH3Workflow({
      eventId: "evt_mf_transition",
      prompt: "Transition between clips",
      width: 1344,
      height: 768,
      durationSec: 3,
      seed: 5,
      firstFrameFilename: "clip0_last.png",
      lastFrameFilename: "clip1_first.png",
      settings: {
        h3_mode: "multiframe",
        reference_images: ["refimg_1.png"],
        keyframe_guides: [{ refIndex: 0, frameIdx: 0 }],
        sequence_mode: "transition",
      },
    });
    expect(graph["10"].class_type).toBe("MiniMaxH3ImageToVideo");
    expect(graph["10"].inputs.first_frame).toEqual(["9_first", 0]);
    expect(graph["10"].inputs.last_frame).toEqual(["9_last", 0]);
    expect(graph["4"].inputs.unet_name).toBe(MINIMAX_H3_WEIGHTS.fl2vaUnet);
    const classTypes = Object.values(graph).map((n) => n.class_type);
    expect(classTypes).not.toContain("MiniMaxH3ReferenceToVideo");
    expect(classTypes).not.toContain("MiniMaxH3AddGuide");
  });

  test("canonical JSON templates match programmatic builders and are valid ComfyUI UI + API JSON", async () => {
    for (const tpl of CANONICAL_MINIMAX_H3_TEMPLATES) {
      const apiFile = await Bun.file(
        `${import.meta.dir}/api/${tpl.filename}`,
      ).json();
      const uiFile = await Bun.file(
        `${import.meta.dir}/workflows/${tpl.filename}`,
      ).json();
      expect(apiFile).toEqual(tpl.api);
      expect(uiFile).toEqual(tpl.ui);
      expect(Array.isArray(uiFile.nodes)).toBe(true);
      expect(uiFile.nodes.length).toBe(Object.keys(apiFile).length);
      expect(Array.isArray(uiFile.links)).toBe(true);
    }
  });
});
