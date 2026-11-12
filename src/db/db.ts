import { Kysely } from "kysely";
import { BunSqliteDialect } from "kysely-bun-sqlite";
import { Database } from "bun:sqlite";
import { Generated } from "kysely";
import { Metadata } from "../meta/meta";
import { mkdirSync, existsSync, copyFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  Event,
  JobEvent,
  JobLifecycleStatus,
  JobMode,
  JobStatus,
} from "../events/events";
import { JobUpdates } from "../sse/job-updates";
import { Lora } from "../styles/presets";
import { Utils } from "../utils/utils";
import { clampGalleryLimit, pickGalleryPage } from "../media/gallery-page";
import { finalizeDecision } from "../jobs/job-summary";
import { JOB_CANCELLED_ERROR } from "../shared/job-cancel";

export interface DbSchema {
  settings: {
    key: string;
    value: string;
  };
  style_presets: {
    id: string;
    name: string;
    description: string | null;
    primary_style: string;
    secondary_trigger: string | null;
    styles_json: string;
    texture: string | null;
    created_at: Generated<string> | string;
  };
  loras: {
    id: string;
    comfyui_name: string;
    display_name: string;
    trigger_word: string | null;
    is_active: number;
    sort_order: number;
    created_at: Generated<string> | string;
  };
  jobs: {
    id: string;
    created_at: Generated<string> | string;
    status: JobLifecycleStatus;
    name: string;
    workflow?: string | null;
    loras?: string | null;
    original_prompt?: string | null;
    fps?: number;
    clip_duration?: number;
    transition_duration?: number;
    resolution?: string;
    image_model?: string;
    video_model?: string;
    audio_model?: string;
    style_preset?: string;
    style_guide?: string | null;
  };
  events: {
    id: string;
    created_at: Generated<string> | string;
    job_id: string;
    mode: JobMode;
    status: JobStatus;
    priority: number;
    type: Event;
    text: string | null;
    prompt: string | null;
    filename: string | null;
    start_img: string | null;
    end_img: string | null;
    duration: number | null;
    lyrics: string | null;
    audio_settings: string | null;
    lora: Lora | null;
    index: number | null;
    claimed_at: string | null;
    attempt_count: number;
    error: string | null;
  };
  meta: {
    id: string;
    event_id: string;
    filename: string;
    subfolder: string;
    type: "input" | "output" | "temp";
  };
}

export type JobsSchema = Omit<DbSchema["jobs"], "created_at"> & {
  created_at: string;
};
export type EventsSchema = DbSchema["events"];
export type MetaSchema = DbSchema["meta"];
export type EventRow = Omit<DbSchema["events"], "created_at"> & {
  created_at: string;
};

export type CreateJob = Omit<
  DbSchema["jobs"],
  "id" | "created_at" | "status" | "name"
>;

type InsertJob = CreateJob & {
  name: string;
};

export namespace DB {
  const dbPath = (
    Bun.env.DB_PATH?.trim() || "data/silicon-seeds.sqlite"
  ).trim();
  try {
    mkdirSync(dirname(dbPath), { recursive: true });
  } catch (e) {
    // let Database throw with clearer context if parent dir uncreatable
    console.error(`[DB] mkdir failed for ${dirname(dbPath)}:`, e);
  }
  try {
    if (!existsSync(dbPath) && existsSync("silicon-seeds.sqlite")) {
      copyFileSync("silicon-seeds.sqlite", dbPath);
    }
  } catch (e) {
    console.error(`[DB] legacy migration failed:`, e);
  }

  export const db = new Kysely<DbSchema>({
    dialect: new BunSqliteDialect({
      database: new Database(dbPath),
    }),
  });

  function notifyJob(jobId: string) {
    JobUpdates.publish(jobId);
  }

  async function notifyJobForEvent(eventId: string) {
    const event = await db
      .selectFrom("events")
      .select("job_id")
      .where("id", "=", eventId)
      .executeTakeFirst();

    if (event) {
      notifyJob(event.job_id);
    }
  }

  export namespace Jobs {
    export type CancelJobResult = {
      job: JobsSchema;
      runningPromptId: string | null;
      pendingPromptIds: string[];
    };

