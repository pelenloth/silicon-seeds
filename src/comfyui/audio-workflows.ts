import ace_step_1_5_api from "./api/audio_ace_step1_5_xl_base_instrumental.json";
import stable_audio_3_api from "./api/audio_stable_audio_3_medium_base.json";
import {
  clampAudioDuration,
  formatModelLyrics,
  normalizeAudioModelId,
  type AudioModelId,
} from "../shared/audio-models";

export type AudioWorkflowBuildInput = {
  eventId: string;
  modelId: AudioModelId | string | null | undefined;
  prompt: string | null;
  lyrics: string | null;
  duration: number;
  seed?: number;
  forceInstrumental?: boolean;
  referenceAudioFilename?: string | null;
  settings?: Record<string, unknown>;
};

const SA3_AUDIO_TYPES = ["Music", "Instrument", "SFX", "One-shot"] as const;

function randomSafeSeed(): number {
  return Math.floor(Math.random() * 100_000_000_000_000);
}

function toNum(val: unknown, fallback: number): number {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string" && val.trim() !== "") {
    const n = Number(val);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function toBool(val: unknown, fallback: boolean): boolean {
  if (typeof val === "boolean") return val;
  if (val === "true" || val === "1") return true;
  if (val === "false" || val === "0") return false;
  return fallback;
}

export function buildAudioWorkflow(
  input: AudioWorkflowBuildInput,
): Record<string, unknown> {
  const modelId = normalizeAudioModelId(input.modelId);
  const duration = clampAudioDuration(modelId, input.duration);
  const settings = input.settings ?? {};
  const seed =
    typeof input.seed === "number" && Number.isFinite(input.seed)
      ? Math.trunc(input.seed)
      : typeof settings.seed === "number" && Number.isFinite(settings.seed)
        ? Math.trunc(settings.seed)
        : randomSafeSeed();
  const promptText = (input.prompt ?? "").trim();
  const lyricsText = formatModelLyrics(modelId, input.lyrics, {
    forceInstrumental: input.forceInstrumental,
  });

  switch (modelId) {
    case "ace-step-1.5":
      return buildAceStepWorkflow({
        eventId: input.eventId,
        prompt: promptText,
        lyrics: lyricsText,
        duration,
        seed,
        settings,
      });
    case "yue2":
      return buildYue2Workflow({
        eventId: input.eventId,
        prompt: promptText,
        lyrics: lyricsText,
        duration,
        seed,
        referenceAudioFilename:
          input.referenceAudioFilename ??
          (typeof settings.reference_audio_filename === "string"
            ? settings.reference_audio_filename
            : null),
        settings,
      });
    case "minimax-music-3":
      return buildMiniMaxMusic3Workflow({
        eventId: input.eventId,
        prompt: promptText,
        lyrics: lyricsText,
        duration,
        seed,
        settings,
      });
    case "stable-audio-3":
      return buildStableAudio3Workflow({
        eventId: input.eventId,
        prompt: promptText,
        duration,
        seed,
        settings,
      });
  }
}

function buildAceStepWorkflow(opts: {
  eventId: string;
  prompt: string;
  lyrics: string;
  duration: number;
  seed: number;
  settings: Record<string, unknown>;
}): Record<string, unknown> {
  const api = structuredClone(
    ace_step_1_5_api as unknown as Record<string, any>,
  );
  const s = opts.settings;

  api["109"].inputs.value = opts.seed;
  if (opts.prompt) {
    api["94"].inputs.tags = opts.prompt;
  }
  api["94"].inputs.lyrics = opts.lyrics;
  api["94"].inputs.duration = opts.duration;
  api["98"].inputs.seconds = opts.duration;

  api["94"].inputs.bpm = toNum(s.bpm, api["94"].inputs.bpm);
  api["94"].inputs.cfg_scale = toNum(s.cfg_scale, api["94"].inputs.cfg_scale);
  api["94"].inputs.temperature = toNum(
    s.temperature,
    api["94"].inputs.temperature,
  );
  api["94"].inputs.top_p = toNum(s.top_p, api["94"].inputs.top_p);
  if (typeof s.keyscale === "string" && s.keyscale.trim()) {
    api["94"].inputs.keyscale = s.keyscale.trim();
  }
  if (typeof s.timesignature === "string" && s.timesignature.trim()) {
    api["94"].inputs.timesignature = s.timesignature.trim();
  }
  api["3"].inputs.steps = Math.round(toNum(s.steps, api["3"].inputs.steps));
  api["107"].inputs.filename_prefix = opts.eventId;
  api["107"].inputs.audioUI = "";

  return api;
}

function buildYue2Workflow(opts: {
  eventId: string;
  prompt: string;
  lyrics: string;
  duration: number;
  seed: number;
  referenceAudioFilename: string | null;
  settings: Record<string, unknown>;
}): Record<string, unknown> {
  const s = opts.settings;
  const refFile = opts.referenceAudioFilename?.trim() || "";
  const abcPlanning = toBool(s.abc_planning, true);
  const rawMode = s.yue2_mode === "melody" ? "melody" : "full";

  const api: Record<string, any> = {
    "15": {
      inputs: {
        ckpt_name: "yue2_3b_int8_convrot.safetensors",
      },
      class_type: "CheckpointLoaderSimple",
      _meta: { title: "Load Checkpoint" },
    },
  };

  let abcInput: unknown = "";
  let musicMode: "full" | "melody" = rawMode;
  let defaultCfg = 1.0;

  if (refFile) {
    // Melody Cover branch: LoadAudio -> SheetSage2AudioToABC (YuE2GenerateABC pruned)
    musicMode = "melody";
    defaultCfg = 1.0;
    api["45"] = {
      inputs: {
        audio: refFile,
      },
      class_type: "LoadAudio",
      _meta: { title: "Load Audio" },
    };
    api["43"] = {
      inputs: {
        audio_encoder_name: "sheetsage2_bf16.safetensors",
      },
      class_type: "AudioEncoderLoader",
      _meta: { title: "Load Audio Encoder" },
    };
    api["41"] = {
      inputs: {
        mode: "melody",
        audio_encoder: ["43", 0],
        audio: ["45", 0],
      },
      class_type: "SheetSage2AudioToABC",
      _meta: { title: "SheetSage2 Audio to ABC" },
    };
    abcInput = ["41", 0];
  } else if (abcPlanning) {
    // Symbolic ABC planning branch (SheetSage2 pruned)
    defaultCfg = 1.0;
    api["24"] = {
      inputs: {
        style: opts.prompt,
        lyrics: opts.lyrics,
        seed: opts.seed,
        mode: rawMode,
        max_abc_tokens: 8192,
        temperature: toNum(s.abc_temperature, 0.7),
        top_p: toNum(s.abc_top_p, 0.9),
        top_k: Math.round(toNum(s.top_k, 30)),
        repetition_penalty: toNum(s.repetition_penalty, 1.005),
        penalty_window: 100,
        clip: ["15", 1],
      },
      class_type: "YuE2GenerateABC",
      _meta: { title: "YuE2 Generate ABC" },
    };
    abcInput = ["24", 0];
  } else {
    // Direct text-to-music branch (both ABC planner and SheetSage2 pruned)
    defaultCfg = 1.01;
    abcInput = "";
  }

  api["25"] = {
    inputs: {
      style: opts.prompt,
      lyrics: opts.lyrics,
      abc: abcInput,
      seed: opts.seed,
      mode: musicMode,
      max_duration: opts.duration,
      temperature: toNum(s.temperature, 1.0),
      top_p: toNum(s.top_p, 0.95),
      top_k: Math.round(toNum(s.music_top_k, 100)),
      repetition_penalty: toNum(s.music_repetition_penalty, 1.2),
      clip: ["15", 1],
    },
    class_type: "YuE2GenerateMusic",
    _meta: { title: "YuE2 Generate Music" },
  };

  api["18"] = {
    inputs: {
      conditioning: ["25", 0],
    },
    class_type: "ConditioningZeroOut",
    _meta: { title: "ConditioningZeroOut" },
  };

  api["5"] = {
    inputs: {
      seconds: ["25", 1],
      batch_size: 1,
    },
    class_type: "EmptyYuE2LatentAudio",
    _meta: { title: "Empty YuE2 Latent Audio" },
  };

  api["8"] = {
    inputs: {
      seed: opts.seed,
      steps: Math.round(toNum(s.steps, 32)),
      cfg: toNum(s.cfg_scale, defaultCfg),
      sampler_name: "dpm_2",
      scheduler: "sgm_uniform",
      denoise: 1,
      model: ["15", 0],
      positive: ["25", 0],
      negative: ["18", 0],
      latent_image: ["5", 0],
    },
    class_type: "KSampler",
    _meta: { title: "KSampler" },
  };

  api["9"] = {
    inputs: {
      samples: ["8", 0],
      vae: ["15", 2],
    },
    class_type: "VAEDecodeAudio",
    _meta: { title: "VAE Decode Audio" },
  };

  api["10"] = {
    inputs: {
      filename_prefix: opts.eventId,
      quality: "V0",
      audioUI: "",
      audio: ["9", 0],
    },
    class_type: "SaveAudioMP3",
    _meta: { title: "Save Audio (MP3)" },
  };

  return api;
}

function buildMiniMaxMusic3Workflow(opts: {
  eventId: string;
  prompt: string;
  lyrics: string;
  duration: number;
  seed: number;
  settings: Record<string, unknown>;
}): Record<string, unknown> {
  const s = opts.settings;
  const precision = s.minimax_precision === "fp16" ? "fp16" : "int8";
  const tiledDecode = toBool(s.tiled_decode, true);
  const cfgScale = toNum(s.cfg_scale, 1.7);

  const unetName =
    precision === "fp16"
      ? "minimax_music3_dit_fp16.safetensors"
      : "minimax_music3_dit_int8_convrot.safetensors";

  const api: Record<string, any> = {
    "6": {
      inputs: {
        unet_name: unetName,
        weight_dtype: "default",
      },
      class_type: "UNETLoader",
      _meta: { title: "Load Diffusion Model" },
    },
    "3": {
      inputs: {
        clip_name:
          "minimax_music3_text_encoder_pruned_int8_convrot.safetensors",
        type: "minimax",
        device: "default",
      },
      class_type: "CLIPLoader",
      _meta: { title: "Load CLIP" },
    },
    "7": {
      inputs: {
        vae_name: "minimax_music3_dav.safetensors",
      },
      class_type: "VAELoader",
      _meta: { title: "Load VAE" },
    },
    "13": {
      inputs: {
        caption: opts.prompt,
        lyrics: opts.lyrics,
        seed: opts.seed,
        max_duration: opts.duration,
        cfg_scale: cfgScale,
        top_k: Math.round(toNum(s.top_k, 50)),
        clip: ["3", 0],
      },
      class_type: "MiniMaxMusic3TextEncode",
      _meta: { title: "MiniMax Music 3 Text Encode" },
    },
    "10": {
      inputs: {
        conditioning: ["13", 0],
      },
      class_type: "ConditioningZeroOut",
      _meta: { title: "ConditioningZeroOut" },
    },
    "15": {
      inputs: {
        seconds: ["13", 1],
        batch_size: 1,
      },
      class_type: "EmptyMiniMaxMusic3LatentAudio",
      _meta: { title: "Empty MiniMax Music 3 Latent Audio" },
    },
    "9": {
      inputs: {
        seed: opts.seed,
        steps: Math.round(toNum(s.steps, 30)),
        cfg: cfgScale,
        sampler_name: "euler",
        scheduler: "simple",
        denoise: 1,
        model: ["6", 0],
        positive: ["13", 0],
        negative: ["10", 0],
        latent_image: ["15", 0],
      },
      class_type: "KSampler",
      _meta: { title: "KSampler" },
    },
  };

  let decodeNodeId: string;
  if (tiledDecode) {
    decodeNodeId = "42";
    api["42"] = {
      inputs: {
        tile_size: 1536,
        overlap: 64,
        samples: ["9", 0],
        vae: ["7", 0],
      },
      class_type: "VAEDecodeAudioTiled",
      _meta: { title: "VAE Decode Audio (Tiled)" },
    };
  } else {
    decodeNodeId = "12";
    api["12"] = {
      inputs: {
        samples: ["9", 0],
        vae: ["7", 0],
      },
      class_type: "VAEDecodeAudio",
      _meta: { title: "VAE Decode Audio" },
    };
  }

  api["35"] = {
    inputs: {
      filename_prefix: opts.eventId,
      quality: "V0",
      audioUI: "",
      audio: [decodeNodeId, 0],
    },
    class_type: "SaveAudioMP3",
    _meta: { title: "Save Audio (MP3)" },
  };

  return api;
}

function buildStableAudio3Workflow(opts: {
  eventId: string;
  prompt: string;
  duration: number;
  seed: number;
  settings: Record<string, unknown>;
}): Record<string, unknown> {
  const api = structuredClone(
    stable_audio_3_api as unknown as Record<string, any>,
  );
  const s = opts.settings;

  const variant = s.sa3_variant === "medium_base" ? "medium_base" : "medium";
  const defaultSteps = variant === "medium_base" ? 50 : 8;
  const defaultCfg = variant === "medium_base" ? 7.0 : 1.0;

  api["52:25"].inputs.ckpt_name =
    variant === "medium_base"
      ? "stable_audio_3_medium_base.safetensors"
      : "stable_audio_3_medium.safetensors";

  api["52:3"].inputs.seed = opts.seed;
  api["52:3"].inputs.steps = Math.round(toNum(s.steps, defaultSteps));
  api["52:3"].inputs.cfg = toNum(s.cfg_scale, defaultCfg);
  api["52:36"].inputs.value = opts.duration;
  if (opts.prompt) {
    api["52:31"].inputs.value = opts.prompt;
  }

  api["19"].inputs.filename_prefix = opts.eventId;
  api["19"].inputs.audioUI = "";

  const useReprompt = toBool(s.use_reprompt, false);
  if (useReprompt) {
    const rawType =
      typeof s.sa3_audio_type === "string" &&
      (SA3_AUDIO_TYPES as readonly string[]).includes(s.sa3_audio_type)
        ? (s.sa3_audio_type as (typeof SA3_AUDIO_TYPES)[number])
        : "Music";
    api["52:43"].inputs.choice = rawType;
    api["52:43"].inputs.index = SA3_AUDIO_TYPES.indexOf(rawType);
    api["52:28"].inputs["sampling_mode.seed"] = opts.seed;
    api["52:6"].inputs.text = ["52:28", 0];
    delete api["52:34"];
    delete api["52:35"];
  } else {
    api["52:6"].inputs.text = ["52:31", 0];
    for (const nodeId of [
      "52:28",
      "52:29",
      "52:34",
      "52:35",
      "52:38",
      "52:39",
      "52:40",
      "52:41",
      "52:42",
      "52:43",
      "52:49",
    ]) {
      delete api[nodeId];
    }
  }

  return api;
}
