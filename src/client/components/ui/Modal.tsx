import { createEffect, createUniqueId, Show, type JSX } from "solid-js";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  actions?: JSX.Element;
  size?: "md" | "lg";
  children: JSX.Element;
};

export function Modal(props: ModalProps) {
  const titleId = createUniqueId();
  let ref!: HTMLDialogElement;
  let closingProgrammatically = false;

  createEffect(() => {
    if (!ref) return;
    if (props.open) {
      if (!ref.open) {
        ref.showModal();
      }
    } else {
      if (ref.open) {
        closingProgrammatically = true;
        ref.close();
      }
    }
  });

  return (
    <dialog
      ref={ref}
      class="modal"
      aria-labelledby={titleId}
      onClose={() => {
        if (closingProgrammatically) {
          closingProgrammatically = false;
          return;
        }
        props.onClose();
      }}
    >
      <div
        class={`modal-box ${props.size === "lg" ? "max-w-2xl" : "max-w-md"}`}
      >
        <h3 id={titleId} class="text-base font-semibold">
          {props.title}
        </h3>
        <div class="mt-3">{props.children}</div>
        <Show when={props.actions}>
          <div class="modal-action">{props.actions}</div>
        </Show>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button aria-label="Close">close</button>
      </form>
    </dialog>
  );
}

export default Modal;