    export async function create_job(payload: InsertJob) {
      const createdAt = new Date().toISOString();

      const job = await db
        .insertInto("jobs")
        .values({
          id: Metadata.randomId(),
          created_at: createdAt,
          status: JobLifecycleStatus.Active,
          ...payload,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      notifyJob(job.id);
      return job;
    }

    export async function list(limit = 100) {
      return await DB.db
        .selectFrom("jobs")
        .selectAll()
        .orderBy("created_at", "desc")
        .limit(limit)
        .execute();
    }

    export async function findById(id: string): Promise<JobsSchema> {
      return await DB.db
        .selectFrom("jobs")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirstOrThrow();
    }

    export async function findByIdOrNull(
      id: string,
    ): Promise<JobsSchema | undefined> {
      return await DB.db
        .selectFrom("jobs")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    }

    export async function findByName(name: string) {
      return await DB.db
        .selectFrom("jobs")
        .select(["id", "name"])
        .where("name", "=", name)
        .executeTakeFirst();
    }

    export async function eventSignatures(jobIds: string[]) {
      if (jobIds.length === 0) return [];
      return await db
        .selectFrom("events")
        .select(["job_id", "type", "mode", "status"])
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("job_id", "in", jobIds)
        .groupBy(["job_id", "type", "mode", "status"])
        .execute();
    }

    export async function outputFiles(jobIds: string[]) {
      if (jobIds.length === 0) return [];
      return await db
        .selectFrom("meta")
        .innerJoin("events", "events.id", "meta.event_id")
        .select(["events.job_id as job_id", "meta.filename", "meta.subfolder"])
        .where("meta.type", "=", "output")
        .where("events.job_id", "in", jobIds)
        .orderBy("meta.id", "asc")
        .execute();
    }

    export async function deleteById(id: string) {
      await db.transaction().execute(async (trx) => {
        const eventRows = await trx
          .selectFrom("events")
          .select("id")
          .where("job_id", "=", id)
          .execute();
        const eventIds = eventRows.map((r) => r.id);
        if (eventIds.length > 0) {
          await trx
            .deleteFrom("meta")
            .where("event_id", "in", eventIds)
            .execute();
        }

        // First delete all related events to avoid orphaned records
        await trx.deleteFrom("events").where("job_id", "=", id).execute();

        // Then delete the job
        await trx.deleteFrom("jobs").where("id", "=", id).execute();
      });
    }

    export async function updateStatus(id: string, status: JobLifecycleStatus) {
      const job = await db
        .updateTable("jobs")
        .set({ status })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();

      notifyJob(job.id);
      return job;
    }

    export async function failJob(id: string) {
      await db.transaction().execute(async (trx) => {
        const updatedJob = await trx
          .updateTable("jobs")
          .set({ status: JobLifecycleStatus.Failed })
          .where("id", "=", id)
          .where("status", "=", JobLifecycleStatus.Active)
          .returning("id")
          .executeTakeFirst();

        if (!updatedJob) {
          return;
        }

        await trx
          .updateTable("events")
          .set({
            status: JobStatus.Failed,
            claimed_at: null,
            error: "job failed",
          })
          .where("job_id", "=", id)
          .where((eb) =>
            eb.or([
              eb("status", "=", JobStatus.Pending),
              eb("status", "=", JobStatus.Running),
            ]),
          )
          .execute();
      });

      notifyJob(id);
    }

    export async function cancelJob(id: string): Promise<CancelJobResult> {
      const result = await db.transaction().execute(async (trx) => {
        const job = await trx
          .selectFrom("jobs")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirstOrThrow();

        const events = await trx
          .selectFrom("events")
          .select(["id", "status"])
          .where("job_id", "=", id)
          .execute();

        const runningPromptId =
          events.find((event) => event.status === JobStatus.Running)?.id ??
          null;
        const pendingPromptIds = events
          .filter((event) => event.status === JobStatus.Pending)
          .map((event) => event.id);

        if (job.status === JobLifecycleStatus.Active) {
          await trx
            .updateTable("jobs")
            .set({ status: JobLifecycleStatus.Cancelled })
            .where("id", "=", id)
            .execute();

          await trx
            .updateTable("events")
            .set({
              status: JobStatus.Failed,
              claimed_at: null,
              error: JOB_CANCELLED_ERROR,
            })
            .where("job_id", "=", id)
            .where((eb) =>
              eb.or([
                eb("status", "=", JobStatus.Pending),
                eb("status", "=", JobStatus.Running),
              ]),
            )
            .execute();
        }

        return {
          job,
          runningPromptId,
          pendingPromptIds,
        };
      });

      notifyJob(id);
      return result;
    }

    export async function pauseJob(id: string): Promise<CancelJobResult> {
      const result = await db.transaction().execute(async (trx) => {
        const job = await trx
          .selectFrom("jobs")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirstOrThrow();

        if (job.status !== JobLifecycleStatus.Active) {
          const err: any = new Error(
            `cannot pause job in status ${job.status}`,
          );
          err.status = 409;
          throw err;
        }

        const events = await trx
          .selectFrom("events")
          .select(["id", "status"])
          .where("job_id", "=", id)
          .execute();

        const runningPromptId =
          events.find((event) => event.status === JobStatus.Running)?.id ??
          null;
        const pendingPromptIds = events
          .filter((event) => event.status === JobStatus.Pending)
          .map((event) => event.id);

        await trx
          .updateTable("jobs")
          .set({ status: JobLifecycleStatus.Paused })
          .where("id", "=", id)
          .execute();

        await trx
          .updateTable("events")
          .set({
            status: JobStatus.Pending,
            claimed_at: null,
          })
          .where("job_id", "=", id)
          .where("status", "=", JobStatus.Running)
          .execute();

        return {
          job: { ...job, status: JobLifecycleStatus.Paused } as JobsSchema,
          runningPromptId,
          pendingPromptIds,
        };
      });

      notifyJob(id);
      return result;
    }

    export async function resumeJob(id: string): Promise<JobsSchema> {
      const job = await db
        .selectFrom("jobs")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirstOrThrow();

      if (job.status !== JobLifecycleStatus.Paused) {
        const err: any = new Error(`cannot resume job in status ${job.status}`);
        err.status = 409;
        throw err;
      }

      const updated = await db
        .updateTable("jobs")
        .set({ status: JobLifecycleStatus.Active })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();

      notifyJob(id);
      return updated;
    }

    export async function retryJob(id: string): Promise<JobsSchema> {
      const result = await db.transaction().execute(async (trx) => {
        const job = await trx
          .selectFrom("jobs")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirstOrThrow();

        if (job.status !== JobLifecycleStatus.Failed) {
          const err: any = new Error(
            `cannot retry job in status ${job.status}`,
          );
          err.status = 409;
          throw err;
        }

        await trx
          .updateTable("jobs")
          .set({ status: JobLifecycleStatus.Active })
          .where("id", "=", id)
          .execute();

        await trx
          .updateTable("events")
          .set({
            status: JobStatus.Pending,
            claimed_at: null,
            error: null,
          })
          .where("job_id", "=", id)
          .where("status", "=", JobStatus.Failed)
          .execute();

        const updated = await trx
          .selectFrom("jobs")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirstOrThrow();

        return updated;
      });

      notifyJob(id);
      return result;
    }

    export async function failBrokenJobs() {
      const brokenJobs = await db
        .selectFrom("jobs")
        .innerJoin("events", "events.job_id", "jobs.id")
        .select("jobs.id")
        .distinct()
        .where("jobs.status", "=", JobLifecycleStatus.Active)
        .where("events.status", "=", JobStatus.Running)
        .execute();

      for (const job of brokenJobs) {
        await failJob(job.id);
      }
    }

    export async function failJobsWithNoEvents() {
      const orphanedJobs = await db
        .selectFrom("jobs")
        .leftJoin("events", "events.job_id", "jobs.id")
        .select("jobs.id")
        .where("jobs.status", "=", JobLifecycleStatus.Active)
        .groupBy("jobs.id")
        .having((eb) => eb.fn.count("events.id"), "=", 0)
        .execute();

      for (const job of orphanedJobs) {
        await failJob(job.id);
      }
    }

    export async function completeJob(id: string) {
      return await updateStatus(id, JobLifecycleStatus.Complete);
    }

    export async function finalizeCompletedJobs() {
      const settledActiveJobs = await db
        .selectFrom("jobs")
        .innerJoin("events", "events.job_id", "jobs.id")
        .select([
          "jobs.id",
          "jobs.workflow",
          "jobs.image_model",
          "jobs.video_model",
          "jobs.audio_model",
        ])
        .distinct()
        .where("jobs.status", "=", JobLifecycleStatus.Active)
        .where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom("events as blocking_events")
                .select("blocking_events.id")
                .whereRef("blocking_events.job_id", "=", "jobs.id")
                .where((innerEb) =>
                  innerEb.or([
                    innerEb("blocking_events.status", "=", JobStatus.Pending),
                    innerEb("blocking_events.status", "=", JobStatus.Running),
                  ]),
                ),
            ),
          ),
        )
        .execute();

