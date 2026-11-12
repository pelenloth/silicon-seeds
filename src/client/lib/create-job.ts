import { ApiError, apiSend } from "./api-client";
import type { GenerationDefaults } from "./defaults";
import type { JobKind } from "./job-view";

export type CreateKind =
  "image" | "video" | "text-to-video" | "audio" | "compose";

export const CREATE_KINDS: Record<
  CreateKind,
  { label: string; route: string; endpoint: string; jobKind: JobKind }
> = {
  image: {
    label: "Image",
    route: "/create/image",
    endpoint: "/api/jobs/images",
    jobKind: "image",
  },
  video: {
    label: "Video",
    route: "/create/video",
    endpoint: "/api/jobs/videos",
    jobKind: "video",
  },
  "text-to-video": {
    label: "Text to Video",
    route: "/create/text-to-video",
    endpoint: "/api/jobs/videos",
    jobKind: "video",
  },
  audio: {
    label: "Audio",
    route: "/create/audio",
    endpoint: "/api/jobs/audio",
    jobKind: "audio",
  },
  compose: {
    label: "Compose",
    route: "/compose",
    endpoint: "/api/jobs/videos/compose",
    jobKind: "compose",
  },
};

export const AUDIO_DEFAULTS = {
  duration: "60",
  bpm: "72",
  cfg_scale: "2",
  temperature: "0.85",
  top_p: "0.9",
  keyscale: "E minor",
  timesignature: "4",
} as const;

export function quickCreateValues(
  kind: Exclude<CreateKind, "compose">,
  prompt: string,
  d: GenerationDefaults,
  overrides?: Record<string, string>,
): Record<string, string> {
  switch (kind) {
    case "image":
      return {
        prompt,
        resolution: d.resolution,
        image_model: d.image_model,
        style_preset: d.style_preset,
        batch_size: "1",
        ...overrides,
      };
    case "video":
      return {
        prompt,
        resolution: d.resolution,
        video_model: d.video_model,
        fps: String(d.fps),
        clip_duration: String(d.clip_duration),
        style_preset: d.style_preset,
        ...overrides,
      };
    case "text-to-video":
      return {
        prompt,
        resolution: d.resolution,
        video_model: d.video_model,
        fps: String(d.fps),
        clip_duration: String(d.clip_duration),
        ...overrides,
      };
    case "audio":
      return {
        instrumental_prompt: prompt,
        lyric_prompt: "",
        ...AUDIO_DEFAULTS,
        ...overrides,
      };
  }
}

export function toFormData(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) {
    fd.append(k, v);
  }
  return fd;
}

export type RequiredRule<K extends string = string> = {
  field: K;
  message: string;
};

export type MaxLengthRule<K extends string = string> = {
  field: K;
  max: number;
  label?: string;
};

export type NumericRangeRule<K extends string = string> = {
  field: K;
  min: number;
  max: number;
  integer?: boolean;
  label?: string;
};

export type CreateValidationRules<
  K extends string = string,
  T extends Record<string, string> = Record<string, string>,
> = {
  required?: readonly RequiredRule<K>[];
  maxLengths?: readonly MaxLengthRule<K>[];
  ranges?: readonly NumericRangeRule<K>[];
  loras?: readonly { name: string; strength: number }[];
  validate?: (values: T) => Record<string, string> | void;
};

export function validateCreateFields<T extends Record<string, string>>(
  values: T,
  rules: CreateValidationRules<keyof T & string, T>,
): { errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const mark = (field: string, msg: string) => {
    if (!Object.hasOwn(errors, field)) {
      errors[field] = msg;
    }
  };

  if (rules.required) {
    for (const req of rules.required) {
      const val = values[req.field] ?? "";
      if (!val.trim()) {
        mark(req.field, req.message);
      }
    }
  }

  if (rules.validate) {
    const custom = rules.validate(values);
    if (custom) {
      for (const [k, msg] of Object.entries(custom)) {
        if (msg) {
          mark(k, msg);
        }
      }
    }
  }

  if (rules.maxLengths) {
    for (const ml of rules.maxLengths) {
      const val = values[ml.field] ?? "";
      if (val.length > ml.max) {
        const label = ml.label ?? ml.field;
        mark(ml.field, `${label} must be at most ${ml.max} characters`);
      }
    }
  }

  if (rules.ranges) {
    for (const rng of rules.ranges) {
      const raw = (values[rng.field] ?? "").trim();
      if (!raw) continue;
      const num = Number(raw);
      const label = rng.label ?? rng.field;
      if (
        !Number.isFinite(num) ||
        num < rng.min ||
        num > rng.max ||
        (rng.integer && !Number.isInteger(num))
      ) {
        mark(rng.field, `${label} must be between ${rng.min} and ${rng.max}`);
      }
    }
  }

  if (rules.loras) {
    for (let i = 0; i < rules.loras.length; i++) {
      const item = rules.loras[i];
      if (
        !item ||
        typeof item.strength !== "number" ||
        !Number.isFinite(item.strength) ||
        item.strength < 0.1 ||
        item.strength > 2
      ) {
        mark(
          `loras.${i}.strength`,
          "LoRA strength must be between 0.1 and 2.0",
        );
        mark("loras", "LoRA strength must be between 0.1 and 2.0");
      }
    }
  }

  return { errors };
}

