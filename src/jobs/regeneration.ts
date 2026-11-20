import { DB } from "../db/db";
import { Event, JobLifecycleStatus, JobStatus } from "../events/events";
import { Logger } from "../logger/logger";
import { QueueManager } from "../queue/queue-manager";

function getOutputAssetPath(subfolder: string, filename: string) {
  const outputDir = Bun.env.OUTPUT_DIR?.replace(/\/$/, "") ?? "";
  const cleanSubfolder = subfolder.replace(/^\/+|\/+$/g, "").trim();

  if (!cleanSubfolder) {
    return `${outputDir}/${filename}`;
  }

  return `${outputDir}/${cleanSubfolder}/${filename}`;
}

async function deleteAssetFiles(eventIds: string[]) {
  const metadata = await DB.Meta.findManyByEventIds(eventIds);

  await Promise.all(
    metadata.map(async (meta) => {
      const file = Bun.file(getOutputAssetPath(meta.subfolder, meta.filename));

      if (!(await file.exists())) return;

      try {
        await file.delete();
      } catch (error) {
        Logger.warn("Failed to delete regenerated asset file", {
          eventId: meta.event_id,
          filename: meta.filename,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function isContinuationSequence(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { sequence_mode?: unknown } | null;
    return parsed?.sequence_mode === "continuation";
  } catch {
    return false;
  }
}

/**
 * Event ids invalidated by regenerating one video clip: the composition, the
 * adjacent transitions and, in a continuation chain, every later clip (each
 * one starts from its predecessor's last frame).
 */
export function videoDerivativeIds(
  events: readonly { id: string; type: string; index?: number | null }[],
  videoEventId: string,
  videoSettings: string | null | undefined,
): string[] {
  const videoEvent = events.find((evt) => evt.id === videoEventId);
  const index =
    videoEvent?.type === Event.NewVideoPrompt ? (videoEvent.index ?? -1) : -1;
  const dropDownstreamClips = isContinuationSequence(videoSettings);

  return unique(
    events
      .filter((evt) => {
        if (evt.id === videoEventId) return false;
        if (evt.type === Event.NewVideoComposition) return true;
        if (
          evt.type === Event.NewTransitionPrompt &&
          evt.index !== undefined &&
          evt.index !== null &&
          (evt.index === index || evt.index === index - 1)
        ) {
          return true;
        }
        if (
          dropDownstreamClips &&
          evt.type === Event.NewVideoPrompt &&
          evt.index !== undefined &&
          evt.index !== null &&
          // the first clip may be stored without an index (treated as 0)
          evt.index > Math.max(index, 0)
        ) {
          return true;
        }
        return false;
      })
      .map((evt) => evt.id),
  );
}

export namespace RegenerationService {
  export async function regenerate(jobId: string, eventId: string) {
    const job = await DB.Jobs.findById(jobId);
    if (job.status !== JobLifecycleStatus.Active) {
      await DB.Jobs.updateStatus(jobId, JobLifecycleStatus.Active);
    }

    const event = await DB.Events.findById(eventId);
    if (event.jobId !== jobId) {
      throw new Error("Event does not belong to job");
    }

    if (
      event.type !== Event.NewImagePrompt &&
      event.type !== Event.NewVideoPrompt &&
      event.type !== Event.NewTransitionPrompt
    ) {
      throw new Error("Event type does not support regeneration");
    }

    if (event.status === JobStatus.Running) {
      throw new Error("Cannot regenerate a running event");
    }

    const events = await DB.Events.findByJobId(jobId);
    if (events.some((evt) => evt.status === JobStatus.Running)) {
      throw new Error("Cannot regenerate while the job is running");
    }

    if (event.type === Event.NewImagePrompt) {
      await invalidateImageDerivatives(events, eventId);
    }

    if (event.type === Event.NewVideoPrompt) {
      await invalidateVideoDerivatives(events, eventId, job.video_settings);
    }

    if (event.type === Event.NewTransitionPrompt) {
      await invalidateComposition(events);
    }

    await deleteAssetFiles([eventId]);
    if (event.status === JobStatus.Complete) {
      await DB.Meta.deleteByEventIds([eventId]);
    }
    await DB.Events.resetForRetry(eventId);
    void QueueManager.pump();
  }

  async function invalidateImageDerivatives(
    events: Awaited<ReturnType<typeof DB.Events.findByJobId>>,
    imageEventId: string,
  ) {
    const imageEvent = events.find((evt) => evt.id === imageEventId);
    const index =
      imageEvent?.type === Event.NewImagePrompt ? imageEvent.index : undefined;

    const dependentIds = unique(
      events
        .filter((evt) => {
          if (evt.type === Event.NewVideoComposition) return true;
          if (evt.type === Event.NewTransitionPrompt) return true;
          if (evt.type === Event.NewVideoPrompt && evt.index === index)
            return true;
          return false;
        })
        .map((evt) => evt.id),
    );

    const derivedIds = dependentIds.filter((id) => id !== imageEventId);

    await deleteAssetFiles(dependentIds);
    await DB.Meta.deleteByEventIds(dependentIds);
    await DB.Events.deleteByIds(derivedIds);
  }

  async function invalidateVideoDerivatives(
    events: Awaited<ReturnType<typeof DB.Events.findByJobId>>,
    videoEventId: string,
    videoSettings: string | null | undefined,
  ) {
    const dependentIds = videoDerivativeIds(
      events,
      videoEventId,
      videoSettings,
    );

    await deleteAssetFiles(dependentIds);
    await DB.Meta.deleteByEventIds(dependentIds);
    await DB.Events.deleteByIds(dependentIds);
  }

  async function invalidateComposition(
    events: Awaited<ReturnType<typeof DB.Events.findByJobId>>,
  ) {
    const compositionIds = events
      .filter((evt) => evt.type === Event.NewVideoComposition)
      .map((evt) => evt.id);

    await deleteAssetFiles(compositionIds);
    await DB.Meta.deleteByEventIds(compositionIds);
    await DB.Events.deleteByIds(compositionIds);
  }
}
