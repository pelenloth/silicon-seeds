import { createSignal, For, Show } from "solid-js";
import { Icons } from "../components/Icons";
import AppearanceSection from "../components/settings/AppearanceSection";

type SettingsMap = Record<string, string>;
type Preset = {
  id: string;
  name: string;
  description: string | null;
  primary_style: string;
  secondary_trigger: string | null;
  styles: string[];
  texture: string | null;
};
type LoraRow = {
  id: string;
  comfyui_name: string;
  display_name: string;
  trigger_word: string | null;
  is_active: number;
  sort_order: number;
};

export default function Settings() {
  const [settings, setSettings] = createSignal<SettingsMap>({});
  const [presets, setPresets] = createSignal<Preset[]>([]);
  const [loras, setLoras] = createSignal<LoraRow[]>([]);
  const [discovered, setDiscovered] = createSignal<string[]>([]);
  const [msg, setMsg] = createSignal<string | null>(null);
  const [err, setErr] = createSignal<string | null>(null);

  const [editPreset, setEditPreset] = createSignal<Preset | null>(null);
  const [newPresetForm, setNewPresetForm] = createSignal(false);
  const [presetForm, setPresetForm] = createSignal({
    name: "",
    description: "",
    primary_style: "",
    secondary_trigger: "",
    styles: "",
    texture: "",
  });

  async function fetchAll() {
    try {
      const s = await fetch("/api/settings").then((r) => r.json());
      setSettings(s);
      const p = await fetch("/api/style-presets").then((r) => r.json());
      setPresets(p.presets ?? []);
      const l = await fetch("/api/loras").then((r) => r.json());
      setLoras(l.loras ?? []);
    } catch (e) {
      setErr(String(e));
    }
  }
  fetchAll();

  const saveSettings = async (e: Event) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const fd = new FormData(form);
    const entries: Record<string, string> = {};
    for (const [k, v] of fd.entries()) entries[k] = String(v);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entries),
    });
    if (!res.ok) setErr(await res.text());
    else {
      setMsg("Settings saved");
      setTimeout(() => setMsg(null), 1800);
      fetchAll();
    }
  };

  const createPreset = async () => {
    const f = presetForm();
    const stylesArr = f.styles
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const body = {
      name: f.name,
      description: f.description || null,
      primary_style: f.primary_style || f.name,
      secondary_trigger: f.secondary_trigger || null,
      styles: stylesArr,
      texture: f.texture || null,
    };
    const res = await fetch("/api/style-presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) setErr(await res.text());
    else {
      setNewPresetForm(false);
      setPresetForm({
        name: "",
        description: "",
        primary_style: "",
        secondary_trigger: "",
        styles: "",
        texture: "",
      });
      fetchAll();
    }
  };

  const updatePreset = async () => {
    const p = editPreset();
    if (!p) return;
    const f = presetForm();
    const stylesArr = f.styles
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const body: any = {};
    if (f.name) body.name = f.name;
    if (f.description !== undefined) body.description = f.description || null;
    if (f.primary_style) body.primary_style = f.primary_style;
    if (f.secondary_trigger !== undefined)
      body.secondary_trigger = f.secondary_trigger || null;
    if (stylesArr.length) body.styles = stylesArr;
    if (f.texture !== undefined) body.texture = f.texture || null;
    const res = await fetch(`/api/style-presets/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) setErr(await res.text());
    else {
      setEditPreset(null);
      fetchAll();
    }
  };

  const deletePreset = async (id: string) => {
    if (!confirm("Delete preset?")) return;
    await fetch(`/api/style-presets/${id}`, { method: "DELETE" });
    fetchAll();
  };

  const syncLoras = async () => {
    setErr(null);
    const res = await fetch("/api/comfyui/loras");
    if (!res.ok) {
      setErr("ComfyUI unreachable: " + (await res.text()).slice(0, 200));
      return;
    }
    const data = await res.json();
    setDiscovered(data.loras ?? []);
    if ((data.loras ?? []).length === 0) setMsg("No loras found on ComfyUI");
    else setMsg(`Found ${(data.loras ?? []).length} loras on ComfyUI`);
    setTimeout(() => setMsg(null), 1800);
  };
  const addDiscovered = async (name: string) => {
    const res = await fetch("/api/loras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comfyui_name: name,
        display_name: name.replace(/\.safetensors$/i, ""),
      }),
    });
    if (!res.ok) setErr(await res.text());
    else {
      setDiscovered((d) => d.filter((x) => x !== name));
      fetchAll();
    }
  };
  const toggleLora = async (row: LoraRow) => {
    await fetch(`/api/loras/${row.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: row.is_active ? 0 : 1 }),
    });
    fetchAll();
  };
  const deleteLora = async (id: string) => {
    if (!confirm("Delete lora?")) return;
    await fetch(`/api/loras/${id}`, { method: "DELETE" });
    fetchAll();
  };
  const moveLora = async (idx: number, dir: number) => {
    const list = [...loras()];
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    setLoras(list);
    const ids = list.map((r) => r.id);
    await fetch("/api/loras/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    fetchAll();
  };
  const dragStart = (e: DragEvent, idx: number) => {
    e.dataTransfer?.setData("text/plain", String(idx));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  };
  const drop = async (e: DragEvent, idx: number) => {
    e.preventDefault();
    const from = parseInt(e.dataTransfer?.getData("text/plain") ?? "", 10);
    if (isNaN(from)) return;
    const list = [...loras()];
    const [moved] = list.splice(from, 1);
    list.splice(idx, 0, moved);
    setLoras(list);
    await fetch("/api/loras/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: list.map((r) => r.id) }),
    });
    fetchAll();
  };

  const openNew = () => {
    setPresetForm({
      name: "",
      description: "",
      primary_style: "",
      secondary_trigger: "",
      styles: "",
      texture: "",
    });
    setNewPresetForm(true);
  };
  const openEdit = (p: Preset) => {
    setEditPreset(p);
    setPresetForm({
      name: p.name,
      description: p.description ?? "",
      primary_style: p.primary_style,
      secondary_trigger: p.secondary_trigger ?? "",
      styles: p.styles.join("\n"),
      texture: p.texture ?? "",
    });
  };

  return (
    <div class="flex flex-col gap-5 p-4 sm:p-6 bg-base-200 min-h-[calc(100vh-4rem)] w-full max-w-none">
      <AppearanceSection />
      <Show when={msg()}>
        <div class="alert alert-success text-sm py-2 shadow-sm">
          <Icons.StatusCompleteSmall /> <span>{msg()}</span>
          <button
            class="btn btn-xs btn-ghost ml-auto"
            onClick={() => setMsg(null)}
          >
            ✕
          </button>
        </div>
      </Show>
      <Show when={err()}>
        <div class="alert alert-error text-sm py-2 shadow-sm">
          <span>{err()}</span>
          <button
            class="btn btn-xs btn-ghost ml-auto"
            onClick={() => setErr(null)}
          >
            ✕
          </button>
        </div>
      </Show>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div class="flex flex-col gap-6">
          <div class="card bg-base-100 shadow-xl border border-base-300">
            <div class="card-body p-5 sm:p-6">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <h2 class="card-title text-base">
                    Defaults{" "}
                    <span class="badge badge-ghost badge-sm font-normal">
                      prefills new jobs
                    </span>
                  </h2>
                  <p class="text-xs opacity-60 mt-1">
                    Applied to Compose · Image · Video forms when creating a new
                    job.
                  </p>
                </div>
                <div class="badge badge-outline badge-sm hidden sm:inline-flex">
                  7 keys
                </div>
              </div>
              <div class="divider my-3" />
              <form onSubmit={saveSettings} class="flex flex-col gap-4">
                <fieldset class="fieldset bg-base-200/40 rounded-box p-4 border border-base-300">
                  <legend class="fieldset-legend text-xs font-semibold px-2">
                    Generation defaults
                  </legend>
                  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <label class="fieldset-label flex-col items-start gap-1">
                      <span class="label-text text-xs font-medium opacity-70">
                        Default Style Preset
                      </span>
                      <select
                        name="default_style_preset"
                        class="select select-bordered select-sm w-full"
                      >
                        <option
                          value="none"
                          selected={
                            settings()["default_style_preset"] === "none"
                          }
                        >
                          none - no style
                        </option>
                        <For each={presets()}>
                          {(p) => (
                            <option
                              value={p.name}
                              selected={
                                settings()["default_style_preset"] === p.name
                              }
                            >
                              {p.name}
                              {p.primary_style !== p.name
                                ? ` · ${p.primary_style}`
                                : ""}
                            </option>
                          )}
                        </For>
                        <Show when={presets().length === 0}>
                          <option value="system">system</option>
                        </Show>
                      </select>
                      <span class="label-text-alt text-[11px] opacity-50">
                        Shown first in creation forms
                      </span>
                    </label>
                    <label class="fieldset-label flex-col items-start gap-1">
                      <span class="label-text text-xs font-medium opacity-70">
                        FPS
                      </span>
                      <input
                        name="default_fps"
                        type="number"
                        min="1"
                        max="24"
                        class="input input-bordered input-sm w-full"
                        value={settings()["default_fps"] ?? "16"}
                      />
                    </label>
                    <label class="fieldset-label flex-col items-start gap-1">
                      <span class="label-text text-xs font-medium opacity-70">
                        Clip Duration (s)
                      </span>
                      <input
                        name="default_clip_duration"
                        type="number"
                        min="1"
                        max="10"
                        class="input input-bordered input-sm w-full"
                        value={settings()["default_clip_duration"] ?? "5"}
                      />
                    </label>
                    <label class="fieldset-label flex-col items-start gap-1">
                      <span class="label-text text-xs font-medium opacity-70">
                        Transition Duration (s)
                      </span>
                      <input
                        name="default_transition_duration"
                        type="number"
                        min="1"
                        max="10"
                        class="input input-bordered input-sm w-full"
                        value={settings()["default_transition_duration"] ?? "2"}
                      />
                    </label>
                    <label class="fieldset-label flex-col items-start gap-1">
                      <span class="label-text text-xs font-medium opacity-70">
                        Resolution
                      </span>
                      <select
                        name="default_resolution"
                        class="select select-bordered select-sm w-full"
                        value={settings()["default_resolution"] ?? "720p"}
                      >
                        <option value="480p">480p</option>
                        <option value="720p">720p</option>
                        <option value="1080p">1080p</option>
                        <option value="9_16_SD">9:16 SD</option>
                        <option value="9_16_HD">9:16 HD</option>
                      </select>
                    </label>
                    <label class="fieldset-label flex-col items-start gap-1">
                      <span class="label-text text-xs font-medium opacity-70">
                        Image Model
                      </span>
                      <select
                        name="default_image_model"
                        class="select select-bordered select-sm w-full"
                        value={
                          settings()["default_image_model"] ?? "z-image-turbo"
                        }
                      >
                        <option value="z-image-turbo">z-image-turbo</option>
                      </select>
                    </label>
                    <label class="fieldset-label flex-col items-start gap-1">
                      <span class="label-text text-xs font-medium opacity-70">
                        Video Model
                      </span>
                      <select
                        name="default_video_model"
                        class="select select-bordered select-sm w-full"
                        value={settings()["default_video_model"] ?? "wan2.2"}
                      >
                        <option value="wan2.2">Wan 2.2</option>
                        <option value="ltx2.3">LTX 2.3</option>
                      </select>
                    </label>
                  </div>
                </fieldset>
                <div class="card-actions justify-end">
                  <button type="submit" class="btn btn-primary btn-sm gap-2">
                    Save Defaults
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div class="card bg-base-100 shadow-xl border border-base-300">
            <div class="card-body p-5 sm:p-6">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 class="card-title text-base">
                    LoRAs{" "}
                    <span class="badge badge-ghost badge-sm">
                      {loras().length} saved
                    </span>{" "}
                    <span class="badge badge-success badge-sm badge-soft">
                      {loras().filter((l) => l.is_active).length} active
                    </span>
                  </h2>
                  <p class="text-xs opacity-60 mt-1">
                    Saved from ComfyUI · drag to reorder · order matters for
                    stacking · toggle active to hide from creation views
                  </p>
                </div>
                <button
                  class="btn btn-sm btn-outline gap-2"
                  onClick={syncLoras}
                >
                  <span class="text-xs">↻</span> Sync from ComfyUI
                </button>
              </div>
              <Show when={discovered().length}>
                <div class="mt-3 p-3 bg-base-200 rounded-box border border-base-300 border-dashed">
                  <div class="text-xs font-medium opacity-70 mb-2">
                    Discovered on ComfyUI ({discovered().length}) - click to
                    save
                  </div>
                  <div class="flex flex-wrap gap-1.5">
                    <For each={discovered()}>
                      {(name) => (
                        <button
                          class="btn btn-xs btn-outline btn-primary gap-1"
                          onClick={() => addDiscovered(name)}
                        >
                          ＋ <span class="font-mono text-[11px]">{name}</span>
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
              <div class="divider my-3" />
              <div class="flex flex-col gap-1.5">
                <For each={loras()}>
                  {(row, idx) => (
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => drop(e, idx())}
                      class="group flex items-center gap-2 p-2.5 bg-base-200 rounded-box border border-base-300 hover:border-primary/30 hover:bg-base-200 transition-colors"
                    >
                      <span
                        draggable
                        onDragStart={(e) => dragStart(e, idx())}
                        class="drag-handle opacity-40 group-hover:opacity-70 cursor-grab active:cursor-grabbing text-base-content/60 select-none px-1"
                      >
                        ≡
                      </span>
                      <div class="flex-1 min-w-0">
                        <div class="font-mono text-xs font-medium truncate">
                          {row.comfyui_name}
                        </div>
                        <div class="text-[11px] opacity-60 truncate">
                          {row.display_name}{" "}
                          <Show when={row.trigger_word}>
                            <span class="badge badge-ghost badge-xs ml-1">
                              {row.trigger_word}
                            </span>
                          </Show>
                        </div>
                      </div>
                      <div class="flex items-center gap-1">
                        <button
                          class={
                            "btn btn-xs " +
                            (row.is_active
                              ? "btn-success btn-soft"
                              : "btn-ghost border border-base-300")
                          }
                          onClick={() => toggleLora(row)}
                        >
                          {row.is_active ? "active" : "hidden"}
                        </button>
                        <div class="join">
                          <button
                            class="btn btn-xs join-item"
                            onClick={() => moveLora(idx(), -1)}
                          >
                            ↑
                          </button>
                          <button
                            class="btn btn-xs join-item"
                            onClick={() => moveLora(idx(), 1)}
                          >
                            ↓
                          </button>
                        </div>
                        <button
                          class="btn btn-xs btn-error btn-soft"
                          onClick={() => deleteLora(row.id)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )}
                </For>
                <Show when={loras().length === 0}>
                  <div class="text-sm opacity-60 py-6 text-center border border-dashed border-base-300 rounded-box">
                    No loras in DB. Sync from ComfyUI.
                  </div>
                </Show>
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-6">
          <div class="card bg-base-100 shadow-xl border border-base-300">
            <div class="card-body p-5 sm:p-6">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 class="card-title text-base">
                    Style Presets{" "}
                    <span class="badge badge-primary badge-sm font-normal">
                      {presets().length}
                    </span>
                  </h2>
                  <p class="text-xs opacity-60 mt-1">
                    Curated from mflux-forge · primary_style + trigger + styles
                    + texture
                  </p>
                </div>
                <button class="btn btn-primary btn-sm gap-1" onClick={openNew}>
                  ＋ New preset
                </button>
              </div>
              <div class="divider my-3" />
              <div class="overflow-x-auto rounded-box border border-base-300">
                <table class="table table-sm table-zebra table-pin-rows">
                  <thead>
                    <tr class="bg-base-200/60">
                      <th class="text-xs">Name</th>
                      <th class="text-xs">Primary</th>
                      <th class="text-xs">Trigger</th>
                      <th class="text-xs">Styles</th>
                      <th class="text-xs">Texture</th>
                      <th class="text-xs text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={presets()}>
                      {(p) => (
                        <tr class="hover">
                          <td>
                            <span class="font-mono text-xs font-medium">
                              {p.name}
                            </span>
                            <Show when={p.description}>
                              <div class="text-[11px] opacity-50 truncate max-w-[220px]">
                                {p.description}
                              </div>
                            </Show>
                          </td>
                          <td>
                            <span class="badge badge-ghost badge-sm text-xs">
                              {p.primary_style}
                            </span>
                          </td>
                          <td>
                            <Show
                              when={p.secondary_trigger}
                              fallback={
                                <span class="opacity-30 text-xs">-</span>
                              }
                            >
                              <span class="badge badge-outline badge-sm max-w-[160px] truncate">
                                {p.secondary_trigger}
                              </span>
                            </Show>
                          </td>
                          <td>
                            <span class="badge badge-soft badge-sm">
                              {p.styles.length} styles
                            </span>
                          </td>
                          <td>
                            <Show
                              when={p.texture}
                              fallback={
                                <span class="opacity-30 text-xs">-</span>
                              }
                            >
                              <span class="tooltip" data-tip={p.texture}>
                                <span class="badge badge-ghost badge-sm max-w-[160px] truncate">
                                  {p.texture!.slice(0, 28)}
                                </span>
                              </span>
                            </Show>
                          </td>
                          <td>
                            <div class="flex gap-1 justify-end">
                              <button
                                class="btn btn-xs btn-ghost border border-base-300"
                                onClick={() => openEdit(p)}
                              >
                                Edit
                              </button>
                              <button
                                class="btn btn-xs btn-error btn-soft"
                                onClick={() => deletePreset(p.id)}
                              >
                                Del
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
                <Show when={presets().length === 0}>
                  <div class="p-8 text-center text-sm opacity-60">
                    No presets yet. Create one.
                  </div>
                </Show>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Show when={newPresetForm() || editPreset()}>
        <dialog class="modal modal-open">
          <div class="modal-box max-w-2xl bg-base-100">
            <h3 class="font-bold text-base flex items-center gap-2">
              {editPreset() ? "Edit preset" : "New preset"}{" "}
              <span class="badge badge-ghost badge-sm font-normal">
                {editPreset() ? editPreset()!.name : "draft"}
              </span>
            </h3>
            <p class="text-xs opacity-60 mt-1">
              Styles are one per line. Texture is optional prompt suffix.
            </p>
            <div class="grid gap-3 mt-4">
              <fieldset class="fieldset">
                <label class="fieldset-label text-xs">Name *</label>
                <input
                  class="input input-bordered input-sm w-full"
                  placeholder="e.g. anime"
                  value={presetForm().name}
                  onInput={(e) =>
                    setPresetForm({
                      ...presetForm(),
                      name: e.currentTarget.value,
                    })
                  }
                />
              </fieldset>
              <fieldset class="fieldset">
                <label class="fieldset-label text-xs">Description</label>
                <input
                  class="input input-bordered input-sm w-full"
                  placeholder="Short description"
                  value={presetForm().description}
                  onInput={(e) =>
                    setPresetForm({
                      ...presetForm(),
                      description: e.currentTarget.value,
                    })
                  }
                />
              </fieldset>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <fieldset class="fieldset">
                  <label class="fieldset-label text-xs">Primary style *</label>
                  <input
                    class="input input-bordered input-sm w-full"
                    placeholder="watercolor"
                    value={presetForm().primary_style}
                    onInput={(e) =>
                      setPresetForm({
                        ...presetForm(),
                        primary_style: e.currentTarget.value,
                      })
                    }
                  />
                </fieldset>
                <fieldset class="fieldset">
                  <label class="fieldset-label text-xs">
                    Secondary trigger
                  </label>
                  <input
                    class="input input-bordered input-sm w-full"
                    placeholder="Anime-Z"
                    value={presetForm().secondary_trigger}
                    onInput={(e) =>
                      setPresetForm({
                        ...presetForm(),
                        secondary_trigger: e.currentTarget.value,
                      })
                    }
                  />
                </fieldset>
              </div>
              <fieldset class="fieldset">
                <label class="fieldset-label text-xs">Texture</label>
                <input
                  class="input input-bordered input-sm w-full"
                  placeholder="thick impasto brushstrokes..."
                  value={presetForm().texture}
                  onInput={(e) =>
                    setPresetForm({
                      ...presetForm(),
                      texture: e.currentTarget.value,
                    })
                  }
                />
              </fieldset>
              <fieldset class="fieldset">
                <label class="fieldset-label text-xs">
                  Styles (one per line)
                </label>
                <textarea
                  class="textarea textarea-bordered w-full h-28 text-sm leading-5"
                  placeholder={
                    "anime style, vibrant colors...\nstudio ghibli inspired...\n"
                  }
                  value={presetForm().styles}
                  onInput={(e) =>
                    setPresetForm({
                      ...presetForm(),
                      styles: e.currentTarget.value,
                    })
                  }
                />
                <span class="label-text-alt text-[11px] opacity-50">
                  {
                    presetForm()
                      .styles.split("\n")
                      .filter((s) => s.trim()).length
                  }{" "}
                  styles
                </span>
              </fieldset>
            </div>
            <div class="modal-action">
              <button
                class="btn btn-ghost btn-sm"
                onClick={() => {
                  setNewPresetForm(false);
                  setEditPreset(null);
                }}
              >
                Cancel
              </button>
              <button
                class="btn btn-primary btn-sm"
                onClick={() => (editPreset() ? updatePreset() : createPreset())}
              >
                {editPreset() ? "Update" : "Create"}
              </button>
            </div>
          </div>
          <form method="dialog" class="modal-backdrop">
            <button
              onClick={() => {
                setNewPresetForm(false);
                setEditPreset(null);
              }}
            >
              close
            </button>
          </form>
        </dialog>
      </Show>
    </div>
  );
}
