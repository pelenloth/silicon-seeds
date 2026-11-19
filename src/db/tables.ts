import { Kysely, sql } from "kysely";
import type { DbSchema } from "./db";

export async function createTables(db: Kysely<DbSchema>): Promise<void> {
  await db.schema.dropTable("jobs").ifExists().execute();
  await db.schema.dropTable("events").ifExists().execute();
  await db.schema.dropTable("meta").ifExists().execute();

  await db.schema
    .createTable("jobs")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey().notNull())
    .addColumn("created_at", "text", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .addColumn("status", "text", (col) => col.notNull().defaultTo("active"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("workflow", "text", (col) => col.defaultTo("compose"))
    .addColumn("original_prompt", "text")
    .addColumn("fps", "integer", (col) => col.defaultTo(null))
    .addColumn("clip_duration", "integer", (col) => col.defaultTo(null))
    .addColumn("transition_duration", "integer", (col) => col.defaultTo(null))
    .addColumn("resolution", "text", (col) => col.defaultTo(null))
    .addColumn("image_model", "text", (col) => col.defaultTo(null))
    .addColumn("video_model", "text", (col) => col.defaultTo(null))
    .addColumn("audio_model", "text", (col) => col.defaultTo(null))
    .addColumn("sound_preset", "text", (col) => col.defaultTo(null))
    .addColumn("style_preset", "text", (col) => col.defaultTo(null))
    .addColumn("style_guide", "text", (col) => col.defaultTo(null))
    .addColumn("loras", "text", (col) => col.defaultTo(null))
    .execute();

  await db.schema
    .createTable("events")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey().notNull())
    .addColumn("job_id", "text", (col) => col.notNull().references("jobs.id"))
    .addColumn("type", "text", (col) => col.notNull())
    .addColumn("mode", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
    .addColumn("priority", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("prompt", "text", (col) => col.defaultTo(null))
    .addColumn("text", "text")
    .addColumn("filename", "text")
    .addColumn("start_img", "text")
    .addColumn("end_img", "text")
    .addColumn("duration", "integer")
    .addColumn("lyrics", "text")
    .addColumn("audio_settings", "text")
    .addColumn("lora", "text")
    .addColumn("index", "integer")
    .addColumn("claimed_at", "text")
    .addColumn("attempt_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("error", "text")
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createTable("meta")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey().notNull())
    .addColumn("event_id", "text", (col) =>
      col.notNull().references("events.id"),
    )
    .addColumn("filename", "text", (col) => col.notNull())
    .addColumn("subfolder", "text", (col) => col.notNull())
    .addColumn("type", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("idx_events_job_id")
    .on("events")
    .column("job_id")
    .ifNotExists()
    .execute();

  await db.schema
    .createIndex("idx_events_queue")
    .on("events")
    .columns(["status", "priority", "created_at"])
    .ifNotExists()
    .execute();

  await db.schema
    .createTable("settings")
    .ifNotExists()
    .addColumn("key", "text", (col) => col.primaryKey().notNull())
    .addColumn("value", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("style_presets")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey().notNull())
    .addColumn("name", "text", (col) => col.notNull().unique())
    .addColumn("description", "text")
    .addColumn("primary_style", "text", (col) => col.notNull())
    .addColumn("secondary_trigger", "text")
    .addColumn("styles_json", "text", (col) => col.notNull())
    .addColumn("texture", "text")
    .addColumn("created_at", "text", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();

  await db.schema
    .createTable("loras")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey().notNull())
    .addColumn("comfyui_name", "text", (col) => col.notNull().unique())
    .addColumn("display_name", "text", (col) => col.notNull())
    .addColumn("trigger_word", "text")
    .addColumn("is_active", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("sort_order", "integer", (col) => col.notNull())
    .addColumn("created_at", "text", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();

  await db.schema
    .createTable("sound_presets")
    .ifNotExists()
    .addColumn("id", "integer", (col) =>
      col.primaryKey().autoIncrement().notNull(),
    )
    .addColumn("name", "text", (col) => col.notNull().unique())
    .addColumn("description", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("audio_model", "text", (col) => col.notNull())
    .addColumn("category", "text", (col) => col.notNull().defaultTo("Song"))
    .addColumn("instrumental_prompt", "text", (col) => col.notNull())
    .addColumn("lyric_prompt", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("settings_json", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("created_at", "text", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();
}
