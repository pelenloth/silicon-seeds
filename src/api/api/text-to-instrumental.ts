import { AudioGenerator } from "../../audio/audio-generator";
import { JobOrchestrator } from "../../jobs/jobs";
import { Metadata } from "../../meta/meta";
import { clampAudioDuration, getAudioModel } from "../../shared/audio-models";

export async function text_to_instrumental() {
  const duration = clampAudioDuration(Metadata.INSTRUMENTAL_MODEL, 47);
  const prompt = getAudioModel(Metadata.INSTRUMENTAL_MODEL).composeDefaultPrompt;

  const { id: jobId } = await JobOrchestrator.create_job({
    audio_model: Metadata.INSTRUMENTAL_MODEL,
  });
  await AudioGenerator.schedule_audio({ jobId, duration, prompt });

  return new Response(JSON.stringify({ message: "job queued", jobId }), {
    status: 202,
  });
}
