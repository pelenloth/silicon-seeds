import { createSignal, onCleanup, onMount, Show } from "solid-js";
import SparkleIcon from "./SparkleIcon";
import EnhanceModal from "./EnhanceModal";
import type { EnhanceKind } from "../../prompts/enhance-prompts";

export type EnhanceButtonProps = {
  textareaId: string;
  kind: EnhanceKind;
  getPreset?: () => string | undefined;
};

export default function EnhanceButton(props: EnhanceButtonProps) {
  const [open, setOpen] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [original, setOriginal] = createSignal("");
  const [enhanced, setEnhanced] = createSignal("");
  const [error, setError] = createSignal("");
  const [label, setLabel] = createSignal("Enhance");
  let abort: AbortController | null = null;

  function readTextarea(): string {
    const el = document.getElementById(
      props.textareaId,
    ) as HTMLTextAreaElement | null;
    return el?.value ?? "";
  }

  function updateLabel() {
    setLabel(readTextarea().trim().length === 0 ? "Inspire" : "Enhance");
  }

  onMount(() => {
    updateLabel();
    const el = document.getElementById(
      props.textareaId,
    ) as HTMLTextAreaElement | null;
    el?.addEventListener("input", updateLabel);
    onCleanup(() => {
      el?.removeEventListener("input", updateLabel);
      abort?.abort();
    });
  });

  async function run() {
    const text = readTextarea();
    setLabel(text.trim().length === 0 ? "Inspire" : "Enhance");
    setOriginal(text);
    setEnhanced("");
    setError("");
    setLoading(true);
    setOpen(true);
    abort?.abort();
    const ctrl = new AbortController();
    abort = ctrl;
    const timeoutSignal = AbortSignal.timeout(60000);
    const signal =
      typeof AbortSignal.any === "function"
        ? AbortSignal.any([ctrl.signal, timeoutSignal])
        : timeoutSignal;
    const form = document.getElementById(props.textareaId)?.closest("form");
    const preset =
      props.getPreset?.() ??
      (
        form?.querySelector(
          'select[name="style_preset"]',
        ) as HTMLSelectElement | null
      )?.value ??
      undefined;
    try {
      const res = await fetch("/api/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, kind: props.kind, style_preset: preset }),
        signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.error ?? `Enhance failed (${res.status})`);
      if (!data.enhanced) throw new Error("Empty response, try again");
      setEnhanced(data.enhanced);
    } catch (e) {
      if (
        e instanceof DOMException &&
        (e.name === "AbortError" || e.name === "TimeoutError")
      ) {
        setError("Timed out after 60s, Retry?");
      } else {
        setError(e instanceof Error ? e.message : "Enhance failed, try again");
      }
    } finally {
      if (abort === ctrl) abort = null;
      setLoading(false);
    }
  }

  function close() {
    abort?.abort();
    setOpen(false);
  }

  function accept() {
    const el = document.getElementById(
      props.textareaId,
    ) as HTMLTextAreaElement | null;
    if (el && enhanced()) {
      el.value = enhanced();
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        class="btn btn-xs btn-ghost gap-1 group"
        onClick={run}
        disabled={loading()}
      >
        <Show
          when={loading()}
          fallback={
            <SparkleIcon class="w-3.5 h-3.5 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-125" />
          }
        >
          <span class="loading loading-spinner loading-xs" />
        </Show>
        {label()}
      </button>
      <EnhanceModal
        open={open()}
        original={original()}
        enhanced={enhanced()}
        loading={loading()}
        error={error()}
        onAccept={accept}
        onRetry={run}
        onClose={close}
      />
    </>
  );
}
