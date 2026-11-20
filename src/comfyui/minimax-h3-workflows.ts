import {
  computeVideoFrameLength,
  formatMiniMaxH3Prompt,
  type MiniMaxH3Mode,
  type MiniMaxH3Variant,
  type VideoJobSettings,
} from "../shared/video-models";

export type ComfyApiNode = {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title: string };
};

export type ComfyApiGraph = Record<string, ComfyApiNode>;

export const MINIMAX_H3_WEIGHTS = {
  textEncoder: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
  videoVae: "minimax_h3_video_vae_int8_convrot.safetensors",
  audioVae: "minimax_h3_audio_vae_fp32.safetensors",
  fl2vaUnet: "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
  ref2vaUnet: "minimax_h3_ref2va_pruned_int8_convrot.safetensors",
  fastH3Unet: "fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors",
  fl2vTurbo8Lora: "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors",
  fl2vTurbo4Lora:
    "minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors",
  ref2vTurbo4Lora: "minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors",
} as const;

export type BuildMiniMaxH3WorkflowInput = {
  eventId: string;
  prompt: string;
  width: number;
  height: number;
  durationSec: number;
  seed?: number;
  firstFrameFilename?: string | null;
  lastFrameFilename?: string | null;
  settings?: VideoJobSettings | null;
};

function randomSeed(): number {
  return Math.floor(Math.random() * 100_000_000_000_000);
}

function resolveEffectiveMode(
  input: BuildMiniMaxH3WorkflowInput,
): MiniMaxH3Mode {
  const s = input.settings;
  const refs = s?.reference_images?.filter(Boolean) ?? [];
  if (s?.h3_mode === "multiframe" && refs.length > 0) {
    return "multiframe";
  }
  const first = input.firstFrameFilename ?? s?.first_frame ?? null;
  const last = input.lastFrameFilename ?? s?.last_frame ?? null;
  if (first && last) return "fl2v";
  if (first || last) return "i2v";
  if (refs.length > 0 && s?.h3_mode === "multiframe") return "multiframe";
  return "t2v";
}

