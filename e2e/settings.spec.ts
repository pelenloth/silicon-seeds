import { expect, test, type Page } from "@playwright/test";
import { blockGeneration } from "./helpers/no-generation";

type SettingsTestState = {
  leakedMutations: { method: string; url: string }[];
  unexpectedDialogs: string[];
};

const testStateMap = new WeakMap<Page, SettingsTestState>();

function getTestState(page: Page): SettingsTestState {
  let state = testStateMap.get(page);
  if (!state) {
    state = { leakedMutations: [], unexpectedDialogs: [] };
    testStateMap.set(page, state);
  }
  return state;
}

test.beforeEach(async ({ page }) => {
  const state = getTestState(page);
  state.leakedMutations = [];
  state.unexpectedDialogs = [];

  await blockGeneration(page);

  page.on("dialog", (dialog) => {
    state.unexpectedDialogs.push(`${dialog.type()}: ${dialog.message()}`);
    void dialog.dismiss();
  });

  // Always mock ComfyUI LoRAs by default so tests never depend on local ComfyUI daemon
  await page.route("**/api/comfyui/loras", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ loras: [] }),
      });
      return;
    }
    await route.fallback();
  });

  // Catch-all guard: protect real database from any mutating request
  await page.route(
    (url) => /\/api\/(settings|loras|style-presets)(\/|$)/.test(url.pathname),
    async (route) => {
      const method = route.request().method().toUpperCase();
      if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        state.leakedMutations.push({
          method,
          url: route.request().url(),
        });
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: `Blocked unhandled mutating ${method} request to ${route.request().url()}`,
          }),
        });
        return;
      }
      await route.fallback();
    },
  );
});

test.afterEach(async ({ page }) => {
  const state = getTestState(page);
  expect(state.unexpectedDialogs).toEqual([]);
  expect(state.leakedMutations).toEqual([]);
});

