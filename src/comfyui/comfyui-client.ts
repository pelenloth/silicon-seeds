import { Metadata } from "../meta/meta";
import zImageTurboApi from "./api/image_z_image_turbo_720p.json";
import zImageTurboWithLoraApi from "./api/image_z_image_turbo_lora_720p.json";
import wan2_2_img2vidApi from "./api/video_wan2_2_14B_i2v_720p_5s.json";
import wan2_2_img2transitionApi from "./api/video_wan2_2_14B_transitions.json";
import ltx2_3_img2vidApi from "./api/video_ltx2_3_i2v.json";
import ltx2_3_img2transitionApi from "./api/video_ltx2_3_style_transition.json";
import ltx_t2v_api from "./api/video_ltx2_3_t2v.json";
// import ace_step_1_0_api from "./api/audio_ace_step_1_0_instrumental.json";
import { copyReferenceAudioToInputDir } from "../audio/reference-audio";
import { normalizeAudioModelId } from "../shared/audio-models";
import { buildAudioWorkflow } from "./audio-workflows";

import wan2_2_img2vidWorkflow from "./workflows/video_wan2_2_14B_i2v_720p_5s.json";
import wan2_2_img2transWorkflow from "./workflows/video_wan2_2_14B_transitions.json";
import ltx2_3_img2vidWorkflow from "./workflows/video_ltx2_3_i2v.json";
import ltx2_3_img2transWorkflow from "./workflows/video_ltx2_3_style_transition.json";
import ltx_t2v_workflow from "./workflows/video_ltx2_3_t2v.json";
import { Logger } from "../logger/logger";
import { Utils } from "../utils/utils";
import { Lora } from "../styles/presets";
import { JobsSchema } from "../db/db";
import {
  resolveVideoDimensions,
  type VideoJobSettings,
} from "../shared/video-models";
import {
  buildMiniMaxH3UiWorkflow,
  buildMiniMaxH3Workflow,
  type ComfyApiGraph,
} from "./minimax-h3-workflows";
import { stageVideoInputImages } from "../video/reference-images";
import { existsSync } from "node:fs";

export type LoraSpec = { name: string; strength: number };

type Text2ImgInput = {
  id: string;
  kind: "text-to-image";
  prompt: string;
  lora?: Lora;
  loras?: LoraSpec[];
};

type Img2VidInput = {
  id: string;
  kind: "image-to-video";
  imagePath: string;
  prompt: string;
  settings?: VideoJobSettings;
};

type Text2Instrumental = {
  id: string;
  kind: "text-to-instrumental";
  prompt: string | null;
  duration: number;
  lyrics: string | null;
  settings?: Record<string, unknown>;
};

type Text2Song = {
  id: string;
  kind: "text-to-song";
  prompt: string | null;
  duration: number;
  lyrics: string | null;
  settings?: Record<string, unknown>;
};

type Img2Transition = {
  id: string;
  kind: "image-to-transition";
  startImage: string;
  endImage: string;
  prompt: string;
  settings?: VideoJobSettings;
};

type Text2VideoInput = {
  id: string;
  kind: "text-to-video";
  prompt: string;
  settings?: VideoJobSettings;
};

export type VideoVariant = Text2VideoInput | Img2VidInput | Img2Transition;

function isVideoVariant(input: ModelVariant): input is VideoVariant {
  return (
    input.kind === "text-to-video" ||
    input.kind === "image-to-video" ||
    input.kind === "image-to-transition"
  );
}

function parseJobVideoSettings(
  raw: string | null | undefined,
): VideoJobSettings {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as VideoJobSettings)
      : {};
  } catch {
    Logger.warn("Ignoring malformed job video_settings JSON");
    return {};
  }
}

function mergeVideoSettings(
  input: VideoVariant,
  job: JobsSchema,
): VideoJobSettings {
  return {
    ...parseJobVideoSettings(job.video_settings),
    ...(input.settings ?? {}),
  };
}

/**
 * Input images a video event's ComfyUI graph references, so staging never
 * fails on job-level images the event does not use (e.g. a transition inside
 * a multiframe job only needs its start/end frames).
 */
export function videoInputImagesToStage(
  input: VideoVariant,
  merged: VideoJobSettings,
): string[] {
  let names: (string | null | undefined)[];
  if (input.kind === "image-to-transition") {
    names = [input.startImage, input.endImage];
  } else if (input.kind === "image-to-video") {
    names = [
      input.imagePath || merged.first_frame,
      merged.h3_mode === "i2v" ? undefined : merged.last_frame,
      ...(merged.h3_mode === "multiframe"
        ? (merged.reference_images ?? [])
        : []),
    ];
  } else {
    names = [
      merged.first_frame,
      merged.last_frame,
      ...(merged.reference_images ?? []),
    ];
  }
  const clean = names
    .map((name) => (typeof name === "string" ? name.trim() : ""))
    .filter((name) => name.length > 0);
  return [...new Set(clean)];
}

