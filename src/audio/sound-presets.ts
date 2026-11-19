import { DB } from "../db/db";
import {
  normalizeAudioModelId,
  YUE2_SAMPLE_REFERENCE_FILENAME,
  type AudioModelId,
  type SoundPresetCategory,
} from "../shared/audio-models";

export type SoundPresetItem = {
  id: string;
  name: string;
  description: string;
  audio_model: AudioModelId;
  category: SoundPresetCategory;
  instrumental_prompt: string;
  lyric_prompt: string;
  settings: Record<string, unknown>;
  builtin: boolean;
  created_at?: string;
};

export const BUILTIN_SOUND_PRESETS: readonly SoundPresetItem[] = [
  // MiniMax Music 3 (4 presets)
  {
    id: "builtin:minimax-neo-soul",
    name: "Midnight Neo-Soul Ballad",
    description: "Intimate Rhodes, warm fingerstyle bass, studio vocal clarity",
    audio_model: "minimax-music-3",
    category: "Song",
    instrumental_prompt:
      "Overview: Intimate neo-soul ballad at 86 BPM with warm analog studio depth and expressive lead vocals.\n\nInstrumentation: Vintage Suitcase Rhodes, round flatwound bass, brushed snare with crisp rimshots, subtle string swells.\n\nStructure: Sparse Rhodes intro -> intimate verse -> lush stacked-harmony chorus -> warm outro.",
    lyric_prompt:
      "[Intro]\n\n[Verse]\nAmber streetlights paint the rain\nQuiet static on the windowpane\n\n[Chorus]\nStay in the warm low light tonight\nLet the city fade outside",
    settings: {
      duration: 120,
      minimax_precision: "int8",
      tiled_decode: true,
      cfg_scale: 1.7,
      top_k: 50,
      steps: 30,
    },
    builtin: true,
  },
  {
    id: "builtin:minimax-synthpop-anthem",
    name: "Neon Synthpop Anthem",
    description: "Driving 118 BPM analog arps, gated drums, soaring hook",
    audio_model: "minimax-music-3",
    category: "Song",
    instrumental_prompt:
      "Overview: High-energy modern synthpop anthem at 118 BPM with wide stereo polish and bright lead vocals.\n\nInstrumentation: Juno-106 chorus pads, punchy sidechained synth bass, gated LinnDrum snare, shimmering arpeggiator.\n\nStructure: Arpeggiated intro -> driving verse -> explosive pre-chorus lift -> wide stadium chorus.",
    lyric_prompt:
      "[Intro]\n\n[Verse]\nNeon mirrors down the boulevard\nEvery heartbeat running fast and hard\n\n[Chorus]\nTurn the skyline into silver fire\nTake the midnight signal higher",
    settings: {
      duration: 135,
      minimax_precision: "int8",
      tiled_decode: true,
      cfg_scale: 1.8,
      top_k: 50,
      steps: 30,
    },
    builtin: true,
  },
  {
    id: "builtin:minimax-indie-folk",
    name: "Warm Acoustic Indie Folk",
    description: "Fingerpicked acoustic guitar, upright bass, close-mic vocals",
    audio_model: "minimax-music-3",
    category: "Song",
    instrumental_prompt:
      "Overview: Organic indie folk song at 98 BPM with close-miked room warmth and gentle storytelling vocals.\n\nInstrumentation: Fingerpicked dreadnought acoustic guitar, woody upright bass, soft felt kick, distant pedal steel swells.\n\nStructure: Acoustic intro -> gentle verse -> warm harmonized chorus -> quiet instrumental bridge -> outro.",
    lyric_prompt:
      "[Verse]\nPine needles on the gravel road\nMorning mist across the valley floor\n\n[Chorus]\nCarry only what your hands can hold\nLeave the heavy winter at the door",
    settings: {
      duration: 120,
      minimax_precision: "int8",
      tiled_decode: true,
      cfg_scale: 1.7,
      top_k: 50,
      steps: 30,
    },
    builtin: true,
  },
  {
    id: "builtin:minimax-doc-underscore",
    name: "Documentary Studio Underscore",
    description: "Unobtrusive felt piano and airy pads for narrated video",
    audio_model: "minimax-music-3",
    category: "Underscore",
    instrumental_prompt:
      "Overview: Subtle documentary underscore at 82 BPM, contemplative, warm, and voiceover-friendly with zero vocals.\n\nInstrumentation: Muted felt piano ostinato, soft analog string pad, gentle sub bass pulse, delicate marimba harmonics.\n\nStructure: Gradual atmospheric opening -> steady narrative bed -> gentle hopeful resolution.",
    lyric_prompt: "",
    settings: {
      duration: 90,
      minimax_precision: "int8",
      tiled_decode: true,
      cfg_scale: 1.6,
      top_k: 50,
      steps: 30,
    },
    builtin: true,
  },

  // YuE2 3B (4 presets)
  {
    id: "builtin:yue2-dream-pop-abc",
    name: "Dream Pop ABC Arrangement",
    description: "Symbolic ABC chord planning with jangle guitars and vocals",
    audio_model: "yue2",
    category: "Song",
    instrumental_prompt:
      "Genre: Indie Dream Pop, Shoegaze Pop. Mood: Nostalgic, Luminous. Tempo: 108 BPM. Instruments: Chorus-soaked jangle electric guitar, melodic bassline, crisp live drums, airy synth pad. Vocal: Clear expressive female lead.",
    lyric_prompt:
      "[Intro]\n\n[Verse]\nPaper lanterns drifting past the pier\nEvery distant echo crystal clear\n\n[Chorus]\nWe are weightless in the afterglow\nTrading secrets only summers know",
    settings: {
      duration: 120,
      yue2_mode: "full",
      abc_planning: true,
      abc_temperature: 0.7,
      abc_top_p: 0.9,
      temperature: 1.0,
      top_p: 0.95,
      cfg_scale: 1.0,
      steps: 32,
    },
    builtin: true,
  },
  {
    id: "builtin:yue2-jazz-melody-cover",
    name: "Velvet Jazz Melody Cover",
    description:
      "SheetSage2 Melody Cover preset using built-in reference audio",
    audio_model: "yue2",
    category: "Melody Cover",
    instrumental_prompt:
      "Genre: Cool Jazz, Lounge Quartet. Mood: Sophisticated, Late-Night. Tempo: 96 BPM. Instruments: Warm hollow-body jazz guitar, walking upright bass, brushed jazz kit, grand piano voicings. Vocal: Smooth smoky alto.",
    lyric_prompt:
      "[Verse]\nVelvet shadows on a quiet street\n\n[Chorus]\nEvery familiar phrase made brand new",
    settings: {
      duration: 90,
      yue2_mode: "melody",
      abc_planning: true,
      reference_audio_sample: YUE2_SAMPLE_REFERENCE_FILENAME,
      temperature: 1.0,
      top_p: 0.95,
      cfg_scale: 1.0,
      steps: 32,
    },
    builtin: true,
  },
  {
    id: "builtin:yue2-chamber-underscore",
    name: "Chamber Strings Underscore",
    description: "Structured neo-classical chamber score for narration",
    audio_model: "yue2",
    category: "Underscore",
    instrumental_prompt:
      "Genre: Neo-Classical Chamber Score, Cinematic Underscore. Mood: Poignant, Focused. Tempo: 78 BPM. Instruments: Intimate cello, soft viola counterpoint, delicate felt piano arpeggios, no vocals.",
    lyric_prompt: "",
    settings: {
      duration: 90,
      yue2_mode: "full",
      abc_planning: true,
      abc_temperature: 0.65,
      abc_top_p: 0.9,
      temperature: 0.95,
      top_p: 0.95,
      cfg_scale: 1.0,
      steps: 32,
    },
    builtin: true,
  },
  {
    id: "builtin:yue2-alt-rock",
    name: "Driving Alt-Rock Band",
    description: "Full-band symbolic arrangement with dynamic chorus lift",
    audio_model: "yue2",
    category: "Song",
    instrumental_prompt:
      "Genre: Alternative Rock, Post-Britpop. Mood: Anthemic, Energetic. Tempo: 126 BPM. Instruments: Overdriven rhythm guitars, chime lead guitar, punchy P-bass, live stadium drums. Vocal: Earnest baritone rock lead.",
    lyric_prompt:
      "[Intro]\n\n[Verse]\nStatic rising on the overpass\nFootsteps racing through the wet tall grass\n\n[Chorus]\nThrow the windows open to the storm\nSing until the morning air is warm",
    settings: {
      duration: 140,
      yue2_mode: "full",
      abc_planning: true,
      abc_temperature: 0.72,
      abc_top_p: 0.9,
      temperature: 1.0,
      top_p: 0.95,
      cfg_scale: 1.0,
      steps: 32,
    },
    builtin: true,
  },

  // Stable Audio 3 (4 presets)
  {
    id: "builtin:sa3-cinematic-underscore",
    name: "Warm Ambient Underscore",
    description: "Fast 8-step atmospheric underscore bed for Compose videos",
    audio_model: "stable-audio-3",
    category: "Underscore",
    instrumental_prompt:
      "Warm cinematic ambient underscore at 84 BPM, soft felt piano notes, evolving analog string pad, clean low end, unobtrusive background bed, no vocals",
    lyric_prompt: "",
    settings: {
      duration: 35,
      sa3_variant: "medium",
      sa3_audio_type: "Music",
      use_reprompt: false,
      cfg_scale: 1.0,
      steps: 8,
    },
    builtin: true,
  },
  {
    id: "builtin:sa3-breakbeat-loop",
    name: "Crisp Breakbeat Stem Loop",
    description: "Punchy 128 BPM drum & bass stem for editing and layering",
    audio_model: "stable-audio-3",
    category: "Instrument",
    instrumental_prompt:
      "Tight 128 BPM breakbeat drum loop with warm tape compression, crisp ghost-note snare, deep sub-bass groove, studio stem",
    lyric_prompt: "",
    settings: {
      duration: 20,
      sa3_variant: "medium",
      sa3_audio_type: "Instrument",
      use_reprompt: false,
      cfg_scale: 1.0,
      steps: 8,
    },
    builtin: true,
  },
  {
    id: "builtin:sa3-rain-foley-sfx",
    name: "Urban Rain & Thunder SFX",
    description: "Detailed stereo environmental foley with Qwen3.5 Reprompting",
    audio_model: "stable-audio-3",
    category: "SFX",
    instrumental_prompt:
      "Wide stereo foley recording of steady night rain hitting wet asphalt, distant rolling thunder, subtle puddles, high-definition field recording",
    lyric_prompt: "",
    settings: {
      duration: 25,
      sa3_variant: "medium",
      sa3_audio_type: "SFX",
      use_reprompt: true,
      cfg_scale: 1.0,
      steps: 8,
    },
    builtin: true,
  },
  {
    id: "builtin:sa3-braam-oneshot",
    name: "Sci-Fi Sub Impact One-Shot",
    description: "Cinematic trailer impact hit with clean reverb tail",
    audio_model: "stable-audio-3",
    category: "One-shot",
    instrumental_prompt:
      "Massive cinematic sci-fi sub-bass impact one-shot with metallic shimmer and long dark hall reverb decay",
    lyric_prompt: "",
    settings: {
      duration: 8,
      sa3_variant: "medium_base",
      sa3_audio_type: "One-shot",
      use_reprompt: false,
      cfg_scale: 7.0,
      steps: 50,
    },
    builtin: true,
  },

  // ACE Step 1.5 XL (4 presets)
  {
    id: "builtin:ace-lofi-hiphop",
    name: "Dusty Lo-Fi Chillhop",
    description: "76 BPM jazzy vinyl chillhop instrumental with locked key",
    audio_model: "ace-step-1.5",
    category: "Underscore",
    instrumental_prompt:
      "dusty lofi hip-hop, warm jazz Rhodes chords, Boom-bap vinyl drums, mellow upright bass, subtle tape flutter",
    lyric_prompt: "",
    settings: {
      duration: 60,
      bpm: 76,
      keyscale: "D minor",
      timesignature: "4",
      cfg_scale: 2.0,
      temperature: 0.85,
      top_p: 0.9,
      steps: 50,
    },
    builtin: true,
  },
  {
    id: "builtin:ace-french-house",
    name: "Filtered French House Groove",
    description:
      "122 BPM disco-filtered house track with four-on-the-floor kick",
    audio_model: "ace-step-1.5",
    category: "Song",
    instrumental_prompt:
      "filtered French house, funky slap bassline, phaser disco guitar chops, punchy 909 four-on-the-floor drums, vocoder hook",
    lyric_prompt:
      "[Chorus]\nAround the midnight floor again\nKeep the filter sweeping in",
    settings: {
      duration: 90,
      bpm: 122,
      keyscale: "A minor",
      timesignature: "4",
      cfg_scale: 2.5,
      temperature: 0.85,
      top_p: 0.9,
      steps: 50,
    },
    builtin: true,
  },
  {
    id: "builtin:ace-waltz-score",
    name: "Intimate 3/4 Piano Waltz",
    description: "Gentle 3/4 felt piano and cello waltz in E minor",
    audio_model: "ace-step-1.5",
    category: "Underscore",
    instrumental_prompt:
      "intimate neoclassical waltz, close-miked felt piano, solo lyrical cello, warm chamber room reverb, delicate dynamics",
    lyric_prompt: "",
    settings: {
      duration: 75,
      bpm: 108,
      keyscale: "E minor",
      timesignature: "3",
      cfg_scale: 2.0,
      temperature: 0.8,
      top_p: 0.9,
      steps: 50,
    },
    builtin: true,
  },
  {
    id: "builtin:ace-cyberpunk-synthwave",
    name: "Outrun Analog Synthwave",
    description: "Driving 106 BPM darksynth bassline and soaring lead",
    audio_model: "ace-step-1.5",
    category: "Song",
    instrumental_prompt:
      "80s outrun synthwave, rolling 16th-note analog bass, gated reverb snare, brassy CS-80 lead melody, neon night drive",
    lyric_prompt:
      "[Verse]\nChrome reflections on the rain-slicked lane\n\n[Chorus]\nOutrun the horizon line",
    settings: {
      duration: 90,
      bpm: 106,
      keyscale: "F# minor",
      timesignature: "4",
      cfg_scale: 2.5,
      temperature: 0.85,
      top_p: 0.9,
      steps: 50,
    },
    builtin: true,
  },
];

