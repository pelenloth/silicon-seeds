import { Show } from "solid-js";
import {
  eventStatusMeta,
  jobStatusMeta,
  type JobProgress,
  type Tone,
} from "../../lib/job-view";

export type StatusBadgeProps = {
  kind: "job" | "event";
  status: string;
  progress?: JobProgress;
  size?: "sm" | "md";
};

const TONE_CLASS: Record<Tone, string> = {
  neutral: "badge-neutral",
  info: "badge-info",
  success: "badge-success",
  warning: "badge-warning",
  error: "badge-error",
};

export function StatusBadge(props: StatusBadgeProps) {
  const meta = () =>
    props.kind === "job"
      ? jobStatusMeta(props.status, props.progress)
      : eventStatusMeta(props.status);

  return (
    <span
      class={`badge badge-soft ${props.size === "md" ? "badge-md" : "badge-sm"} gap-1 ${TONE_CLASS[meta().tone]}`}
    >
      <Show when={meta().label === "Running"}>
        <span class="loading loading-spinner loading-xs" />
      </Show>
      {meta().label}
    </span>
  );
}

export default StatusBadge;
