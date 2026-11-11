import { A } from "@solidjs/router";
import { For, onCleanup, Show } from "solid-js";
import { topOverlayId } from "../../stores/overlays";
import { dismissToast, toasts, type ToastTone } from "../../stores/toast";
import { Icons } from "../Icons";

const ALERT: Record<ToastTone, string> = {
  success: "alert-success",
  error: "alert-error",
  info: "alert-info",
  warning: "alert-warning",
};

export type ToastRegionProps = {
  scope: number | "root" | null;
};

export function ToastRegion(props: ToastRegionProps) {
  let regionRef!: HTMLDivElement;
  let priorFocusEl: HTMLElement | null = null;

  const isActiveScope = () =>
    props.scope !== null &&
    (props.scope === "root"
      ? topOverlayId() === null
      : topOverlayId() === props.scope);

  const restoreFocusAfterDismiss = (removedIndex: number) => {
    if (!regionRef || !regionRef.isConnected) return;
    const buttons = Array.from(
      regionRef.querySelectorAll<HTMLButtonElement>(
        'button[aria-label="Dismiss notification"]',
      ),
    );
    if (buttons.length > 0) {
      const targetIdx = Math.min(removedIndex, buttons.length - 1);
      buttons[targetIdx]?.focus();
      return;
    }
    const dialog = regionRef.closest("dialog");
    if (
      priorFocusEl &&
      priorFocusEl.isConnected &&
      priorFocusEl !== document.body &&
      (!dialog || dialog.contains(priorFocusEl))
    ) {
      priorFocusEl.focus();
      if (document.activeElement && document.activeElement !== document.body) {
        return;
      }
    }
    const fallback = dialog ?? document.getElementById("app-main");
    if (fallback instanceof HTMLElement) {
      if (!fallback.hasAttribute("tabindex")) {
        fallback.setAttribute("tabindex", "-1");
      }
      fallback.focus();
    }
  };

  return (
    <div
      ref={regionRef}
      class="toast-region toast toast-bottom toast-center sm:toast-end fixed inset-auto bottom-0 left-1/2 -translate-x-1/2 sm:left-auto sm:right-0 sm:translate-x-0 z-[70] m-0 border-0 bg-transparent p-4 text-base-content overflow-visible pointer-events-none max-w-[calc(100vw-2rem)]"
      aria-live="polite"
      aria-relevant="additions"
      data-toast-scope={props.scope === null ? "none" : String(props.scope)}
      onClick={(e) => e.stopPropagation()}
      onFocusIn={(e) => {
        const rel = e.relatedTarget;
        if (
          rel instanceof HTMLElement &&
          rel !== document.body &&
          !regionRef.contains(rel)
        ) {
          priorFocusEl = rel;
        }
      }}
    >
      <Show when={isActiveScope()}>
        <For each={toasts()}>
          {(t, index) => {
            const isYoung =
              t.createdAt === undefined || Date.now() - t.createdAt < 300;
            let dismissBtnRef: HTMLButtonElement | undefined;
            let pointerDismiss = false;
            let handledFocus = false;

            onCleanup(() => {
              if (
                !handledFocus &&
                !pointerDismiss &&
                dismissBtnRef &&
                document.activeElement === dismissBtnRef
              ) {
                const removedIdx = index();
                queueMicrotask(() => restoreFocusAfterDismiss(removedIdx));
              }
            });

            return (
              <div
                role={t.tone === "error" ? "alert" : "status"}
                class={`alert alert-soft ${ALERT[t.tone]} pointer-events-auto ${isYoung ? "fade-in" : ""} py-2 pr-2 text-sm shadow-lg`}
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
                  ref={dismissBtnRef}
                  type="button"
                  class="btn btn-ghost btn-xs btn-square"
                  aria-label="Dismiss notification"
                  onPointerDown={(e) => {
                    pointerDismiss = true;
                    e.preventDefault();
                  }}
                  onMouseDown={(e) => {
                    pointerDismiss = true;
                    e.preventDefault();
                  }}
                  onKeyDown={() => {
                    pointerDismiss = false;
                  }}
                  onClick={(e) => {
                    const wasKeyboard = e.detail === 0 && !pointerDismiss;
                    const wasFocused = document.activeElement === dismissBtnRef;
                    const currentIdx = index();
                    if (wasKeyboard || (wasFocused && !pointerDismiss)) {
                      handledFocus = true;
                      dismissToast(t.id);
                      restoreFocusAfterDismiss(currentIdx);
                    } else {
                      pointerDismiss = true;
                      dismissToast(t.id);
                    }
                    pointerDismiss = false;
                  }}
                >
                  <Icons.XMark class="size-4" />
                </button>
              </div>
            );
          }}
        </For>
      </Show>
    </div>
  );
}

export function Toaster() {
  return <ToastRegion scope="root" />;
}

export default Toaster;
