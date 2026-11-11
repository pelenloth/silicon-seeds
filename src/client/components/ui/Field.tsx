import { Show, type JSX } from "solid-js";

export type FieldProps = {
  label: string;
  for?: string;
  hint?: string;
  error?: string;
  class?: string;
  children: JSX.Element;
};

export function Field(props: FieldProps) {
  return (
    <div class={`flex flex-col gap-1 ${props.class ?? ""}`}>
      <label for={props.for} class="text-xs font-medium text-base-content/70">
        {props.label}
      </label>
      {props.children}
      <Show
        when={props.error}
        fallback={
          <Show when={props.hint}>
            <p class="text-xs text-base-content/50">{props.hint}</p>
          </Show>
        }
      >
        <p class="text-xs text-error" role="alert">
          {props.error}
        </p>
      </Show>
    </div>
  );
}

export default Field;