export type ModelVariant =
  | Text2ImgInput
  | Img2VidInput
  | Text2VideoInput
  | Text2Instrumental
  | Text2Song
  | Img2Transition;

const OUTPUT_DIR = Bun.env.OUTPUT_DIR;
const INPUT_DIR = Bun.env.INPUT_DIR;
const COMFYUI_BASE_URL = Bun.env.COMFYUI_BASE_URL;

// Model-native output FPS. ComfyUI length params are frame counts, and each
// model encodes at a fixed FPS, so duration math must use these, not job.fps
// (the UI playback fps). Wan default workflow ships length 121 = 5*24+1,
// LTX ships 121 frames at fps 25.
const WAN_NATIVE_FPS = 24;
const LTX_NATIVE_FPS = 25;

export class ComfyUIClient {
  private baseUrl: string;

  constructor(config: { baseUrl?: string } = {}) {
    this.baseUrl =
      config.baseUrl || Bun.env.COMFYUI_BASE_URL || "http://127.0.0.1:8188";
  }

  async generate(input: ModelVariant, job: JobsSchema) {
    const api = this.buildApi(input, job);
    const body = this.buildBody(input, api, job);

    await this.prepareInput(input, job);

    const response = await fetch(`${this.baseUrl}/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(
        `ComfyUI /prompt failed (${response.status}): ${errorText}`,
      );
    }

    const json = await response.json();
    return json;
  }

  async getHistory(promptId: string): Promise<Record<string, any>> {
    const response = await fetch(`${this.baseUrl}/history/${promptId}`);
    if (!response.ok) {
      throw new Error(`Failed to get history: ${response.statusText}`);
    }
    return response.json();
  }

  async deleteQueuedPrompts(promptIds: string[]): Promise<boolean> {
    if (promptIds.length === 0) return true;

    const response = await fetch(`${this.baseUrl}/queue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ delete: promptIds }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to delete queued prompts: ${response.statusText}`,
      );
    }

    return true;
  }

  async interruptPrompt(promptId: string): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/interrupt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt_id: promptId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to interrupt prompt: ${response.statusText}`);
    }

    return true;
  }

  async getImageOutput(promptId: string): Promise<{
    filename: string;
    subfolder: string;
    kind: "input" | "output" | "temp";
  } | null> {
    const history = await comfyClient.getHistory(promptId);
    const historyNode = history[promptId];

    const images: {
      filename: string;
      subfolder: string;
      kind: "input" | "output" | "temp";
    }[] = [];

    const outputs = Object.values(historyNode.outputs);
    Utils.assert(
      outputs.length === 1,
      `ComfyUI job should have exactly one item in history, found: ${JSON.stringify(outputs)}`,
    );

    const [output] = outputs as any;
    // SaveImage reports `images`; SaveVideo / VHS nodes may report `videos`
    // or `gifs` instead.
    const media = output.images ?? output.videos ?? output.gifs;
    Utils.assert(
      Array.isArray(media) && media.length > 0,
      `ComfyUI output has no images/videos/gifs: ${JSON.stringify(output)}`,
    );
    const [image] = media;
    Utils.assert(
      image.subfolder === "",
      `Expected 'subfolder' to be "" (empty), but found '${image.subfolder}'`,
    );

    images.push({
      filename: image.filename,
      subfolder: image.subfolder,
      kind: image.type,
    });

    Utils.assert(
      images.length === 1,
      "There should be only one image per ComfyUI job",
    );

    return images[0];
  }

  async getAsset(
    filename: string,
    subfolder: string,
    folder_type: "input" | "output" | "temp",
  ): Promise<Blob> {
    const data = new URLSearchParams({
      filename,
      subfolder,
      type: folder_type,
    });

    const response = await fetch(`${this.baseUrl}/view?${data.toString()}`);

    if (!response.ok) {
      throw new Error(`Failed to get image: ${response.statusText}`);
    }

    return response.blob();
  }

  async free_memory(
    unloadModels: boolean,
    freeMemory: boolean,
  ): Promise<boolean> {
    const payload = { unload_models: unloadModels, free_memory: freeMemory };

    try {
      const res = await fetch(`${this.baseUrl}/free`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        Logger.warn(`Freeing memory failed`);
        return false;
      }

      return true;
    } catch (_error) {
      Logger.error(`Freeing memory failed`);
      return false;
    }
  }

  private buildLoraChain(
    api: Record<string, any>,
    loras: LoraSpec[],
  ): Record<string, any> {
    if (!loras.length) return api;
    // first lora is node 51
    (api["51"] as any).inputs.lora_name = loras[0].name;
    (api["51"] as any).inputs.strength_model = loras[0].strength;
    let prev = "51";
    for (let i = 1; i < loras.length; i++) {
      const nodeId = `51_${i}`;
      api[nodeId] = {
        inputs: {
          lora_name: loras[i].name,
          strength_model: loras[i].strength,
          model: [prev, 0],
        },
        class_type: "LoraLoaderModelOnly",
        _meta: { title: "Load LoRA" },
      };
      prev = nodeId;
    }
    // rewire ModelSamplingAuraFlow to last lora output
    if (api["47"]) (api["47"] as any).inputs.model = [prev, 0];
    return api;
  }

  private buildBody(
    input: ModelVariant,
    api: Record<string, unknown>,
    job: JobsSchema,
  ) {
    const clientId = Metadata.clientId;
    const base = {
      prompt: api,
      prompt_id: input.id,
      client_id: clientId,
    };

    let workflow: unknown | undefined;
    if (job.video_model === "minimax-h3" && isVideoVariant(input)) {
      // H3 graphs are generated dynamically, so embed the matching UI graph
      // instead of a static Wan/LTX template.
      workflow = buildMiniMaxH3UiWorkflow(input.id, api as ComfyApiGraph);
      return JSON.stringify({
        ...base,
        extra_data: {
          extra_pnginfo: workflow,
        },
      });
    }

    if (input.kind === "text-to-video") {
      if (job.video_model === "wan2.2") {
        workflow = wan2_2_img2vidWorkflow;
      } else if (job.video_model === "ltx2.3") {
        workflow = ltx_t2v_workflow;
      } else {
        throw new Error(`Unsupported video_model for T2V: ${job.video_model}`);
      }
      return JSON.stringify({
        ...base,
        extra_data: {
          extra_pnginfo: workflow,
        },
      });
    } else if (input.kind === "image-to-video") {
      if (job.video_model === "wan2.2") {
        workflow = wan2_2_img2vidWorkflow;
      }

      if (job.video_model === "ltx2.3") {
        workflow = ltx2_3_img2vidWorkflow;
      }

      return JSON.stringify({
        ...base,
        extra_data: {
          extra_pnginfo: workflow,
        },
      });
    } else if (input.kind === "image-to-transition") {
      // TODO expose transition model in UI
      if (job.video_model === "wan2.2") {
        workflow = wan2_2_img2transWorkflow;
      }
      if (job.video_model === "ltx2.3") {
        workflow = ltx2_3_img2transWorkflow;
      }

      return JSON.stringify({
        ...base,
        extra_data: {
          extra_pnginfo: workflow,
        },
      });
    } else {
      return JSON.stringify(base);
    }
  }

  private buildApi(
    input: ModelVariant,
    job: JobsSchema,
  ): Record<string, unknown> {
    // Better to raw dog the exported json workflows
    let api;

    const resolution = resolveVideoDimensions(job.resolution, job.video_model);

    if (job.video_model === "minimax-h3" && isVideoVariant(input)) {
      const merged = mergeVideoSettings(input, job);
      // Transitions always bridge startImage -> endImage via fl2va, even when
      // the job itself is a multiframe reference job.
      const mergedSettings: VideoJobSettings =
        input.kind === "image-to-transition"
          ? {
              ...merged,
              h3_mode: "fl2v",
              reference_images: undefined,
              keyframe_guides: undefined,
            }
          : merged;
      return buildMiniMaxH3Workflow({
        eventId: input.id,
        prompt: input.prompt,
        width: resolution.width,
        height: resolution.height,
        durationSec:
          input.kind === "image-to-transition"
            ? job.transition_duration || Metadata.TRANSITION_DURATION
            : job.clip_duration || Metadata.CLIP_DURATION,
        firstFrameFilename:
          input.kind === "image-to-video"
            ? input.imagePath
            : input.kind === "image-to-transition"
              ? input.startImage
              : (mergedSettings.first_frame ?? null),
        // i2v is first-frame only; this also stops a job-level last_frame from
        // leaking into continuation clips (undefined keys vanish in JSON).
        lastFrameFilename:
          input.kind === "image-to-transition"
            ? input.endImage
            : mergedSettings.h3_mode === "i2v"
              ? null
              : (mergedSettings.last_frame ?? null),
        settings: mergedSettings,
      });
    }

    if (input.kind === "text-to-image") {
      if (job.image_model === "z-image-turbo") {
        const loras: LoraSpec[] = (() => {
          if (input.loras && input.loras.length)
            return input.loras.map((l) => ({
              name: l.name.endsWith(".safetensors")
                ? l.name
                : `${l.name}.safetensors`,
              strength: Math.max(0.1, Math.min(2, l.strength)),
            }));
          if ((input as any).lora) {
            const n = String((input as any).lora);
            return [
              {
                name: n.endsWith(".safetensors") ? n : `${n}.safetensors`,
                strength: 0.7,
              },
            ];
          }
          return [];
        })();
        if (loras.length === 0) {
          api = structuredClone(
            zImageTurboApi as unknown as Record<string, any>,
          );
          (api["9"] as any).inputs.filename_prefix = input.id;
          // zImageTurboApi uses 57:xx ids, but we map generic handling via resolution nodes? fallback to WithLora structure? Use WithLora base but bypass lora by wiring 46 directly to 47.
          // Better use WithLora base and remove lora node when empty: we use non-lora api here.
          // For non-lora api, set width/height via its own nodes.
          // Try to detect which base we are using:
          if ((api as any)["41"]) {
            (api["41"] as any).inputs.width = resolution.width;
            (api["41"] as any).inputs.height = resolution.height;
            (api["45"] as any).inputs.text = input.prompt;
            (api["44"] as any).inputs.seed = Math.floor(
              Math.random() * 100_000_000_000_000,
            );
          } else if ((api as any)["57:13"]) {
            (api["57:13"] as any).inputs.width = resolution.width;
            (api["57:13"] as any).inputs.height = resolution.height;
            (api["57:27"] as any).inputs.text = input.prompt;
            (api["57:3"] as any).inputs.seed = Math.floor(
              Math.random() * 100_000_000_000_000,
            );
            (api["9"] as any).inputs.filename_prefix = input.id;
          }
        } else {
          api = structuredClone(
            zImageTurboWithLoraApi as unknown as Record<string, any>,
          );
          (api["9"] as any).inputs.filename_prefix = input.id;
          (api["41"] as any).inputs.width = resolution.width;
          (api["41"] as any).inputs.height = resolution.height;
          (api["45"] as any).inputs.text = input.prompt;
          (api["44"] as any).inputs.seed = Math.floor(
            Math.random() * 100_000_000_000_000,
          );
          api = this.buildLoraChain(api, loras);
        }
      }
    }

    if (input.kind === "text-to-video") {
      if (job.video_model === "wan2.2") {
        // Use local Wan I2V workflow with dummy image for pure T2V (no cloud)
        api = structuredClone(wan2_2_img2vidApi as Record<string, any>);
        api["93"].inputs.text = input.prompt;
        api["98"].inputs.width = resolution.width;
        api["98"].inputs.height = resolution.height;
        api["98"].inputs.length =
          (job.clip_duration || Metadata.CLIP_DURATION) * WAN_NATIVE_FPS + 1;
        api["108"].inputs.filename_prefix = input.id;
        api["97"].inputs.image = "dummy_t2v.png";
      }
      if (job.video_model === "ltx2.3") {
        api = structuredClone(ltx_t2v_api as Record<string, any>);
        // LTX T2V reuses I2V 45-node graph with switch true and dummy image
        api["267:266"].inputs.value = input.prompt;
        api["267:257"].inputs.value = resolution.width;
        api["267:258"].inputs.value = resolution.height;
        api["267:225"].inputs.value =
          (job.clip_duration || Metadata.CLIP_DURATION) * LTX_NATIVE_FPS + 1;
        if (api["267:201"]) api["267:201"].inputs.value = true;
        if (api["269"]) api["269"].inputs.image = "dummy_t2v.png";
        api["75"].inputs.filename_prefix = input.id;
      }
    }

    if (input.kind === "image-to-video") {
      if (job.video_model === "wan2.2") {
        api = structuredClone(
          wan2_2_img2vidApi as unknown as Record<string, any>,
        );
        (api["93"] as any).inputs.text = input.prompt;
        (api["98"] as any).inputs.width = resolution.width;
        (api["98"] as any).inputs.height = resolution.height;
        (api["98"] as any).inputs.length =
          (job.clip_duration || Metadata.CLIP_DURATION) * WAN_NATIVE_FPS + 1;
        (api["108"] as any).inputs.filename_prefix = input.id;
        (api["97"] as any).inputs.image = input.imagePath;
      }

      if (job.video_model === "ltx2.3") {
        api = structuredClone(
          ltx2_3_img2vidApi as unknown as Record<string, any>,
        );
        (api["267:266"] as any).inputs.value = input.prompt;
        (api["267:257"] as any).inputs.value = resolution.width;
        (api["267:258"] as any).inputs.value = resolution.height;
        (api["267:225"] as any).inputs.value =
          (job.clip_duration || Metadata.CLIP_DURATION) * LTX_NATIVE_FPS + 1;
        (api["75"] as any).inputs.filename_prefix = input.id;
        (api["269"] as any).inputs.image = input.imagePath;
      }
    }

    if (
      input.kind === "text-to-song" ||
      input.kind === "text-to-instrumental"
    ) {
      const fallbackModel =
        input.kind === "text-to-instrumental"
          ? "stable-audio-3"
          : "ace-step-1.5";
      const modelId = normalizeAudioModelId(
        input.settings?.audio_model ?? job.audio_model,
        fallbackModel,
      );
      api = buildAudioWorkflow({
        eventId: input.id,
        modelId,
        prompt: input.prompt,
        lyrics: input.lyrics,
        duration: input.duration,
        forceInstrumental: input.kind === "text-to-instrumental",
        settings: input.settings,
      });
    }

    if (input.kind === "image-to-transition") {
      if (job.video_model === "wan2.2") {
        api = wan2_2_img2transitionApi;
        api["6"].inputs.text = input.prompt;
        api["68"].inputs.image = input.startImage;
        api["67"].inputs.width = resolution.width;
        api["67"].inputs.height = resolution.height;
        api["67"].inputs.length =
          (job.transition_duration || Metadata.TRANSITION_DURATION) *
            WAN_NATIVE_FPS +
          1;
        api["62"].inputs.image = input.endImage;
        api["61"].inputs.filename_prefix = input.id;
      }

      if (job.video_model === "ltx2.3") {
        api = ltx2_3_img2transitionApi;
        api["139:128"].inputs.text = input.prompt;
        // The exported LTX workflow uses node 138 as the first-frame input and
        // node 137 as the last-frame input, so map by workflow semantics rather
        // than node id order.
        api["138"].inputs.image = input.startImage;
        api["139:113"].inputs.value = resolution.width;
        api["139:98"].inputs.value = resolution.height;
        api["139:114"].inputs.value = job.fps || Metadata.FPS;
        api["139:143"].inputs.value =
          job.transition_duration || Metadata.TRANSITION_DURATION;
        api["137"].inputs.image = input.endImage;
        api["68"].inputs.filename_prefix = input.id;
      }
    }

    Utils.assert(
      api,
      `ComfyUI workflow does not exist for event kind: ${input.kind}`,
    );

    return api;
  }

  private async prepareInput(input: ModelVariant, job: JobsSchema) {
    const outDir = Bun.env.OUTPUT_DIR ?? OUTPUT_DIR;
    const inDir = Bun.env.INPUT_DIR ?? INPUT_DIR;

    if (input.kind === "image-to-video") {
      Utils.assert(outDir && inDir, "ComfyUI env. variables not configured!");
      const name = input.imagePath.replace('"', "").trim();
      const src = `${outDir}/${name}`;
      // Fresh OUTPUT_DIR frames (t2i2v) overwrite stale copies; uploaded
      // refimg_* and continuation frames are resolved by staging below.
      if (existsSync(src)) {
        await Bun.write(`${inDir}/${name}`, await Bun.file(src).arrayBuffer());
      }
    }

    if (isVideoVariant(input)) {
      const filenames = videoInputImagesToStage(
        input,
        mergeVideoSettings(input, job),
      );
      if (inDir && filenames.length > 0) {
        await stageVideoInputImages({
          filenames,
          inputDir: inDir,
          outputDir: outDir,
        });
      }
      return;
    }

    if (
      input.kind === "text-to-song" ||
      input.kind === "text-to-instrumental"
    ) {
      const refRel = input.settings?.reference_audio_path;
      const refName = input.settings?.reference_audio_filename;
      if (
        typeof refRel === "string" &&
        refRel.trim() &&
        typeof refName === "string" &&
        refName.trim()
      ) {
        Utils.assert(outDir && inDir, "ComfyUI env. variables not configured!");
        await copyReferenceAudioToInputDir({
          relativePath: refRel.trim(),
          comfyInputFilename: refName.trim(),
          outputDir: outDir,
          inputDir: inDir,
        });
      }
    }
  }
}

export const comfyClient = new ComfyUIClient({
  baseUrl: COMFYUI_BASE_URL,
});
