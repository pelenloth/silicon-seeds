import { A, useLocation } from "@solidjs/router";
import {
  createEffect,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import { ROUTES, routeForPath, type RouteMeta } from "../../lib/routes";
import { activeCount } from "../../stores/jobs";
import {
  mobileNavOpen,
  setMobileNavOpen,
  sidebarCollapsed,
  toggleSidebar,
} from "../../stores/shell";
import { Icons, ROUTE_ICONS } from "../Icons";

const MAIN_ROUTES = ROUTES.filter((r) => !r.hidden && r.group === "main");
const CREATE_ROUTES = ROUTES.filter((r) => !r.hidden && r.group === "create");
const FOOTER_ROUTES = ROUTES.filter((r) => !r.hidden && r.group === "footer");

export function Sidebar() {
  const location = useLocation();
  let asideRef: HTMLElement | undefined;
  let navRef: HTMLElement | undefined;
  const [isBelowLg, setIsBelowLg] = createSignal(
    typeof window !== "undefined" ? window.innerWidth < 1024 : false,
  );

  onMount(() => {
    if (typeof window === "undefined") return;
    const updateViewport = () => {
      setIsBelowLg(window.innerWidth < 1024);
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    onCleanup(() => window.removeEventListener("resize", updateViewport));
  });

  let closedByPathnameChange = false;
  createEffect(
    on(
      () => location.pathname,
      () => {
        if (mobileNavOpen()) {
          closedByPathnameChange = true;
        }
      },
      { defer: true },
    ),
  );

  createEffect(
    on(
      mobileNavOpen,
      (open, prev) => {
        if (open) {
          closedByPathnameChange = false;
          queueMicrotask(() => {
            const firstLink = navRef?.querySelector<HTMLElement>("a");
            firstLink?.focus();
          });
          const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
              if (
                (e.target instanceof Element &&
                  e.target.closest("dialog[open]") !== null) ||
                document.querySelector("dialog[open]") !== null
              ) {
                return;
              }
              e.preventDefault();
              setMobileNavOpen(false);
            }
          };
          document.addEventListener("keydown", onKey);
          onCleanup(() => document.removeEventListener("keydown", onKey));
        } else if (prev) {
          const skipMenuFocus = closedByPathnameChange;
          closedByPathnameChange = false;
          if (!skipMenuFocus) {
            queueMicrotask(() => {
              const btn =
                document.getElementById("mobile-nav-button") ??
                document.querySelector<HTMLElement>(
                  'button[aria-label="Open navigation"]',
                );
              btn?.focus();
            });
          }
        }
      },
      { defer: true },
    ),
  );

  const isInert = () => isBelowLg() && !mobileNavOpen();

  const isActive = (r: RouteMeta) =>
    routeForPath(location.pathname)?.path === r.path;

  const renderItem = (r: RouteMeta) => (
    <li>
      <A
        href={r.path}
        id={r.sidebarId}
        end={r.path === "/"}
        activeClass="bg-primary/10 text-primary font-medium"
        aria-current={isActive(r) ? "page" : undefined}
        class="tooltip-right flex items-center gap-3"
        classList={{ "lg:tooltip lg:justify-center": sidebarCollapsed() }}
        data-tip={r.title}
      >
        <Dynamic component={ROUTE_ICONS[r.icon]} class="size-5 shrink-0" />
        <span class="truncate" classList={{ "lg:sr-only": sidebarCollapsed() }}>
          {r.title}
        </span>
        <Show when={r.path === "/jobs" && activeCount() > 0}>
          <span
            class="badge badge-primary badge-xs ml-auto"
            classList={{ "lg:hidden": sidebarCollapsed() }}
          >
            {activeCount()}
          </span>
        </Show>
      </A>
    </li>
  );

  return (
    <>
      <Show when={mobileNavOpen()}>
        <button
          class="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      </Show>
      <aside
        ref={asideRef}
        id="app-sidebar"
        inert={isInert() || undefined}
        data-collapsed={sidebarCollapsed() ? "true" : "false"}
        class="fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col border-r border-base-300 bg-base-100 transition-[transform,width] duration-150 lg:static lg:translate-x-0"
        classList={{
          "-translate-x-full": !mobileNavOpen(),
          "translate-x-0": mobileNavOpen(),
          "lg:w-16": sidebarCollapsed(),
          "lg:w-60": !sidebarCollapsed(),
        }}
      >
        <A
          href="/"
          class="flex h-14 items-center gap-2 border-b border-base-300 px-4"
          aria-label="Silicon Seeds home"
        >
          <Icons.Logo class="size-7 shrink-0 text-primary" />
          <span
            class="truncate text-base font-semibold"
            classList={{ "lg:hidden": sidebarCollapsed() }}
          >
            Silicon Seeds
          </span>
        </A>
        <nav
          ref={navRef}
          aria-label="Main"
          class="relative flex min-h-0 flex-1 flex-col overflow-y-auto scroll-thin p-2"
        >
          <ul class="menu menu-sm w-full gap-0.5 p-0">
            <For each={MAIN_ROUTES}>{renderItem}</For>
          </ul>
          <p
            class="section-label px-3 pb-1 pt-4"
            classList={{ "lg:hidden": sidebarCollapsed() }}
          >
            Create
          </p>
          <ul class="menu menu-sm w-full gap-0.5 p-0">
            <For each={CREATE_ROUTES}>{renderItem}</For>
          </ul>
          <ul class="menu menu-sm mt-auto w-full gap-0.5 p-0">
            <For each={FOOTER_ROUTES}>{renderItem}</For>
          </ul>
        </nav>
        <div class="hidden border-t border-base-300 p-2 lg:block">
          <button
            class="btn btn-ghost btn-sm btn-square"
            aria-label={
              sidebarCollapsed() ? "Expand sidebar" : "Collapse sidebar"
            }
            onClick={toggleSidebar}
          >
            <Icons.SidebarToggle />
          </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
