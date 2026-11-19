import { AudioGenerator } from "../../audio/audio-generator";
import {
  stageReferenceAudioUpload,
  validateReferenceAudioFile,
} from "../../audio/reference-audio";
import { findSoundPresetByName } from "../../audio/sound-presets";
import { JobMode } from "../../events/events";
import { JobOrchestrator } from "../../jobs/jobs";
import {
  clampAudioDuration,
  formatModelLyrics,
  getAudioModel,
  normalizeAudioModelId,
  YUE2_SAMPLE_REFERENCE_FILENAME,
} from "../../shared/audio-models";
import { Utils } from "../../utils/utils";
import { PostDistinctAudio } from "../schemas";

export async function text_to_audio(
  options: PostDistinctAudio,
): Promise<Response> {
  const modelId = normalizeAudioModelId(options.audio_model, "ace-step-1.5");
  const modelSpec = getAudioModel(modelId);
  const preset = await findSoundPresetByName(options.sound_preset);

  const instrumentalPrompt = Utils.sanitizeInputText(
    options.instrumental_prompt || preset?.instrumental_prompt || "",
  );
  const rawLyricInput = Utils.sanitizeInputText(options.lyric_prompt ?? "");

  if (!instrumentalPrompt) {
    throw new Error("Instrumental prompt is required");
  }

  if (options.reference_audio) {
    validateReferenceAudioFile(options.reference_audio);
  }

  const duration = clampAudioDuration(
    modelId,
    options.duration ??
      (typeof preset?.settings.duration === "number"
        ? preset.settings.duration
        : modelSpec.defaultDuration),
  );

  const { id: jobId } = await JobOrchestrator.create_job({
    original_prompt: instrumentalPrompt,
    audio_model: modelId,
    sound_preset: preset?.name ?? options.sound_preset ?? null,
  });

  const audioSettings: Record<string, unknown> = {
    ...(preset?.settings ?? {}),
    audio_model: modelId,
  };

  for (const key of [
    "bpm",
    "cfg_scale",
    "temperature",
    "top_p",
    "top_k",
    "steps",
    "keyscale",
    "timesignature",
    "yue2_mode",
    "abc_planning",
    "abc_temperature",
    "abc_top_p",
    "minimax_precision",
    "tiled_decode",
    "sa3_variant",
    "sa3_audio_type",
    "use_reprompt",
  ] as const) {
    if (options[key] !== undefined) {
      audioSettings[key] = options[key];
    }
  }

  if (modelId === "yue2") {
    if (options.reference_audio) {
      const staged = await stageReferenceAudioUpload({
        file: options.reference_audio,
        jobId,
      });
      audioSettings.reference_audio_path = staged.relativePath;
      audioSettings.reference_audio_filename = staged.comfyInputFilename;
    } else if (
      options.reference_audio_sample === YUE2_SAMPLE_REFERENCE_FILENAME
    ) {
      audioSettings.reference_audio_filename = YUE2_SAMPLE_REFERENCE_FILENAME;
      delete audioSettings.reference_audio_path;
    }
  }

  const resolvedLyrics = formatModelLyrics(modelId, rawLyricInput);
  const mode =
    modelId === "stable-audio-3" ? JobMode.Instrumental : JobMode.Song;

  await AudioGenerator.schedule_audio({
    jobId,
    mode,
    prompt: instrumentalPrompt,
    lyrics: resolvedLyrics,
    duration,
    audio_settings: audioSettings,
  });

  return new Response(JSON.stringify({ message: "job queued", jobId }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
