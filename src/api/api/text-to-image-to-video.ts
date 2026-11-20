import { DB } from "../../db/db";
import { JobOrchestrator } from "../../jobs/jobs";
import { VideoGenerator } from "../../video/video-generator";
import { Utils } from "../../utils/utils";
import { PostTextToVideo } from "../schemas";
import { Metadata } from "../../meta/meta";
import {
  copyReferenceImageToInputDir,
  saveUploadedReferenceImage,
} from "../../video/reference-images";
import type { VideoJobSettings } from "../../shared/video-models";

async function stageUpload(
  file: File,
  uploadId: string,
  slot: string,
): Promise<string> {
  const saved = await saveUploadedReferenceImage(file, {
    jobId: uploadId,
    slot,
  });
  await copyReferenceImageToInputDir(saved);
  return saved.comfyInputFilename;
}

export async function text_to_image_to_video(options: PostTextToVideo) {
  const {
    prompt: rawPrompt,
    resolution,
    video_model,
    image_model,
    fps,
    clip_duration,
    style_preset,
    style_guide,
    loras,
    h3_mode,
    h3_variant,
    ref_image_size,
    soundscape,
    music,
    style_embedding,
    first_frame,
    last_frame,
    reference_images,
    keyframe_guides,
    sequence_mode,
    sequence_prompts,
  } = options;
  const prompt = Utils.sanitizeInputText(rawPrompt);

  if (!prompt || prompt.length < 1) {
    return new Response(JSON.stringify({ error: "Prompt is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Sanitize style_guide same as prompt before concat
  const sanitizedGuide = style_guide
    ? Utils.sanitizeInputText(style_guide)
    : undefined;
  const withGuide = (p: string) =>
    sanitizedGuide ? `${p}\n\nStyle guide: ${sanitizedGuide}` : p;
  const finalPrompt = withGuide(prompt);

  // Stage uploads before the job exists so invalid images fail fast (400)
  // without leaving an orphaned job behind.
  const uploadId = Metadata.randomId();
  const firstFrameName = first_frame
    ? await stageUpload(first_frame, uploadId, "first_frame")
    : undefined;
  const lastFrameName = last_frame
    ? await stageUpload(last_frame, uploadId, "last_frame")
    : undefined;
  const referenceImageNames: string[] = [];
  for (const [i, file] of (reference_images ?? []).entries()) {
    referenceImageNames.push(await stageUpload(file, uploadId, `ref_${i}`));
  }

  const mode = sequence_mode ?? "single";
  const prompts =
    mode !== "single" && sequence_prompts
      ? sequence_prompts.map((p) => withGuide(Utils.sanitizeInputText(p)))
      : [];

  const videoSettings: VideoJobSettings = {};
  if (h3_mode) videoSettings.h3_mode = h3_mode;
  if (h3_variant) videoSettings.h3_variant = h3_variant;
  if (ref_image_size) videoSettings.ref_image_size = ref_image_size;
  if (soundscape) videoSettings.soundscape = soundscape;
  if (music) videoSettings.music = music;
  if (style_embedding) videoSettings.style_embedding = style_embedding;
  if (firstFrameName) videoSettings.first_frame = firstFrameName;
  if (lastFrameName) videoSettings.last_frame = lastFrameName;
  if (referenceImageNames.length > 0)
    videoSettings.reference_images = referenceImageNames;
  if (keyframe_guides && keyframe_guides.length > 0)
    videoSettings.keyframe_guides = keyframe_guides;
  if (mode !== "single") {
    videoSettings.sequence_mode = mode;
    videoSettings.sequence_prompts = prompts;
  }
  const hasSettings = Object.keys(videoSettings).length > 0;
  const eventSettings = hasSettings
    ? (videoSettings as Record<string, unknown>)
    : undefined;

  const { id: jobId } = await JobOrchestrator.create_job({
    original_prompt: prompt,
    fps,
    resolution,
    clip_duration,
    transition_duration: Metadata.TRANSITION_DURATION,
    image_model: image_model ?? "z-image-turbo",
    video_model,
    style_preset,
    style_guide: sanitizedGuide ?? null,
    workflow: "video",
    loras: loras && loras.length ? JSON.stringify(loras) : null,
    video_settings: hasSettings ? JSON.stringify(videoSettings) : null,
  } as any);

  const isH3 = video_model === "minimax-h3";

  // One clip of a job. Wan/LTX first+last frame uploads map onto the
  // transition workflow, which only makes sense for single clips.
  const scheduleClip = (clipPrompt: string, index: number) => {
    if (isH3) {
      if (h3_mode === "i2v" && firstFrameName) {
        return VideoGenerator.schedule_video({
          jobId,
          prompt: clipPrompt,
          filename: firstFrameName,
          index,
          video_settings: eventSettings,
        });
      }
      return VideoGenerator.schedule_text_to_video({
        jobId,
        prompt: clipPrompt,
        index,
        video_settings: eventSettings,
      });
    }
    if (mode === "single" && firstFrameName && lastFrameName) {
      return VideoGenerator.schedule_transition({
        jobId,
        prompt: clipPrompt,
        startImg: firstFrameName,
        endImg: lastFrameName,
      });
    }
    if (firstFrameName) {
      return VideoGenerator.schedule_video({
        jobId,
        prompt: clipPrompt,
        filename: firstFrameName,
        index,
      });
    }
    return VideoGenerator.schedule_text_to_video({
      jobId,
      prompt: clipPrompt,
      index,
    });
  };

  let scheduled: boolean;
  if (mode === "continuation") {
    // SocketServer chains clips 1..N-1 from each preceding clip's last frame.
    scheduled = Boolean(await scheduleClip(prompts[0], 0));
  } else if (mode === "transition") {
    // SocketServer + prepare_transitions add transitions and the composition.
    scheduled = true;
    for (const [i, clipPrompt] of prompts.entries()) {
      scheduled = Boolean(await scheduleClip(clipPrompt, i)) && scheduled;
    }
  } else {
    scheduled = Boolean(await scheduleClip(finalPrompt, 0));
  }

  if (!scheduled) {
    await DB.Jobs.failJob(jobId);
    return new Response(
      JSON.stringify({ error: "Failed to schedule video event" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(JSON.stringify({ message: "job queued", jobId }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
