import { DB } from "../../db/db";
import { JobOrchestrator } from "../../jobs/jobs";
import { VideoGenerator } from "../../video/video-generator";
import { Utils } from "../../utils/utils";
import { PostTextToVideo } from "../schemas";
import { Metadata } from "../../meta/meta";

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
  } = options as any;
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
  const finalPrompt = sanitizedGuide
    ? `${prompt}\n\nStyle guide: ${sanitizedGuide}`
    : prompt;

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
  } as any);

  const scheduled = await VideoGenerator.schedule_text_to_video({
    jobId,
    prompt: finalPrompt,
    index: 0,
  });

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