export function buildMiniMaxH3Workflow(
  input: BuildMiniMaxH3WorkflowInput,
): ComfyApiGraph {
  const settings = input.settings ?? {};
  const mode = resolveEffectiveMode(input);
  const requestedVariant: MiniMaxH3Variant = settings.h3_variant ?? "turbo_8";
  const length = computeVideoFrameLength("minimax-h3", input.durationSec);
  const seed = input.seed ?? randomSeed();

  const firstFrame =
    (input.firstFrameFilename ?? settings.first_frame ?? "").trim() || null;
  const lastFrame =
    (input.lastFrameFilename ?? settings.last_frame ?? "").trim() || null;
  const refImages = (settings.reference_images ?? [])
    .map((r) => r.trim())
    .filter(Boolean)
    .slice(0, 9);

  // FastH3 supports T2V and single-image first-frame I2V without last_frame or keyframe_guides.
  const canUseFastH3 =
    requestedVariant === "fasth3" &&
    (mode === "t2v" || (mode === "i2v" && Boolean(firstFrame) && !lastFrame)) &&
    !(settings.keyframe_guides && settings.keyframe_guides.length > 0);

  const effectiveVariant: MiniMaxH3Variant = canUseFastH3
    ? "fasth3"
    : requestedVariant === "fasth3"
      ? mode === "multiframe"
        ? "turbo_4"
        : "turbo_8"
      : requestedVariant;

  const formattedPrompt = formatMiniMaxH3Prompt({
    prompt: input.prompt,
    mode,
    hasFirstFrame: mode !== "multiframe" && Boolean(firstFrame),
    hasLastFrame: mode !== "multiframe" && Boolean(lastFrame),
    referenceCount: mode === "multiframe" ? refImages.length : 0,
    durationSec: input.durationSec,
    styleEmbedding: settings.style_embedding,
    soundscape: settings.soundscape,
    music: settings.music,
  });

  const graph: ComfyApiGraph = {
    "1": {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: MINIMAX_H3_WEIGHTS.textEncoder,
        type: "minimax",
        device: "default",
      },
      _meta: { title: "Load MiniMax H3 Text Encoder" },
    },
    "2": {
      class_type: "VAELoader",
      inputs: {
        vae_name: MINIMAX_H3_WEIGHTS.videoVae,
      },
      _meta: { title: "Load MiniMax H3 Video VAE" },
    },
    "3": {
      class_type: "VAELoader",
      inputs: {
        vae_name: MINIMAX_H3_WEIGHTS.audioVae,
      },
      _meta: { title: "Load MiniMax H3 Audio VAE" },
    },
  };

  // UNET + optional LoRA or FastH3 patch chain
  const unetName =
    effectiveVariant === "fasth3"
      ? MINIMAX_H3_WEIGHTS.fastH3Unet
      : mode === "multiframe"
        ? MINIMAX_H3_WEIGHTS.ref2vaUnet
        : MINIMAX_H3_WEIGHTS.fl2vaUnet;

  graph["4"] = {
    class_type: "UNETLoader",
    inputs: {
      unet_name: unetName,
      weight_dtype: "default",
    },
    _meta: { title: "Load MiniMax H3 Diffusion Model" },
  };

  let activeModelNode = "4";
  let steps = 8;
  let scheduler: "simple" | "beta" = "simple";

  if (effectiveVariant === "fasth3") {
    graph["6"] = {
      class_type: "MiniMaxH3SigmaShift",
      inputs: {
        model: ["4", 0],
        shift_video: 10,
        shift_audio: 3,
      },
      _meta: { title: "MiniMax H3 Sigma Shift" },
    };
    graph["7"] = {
      class_type: "ModelAttentionBackend",
      inputs: {
        model: ["6", 0],
        attention: "comfy kitchen attention",
      },
      _meta: { title: "Model Attention Backend" },
    };
    graph["8"] = {
      class_type: "BlockSparseAttention",
      inputs: {
        model: ["7", 0],
        selection: "vsa",
        "selection.keep_percent": 10,
        start_percent: 0.2,
        end_percent: 1.0,
        dense_blocks: "",
        min_tokens: 12288,
        extra_tokens: 256,
        sink_conditioning: "exact_kv_and_rows",
        verbose: false,
      },
      _meta: { title: "Block Sparse Attention (VSA)" },
    };
    activeModelNode = "8";
    steps = 8;
    scheduler = "simple";
  } else if (effectiveVariant === "standard") {
    steps = 20;
    scheduler = mode === "multiframe" ? "beta" : "simple";
  } else if (mode === "multiframe") {
    // Ref2V ships 4-step Turbo LoRA
    graph["5"] = {
      class_type: "LoraLoaderModelOnly",
      inputs: {
        model: ["4", 0],
        lora_name: MINIMAX_H3_WEIGHTS.ref2vTurbo4Lora,
        strength_model: 1,
      },
      _meta: { title: "Load MiniMax H3 Ref2V Turbo LoRA" },
    };
    activeModelNode = "5";
    steps = 4;
    scheduler = "simple";
  } else if (effectiveVariant === "turbo_4") {
    graph["5"] = {
      class_type: "LoraLoaderModelOnly",
      inputs: {
        model: ["4", 0],
        lora_name: MINIMAX_H3_WEIGHTS.fl2vTurbo4Lora,
        strength_model: 1,
      },
      _meta: { title: "Load MiniMax H3 FL2V 4-Step Turbo LoRA" },
    };
    activeModelNode = "5";
    steps = 4;
    scheduler = "simple";
  } else {
    graph["5"] = {
      class_type: "LoraLoaderModelOnly",
      inputs: {
        model: ["4", 0],
        lora_name: MINIMAX_H3_WEIGHTS.fl2vTurbo8Lora,
        strength_model: 1,
      },
      _meta: { title: "Load MiniMax H3 FL2V 8-Step Turbo LoRA" },
    };
    activeModelNode = "5";
    steps = 8;
    scheduler = "simple";
  }

  // Conditioning & Latent
  let finalPositiveNode = "10";

  if (mode === "multiframe") {
    const refInputs: Record<string, unknown> = {
      clip: ["1", 0],
      vae: ["2", 0],
      audio_vae: ["3", 0],
      prompt: formattedPrompt,
      width: input.width,
      height: input.height,
      length,
      ref_image_size: settings.ref_image_size ?? "match",
    };

    for (let i = 0; i < refImages.length; i++) {
      const loadId = `9_ref_${i}`;
      graph[loadId] = {
        class_type: "LoadImage",
        inputs: { image: refImages[i] },
        _meta: { title: `Load Reference Picture ${i + 1}` },
      };
      refInputs[`ref_images.ref_image_${i}`] = [loadId, 0];
    }

    graph["10"] = {
      class_type: "MiniMaxH3ReferenceToVideo",
      inputs: refInputs,
      _meta: { title: "MiniMax H3 Reference To Video" },
    };

    const validGuides = (settings.keyframe_guides ?? [])
      .filter(
        (g) =>
          Number.isInteger(g.refIndex) &&
          g.refIndex >= 0 &&
          g.refIndex < refImages.length &&
          Number.isInteger(g.frameIdx) &&
          g.frameIdx >= -1 &&
          g.frameIdx < length,
      )
      .slice()
      .sort((a, b) => a.frameIdx - b.frameIdx);

    for (let gIdx = 0; gIdx < validGuides.length; gIdx++) {
      const guide = validGuides[gIdx];
      const guideId = `11_guide_${gIdx}`;
      graph[guideId] = {
        class_type: "MiniMaxH3AddGuide",
        inputs: {
          positive: [finalPositiveNode, 0],
          vae: ["2", 0],
          latent: ["10", 1],
          image: [`9_ref_${guide.refIndex}`, 0],
          frame_idx: guide.frameIdx,
        },
        _meta: { title: `MiniMax H3 Keyframe Guide (${guide.frameIdx})` },
      };
      finalPositiveNode = guideId;
    }
  } else {
    const condInputs: Record<string, unknown> = {
      clip: ["1", 0],
      vae: ["2", 0],
      prompt: formattedPrompt,
      width: input.width,
      height: input.height,
      length,
    };

    if (firstFrame) {
      graph["9_first"] = {
        class_type: "LoadImage",
        inputs: { image: firstFrame },
        _meta: { title: "Load First Frame" },
      };
      condInputs.first_frame = ["9_first", 0];
    }

    if (lastFrame) {
      graph["9_last"] = {
        class_type: "LoadImage",
        inputs: { image: lastFrame },
        _meta: { title: "Load Last Frame" },
      };
      condInputs.last_frame = ["9_last", 0];
    }

    graph["10"] = {
      class_type: "MiniMaxH3ImageToVideo",
      inputs: condInputs,
      _meta: { title: "MiniMax H3 Image/Text To Video" },
    };
  }

  // Sampling & Audio-Video Decode
  graph["20"] = {
    class_type: "RandomNoise",
    inputs: { noise_seed: seed },
    _meta: { title: "Random Noise" },
  };
  graph["21"] = {
    class_type: "KSamplerSelect",
    inputs: { sampler_name: "res_multistep" },
    _meta: { title: "KSampler Select (res_multistep)" },
  };
  graph["22"] = {
    class_type: "BasicScheduler",
    inputs: {
      model: [activeModelNode, 0],
      scheduler,
      steps,
      denoise: 1,
    },
    _meta: { title: "Basic Scheduler" },
  };
  graph["23"] = {
    class_type: "BasicGuider",
    inputs: {
      model: [activeModelNode, 0],
      conditioning: [finalPositiveNode, 0],
    },
    _meta: { title: "Basic Guider" },
  };
  graph["24"] = {
    class_type: "SamplerCustomAdvanced",
    inputs: {
      noise: ["20", 0],
      guider: ["23", 0],
      sampler: ["21", 0],
      sigmas: ["22", 0],
      latent_image: ["10", 1],
    },
    _meta: { title: "Sampler Custom Advanced" },
  };
  graph["30"] = {
    class_type: "VAEDecode",
    inputs: {
      samples: ["24", 0],
      vae: ["2", 0],
    },
    _meta: { title: "VAE Decode Video" },
  };
  graph["31"] = {
    class_type: "VAEDecodeAudio",
    inputs: {
      samples: ["24", 0],
      vae: ["3", 0],
    },
    _meta: { title: "VAE Decode Stereo Audio" },
  };
  graph["32"] = {
    class_type: "CreateVideo",
    inputs: {
      images: ["30", 0],
      audio: ["31", 0],
      fps: 24,
    },
    _meta: { title: "Create Audio-Video Stream (24 fps)" },
  };
  graph["33"] = {
    class_type: "SaveVideo",
    inputs: {
      video: ["32", 0],
      filename_prefix: input.eventId,
      format: "auto",
      codec: "auto",
    },
    _meta: { title: "Save Video" },
  };

  return graph;
}

