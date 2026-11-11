import { useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import { JobDetail } from "../components/jobs/JobDetail";
import { JobList } from "../components/jobs/JobList";
import { EmptyState } from "../components/ui/EmptyState";
import { countByStatus, filterJobs } from "../lib/job-view";
import { jobs, jobsError, jobsLoaded, refreshJobs } from "../stores/jobs";

type TabType = "status" | "media" | "events";

const VALID_FILTERS = new Set([
  "all",
  "active",
  "complete",
  "failed",
  "paused",
  "cancelled",
]);

function readDesktop(): boolean {
  try {
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function"
    ) {
      return window.matchMedia("(min-width: 1024px)").matches;
    }
  } catch {}
  return false;
}

export default function Jobs() {
  const params = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();

  const [query, setQuery] = createSignal("");
  const [isDesktop, setIsDesktop] = createSignal<boolean>(readDesktop());

  onMount(() => {
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function"
    ) {
      const mql = window.matchMedia("(min-width: 1024px)");
      setIsDesktop(mql.matches);
      const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
      mql.addEventListener("change", onChange);
      onCleanup(() => mql.removeEventListener("change", onChange));
    }
  });

  const tab = (): TabType => {
    const raw = Array.isArray(search.tab) ? search.tab[0] : search.tab;
    if (raw === "status" || raw === "media" || raw === "events") return raw;
    return "status";
  };

  const filter = (): string => {
    const raw = Array.isArray(search.filter) ? search.filter[0] : search.filter;
    if (raw && VALID_FILTERS.has(raw)) return raw;
    return "all";
  };

  const legacyJobId = () => {
    const raw = Array.isArray(search.job_id) ? search.job_id[0] : search.job_id;
    return raw || undefined;
  };

  const id = () => params.jobId ?? legacyJobId();

  const jobHref = (jobId: string) =>
    `/jobs/${jobId}?tab=${tab()}&filter=${filter()}`;

  const filterHref = (f: string) => {
    const curId = id();
    return curId
      ? `/jobs/${curId}?tab=${tab()}&filter=${f}`
      : `/jobs?filter=${f}`;
  };

  const counts = () => countByStatus(jobs());
  const list = () => filterJobs(jobs(), { status: filter(), query: query() });

  createEffect(() => {
    const leg = legacyJobId();
    if (leg) {
      navigate(`/jobs/${leg}?tab=${tab()}&filter=${filter()}`, {
        replace: true,
      });
      return;
    }
    if (!params.jobId && isDesktop() && list().length > 0) {
      navigate(jobHref(list()[0].id), { replace: true });
    }
  });

  return (
    <div class="flex h-full min-h-0">
      <div
        class="min-h-0 w-full shrink-0 border-r border-base-300 lg:w-80 xl:w-96"
        classList={{ "hidden lg:block": !!id(), block: !id() }}
      >
        <JobList
          jobs={list()}
          counts={counts()}
          selectedId={id()}
          filter={filter()}
          query={query()}
          onQuery={setQuery}
          filterHref={filterHref}
          jobHref={jobHref}
          loading={!jobsLoaded()}
          error={jobsError()}
          onRetryLoad={() => void refreshJobs()}
          hasAnyJobs={jobs().length > 0}
        />
      </div>
      <div
        class="min-h-0 min-w-0 flex-1"
        classList={{ block: !!id(), "hidden lg:block": !id() }}
      >
        <Show
          when={id()}
          keyed
          fallback={
            <EmptyState
              title="Select a job"
              description="Pick a job on the left to see its progress and outputs."
            />
          }
        >
          {(jobId) => <JobDetail id={jobId} tab={tab()} filter={filter()} />}
        </Show>
      </div>
    </div>
  );
}
