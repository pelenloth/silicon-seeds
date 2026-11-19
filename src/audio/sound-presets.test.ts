import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "kysely";
import app from "../api/api/index";
import { DB } from "../db/db";
import { AUDIO_MODEL_IDS } from "../shared/audio-models";
import {
  BUILTIN_SOUND_PRESETS,
  findSoundPresetByName,
  isBuiltinSoundPresetId,
  listMergedSoundPresets,
} from "./sound-presets";

const createdCustomIds: number[] = [];

beforeAll(async () => {
  await DB.db.schema
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
});

afterEach(async () => {
  while (createdCustomIds.length > 0) {
    const id = createdCustomIds.pop()!;
    await DB.SoundPresets.remove(id);
  }
});

describe("Sound Presets service & API", () => {
  test("ships at least 16 curated built-in presets covering all 4 Audio Models", () => {
    expect(BUILTIN_SOUND_PRESETS.length).toBeGreaterThanOrEqual(16);
    for (const modelId of AUDIO_MODEL_IDS) {
      const forModel = BUILTIN_SOUND_PRESETS.filter(
        (p) => p.audio_model === modelId,
      );
      expect(forModel.length).toBeGreaterThanOrEqual(4);
    }
    expect(isBuiltinSoundPresetId("builtin:minimax-neo-soul")).toBe(true);
    expect(isBuiltinSoundPresetId("42")).toBe(false);
  });

  test("GET /sound-presets merges built-ins + custom rows and filters by model", async () => {
    const customName = `Custom Test Synth ${Date.now()}`;
    const created = await DB.SoundPresets.create({
      name: customName,
      description: "Warm custom test preset",
      audio_model: "ace-step-1.5",
      category: "Song",
      instrumental_prompt: "warm analog synth pop",
      lyric_prompt: "[Verse]\nTest line",
      settings_json: JSON.stringify({ bpm: 112, duration: 75 }),
    });
    expect(created).toBeDefined();
    createdCustomIds.push(created!.id);

    const all = await listMergedSoundPresets();
    expect(all.some((p) => p.builtin && p.audio_model === "yue2")).toBe(true);
    expect(all.some((p) => !p.builtin && p.name === customName)).toBe(true);

    const found = await findSoundPresetByName(customName);
    expect(found?.instrumental_prompt).toBe("warm analog synth pop");

    const res = await app.request("/sound-presets?model=yue2");
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      presets: Array<{ audio_model: string }>;
    };
    expect(json.presets.length).toBeGreaterThanOrEqual(4);
    expect(json.presets.every((p) => p.audio_model === "yue2")).toBe(true);
  });

  test("POST, PUT, DELETE /sound-presets enforce 409 conflict on built-in/custom names and 403 on built-in mutation", async () => {
    const builtin = BUILTIN_SOUND_PRESETS[0]!;

    // 403 when trying to edit or delete a built-in preset
    const putBuiltin = await app.request(
      `/sound-presets/${encodeURIComponent(builtin.id)}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: "nope" }),
      },
    );
    expect(putBuiltin.status).toBe(403);

    const delBuiltin = await app.request(
      `/sound-presets/${encodeURIComponent(builtin.id)}`,
      { method: "DELETE" },
    );
    expect(delBuiltin.status).toBe(403);

    // 409 when creating with a built-in name
    const dupBuiltin = await app.request("/sound-presets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: builtin.name,
        audio_model: "ace-step-1.5",
        category: "Song",
        instrumental_prompt: "duplicate name test",
      }),
    });
    expect(dupBuiltin.status).toBe(409);

    // 201 create -> 200 update -> 200 delete custom preset
    const uniqueName = `Ephemeral Preset ${Date.now()}`;
    const createRes = await app.request("/sound-presets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: uniqueName,
        description: "Initial desc",
        audio_model: "stable-audio-3",
        category: "SFX",
        instrumental_prompt: "crisp mechanical keyboard click one-shot",
        lyric_prompt: "",
        settings: { duration: 8, sa3_audio_type: "SFX", use_reprompt: true },
      }),
    });
    expect(createRes.status).toBe(201);
    const createdItem = (await createRes.json()) as {
      id: string;
      name: string;
      builtin: boolean;
      settings: Record<string, unknown>;
    };
    expect(createdItem.builtin).toBe(false);
    expect(createdItem.settings.sa3_audio_type).toBe("SFX");
    createdCustomIds.push(Number(createdItem.id));

    const updateRes = await app.request(`/sound-presets/${createdItem.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        description: "Updated desc",
        settings: { duration: 10, sa3_audio_type: "SFX", use_reprompt: false },
      }),
    });
    expect(updateRes.status).toBe(200);
    const updatedItem = (await updateRes.json()) as {
      description: string;
      settings: Record<string, unknown>;
    };
    expect(updatedItem.description).toBe("Updated desc");
    expect(updatedItem.settings.duration).toBe(10);

    // 200 when sending an empty {} PUT body
    const emptyPutRes = await app.request(`/sound-presets/${createdItem.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(emptyPutRes.status).toBe(200);
    const emptyPutItem = (await emptyPutRes.json()) as {
      id: string;
      description: string;
    };
    expect(emptyPutItem.id).toBe(createdItem.id);
    expect(emptyPutItem.description).toBe("Updated desc");

    // 409 when creating a duplicate custom preset with different casing
    const dupCustomCaseRes = await app.request("/sound-presets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: uniqueName.toUpperCase(),
        audio_model: "ace-step-1.5",
        category: "Song",
        instrumental_prompt: "case-insensitive duplicate test",
      }),
    });
    expect(dupCustomCaseRes.status).toBe(409);

    const deleteRes = await app.request(`/sound-presets/${createdItem.id}`, {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(200);
    createdCustomIds.pop();
  });
});
