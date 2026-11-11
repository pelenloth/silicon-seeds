import type { ParentProps } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import { Icons } from "./Icons";
import { initTheme } from "../stores/theme";

function getPageTitle(path: string) {
  if (path.startsWith("/jobs") || path === "/" || path.startsWith("/dashboard"))
    return "Jobs";
  if (path.startsWith("/gallery")) return "Gallery";
  if (path.startsWith("/compose")) return "Compose";
  if (path.startsWith("/create/audio")) return "Audio";
  if (path.startsWith("/create/image")) return "Image";

  if (path.startsWith("/create/text-to-video")) return "Text to Video";

  if (path.startsWith("/create/video")) return "Video";
  if (path.startsWith("/settings")) return "Settings";
  return "🌀◝(ᵔᗜᵔ)◜";
}

export default function Layout(props: ParentProps) {
  initTheme();
  const location = useLocation();
  const title = () => getPageTitle(location.pathname);

  return (
    <div class="drawer lg:drawer-open min-h-screen bg-base-100">
      <input id="main-drawer" type="checkbox" class="drawer-toggle" />
      <div class="drawer-content flex flex-col">
        <header class="navbar bg-base-200 px-4 shadow-sm z-10">
          <div class="flex-none">
            <label for="main-drawer" class="btn btn-ghost btn-circle btn-sm">
              <Icons.Drawer />
            </label>
          </div>
          <div class="flex-1">
            <h1 id="header-title" class="text-xl pl-1 font-bold">
              {title()}
            </h1>
          </div>
        </header>
        <main class="flex-1">
          <div id="job-content-container" class="min-h-[400px]">
            {props.children}
          </div>
        </main>
      </div>
      <aside class="drawer-side z-20 is-drawer-close:overflow-visible">
        <label for="main-drawer" class="drawer-overlay" />
        <div class="is-drawer-close:w-20 is-drawer-open:w-64 bg-base-200 border-r border-base-300 flex flex-col items-start min-h-full">
          <A
            href="/jobs"
            class="flex items-center is-drawer-close:justify-center gap-3 p-4 w-full hover:bg-base-300 transition-colors"
          >
            <Icons.Logo />
            <span class="text-xl font-bold text-primary is-drawer-close:hidden whitespace-nowrap">
              Silicon Seeds
            </span>
          </A>
          <ul class="menu menu-md w-full grow px-2 py-4">
            <li class="w-full">
              <A
                href="/jobs"
                id="sidebar-jobs-summary"
                class="is-drawer-close:justify-center py-2"
              >
                <Icons.Jobs />
                <span class="is-drawer-close:hidden">Jobs</span>
              </A>
            </li>
            <li class="w-full">
              <A
                href="/gallery"
                id="sidebar-gallery"
                class="is-drawer-close:justify-center py-2"
              >
                <Icons.Gallery />
                <span class="is-drawer-close:hidden">Gallery</span>
              </A>
            </li>
            <li class="menu-title">Create</li>
            <li class="w-full">
              <A
                href="/compose"
                id="sidebar-compose"
                class="is-drawer-close:justify-center py-2"
              >
                <Icons.Compose />
                <span class="is-drawer-close:hidden">Compose</span>
              </A>
            </li>
            <li class="w-full">
              <A
                href="/create/image"
                id="sidebar-image"
                class="is-drawer-close:justify-center py-2"
              >
                <Icons.Image />
                <span class="is-drawer-close:hidden">Image</span>
              </A>
            </li>
            <li class="w-full">
              <A
                href="/create/video"
                id="sidebar-video"
                class="is-drawer-close:justify-center py-2"
              >
                <Icons.Video />
                <span class="is-drawer-close:hidden">Video</span>
              </A>
            </li>

            <li class="w-full">
              <A
                href="/create/text-to-video"
                id="sidebar-text-to-video"
                class="is-drawer-close:justify-center py-2"
              >
                <Icons.Video />
                <span class="is-drawer-close:hidden">Text to Video</span>
              </A>
            </li>

            <li class="w-full">
              <A
                href="/create/audio"
                id="sidebar-audio"
                class="is-drawer-close:justify-center py-2"
              >
                <Icons.Audio />
                <span class="is-drawer-close:hidden">Audio</span>
              </A>
            </li>
            <li class="w-full">
              <A
                href="/settings"
                id="sidebar-settings"
                class="is-drawer-close:justify-center py-2"
              >
                <Icons.CogSettingsIcon />
                <span class="is-drawer-close:hidden">Settings</span>
              </A>
            </li>
          </ul>
          <div class="w-full px-2 pb-4 flex flex-col gap-2">
            <div class="flex items-center gap-2 justify-center is-drawer-open:justify-end">
              <label for="main-drawer" class="btn btn-ghost btn-circle btn-sm">
                <Icons.Drawer />
              </label>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
