import { For, Show } from "solid-js";
import {
  resolveTheme,
  THEMES,
  type ThemeId,
  type ThemePref,
} from "../../lib/themes";
import { prefersDark, setThemePref, themePref } from "../../stores/theme";
import { Icons } from "../Icons";

export default function AppearanceSection() {
  const options = (): {
    id: ThemePref;
    label: string;
    previewTheme: ThemeId;
  }[] => [
    {
      id: "system",
      label: "System",
      previewTheme: resolveTheme("system", prefersDark()),
    },
    ...THEMES.map((t) => ({
      id: t.id,
      label: t.label,
      previewTheme: t.id,
    })),
  ];

  return (
    <section class="panel p-5 sm:p-6 flex flex-col gap-4">
      <div>
        <h2 class="text-base font-semibold">Appearance</h2>
      </div>
      <div
        role="radiogroup"
        aria-label="Theme"
        class="grid grid-cols-2 lg:grid-cols-5 gap-3"
      >
        <For each={options()}>
          {(opt) => (
            <label class="panel cursor-pointer overflow-hidden has-[:checked]:border-primary has-[:checked]:ring-1 has-[:checked]:ring-primary">
              <input
                type="radio"
                name="theme"
                value={opt.id}
                class="sr-only"
                checked={themePref() === opt.id}
                onChange={() => setThemePref(opt.id)}
              />
              <div
                data-theme={opt.previewTheme}
                class="flex h-16 items-end gap-1 bg-base-200 p-2"
              >
                <span class="h-6 flex-1 rounded bg-base-100 border border-base-300" />
                <span class="size-6 rounded bg-primary" />
                <span class="size-6 rounded bg-secondary" />
                <span class="size-6 rounded bg-accent" />
              </div>
              <div class="flex items-center justify-between px-3 py-2 text-sm font-medium">
                {opt.label}
                <Show when={themePref() === opt.id}>
                  <Icons.Check class="size-4 text-primary" />
                </Show>
              </div>
            </label>
          )}
        </For>
      </div>
    </section>
  );
}
