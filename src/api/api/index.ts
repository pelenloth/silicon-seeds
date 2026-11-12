import { Hono } from "hono";
import { DB } from "../../db/db";
import { health } from "../health";
import { text_to_text } from "./text-to-text";
import { text_to_image } from "./text-to-image";
import { script_to_scenes } from "./script-to-scenes";
import { text_to_image_to_video } from "./text-to-image-to-video";
import { compose_video } from "./compose-video";
import { video_transition } from "./video-transition";

import { text_to_instrumental } from "./text-to-instrumental";
import { text_to_audio } from "./text-to-audio";
import { delete_job } from "./delete";
import { cancel_job } from "./cancel";
import { pause_job } from "./pause";
import { resume_job } from "./resume";
import { retry_job } from "./retry";
import { regenerate_event } from "./regenerate";
import { tts_profiles, tts_profiles_options } from "./tts";
import settingsRoutes from "../settings";
import stylePresetsRoutes from "../style-presets";
import enhanceRoutes from "../enhance";
import lorasRoutes from "../loras";
import comfyuiRoutes from "../comfyui";
import { zValidator } from "@hono/zod-validator";
import {
  PostComposeSchema,
  PostDistinctAudioSchema,
  PostTextToImageSchema,
  PostTextToVideoSchema,
} from "../schemas";
import { validationHook } from "../validation";
import { galleryEtag } from "../gallery-etag";
import { clampGalleryLimit } from "../../media/gallery-page";
import {
  aggregateProgress,
  deriveJobKind,
  mediaTypeFromFilename,
  pickThumb,
  takePage,
  type EventSig,
} from "../../jobs/job-summary";

const app = new Hono();

app.get("/health", () => {
  return health();
});

app.get("/jobs/text", async () => {
  return text_to_text();
});

app.post(
  "/jobs/images",
  zValidator("form", PostTextToImageSchema, validationHook),
  async (c) => {
    const body = c.req.valid("form");
    return text_to_image(body);
  },
);

app.post(
  "/jobs/audio",
  zValidator("form", PostDistinctAudioSchema, validationHook),
  async (c) => {
    const body = c.req.valid("form");
    return text_to_audio(body);
  },
);

app.post("/jobs/scenes", async () => {
  return script_to_scenes();
});

app.post(
  "/jobs/videos",
  zValidator("form", PostTextToVideoSchema, validationHook),
  async (c) => {
    const body = c.req.valid("form");
    return text_to_image_to_video(body);
  },
);

app.post(
  "/jobs/videos/compose",
  zValidator("form", PostComposeSchema, validationHook),
  async (c) => {
    const body = c.req.valid("form");

    return compose_video(body);
  },
);

app.post("/jobs/videos/transition", async () => {
  return video_transition();
});

app.post("/jobs/instrumental", async () => {
  return text_to_instrumental();
});

app.get("/tts/profiles", async () => {
  return tts_profiles();
});

app.get("/tts/profiles-options", async () => {
  return tts_profiles_options();
});

// Delete job endpoint - RESTful: DELETE /api/jobs/:job_id
app.delete("/jobs/:job_id", async (c) => {
  const jobId = c.req.param("job_id");
  return delete_job(c, jobId, {
    source: c.req.query("source") ?? undefined,
    filter: c.req.query("filter") ?? undefined,
    tab: c.req.query("tab") ?? undefined,
  });
});

app.post("/jobs/:job_id/cancel", async (c) => {
  const jobId = c.req.param("job_id");
  return cancel_job(c, jobId, {
    source: c.req.query("source") ?? undefined,
    filter: c.req.query("filter") ?? undefined,
    tab: c.req.query("tab") ?? undefined,
  });
});

app.post("/jobs/:job_id/pause", async (c) => {
  const jobId = c.req.param("job_id");
  return pause_job(c, jobId);
});

app.post("/jobs/:job_id/resume", async (c) => {
  const jobId = c.req.param("job_id");
  return resume_job(c, jobId);
});