export function isBuiltinSoundPresetId(id: string): boolean {
  return id.startsWith("builtin:");
}

function parseSettingsJson(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore malformed json
  }
  return {};
}

export function mapDbRowToSoundPreset(row: {
  id: number;
  name: string;
  description: string;
  audio_model: string;
  category: string;
  instrumental_prompt: string;
  lyric_prompt: string;
  settings_json: string;
  created_at: string;
}): SoundPresetItem {
  return {
    id: String(row.id),
    name: row.name,
    description: row.description,
    audio_model: normalizeAudioModelId(row.audio_model),
    category: (row.category || "Song") as SoundPresetCategory,
    instrumental_prompt: row.instrumental_prompt,
    lyric_prompt: row.lyric_prompt,
    settings: parseSettingsJson(row.settings_json),
    builtin: false,
    created_at: row.created_at,
  };
}

export async function listMergedSoundPresets(filter?: {
  model?: string;
  category?: string;
}): Promise<SoundPresetItem[]> {
  let customRows: Awaited<ReturnType<typeof DB.SoundPresets.list>> = [];
  try {
    customRows = await DB.SoundPresets.list();
  } catch {
    customRows = [];
  }
  const merged: SoundPresetItem[] = [
    ...BUILTIN_SOUND_PRESETS,
    ...customRows.map((r) => mapDbRowToSoundPreset(r)),
  ];

  const modelFilter = filter?.model?.trim()
    ? normalizeAudioModelId(filter.model)
    : undefined;
  const catFilter = filter?.category?.trim() || undefined;

  return merged.filter((item) => {
    if (modelFilter && item.audio_model !== modelFilter) return false;
    if (catFilter && item.category !== catFilter) return false;
    return true;
  });
}

export async function findSoundPresetByName(
  name: string | null | undefined,
): Promise<SoundPresetItem | undefined> {
  const trimmed = name?.trim();
  if (!trimmed || trimmed === "none") return undefined;

  const builtin = BUILTIN_SOUND_PRESETS.find(
    (p) => p.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (builtin) return builtin;

  try {
    const row = await DB.SoundPresets.findByName(trimmed);
    if (row) return mapDbRowToSoundPreset(row);
  } catch {
    // table may not exist in isolated unit test setups
  }
  return undefined;
}
