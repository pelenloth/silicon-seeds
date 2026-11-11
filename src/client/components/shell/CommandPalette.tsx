import { useNavigate } from "@solidjs/router";
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import {
  buildCommands,
  filterCommands,
  type Command,
  type CommandGroup,
} from "../../lib/palette";
import { ROUTES } from "../../lib/routes";
import { THEMES, type ThemePref } from "../../lib/themes";
import { jobs } from "../../stores/jobs";
import { registerOverlay, unregisterOverlay } from "../../stores/overlays";
import { paletteOpen, setPaletteOpen } from "../../stores/shell";
import { setThemePref } from "../../stores/theme";
import { Icons } from "../Icons";
import { ToastRegion } from "../ui/Toaster";

const GROUP_ORDER: readonly CommandGroup[] = [
  "Create",
  "Go to",
  "Jobs",
  "Theme",
];

const THEME_OPTIONS = [{ id: "system", label: "System" }, ...THEMES] as const;

export function CommandPalette() {
  const navigate = useNavigate();
  const [query, setQuery] = createSignal("");
  const [active, setActive] = createSignal(0);
  let dialogRef!: HTMLDialogElement;
  let inputRef!: HTMLInputElement;
  let listRef!: HTMLUListElement;
  let closingProgrammatically = false;
  const [overlayId, setOverlayId] = createSignal<number | null>(null);

  const releaseOverlay = () => {
    const id = overlayId();
    if (id !== null) {
      unregisterOverlay(id);
      setOverlayId(null);
    }
  };

  onCleanup(() => {
    releaseOverlay();
  });

  const commands = (): Command[] =>
    filterCommands(
      buildCommands({
        query: query(),
        routes: ROUTES,
        jobs: jobs(),
        themes: THEME_OPTIONS,
        navigate: (p) => navigate(p),
        setTheme: (id) => setThemePref(id as ThemePref),
      }),
      query(),
    );

  const grouped = () => {
    const all = commands();
    const out: {
      group: CommandGroup;
      items: { cmd: Command; index: number }[];
    }[] = [];
    for (const g of GROUP_ORDER) {
      const items: { cmd: Command; index: number }[] = [];
      all.forEach((cmd, idx) => {
        if (cmd.group === g) {
          items.push({ cmd, index: idx });
        }
      });
      if (items.length > 0) {
        out.push({ group: g, items });
      }
    }
    return out;
  };

  const activeId = () => {
    const len = commands().length;
    if (len === 0) return undefined;
    const idx = Math.min(active(), len - 1);
    return `cmd-${idx}`;
  };

  const scrollActiveIntoView = (idx: number) => {
    const el = listRef?.querySelector(`#cmd-${idx}`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  };

  createEffect(() => {
    if (!dialogRef) return;
    if (paletteOpen()) {
      if (overlayId() === null) {
        setOverlayId(registerOverlay());
      }
      if (!dialogRef.open) {
        dialogRef.showModal();
      }
      setActive(0);
      queueMicrotask(() => inputRef?.focus());
    } else {
      releaseOverlay();
      setQuery("");
      setActive(0);
      if (dialogRef.open) {
        closingProgrammatically = true;
        dialogRef.close();
      }
    }
  });

  const runCommand = (cmd: Command | undefined) => {
    if (!cmd) return;
    cmd.run();
    setPaletteOpen(false);
  };

  const onKey = (e: KeyboardEvent) => {
    const list = commands();
    const len = list.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (len === 0) return;
      const next = (active() + 1) % len;
      setActive(next);
      scrollActiveIntoView(next);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (len === 0) return;
      const next = (active() - 1 + len) % len;
      setActive(next);
      scrollActiveIntoView(next);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (len === 0) return;
      const idx = Math.min(active(), len - 1);
      runCommand(list[idx]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setPaletteOpen(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      class="modal items-start"
      aria-label="Command palette"
      onClose={() => {
        releaseOverlay();
        if (closingProgrammatically) {
          closingProgrammatically = false;
          return;
        }
        setPaletteOpen(false);
      }}
    >
      <div class="modal-box mx-auto mt-[10vh] w-[calc(100%-1rem)] max-w-xl p-0">
        <label class="flex items-center gap-2 border-b border-base-300 px-4 py-3">
          <Icons.Search class="size-4 opacity-50" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={activeId()}
            aria-label="Command"
            class="w-full bg-transparent text-sm outline-none"
            placeholder="Type a command, a page, a job…"
            value={query()}
            onInput={(e) => {
              setQuery(e.currentTarget.value);
              setActive(0);
            }}
            onKeyDown={onKey}
          />
          <kbd class="kbd kbd-xs">Esc</kbd>
        </label>
        <ul
          ref={listRef}
          id="palette-list"
          role="listbox"
          class="max-h-[50vh] overflow-y-auto scroll-thin p-2"
        >
          <Show
            when={commands().length > 0}
            fallback={
              <li class="px-3 py-6 text-center text-sm text-base-content/50">
                No results
              </li>
            }
          >
            <For each={grouped()}>
              {(section) => (
                <>
                  <li role="presentation" class="section-label px-2 py-1">
                    {section.group}
                  </li>
                  <For each={section.items}>
                    {(entry) => (
                      <li
                        role="option"
                        id={`cmd-${entry.index}`}
                        aria-selected={entry.index === active()}
                        class="cursor-pointer rounded-field px-3 py-2 text-sm"
                        classList={{
                          "bg-base-200": entry.index === active(),
                        }}
                        onMouseEnter={() => setActive(entry.index)}
                        onClick={() => runCommand(entry.cmd)}
                      >
                        {entry.cmd.label}
                      </li>
                    )}
                  </For>
                </>
              )}
            </For>
          </Show>
        </ul>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button aria-label="Close">close</button>
      </form>
      <ToastRegion scope={overlayId()} />
    </dialog>
  );
}

export default CommandPalette;
