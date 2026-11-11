import { createSignal, onCleanup, Show } from "solid-js";
import { toast } from "../../stores/toast";
import { Icons } from "../Icons";

export type CopyButtonProps = {
  text: string;
  label?: string;
  class?: string;
};

function fallbackCopy(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  ta.style.top = "0";
  document.body.appendChild(ta);
  try {
    ta.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    ta.remove();
  }
}

export function CopyButton(props: CopyButtonProps) {
  const [copied, setCopied] = createSignal(false);
  const [announcement, setAnnouncement] = createSignal("");
  let timer: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => {
    if (timer !== undefined) clearTimeout(timer);
  });

  const handleCopy = async () => {
    let ok = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(props.text);
        ok = true;
      } catch {
        ok = fallbackCopy(props.text);
      }
    } else {
      ok = fallbackCopy(props.text);
    }

    if (timer !== undefined) clearTimeout(timer);

    if (ok) {
      setCopied(true);
      setAnnouncement("Copied");
      timer = setTimeout(() => {
        setCopied(false);
        setAnnouncement("");
      }, 2000);
    } else {
      setCopied(false);
      setAnnouncement("Copy failed");
      toast.error("Could not copy to the clipboard");
      timer = setTimeout(() => {
        setAnnouncement("");
      }, 2000);
    }
  };

  return (
    <>
      <button
        type="button"
        class={`btn btn-ghost btn-xs ${props.class ?? ""}`}
        aria-label={props.label ?? "Copy"}
        onClick={handleCopy}
      >
        <Show when={copied()} fallback={<Icons.Copy class="size-4" />}>
          <Icons.Check class="size-4 text-success" />
        </Show>
        <Show when={props.label}>
          <span>{props.label}</span>
        </Show>
      </button>
      <span class="sr-only" aria-live="polite">
        {announcement()}
      </span>
    </>
  );
}

export default CopyButton;
