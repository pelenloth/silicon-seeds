import { AudioGenerator } from "../audio/audio-generator";
import { findSoundPresetByName } from "../audio/sound-presets";
import { DB } from "../db/db";
import { AudioPromptEvent, Event, JobEvent, JobMode } from "../events/events";
import { ImageGenerator } from "../image/image-generator";
import { Logger } from "../logger/logger";
import { Metadata } from "../meta/meta";
import {
  clampAudioDuration,
  formatModelLyrics,
  getAudioModel,
  normalizeAudioModelId,
} from "../shared/audio-models";
import type { Lora, Presets } from "../styles/presets";
import { VideoGenerator } from "../video/video-generator";

export async function resolveComposeUnderscoreSpec(opts: {
  audioModel: string | null | undefined;
  soundPresetName: string | null | undefined;
  speechDuration: number;
}): Promise<{
  modelId: string;
  duration: number;
  prompt: string;
  lyrics: string;
  audioSettings: Record<string, unknown>;
}> {
  const modelId = normalizeAudioModelId(opts.audioModel, "stable-audio-3");
  const modelSpec = getAudioModel(modelId);
  const preset = await findSoundPresetByName(opts.soundPresetName);
  const matchedPreset =
    preset && preset.audio_model === modelId ? preset : undefined;

  const prompt =
    matchedPreset?.instrumental_prompt || modelSpec.composeDefaultPrompt;
  const lyrics = formatModelLyrics(modelId, null, { forceInstrumental: true });
  const duration = clampAudioDuration(modelId, opts.speechDuration);

  return {
    modelId,
    duration,
    prompt,
    lyrics,
    audioSettings: {
      ...(matchedPreset?.settings ?? {}),
      audio_model: modelId,
    },
  };
}

export namespace QueueManager {
  // eslint-disable-next-line prefer-const
  export let comfyQueue = 0;
  let pumping = false;
  let waitingForComfyIdle = false;
  let holdCount = 0;

  export function holdForComfyIdle() {
    waitingForComfyIdle = true;
  }

  export function releaseComfyIdle() {
    waitingForComfyIdle = false;
  }

  export function hold() {
    holdCount++;
  }

  export function release() {
    holdCount = Math.max(0, holdCount - 1);
  }

  export async function resume() {
    await DB.Events.requeueRunning();
  }

  export async function pump() {
    if (pumping) return;
    if (waitingForComfyIdle) return;
    if (holdCount > 0) return;
    pumping = true;

    try {
      if (await DB.Events.hasRunning()) {
        Logger.warn("Event already running, not dispatching.");
        return;
      }

      const nextEvent = await DB.Events.claimNextRunnable();
      if (!nextEvent) {
        Logger.warn("No event available for dispatch, not dispatching.");
        return;
      }

      await dispatch(nextEvent);
    } finally {
      pumping = false;
    }
  }

  async function dispatch(event: JobEvent) {
    Logger.info("Dispatching queued event", {
      id: event.id,
      type: event.type,
      mode: event.mode,
      priority: event.priority,
    });

    try {
      if (event.type === Event.NewAudioPrompt) {
        const { duration } = await AudioGenerator.generate_audio(event);

        if (event.mode === JobMode.Speech && event.voice_id) {
          // super ugly, but this does not get a socket event back from ComfyUI
          // because request is made to Voicebox for TTS
          pumping = false;
          await schedule_tts_pipeline(event, duration);
        }

        return;
      }

      if (event.type === Event.NewImagePrompt) {
        await ImageGenerator.generate_image(event);
        return;
      }

      if (
        event.type === Event.NewVideoPrompt ||
        event.type === Event.NewTransitionPrompt
      ) {
        await VideoGenerator.generate_video(event);
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Logger.error("Failed to dispatch queued event", {
        id: event.id,
        message,
      });
      await DB.Jobs.failJob(event.jobId);
      queueMicrotask(() => {
        void pump();
      });
    }
  }

  async function schedule_tts_pipeline(
    event: AudioPromptEvent,
    duration?: number,
  ) {
    let speechDuration = duration;
    if (speechDuration == null || speechDuration <= 0) {
      const metadata = await DB.Meta.findByEventId(event.id);
      const outputDir = Bun.env.OUTPUT_DIR;
      if (!outputDir) throw new Error("OUTPUT_DIR env not set");

      const audioFile = Bun.file(`${outputDir}/${metadata.filename}`);
      const audioBlob = await audioFile
        .arrayBuffer()
        .then((b) => new Blob([b]));
      speechDuration = await Metadata.getAudioDuration(audioBlob);
    }

    const job = await DB.Jobs.findById(event.jobId);
    const clipDuration = job.clip_duration || Metadata.CLIP_DURATION;
    const transitionDuration =
      job.transition_duration || Metadata.TRANSITION_DURATION;
    const clipCount = Math.ceil(
      (speechDuration + transitionDuration) /
        (clipDuration + transitionDuration),
    );

    const underscore = await resolveComposeUnderscoreSpec({
      audioModel: job.audio_model,
      soundPresetName: job.sound_preset,
      speechDuration,
    });

    await AudioGenerator.schedule_audio({
      jobId: event.jobId,
      duration: underscore.duration,
      mode: JobMode.Instrumental,
      prompt: underscore.prompt,
      lyrics: underscore.lyrics,
      audio_settings: underscore.audioSettings,
    });

    await schedule_composition_images(event, clipCount);
  }

  async function schedule_composition_images(
    event: AudioPromptEvent,
    clipCount: number,
  ) {
    const job = await DB.Jobs.findById(event.jobId);

    const textEvents = (await DB.Events.findByJobId(event.jobId)).filter(
      (e) => e.type === Event.NewTextPrompt,
    );
    if (textEvents[0]?.type === Event.NewTextPrompt) {
      const { PromptGenerator } = await import("../prompts/prompt-generator");
      const rawGuide = job.style_guide;
      const styleGuide = rawGuide?.trim() ? rawGuide.trim() : undefined;
      const scenes = await PromptGenerator.image_scene_prompts(
        textEvents[0].text,
        clipCount,
        styleGuide,
      );

      if (!scenes) throw new Error("No scene prompts generated");

      let idx = 0;
      for (const scene of scenes) {
        const res = await PromptGenerator.txt_to_img_prompt(
          scene,
          1,
          job.style_preset as
            (typeof Presets)[keyof typeof Presets] | undefined,
        );
        if (!res) throw new Error("No styled prompt generated");
        const [styleItem] = res;
        const stylePrompt = styleItem?.prompt;
        if (!stylePrompt) throw new Error("Styled prompt is empty");

        // Prefer job-level loras if present (user selection), otherwise preset lora
        let jobLoras: { name: string; strength: number }[] | undefined;
        if ((job as any).loras) {
          try {
            const parsed = JSON.parse((job as any).loras);
            if (Array.isArray(parsed)) jobLoras = parsed;
          } catch {}
        }
        const effectiveLoras =
          jobLoras && jobLoras.length
            ? jobLoras
            : styleItem?.lora
              ? [{ name: styleItem.lora as string, strength: 0.7 }]
              : undefined;
        await ImageGenerator.schedule_image({
          jobId: event.jobId,
          mode: JobMode.Video,
          prompt: stylePrompt,
          lora: styleItem?.lora as (typeof Lora)[keyof typeof Lora] | undefined,
          loras: effectiveLoras,
          index: idx,
        } as any);
        idx++;
      }
    }
  }
}
