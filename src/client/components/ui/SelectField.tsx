import { createUniqueId, For, Show } from "solid-js";

export type SelectFieldProps = {
  label: string;
  name: string;
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string; disabled?: boolean }[];
  hint?: string;
  error?: string;
};

export function SelectField(props: SelectFieldProps) {
  const uid = createUniqueId();
  const id = () => props.id ?? uid;
  const hintId = () => `${id()}-hint`;
  const errorId = () => `${id()}-error`;
  const describedBy = () =>
    props.error ? errorId() : props.hint ? hintId() : undefined;

  return (
    <div class="flex flex-col gap-1">
      <label for={id()} class="text-xs font-medium text-base-content/70">
        {props.label}
      </label>
      <select
        class="select select-sm w-full"
        name={props.name}
        id={id()}
        value={props.value}
        aria-describedby={describedBy()}
        aria-invalid={props.error ? "true" : undefined}
        onChange={(e) => props.onChange(e.currentTarget.value)}
      >
        <For each={props.options}>
          {(opt) => (
            <option
              value={opt.value}
              disabled={opt.disabled}
              selected={props.value === opt.value}
            >
              {opt.label}
            </option>
          )}
        </For>
      </select>
      <Show
        when={props.error}
        fallback={
          <Show when={props.hint}>
            <p id={hintId()} class="text-xs text-base-content/50">
              {props.hint}
            </p>
          </Show>
        }
      >
        <p id={errorId()} class="text-xs text-error" role="alert">
          {props.error}
        </p>
      </Show>
    </div>
  );
}

export default SelectField;
