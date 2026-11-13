import { expect, test } from "./helpers/test";

test("create audio: controls, optional lyrics, validation (no generation)", async ({
  page,
}) => {
  await page.goto("/create/audio");
  await expect(
    page.getByRole("heading", { level: 1, name: "Audio" }),
  ).toBeVisible({ timeout: 10000 });
  const style = page.locator('textarea[name="instrumental_prompt"]');
  const lyrics = page.locator('textarea[name="lyric_prompt"]');
  await expect(style).toBeVisible();
  await expect(lyrics).toBeVisible();
  await expect(
    page.getByText(/Leave blank for an instrumental track/i),
  ).toBeVisible();
  await expect(page.locator("#submit-btn")).toBeInViewport();

  await page.locator("#submit-btn").click();
  await expect(page.getByText("Describe the music first")).toBeVisible();
  await expect(page.getByText(/Lyric prompt is required/i)).toHaveCount(0);
  await expect(page).not.toHaveURL(/job_id=/);

  await page.locator('input[name="duration"][type="range"]').fill("120");
  await expect(page.getByText("120s").first()).toBeVisible();
  await page.locator('input[name="bpm"][type="range"]').fill("100");
  await expect(page.getByText("100 BPM").first()).toBeVisible();
  await page.locator('select[name="keyscale"]').selectOption("A minor");
  await page.locator('input[name="timesignature"][value="3"]').check();
  await expect(
    page.locator('input[name="timesignature"][value="3"]'),
  ).toBeChecked();

  await page.getByText("Advanced", { exact: true }).click();
  for (const name of ["cfg_scale", "temperature", "top_p"]) {
    await expect(
      page.locator(`input[name="${name}"][type="range"]`),
    ).toBeVisible();
  }

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.locator('input[name="duration"]')).toHaveValue("60");
  await expect(
    page.locator('input[name="timesignature"][value="4"]'),
  ).toBeChecked();
  await expect(page).toHaveURL(/\/create\/audio/);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#submit-btn")).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("create audio: submit payload sends exact PostDistinctAudioSchema fields (blocked with 503)", async ({
  page,
}) => {
  let capturedFields: Record<string, string> | null = null;
  await page.route("**/api/jobs/audio", async (route) => {
    const req = route.request();
    const buf = req.postDataBuffer();
    const ct = req.headers()["content-type"] ?? "";
    if (buf && ct) {
      const fd = await new Response(new Uint8Array(buf), {
        headers: { "content-type": ct },
      }).formData();
      const map: Record<string, string> = {};
      fd.forEach((v, k) => {
        map[k] = typeof v === "string" ? v : String(v);
      });
      capturedFields = map;
    }
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "blocked by test" }),
    });
  });

  await page.goto("/create/audio");
  const style = page.locator('textarea[name="instrumental_prompt"]');
  await expect(style).toBeVisible({ timeout: 10000 });
  await style.fill("warm ambient synth pads");
  await page.locator('input[name="duration"][type="range"]').fill("65");
  await expect(page.getByText("65s").first()).toBeVisible();

  await page.locator("#submit-btn").click();
  await expect.poll(() => capturedFields).not.toBeNull();
  expect(Object.keys(capturedFields!).sort()).toEqual(
    [
      "instrumental_prompt",
      "lyric_prompt",
      "duration",
      "bpm",
      "keyscale",
      "timesignature",
      "cfg_scale",
      "temperature",
      "top_p",
    ].sort(),
  );
  expect(capturedFields).toEqual({
    instrumental_prompt: "warm ambient synth pads",
    lyric_prompt: "",
    duration: "65",
    bpm: "72",
    keyscale: "E minor",
    timesignature: "4",
    cfg_scale: "2",
    temperature: "0.85",
    top_p: "0.9",
  });
});
