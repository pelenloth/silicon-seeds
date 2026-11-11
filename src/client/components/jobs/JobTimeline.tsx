import { For, Match, Show, Switch } from "solid-js";
import {
  canRegenerate,
  eventLabel,
  formatRelativeTime,
  type JobEvent,
} from "../../lib/job-view";
import { nowTick } from "../../stores/shell";
import { Icons } from "../Icons";
import { CopyButton } from "../ui/CopyButton";
import { EmptyState } from "../ui/EmptyState";
import { StatusBadge } from "../ui/StatusBadge";

export type JobTimelineProps = {
  events: JobEvent[];
  actionPending?: boolean;
  onRegenerate: (eventId: string) => void;
};

export function JobTimeline(props: JobTimelineProps) {
  return (
    <Show
      when={props.events.length > 0}
      fallback={
        <EmptyState
          title="No events yet"
          description="Steps appear here once the job starts."
        />
      }
    >
      <ol class="flex max-w-4xl flex-col gap-2">
        <For each={props.events}>
          {(e) => {
            const hasDetails = () =>
              Boolean(e.prompt || e.text || e.lyrics || e.error);
            const stepName = () =>
              `${eventLabel(e.type, e.mode)}${e.index != null ? ` #${e.index + 1}` : ""}`;
            return (
              <li class="panel [content-visibility:auto] [contain-intrinsic-size:auto_44px]">
                <details class="group">
                  <summary class="flex cursor-pointer list-none items-center gap-3 px-3 py-2">
                    <Switch
                      fallback={
                        <Icons.Clock class="size-4 text-base-content/40" />
                      }
                    >
                      <Match when={e.status === "pending"}>
                        <Icons.Clock class="size-4 text-base-content/40" />
                      </Match>
                      <Match when={e.status === "running"}>
                        <span class="loading loading-spinner loading-xs text-info" />
                      </Match>
                      <Match when={e.status === "complete"}>
                        <Icons.Check class="size-4 text-success" />
                      </Match>
                      <Match when={e.status === "failed"}>
                        <Icons.ExclamationCircle class="size-4 text-error" />
                      </Match>
                    </Switch>
                    <span class="text-sm font-medium">{stepName()}</span>
                    <Show when={(e.attempt_count ?? 0) > 1}>
                      <span class="badge badge-ghost badge-xs">
                        attempt {e.attempt_count}
                      </span>
                    </Show>
                    <span class="ml-auto text-xs text-base-content/50">
                      {formatRelativeTime(e.created_at, nowTick())}
                    </span>
                    <StatusBadge kind="event" status={e.status} />
                    <Icons.ChevronDown class="size-4 transition-transform group-open:rotate-180" />
                  </summary>
                  <div class="space-y-3 border-t border-base-300 px-3 py-3">
                    <Show when={e.prompt}>
                      {(val) => (
                        <div>
                          <div class="flex items-center justify-between">
                            <span class="section-label">Prompt</span>
                            <CopyButton
                              text={val()}
                              label={`Copy prompt (${stepName()})`}
                            />
                          </div>
                          <p class="mt-1 whitespace-pre-wrap break-words text-sm">
                            {val()}
                          </p>
                        </div>
                      )}
                    </Show>
                    <Show when={e.text}>
                      {(val) => (
                        <div>
                          <div class="flex items-center justify-between">
                            <span class="section-label">Text</span>
                            <CopyButton
                              text={val()}
                              label={`Copy text (${stepName()})`}
                            />
                          </div>
                          <p class="mt-1 whitespace-pre-wrap break-words text-sm">
                            {val()}
                          </p>
                        </div>
                      )}
                    </Show>
                    <Show when={e.lyrics}>
                      {(val) => (
                        <div>
                          <div class="flex items-center justify-between">
                            <span class="section-label">Lyrics</span>
                            <CopyButton
                              text={val()}
                              label={`Copy lyrics (${stepName()})`}
                            />
                          </div>
                          <p class="mt-1 whitespace-pre-wrap break-words text-sm">
                            {val()}
                          </p>
                        </div>
                      )}
                    </Show>
                    <Show when={e.error}>
                      {(val) => (
                        <p class="text-sm text-error" role="alert">
                          {val()}
                        </p>
                      )}
                    </Show>
                    <Show when={!hasDetails()}>
                      <p class="text-xs text-base-content/50">
                        No details recorded.
                      </p>
                    </Show>
                    <Show when={canRegenerate(e.type)}>
                      <button
                        type="button"
                        class="btn btn-sm btn-ghost"
                        disabled={props.actionPending}
                        onClick={() => props.onRegenerate(e.id)}
                      >
                        <Icons.Refresh class="size-4" />
                        Regenerate
                      </button>
                    </Show>
                  </div>
                </details>
              </li>
            );
          }}
        </For>
      </ol>
    </Show>
  );
}

export default JobTimeline;
