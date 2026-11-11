import { createMemo, createRoot, createSignal } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { ApiError, apiGet, apiSend } from "../lib/api-client";
import {
  detectTransitions,
  filterJobs,
  nextBackoffMs,
  shouldApplyResponse,
  type JobAction,
  type JobSummary,
} from "../lib/job-view";
import { confirmDialog } from "./confirm";
import { toast } from "./toast";

const [jobsStore, setJobsStore] = createStore<JobSummary[]>([]);
const [jobsLoadedSignal, setJobsLoadedSignal] = createSignal<boolean>(false);
const [jobsErrorSignal, setJobsErrorSignal] = createSignal<string | null>(null);
const [versions, setVersions] = createStore<Record<string, number>>({});

export const jobs: () => JobSummary[] = () => jobsStore;
export const jobsLoaded: () => boolean = jobsLoadedSignal;
export const jobsError: () => string | null = jobsErrorSignal;

export function jobVersion(id: string): number {
  return versions[id] ?? 0;
}

const { activeJobsMemo, activeCountMemo } = createRoot(() => {
  const activeJobsMemo = createMemo(() =>
    jobsStore.filter((j) => j.status === "active" || j.status === "paused"),
  );
  const activeCountMemo = createMemo(
    () => jobsStore.filter((j) => j.status === "active").length,
  );
  return { activeJobsMemo, activeCountMemo };
});

export const activeJobs: () => JobSummary[] = activeJobsMemo;
export const activeCount: () => number = activeCountMemo;

export function recentFinished(n: number): JobSummary[] {
  return filterJobs(
    jobsStore.filter(
      (j) =>
        j.status === "complete" ||
        j.status === "failed" ||
        j.status === "cancelled",
    ),
    {},
  ).slice(0, n);
}

const prevStatuses = new Map<string, string>();
let hasLoadedOnce = false;
let nextRequestSeq = 0;
let lastAppliedSeq = 0;

export async function refreshJobs(): Promise<void> {
  const seq = ++nextRequestSeq;
  try {
    const data = await apiGet<{ jobs: JobSummary[] }>("/api/jobs");
    if (!shouldApplyResponse(seq, lastAppliedSeq)) {
      return;
    }
    lastAppliedSeq = seq;
    const list = data.jobs ?? [];
    if (hasLoadedOnce) {
      const transitions = detectTransitions(prevStatuses, list);
      for (const t of transitions) {
        if (t.to === "complete") {
          toast.success(`${t.name} finished`, {
            action: { label: "View", href: `/jobs/${t.id}` },
          });
        } else if (t.to === "failed") {
          toast.error(`${t.name} failed`, {
            action: { label: "View", href: `/jobs/${t.id}` },
          });
        }
      }
    }
    hasLoadedOnce = true;
    prevStatuses.clear();
    for (const j of list) {
      prevStatuses.set(j.id, j.status);
    }
    setJobsStore(reconcile(list, { key: "id", merge: true }));
    setJobsLoadedSignal(true);
    setJobsErrorSignal(null);
  } catch (err) {
    if (!shouldApplyResponse(seq, lastAppliedSeq)) {
      return;
    }
    const msg = err instanceof Error ? err.message : "Failed to load jobs";
    setJobsErrorSignal(msg);
  }
}

let started = false;
let streamDown = false;
let trailingRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleTrailingRefresh(): void {
  if (trailingRefreshTimer !== null) return;
  trailingRefreshTimer = setTimeout(() => {
    trailingRefreshTimer = null;
    void refreshJobs();
  }, 400);
}

export function startJobsStore(): void {
  if (started) return;
  started = true;

  void refreshJobs();

  if (typeof EventSource === "function") {
    let es: EventSource | null = null;
    let hadError = false;
    let attempt = 0;

    const connect = () => {
      if (es) {
        es.close();
        es = null;
      }
      es = new EventSource("/jobs/stream/all");
      es.onopen = () => {
        attempt = 0;
        streamDown = false;
      };
      es.addEventListener("job-update", (evt: MessageEvent) => {
        try {
          const parsed = JSON.parse(String(evt.data)) as { jobId?: unknown };
          if (typeof parsed.jobId === "string" && parsed.jobId) {
            setVersions(parsed.jobId, (v) => (v ?? 0) + 1);
          }
        } catch {}
        scheduleTrailingRefresh();
      });
      es.addEventListener("connected", () => {
        attempt = 0;
        streamDown = false;
        if (hadError) {
          hadError = false;
          void refreshJobs();
        }
      });
      es.onerror = () => {
        streamDown = true;
        hadError = true;
        if (es) {
          es.close();
          es = null;
        }
        const delay = nextBackoffMs(attempt++);
        setTimeout(connect, delay);
      };
    };

    connect();
  }

  if (typeof setInterval === "function") {
    const timer = setInterval(() => {
      if (streamDown && activeCount() > 0) {
        void refreshJobs();
      }
    }, 10_000);
    if (typeof timer === "object" && timer !== null && "unref" in timer) {
      (timer as { unref?: () => void }).unref?.();
    }
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void refreshJobs();
      }
    });
  }
}

const ACTION_VERB: Record<JobAction, string> = {
  pause: "Paused",
  resume: "Resumed",
  retry: "Retrying",
  cancel: "Cancelled",
  delete: "Deleted",
};

const inFlightJobActions = new Set<string>();

export async function runJobAction(
  job: { id: string; name: string },
  action: JobAction,
): Promise<boolean> {
  const key = `${job.id}:${action}`;
  if (inFlightJobActions.has(key)) return false;
  inFlightJobActions.add(key);

  try {
    if (action === "cancel") {
      const ok = await confirmDialog({
        title: "Cancel this job?",
        body: "Finished outputs are kept.",
        confirmLabel: "Cancel job",
        tone: "danger",
      });
      if (!ok) return false;
    } else if (action === "delete") {
      const ok = await confirmDialog({
        title: "Delete this job?",
        body: "The job and its history are removed. Generated files stay on disk.",
        confirmLabel: "Delete",
        tone: "danger",
      });
      if (!ok) return false;
    }

    try {
      if (action === "delete") {
        await apiSend("DELETE", `/api/jobs/${job.id}`);
      } else {
        await apiSend("POST", `/api/jobs/${job.id}/${action}`);
      }
      toast.success(`${ACTION_VERB[action]} “${job.name}”`);
      return true;
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Action failed";
      toast.error(msg);
      return false;
    } finally {
      await refreshJobs();
    }
  } finally {
    inFlightJobActions.delete(key);
  }
}

export async function regenerateEvent(
  jobId: string,
  eventId: string,
): Promise<boolean> {
  const ok = await confirmDialog({
    title: "Regenerate this output?",
    body: "The current file is replaced.",
    confirmLabel: "Regenerate",
  });
  if (!ok) return false;

  try {
    await apiSend("POST", `/api/jobs/${jobId}/events/${eventId}/regenerate`);
    toast.success("Regenerating…");
    await refreshJobs();
    return true;
  } catch (err) {
    const msg =
      err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Regenerate failed";
    toast.error(msg);
    return false;
  }
}
