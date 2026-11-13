import { Show } from "solid-js";
import { pendingConfirm, resolveConfirm } from "../../stores/confirm";
import { Modal } from "./Modal";

export function ConfirmHost() {
  const opts = () => pendingConfirm();

  return (
    <Modal
      open={!!opts()}
      title={opts()?.title ?? ""}
      onClose={() => resolveConfirm(false)}
      actions={
        <>
          <button
            type="button"
            class="btn btn-sm btn-ghost"
            onClick={() => resolveConfirm(false)}
          >
            {opts()?.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            class={`btn btn-sm ${opts()?.tone === "danger" ? "btn-error" : "btn-primary"}`}
            onClick={() => resolveConfirm(true)}
          >
            {opts()?.confirmLabel ?? "Confirm"}
          </button>
        </>
      }
    >
      <Show when={opts()?.body}>
        <p class="text-sm text-base-content/80">{opts()!.body}</p>
      </Show>
    </Modal>
  );
}

export default ConfirmHost;
