export const AUDIO_MODEL_IDS = [
  "ace-step-1.5",
  "yue2",
  "minimax-music-3",
  "stable-audio-3",
] as const;

export type AudioModelId = (typeof AUDIO_MODEL_IDS)[number];

export const SOUND_PRESET_CATEGORIES = [
  "Song",
  "Melody Cover",
  "Underscore",
  "Instrument",
  "SFX",
  "One-shot",
] as const;

export type SoundPresetCategory = (typeof SOUND_PRESET_CATEGORIES)[number];

export const YUE2_SAMPLE_REFERENCE_FILENAME = "yue2_reference_song.flac";

export const SECTION_TAG_PILLS = [
  "[Intro]",
  "[Verse]",
  "[Chorus]",
  "[Bridge]",
  "[Instrumental]",
  "[Outro]",
] as const;

export const MINIMAX_CAPTION_SCAFFOLD =
  "Global Metadata: Genre, mood, tempo (~96 BPM), and harmonic feel.\n\n" +
  "Vocal Details: Lead vocal timbre, delivery, phrasing, and backing harmonies.\n\n" +
  "Arrangement: Core rhythm section, lead instruments, pads, and Intro -> Verse -> Chorus -> Bridge -> Outro dynamic arc.";

export type AudioModelSpec = {
  id: AudioModelId;
  label: string;
  badge: string;
  recommendation: string;
  vramHint: string;
  supportsLyrics: boolean;
  supportsMelodyCover: boolean;
  supportsReprompt: boolean;
  supportsMusicalFraming: boolean;
  minDuration: number;
  maxDuration: number;
  defaultDuration: number;
  instrumentalMarker: string;
  promptLabel: string;
  promptPlaceholder: string;
  promptHint: string;
  lyricsPlaceholder: string;
  lyricsHint: string;
  tips: readonly string[];
  composeDefaultPrompt: string;
  defaultSettings: Record<string, string>;
};

