import { A, useLocation } from "@solidjs/router";
import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { onDismiss } from "../../lib/dismiss";
import { ROUTES } from "../../lib/routes";
import { Icons, ROUTE_ICONS } from "../Icons";

const CREATE_ROUTES = ROUTES.filter((r) => r.group === "create");

export function NewMenu() {
  const [open, setOpen] = createSignal(false);
  const location = useLocation();
  let rootRef: HTMLDivElement | undefined;
  let triggerRef: HTMLButtonElement | undefined;
  let menuRef: HTMLUListElement | undefined;

  const getItems = (): HTMLElement[] =>
    menuRef
      ? Array.from(menuRef.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      : [];

  createEffect(
    on(
      () => location.pathname,
      () => setOpen(false),
    ),
  );

  createEffect(() => {
    if (!open()) return;
    queueMicrotask(() => {
      const items = getItems();
      items[0]?.focus();
    });
    const cleanup = onDismiss(
      () => rootRef,
      (byKeyboard) => {
        setOpen(false);
        if (byKeyboard) {
          triggerRef?.focus();
        }
      },
    );
    onCleanup(cleanup);
  });

  const handleMenuKeyDown = (e: KeyboardEvent) => {
    const items = getItems();
    const len = items.length;
    if (len === 0) return;
    const currentIdx = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = currentIdx < 0 ? 0 : (currentIdx + 1) % len;
      items[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = currentIdx < 0 ? len - 1 : (currentIdx - 1 + len) % len;
      items[next]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[len - 1]?.focus();
    }
  };

  return (
    <div
      ref={rootRef}
      class="dropdown dropdown-end relative"
      classList={{ "dropdown-open": open() }}
    >
      <button
        ref={triggerRef}
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
          ref={menuRef}
          role="menu"
          onKeyDown={handleMenuKeyDown}
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
                  <Dynamic
                    component={ROUTE_ICONS[r.icon]}
                    class="size-4 shrink-0"
                  />
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
