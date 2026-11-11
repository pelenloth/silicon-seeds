import { createUniqueId, For } from "solid-js";
import { Field } from "./Field";

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

  return (
    <Field label={props.label} for={id()} hint={props.hint} error={props.error}>
      <select
        class="select select-sm w-full"
        name={props.name}
        id={id()}
        value={props.value}
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
    </Field>
  );
}

export default SelectField;
