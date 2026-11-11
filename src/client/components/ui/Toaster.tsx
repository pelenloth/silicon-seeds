import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
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
  scope: number | null;
};

export function ToastRegion(props: ToastRegionProps) {
  return (
    <div
      class="toast-region toast toast-bottom toast-center sm:toast-end fixed inset-auto bottom-0 left-1/2 -translate-x-1/2 sm:left-auto sm:right-0 sm:translate-x-0 z-[70] m-0 border-0 bg-transparent p-4 text-base-content overflow-visible pointer-events-none max-w-[calc(100vw-2rem)]"
      aria-live="polite"
      aria-relevant="additions"
      data-toast-scope={props.scope === null ? "root" : String(props.scope)}
      onClick={(e) => e.stopPropagation()}
    >
      <Show when={topOverlayId() === props.scope}>
        <For each={toasts()}>
          {(t) => {
            const isYoung =
              t.createdAt === undefined || Date.now() - t.createdAt < 300;
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
                  type="button"
                  class="btn btn-ghost btn-xs btn-square"
                  aria-label="Dismiss notification"
                  onClick={() => dismissToast(t.id)}
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
  return <ToastRegion scope={null} />;
}

export default Toaster;
