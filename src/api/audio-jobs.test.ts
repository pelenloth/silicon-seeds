// src/api/audio-jobs.test.ts
import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import app from "./api/index";
import { PostComposeSchema, PostDistinctAudioSchema } from "./schemas";
import { DB } from "../db/db";
import { migrator } from "../db/migrate";
import { QueueManager } from "../queue/queue-manager";

const createdJobIds: string[] = [];
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
});

describe("Multi-model PostDistinctAudioSchema & PostComposeSchema", () => {
  test("accepts minimal payload for minimax-music-3 and stable-audio-3 without requiring ACE-only bpm/keyscale", () => {
    const mm = PostDistinctAudioSchema.safeParse({
      audio_model: "minimax-music-3",
      instrumental_prompt: "Overview: Lush studio soul",
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
          instrumental_prompt: "Overview: Warm soul.",
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
      if (originalOutputDir === undefined) {
        delete Bun.env.OUTPUT_DIR;
      } else {
        Bun.env.OUTPUT_DIR = originalOutputDir;
      }
      if (tempOut) rmSync(tempOut, { recursive: true, force: true });
    }
  });

  test("resolveComposeUnderscoreSpec clamps speechDuration to model ceiling and applies Sound Preset prompt", async () => {
    // Resolved dynamically so the rest of this file reports its own red failures
    // until the helper is implemented and exported by queue-manager.
    const { resolveComposeUnderscoreSpec } =
      (await import("../queue/queue-manager")) as unknown as {
        resolveComposeUnderscoreSpec: (opts: {
          audioModel: string;
          soundPresetName: string | null;
          speechDuration: number;
        }) => Promise<{
          modelId: string;
          prompt: string;
          lyrics: string;
          duration: number;
        }>;
      };

    const sa3Spec = await resolveComposeUnderscoreSpec({
      audioModel: "stable-audio-3",
      soundPresetName: null,
      speechDuration: 95,
    });
    expect(sa3Spec.modelId).toBe("stable-audio-3");
    expect(sa3Spec.duration).toBe(47);
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
