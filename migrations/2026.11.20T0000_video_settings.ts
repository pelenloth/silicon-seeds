import { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("jobs")
    .addColumn("video_settings", "text", (col) => col.defaultTo(null))
    .execute();

  await db.schema
    .alterTable("events")
    .addColumn("video_settings", "text", (col) => col.defaultTo(null))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("events").dropColumn("video_settings").execute();
  await db.schema.alterTable("jobs").dropColumn("video_settings").execute();
}
