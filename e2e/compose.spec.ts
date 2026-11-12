import { expect, test } from "@playwright/test";
import { blockGeneration } from "./helpers/no-generation";

test.beforeEach(async ({ page }) => {
  await blockGeneration(page);
});

test("compose: defaults, controls, collapsibles, reset (no generation)", async ({
  page,
  request,
}) => {
  const settings = (await (
    await request.get("/api/settings")
  ).json()) as Record<string, string>;
  await page.goto("/compose");
  await expect(
    page.getByRole("heading", { level: 1, name: "Compose" }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/Video script/i).first()).toBeVisible();
  const script = page.locator('textarea[name="script"]');
  await expect(script).toBeVisible();
  await expect(page.locator("#submit-btn")).toBeInViewport();
  await expect(
    page.getByRole("button", { name: /Generate Video/i }),
  ).toBeVisible();

  if (settings.default_resolution)
    await expect(page.locator('select[name="resolution"]')).toHaveValue(
      settings.default_resolution,
    );
  if (settings.default_video_model)
    await expect(page.locator('select[name="video_model"]')).toHaveValue(
      settings.default_video_model,
    );
  if (settings.default_image_model)
    await expect(page.locator('select[name="image_model"]')).toHaveValue(
      settings.default_image_model,
    );
  if (settings.default_transition_duration) {
    await expect(page.locator('input[name="transition_duration"]')).toHaveValue(
      settings.default_transition_duration,
    );
  }

  const voice = page.locator('select[name="voice_id"]');
  await expect(voice).toBeVisible();
  expect(await voice.locator("option").count()).toBeGreaterThan(0);

  await script.fill("e2e compose draft, never submitted");
  await page.locator('input[name="clip_duration"][type="range"]').fill("4");
  await expect(page.getByText("4s").first()).toBeVisible();
  await expect(page.locator('select[name="style_preset"]')).toBeVisible();

  await page.getByText("Style guide", { exact: true }).click();
  await expect(page.locator('textarea[name="style_guide"]')).toBeVisible();
  await page.getByText("Advanced", { exact: true }).click();
  await expect(page.locator('input[name="fps"][type="range"]')).toBeVisible();

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(script).toHaveValue("");
  await expect(page.locator("#result-panel")).toBeVisible();
  await expect(page).toHaveURL(/\/compose/);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#submit-btn")).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("compose: empty submission triggers validation", async ({ page }) => {
  await page.goto("/compose");
  await expect(page.locator("#submit-btn")).toBeVisible({ timeout: 10000 });
  await page.locator("#submit-btn").click();
  await expect(page.getByText("Write a script or upload a file")).toBeVisible();
  await expect(page).not.toHaveURL(/job_id=/);
});

test("compose: upload and remove file", async ({ page }) => {
  await page.goto("/compose");
  const file = page.locator('input[name="script_file"][type="file"]');
  await expect(file).toBeAttached({ timeout: 10000 });
  await file.setInputFiles({
    name: "script.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("an uploaded script"),
  });
  await expect(page.getByText("script.txt")).toBeVisible();
  await page.getByRole("button", { name: "Remove file" }).click();
  await expect(page.getByText("script.txt")).toHaveCount(0);
});

test("compose: Reset clears the chosen file", async ({ page }) => {
  await page.goto("/compose");
  const file = page.locator('input[name="script_file"][type="file"]');
  await expect(file).toBeAttached({ timeout: 10000 });
  await file.setInputFiles({
    name: "script.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("an uploaded script"),
  });
  await expect(page.getByText("script.txt")).toBeVisible();
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByText("script.txt")).toHaveCount(0);
  expect(
    await file.evaluate((el: HTMLInputElement) => el.files?.length ?? 0),
  ).toBe(0);
});

test("compose: a script shorter than 3 characters without a file is not sent", async ({
  page,
}) => {
  const guard = await blockGeneration(page);
  await page.goto("/compose");
  const script = page.locator('textarea[name="script"]');
  await expect(script).toBeVisible({ timeout: 10000 });
  await script.fill("ab");
  await page.locator("#submit-btn").click();
  await expect(page.getByText("Write a script or upload a file")).toBeVisible();
  expect(guard.calls().filter((c) => c.method === "POST")).toHaveLength(0);
});