export const AUDIO_MODELS: Record<AudioModelId, AudioModelSpec> = {
  "ace-step-1.5": {
    id: "ace-step-1.5",
    label: "ACE Step 1.5 XL",
    badge: "Fast All-Rounder",
    recommendation:
      "Fast multi-genre songs & instrumentals with explicit BPM, key/scale, and time signature.",
    vramHint: "~10 GB VRAM",
    supportsLyrics: true,
    supportsMelodyCover: false,
    supportsReprompt: false,
    supportsMusicalFraming: true,
    minDuration: 10,
    maxDuration: 720,
    defaultDuration: 60,
    instrumentalMarker: "[instrumental]",
    promptLabel: "Style",
    promptPlaceholder:
      "slow burn ambient pop, intimate piano, glassy synths, soft sub bass",
    promptHint: "Arrangement, instruments, groove, mood",
    lyricsPlaceholder: "A short hook, imagery, or lyrical concept",
    lyricsHint: "Leave blank for an instrumental track",
    tips: [
      "Use concise comma-separated genre, instrument, and production tags.",
      "Set explicit BPM, Key / Scale, and Time signature below to lock musical framing.",
      "Leave Lyrics blank to emit [instrumental] automatically.",
    ],
    composeDefaultPrompt:
      "cinematic underscore, subtle warm synth pads, gentle felt piano, unobtrusive atmospheric bed, no vocals",
    defaultSettings: {
      duration: "60",
      bpm: "72",
      keyscale: "E minor",
      timesignature: "4",
      cfg_scale: "2",
      temperature: "0.85",
      top_p: "0.9",
      steps: "50",
    },
  },
  yue2: {
    id: "yue2",
    label: "YuE2 3B",
    badge: "Best Musical Structure & Melody Cover",
    recommendation:
      "Symbolic ABC Score planning for authentic harmonic progressions plus SheetSage2 Melody Cover from reference audio.",
    vramHint: "~12 GB VRAM (int8)",
    supportsLyrics: true,
    supportsMelodyCover: true,
    supportsReprompt: false,
    supportsMusicalFraming: false,
    minDuration: 10,
    maxDuration: 360,
    defaultDuration: 120,
    instrumentalMarker: "[Instrumental]",
    promptLabel: "Genre & style tags",
    promptPlaceholder:
      "Genre: Indie Pop, Dream Pop. Mood: Warm, Nostalgic. Tempo: 104 BPM. Instruments: Jangle guitar, analog synth, tight drums. Vocal: Clear female lead.",
    promptHint: "Genre, mood, tempo, instruments, and vocal character",
    lyricsPlaceholder:
      "[Intro]\n\n[Verse]\nCity headlights blur into gold\n\n[Chorus]\nStay until the morning breaks",
    lyricsHint:
      "Structure with [Intro], [Verse], [Chorus], [Bridge], [Outro] or leave blank for instrumental",
    tips: [
      "Keep ABC Score planning enabled for richer chord progressions and bar-aligned phrasing.",
      "Upload Reference Audio (.flac, .mp3, .wav) or pick the built-in sample to run SheetSage2 Melody Cover.",
      "Separate lyric sections with blank lines under [Verse] and [Chorus] headers.",
    ],
    composeDefaultPrompt:
      "Genre: Cinematic Ambient, Post-Rock Underscore. Mood: Reflective, Spacious. Instruments: Felt piano, warm cello swells, soft analog pad, no vocals.",
    defaultSettings: {
      duration: "120",
      yue2_mode: "full",
      abc_planning: "true",
      abc_temperature: "0.7",
      abc_top_p: "0.9",
      temperature: "1",
      top_p: "0.95",
      cfg_scale: "1",
      steps: "32",
    },
  },
  "minimax-music-3": {
    id: "minimax-music-3",
    label: "MiniMax Music 3",
    badge: "Studio Vocal & Production Flagship",
    recommendation:
      "Highest studio vocal clarity, mix depth, and dynamic song transitions.",
    vramHint: "~18 GB VRAM (int8 + tiled decode)",
    supportsLyrics: true,
    supportsMelodyCover: false,
    supportsReprompt: false,
    supportsMusicalFraming: false,
    minDuration: 10,
    maxDuration: 300,
    defaultDuration: 120,
    instrumentalMarker: "[Instrumental]",
    promptLabel: "Production caption",
    promptPlaceholder:
      "Global Metadata: Modern neo-soul ballad at 88 BPM with warm studio intimacy.\n\nVocal Details: Smooth close-miked alto lead with soft stacked chorus harmonies.\n\nArrangement: Rhodes electric piano, deep fingerstyle bass, crisp rimshot drums building from a sparse intro into a lush layered chorus.",
    promptHint:
      "3-part studio caption: Global Metadata, Vocal Details, Arrangement",
    lyricsPlaceholder:
      "[Intro]\n\n[Verse 1]\nLate rain on the studio glass\n\n[Chorus]\nHold the frequency steady tonight",
    lyricsHint:
      "Section-tagged lyrics ([Verse], [Chorus], [Bridge]) or leave blank for [Instrumental]",
    tips: [
      "Click 'Insert 3-part scaffold' to structure Global Metadata, Vocal Details, and Arrangement paragraphs.",
      "Keep Tiled VAE decode enabled in Advanced to prevent VRAM spikes on full-length tracks.",
      "Leave Lyrics empty for pure [Instrumental] studio backing tracks.",
    ],
    composeDefaultPrompt:
      "Global Metadata: Subtle documentary underscore at 84 BPM, warm and unobtrusive.\n\nVocal Details: Instrumental only, zero vocals.\n\nArrangement: Muted felt piano, airy analog pad, soft sub pulse in a smooth continuous bed with gentle harmonic movement.",
    defaultSettings: {
      duration: "120",
      minimax_precision: "int8",
      tiled_decode: "true",
      cfg_scale: "1.7",
      top_k: "50",
      steps: "30",
    },
  },
  "stable-audio-3": {
    id: "stable-audio-3",
    label: "Stable Audio 3",
    badge: "Instrumental, Loops & SFX Specialist",
    recommendation:
      "Fast 8-step instrumental stems, underscore beds, foley SFX, and one-shots up to 180s.",
    vramHint: "~8 GB VRAM (+4 GB with Reprompting)",
    supportsLyrics: false,
    supportsMelodyCover: false,
    supportsReprompt: true,
    supportsMusicalFraming: false,
    minDuration: 5,
    maxDuration: 180,
    defaultDuration: 30,
    instrumentalMarker: "",
    promptLabel: "Sound / Instrumental description",
    promptPlaceholder:
      "Warm analog synth arpeggio underscore at 100 BPM, clean stereo tape saturation, no vocals",
    promptHint:
      "Instrumental bed, stem loop, foley SFX, or one-shot (5–180s, non-vocal)",
    lyricsPlaceholder: "",
    lyricsHint:
      "Stable Audio 3 generates instrumental audio and sound effects only",
    tips: [
      "Medium (distilled, 8 steps, CFG 1.0) is fast and crisp; switch to Medium Base (50 steps, CFG 7.0) for heavier prompt adherence.",
      "Pick Audio category (Music, Instrument, SFX, One-shot) and enable Qwen3.5 Reprompting when starting from short prompts.",
      "Duration is capped at the model's native 180-second window.",
    ],
    composeDefaultPrompt:
      "Warm cinematic ambient underscore, soft felt piano and gentle analog strings, clean mix, unobtrusive background bed",
    defaultSettings: {
      duration: "30",
      sa3_variant: "medium",
      sa3_audio_type: "Music",
      use_reprompt: "false",
      cfg_scale: "1",
      steps: "8",
    },
  },
};

const VALID_AUDIO_MODEL_SET = new Set<string>(AUDIO_MODEL_IDS);

export function isAudioModelId(value: unknown): value is AudioModelId {
  return typeof value === "string" && VALID_AUDIO_MODEL_SET.has(value);
}

export function normalizeAudioModelId(
  value: unknown,
  fallback: AudioModelId = "ace-step-1.5",
): AudioModelId {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (trimmed === "sa3") return "stable-audio-3";
  if (isAudioModelId(trimmed)) return trimmed;
  return fallback;
}

export function getAudioModel(modelId: unknown): AudioModelSpec {
  return AUDIO_MODELS[normalizeAudioModelId(modelId)];
}

export function listAudioModels(): AudioModelSpec[] {
  return AUDIO_MODEL_IDS.map((id) => AUDIO_MODELS[id]);
}

export function clampAudioDuration(modelId: unknown, seconds: number): number {
  const spec = getAudioModel(modelId);
  if (!Number.isFinite(seconds)) return spec.defaultDuration;
  return Math.min(
    spec.maxDuration,
    Math.max(spec.minDuration, Math.round(seconds)),
  );
}

export function formatModelLyrics(
  modelId: unknown,
  rawLyrics: string | null | undefined,
  opts?: { forceInstrumental?: boolean },
): string {
  const spec = getAudioModel(modelId);
  if (!spec.supportsLyrics) return "";
  if (opts?.forceInstrumental) return spec.instrumentalMarker;
  const trimmed = rawLyrics?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : spec.instrumentalMarker;
}
