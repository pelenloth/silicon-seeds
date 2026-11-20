import { CreateJob, DB } from "../db/db";
import { Event, JobBaseEvent, JobEvent, JobStatus } from "../events/events";
import { Logger } from "../logger/logger";
import { Metadata } from "../meta/meta";
import { PromptGenerator } from "../prompts/prompt-generator";
import { Utils } from "../utils/utils";

export namespace JobOrchestrator {
  function getPriority(event: Pick<JobEvent, "mode" | "type">) {
    if (event.type === Event.NewAudioPrompt) return 300;
    if (event.type === Event.NewImagePrompt) return 200;
    return 100;
  }

  export function init() {
    Event.on(Event.ComfyExecuted, (event) => {
      const output = event.data as Record<string, unknown>;
      const keys = ["audio", "images", "gifs", "videos"];
      const data = keys
        .map((key) => output[key])
        .find((value) => Array.isArray(value)) as
        { filename: string; subfolder: string; type: string }[] | undefined;

      if (!data || data.length === 0) {
        Logger.error("Unknown event data encountered", { data: event.data });
        return;
      }

      Utils.assert(Array.isArray(data), "Metadata is not an array");
      const [metadata] = data;

      void DB.Meta.create({
        event_id: event.id,
        filename: metadata.filename,
        subfolder: metadata.subfolder,
        type: metadata.type as "input" | "output" | "temp",
      });
    });
  }

  export async function create_job(payload: CreateJob) {
    const name = await PromptGenerator.job_name(payload.original_prompt);

    return await DB.Jobs.create_job({
      ...payload,
      name,
    });
  }

  export async function job_events(id: string) {
    return await DB.Events.findByJobId(id);
  }

  export async function update_schedule(event: JobEvent) {
    if (event.status === JobStatus.Pending) {
      return await DB.Events.create({
        ...event,
        priority:
          event.priority && event.priority > 0
            ? event.priority
            : getPriority(event),
      });
    }

    if (event.status === JobStatus.Complete) {
      return await DB.Events.markComplete(event.id);
    }

    if (event.status === JobStatus.Failed) {
      return await DB.Events.markFailed(event.id, event.error ?? "unknown");
    }

    if (event.status === JobStatus.Running) {
      return await DB.Events.updateStatus(event.id, event.status);
    }

    Utils.assert(false, "Invalid job status");
  }

  export async function schedule_task(event: Partial<JobEvent>) {
    const task = create_task(event);
    await update_schedule(task);

    Utils.assert(event.type, "Event is type missing.");
    Event.emit(event.type, task);

    return task;
  }

  // TypeScript sucks
  function create_task(event: Partial<JobEvent>): JobEvent {
    const { id, jobId, mode, type, prompt } = event;
    Utils.assert(jobId && type, "Must provide task type to define a task!");
    Utils.assert(mode, "Must provide 'mode' to define a  task!");

    const base: JobBaseEvent = {
      // TODO only passed in compose endpoint (refactor this)
      id: id ?? Metadata.randomId(),
      status: JobStatus.Pending,
      jobId,
      mode,
      prompt: prompt ?? "n/a",
      priority: 0,
      attempt_count: 0,
      error: null,
    };

    switch (event.type) {
      case Event.NewTextPrompt:
        const { text } = event;
        Utils.assert(prompt, "Must provide 'prompt' to define an image task!");
        Utils.assert(text, "Must provide 'text' to define an image task!");
        return {
          ...base,
          type: Event.NewTextPrompt,
          prompt,
          text,
        };

      case Event.NewImagePrompt:
        Utils.assert(prompt, "Must provide 'prompt' to define an image task!");
        return {
          ...base,
          type: Event.NewImagePrompt,
          prompt,
          lora: event.lora,
          loras: (event as any).loras,
          index: event.index,
        };

      case Event.NewVideoPrompt:
        const { filename } = event as { filename?: string | null };
        Utils.assert(prompt, "Must provide 'prompt' to define an video task!");
        // filename is optional for pure text-to-video (no image)
        return {
          ...base,
          type: Event.NewVideoPrompt,
          prompt,
          filename: filename ?? null,
          video_settings: event.video_settings,
          index: event.index,
        } as any;

      case Event.NewTransitionPrompt:
        const { startImg, endImg } = event;
        Utils.assert(
          prompt,
          "Must provide 'prompt' to define a video transition task!",
        );
        Utils.assert(
          startImg,
          `Must provide '${startImg}' to define a transition task!`,
        );
        Utils.assert(
          endImg,
          `Must provide '${endImg}' to define a transition task!`,
        );

        return {
          ...base,
          type: Event.NewTransitionPrompt,
          prompt,
          startImg,
          endImg,
          video_settings: event.video_settings,
          index: event.index,
        };

      case Event.NewAudioPrompt:
        const { duration, lyrics, audio_settings, voice_id } = event;

        return {
          ...base,
          type: Event.NewAudioPrompt,
          prompt: prompt ?? "n/a",
          duration,
          lyrics,
          audio_settings,
          voice_id,
        };

      default:
        break;
    }

    throw new Error(`Task of type ${event.type} does not exist.`);
  }
}
