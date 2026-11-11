import { Show } from "solid-js";

export type SubmitBarProps = {
  label: string;
  summary?: string;
  submitting: boolean;
  formError: string | null;
  onReset: () => void;
};

export function SubmitBar(props: SubmitBarProps) {
  return (
    <div class="sticky bottom-0 z-10 -mx-4 -mb-4 border-t border-base-300 bg-base-200/90 px-4 py-3 backdrop-blur lg:-mx-6 lg:-mb-6 lg:px-6">
      <Show when={props.formError}>
        <div
          role="alert"
          class="alert alert-error alert-soft mb-2 py-2 text-sm"
        >
          {props.formError}
        </div>
      </Show>
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          disabled={props.submitting}
          onClick={props.onReset}
        >
          Reset
        </button>
        <p class="min-w-0 flex-1 truncate text-xs text-base-content/60">
          {props.summary}
        </p>
        <button
          type="submit"
          id="submit-btn"
          class="btn btn-primary btn-sm gap-2 px-5"
          disabled={props.submitting}
        >
          <Show when={props.submitting}>
            <span class="loading loading-spinner loading-xs" />
          </Show>
          {props.label}
          <kbd class="kbd kbd-xs hidden text-base-content lg:inline-flex">
            Ctrl ↵
          </kbd>
        </button>
      </div>
    </div>
  );
}

export default SubmitBar;
