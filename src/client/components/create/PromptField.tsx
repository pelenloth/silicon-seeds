import { createSignal, Match, onCleanup, Show, Switch } from "solid-js";
import type { EnhanceKind } from "../../../prompts/enhance-prompts";
import { ApiError, apiSend } from "../../lib/api-client";
import { toast } from "../../stores/toast";
import { Icons } from "../Icons";

export type PromptFieldProps = {
  label: string;
  name: string;
  id: string;
  value: string;
  onInput: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  required?: boolean;
  bare?: boolean;
  hint?: string;
  error?: string;
  enhanceKind?: EnhanceKind;
  getPreset?: () => string | undefined;
};

export function PromptField(props: PromptFieldProps) {
  const [busy, setBusy] = createSignal(false);
  const [enhanceError, setEnhanceError] = createSignal<string | null>(null);
  const [undoText, setUndoText] = createSignal<string | null>(null);
  let abortCtrl: AbortController | null = null;
  let disposed = false;

  onCleanup(() => {
    disposed = true;
    abortCtrl?.abort();
  });

  const enhance = async () => {
    if (!props.enhanceKind || busy()) return;
    const sentFieldValue = props.value;
    const sourceText = undoText() ?? sentFieldValue;
    setEnhanceError(null);
    setBusy(true);
    abortCtrl?.abort();
    const ctrl = new AbortController();
    abortCtrl = ctrl;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, 60_000);

    try {
      const res = await apiSend<{ enhanced?: string }>(
        "POST",
        "/api/enhance",
        {
          text: sourceText,
          kind: props.enhanceKind,
          style_preset: props.getPreset?.(),
        },
        { signal: ctrl.signal },
      );
      if (disposed || abortCtrl !== ctrl) return;
      const rawNext = res?.enhanced?.trim();
      if (!rawNext) {
        throw new ApiError(500, "Empty response from the server");
      }
      if (props.value !== sentFieldValue) {
        toast.info("Kept your edits. Run Enhance again to use the new text.");
        return;
      }
      let next = rawNext;
      if (props.maxLength && next.length > props.maxLength) {
        next = next.slice(0, props.maxLength);
        toast.warning(
          `Enhanced text was trimmed to ${props.maxLength} characters.`,
        );
      }
      setUndoText(sentFieldValue);
      props.onInput(next);
    } catch (err) {
      if (disposed || (ctrl.signal.aborted && !timedOut)) return;
      if (
        timedOut ||
        (err instanceof DOMException && err.name === "TimeoutError")
      ) {
        setEnhanceError("Timed out after 60s");
      } else if (err instanceof ApiError) {
        setEnhanceError(err.message);
      } else {
        setEnhanceError(err instanceof Error ? err.message : "Enhance failed");
      }
    } finally {
      clearTimeout(timer);
      if (abortCtrl === ctrl) {
        abortCtrl = null;
        if (!disposed) setBusy(false);
      }
    }
  };

  const handleUndo = () => {
    const prev = undoText();
    if (prev === null) return;
    setUndoText(null);
    setEnhanceError(null);
    props.onInput(prev);
  };

  const actionLabel = () => (props.value.trim() ? "Enhance" : "Inspire");

  return (
    <div classList={{ panel: !props.bare }} class="flex flex-col">
      <div
        class="flex items-center justify-between gap-2"
        classList={{ "px-4 pt-3": !props.bare }}
      >
        <label for={props.id} class="text-sm font-semibold">
          {props.label}
          <Show when={!props.required}>
            <span class="ml-1 text-xs font-normal text-base-content/50">
              optional
            </span>
          </Show>
        </label>
        <Show when={props.enhanceKind}>
          <button
            type="button"
            class="btn btn-ghost btn-xs gap-1"
            aria-label={`${props.label}: ${actionLabel()}`}
            disabled={busy()}
            onClick={() => void enhance()}
          >
            <Show
              when={busy()}
              fallback={<Icons.Sparkles class="size-4 text-primary" />}
            >
              <span class="loading loading-spinner loading-xs" />
            </Show>
            {actionLabel()}
          </button>
        </Show>
      </div>
      <textarea
        id={props.id}
        name={props.name}
        rows={props.rows ?? 5}
        maxLength={props.maxLength}
        placeholder={props.placeholder}
        value={props.value}
        required={props.required}
        aria-required={props.required ? "true" : undefined}
        onInput={(e) => {
          setUndoText(null);
          setEnhanceError(null);
          props.onInput(e.currentTarget.value);
        }}
        aria-invalid={props.error ? "true" : undefined}
        aria-describedby={`${props.id}-note`}
        class="textarea textarea-ghost w-full resize-y text-sm leading-relaxed focus:outline-none"
        classList={{
          "animate-pulse": busy(),
          "px-4": !props.bare,
          "px-0": !!props.bare,
        }}
      />
      <div
        id={`${props.id}-note`}
        class="flex items-center justify-between gap-2 pb-2 text-xs text-base-content/50"
        classList={{ "px-4": !props.bare }}
      >
        <span>
          <Switch fallback={props.hint}>
            <Match when={props.error}>
              <span class="text-error" role="alert">
                {props.error}
              </span>
            </Match>
            <Match when={enhanceError()}>
              <span class="text-error" role="alert">
                {enhanceError()}
              </span>
            </Match>
            <Match when={undoText() !== null}>
              <span>
                Enhanced ·{" "}
                <button type="button" class="link" onClick={handleUndo}>
                  Undo
                </button>{" "}
                ·{" "}
                <button
                  type="button"
                  class="link"
                  onClick={() => void enhance()}
                >
                  Try again
                </button>
              </span>
            </Match>
          </Switch>
        </span>
        <span class="tabular-nums">
          {props.value.length}
          {props.maxLength ? ` / ${props.maxLength}` : ""}
        </span>
      </div>
    </div>
  );
}

export default PromptField;
