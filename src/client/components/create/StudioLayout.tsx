import type { JSX } from "solid-js";

export type StudioLayoutProps = {
  onSubmit: (form: HTMLFormElement) => void;
  formRef?: (el: HTMLFormElement) => void;
  form: JSX.Element;
  result: JSX.Element;
};

export function StudioLayout(props: StudioLayoutProps) {
  return (
    <div class="page fade-in">
      <div class="mx-auto grid max-w-[1600px] gap-4 xl:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] xl:items-start">
        <form
          ref={props.formRef}
          class="flex min-w-0 flex-col gap-4 scroll-pb-24"
          novalidate
          onSubmit={(e) => {
            e.preventDefault();
            props.onSubmit(e.currentTarget);
          }}
          onFocusIn={(e) => {
            const target = e.target;
            if (!(target instanceof HTMLElement)) return;
            if (target.closest("#submit-bar")) return;
            const bar = e.currentTarget.querySelector("#submit-bar");
            if (!bar) return;
            const tRect = target.getBoundingClientRect();
            const bRect = bar.getBoundingClientRect();
            const horizOverlap =
              tRect.left < bRect.right && tRect.right > bRect.left;
            if (horizOverlap && tRect.bottom > bRect.top - 8) {
              const scroller =
                target.closest("#app-main") ?? document.documentElement;
              scroller.scrollBy({
                top: tRect.bottom - bRect.top + 16,
                behavior: "instant",
              });
            }
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.requestSubmit();
            }
          }}
        >
          {props.form}
        </form>
        {props.result}
      </div>
    </div>
  );
}

export default StudioLayout;