export type ComfyUiWorkflowJson = {
  id: string;
  revision: 0;
  last_node_id: number;
  last_link_id: number;
  nodes: Array<{
    id: number;
    type: string;
    pos: [number, number];
    size: [number, number];
    flags: Record<string, never>;
    order: number;
    mode: 0;
    title?: string;
    inputs: Array<{ name: string; type: string; link: number }>;
    outputs: Array<{ name: string; type: string; links: number[] }>;
    properties: { "Node name for S&R": string };
    widgets_values: unknown[];
  }>;
  links: Array<[number, number, number, number, number, string]>;
  groups: [];
  config: Record<string, never>;
  extra: { ds: { scale: 1; offset: [0, 0] } };
  version: 0.4;
};

export function buildMiniMaxH3UiWorkflow(
  workflowId: string,
  apiGraph: ComfyApiGraph,
): ComfyUiWorkflowJson {
  const keys = Object.keys(apiGraph);
  const keyToNum = new Map<string, number>();
  keys.forEach((k, i) => keyToNum.set(k, i + 1));

  let linkCounter = 0;
  const links: Array<[number, number, number, number, number, string]> = [];
  const nodeOutputs = new Map<
    number,
    Map<number, { name: string; type: string; links: number[] }>
  >();

  const nodes = keys.map((key, idx) => {
    const apiNode = apiGraph[key];
    const numId = keyToNum.get(key)!;
    const inputs: Array<{ name: string; type: string; link: number }> = [];
    const widgets_values: unknown[] = [];

    for (const [inName, inVal] of Object.entries(apiNode.inputs)) {
      if (
        Array.isArray(inVal) &&
        inVal.length === 2 &&
        typeof inVal[0] === "string" &&
        typeof inVal[1] === "number" &&
        keyToNum.has(inVal[0])
      ) {
        linkCounter += 1;
        const srcId = keyToNum.get(inVal[0])!;
        const srcSlot = inVal[1];
        const dstSlot = inputs.length;
        inputs.push({ name: inName, type: "*", link: linkCounter });
        links.push([linkCounter, srcId, srcSlot, numId, dstSlot, "*"]);

        let srcMap = nodeOutputs.get(srcId);
        if (!srcMap) {
          srcMap = new Map();
          nodeOutputs.set(srcId, srcMap);
        }
        const slotEntry = srcMap.get(srcSlot) ?? {
          name: `out_${srcSlot}`,
          type: "*",
          links: [],
        };
        slotEntry.links.push(linkCounter);
        srcMap.set(srcSlot, slotEntry);
      } else {
        widgets_values.push(inVal);
      }
    }

    const col = idx % 4;
    const row = Math.floor(idx / 4);
    return {
      id: numId,
      type: apiNode.class_type,
      pos: [col * 380, row * 260] as [number, number],
      size: [330, 180] as [number, number],
      flags: {},
      order: idx,
      mode: 0 as const,
      title: apiNode._meta?.title,
      inputs,
      outputs: [] as Array<{ name: string; type: string; links: number[] }>,
      properties: { "Node name for S&R": apiNode.class_type },
      widgets_values,
    };
  });

  for (const node of nodes) {
    const outMap = nodeOutputs.get(node.id);
    if (outMap) {
      const maxSlot = Math.max(...outMap.keys());
      const outs: Array<{ name: string; type: string; links: number[] }> = [];
      for (let s = 0; s <= maxSlot; s++) {
        outs.push(
          outMap.get(s) ?? {
            name: `out_${s}`,
            type: "*",
            links: [],
          },
        );
      }
      node.outputs = outs;
    }
  }

  return {
    id: workflowId,
    revision: 0,
    last_node_id: nodes.length,
    last_link_id: linkCounter,
    nodes,
    links,
    groups: [],
    config: {},
    extra: { ds: { scale: 1, offset: [0, 0] } },
    version: 0.4,
  };
}

