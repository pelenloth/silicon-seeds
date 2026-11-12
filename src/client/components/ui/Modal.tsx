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
  dismissible?: boolean;
  children: JSX.Element;
};

export function Modal(props: ModalProps) {
  const titleId = createUniqueId();
  let ref!: HTMLDialogElement;
  let closingProgrammatically = false;
  let currentOverlayId: number | null = null;
  const [overlayId, setOverlayId] = createSignal<number | null>(null);

  const isDismissible = () => props.dismissible !== false;

  const releaseOverlay = () => {
    if (currentOverlayId !== null) {
      unregisterOverlay(currentOverlayId);
      currentOverlayId = null;
      setOverlayId(null);
    }
  };

  onCleanup(() => {
    releaseOverlay();
  });

  createEffect(() => {
    if (!ref) return;
    if (props.open) {
      if (currentOverlayId === null) {
        currentOverlayId = registerOverlay();
        setOverlayId(currentOverlayId);
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
      onCancel={(e) => {
        if (!isDismissible()) {
          e.preventDefault();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !isDismissible()) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onClose={() => {
        if (closingProgrammatically) {
          releaseOverlay();
          closingProgrammatically = false;
          return;
        }
        if (!isDismissible()) {
          ref.showModal();
          return;
        }
        releaseOverlay();
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
      <form
        method="dialog"
        class="modal-backdrop"
        onSubmit={(e) => {
          if (!isDismissible()) {
            e.preventDefault();
          }
        }}
      >
        <button aria-label="Close" disabled={!isDismissible()}>
          close
        </button>
      </form>
      <ToastRegion scope={overlayId()} />
    </dialog>
  );
}

export default Modal;
