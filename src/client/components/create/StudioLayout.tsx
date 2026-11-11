import type { JSX } from "solid-js";

export type StudioLayoutProps = {
  onSubmit: (form: HTMLFormElement) => void;
  form: JSX.Element;
  result: JSX.Element;
};

export function StudioLayout(props: StudioLayoutProps) {
  return (
    <div class="page fade-in">
      <div class="mx-auto grid max-w-[1600px] gap-4 xl:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] xl:items-start">
        <form
          class="flex min-w-0 flex-col gap-4"
          novalidate
          onSubmit={(e) => {
            e.preventDefault();
            props.onSubmit(e.currentTarget);
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
