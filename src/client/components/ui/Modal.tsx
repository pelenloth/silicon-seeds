import {
  createEffect,
  createSignal,
  createUniqueId,
  onCleanup,
  Show,
  type JSX,
} from "solid-js";
import { registerOverlay, unregisterOverlay } from "../../stores/overlays";
import { ToastRegion } from "./Toaster";

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
  const [overlayId, setOverlayId] = createSignal<number | null>(null);

  const releaseOverlay = () => {
    const id = overlayId();
    if (id !== null) {
      unregisterOverlay(id);
      setOverlayId(null);
    }
  };

  onCleanup(() => {
    releaseOverlay();
  });

  createEffect(() => {
    if (!ref) return;
    if (props.open) {
      if (overlayId() === null) {
        setOverlayId(registerOverlay());
      }
      if (!ref.open) {
        ref.showModal();
      }
    } else {
      releaseOverlay();
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
        releaseOverlay();
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
      <ToastRegion scope={overlayId()} />
    </dialog>
  );
}

export default Modal;
