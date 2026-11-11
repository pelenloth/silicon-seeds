import { useSearchParams } from "@solidjs/router";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import { ApiError } from "../../lib/api-client";
import {
  CREATE_KINDS,
  submitCreateJob,
  type CreateKind,
} from "../../lib/create-job";
import type { GenerationDefaults } from "../../lib/defaults";
import {
  clearDraft,
  loadDraft,
  mergeInitial,
  saveDraft,
  takePrefill,
} from "../../lib/form-state";
import { jobs, refreshJobs } from "../../stores/jobs";
import { generationDefaults, loadDefaults } from "../../stores/settings";
import { toast } from "../../stores/toast";
import type { LoraSpec } from "../LoraSelector";

export type CreateFormOptions<T extends Record<string, string>> = {
  kind: CreateKind;
  fallback: (d: GenerationDefaults) => T;
  required?: readonly { field: keyof T & string; message: string }[];
  beforeSubmit?: (fd: FormData) => void;
};

function firstParam(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.length > 0 ? s : undefined;
}

function parseLoras(raw: string | undefined): LoraSpec[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: LoraSpec[] = [];
    for (const item of parsed) {
      if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        if (
          typeof rec.name === "string" &&
          rec.name.trim() &&
          typeof rec.strength === "number" &&
          Number.isFinite(rec.strength)
        ) {
          out.push({ name: rec.name, strength: rec.strength });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function useCreateForm<T extends Record<string, string>>(
  opts: CreateFormOptions<T>,
): {
  values: T;
  set: (field: keyof T & string, value: string) => void;
  loras: () => LoraSpec[];
  setLoras: (v: LoraSpec[]) => void;
  errors: () => Record<string, string>;
  formError: () => string | null;
  submitting: () => boolean;
  jobId: () => string | undefined;
  reset: () => void;
  submit: (form: HTMLFormElement) => Promise<void>;
} {
  const route = CREATE_KINDS[opts.kind].route;
  const [search, setSearch] = useSearchParams();

  const initialFallback = opts.fallback(generationDefaults());
  const draft = loadDraft(route);
  const prefill = takePrefill(route);

  const firstTextField = (
    ["prompt", "instrumental_prompt", "script"] as const
  ).find((k) => Object.hasOwn(initialFallback, k));
  const promptParam = firstParam(search.prompt);
  const queryPrompt: Record<string, string> | null =
    firstTextField && promptParam !== undefined
      ? { [firstTextField]: promptParam }
      : null;

  const provided = new Set<string>();
  for (const layer of [draft, prefill, queryPrompt]) {
    if (!layer) continue;
    for (const [k, v] of Object.entries(layer)) {
      if (typeof v === "string" && Object.hasOwn(initialFallback, k)) {
        provided.add(k);
      }
    }
  }

  const touched = new Set<string>();

  const initialValues = mergeInitial(
    initialFallback,
    draft,
    prefill,
    queryPrompt,
  );
  const [values, setValues] = createStore<T>(initialValues);
  const [loras, setLoras] = createSignal<LoraSpec[]>(
    parseLoras(prefill?.loras ?? draft?.loras),
  );
  const [errors, setErrors] = createSignal<Record<string, string>>({});
  const [formError, setFormError] = createSignal<string | null>(null);
  const [submitting, setSubmitting] = createSignal(false);

  let disposed = false;

  const applyDefaultsIfUntouched = (d: GenerationDefaults) => {
    if (disposed) return;
    const nextFallback = opts.fallback(d);
    for (const [k, v] of Object.entries(nextFallback)) {
      if (!provided.has(k) && !touched.has(k)) {
        setValues(k as any, v as any);
      }
    }
  };

  void loadDefaults().then(applyDefaultsIfUntouched);

  createEffect(() => {
    const d = generationDefaults();
    applyDefaultsIfUntouched(d);
  });

  const isAllDefault = (
    snap: Record<string, string>,
    currentLoras: LoraSpec[],
  ): boolean => {
    if (currentLoras.length > 0) return false;
    const def = opts.fallback(generationDefaults());
    for (const [k, v] of Object.entries(def)) {
      if ((snap[k] ?? "") !== v) return false;
    }
    return true;
  };

  let draftTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSnapshot: {
    snap: Record<string, string>;
    loras: LoraSpec[];
  } | null = null;

  const clearDraftTimer = () => {
    if (draftTimer !== null) {
      clearTimeout(draftTimer);
      draftTimer = null;
    }
  };

  const flushDraft = () => {
    clearDraftTimer();
    if (!pendingSnapshot) return;
    const { snap, loras: currentLoras } = pendingSnapshot;
    pendingSnapshot = null;
    if (isAllDefault(snap, currentLoras)) {
      clearDraft(route);
    } else {
      saveDraft(route, {
        ...snap,
        loras: JSON.stringify(currentLoras),
      });
    }
  };

  createEffect(() => {
    const snap: Record<string, string> = {};
    for (const k of Object.keys(initialFallback)) {
      snap[k] = values[k];
    }
    const currentLoras = loras();
    pendingSnapshot = { snap, loras: currentLoras };
    clearDraftTimer();
    draftTimer = setTimeout(() => {
      draftTimer = null;
      flushDraft();
    }, 300);
  });

  onCleanup(() => {
    disposed = true;
    flushDraft();
  });

  const set = (field: keyof T & string, value: string) => {
    touched.add(field);
    setValues(field as any, value as any);
    if (errors()[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const reset = () => {
    clearDraftTimer();
    pendingSnapshot = null;
    clearDraft(route);
    touched.clear();
    provided.clear();
    const def = opts.fallback(generationDefaults());
    for (const [k, v] of Object.entries(def)) {
      setValues(k as any, v as any);
    }
    setLoras([]);
    setErrors({});
    setFormError(null);
  };

  let inFlight = false;

  const submit = async (form: HTMLFormElement): Promise<void> => {
    if (inFlight || submitting()) return;
    setErrors({});
    setFormError(null);

    if (opts.required) {
      const nextErrors: Record<string, string> = {};
      let firstInvalid: string | null = null;
      for (const req of opts.required) {
        const val = values[req.field] ?? "";
        if (!val.trim()) {
          nextErrors[req.field] = req.message;
          if (!firstInvalid) firstInvalid = req.field;
        }
      }
      if (firstInvalid) {
        setErrors(nextErrors);
        const el = form.elements.namedItem(firstInvalid);
        if (el && typeof (el as HTMLElement).focus === "function") {
          (el as HTMLElement).focus();
        }
        return;
      }
    }

    const fd = new FormData(form);
    if (loras().length > 0) {
      fd.set("loras", JSON.stringify(loras()));
    }
    opts.beforeSubmit?.(fd);

    inFlight = true;
    setSubmitting(true);
    try {
      const { jobId: newJobId } = await submitCreateJob(opts.kind, fd);
      setSearch(
        { job_id: newJobId, show_progress: undefined, prompt: undefined },
        { replace: true },
      );
      await refreshJobs();
      const jobName = jobs()
        .find((j) => j.id === newJobId)
        ?.name?.trim();
      toast.success(jobName ? `Queued “${jobName}”` : "Queued", {
        action: {
          label: "View job",
          href: `/jobs/${encodeURIComponent(newJobId)}`,
        },
      });
    } catch (e) {
      if (e instanceof ApiError) {
        const fieldErrors = e.fields ?? {};
        setErrors(fieldErrors);
        const fieldMessages = Object.values(fieldErrors);
        setFormError(fieldMessages.includes(e.message) ? null : e.message);
      } else {
        setFormError(e instanceof Error ? e.message : "Submission failed");
      }
    } finally {
      inFlight = false;
      setSubmitting(false);
    }
  };

  return {
    values,
    set,
    loras,
    setLoras,
    errors,
    formError,
    submitting,
    jobId: () => firstParam(search.job_id),
    reset,
    submit,
  };
}
