import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { dismissToast, toasts, type ToastTone } from "../../stores/toast";
import { Icons } from "../Icons";

const ALERT: Record<ToastTone, string> = {
  success: "alert-success",
  error: "alert-error",
  info: "alert-info",
  warning: "alert-warning",
};

export function Toaster() {
  return (
    <div class="toast toast-end toast-bottom z-[70]" aria-live="polite">
      <For each={toasts()}>
        {(t) => (
          <div
            role="status"
            class={`alert alert-soft ${ALERT[t.tone]} fade-in py-2 pr-2 text-sm shadow-lg`}
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