test("settings: tabs navigation, active state, unknown tab fallback, and history navigation", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { level: 1, name: "Settings" }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.locator('a[href="/settings"]').first()).toBeVisible();

  const tabs = page.getByRole("navigation", { name: "Settings sections" });
  await expect(tabs).toBeVisible({ timeout: 10000 });
  for (const name of ["Appearance", "Defaults", "LoRAs", "Style presets"]) {
    await expect(tabs.getByRole("link", { name, exact: true })).toBeVisible();
  }

  // Appearance is the default active section
  await expect(
    tabs.getByRole("link", { name: "Appearance", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    tabs.getByRole("link", { name: "Defaults", exact: true }),
  ).not.toHaveAttribute("aria-current", "page");
  await expect(tabs.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(page.getByRole("radiogroup", { name: "Theme" })).toBeVisible();

  // Switching to Defaults activates the Defaults tab
  await tabs.getByRole("link", { name: "Defaults", exact: true }).click();
  await expect(page).toHaveURL(/tab=defaults/);
  await expect(
    tabs.getByRole("link", { name: "Defaults", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    tabs.getByRole("link", { name: "Appearance", exact: true }),
  ).not.toHaveAttribute("aria-current", "page");
  await expect(tabs.locator('[aria-current="page"]')).toHaveCount(1);

  // Switching to LoRAs then browser Back returns to Defaults
  await tabs.getByRole("link", { name: "LoRAs", exact: true }).click();
  await expect(page).toHaveURL(/tab=loras/);
  await expect(
    tabs.getByRole("link", { name: "LoRAs", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  await page.goBack();
  await expect(page).toHaveURL(/tab=defaults/);
  await expect(
    tabs.getByRole("link", { name: "Defaults", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(tabs.locator('[aria-current="page"]')).toHaveCount(1);

  // Unknown tab parameter falls back to Appearance
  await page.goto("/settings?tab=zzz");
  await expect(page.getByRole("radiogroup", { name: "Theme" })).toBeVisible();
  await expect(
    tabs.getByRole("link", { name: "Appearance", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(tabs.locator('[aria-current="page"]')).toHaveCount(1);
});

test("settings: defaults form controls, dirty tracking, save persistence, and prefill in create image", async ({
  page,
}) => {
  let currentSettings: Record<string, string> = {
    default_style_preset: "none",
    default_resolution: "720p",
    default_image_model: "z-image-turbo",
    default_video_model: "wan2.2",
    default_fps: "16",
    default_clip_duration: "5",
    default_transition_duration: "2",
  };

  let savedBody: Record<string, string> | null = null;

  await page.route("**/api/settings", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(currentSettings),
      });
      return;
    }
    if (route.request().method() === "PUT") {
      const body = (route.request().postDataJSON() ??
        JSON.parse(route.request().postData() ?? "{}")) as Record<
        string,
        string
      >;
      const expectedKeys = [
        "default_style_preset",
        "default_resolution",
        "default_image_model",
        "default_video_model",
        "default_fps",
        "default_clip_duration",
        "default_transition_duration",
      ];
      for (const key of expectedKeys) {
        expect(typeof body[key]).toBe("string");
      }
      savedBody = body;
      currentSettings = { ...currentSettings, ...body };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(currentSettings),
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/settings?tab=defaults");
  await expect(
    page.getByRole("heading", { level: 1, name: "Settings" }),
  ).toBeVisible({ timeout: 10000 });

  for (const name of [
    "default_style_preset",
    "default_resolution",
    "default_image_model",
    "default_video_model",
  ]) {
    await expect(page.locator(`select[name="${name}"]`)).toBeVisible();
  }
  for (const name of [
    "default_fps",
    "default_clip_duration",
    "default_transition_duration",
  ]) {
    await expect(page.locator(`input[name="${name}"]`)).toBeVisible();
  }

  const res = page.locator('select[name="default_resolution"]');
  const original = await res.inputValue();
  const nextResolution = original === "480p" ? "720p" : "480p";

  await res.selectOption(nextResolution);
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await res.selectOption(original);
  await expect(page.getByText("Unsaved changes")).toHaveCount(0);

  // Change to new resolution and save
  await res.selectOption(nextResolution);
  await expect(page.getByText("Unsaved changes")).toBeVisible();

  await page.getByRole("button", { name: /Save Defaults/i }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Defaults saved" }),
  ).toBeVisible();
  await expect(page.getByText("Unsaved changes")).toHaveCount(0);

  expect(savedBody).not.toBeNull();
  expect(savedBody!.default_resolution).toBe(nextResolution);

  // Opening /create/image shows the saved value prefilled
  await page.goto("/create/image");
  await expect(
    page.getByRole("heading", { level: 1, name: "Image" }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.locator('select[name="resolution"]')).toHaveValue(
    nextResolution,
  );
});

test("settings: defaults save error shows toast and retains unsaved changes", async ({
  page,
}) => {
  const settingsData: Record<string, string> = {
    default_style_preset: "none",
    default_resolution: "720p",
    default_image_model: "z-image-turbo",
    default_video_model: "wan2.2",
    default_fps: "16",
    default_clip_duration: "5",
    default_transition_duration: "2",
  };

  await page.route("**/api/settings", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(settingsData),
      });
      return;
    }
    if (route.request().method() === "PUT") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Failed to persist defaults" }),
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/settings?tab=defaults");
  const res = page.locator('select[name="default_resolution"]');
  await expect(res).toBeVisible({ timeout: 10000 });
  const original = await res.inputValue();
  await res.selectOption(original === "480p" ? "720p" : "480p");
  await expect(page.getByText("Unsaved changes")).toBeVisible();

  await page.getByRole("button", { name: /Save Defaults/i }).click();

  await expect(
    page.getByRole("status").filter({ hasText: /failed|error/i }),
  ).toBeVisible();
  await expect(page.getByText("Unsaved changes")).toBeVisible();
});

test("settings: loras list display, toggle active, reorder with rollback on failure, and delete with confirm", async ({
  page,
}) => {
  let lorasList = [
    {
      id: "lora-1",
      comfyui_name: "detail_enhancer.safetensors",
      display_name: "Detail Enhancer",
      trigger_word: "detail",
      is_active: 1,
      sort_order: 0,
    },
    {
      id: "lora-2",
      comfyui_name: "film_grain.safetensors",
      display_name: "Film Grain",
      trigger_word: null,
      is_active: 0,
      sort_order: 1,
    },
    {
      id: "lora-3",
      comfyui_name: "retro_anime.safetensors",
      display_name: "Retro Anime",
      trigger_word: "retro",
      is_active: 1,
      sort_order: 2,
    },
  ];

  let failReorder = false;
  let reorderPayload: { ids: string[] } | null = null;
  let togglePayload: { is_active: number } | null = null;
  let deleteId: string | null = null;

  await page.route(/\/api\/loras\/[^/]+$/, async (route) => {
    const method = route.request().method();
    const id = route.request().url().split("/").pop() ?? "";
    if (method === "PUT") {
      togglePayload = (route.request().postDataJSON() ??
        JSON.parse(route.request().postData() ?? "{}")) as {
        is_active: number;
      };
      const found = lorasList.find((l) => l.id === id);
      if (found) found.is_active = togglePayload.is_active;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(found ?? { id, ...togglePayload }),
      });
      return;
    }
    if (method === "DELETE") {
      deleteId = id;
      lorasList = lorasList.filter((l) => l.id !== id);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
      return;
    }
    await route.fallback();
  });

  await page.route("**/api/loras/reorder", async (route) => {
    if (route.request().method() === "PUT") {
      if (failReorder) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Reorder failed on server" }),
        });
        return;
      }
      reorderPayload = (route.request().postDataJSON() ??
        JSON.parse(route.request().postData() ?? "{}")) as { ids: string[] };
      const orderMap = new Map(reorderPayload.ids.map((id, idx) => [id, idx]));
      lorasList.sort(
        (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
      );
      lorasList.forEach((r, i) => (r.sort_order = i));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ loras: lorasList }),
      });
      return;
    }
    await route.fallback();
  });

  await page.route("**/api/loras", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ loras: lorasList }),
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/settings?tab=loras");
  await expect(page).toHaveURL(/tab=loras/);

  // Each row shows display name and ComfyUI name
  for (const item of lorasList) {
    await expect(page.getByText(item.display_name)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(item.comfyui_name)).toBeVisible();
  }

  const rows = page.locator("li").filter({ hasText: ".safetensors" });
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Detail Enhancer");

  // Toggle active sends PUT /api/loras/<id> with { is_active: 0 } or 1
  const firstToggle = rows.nth(0).getByRole("checkbox");
  await firstToggle.click();
  expect(togglePayload).toEqual({ is_active: 0 });

  // Move down on first row sends PUT /api/loras/reorder with new id order
  await rows.nth(0).getByRole("button", { name: "Move down" }).click();
  expect(reorderPayload).toEqual({ ids: ["lora-2", "lora-1", "lora-3"] });
  await expect(rows.nth(0)).toContainText("Film Grain");
  await expect(rows.nth(1)).toContainText("Detail Enhancer");

  // Failed reorder rolls back optimistic UI and displays error toast
  failReorder = true;
  await rows.nth(0).getByRole("button", { name: "Move down" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /reorder failed|error/i }),
  ).toBeVisible();
  // Old order rolled back
  await expect(rows.nth(0)).toContainText("Film Grain");
  await expect(rows.nth(1)).toContainText("Detail Enhancer");

  // Delete opens confirm dialog; Cancel sends nothing
  const deleteBtn = rows
    .nth(0)
    .getByRole("button", { name: /Delete Film Grain|Delete/i });
  await deleteBtn.click();
  const confirmDialog = page.getByRole("dialog", {
    name: /Delete.*LoRA/i,
  });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmDialog).toBeHidden();
  expect(deleteId).toBeNull();
  await expect(page.getByText("Film Grain")).toBeVisible();

  // Confirming delete sends DELETE /api/loras/<id> and removes row
  await deleteBtn.click();
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole("button", { name: "Delete" }).click();
  await expect(confirmDialog).toBeHidden();
  expect(deleteId).toBe("lora-2");
  await expect(page.getByText("film_grain.safetensors")).toHaveCount(0);
});

