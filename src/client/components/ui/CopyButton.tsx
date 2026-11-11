import { createSignal, onCleanup, Show } from "solid-js";
import { Icons } from "../Icons";

export type CopyButtonProps = {
  text: string;
  label?: string;
  class?: string;
};

export function CopyButton(props: CopyButtonProps) {
  const [copied, setCopied] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => {
    if (timer !== undefined) clearTimeout(timer);
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(props.text);
      setCopied(true);
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
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
  );
}

export default CopyButton;
