// src/api/audio-jobs.test.ts
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import app from "./api/index";
import { PostComposeSchema, PostDistinctAudioSchema } from "./schemas";
import { DB } from "../db/db";
import { migrator } from "../db/migrate";
import { QueueManager } from "../queue/queue-manager";

const createdJobIds: string[] = [];
const createdPresetIds: number[] = [];
let tempOut = "";
let originalOutputDir: string | undefined;

beforeAll(async () => {
  originalOutputDir = Bun.env.OUTPUT_DIR;
  tempOut = mkdtempSync(join(tmpdir(), "ss-audio-jobs-"));
  Bun.env.OUTPUT_DIR = tempOut;
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
});

afterEach(async () => {
  while (createdJobIds.length > 0) {
    const jobId = createdJobIds.pop()!;
    await DB.Jobs.deleteById(jobId);
  }
  while (createdPresetIds.length > 0) {
    const id = createdPresetIds.pop()!;
    await DB.SoundPresets.remove(id);
  }
});

afterAll(() => {
  if (originalOutputDir === undefined) {
    delete Bun.env.OUTPUT_DIR;
  } else {
    Bun.env.OUTPUT_DIR = originalOutputDir;
  }
  if (tempOut) rmSync(tempOut, { recursive: true, force: true });
});

describe("Multi-model PostDistinctAudioSchema & PostComposeSchema", () => {
  test("accepts minimal payload for minimax-music-3 and stable-audio-3 without requiring ACE-only bpm/keyscale", () => {
    const mm = PostDistinctAudioSchema.safeParse({
      audio_model: "minimax-music-3",
      instrumental_prompt: "Global Metadata: Lush studio soul",
      lyric_prompt: "[Verse]\nHello",
      duration: "120",
      minimax_precision: "int8",
      tiled_decode: "true",
    });
    expect(mm.success).toBe(true);

    const sa3 = PostDistinctAudioSchema.safeParse({
      audio_model: "stable-audio-3",
      instrumental_prompt: "Crisp rain foley",
      duration: "15",
      sa3_variant: "medium",
      sa3_audio_type: "SFX",
      use_reprompt: "true",
    });
    expect(sa3.success).toBe(true);

    const compose = PostComposeSchema.safeParse({
      script: "A short documentary narration.",
      image_model: "z-image-turbo",
      video_model: "wan2.2",
      audio_model: "minimax-music-3",
      sound_preset: "Documentary Studio Underscore",
      resolution: "720p",
      fps: "16",
      clip_duration: "5",
      transition_duration: "2",
      style_preset: "none",
    });
    expect(compose.success).toBe(true);
  });

  test("POST /jobs/audio accepts both application/json and multipart/form-data with reference_audio while queue is held", async () => {
    QueueManager.hold();
    try {
      // 1. JSON payload for MiniMax Music 3
      const jsonRes = await app.request("/jobs/audio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          audio_model: "minimax-music-3",
          sound_preset: "Midnight Neo-Soul Ballad",
          instrumental_prompt: "Global Metadata: Warm soul.",
          lyric_prompt: "",
          duration: 90,
          tiled_decode: true,
        }),
      });
      expect(jsonRes.status).toBe(200);
      const { jobId: mmJobId } = (await jsonRes.json()) as { jobId: string };
      createdJobIds.push(mmJobId);

      const mmJob = await DB.Jobs.findById(mmJobId);
      expect(mmJob.audio_model).toBe("minimax-music-3");
      expect(mmJob.sound_preset).toBe("Midnight Neo-Soul Ballad");

      // 2. Multipart FormData with Reference Audio upload for YuE2 Melody Cover
      const fd = new FormData();
      fd.append("audio_model", "yue2");
      fd.append("instrumental_prompt", "Genre: Jazz Quartet.");
      fd.append("lyric_prompt", "[Verse]\nCover test");
      fd.append("duration", "80");
      fd.append(
        "reference_audio",
        new File([new Uint8Array([1, 2, 3, 4])], "melody.flac", {
          type: "audio/flac",
        }),
      );

      const formRes = await app.request("/jobs/audio", {
        method: "POST",
        body: fd,
      });
      expect(formRes.status).toBe(200);
      const { jobId: yueJobId } = (await formRes.json()) as { jobId: string };
      createdJobIds.push(yueJobId);

      const yueEvents = await DB.Events.findByJobIdChronological(yueJobId);
      expect(yueEvents).toHaveLength(1);
      const evt = yueEvents[0] as any;
      expect(evt.audio_settings.audio_model).toBe("yue2");
      expect(evt.audio_settings.reference_audio_filename).toMatch(
        /^ref_.*\.flac$/,
      );
    } finally {
      QueueManager.release();
    }
  });

  test("POST /jobs/audio ignores sound_preset from a mismatched audio_model and strips reference_audio_* from preset settings", async () => {
    QueueManager.hold();
    try {
      // 1. Mismatched preset: passing a MiniMax preset when audio_model is yue2
      const mismatchRes = await app.request("/jobs/audio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          audio_model: "yue2",
          sound_preset: "Midnight Neo-Soul Ballad",
          instrumental_prompt: "Genre: Indie Rock.",
          lyric_prompt: "[Verse]\nHello",
        }),
      });
      expect(mismatchRes.status).toBe(200);
      const { jobId: mismatchJobId } = (await mismatchRes.json()) as {
        jobId: string;
      };
      createdJobIds.push(mismatchJobId);

      const mismatchJob = await DB.Jobs.findById(mismatchJobId);
      expect(mismatchJob.audio_model).toBe("yue2");
      expect(mismatchJob.sound_preset).toBeNull();

      const mismatchEvents =
        await DB.Events.findByJobIdChronological(mismatchJobId);
      expect(mismatchEvents).toHaveLength(1);
      const mismatchEvt = mismatchEvents[0] as any;
      expect(mismatchEvt.audio_settings.minimax_precision).toBeUndefined();
      expect(mismatchEvt.audio_settings.tiled_decode).toBeUndefined();

      // 2. Same-model custom preset with poisoned settings_json in DB
      const poisonedName = `Poisoned YuE2 Preset ${Date.now()}`;
      const createdPreset = await DB.SoundPresets.create({
        name: poisonedName,
        description: "Poisoned settings test",
        audio_model: "yue2",
        category: "Song",
        instrumental_prompt: "Genre: Synthpop.",
        lyric_prompt: "",
        settings_json: JSON.stringify({
          duration: 110,
          abc_planning: true,
          reference_audio_path: "/etc/shadow",
          reference_audio_filename: "../../shadow.flac",
          injected_key: "evil",
        }),
      });
      createdPresetIds.push(createdPreset!.id);

      const cleanRes = await app.request("/jobs/audio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          audio_model: "yue2",
          sound_preset: poisonedName,
          instrumental_prompt: "Genre: Synthpop.",
        }),
      });
      expect(cleanRes.status).toBe(200);
      const { jobId: cleanJobId } = (await cleanRes.json()) as {
        jobId: string;
      };
      createdJobIds.push(cleanJobId);

      const cleanEvents = await DB.Events.findByJobIdChronological(cleanJobId);
      expect(cleanEvents).toHaveLength(1);
      const cleanEvt = cleanEvents[0] as any;
      expect(cleanEvt.duration).toBe(110);
      expect(cleanEvt.audio_settings.abc_planning).toBe(true);
      expect(cleanEvt.audio_settings.reference_audio_path).toBeUndefined();
      expect(cleanEvt.audio_settings.reference_audio_filename).toBeUndefined();
      expect(cleanEvt.audio_settings.injected_key).toBeUndefined();
    } finally {
      QueueManager.release();
    }
  });

  test("resolveComposeUnderscoreSpec clamps speechDuration to model ceiling and applies Sound Preset prompt", async () => {
    const { resolveComposeUnderscoreSpec } =
      await import("../queue/queue-manager");

    const sa3Spec = await resolveComposeUnderscoreSpec({
      audioModel: "stable-audio-3",
      soundPresetName: null,
      speechDuration: 240,
    });
    expect(sa3Spec.modelId).toBe("stable-audio-3");
    expect(sa3Spec.duration).toBe(180);
    expect(sa3Spec.lyrics).toBe("");
    expect(sa3Spec.prompt.length).toBeGreaterThan(10);

    const presetSpec = await resolveComposeUnderscoreSpec({
      audioModel: "minimax-music-3",
      soundPresetName: "Documentary Studio Underscore",
      speechDuration: 110,
    });
    expect(presetSpec.modelId).toBe("minimax-music-3");
    expect(presetSpec.duration).toBe(110);
    expect(presetSpec.lyrics).toBe("[Instrumental]");
    expect(presetSpec.prompt).toContain("documentary underscore");
  });
});
