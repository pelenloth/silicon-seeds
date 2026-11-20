import { comfyClient, ModelVariant } from "../comfyui/comfyui-client";
import {
  Event,
  JobEvent,
  JobMode,
  VideoPromptEvent,
  TransitionPromptEvent,
  VideoCompostionEvent,
  JobStatus,
} from "../events/events";
import { QueueManager } from "../queue/queue-manager";
import { JobOrchestrator } from "../jobs/jobs";
import { spawn } from "bun";
import { Metadata } from "../meta/meta";
import { LLM } from "../llm/llm";
import { Logger } from "../logger/logger";
import { Utils } from "../utils/utils";
import { DB } from "../db/db";
import {
  resolveVideoDimensions,
  type VideoJobSettings,
} from "../shared/video-models";

const OUTPUT_DIR = Bun.env.OUTPUT_DIR;

type OrderedMediaEvent = VideoPromptEvent | TransitionPromptEvent;

function compareByIndex(
  a: { index?: number; created_at?: string; id: string },
  b: { index?: number; created_at?: string; id: string },
) {
  const aIndex = a.index ?? Number.MAX_SAFE_INTEGER;
  const bIndex = b.index ?? Number.MAX_SAFE_INTEGER;

  if (aIndex !== bIndex) return aIndex - bIndex;

  const aCreatedAt = a.created_at ?? "";
  const bCreatedAt = b.created_at ?? "";
  if (aCreatedAt !== bCreatedAt) return aCreatedAt.localeCompare(bCreatedAt);

  return a.id.localeCompare(b.id);
}

function orderedOutputEvents(events: JobEvent[]): OrderedMediaEvent[] {
  const videoEvents = events.filter(
    (e): e is VideoPromptEvent =>
      e.status === JobStatus.Complete && e.type === Event.NewVideoPrompt,
  );

  const transitionEvents = events.filter(
    (e): e is TransitionPromptEvent =>
      e.status === JobStatus.Complete && e.type === Event.NewTransitionPrompt,
  );

  videoEvents.sort(compareByIndex);
  transitionEvents.sort(compareByIndex);

  const outputEvents: OrderedMediaEvent[] = [];
  for (let i = 0; i < videoEvents.length; i++) {
    outputEvents.push(videoEvents[i]);

    if (i < transitionEvents.length) {
      outputEvents.push(transitionEvents[i]);
    }
  }

  return outputEvents;
}

function parseVideoSettings(
  raw: string | null | undefined,
): VideoJobSettings | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as VideoJobSettings)
      : null;
  } catch {
    Logger.warn("Ignoring malformed job video_settings JSON");
    return null;
  }
}

/**
 * ffmpeg args that normalize one concat segment to a common video format and
 * a stereo 48 kHz AAC track. Clips without audio get a silent track so the
 * concat demuxer sees identical stream layouts and native H3 audio survives.
 */
export function buildSegmentNormalizeFfmpegArgs(opts: {
  sourceFile: string;
  normalizedFile: string;
  width: number;
  height: number;
  fps: number;
  hasAudioStream: boolean;
}): string[] {
  const vf = `scale=${opts.width}:${opts.height}:force_original_aspect_ratio=decrease,pad=${opts.width}:${opts.height}:(ow-iw)/2:(oh-ih)/2:black,fps=${opts.fps},format=yuv420p`;
  if (opts.hasAudioStream) {
    return [
      "ffmpeg",
      "-y",
      "-i",
      opts.sourceFile,
      "-vf",
      vf,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      opts.normalizedFile,
    ];
  }
  return [
    "ffmpeg",
    "-y",
    "-i",
    opts.sourceFile,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-c:a",
    "aac",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-shortest",
    "-movflags",
    "+faststart",
    opts.normalizedFile,
  ];
}

export async function probeHasAudioStream(filePath: string): Promise<boolean> {
  try {
    const proc = spawn({
      cmd: [
        "ffprobe",
        "-v",
        "quiet",
        "-select_streams",
        "a",
        "-show_entries",
        "stream=index",
        "-of",
        "json",
        filePath,
      ],
      stdio: ["ignore", "pipe", "ignore"],
    });
    const output = await new Response(proc.stdout).text();
    const status = await proc.exited;
    if (status !== 0) return false;
    const json = JSON.parse(output) as { streams?: unknown[] };
    return Array.isArray(json.streams) && json.streams.length > 0;
  } catch (error) {
    Logger.warn(`ffprobe audio check failed for ${filePath}`, error);
    return false;
  }
}