function makeTemplate(
  filename: string,
  workflowId: string,
  input: BuildMiniMaxH3WorkflowInput,
) {
  const api = buildMiniMaxH3Workflow(input);
  const ui = buildMiniMaxH3UiWorkflow(workflowId, api);
  return { filename, api, ui };
}

export const CANONICAL_MINIMAX_H3_TEMPLATES = [
  makeTemplate(
    "video_minimax_h3_t2v.json",
    "00000000-0000-4000-8000-000000000301",
    {
      eventId: "minimax_h3_t2v",
      prompt:
        "integrated_multimodal_description: [Shot 1] Wide-angle cinematic tracking shot across sunlit alpine ridges.\nsoundscape: Crisp mountain wind.\nmusic: Warm orchestral strings.",
      width: 1376,
      height: 768,
      durationSec: 5,
      seed: 100001,
      settings: { h3_mode: "t2v", h3_variant: "turbo_8" },
    },
  ),
  makeTemplate(
    "video_minimax_h3_i2v.json",
    "00000000-0000-4000-8000-000000000302",
    {
      eventId: "minimax_h3_i2v",
      prompt: "[Shot 1] Subject steps forward as camera dollies in.",
      width: 1376,
      height: 768,
      durationSec: 5,
      seed: 100002,
      firstFrameFilename: "red_superboy_on_city_roof.png",
      settings: { h3_mode: "i2v", h3_variant: "turbo_8" },
    },
  ),
  makeTemplate(
    "video_minimax_h3_fl2v.json",
    "00000000-0000-4000-8000-000000000303",
    {
      eventId: "minimax_h3_fl2v",
      prompt: "[Shot 1] Smooth cinematic transition from start to end pose.",
      width: 1376,
      height: 768,
      durationSec: 5,
      seed: 100003,
      firstFrameFilename: "h3_frame_ref_1.png",
      lastFrameFilename: "h3_frame_ref_2.png",
      settings: { h3_mode: "fl2v", h3_variant: "turbo_8" },
    },
  ),
  makeTemplate(
    "video_minimax_h3_multiframe.json",
    "00000000-0000-4000-8000-000000000304",
    {
      eventId: "minimax_h3_multiframe",
      prompt:
        "subject_definitions:\n<Subject 1> is the character in <Picture 1>.\nintegrated_multimodal_description: [Shot 1] <Subject 1> moves toward <Picture 2>.",
      width: 1376,
      height: 768,
      durationSec: 5,
      seed: 100004,
      settings: {
        h3_mode: "multiframe",
        h3_variant: "turbo_4",
        ref_image_size: "match",
        reference_images: ["h3_frame_ref_1.png", "h3_frame_ref_2.png"],
        keyframe_guides: [
          { refIndex: 0, frameIdx: 0 },
          { refIndex: 1, frameIdx: 60 },
        ],
      },
    },
  ),
] as const;
