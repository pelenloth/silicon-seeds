import { createEffect, createSignal, Show, type JSX } from "solid-js";
import { Icons } from "../Icons";

export type SectionProps = {
  title: string;
  children: JSX.Element;
};

export function Section(props: SectionProps) {
  return (
    <section class="panel p-4">
      <h2 class="mb-3 text-sm font-semibold">{props.title}</h2>
      {props.children}
    </section>
  );
}

export type CollapsibleSectionProps = {
  title: string;
  hint?: string;
  count?: number;
  open?: boolean;
  children: JSX.Element;
};

export function CollapsibleSection(props: CollapsibleSectionProps) {
  const [open, setOpen] = createSignal(Boolean(props.open));
  let prevPropOpen = Boolean(props.open);

  createEffect(() => {
    const next = Boolean(props.open);
    if (next && !prevPropOpen) {
      setOpen(true);
    }
    prevPropOpen = next;
  });

  return (
    <details
      class="panel group"
      open={open()}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary class="flex cursor-pointer list-none items-center gap-2 rounded-box px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
        <span>{props.title}</span>
        <Show when={props.count}>
          <span class="badge badge-primary badge-xs">{props.count}</span>
        </Show>
        <Show when={props.hint}>
          <span class="text-xs font-normal text-base-content/50">
            {props.hint}
          </span>
        </Show>
        <Icons.ChevronDown class="ml-auto size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div class="border-t border-base-300 p-4">{props.children}</div>
    </details>
  );
}

export default Section;
