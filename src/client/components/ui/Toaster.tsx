import { A } from "@solidjs/router";
import { createEffect, For, onCleanup, onMount, Show } from "solid-js";
import { dismissToast, toasts, type ToastTone } from "../../stores/toast";
import { Icons } from "../Icons";

const ALERT: Record<ToastTone, string> = {
  success: "alert-success",
  error: "alert-error",
  info: "alert-info",
  warning: "alert-warning",
};

export function Toaster() {
  let ref!: HTMLDivElement;
  let homeParent: Node | null = null;

  const syncPopover = (hasToasts: boolean) => {
    if (!ref || typeof ref.showPopover !== "function") return;
    if (!homeParent && ref.parentNode) {
      homeParent = ref.parentNode;
    }
    try {
      if (hasToasts) {
        if (ref.matches(":popover-open")) {
          ref.hidePopover();
        }
        const openDialogs = document.querySelectorAll("dialog[open]");
        const topDialog =
          openDialogs.length > 0 ? openDialogs[openDialogs.length - 1] : null;
        const targetParent = topDialog ?? homeParent;
        if (targetParent && ref.parentNode !== targetParent) {
          targetParent.appendChild(ref);
        }
        ref.showPopover();
      } else {
        if (ref.matches(":popover-open")) {
          ref.hidePopover();
        }
        if (homeParent && ref.parentNode !== homeParent) {
          homeParent.appendChild(ref);
        }
      }
    } catch {}
  };

  createEffect(() => {
    syncPopover(toasts().length > 0);
  });

  onMount(() => {
    if (typeof MutationObserver === "undefined") return;
    const obs = new MutationObserver((records) => {
      if (toasts().length === 0) return;
      for (const r of records) {
        if (r.target instanceof HTMLDialogElement) {
          syncPopover(true);
          break;
        }
      }
    });
    obs.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    onCleanup(() => obs.disconnect());
  });

  return (
    <div
      ref={ref}
      popover="manual"
      class="toast toast-top toast-center sm:toast-bottom sm:toast-end z-[70] m-0 border-0 bg-transparent p-0 text-base-content overflow-visible inset-auto top-0 left-1/2 -translate-x-1/2 sm:top-auto sm:left-auto sm:bottom-0 sm:right-0 sm:translate-x-0 max-w-[calc(100vw-2rem)]"
      aria-live="polite"
    >
      <For each={toasts()}>
        {(t) => (
          <div
            role="status"
            class={`alert alert-soft ${ALERT[t.tone]} pointer-events-auto fade-in py-2 pr-2 text-sm shadow-lg`}
          >
            <span class="max-w-xs">{t.message}</span>
            <Show when={t.action}>
              {(a) => (
                <Show
                  when={a().href}
                  fallback={
                    <button
                      type="button"
                      class="btn btn-xs btn-ghost"
                      onClick={() => {
                        a().onClick?.();
                        dismissToast(t.id);
                      }}
                    >
                      {a().label}
                    </button>
                  }
                >
                  {(href) => (
                    <A
                      class="btn btn-xs btn-ghost"
                      href={href()}
                      onClick={() => {
                        a().onClick?.();
                        dismissToast(t.id);
                      }}
                    >
                      {a().label}
                    </A>
                  )}
                </Show>
              )}
            </Show>
            <button
              type="button"
              class="btn btn-ghost btn-xs btn-square"
              aria-label="Dismiss"
              onClick={() => dismissToast(t.id)}
            >
              <Icons.XMark class="size-4" />
            </button>
          </div>
        )}
      </For>
    </div>
  );
}

export default Toaster;
