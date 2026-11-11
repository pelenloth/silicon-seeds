import { createUniqueId, Show } from "solid-js";

export type SliderFieldProps = {
  label: string;
  name: string;
  id?: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onInput: (n: number) => void;
  format?: (n: number) => string;
  hint?: string;
};

export function SliderField(props: SliderFieldProps) {
  const uid = createUniqueId();
  const id = () => props.id ?? uid;

  return (
    <div class="flex flex-col gap-1">
      <div class="flex items-baseline justify-between">
        <label for={id()} class="text-xs font-medium text-base-content/70">
          {props.label}
        </label>
        <output for={id()} class="text-xs font-semibold tabular-nums">
          {(props.format ?? String)(props.value)}
        </output>
      </div>
      <input
        id={id()}
        type="range"
        name={props.name}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onInput={(e) => props.onInput(Number(e.currentTarget.value))}
        class="range range-primary range-xs w-full"
      />
      <Show when={props.hint}>
        <p class="text-xs text-base-content/50">{props.hint}</p>
      </Show>
    </div>
  );
}

export default SliderField;
