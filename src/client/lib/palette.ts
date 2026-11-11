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
  const q = ctx.query.trim();
  const quickCreate = ctx.quickCreate;
  if (quickCreate && q.length >= 3) {
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
  for (const r of ctx.routes) {
    out.push({
      id: `goto-${r.path}`,
      group: "Go to",
      label: r.title,
      keywords: r.path,
      run: () => ctx.navigate(r.path),
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
