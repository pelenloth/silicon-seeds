import { Show, type JSX } from "solid-js";

export type EmptyStateProps = {
  icon?: JSX.Element;
  title: string;
  description?: string;
  action?: JSX.Element;
  class?: string;
};

export function EmptyState(props: EmptyStateProps) {
  return (
    <div
      class={`flex flex-col items-center justify-center gap-2 px-6 py-12 text-center ${props.class ?? ""}`}
    >
      <Show when={props.icon}>
        <div class="text-base-content/30">{props.icon}</div>
      </Show>
      <p class="text-sm font-medium">{props.title}</p>
      <Show when={props.description}>
        <p class="max-w-sm text-xs text-base-content/60">{props.description}</p>
      </Show>
      {props.action}
    </div>
  );
}

export default EmptyState;
