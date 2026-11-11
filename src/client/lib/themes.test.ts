import { describe, expect, test } from "bun:test";
import {
  LEGACY_THEME_ALIASES,
  normalizeThemePref,
  resolveTheme,
  THEMES,
} from "./themes";

describe("themes", () => {
  test("known ids pass through", () => {
    for (const t of THEMES) expect(normalizeThemePref(t.id)).toBe(t.id);
  });
  test("legacy and unknown values (B2)", () => {
    expect(normalizeThemePref("bumblebee")).toBe("daylight");
    expect(normalizeThemePref("light")).toBe("daylight");
    expect(normalizeThemePref("dark")).toBe("tokyonight");
    expect(normalizeThemePref("system")).toBe("system");
    expect(normalizeThemePref(null)).toBe("system");
    expect(normalizeThemePref("nope")).toBe("system");
  });
  test("system resolves by color scheme, explicit choice wins", () => {
    expect(resolveTheme("system", true)).toBe("tokyonight");
    expect(resolveTheme("system", false)).toBe("daylight");
    expect(resolveTheme("dracula", false)).toBe("dracula");
  });
  test("index.html bootstrap and index.css know every theme (no drift)", async () => {
    const html = await Bun.file(
      new URL("../index.html", import.meta.url),
    ).text();
    const css = await Bun.file(new URL("../index.css", import.meta.url)).text();
    const script = html.slice(
      html.indexOf("<script>"),
      html.indexOf("</script>"),
    );
    for (const t of THEMES) {
      expect(script).toContain(`"${t.id}"`);
      expect(css).toContain(t.id);
    }
    for (const legacy of Object.keys(LEGACY_THEME_ALIASES))
      expect(script).toContain(`${legacy}`);
    expect(css).not.toContain("bumblebee");
    expect(html).toContain('rel="icon"');
  });
});
