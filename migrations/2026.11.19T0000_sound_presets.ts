import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
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
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  const tables = await db.introspection.getTables();
  const jobsTable = tables.find((t) => t.name === "jobs");
  const hasSoundPreset = jobsTable?.columns.some(
    (c) => c.name === "sound_preset",
  );
  if (!hasSoundPreset) {
    await db.schema
      .alterTable("jobs")
      .addColumn("sound_preset", "text", (col) => col.defaultTo(null))
      .execute();
  }

  for (const [key, value] of [
    ["default_audio_model", "ace-step-1.5"],
    ["default_compose_audio_model", "stable-audio-3"],
  ] as const) {
    await db
      .insertInto("settings")
      .values({ key, value })
      .onConflict((oc) => oc.column("key").doNothing())
      .execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("sound_presets").ifExists().execute();
}