app.post("/jobs/:job_id/retry", async (c) => {
  const jobId = c.req.param("job_id");
  return retry_job(c, jobId);
});

app.post("/jobs/:job_id/events/:event_id/regenerate", async (c) => {
  const jobId = c.req.param("job_id");
  const eventId = c.req.param("event_id");
  return regenerate_event(c, jobId, eventId);
});

// --- JSON list/detail endpoints for SolidJS SPA ---

app.get("/jobs", async (c) => {
  const raw = parseInt(c.req.query("limit") ?? "100", 10);
  const limit = Number.isNaN(raw) ? 100 : Math.min(Math.max(raw, 1), 500);
  const jobs = await DB.Jobs.list(limit);
  const ids = jobs.map((j) => j.id);
  const [sigRows, outputRows] = await Promise.all([
    DB.Jobs.eventSignatures(ids),
    DB.Jobs.outputFiles(ids),
  ]);
  const sigs = new Map<string, EventSig[]>();
  for (const r of sigRows) {
    const list = sigs.get(r.job_id) ?? [];
    list.push({
      type: r.type,
      mode: r.mode,
      status: r.status,
      count: Number(r.count),
    });
    sigs.set(r.job_id, list);
  }
  const outputs = new Map<string, { filename: string; subfolder: string }[]>();
  for (const r of outputRows) {
    const list = outputs.get(r.job_id) ?? [];
    list.push({ filename: r.filename, subfolder: r.subfolder });
    outputs.set(r.job_id, list);
  }
  return c.json({
    jobs: jobs.map((j) => {
      const s = sigs.get(j.id) ?? [];
      return {
        ...j,
        kind: deriveJobKind(j, s),
        progress: aggregateProgress(s),
        thumb: pickThumb(outputs.get(j.id) ?? []),
      };
    }),
  });
});

app.get("/jobs/:jobId", async (c) => {
  const jobId = c.req.param("jobId");
  const job = await DB.Jobs.findByIdOrNull(jobId);
  if (!job) return c.json({ error: "Job not found" }, 404);
  const events = await DB.Events.findByJobIdChronological(jobId);
  const sigs: EventSig[] = events.map((e) => ({
    type: e.type,
    mode: e.mode,
    status: e.status,
    count: 1,
  }));
  const kind = deriveJobKind(job, sigs);
  const progress = aggregateProgress(sigs);
  return c.json({ job: { ...job, kind, progress }, events });
});

app.get("/jobs/:jobId/events", async (c) => {
  const jobId = c.req.param("jobId");
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  const limit = parseInt(c.req.query("limit") ?? "20", 10);
  const events = await DB.Events.findByJobIdChronological(jobId);
  const slice = events.slice(
    Number.isNaN(offset) ? 0 : offset,
    (Number.isNaN(offset) ? 0 : offset) +
      (Number.isNaN(limit) ? 20 : Math.min(limit, 50)),
  );
  return c.json({ events: slice, total: events.length });
});