      for (const job of settledActiveJobs) {
        const events = await db
          .selectFrom("events")
          .select(["type", "status"])
          .where("job_id", "=", job.id)
          .execute();

        const decision = finalizeDecision({ job, events });
        if (decision === "failed") {
          await updateStatus(job.id, JobLifecycleStatus.Failed);
        } else if (decision === "complete") {
          await completeJob(job.id);
        }
      }
    }
  }

  export namespace Events {
    function eventToRow(event: JobEvent) {
      const base = {
        id: event.id,
        job_id: event.jobId,
        mode: event.mode,
        status: event.status,
        priority: event.priority ?? 0,
        type: event.type,
        prompt: event.prompt,
        claimed_at: event.claimed_at ?? null,
        attempt_count: event.attempt_count ?? 0,
        error: event.error ?? null,
      };

      switch (event.type) {
        case Event.NewTextPrompt:
          return {
            ...base,
            text: event.text,
          };
        case Event.NewImagePrompt: {
          const loras = (event as any).loras as
            { name: string; strength: number }[] | undefined;
          const loraVal =
            loras && loras.length
              ? JSON.stringify(loras)
              : event.lora
                ? JSON.stringify([{ name: event.lora, strength: 0.7 }])
                : null;
          return {
            ...base,
            filename: null,
            lora: loraVal as any,
            lyrics: null,
            audio_settings: null,
            start_img: null,
            end_img: null,
            duration: null,
            index: event.index,
          };
        }
        case Event.NewVideoPrompt:
          return {
            ...base,
            filename: event.filename,
            lyrics: null,
            audio_settings: null,
            start_img: null,
            end_img: null,
            duration: null,
            index: event.index,
          };
        case Event.NewVideoComposition:
          return {
            ...base,
            lyrics: null,
            audio_settings: null,
          };
        case Event.NewTransitionPrompt:
          return {
            ...base,
            filename: null,
            lyrics: null,
            audio_settings: null,
            start_img: event.startImg,
            end_img: event.endImg,
            duration: null,
            index: event.index,
          };
        case Event.NewAudioPrompt:
          const mergedSettings = event.voice_id
            ? { ...(event.audio_settings ?? {}), voice_id: event.voice_id }
            : event.audio_settings;
          return {
            ...base,
            filename: null,
            start_img: null,
            end_img: null,
            duration: event.duration ?? null,
            lyrics: event.lyrics ?? null,
            audio_settings: mergedSettings
              ? JSON.stringify(mergedSettings)
              : null,
          };
      }
    }

    function rowToEvent(row: EventRow): JobEvent {
      const base = {
        id: row.id,
        jobId: row.job_id,
        mode: row.mode,
        status: row.status,
        priority: row.priority,
        type: row.type,
        created_at: row.created_at,
        prompt: row.prompt,
        claimed_at: row.claimed_at ?? undefined,
        attempt_count: row.attempt_count,
        error: row.error,
      };

      switch (row.type) {
        case Event.NewTextPrompt:
          Utils.assert(row.prompt, "'prompt' is null");
          return {
            ...base,
            text: row.text!,
            type: Event.NewTextPrompt,
            prompt: row.prompt,
          };
        case Event.NewImagePrompt:
          Utils.assert(row.prompt, "'prompt' is null");
          {
            let loras: { name: string; strength: number }[] | undefined;
            let loraLegacy: any = row.lora ?? undefined;
            if (row.lora) {
              try {
                const parsed = JSON.parse(row.lora as any);
                if (
                  Array.isArray(parsed) &&
                  parsed.length &&
                  typeof parsed[0] === "object" &&
                  "name" in parsed[0]
                )
                  loras = parsed;
                else if (typeof parsed === "string") loraLegacy = parsed;
              } catch {
                // plain single lora string legacy
                loraLegacy = row.lora;
              }
            }
            return {
              ...base,
              lora: loraLegacy,
              loras,
              index: row.index ?? undefined,
              type: Event.NewImagePrompt,
              prompt: row.prompt,
            } as any;
          }
        case Event.NewVideoPrompt:
          Utils.assert(row.prompt, "'prompt' is null");
          return {
            ...base,
            filename: row.filename ?? null,
            index: row.index ?? undefined,
            type: Event.NewVideoPrompt,
            prompt: row.prompt,
          };
        case Event.NewVideoComposition:
          Utils.assert(row.prompt, "'prompt' is null");
          return {
            ...base,
            type: Event.NewVideoComposition,
            prompt: row.prompt,
          };
        case Event.NewTransitionPrompt:
          Utils.assert(row.prompt, "'prompt' is null");
          return {
            ...base,
            startImg: row.start_img!,
            endImg: row.end_img!,
            index: row.index ?? undefined,
            type: Event.NewTransitionPrompt,
            prompt: row.prompt,
          };
        case Event.NewAudioPrompt:
          const audioSettings = row.audio_settings
            ? (JSON.parse(row.audio_settings) as Record<string, unknown>)
            : undefined;
          return {
            ...base,
            duration: row.duration ?? undefined,
            lyrics: row.lyrics ?? undefined,
            audio_settings: audioSettings,
            voice_id: audioSettings?.voice_id as string | undefined,
            type: Event.NewAudioPrompt,
            prompt: row.prompt ?? "n/a",
          };
        default:
          throw new Error(`Unknown event type`);
      }
    }

    export async function create(payload: JobEvent) {
      const createdAt = payload.created_at ?? new Date().toISOString();

      const res = await db
        .insertInto("events")
        .values({
          ...eventToRow(payload),
          created_at: createdAt,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const event = rowToEvent(res);
      notifyJob(event.jobId);
      return event;
    }

    export async function findById(id: string) {
      const res = await db
        .selectFrom("events")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirstOrThrow();

      return rowToEvent(res);
    }

    export async function updateStatus(id: string, status: JobStatus) {
      const res = await db
        .updateTable("events")
        .set({
          status,
          claimed_at:
            status === JobStatus.Running ? new Date().toISOString() : null,
          error: status === JobStatus.Failed ? "unknown" : null,
        })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();

      const event = rowToEvent(res);
      notifyJob(event.jobId);
      return event;
    }

    export async function resetForRetry(id: string) {
      const res = await db
        .updateTable("events")
        .set({
          status: JobStatus.Pending,
          claimed_at: null,
          error: null,
        })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();

      const event = rowToEvent(res);
      notifyJob(event.jobId);
      return event;
    }

    export async function markComplete(id: string) {
      const res = await db
        .updateTable("events")
        .set({
          status: JobStatus.Complete,
          claimed_at: null,
          error: null,
        })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();

      const event = rowToEvent(res);
      notifyJob(event.jobId);
      return event;
    }

    export async function markFailed(id: string, error: string) {
      const res = await db
        .updateTable("events")
        .set({
          status: JobStatus.Failed,
          claimed_at: null,
          error,
        })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();

      const event = rowToEvent(res);
      notifyJob(event.jobId);
      return event;
    }

    export async function requeueRunning() {
      await db
        .updateTable("events")
        .set({
          status: JobStatus.Pending,
          claimed_at: null,
        })
        .where("status", "=", JobStatus.Running)
        .execute();
    }

    export async function hasRunning() {
      const res = await db
        .selectFrom("events")
        .select("id")
        .where("status", "=", JobStatus.Running)
        .executeTakeFirst();

      return Boolean(res);
    }

    export async function claimNextRunnable() {
      const candidate = await db
        .selectFrom("events")
        .innerJoin("jobs", "jobs.id", "events.job_id")
        .select("events.id")
        .where("events.status", "=", JobStatus.Pending)
        .where("jobs.status", "=", JobLifecycleStatus.Active)
        .orderBy("events.priority", "desc")
        .orderBy("events.index", "asc")
        .orderBy("events.created_at", "asc")
        .executeTakeFirst();

      if (!candidate) return null;

      const res = await db
        .updateTable("events")
        .set({
          status: JobStatus.Running,
          claimed_at: new Date().toISOString(),
          attempt_count: (eb) => eb("attempt_count", "+", 1),
          error: null,
        })
        .where("id", "=", candidate.id)
        .where("status", "=", JobStatus.Pending)
        .returningAll()
        .executeTakeFirst();

      if (!res) return null;

      const event = rowToEvent(res);
      notifyJob(event.jobId);
      return event;
    }

    export async function findByJobId(jobId: string) {
      const res = await db
        .selectFrom("events")
        .selectAll()
        .where("job_id", "=", jobId)
        // Compose mode creates image prompts in parallel, so created_at alone does
        // not preserve scene chronology. Indexed media events must be read by their
        // explicit sequence first.
        .orderBy((eb) =>
          eb.case().when("index", "is not", null).then(0).else(1).end(),
        )
        .orderBy("index", "asc")
        .orderBy("created_at", "asc")
        .orderBy("id", "asc")
        .execute();

      return res.map(rowToEvent);
    }

    export async function findByJobIdChronological(
      jobId: string,
      opts?: { limit?: number; offset?: number },
    ) {
      let query = db
        .selectFrom("events")
        .selectAll()
        .where("job_id", "=", jobId)
        .orderBy("created_at", "asc")
        .orderBy("id", "asc");

      if (opts?.limit !== undefined) {
        query = query.limit(opts.limit);
      }
      if (opts?.offset !== undefined) {
        query = query.offset(opts.offset);
      }

      const res = await query.execute();

      return res.map(rowToEvent);
    }

    export async function countByJobId(jobId: string): Promise<number> {
      const res = await db
        .selectFrom("events")
        .select((eb) => eb.fn.countAll().as("cnt"))
        .where("job_id", "=", jobId)
        .executeTakeFirstOrThrow();
      return Number((res as unknown as { cnt: number }).cnt);
    }

    export async function deleteByIds(ids: string[]) {
      if (ids.length === 0) return;

      const rows = await db
        .selectFrom("events")
        .select(["id", "job_id"])
        .where("id", "in", ids)
        .execute();

      await db.deleteFrom("events").where("id", "in", ids).execute();

      for (const row of rows) {
        notifyJob(row.job_id);
      }
    }
  }

  export namespace Meta {
    export async function create(payload: Omit<MetaSchema, "id">) {
      const res = await db
        .insertInto("meta")
        .orFail()
        .values({
          id: Metadata.randomId(),
          ...payload,
        })
        .execute();

      await notifyJobForEvent(payload.event_id);
      return res;
    }

    export async function findByEventId(eventId: string) {
      const res = await db
        .selectFrom("meta")
        .selectAll()
        .where("event_id", "=", eventId)
        .executeTakeFirstOrThrow();

      return res;
    }

    export async function findManyByEventIds(eventIds: string[]) {
      if (eventIds.length === 0) return [];

      return await db
        .selectFrom("meta")
        .selectAll()
        .where("event_id", "in", eventIds)
        .execute();
    }

    export async function deleteByEventIds(eventIds: string[]) {
      if (eventIds.length === 0) return;

      await db.deleteFrom("meta").where("event_id", "in", eventIds).execute();

      for (const eventId of eventIds) {
        await notifyJobForEvent(eventId);
      }
    }
  }

  export namespace Gallery {
    type ListItemResult = {
      meta_id: string;
      event_id: string;
      filename: string;
      subfolder: string;
      type: "input" | "output" | "temp";
      event_created_at: string;
      job_id: string;
      job_name: string | null;
    };

    type ListItemsOptions = {
      cursor?: string; // meta.id (UUID7) for pagination
      type?: "image" | "video" | "audio";
      limit?: number;
    };

    function getMediaTypeFromExtension(
      filename: string,
    ): "image" | "video" | "audio" | null {
      const ext = filename.split(".").pop()?.toLowerCase();
      if (!ext) return null;

      const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
      const videoExts = ["mp4", "mov", "avi", "mkv", "webm"];
      const audioExts = [
        "mp3",
        "wav",
        "flac",
        "ogg",
        "m4a",
        "aac",
        "wma",
        "opus",
        "aiff",
      ];

      if (imageExts.includes(ext)) return "image";
      if (videoExts.includes(ext)) return "video";
      if (audioExts.includes(ext)) return "audio";
      return null;
    }

    function getOutputAssetPath(subfolder: string, filename: string) {
      const outputDir = Bun.env.OUTPUT_DIR?.replace(/\/$/, "") ?? "";
      const cleanSubfolder = subfolder.replace(/^\/+|\/+$/g, "").trim();

      if (!cleanSubfolder) {
        return `${outputDir}/${filename}`;
      }

      return `${outputDir}/${cleanSubfolder}/${filename}`;
    }

    function getAssetPath(subfolder: string, filename: string) {
      // Prefer CONTENT_LIBRARY_DIR, fallback to OUTPUT_DIR for compat
      // Checks are done by caller via exists(); this returns primary path
      const contentDir = Bun.env.CONTENT_LIBRARY_DIR?.replace(/\/$/, "") ?? "";
      if (contentDir) {
        const cleanSubfolder = subfolder.replace(/^\/+|\/+$/g, "").trim();
        if (!cleanSubfolder) return `${contentDir}/${filename}`;
        return `${contentDir}/${cleanSubfolder}/${filename}`;
      }
      return getOutputAssetPath(subfolder, filename);
    }

    export async function listItemsPage(options: ListItemsOptions = {}) {
      const { cursor, type } = options;
      const limit = clampGalleryLimit(options.limit);
      const scanLimit = limit * 2;

      let query = DB.db
        .selectFrom("meta")
        .innerJoin("events", "events.id", "meta.event_id")
        .innerJoin("jobs", "jobs.id", "events.job_id")
        .select([
          "meta.id as meta_id",
          "meta.event_id",
          "meta.filename",
          "meta.subfolder",
          "meta.type as meta_type",
          "events.created_at as event_created_at",
          "events.status as event_status",
          "events.id as event_id",
          "jobs.id as job_id",
          "jobs.name as job_name",
        ])
        .where("meta.type", "=", "output");

      if (cursor) {
        // UUID7 is sortable - just use < for pagination
        query = query.where("meta.id", "<", cursor);
      }

      if (type) {
        const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
        const videoExts = ["mp4", "mov", "avi", "mkv", "webm"];
        const audioExts = [
          "mp3",
          "wav",
          "flac",
          "ogg",
          "m4a",
          "aac",
          "wma",
          "opus",
          "aiff",
        ];

        const extList =
          type === "image"
            ? imageExts
            : type === "video"
              ? videoExts
              : audioExts;
        query = query.where((eb) =>
          eb.or(extList.map((ext) => eb("meta.filename", "like", `%.${ext}`))),
        );
      }

      const results = await query
        .orderBy("meta.id", "desc") // UUID7 is sortable chronologically!
        .limit(scanLimit)
        .execute();

      const concurrency = 10;
      const items: Array<
        ListItemResult & {
          mediaType: "image" | "video" | "audio";
          created_at: string;
        }
      > = [];
      for (let i = 0; i < results.length; i += concurrency) {
        const chunk = results.slice(i, i + concurrency);
        const chunkItems = await Promise.all(
          chunk.map(async (row) => {
            const mediaType = getMediaTypeFromExtension(row.filename);
            if (!mediaType) return null;

            // Content library is primary (~/content_library), fallback to OUTPUT_DIR
            const primaryPath = getAssetPath(row.subfolder, row.filename);
            const fallbackPath = getOutputAssetPath(
              row.subfolder,
              row.filename,
            );
            let exists = await Bun.file(primaryPath).exists();
            if (!exists && primaryPath !== fallbackPath) {
              exists = await Bun.file(fallbackPath).exists();
            }
            if (!exists) return null;

            return {
              meta_id: row.meta_id,
              event_id: row.event_id,
              filename: row.filename,
              subfolder: row.subfolder,
              type: row.meta_type,
              created_at: row.event_created_at,
              job_id: row.job_id,
              job_name: row.job_name ?? null,
              mediaType,
            } as ListItemResult & {
              mediaType: "image" | "video" | "audio";
              created_at: string;
            };
          }),
        );
        for (const it of chunkItems) if (it) items.push(it);
        if (items.length >= limit) break;
      }

      const lastScannedMetaId =
        results.length > 0 ? results[results.length - 1].meta_id : null;
      return pickGalleryPage({
        limit,
        scanLimit,
        scannedCount: results.length,
        lastScannedMetaId,
        surviving: items,
      });
    }

    export async function listItems(options: ListItemsOptions = {}) {
      const { items } = await listItemsPage(options);
      return items;
    }
  }

  export namespace Settings {
    export async function getAll() {
      const rows = await db.selectFrom("settings").selectAll().execute();
      const map: Record<string, string> = {};
      for (const r of rows) map[r.key] = r.value;
      return map;
    }
    export async function get(key: string) {
      const row = await db
        .selectFrom("settings")
        .selectAll()
        .where("key", "=", key)
        .executeTakeFirst();
      return row?.value ?? null;
    }
    export async function set(key: string, value: string) {
      await db
        .insertInto("settings")
        .values({ key, value })
        .onConflict((oc) => oc.column("key").doUpdateSet({ value }))
        .execute();
    }
    export async function setMany(entries: Record<string, string>) {
      for (const [k, v] of Object.entries(entries)) await set(k, v);
    }
  }

  export namespace StylePresets {
    export async function list() {
      return await db
        .selectFrom("style_presets")
        .selectAll()
        .orderBy("name", "asc")
        .execute();
    }
    export async function findById(id: string) {
      return await db
        .selectFrom("style_presets")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    }
    export async function findByName(name: string) {
      return await db
        .selectFrom("style_presets")
        .selectAll()
        .where("name", "=", name)
        .executeTakeFirst();
    }
    export async function create(data: {
      name: string;
      description?: string | null;
      primary_style: string;
      secondary_trigger?: string | null;
      styles_json: string;
      texture?: string | null;
    }) {
      const id = Metadata.randomId();
      await db
        .insertInto("style_presets")
        .values({
          id,
          ...data,
          description: data.description ?? null,
          secondary_trigger: data.secondary_trigger ?? null,
          texture: data.texture ?? null,
        })
        .execute();
      return await findById(id);
    }
    export async function update(
      id: string,
      data: Partial<{
        name: string;
        description: string | null;
        primary_style: string;
        secondary_trigger: string | null;
        styles_json: string;
        texture: string | null;
      }>,
    ) {
      await db
        .updateTable("style_presets")
        .set(data)
        .where("id", "=", id)
        .execute();
      return await findById(id);
    }
    export async function remove(id: string) {
      await db.deleteFrom("style_presets").where("id", "=", id).execute();
    }
  }

  export namespace Loras {
    export async function list() {
      return await db
        .selectFrom("loras")
        .selectAll()
        .orderBy("sort_order", "asc")
        .execute();
    }
    export async function findById(id: string) {
      return await db
        .selectFrom("loras")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    }
    export async function create(data: {
      comfyui_name: string;
      display_name: string;
      trigger_word?: string | null;
      is_active?: number;
      sort_order: number;
    }) {
      const id = Metadata.randomId();
      await db
        .insertInto("loras")
        .values({
          id,
          comfyui_name: data.comfyui_name,
          display_name: data.display_name,
          trigger_word: data.trigger_word ?? null,
          is_active: data.is_active ?? 1,
          sort_order: data.sort_order,
        })
        .execute();
      return await findById(id);
    }
    export async function update(
      id: string,
      data: Partial<{
        comfyui_name: string;
        display_name: string;
        trigger_word: string | null;
        is_active: number;
        sort_order: number;
      }>,
    ) {
      await db.updateTable("loras").set(data).where("id", "=", id).execute();
      return await findById(id);
    }
    export async function remove(id: string) {
      await db.deleteFrom("loras").where("id", "=", id).execute();
    }
    export async function reorder(ids: string[]) {
      await db.transaction().execute(async (trx) => {
        for (let i = 0; i < ids.length; i++) {
          await trx
            .updateTable("loras")
            .set({ sort_order: i })
            .where("id", "=", ids[i])
            .execute();
        }
      });
    }
    export async function upsertMany(names: string[]) {
      const existing = await list();
      const existingNames = new Set(existing.map((e) => e.comfyui_name));
      let maxOrder = existing.reduce((m, e) => Math.max(m, e.sort_order), -1);
      for (const name of names) {
        if (existingNames.has(name)) continue;
        const display = name
          .replace(/\.safetensors$/i, "")
          .replace(/[_-]/g, " ");
        maxOrder += 1;
        await create({
          comfyui_name: name,
          display_name: display,
          sort_order: maxOrder,
        });
      }
    }
  }
}
