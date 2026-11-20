import EventEmitter from "node:events";
import { Logger } from "../logger/logger";
import { Lora } from "../styles/presets";

export enum JobMode {
  Text = "text",
  Image = "image",
  Video = "video",
  Speech = "speech",
  Song = "song",
  Instrumental = "instrumental",
}

export enum JobLifecycleStatus {
  Active = "active",
  Complete = "complete",
  Failed = "failed",
  Cancelled = "cancelled",
  Paused = "paused",
}

export enum JobStatus {
  Pending = "pending",
  Running = "running",
  Complete = "complete",
  Failed = "failed",
}

interface BaseEvent {
  id: string;
  created_at?: string;
}

export interface Job extends BaseEvent {
  created_at: string;
  status?: JobLifecycleStatus;
  name?: string;
  original_prompt?: string | null;
  fps?: number;
  clip_duration?: number;
  transition_duration?: number;
  resolution?: string;
  image_model?: string;
  video_model?: string;
  audio_model?: string;
  style_preset?: string;
  video_settings?: string | null;
}

export interface JobBaseEvent extends BaseEvent {
  jobId: string;
  mode: JobMode;
  status: JobStatus;
  prompt: string;
  priority?: number;
  claimed_at?: string;
  attempt_count?: number;
  error?: string | null;
  // TODO delete this
  meta?: Record<string, unknown>;
}

export enum Event {
  NewTextPrompt = "new_text_prompt",
  NewImagePrompt = "new_image_prompt",
  NewVideoPrompt = "new_video_prompt",
  NewTransitionPrompt = "new_transition_prompt",
  NewAudioPrompt = "new_audio_prompt",
  NewVideoComposition = "new_video_composition",
  ComfyExecuted = "comfy_executed",
}

export interface TextPromptEvent extends JobBaseEvent {
  prompt: string;
  text: string;
  type: Event.NewTextPrompt;
}

export interface ImagePromptEvent extends JobBaseEvent {
  prompt: string;
  type: Event.NewImagePrompt;
  lora?: Lora;
  loras?: { name: string; strength: number }[];
  index?: number;
}

export interface VideoPromptEvent extends JobBaseEvent {
  prompt: string;
  type: Event.NewVideoPrompt;
  filename?: string | null;
  video_settings?: Record<string, unknown>;
  index?: number;
}

export interface VideoCompostionEvent extends JobBaseEvent {
  type: Event.NewVideoComposition;
  prompt: string;
}

export interface TransitionPromptEvent extends JobBaseEvent {
  prompt: string;
  type: Event.NewTransitionPrompt;
  startImg: string;
  endImg: string;
  video_settings?: Record<string, unknown>;
  index?: number;
}

export interface AudioPromptEvent extends JobBaseEvent {
  prompt: string;
  duration?: number;
  lyrics?: string;
  audio_settings?: Record<string, unknown>;
  voice_id?: string;
  type: Event.NewAudioPrompt;
}

export interface ComfyExecutedEvent extends BaseEvent {
  data: Record<string, unknown>;
}

type EventMap = {
  [Event.NewTextPrompt]: TextPromptEvent;
  [Event.NewImagePrompt]: ImagePromptEvent;
  [Event.NewVideoPrompt]: VideoPromptEvent;
  [Event.NewTransitionPrompt]: TransitionPromptEvent;
  [Event.NewAudioPrompt]: AudioPromptEvent;
  [Event.NewVideoComposition]: VideoCompostionEvent;
  [Event.ComfyExecuted]: ComfyExecutedEvent;
};

export type Events = EventMap[keyof EventMap][];

type JobMap = Omit<EventMap, Event.ComfyExecuted>;
export type JobEvents = JobMap[keyof JobMap][];
export type JobEvent = JobEvents[number];

export namespace Event {
  const events = new EventEmitter();

  export function on<K extends keyof EventMap>(
    event: K,
    callback: (...args: [EventMap[K]]) => void,
  ) {
    events.on(event, callback);
  }

  export function emit<K extends keyof EventMap>(
    event: K,
    ...payload: [EventMap[K]]
  ): void;
  export function emit<K extends keyof EventMap>(event: K): void;
  export function emit<K extends keyof EventMap>(
    event: K,
    ...payload: unknown[]
  ): void {
    if (payload) events.emit(event, ...payload);
    else events.emit(event);
  }

  on(Event.NewTextPrompt, (event) => {
    logEvent(event);
  });

  on(Event.NewImagePrompt, (event) => {
    logEvent(event);
  });

  on(Event.NewVideoPrompt, (event) => {
    logEvent(event);
  });

  on(Event.NewTransitionPrompt, (event) => {
    logEvent(event);
  });

  on(Event.NewAudioPrompt, (event) => {
    logEvent(event);
  });

  function logEvent(event: JobEvent) {
    Logger.info(`===========mode:${event.mode}=============`, event);
  }
}