test("settings: loras sync from comfyui discovers and adds new lora", async ({
  page,
}) => {
  const initialLoras = [
    {
      id: "lora-1",
      comfyui_name: "already_saved.safetensors",
      display_name: "Already Saved",
      trigger_word: null,
      is_active: 1,
      sort_order: 0,
    },
  ];

  let postPayload: { comfyui_name: string; display_name: string } | null = null;

  await page.route("**/api/loras", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ loras: initialLoras }),
      });
      return;
    }
    if (route.request().method() === "POST") {
      postPayload = (route.request().postDataJSON() ??
        JSON.parse(route.request().postData() ?? "{}")) as {
        comfyui_name: string;
        display_name: string;
      };
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "lora-new",
          comfyui_name: postPayload.comfyui_name,
          display_name: postPayload.display_name,
          trigger_word: null,
          is_active: 1,
          sort_order: 1,
        }),
      });
      return;
    }
    await route.fallback();
  });

  await page.route("**/api/comfyui/loras", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          loras: ["already_saved.safetensors", "discovered_model.safetensors"],
        }),
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/settings?tab=loras");
  const syncBtn = page.getByRole("button", { name: /Sync from ComfyUI/i });
  await expect(syncBtn).toBeVisible({ timeout: 10000 });
  await syncBtn.click();

  // Toast with discovered count
  await expect(
    page.getByRole("status").filter({ hasText: /Found 2|2 loras/i }),
  ).toBeVisible();

  // Exactly one discovered row with Add button (since one is already saved)
  const discoveredRow = page
    .locator("div, li")
    .filter({ hasText: "discovered_model.safetensors" });
  await expect(discoveredRow.first()).toBeVisible();

  const addBtn = discoveredRow.getByRole("button", { name: /Add|＋/i }).first();
  await expect(addBtn).toBeVisible();
  await addBtn.click();

  expect(postPayload).not.toBeNull();
  expect(postPayload!.comfyui_name).toBe("discovered_model.safetensors");
  expect(postPayload!.display_name).toMatch(/discovered_model/);
});