test("compose: an uploaded file alone is enough", async ({ page }) => {
  const guard = await blockGeneration(page);
  await page.goto("/compose");
  const script = page.locator('textarea[name="script"]');
  await expect(script).toBeVisible({ timeout: 10000 });
  await expect(script).toHaveValue("");

  const file = page.locator('input[name="script_file"]');
  await expect(file).toBeAttached();
  await file.setInputFiles({
    name: "script.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("an uploaded script"),
  });

  await page.locator("#submit-btn").click();
  await expect(page.getByText("Write a script or upload a file")).toHaveCount(
    0,
  );

  await expect
    .poll(() => guard.calls().filter((c) => c.method === "POST").length)
    .toBe(1);
  const post = guard.calls().find((c) => c.method === "POST");
  expect(post?.url.endsWith("/api/jobs/videos/compose")).toBe(true);

  await expect(
    page.locator(".alert-error, [role='alert']").first(),
  ).toBeVisible();
  await expect(page.locator("#submit-btn")).toBeEnabled();
});

test("compose: voices fall back to the default when the profiles request fails", async ({
  page,
}) => {
  await page.route("**/api/tts/profiles", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "profiles failed" }),
    });
  });
  await page.goto("/compose");
  const voice = page.locator('select[name="voice_id"]');
  await expect(voice).toBeVisible({ timeout: 10000 });
  const options = voice.locator("option");
  await expect(options).toHaveCount(1);
  await expect(options.first()).toHaveAttribute(
    "value",
    "preset:kokoro:af_bella",
  );
  await expect(options.first()).toHaveText("Default (Kokoro)");
  await expect(voice).toHaveValue("preset:kokoro:af_bella");
});

test("compose: voices populate from profiles and select the first by default", async ({
  page,
}) => {
  await page.route("**/api/tts/profiles", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: "v1", name: "Ada", language: "en", voiceType: "preset" },
        { id: "v2", name: "Ben", language: "de", voiceType: "cloned" },
      ]),
    });
  });
  await page.goto("/compose");
  const voice = page.locator('select[name="voice_id"]');
  await expect(voice).toBeVisible({ timeout: 10000 });
  const options = voice.locator("option");
  await expect(options).toHaveCount(2);
  await expect(options.nth(0)).toHaveAttribute("value", "v1");
  await expect(options.nth(0)).toHaveText("Ada (en, preset)");
  await expect(options.nth(1)).toHaveAttribute("value", "v2");
  await expect(options.nth(1)).toHaveText("Ben (de, cloned)");
  await expect(voice).toHaveValue("v1");
});

