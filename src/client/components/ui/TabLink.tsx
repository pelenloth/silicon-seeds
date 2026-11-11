import { useNavigate } from "@solidjs/router";
import type { JSX } from "solid-js";

export type TabLinkProps = {
  href: string;
  active: boolean;
  children: JSX.Element;
  class?: string;
};

export function TabLink(props: TabLinkProps) {
  const navigate = useNavigate();

  const handleClick = (e: MouseEvent) => {
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    ) {
      return;
    }
    e.preventDefault();
    navigate(props.href);
  };

  return (
    <a
      role="tab"
      href={props.href}
      class={`tab ${props.active ? "tab-active" : ""} ${props.class ?? ""}`.trim()}
      aria-current={props.active ? "page" : undefined}
      aria-selected={props.active ? "true" : undefined}
      onClick={handleClick}
    >
      {props.children}
    </a>
  );
}

export default TabLink;
