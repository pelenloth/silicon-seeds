import { For } from "solid-js";

export type SegmentedProps = {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
  size?: "sm" | "xs";
  class?: string;
};

export function Segmented(props: SegmentedProps) {
  return (
    <fieldset class={props.class}>
      <legend class="sr-only">{props.label}</legend>
      <div class="join" role="radiogroup" aria-label={props.label}>
        <For each={props.options}>
          {(o) => (
            <input
              type="radio"
              name={props.name}
              value={o.value}
              aria-label={o.label}
              checked={props.value === o.value}
              onChange={() => props.onChange(o.value)}
              class={`btn join-item ${props.size === "xs" ? "btn-xs" : "btn-sm"}`}
            />
          )}
        </For>
      </div>
    </fieldset>
  );
}

export default Segmented;