test("settings: loras empty state", async ({ page }) => {
  await page.route("**/api/loras", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ loras: [] }),
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/settings?tab=loras");
  await expect(page.getByText("No LoRAs saved")).toBeVisible({
    timeout: 10000,
  });
});

test("settings: style presets list, new preset validation & create, error handling, edit, and delete", async ({
  page,
}) => {
  type PresetItem = {
    id: string;
    name: string;
    description: string | null;
    primary_style: string;
    secondary_trigger: string | null;
    styles: string[];
    texture: string | null;
  };

  let presetsList: PresetItem[] = [
    {
      id: "preset-1",
      name: "Cyberpunk",
      description: "Neon sci-fi aesthetic",
      primary_style: "cyberpunk",
      secondary_trigger: "neon",
      styles: ["neon glow", "futuristic city"],
      texture: "rough chrome",
    },
    {
      id: "preset-2",
      name: "Watercolor",
      description: "Soft washes",
      primary_style: "watercolor",
      secondary_trigger: null,
      styles: ["paint splatter"],
      texture: null,
    },
  ];

  type PresetPayload = {
    name?: string;
    description?: string | null;
    primary_style?: string;
    secondary_trigger?: string | null;
    styles?: string[];
    texture?: string | null;
  };

  let postError = false;
  let postPayload: PresetPayload | null = null;
  let putPayload: PresetPayload | null = null;
  let deletedPresetId: string | null = null;

  await page.route("**/api/style-presets", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ presets: presetsList }),
      });
      return;
    }
    if (method === "POST") {
      if (postError) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Preset name is invalid or taken" }),
        });
        return;
      }
      postPayload = (route.request().postDataJSON() ??
        JSON.parse(route.request().postData() ?? "{}")) as PresetPayload;
      const created: PresetItem = {
        id: "preset-3",
        name: postPayload.name ?? "unnamed",
        description: postPayload.description ?? null,
        primary_style: postPayload.primary_style ?? "default",
        secondary_trigger: postPayload.secondary_trigger ?? null,
        styles: postPayload.styles ?? [],
        texture: postPayload.texture ?? null,
      };
      presetsList.push(created);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(created),
      });
      return;
    }
    await route.fallback();
  });

  await page.route(/\/api\/style-presets\/[^/]+$/, async (route) => {
    const method = route.request().method();
    const id = route.request().url().split("/").pop() ?? "";
    if (method === "PUT") {
      putPayload = (route.request().postDataJSON() ??
        JSON.parse(route.request().postData() ?? "{}")) as PresetPayload;
      const found = presetsList.find((p) => p.id === id);
      if (found) Object.assign(found, putPayload);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(found ?? { id, ...putPayload }),
      });
      return;
    }
    if (method === "DELETE") {
      deletedPresetId = id;
      presetsList = presetsList.filter((p) => p.id !== id);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/settings?tab=presets");
  await expect(page).toHaveURL(/tab=presets/);

  // Rows show name and badges
  const cyberpunkRow = page.locator("li").filter({ hasText: "Cyberpunk" });
  await expect(
    cyberpunkRow.getByText("Cyberpunk", { exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    cyberpunkRow.getByText("cyberpunk", { exact: true }),
  ).toBeVisible();
  await expect(cyberpunkRow.getByText("neon", { exact: true })).toBeVisible();

  const watercolorRow = page.locator("li").filter({ hasText: "Watercolor" });
  await expect(
    watercolorRow.getByText("Watercolor", { exact: true }),
  ).toBeVisible();
  await expect(
    watercolorRow.getByText("watercolor", { exact: true }),
  ).toBeVisible();

  // "New preset" opens dialog "New preset"
  await page.getByRole("button", { name: /New preset/i }).click();
  const newDialog = page.getByRole("dialog", { name: "New preset" });
  await expect(newDialog).toBeVisible();

  // Cancel closes the dialog
  await newDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(newDialog).toBeHidden();

  // Reopen and test validation with empty name
  await page.getByRole("button", { name: /New preset/i }).click();
  await expect(newDialog).toBeVisible();
  await newDialog.getByRole("button", { name: /Save|Create/i }).click();
  expect(postPayload).toBeNull();
  const invalidOrAlert = await newDialog
    .locator(':invalid, [role="alert"], .text-error')
    .count();
  expect(invalidOrAlert).toBeGreaterThan(0);

  // Fill in preset fields
  const nameField = newDialog
    .locator('input[name="name"], input[placeholder*="anime"], input')
    .first();
  const descField = newDialog
    .locator(
      'input[name="description"], textarea[name="description"], input[placeholder*="description"]',
    )
    .first();
  const primaryField = newDialog
    .locator('input[name="primary_style"], input[placeholder*="watercolor"]')
    .first();
  const triggerField = newDialog
    .locator('input[name="secondary_trigger"], input[placeholder*="trigger"]')
    .first();
  const stylesField = newDialog
    .locator('textarea[name="styles"], textarea')
    .first();
  const textureField = newDialog
    .locator('input[name="texture"], input[placeholder*="texture"]')
    .first();

  await nameField.fill("Retro Vintage");
  await descField.fill("Nostalgic 70s look");
  await primaryField.fill("vintage");
  await triggerField.fill("retro");
  await stylesField.fill("warm tones\ngolden hour");
  await textureField.fill("film grain");

  // API error (400) shown inside dialog, dialog remains open
  postError = true;
  await newDialog.getByRole("button", { name: /Save|Create/i }).click();
  await expect(
    newDialog.getByText("Preset name is invalid or taken"),
  ).toBeVisible();
  await expect(newDialog).toBeVisible();

  // Valid save sends POST with expected shape, closes dialog, shows toast
  postError = false;
  await newDialog.getByRole("button", { name: /Save|Create/i }).click();
  await expect(newDialog).toBeHidden();
  await expect(
    page.getByRole("status").filter({ hasText: /saved|created/i }),
  ).toBeVisible();

  expect(postPayload).not.toBeNull();
  expect(postPayload!.name).toBe("Retro Vintage");
  expect(postPayload!.description).toBe("Nostalgic 70s look");
  expect(postPayload!.primary_style).toBe("vintage");
  expect(postPayload!.secondary_trigger).toBe("retro");
  expect(postPayload!.styles).toEqual(["warm tones", "golden hour"]);
  expect(postPayload!.texture).toBe("film grain");

  // Edit opens dialog "Edit preset" prefilled and sends PUT
  await cyberpunkRow.getByRole("button", { name: "Edit" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit preset" });
  await expect(editDialog).toBeVisible();

  const editName = editDialog
    .locator('input[name="name"], input[placeholder*="anime"], input')
    .first();
  await expect(editName).toHaveValue("Cyberpunk");

  const editDesc = editDialog
    .locator(
      'input[name="description"], textarea[name="description"], input[placeholder*="description"]',
    )
    .first();
  await editDesc.fill("Updated cyberpunk neon aesthetic");

  await editDialog.getByRole("button", { name: /Save|Update/i }).click();
  await expect(editDialog).toBeHidden();
  expect(putPayload).not.toBeNull();
  expect(putPayload!.description).toBe("Updated cyberpunk neon aesthetic");

  // Delete asks for confirmation and sends DELETE /api/style-presets/<id>
  await watercolorRow.getByRole("button", { name: /Delete|Del/i }).click();
  const confirmDialog = page.getByRole("dialog", {
    name: /Delete.*preset/i,
  });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmDialog).toBeHidden();
  expect(deletedPresetId).toBeNull();

  await watercolorRow.getByRole("button", { name: /Delete|Del/i }).click();
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole("button", { name: "Delete" }).click();
  await expect(confirmDialog).toBeHidden();
  expect(deletedPresetId).toBe("preset-2");
  await expect(page.getByText("Watercolor")).toHaveCount(0);
});

test("settings: layout - desktop no horizontal overflow and fits phone with long names", async ({
  page,
}) => {
  const longLoraName = "lora_" + "x".repeat(110) + ".safetensors";
  const longLoraDisplay = "Display " + "Y".repeat(100);
  const longPresetName = "Preset_" + "Z".repeat(110);
  const longPresetDesc = "Description " + "D".repeat(150);

  await page.route("**/api/loras", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          loras: [
            {
              id: "lora-long",
              comfyui_name: longLoraName,
              display_name: longLoraDisplay,
              trigger_word: "trigger",
              is_active: 1,
              sort_order: 0,
            },
          ],
        }),
      });
      return;
    }
    await route.fallback();
  });

  await page.route("**/api/style-presets", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          presets: [
            {
              id: "preset-long",
              name: longPresetName,
              description: longPresetDesc,
              primary_style: "PrimaryLongStyleTag".repeat(4),
              secondary_trigger: "TriggerLong".repeat(5),
              styles: ["StyleBadgeLong".repeat(6)],
              texture: "TextureLongPromptSuffix".repeat(5),
            },
          ],
        }),
      });
      return;
    }
    await route.fallback();
  });

  // Desktop (1280x800): no horizontal overflow on #app-main on any tab
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const tab of ["appearance", "defaults", "loras", "presets"]) {
    await page.goto(`/settings?tab=${tab}`);
    await expect(
      page.getByRole("navigation", { name: "Settings sections" }),
    ).toBeVisible({ timeout: 10000 });
    const overflow = await page.evaluate(() => {
      const main =
        document.getElementById("app-main") ?? document.documentElement;
      return main.scrollWidth - main.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page).toHaveURL(/\/settings/);
  }

  // Mobile (390x844): every tab fits phone width
  await page.setViewportSize({ width: 390, height: 844 });
  for (const tab of ["appearance", "defaults", "loras", "presets"]) {
    await page.goto(`/settings?tab=${tab}`);
    await expect(
      page.getByRole("navigation", { name: "Settings sections" }),
    ).toBeVisible({ timeout: 10000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});
