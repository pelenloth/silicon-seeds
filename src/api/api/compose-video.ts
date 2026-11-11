import { AudioGenerator } from "../../audio/audio-generator";
import { JobOrchestrator } from "../../jobs/jobs";
import { Metadata } from "../../meta/meta";
import { TextGenerator } from "../../text/text-generator";
import { Utils } from "../../utils/utils";
import { PostCompose } from "../schemas";

export async function compose_video(options: PostCompose) {
  const {
    script,
    script_file,
    style_preset,
    fps,
    resolution,
    clip_duration,
    transition_duration,
    image_model,
    video_model,
    style_guide,
    loras,
  } = options as any;

  // Determine the final script: file takes precedence over text input, but ignore empty file
  let finalScript = script ? Utils.sanitizeInputText(script) : undefined;

  if (script_file && script_file.size > 0) {
    // Read the uploaded file content (only if file actually selected)
    const fileContent = await script_file.text();
    const sanitizedFile = Utils.sanitizeInputText(fileContent);
    if (sanitizedFile.length >= 3) finalScript = sanitizedFile;
  }

  if (!finalScript || finalScript.length < 3) {
    return new Response(JSON.stringify({ error: "Script is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let sanitizedStyleGuide: string | undefined = style_guide
    ? Utils.sanitizeInputText(style_guide).slice(0, 2000).trim()
    : undefined;
  if (sanitizedStyleGuide !== undefined && sanitizedStyleGuide.length === 0) {
    sanitizedStyleGuide = undefined;
  }

  const { id: jobId } = await JobOrchestrator.create_job({
    original_prompt: finalScript,
    fps,
    resolution,
    clip_duration,
    transition_duration,
    image_model,
    video_model,
    audio_model: Metadata.INSTRUMENTAL_MODEL,
    style_preset,
    style_guide: sanitizedStyleGuide,
    loras: loras && loras.length ? JSON.stringify(loras) : null,
  } as any);

  await TextGenerator.create_text_event(jobId, finalScript);

  await AudioGenerator.schedule_audio({
    jobId,
    prompt: finalScript,
    voice_id: options.voice_id,
  });

  return new Response(JSON.stringify({ message: "job queued", jobId }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "HX-Redirect": `/compose?show_progress=true&job_id=${jobId}`,
    },
  });
}