test("compose: single column on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/compose");
  await expect(page.locator("#submit-btn")).toBeInViewport({ timeout: 10000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("compose: submit payload sends exact PostComposeSchema fields without or with script_file (blocked with 503)", async ({
  page,
}) => {
  let capturedFields: Record<string, string> | null = null;
  await page.route("**/api/tts/profiles", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: "v1", name: "Ada", language: "en", voiceType: "preset" },
      ]),
    });
  });
  await page.route("**/api/jobs/videos/compose", async (route) => {
    const req = route.request();
    const buf = req.postDataBuffer();
    const ct = req.headers()["content-type"] ?? "";
    if (buf && ct) {
      const fd = await new Response(new Uint8Array(buf), {
        headers: { "content-type": ct },
      }).formData();
      const map: Record<string, string> = {};
      fd.forEach((v, k) => {
        map[k] = v instanceof File ? `File:${v.name}:${v.size}` : String(v);
      });
      capturedFields = map;
    }
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "blocked by test" }),
    });
  });

  await page.goto("/compose");
  const script = page.locator('textarea[name="script"]');
  await expect(script).toBeVisible({ timeout: 10000 });
  await expect(page.locator('select[name="voice_id"]')).toHaveValue("v1");

  await script.fill("Scene 1: A quiet valley at dawn.");
  await page.getByText("Style guide", { exact: true }).click();
  await page.locator('textarea[name="style_guide"]').fill("watercolor wash");
  await page.locator('select[name="video_model"]').selectOption("ltx2.3");
  await page.locator('select[name="resolution"]').selectOption("1080p");
  await page.locator('input[name="clip_duration"][type="range"]').fill("6");
  await page
    .locator('input[name="transition_duration"][type="range"]')
    .fill("4");
  await page.getByText("Advanced", { exact: true }).click();
  await page.locator('input[name="fps"][type="range"]').fill("20");

  // 1. Without a file chosen: script_file is absent
  await page.locator("#submit-btn").click();
  await expect.poll(() => capturedFields).not.toBeNull();
  expect(Object.keys(capturedFields!).sort()).toEqual(
    [
      "script",
      "style_guide",
      "voice_id",
      "style_preset",
      "image_model",
      "video_model",
      "resolution",
      "clip_duration",
      "transition_duration",
      "fps",
    ].sort(),
  );
  expect(capturedFields).toMatchObject({
    script: "Scene 1: A quiet valley at dawn.",
    style_guide: "watercolor wash",
    voice_id: "v1",
    image_model: "z-image-turbo",
    video_model: "ltx2.3",
    resolution: "1080p",
    clip_duration: "6",
    transition_duration: "4",
    fps: "20",
  });
  expect(capturedFields!.style_preset?.length).toBeGreaterThan(0);

  // 2. With a file chosen: script_file is present
  capturedFields = null;
  const file = page.locator('input[name="script_file"][type="file"]');
  await file.setInputFiles({
    name: "uploaded-scene.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("Uploaded markdown script content"),
  });
  await page.locator("#submit-btn").click();
  await expect.poll(() => capturedFields).not.toBeNull();
  expect(Object.keys(capturedFields!).sort()).toEqual(
    [
      "script",
      "script_file",
      "style_guide",
      "voice_id",
      "style_preset",
      "image_model",
      "video_model",
      "resolution",
      "clip_duration",
      "transition_duration",
      "fps",
    ].sort(),
  );
  expect(capturedFields!.script_file).toBe("File:uploaded-scene.md:32");
});

test("compose: saved draft voice_id is kept while profiles load and after they settle", async ({
  page,
}) => {
  let profilesList = [
    { id: "v1", name: "Ada", language: "en", voiceType: "preset" },
    { id: "v2", name: "Ben", language: "de", voiceType: "cloned" },
  ];

  await page.route("**/api/tts/profiles", async (route) => {
    await new Promise((r) => setTimeout(r, 500));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(profilesList),
    });
  });

  // 1. With a mocked list containing v2 and profiles delayed by 500ms:
  // the select never shows the Kokoro default in between, ends on v2, and stored draft still says v2.
  await page.goto("/compose");
  await page.evaluate(() => {
    sessionStorage.setItem(
      "ss:draft:/compose",
      JSON.stringify({ script: "draft script", voice_id: "v2" }),
    );
  });
  await page.reload();

  const voice = page.locator('select[name="voice_id"]');
  await expect(voice).toBeVisible({ timeout: 10000 });

  // Sample during the 500ms delay and after it settles
  for (let i = 0; i < 6; i++) {
    expect(await voice.inputValue()).toBe("v2");
    await new Promise((r) => setTimeout(r, 120));
  }

  await expect(voice.locator('option[value="v2"]')).toHaveText(
    "Ben (de, cloned)",
  );
  await expect(voice).toHaveValue("v2");

  // Wait past the 300ms draft flush timer and verify stored draft still says v2
  await new Promise((r) => setTimeout(r, 350));
  const storedDraft = await page.evaluate(() => {
    const raw = sessionStorage.getItem("ss:draft:/compose");
    return raw ? (JSON.parse(raw) as Record<string, string>) : null;
  });
  expect(storedDraft?.voice_id).toBe("v2");

  // 2. With a mocked list without v2: the first option is selected
  profilesList = [
    { id: "v1", name: "Ada", language: "en", voiceType: "preset" },
  ];
  await page.evaluate(() => {
    sessionStorage.setItem(
      "ss:draft:/compose",
      JSON.stringify({ script: "draft script", voice_id: "v2" }),
    );
  });
  await page.reload();
  await expect(voice).toHaveValue("v1", { timeout: 10000 });
});
