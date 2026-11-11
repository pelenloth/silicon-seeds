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
    <div class={props.class}>
      <div class="join" role="radiogroup" aria-label={props.label}>
        <For each={props.options}>
          {(o) => (
            <input
              type="radio"
              name={props.name}
              value={o.value}
              aria-label={o.label}
              checked={props.value === o.value}
              onChange={(e) => {
                props.onChange(o.value);
                e.currentTarget.checked = props.value === o.value;
              }}
              class={`btn join-item ${props.size === "xs" ? "btn-xs" : "btn-sm"}`}
            />
          )}
        </For>
      </div>
    </div>
  );
}

export default Segmented;
