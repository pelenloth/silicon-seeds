import { useLocation } from "@solidjs/router";
import { pageTitle } from "../../lib/routes";
import { setMobileNavOpen, setPaletteOpen } from "../../stores/shell";
import { Icons } from "../Icons";
import ActivityCenter from "./ActivityCenter";
import NewMenu from "./NewMenu";

export function Topbar() {
  const location = useLocation();

  return (
    <header class="flex h-14 shrink-0 items-center gap-2 border-b border-base-300 bg-base-100 px-3 lg:px-6">
      <button
        class="btn btn-ghost btn-sm btn-square lg:hidden"
        aria-label="Open navigation"
        onClick={() => setMobileNavOpen(true)}
      >
        <Icons.Bars3 />
      </button>
      <h1 id="header-title" class="truncate text-base font-semibold">
        {pageTitle(location.pathname)}
      </h1>
      <div class="ml-auto flex items-center gap-2">
        <button
          id="palette-button"
          class="btn btn-ghost btn-sm gap-2 font-normal text-base-content/60"
          onClick={() => setPaletteOpen(true)}
          aria-label="Search or run a command"
        >
          <Icons.Search class="size-4" />
          <span class="hidden md:inline">Search or run a command</span>
          <kbd class="kbd kbd-xs hidden md:inline-flex">Ctrl K</kbd>
        </button>
        <ActivityCenter />
        <NewMenu />
      </div>
    </header>
  );
}

export default Topbar;
