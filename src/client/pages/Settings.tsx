import { useSearchParams } from "@solidjs/router";
import { For, Match, onCleanup, Switch } from "solid-js";
import AppearanceSection from "../components/settings/AppearanceSection";
import DefaultsSection, {
  resetDefaultsDraftOnUnmount,
} from "../components/settings/DefaultsSection";
import LorasSection from "../components/settings/LorasSection";
import PresetsSection from "../components/settings/PresetsSection";
import { TabLink } from "../components/ui/TabLink";

const TABS = [
  { id: "appearance", label: "Appearance" },
  { id: "defaults", label: "Defaults" },
  { id: "loras", label: "LoRAs" },
  { id: "presets", label: "Style presets" },
] as const;

export default function Settings() {
  const [search] = useSearchParams();

  const tab = () => {
    const raw = Array.isArray(search.tab) ? search.tab[0] : search.tab;
    return TABS.some((t) => t.id === raw) ? (raw as string) : "appearance";
  };

  onCleanup(() => {
    resetDefaultsDraftOnUnmount();
  });

  return (
    <div class="page fade-in">
      <div class="mx-auto flex max-w-4xl flex-col gap-4">
        <nav class="tabs tabs-border" aria-label="Settings sections">
          <For each={TABS}>
            {(t) => (
              <TabLink href={`/settings?tab=${t.id}`} active={tab() === t.id}>
                {t.label}
              </TabLink>
            )}
          </For>
        </nav>
        <Switch>
          <Match when={tab() === "appearance"}>
            <AppearanceSection />
          </Match>
          <Match when={tab() === "defaults"}>
            <DefaultsSection />
          </Match>
          <Match when={tab() === "loras"}>
            <LorasSection />
          </Match>
          <Match when={tab() === "presets"}>
            <PresetsSection />
          </Match>
        </Switch>
      </div>
    </div>
  );
}