async function runProcess(cmd: string[], context: string) {
  const process = spawn({
    cmd,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const decoder = new TextDecoder();
  let stderr = "";

  for await (const chunk of process.stderr) {
    stderr += typeof chunk === "string" ? chunk : decoder.decode(chunk);
  }

  const status = await process.exited;
  if (status !== 0) {
    throw new Error(
      `${context} failed with exit code ${status}: ${stderr.trim()}`,
    );
  }
}

export namespace VideoGenerator {
  async function create_video_composition_event(jobId: string, path: string) {
    const videoCompEvent: VideoCompostionEvent = {
      id: Metadata.randomId(),
      jobId,
      mode: JobMode.Video,
      status: JobStatus.Complete,
      type: Event.NewVideoComposition,
      prompt: "n/a",
    };

    // TODO use transaction instead
    await DB.Events.create(videoCompEvent);
    await DB.Meta.create({
      event_id: videoCompEvent.id,
      filename: path,
      subfolder: "",
      type: "output",
    });
  }

  export async function schedule_video(event: {
    jobId: string;
    prompt: string;
    filename: string;
    index?: number;
    video_settings?: Record<string, unknown>;
  }) {
    const task = await JobOrchestrator.schedule_task({
      ...event,
      type: Event.NewVideoPrompt,
      mode: JobMode.Video,
    });

    await QueueManager.pump();
    return task;
  }

  export async function schedule_text_to_video(event: {
    jobId: string;
    prompt: string;
    index?: number;
    video_settings?: Record<string, unknown>;
  }) {
    const task = await JobOrchestrator.schedule_task({
      jobId: event.jobId,
      prompt: event.prompt,
      filename: null as any,
      index: event.index,
      video_settings: event.video_settings,
      type: Event.NewVideoPrompt,
      mode: JobMode.Video,
    });

    await QueueManager.pump();
    return task;
  }

  export async function schedule_transition(event: {
    jobId: string;
    prompt: string;
    startImg: string;
    endImg: string;
    index?: number;
    video_settings?: Record<string, unknown>;
  }) {
    const task = await JobOrchestrator.schedule_task({
      ...event,
      type: Event.NewTransitionPrompt,
      mode: JobMode.Video,
    });

    await QueueManager.pump();
    return task;
  }

  export async function generate_video(
    item: VideoPromptEvent | TransitionPromptEvent,
  ) {
    const job = await DB.Jobs.findById(item.jobId);

    Utils.assert(
      item.type === Event.NewVideoPrompt ||
        item.type === Event.NewTransitionPrompt,
      "Incorrect event type!",
    );

    const { id, prompt } = item;
    const settings = item.video_settings as VideoJobSettings | undefined;

    if (item.type === Event.NewTransitionPrompt) {
      const modelVariant: ModelVariant = {
        id,
        kind: "image-to-transition",
        prompt,
        startImage: item.startImg,
        endImage: item.endImg,
        settings,
      };

      await comfyClient.generate(modelVariant, job);
    }

    if (item.type === Event.NewVideoPrompt) {
      if (item.filename) {
        const modelVariant: ModelVariant = {
          id,
          kind: "image-to-video",
          prompt,
          imagePath: item.filename,
          settings,
        };
        await comfyClient.generate(modelVariant, job);
      } else {
        const modelVariant: ModelVariant = {
          id,
          kind: "text-to-video",
          prompt,
          settings,
        };
        await comfyClient.generate(modelVariant, job);
      }
    }
  }

  /**
   * Continuation sequences: once clip N finishes, extract its last frame and
   * schedule clip N+1 as i2v from that frame. Returns true when the event
   * belongs to a continuation chain that this call handled (scheduled the
   * next clip, or failed the job), false when the caller should fall through
   * to transition handling.
   */
  export async function advance_continuation(
    event: JobEvent,
  ): Promise<boolean> {
    const job = await DB.Jobs.findById(event.jobId);
    const videoSettings = parseVideoSettings(job.video_settings);
    if (videoSettings?.sequence_mode !== "continuation") return false;

    const prompts = videoSettings.sequence_prompts ?? [];
    const currentIndex = (event as VideoPromptEvent).index ?? 0;
    if (currentIndex + 1 >= prompts.length) return false;

    const nextFrame = `${event.id}_cont_last.png`;
    try {
      const inputDir = Bun.env.INPUT_DIR;
      Utils.assert(inputDir, "INPUT_DIR environment variable is not set");
      await runProcess(
        [
          "ffmpeg",
          "-y",
          "-nostdin",
          "-sseof",
          "-0.1",
          "-i",
          `/tmp/${event.jobId}_${event.id}.mp4`,
          "-frames:v",
          "1",
          "-update",
          "1",
          `${inputDir}/${nextFrame}`,
        ],
        `Continuation frame extraction for ${event.id}`,
      );

      await schedule_video({
        jobId: event.jobId,
        prompt: prompts[currentIndex + 1],
        filename: nextFrame,
        index: currentIndex + 1,
        video_settings: {
          ...videoSettings,
          h3_mode: "i2v",
          first_frame: nextFrame,
          last_frame: undefined,
        },
      });
    } catch (error) {
      Logger.error(
        `Continuation clip ${currentIndex + 1} failed for job ${event.jobId}`,
        error,
      );
      await DB.Jobs.failJob(event.jobId);
    }
    return true;
  }

  export async function prepare_transitions(event: JobEvent) {
    const job = await DB.Jobs.findById(event.jobId);
    if (job.workflow === "video") {
      // Direct video jobs only get transitions when explicitly requested;
      // single clips and continuation chains are stitched without them.
      const videoSettings = parseVideoSettings(job.video_settings);
      if (videoSettings?.sequence_mode !== "transition") return null;
    }

    const events = await DB.Events.findByJobId(event.jobId);
    const incompleteClips = events.filter(
      (e) =>
        e.type === Event.NewVideoPrompt &&
        (e.status === JobStatus.Pending || e.status === JobStatus.Running),
    );
    if (incompleteClips.length !== 0) return null;

    const existingTransitions = events.filter(
      (e) => e.type === Event.NewTransitionPrompt,
    );
    if (existingTransitions.length > 0) return null;

    const completedClips = events.filter(
      (e) => e.type === Event.NewVideoPrompt && e.status === JobStatus.Complete,
    ) as VideoPromptEvent[];

    // Sort by index to ensure correct order regardless of generation completion time
    completedClips.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

    const frames: { first: string; last: string }[] = [];
    const prompts: string[] = [];

    for (const clip of completedClips) {
      const tmpFile = `/tmp/${event.jobId}_${clip.id}.mp4`;
      const [first, last] = await video_frames(clip.id, tmpFile);

      frames.push({
        first,
        last,
      });

      prompts.push(clip.prompt);
    }

    const transitions: {
      first: string;
      last: string;
      prompt: string;
      index: number;
    }[] = [];

    for (let i = 0; i < frames.length; i++) {
      const current = frames[i];
      const next = frames[i + 1];

      if (i === frames.length - 1) continue;
      const prompt = await transition_prompt(
        completedClips[i].prompt,
        completedClips[i + 1].prompt,
      );

      // TODO add retry if prompt is null
      if (prompt === null) {
        Logger.warn("Failed to get transition prompt - skipping");
        continue;
      }

      transitions.push({
        first: current.last,
        last: next.first,
        prompt,
        index: i,
      });

      Logger.info(
        `Preparing transition ${i} between clip ${completedClips[i].id} and ${completedClips[i + 1].id}`,
      );
    }

    return transitions;
  }

  async function video_frames(id: string, filePath: string) {
    const { INPUT_DIR } = Bun.env;
    const names = [`${id}_first_frame.png`, `${id}_last_frame.png`];
    const paths = [`${INPUT_DIR}/${names[0]}`, `${INPUT_DIR}/${names[1]}`];

    const processes = [
      {
        args: [
          "ffmpeg",
          "-y",
          "-nostdin",
          "-i",
          filePath,
          "-frames:v",
          "1",
          "-update",
          "1",
          paths[0],
        ],
      },
      {
        args: [
          "ffmpeg",
          "-y",
          "-nostdin",
          "-sseof",
          "-2",
          "-i",
          filePath,
          "-update",
          "1",
          paths[1],
        ],
      },
    ];

    for (const process of processes) {
      const ffmpegProcess = spawn({
        cmd: process.args,
        stdio: ["ignore", "ignore", "ignore"],
      });

      await ffmpegProcess.exited;

      if (ffmpegProcess.exitCode !== 0) {
        throw new Error("Failed to execute 'ffmpgeg'");
      }
    }

    return names;
  }

  async function transition_prompt(first: string, second: string) {
    const instructions = `Here are two different prompts for generating videos based on images.

First prompt:

${first}

Second prompt:

${second}

These two have been used already to generate two separate videos.
Your task is to merge both of these prompts into a single prompt in order to create
a ${Metadata.TRANSITION_DURATION} second long video transition.

The last frame from the first video and the first frame from the second video will
be used in order to generate a transition based on this new merged prompt meaning.

The transition should not be just a simple cut, but consider the visual context because
the transition will be generated using artificial intelligence so it can be a smart
video transition.

For example when there is an object in the first video and also the same object in the
second video then the transition could be described so that the object is being transported
to the new place in a creative way which considers the context of the first and second video.

Generate a creative and meaningful prompt for a video transition!

Your response should only include the newly generated prompt!
`;

    const res = await LLM.message(instructions);
    return res?.content ?? null;
  }

  export async function combine_outputs(jobId: string): Promise<void> {
    Logger.info(`Starting video combination for job ${jobId}`);

    const job = await DB.Jobs.findById(jobId);
    const events = await DB.Events.findByJobId(jobId);
    Logger.info(`Found ${events.length} total events for job ${jobId}`);

    const outputEvents = orderedOutputEvents(events);

    Logger.info(
      `Ordered media events for concat:`,
      outputEvents.map((e) => ({
        type: e.type,
        index: e.index,
      })),
    );

    if (outputEvents.length === 0) {
      Logger.warn(`No complete media events found for job ${jobId}`);
      return;
    }

    if (outputEvents.length <= 1) {
      Logger.info(`Single clip video, skipping composition for job ${jobId}`);
      return;
    }

    const fps = job.fps || Metadata.FPS;
    const { width, height } = resolveVideoDimensions(job.resolution);

    try {
      const files: string[] = [];
      for (let i = 0; i < outputEvents.length; i++) {
        const e = outputEvents[i];
        const sourceFile = `/tmp/${jobId}_${e.id}.mp4`;
        const normalizedFile = `/tmp/${jobId}_${String(i).padStart(3, "0")}_normalized.mp4`;
        const hasAudioStream = await probeHasAudioStream(sourceFile);

        Logger.info(
          `Normalizing file for concat: ${sourceFile} -> ${normalizedFile} (index: ${e.index}, audio: ${hasAudioStream})`,
        );

        await runProcess(
          buildSegmentNormalizeFfmpegArgs({
            sourceFile,
            normalizedFile,
            width,
            height,
            fps,
            hasAudioStream,
          }),
          `Segment normalization for ${sourceFile}`,
        );

        files.push(normalizedFile);
      }

      const fileList = files.map((f) => `file '${f}'`).join("\n") + "\n";
      const listFile = `/tmp/${jobId}_concat.txt`;
      await Bun.write(listFile, fileList);

      const name = `composition_${jobId}.mp4`;
      const out = `${OUTPUT_DIR}/${name}`;
      Logger.info(`Executing ffmpeg to create ${out}`);

      await runProcess(
        [
          "ffmpeg",
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          listFile,
          "-c",
          "copy",
          out,
        ],
        `Video concat for job ${jobId}`,
      );

      await create_video_composition_event(jobId, name);
      Logger.info(`Video combination completed successfully!`);
    } catch (error) {
      Logger.error(
        "Video combination failed:",
        error instanceof Error ? error.message : String(error),
      );
      // Direct video jobs wait on the composition to finish; without one
      // they would stay active forever, so fail them explicitly.
      if (job.workflow === "video") {
        await DB.Jobs.failJob(jobId);
      }
    }

    await DB.Jobs.finalizeCompletedJobs();
  }
}
