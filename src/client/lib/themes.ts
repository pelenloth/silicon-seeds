export const THEMES = [
  { id: "daylight", label: "Daylight", scheme: "light" },
  { id: "tokyonight", label: "Tokyo Night", scheme: "dark" },
  { id: "opencode", label: "OpenCode", scheme: "dark" },
  { id: "dracula", label: "Dracula", scheme: "dark" },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];
export type ThemePref = ThemeId | "system";
export const THEME_STORAGE_KEY = "theme";
export const LEGACY_THEME_ALIASES: Record<string, ThemeId> = {
  bumblebee: "daylight",
  light: "daylight",
  dark: "tokyonight",
};

const KNOWN_IDS = new Set<string>(THEMES.map((t) => t.id));

export function normalizeThemePref(
  stored: string | null | undefined,
): ThemePref {
  if (!stored || stored === "system") return "system";
  if (stored in LEGACY_THEME_ALIASES) return LEGACY_THEME_ALIASES[stored];
  if (KNOWN_IDS.has(stored)) return stored as ThemeId;
  return "system";
}

export function resolveTheme(pref: ThemePref, prefersDark: boolean): ThemeId {
  if (pref === "system") return prefersDark ? "tokyonight" : "daylight";
  return pref;
}
