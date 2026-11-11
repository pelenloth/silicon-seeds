import { createEffect, For } from "solid-js";

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
  let groupRef: HTMLDivElement | undefined;

  const syncChecked = (val: string) => {
    if (!groupRef) return;
    const inputs = groupRef.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    );
    for (const input of inputs) {
      input.checked = input.value === val;
    }
  };

  createEffect(() => {
    syncChecked(props.value);
  });

  return (
    <div class={props.class}>
      <div
        ref={groupRef}
        class="join"
        role="radiogroup"
        aria-label={props.label}
      >
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
                syncChecked(props.value);
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
