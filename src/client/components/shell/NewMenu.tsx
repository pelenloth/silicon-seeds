import { A, useLocation } from "@solidjs/router";
import {
  createEffect,
  createSignal,
  For,
  on,
  onCleanup,
  Show,
  type Component,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import { ROUTES } from "../../lib/routes";
import { Icons } from "../Icons";

const ICONS: Record<string, Component<{ class?: string }>> = {
  Image: Icons.Image,
  Video: Icons.Video,
  Film: Icons.Film,
  Audio: Icons.Audio,
  Compose: Icons.Compose,
};

const CREATE_ROUTES = ROUTES.filter((r) => r.group === "create");

export function NewMenu() {
  const [open, setOpen] = createSignal(false);
  const location = useLocation();
  let rootRef: HTMLDivElement | undefined;

  createEffect(
    on(
      () => location.pathname,
      () => setOpen(false),
    ),
  );

  createEffect(() => {
    if (!open()) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef && !rootRef.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    onCleanup(() => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    });
  });

  return (
    <div ref={rootRef} class="dropdown dropdown-end relative">
      <button
        id="new-menu-button"
        type="button"
        class="btn btn-primary btn-sm"
        aria-haspopup="menu"
        aria-expanded={open()}
        onClick={() => setOpen(!open())}
      >
        <Icons.Plus class="size-4" />
        <span>New</span>
      </button>
      <Show when={open()}>
        <ul
          role="menu"
          class="dropdown-content menu menu-sm absolute right-0 top-full z-30 mt-2 w-52 rounded-box border border-base-300 bg-base-100 p-1 shadow-lg"
        >
          <For each={CREATE_ROUTES}>
            {(r) => (
              <li role="none">
                <A
                  role="menuitem"
                  href={r.path}
                  class="flex items-center gap-2"
                  onClick={() => setOpen(false)}
                >
                  <Dynamic component={ICONS[r.icon]} class="size-4 shrink-0" />
                  <span>{r.title}</span>
                </A>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}

export default NewMenu;
