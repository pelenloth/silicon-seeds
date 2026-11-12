import { describe, expect, test } from "bun:test";
import { buildCommands, filterCommands, type PaletteContext } from "./palette";
import { ROUTES } from "./routes";

function ctx(over: Partial<PaletteContext> = {}) {
  const calls: string[] = [];
  const c: PaletteContext = {
    query: "",
    routes: ROUTES,
    jobs: [
      { id: "j1", name: "Desert Dunes" },
      { id: "j2", name: "Night City" },
    ],
    themes: [
      { id: "system", label: "System" },
      { id: "dracula", label: "Dracula" },
    ],
    navigate: (p) => calls.push(`nav:${p}`),
    setTheme: (id) => calls.push(`theme:${id}`),
    ...over,
  };
  return { c, calls };
}

describe("palette", () => {
  test("without a query: every route, settings sections, jobs and themes, no quick create", () => {
    const { c } = ctx();
    const cmds = filterCommands(buildCommands(c), "");
    expect(cmds.filter((x) => x.group === "Go to").length).toBe(
      ROUTES.filter((r) => !r.hidden).length + 4,
    );
    expect(cmds.filter((x) => x.group === "Jobs").map((x) => x.label)).toEqual([
      "Desert Dunes",
      "Night City",
    ]);
    expect(cmds.filter((x) => x.group === "Theme").map((x) => x.label)).toEqual(
      ["Theme: System", "Theme: Dracula"],
    );
    expect(cmds.some((x) => x.group === "Create")).toBe(false);
  });
  test("includes settings section commands that navigate to the right tab", () => {
    const { c, calls } = ctx();
    const cmds = buildCommands(c);
    const settingsCmds = cmds.filter((x) => x.label.startsWith("Settings: "));
    expect(settingsCmds.map((x) => x.label)).toEqual([
      "Settings: Defaults",
      "Settings: LoRAs",
      "Settings: Style presets",
      "Settings: Appearance",
    ]);
    for (const sc of settingsCmds) {
      sc.run();
    }
    expect(calls).toEqual([
      "nav:/settings?tab=defaults",
      "nav:/settings?tab=loras",
      "nav:/settings?tab=presets",
      "nav:/settings?tab=appearance",
    ]);
  });
  test("filtering matches every token, case-insensitively", () => {
    const { c } = ctx({ query: "text vid" });
    const cmds = filterCommands(buildCommands(c), "text vid");
    expect(cmds.map((x) => x.label)).toEqual(["Text to Video"]);
    expect(
      filterCommands(buildCommands(ctx().c), "DESERT").map((x) => x.label),
    ).toEqual(["Desert Dunes"]);
  });
  test("commands run through the context and encode job ids", () => {
    const { c, calls } = ctx({
      jobs: [
        { id: "j1", name: "Desert Dunes" },
        { id: "j 2/a?b#c", name: "Night City" },
      ],
    });
    const cmds = buildCommands(c);
    cmds.find((x) => x.label === "Gallery")?.run();
    cmds.find((x) => x.label === "Night City")?.run();
    cmds.find((x) => x.label === "Theme: Dracula")?.run();
    expect(calls).toEqual([
      "nav:/gallery",
      "nav:/jobs/j%202%2Fa%3Fb%23c",
      "theme:dracula",
    ]);
  });
  test("quick create is for prompts, not searches, and appears after all other groups", () => {
    const made: string[] = [];
    const qc = (k: string, p: string) => made.push(`${k}:${p}`);

    // 'sett' -> no quick-create entries, first option is the Settings page
    const settCmds = filterCommands(
      buildCommands(ctx({ query: "sett", quickCreate: qc }).c),
      "sett",
    );
    expect(settCmds.some((x) => x.group === "Create")).toBe(false);
    expect(settCmds[0]?.label).toBe("Settings");

    // 'settings page' (2 words, 13 characters) -> none
    const twoWords = filterCommands(
      buildCommands(ctx({ query: "settings page", quickCreate: qc }).c),
      "settings page",
    );
    expect(twoWords.some((x) => x.group === "Create")).toBe(false);

    // 'a fox in snow' -> the three entries, after all other matches
    const foxCmds = filterCommands(
      buildCommands(ctx({ query: "a fox in snow", quickCreate: qc }).c),
      "a fox in snow",
    );
    expect(foxCmds.map((x) => x.label)).toEqual([
      "Generate image: “a fox in snow”",
      "Generate video: “a fox in snow”",
      "Generate audio: “a fox in snow”",
    ]);
    foxCmds[0].run();
    expect(made).toEqual(["image:a fox in snow"]);

    // Query that also matches a page, e.g. 'image of a fox' -> page comes first, Create entries after
    const imageFoxCmds = filterCommands(
      buildCommands(
        ctx({
          query: "image of a fox",
          routes: [
            ...ROUTES,
            {
              path: "/create/image",
              title: "Image of a fox",
              group: "create",
              sidebarId: "sidebar-image",
              icon: "Image",
            },
          ],
          quickCreate: qc,
        }).c,
      ),
      "image of a fox",
    );
    expect(imageFoxCmds[0]?.group).toBe("Go to");
    expect(imageFoxCmds.slice(-3).map((x) => x.label)).toEqual([
      "Generate image: “image of a fox”",
      "Generate video: “image of a fox”",
      "Generate audio: “image of a fox”",
    ]);

    // 16-character single word -> offered
    const longSingle = "abcdefghijklmnop";
    expect(longSingle.length).toBe(16);
    const singleWordCmds = filterCommands(
      buildCommands(ctx({ query: longSingle, quickCreate: qc }).c),
      longSingle,
    );
    expect(singleWordCmds.filter((x) => x.group === "Create").length).toBe(3);

    // whitespace-only -> none
    const wsCmds = filterCommands(
      buildCommands(ctx({ query: "     \t\n   ", quickCreate: qc }).c),
      "     \t\n   ",
    );
    expect(wsCmds.some((x) => x.group === "Create")).toBe(false);
  });
  test("no quick create for short queries or when the context cannot create", () => {
    expect(
      buildCommands(ctx({ query: "ab", quickCreate: () => {} }).c).some(
        (x) => x.group === "Create",
      ),
    ).toBe(false);
    expect(
      buildCommands(ctx({ query: "a fox in snow" }).c).some(
        (x) => x.group === "Create",
      ),
    ).toBe(false);
  });
  test("job results are capped at six", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: `j${i}`,
      name: `Job ${i}`,
    }));
    const cmds = filterCommands(buildCommands(ctx({ jobs: many }).c), "job");
    expect(cmds.filter((x) => x.group === "Jobs").length).toBe(6);
  });
  test("quick-create label truncates query over 80 characters with ellipsis while passing full text capped at 4000 characters", () => {
    const made: { kind: string; prompt: string }[] = [];
    const qc = (k: string, p: string) => made.push({ kind: k, prompt: p });

    const exact80 = "a".repeat(80);
    const cmds80 = buildCommands(
      ctx({ query: exact80, quickCreate: qc }).c,
    ).filter((x) => x.group === "Create");
    expect(cmds80[0]?.label).toBe(`Generate image: “${exact80}”`);

    const over80 = `${"a".repeat(80)}bcdef`;
    const cmdsOver80 = buildCommands(
      ctx({ query: over80, quickCreate: qc }).c,
    ).filter((x) => x.group === "Create");
    expect(cmdsOver80[0]?.label).toBe(`Generate image: “${"a".repeat(80)}…”`);
    cmdsOver80[0]?.run();
    expect(made[0]).toEqual({ kind: "image", prompt: over80 });

    const over4000 = "x".repeat(4500);
    const cmdsOver4000 = buildCommands(
      ctx({ query: over4000, quickCreate: qc }).c,
    ).filter((x) => x.group === "Create");
    expect(cmdsOver4000[0]?.label).toBe(`Generate image: “${"x".repeat(80)}…”`);
    cmdsOver4000[0]?.run();
    expect(made[1]?.prompt.length).toBe(4000);
  });
});
