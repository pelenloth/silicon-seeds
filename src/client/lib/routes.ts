export type RouteGroup = "main" | "create" | "footer";
export type RouteMeta = {
  path: string;
  title: string;
  group: RouteGroup;
  sidebarId: string;
  icon: string;
  hidden?: boolean;
};

export const ROUTES: readonly RouteMeta[] = [
  {
    path: "/",
    title: "Home",
    group: "main",
    sidebarId: "sidebar-home",
    icon: "Home",
  },
  {
    path: "/jobs",
    title: "Jobs",
    group: "main",
    sidebarId: "sidebar-jobs-summary",
    icon: "Jobs",
  },
  {
    path: "/gallery",
    title: "Gallery",
    group: "main",
    sidebarId: "sidebar-gallery",
    icon: "Gallery",
  },
  {
    path: "/create/image",
    title: "Image",
    group: "create",
    sidebarId: "sidebar-image",
    icon: "Image",
  },
  {
    path: "/create/video",
    title: "Video",
    group: "create",
    sidebarId: "sidebar-video",
    icon: "Video",
  },
  {
    path: "/create/text-to-video",
    title: "Text to Video",
    group: "create",
    sidebarId: "sidebar-text-to-video",
    icon: "Film",
  },
  {
    path: "/create/audio",
    title: "Audio",
    group: "create",
    sidebarId: "sidebar-audio",
    icon: "Audio",
  },
  {
    path: "/compose",
    title: "Compose",
    group: "create",
    sidebarId: "sidebar-compose",
    icon: "Compose",
  },
  {
    path: "/settings",
    title: "Settings",
    group: "footer",
    sidebarId: "sidebar-settings",
    icon: "CogSettingsIcon",
  },
  {
    path: "/dev/kit",
    title: "UI kit",
    group: "footer",
    sidebarId: "sidebar-dev-kit",
    icon: "CogSettingsIcon",
    hidden: true,
  },
] as const;

export function routeForPath(pathname: string): RouteMeta | undefined {
  if (pathname === "/") {
    return ROUTES.find((r) => r.path === "/");
  }
  let best: RouteMeta | undefined;
  for (const r of ROUTES) {
    if (r.path === "/") continue;
    if (pathname === r.path || pathname.startsWith(`${r.path}/`)) {
      if (!best || r.path.length > best.path.length) {
        best = r;
      }
    }
  }
  return best;
}

export function pageTitle(pathname: string): string {
  return routeForPath(pathname)?.title ?? "Not found";
}

export function documentTitle(pathname: string, activeCount: number): string {
  const title = pageTitle(pathname);
  const prefix = activeCount > 0 ? `(${activeCount}) ` : "";
  return `${prefix}${title} · Silicon Seeds`;
}
