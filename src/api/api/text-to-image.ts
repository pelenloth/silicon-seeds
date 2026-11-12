import { DB } from "../../db/db";
import { JobMode } from "../../events/events";
import { JobOrchestrator } from "../../jobs/jobs";
import { PromptGenerator } from "../../prompts/prompt-generator";
import { QueueManager } from "../../queue/queue-manager";
import { Utils } from "../../utils/utils";
import { PostTextToImage } from "../schemas";

export async function text_to_image(
  options: PostTextToImage,
): Promise<Response> {
  const { image_model, style_preset, batch_size } = options;
  const loras = (options as any).loras as
    { name: string; strength: number }[] | undefined;
  const resolution = options.resolution ?? "720p";
  let prompt = Utils.sanitizeInputText(options.prompt);
  const styleGuide = (options as any).style_guide
    ? Utils.sanitizeInputText(String((options as any).style_guide))
        .slice(0, 2000)
        .trim()
    : undefined;
  if (styleGuide) prompt = `${prompt}\n\nStyle Guide: ${styleGuide}`;

  if (!prompt) {
    throw new Error("Prompt is required");
  }

  const { id: jobId } = await JobOrchestrator.create_job({
    original_prompt: prompt,
    resolution,
    image_model,
    style_preset,
    style_guide: styleGuide,
    loras: loras && loras.length ? JSON.stringify(loras) : null,
  } as any);

  const batchSize = batch_size ?? 1;
  const scheduled: Awaited<
    ReturnType<typeof PromptGenerator.styled_img_to_event>
  >[] = [];

  QueueManager.hold();
  try {
    for (let index = 0; index < batchSize; index++) {
      const event = await PromptGenerator.styled_img_to_event(
        jobId,
        JobMode.Image,
        prompt,
        style_preset,
        index,
        undefined,
        loras,
      );
      scheduled.push(event);
    }
  } finally {
    QueueManager.release();
  }

  if (scheduled.some((event) => !event)) {
    await DB.Jobs.failJob(jobId);
    throw new Error("Failed to schedule one or more image events");
  }

  void QueueManager.pump();

  return new Response(JSON.stringify({ message: "job queued", jobId }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
