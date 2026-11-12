import { useNavigate } from "@solidjs/router";
import type { JSX } from "solid-js";

export type TabLinkProps = {
  href: string;
  active: boolean;
  variant?: "tab" | "chip";
  size?: "xs" | "sm";
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

  const baseClass = () => {
    if (props.variant === "chip") {
      const sz = props.size === "xs" ? "btn-xs" : "btn-sm";
      return `btn ${sz} ${props.active ? "btn-primary" : "btn-ghost"}`;
    }
    return `tab ${props.active ? "tab-active" : ""}`.trim();
  };

  return (
    <a
      href={props.href}
      class={`${baseClass()} ${props.class ?? ""}`.trim()}
      aria-current={props.active ? "page" : undefined}
      onClick={handleClick}
    >
      {props.children}
    </a>
  );
}

export default TabLink;
