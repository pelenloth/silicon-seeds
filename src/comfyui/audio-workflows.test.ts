import { describe, expect, test } from "bun:test";
import aceTemplate from "./api/audio_ace_step1_5_xl_base_instrumental.json";
import sa3Template from "./api/audio_stable_audio_3_medium_base.json";
import { buildAudioWorkflow } from "./audio-workflows";

describe("buildAudioWorkflow", () => {
  test("ace-step-1.5 clones template without mutating imported JSON and sets seed, framing, and SaveAudioMP3 prefix", () => {
    const originalTags = aceTemplate["94"].inputs.tags;
    const originalPrefix = aceTemplate["107"].inputs.filename_prefix;

    const wf = buildAudioWorkflow({
      eventId: "evt-ace-1",
      modelId: "ace-step-1.5",
      prompt: "dreamy synthwave, lush pads",
      lyrics: "[Verse]\nMidnight highway",
      duration: 95,
      seed: 424242,
      settings: {
        bpm: 118,
        keyscale: "A minor",
        timesignature: "4",
        cfg_scale: 3.5,
        temperature: 0.9,
        top_p: 0.92,
        steps: 40,
      },
    });

    expect((wf["109"] as any).inputs.value).toBe(424242);
    expect((wf["94"] as any).inputs.tags).toBe("dreamy synthwave, lush pads");
    expect((wf["94"] as any).inputs.lyrics).toBe("[Verse]\nMidnight highway");
    expect((wf["94"] as any).inputs.duration).toBe(95);
    expect((wf["94"] as any).inputs.bpm).toBe(118);
    expect((wf["94"] as any).inputs.keyscale).toBe("A minor");
    expect((wf["94"] as any).inputs.timesignature).toBe("4");
    expect((wf["94"] as any).inputs.cfg_scale).toBe(3.5);
    expect((wf["98"] as any).inputs.seconds).toBe(95);
    expect((wf["3"] as any).inputs.steps).toBe(40);
    expect((wf["107"] as any).class_type).toBe("SaveAudioMP3");
    expect((wf["107"] as any).inputs.filename_prefix).toBe("evt-ace-1");

    // Imported JSON must remain untouched
    expect(aceTemplate["94"].inputs.tags).toBe(originalTags);
    expect(aceTemplate["107"].inputs.filename_prefix).toBe(originalPrefix);
  });

  test("yue2 text-to-music with ABC planning includes YuE2GenerateABC and omits SheetSage2/LoadAudio", () => {
    const wf = buildAudioWorkflow({
      eventId: "evt-yue-abc",
      modelId: "yue2",
      prompt: "Genre: Indie Rock. Tempo: 120 BPM.",
      lyrics: "[Verse]\nSun on the pavement",
      duration: 150,
      seed: 777,
      settings: {
        yue2_mode: "full",
        abc_planning: true,
        abc_temperature: 0.75,
        abc_top_p: 0.88,
        temperature: 1.05,
        top_p: 0.94,
        steps: 32,
      },
    });

    expect((wf["15"] as any).class_type).toBe("CheckpointLoaderSimple");
    expect((wf["15"] as any).inputs.ckpt_name).toBe(
      "yue2_3b_int8_convrot.safetensors",
    );
    expect((wf["24"] as any).class_type).toBe("YuE2GenerateABC");
    expect((wf["24"] as any).inputs.temperature).toBe(0.75);
    expect((wf["25"] as any).class_type).toBe("YuE2GenerateMusic");
    expect((wf["25"] as any).inputs.abc).toEqual(["24", 0]);
    expect((wf["25"] as any).inputs.max_duration).toBe(150);
    expect((wf["8"] as any).inputs.cfg).toBe(1);
    expect((wf["10"] as any).class_type).toBe("SaveAudioMP3");
    expect((wf["10"] as any).inputs.filename_prefix).toBe("evt-yue-abc");

    expect(wf["41"]).toBeUndefined();
    expect(wf["43"]).toBeUndefined();
    expect(wf["45"]).toBeUndefined();
  });

  test("yue2 direct text-to-music (abc_planning=false) prunes both YuE2GenerateABC and SheetSage2", () => {
    const wf = buildAudioWorkflow({
      eventId: "evt-yue-direct",
      modelId: "yue2",
      prompt: "Genre: Ambient.",
      lyrics: "[Instrumental]",
      duration: 60,
      seed: 888,
      settings: {
        abc_planning: false,
      },
    });

    expect(wf["24"]).toBeUndefined();
    expect(wf["41"]).toBeUndefined();
    expect((wf["25"] as any).inputs.abc).toBe("");
    expect((wf["8"] as any).inputs.cfg).toBe(1.01);
  });

  test("yue2 Melody Cover wires LoadAudio + SheetSage2AudioToABC and prunes YuE2GenerateABC", () => {
    const wf = buildAudioWorkflow({
      eventId: "evt-yue-cover",
      modelId: "yue2",
      prompt: "Genre: Jazz Fusion.",
      lyrics: "[Verse]\nReimagined melody",
      duration: 120,
      seed: 999,
      referenceAudioFilename: "ref_job1_abc.flac",
      settings: {
        abc_planning: true,
      },
    });

    expect(wf["24"]).toBeUndefined();
    expect((wf["45"] as any).class_type).toBe("LoadAudio");
    expect((wf["45"] as any).inputs.audio).toBe("ref_job1_abc.flac");
    expect((wf["43"] as any).class_type).toBe("AudioEncoderLoader");
    expect((wf["43"] as any).inputs.audio_encoder_name).toBe(
      "sheetsage2_bf16.safetensors",
    );
    expect((wf["41"] as any).class_type).toBe("SheetSage2AudioToABC");
    expect((wf["25"] as any).inputs.abc).toEqual(["41", 0]);
    expect((wf["25"] as any).inputs.mode).toBe("melody");
  });

  test("minimax-music-3 prunes untiled/tiled VAE nodes and selects int8 vs fp16 checkpoint", () => {
    const tiled = buildAudioWorkflow({
      eventId: "evt-mm-tiled",
      modelId: "minimax-music-3",
      prompt: "Overview: Neo-soul.",
      lyrics: "[Verse]\nWarm vocals",
      duration: 180,
      seed: 1234,
      settings: {
        minimax_precision: "int8",
        tiled_decode: true,
        cfg_scale: 1.7,
        top_k: 50,
        steps: 30,
      },
    });

    expect((tiled["6"] as any).inputs.unet_name).toBe(
      "minimax_music3_dit_int8_convrot.safetensors",
    );
    expect((tiled["42"] as any).class_type).toBe("VAEDecodeAudioTiled");
    expect(tiled["12"]).toBeUndefined();
    expect((tiled["35"] as any).inputs.audio).toEqual(["42", 0]);
    expect((tiled["35"] as any).inputs.filename_prefix).toBe("evt-mm-tiled");

    const fp16Untiled = buildAudioWorkflow({
      eventId: "evt-mm-fp16",
      modelId: "minimax-music-3",
      prompt: "Overview: Synthpop.",
      lyrics: "[Instrumental]",
      duration: 90,
      seed: 1235,
      settings: {
        minimax_precision: "fp16",
        tiled_decode: false,
      },
    });

    expect((fp16Untiled["6"] as any).inputs.unet_name).toBe(
      "minimax_music3_dit_fp16.safetensors",
    );
    expect((fp16Untiled["12"] as any).class_type).toBe("VAEDecodeAudio");
    expect(fp16Untiled["42"]).toBeUndefined();
    expect((fp16Untiled["35"] as any).inputs.audio).toEqual(["12", 0]);
  });

  test("stable-audio-3 prunes Qwen3.5-2B subgraph when use_reprompt is false and preserves it when true", () => {
    const origPrompt = sa3Template["52:31"].inputs.value;

    const fast = buildAudioWorkflow({
      eventId: "evt-sa3-fast",
      modelId: "stable-audio-3",
      prompt: "crisp foley footsteps on wet gravel",
      lyrics: "",
      duration: 12,
      seed: 555,
      settings: {
        sa3_variant: "medium",
        use_reprompt: false,
      },
    });

    expect((fast["52:25"] as any).inputs.ckpt_name).toBe(
      "stable_audio_3_medium.safetensors",
    );
    expect((fast["52:3"] as any).inputs.steps).toBe(8);
    expect((fast["52:3"] as any).inputs.cfg).toBe(1);
    expect((fast["52:6"] as any).inputs.text).toEqual(["52:31", 0]);
    expect(fast["52:29"]).toBeUndefined();
    expect(fast["52:28"]).toBeUndefined();
    expect(fast["52:34"]).toBeUndefined();
    expect((fast["19"] as any).inputs.filename_prefix).toBe("evt-sa3-fast");

    const reprompt = buildAudioWorkflow({
      eventId: "evt-sa3-reprompt",
      modelId: "stable-audio-3",
      prompt: "sci-fi laser impact",
      lyrics: "",
      duration: 8,
      seed: 556,
      settings: {
        sa3_variant: "medium_base",
        sa3_audio_type: "SFX",
        use_reprompt: true,
      },
    });

    expect((reprompt["52:25"] as any).inputs.ckpt_name).toBe(
      "stable_audio_3_medium_base.safetensors",
    );
    expect((reprompt["52:3"] as any).inputs.steps).toBe(50);
    expect((reprompt["52:3"] as any).inputs.cfg).toBe(7);
    expect((reprompt["52:29"] as any).class_type).toBe("CLIPLoader");
    expect((reprompt["52:43"] as any).inputs.choice).toBe("SFX");
    expect((reprompt["52:43"] as any).inputs.index).toBe(2);
    expect((reprompt["52:6"] as any).inputs.text).toEqual(["52:28", 0]);
    expect(reprompt["52:34"]).toBeUndefined();

    expect(sa3Template["52:31"].inputs.value).toBe(origPrompt);
  });
});
