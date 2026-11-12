import type { RouteMeta } from "./routes";

export type CommandGroup = "Create" | "Go to" | "Jobs" | "Theme";
export type Command = {
  id: string;
  group: CommandGroup;
  label: string;
  keywords?: string;
  run: () => void;
};
export type QuickKind = "image" | "video" | "audio";
export type PaletteContext = {
  query: string;
  routes: readonly RouteMeta[];
  jobs: readonly { id: string; name: string }[];
  themes: readonly { id: string; label: string }[];
  navigate: (path: string) => void;
  setTheme: (id: string) => void;
  quickCreate?: (kind: QuickKind, prompt: string) => void;
};

export function buildCommands(ctx: PaletteContext): Command[] {
  const out: Command[] = [];
  for (const r of ctx.routes) {
    out.push({
      id: `goto-${r.path}`,
      group: "Go to",
      label: r.title,
      keywords: r.path,
      run: () => ctx.navigate(r.path),
    });
  }
  const settingsSections = [
    {
      id: "goto-settings-defaults",
      label: "Settings: Defaults",
      path: "/settings?tab=defaults",
      keywords: "defaults",
    },
    {
      id: "goto-settings-loras",
      label: "Settings: LoRAs",
      path: "/settings?tab=loras",
      keywords: "loras",
    },
    {
      id: "goto-settings-presets",
      label: "Settings: Style presets",
      path: "/settings?tab=presets",
      keywords: "presets style",
    },
    {
      id: "goto-settings-appearance",
      label: "Settings: Appearance",
      path: "/settings?tab=appearance",
      keywords: "appearance theme",
    },
  ] as const;
  for (const s of settingsSections) {
    out.push({
      id: s.id,
      group: "Go to",
      label: s.label,
      keywords: s.keywords,
      run: () => ctx.navigate(s.path),
    });
  }
  for (const j of ctx.jobs) {
    out.push({
      id: `job-${j.id}`,
      group: "Jobs",
      label: j.name,
      keywords: j.id,
      run: () => ctx.navigate(`/jobs/${encodeURIComponent(j.id)}`),
    });
  }
  for (const t of ctx.themes) {
    out.push({
      id: `theme-${t.id}`,
      group: "Theme",
      label: `Theme: ${t.label}`,
      run: () => ctx.setTheme(t.id),
    });
  }
  const q = ctx.query.trim();
  const words = q ? q.split(/\s+/).length : 0;
  const quickCreate = ctx.quickCreate;
  if (quickCreate && (words >= 3 || q.length >= 16)) {
    out.push(
      {
        id: "create-image",
        group: "Create",
        label: `Generate image: “${q}”`,
        run: () => quickCreate("image", q),
      },
      {
        id: "create-video",
        group: "Create",
        label: `Generate video: “${q}”`,
        run: () => quickCreate("video", q),
      },
      {
        id: "create-audio",
        group: "Create",
        label: `Generate audio: “${q}”`,
        run: () => quickCreate("audio", q),
      },
    );
  }
  return out;
}

export function filterCommands(
  commands: readonly Command[],
  query: string,
): Command[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const out: Command[] = [];
  let jobCount = 0;

  for (const cmd of commands) {
    if (cmd.group !== "Create" && tokens.length > 0) {
      const hay = `${cmd.label} ${cmd.keywords ?? ""}`.toLowerCase();
      if (!tokens.every((t) => hay.includes(t))) continue;
    }
    if (cmd.group === "Jobs") {
      if (jobCount >= 6) continue;
      jobCount++;
    }
    out.push(cmd);
  }
  return out;
}
