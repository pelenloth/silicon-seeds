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
  test("without a query: every route, jobs and themes, no quick create", () => {
    const { c } = ctx();
    const cmds = filterCommands(buildCommands(c), "");
    expect(cmds.filter((x) => x.group === "Go to").length).toBe(ROUTES.length);
    expect(cmds.filter((x) => x.group === "Jobs").map((x) => x.label)).toEqual([
      "Desert Dunes",
      "Night City",
    ]);
    expect(cmds.filter((x) => x.group === "Theme").map((x) => x.label)).toEqual(
      ["Theme: System", "Theme: Dracula"],
    );
    expect(cmds.some((x) => x.group === "Create")).toBe(false);
  });
  test("filtering matches every token, case-insensitively", () => {
    const { c } = ctx({ query: "text vid" });
    const cmds = filterCommands(buildCommands(c), "text vid");
    expect(cmds.map((x) => x.label)).toEqual(["Text to Video"]);
    expect(
      filterCommands(buildCommands(ctx().c), "DESERT").map((x) => x.label),
    ).toEqual(["Desert Dunes"]);
  });
  test("commands run through the context", () => {
    const { c, calls } = ctx();
    const cmds = buildCommands(c);
    cmds.find((x) => x.label === "Gallery")?.run();
    cmds.find((x) => x.label === "Night City")?.run();
    cmds.find((x) => x.label === "Theme: Dracula")?.run();
    expect(calls).toEqual(["nav:/gallery", "nav:/jobs/j2", "theme:dracula"]);
  });
  test("quick create appears first for a typed prompt and survives filtering", () => {
    const made: string[] = [];
    const { c } = ctx({
      query: "a fox in snow",
      quickCreate: (k, p) => made.push(`${k}:${p}`),
    });
    const cmds = filterCommands(buildCommands(c), "a fox in snow");
    expect(cmds.slice(0, 3).map((x) => x.label)).toEqual([
      "Generate image: “a fox in snow”",
      "Generate video: “a fox in snow”",
      "Generate audio: “a fox in snow”",
    ]);
    cmds[0].run();
    expect(made).toEqual(["image:a fox in snow"]);
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
});
