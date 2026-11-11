import { useLocation } from "@solidjs/router";
import {
  createEffect,
  on,
  onCleanup,
  onMount,
  type ParentProps,
} from "solid-js";
import { documentTitle } from "../../lib/routes";
import { activeCount, startJobsStore } from "../../stores/jobs";
import { loadDefaults } from "../../stores/settings";
import {
  paletteOpen,
  setMobileNavOpen,
  setPaletteOpen,
} from "../../stores/shell";
import { initTheme } from "../../stores/theme";
import { ConfirmHost } from "../ui/ConfirmHost";
import { Toaster } from "../ui/Toaster";
import CommandPalette from "./CommandPalette";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppShell(props: ParentProps) {
  const location = useLocation();
  onMount(() => {
    initTheme();
    startJobsStore();
    void loadDefaults();
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!paletteOpen());
      }
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });
  createEffect(() => {
    document.title = documentTitle(location.pathname, activeCount());
  });
  createEffect(
    on(
      () => location.pathname,
      () => setMobileNavOpen(false),
    ),
  );
  return (
    <div class="flex h-dvh overflow-hidden bg-base-200 text-base-content">
      <a
        href="#app-main"
        class="btn btn-primary btn-sm sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[80]"
      >
        Skip to content
      </a>
      <Sidebar />
      <div class="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main
          id="app-main"
          tabindex="-1"
          class="min-h-0 flex-1 overflow-y-auto scroll-thin focus:outline-none"
        >
          {props.children}
        </main>
      </div>
      <CommandPalette />
      <ConfirmHost />
      <Toaster />
    </div>
  );
}