app.get("/jobs/:jobId/media", async (c) => {
  const jobId = c.req.param("jobId");
  const type = c.req.query("type") as string | undefined;
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  const limit = parseInt(c.req.query("limit") ?? "12", 10);
  const offsetVal =
    Number.isNaN(offset) || offset < 0 ? 0 : Math.min(offset, 10000);
  const limitVal =
    Number.isNaN(limit) || limit <= 0 ? 12 : Math.min(limit, 1000);
  const effectiveType =
    type && type !== "all" ? (type as "image" | "video" | "audio") : undefined;
  function getOutputAssetPath(subfolder: string, filename: string) {
    const outputDir = Bun.env.OUTPUT_DIR?.replace(/\/$/, "") ?? "";
    const cleanSubfolder = subfolder.replace(/^\/+|\/+$/g, "").trim();
    if (!cleanSubfolder) return `${outputDir}/${filename}`;
    return `${outputDir}/${cleanSubfolder}/${filename}`;
  }
  function getAssetPathInternal(subfolder: string, filename: string) {
    const contentDir = Bun.env.CONTENT_LIBRARY_DIR?.replace(/\/$/, "") ?? "";
    if (contentDir) {
      const cleanSubfolder = subfolder.replace(/^\/+|\/+$/g, "").trim();
      if (!cleanSubfolder) return `${contentDir}/${filename}`;
      return `${contentDir}/${cleanSubfolder}/${filename}`;
    }
    return getOutputAssetPath(subfolder, filename);
  }
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
      "events.id as event_id",
      "jobs.id as job_id",
      "jobs.name as job_name",
    ])
    .where("meta.type", "=", "output")
    .where("jobs.id", "=", jobId);
  if (effectiveType) {
    const extList =
      effectiveType === "image"
        ? ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"]
        : effectiveType === "video"
          ? ["mp4", "mov", "avi", "mkv", "webm"]
          : ["mp3", "wav", "flac", "ogg", "m4a", "aac", "wma", "opus", "aiff"];
    query = query.where((eb) =>
      eb.or(extList.map((ext) => eb("meta.filename", "like", `%.${ext}`))),
    );
  }
  const scanLimit = limitVal * 2 + offsetVal + 1;
  const results = await query
    .orderBy("meta.id", "desc")
    .limit(scanLimit)
    .execute();
  const concurrency = 10;
  const items: Array<{
    meta_id: string;
    event_id: string;
    filename: string;
    subfolder: string;
    type: string;
    created_at: string;
    job_id: string;
    job_name: string | null;
    mediaType: "image" | "video" | "audio";
  }> = [];
  for (let i = 0; i < results.length; i += concurrency) {
    const chunk = results.slice(i, i + concurrency);
    const chunkItems = await Promise.all(
      chunk.map(async (row) => {
        const mediaType = mediaTypeFromFilename(row.filename);
        if (!mediaType) return null;
        if (effectiveType && mediaType !== effectiveType) return null;
        const primaryPath = getAssetPathInternal(row.subfolder, row.filename);
        const fallbackPath = getOutputAssetPath(row.subfolder, row.filename);
        let exists = await Bun.file(primaryPath).exists();
        if (!exists && primaryPath !== fallbackPath)
          exists = await Bun.file(fallbackPath).exists();
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
        };
      }),
    );
    for (const it of chunkItems) {
      if (it) {
        items.push(it);
        if (items.length >= limitVal + offsetVal + 1) break;
      }
    }
    if (items.length >= limitVal + offsetVal + 1) break;
  }
  const { slice, total, hasMore } = takePage(items, offsetVal, limitVal, {
    scannedCount: results.length,
    scanLimit,
  });
  return c.json({ items: slice, total, hasMore }, 200, {
    "Cache-Control": "no-store",
  });
});

app.route("/settings", settingsRoutes);
app.route("/style-presets", stylePresetsRoutes);
app.route("/enhance", enhanceRoutes);
app.route("/loras", lorasRoutes);
app.route("/comfyui", comfyuiRoutes);

app.get("/gallery/items", async (c) => {
  const cursor = c.req.query("cursor") as string | undefined;
  const type = c.req.query("type") as string | undefined;
  const effectiveLimit = clampGalleryLimit(c.req.query("limit"));
  const effectiveType =
    type && type !== "all" ? (type as "image" | "video" | "audio") : undefined;
  const { items, nextCursor } = await DB.Gallery.listItemsPage({
    cursor,
    limit: effectiveLimit,
    type: effectiveType,
  });
  // ETag + Cache-Control for gallery (Solid client respects 304)
  const etag = galleryEtag(
    { type, cursor, limit: effectiveLimit },
    items,
    nextCursor,
  );
  const ifNoneMatch = c.req.header("If-None-Match");
  if (ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "no-cache" },
    });
  }
  return c.json({ items, next_cursor: nextCursor }, 200, {
    "Cache-Control": "no-cache",
    ETag: etag,
  });
});

export default app;
