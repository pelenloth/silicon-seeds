import { A, useLocation } from "@solidjs/router";
import {
  createEffect,
  ErrorBoundary,
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

function ShellErrorFallback(props: {
  err: unknown;
  reset: () => void;
  pathname: string;
}) {
  createEffect(
    on(
      () => props.pathname,
      () => props.reset(),
      { defer: true },
    ),
  );

  const message = () =>
    props.err instanceof Error
      ? props.err.message
      : String(props.err ?? "Unexpected error");

  return (
    <div class="page max-w-xl mx-auto">
      <div class="panel p-6 flex flex-col gap-3">
        <h2 class="text-base font-semibold">Something went wrong</h2>
        <p class="text-sm text-base-content/70">{message()}</p>
        <div class="flex items-center gap-2 pt-1">
          <button
            type="button"
            class="btn btn-primary btn-sm"
            onClick={() => props.reset()}
          >
            Try again
          </button>
          <A href="/jobs" class="btn btn-ghost btn-sm">
            Go to Jobs
          </A>
        </div>
      </div>
    </div>
  );
}

export default function AppShell(props: ParentProps) {
  const location = useLocation();
  let mainRef: HTMLElement | undefined;

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
      () => {
        setMobileNavOpen(false);
        if (mainRef) {
          mainRef.scrollTop = 0;
          mainRef.focus();
        }
      },
      { defer: true },
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
          ref={mainRef}
          id="app-main"
          tabindex="-1"
          class="min-h-0 flex-1 overflow-y-auto scroll-thin focus:outline-none"
        >
          <ErrorBoundary
            fallback={(err, reset) => (
              <ShellErrorFallback
                err={err}
                reset={reset}
                pathname={location.pathname}
              />
            )}
          >
            {props.children}
          </ErrorBoundary>
        </main>
      </div>
      <CommandPalette />
      <ConfirmHost />
      <Toaster />
    </div>
  );
}