export type ControlDescriptor = {
  name?: string;
  loraIndex?: string;
  isLoraSelect?: boolean;
};

export function orderedFieldNamesFromDescriptors(
  descriptors: readonly ControlDescriptor[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (name: string) => {
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  };
  for (const desc of descriptors) {
    if (desc.name) {
      push(desc.name);
      continue;
    }
    if (desc.loraIndex !== undefined && desc.loraIndex !== "") {
      push(`loras.${desc.loraIndex}.strength`);
      push("loras");
    } else if (desc.isLoraSelect) {
      push("loras");
    }
  }
  return out;
}

export function firstInvalidInOrder(
  orderedNames: readonly string[],
  errors: Readonly<Record<string, string>>,
): string | null {
  const hasSpecificLoraError = Object.keys(errors).some(
    (k) => /^loras\.\d+\.strength$/.test(k) && Boolean(errors[k]),
  );
  const isEligible = (k: string) => {
    if (!k || !Object.hasOwn(errors, k) || !errors[k]) return false;
    if (k === "loras" && hasSpecificLoraError) return false;
    return true;
  };
  for (const name of orderedNames) {
    if (isEligible(name)) {
      return name;
    }
  }
  const firstFallback = Object.keys(errors).find(isEligible);
  return firstFallback ?? null;
}

function humanizeFieldKey(key: string): string {
  if (/^loras\.\d+\.strength$/.test(key) || key.startsWith("loras.")) {
    return "LoRAs";
  }
  const clean = key.replace(/_/g, " ").trim();
  if (!clean) return "Field";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function mapServerErrors(
  message: string,
  fields: Record<string, string> | undefined,
  opts: {
    knownFields: readonly string[];
    labels?: Readonly<Record<string, string>>;
  },
): {
  fieldErrors: Record<string, string>;
  formError: string | null;
  firstField: string | null;
} {
  const known = new Set(opts.knownFields);
  const labels = opts.labels ?? {};
  const fieldErrors: Record<string, string> = {};
  const unownedParts: string[] = [];
  let firstField: string | null = null;

  if (fields && Object.keys(fields).length > 0) {
    for (const [rawKey, msg] of Object.entries(fields)) {
      if (!msg) continue;
      const isLoraPath =
        rawKey === "loras" ||
        rawKey.startsWith("loras.") ||
        /^loras\[\d+\]/.test(rawKey);
      if (isLoraPath && known.has("loras")) {
        const normalizedKey = rawKey.replace(/^loras\[(\d+)\]/, "loras.$1");
        fieldErrors[normalizedKey] = msg;
        fieldErrors[rawKey] = msg;
        if (!Object.hasOwn(fieldErrors, "loras")) {
          fieldErrors.loras = msg;
        }
        if (!firstField) firstField = normalizedKey;
      } else if (known.has(rawKey)) {
        fieldErrors[rawKey] = msg;
        if (!firstField) firstField = rawKey;
      } else {
        const label = labels[rawKey] ?? humanizeFieldKey(rawKey);
        unownedParts.push(`${label}: ${msg}`);
      }
    }
  }

  if (unownedParts.length > 0) {
    return {
      fieldErrors,
      formError: unownedParts.join(" · "),
      firstField,
    };
  }

  const ownedMessages = Object.values(fieldErrors);
  const formError =
    ownedMessages.length > 0 && ownedMessages.includes(message)
      ? null
      : Object.keys(fieldErrors).length > 0
        ? null
        : message;

  return {
    fieldErrors,
    formError,
    firstField,
  };
}

export const CREATE_REQUEST_TIMEOUT_MS = 120_000;
export const CREATE_TIMEOUT_MESSAGE =
  "The server did not answer. Check Jobs before trying again.";

export async function submitCreateJob(
  kind: CreateKind,
  body: FormData | Record<string, string>,
  opts?: { timeoutMs?: number },
): Promise<{ jobId: string }> {
  const fd = body instanceof FormData ? body : toFormData(body);
  const timeoutMs = opts?.timeoutMs ?? CREATE_REQUEST_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ApiError(504, CREATE_TIMEOUT_MESSAGE));
    }, timeoutMs);
  });
  let res: { jobId?: string } | undefined;
  try {
    res = await Promise.race([
      apiSend<{ jobId?: string }>("POST", CREATE_KINDS[kind].endpoint, fd),
      timeoutPromise,
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
  if (!res || typeof res.jobId !== "string" || !res.jobId) {
    throw new ApiError(500, "The server did not return a job id");
  }
  return { jobId: res.jobId };
}
