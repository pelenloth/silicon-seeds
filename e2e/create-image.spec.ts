import { expect, test } from "@playwright/test";

test("create image: saved defaults, controls, validation, draft, reset (no generation)", async ({
  page,
  request,
}) => {
  const settings = (await (
    await request.get("/api/settings")
  ).json()) as Record<string, string>;
  await page.goto("/create/image");
  await expect(
    page.getByRole("heading", { level: 1, name: "Image" }),
  ).toBeVisible({ timeout: 10000 });
  const prompt = page.locator('textarea[name="prompt"]');
  await expect(prompt).toBeVisible();
  await expect(page.locator("#submit-btn")).toBeInViewport();
  await expect(page.locator("#result-panel")).toBeVisible();

  if (settings.default_resolution) {
    await expect(page.locator('select[name="resolution"]')).toHaveValue(
      settings.default_resolution,
    );
  }

  await page.locator("#submit-btn").click();
  await expect(page.getByText("Prompt is required")).toBeVisible();
  await expect(page).not.toHaveURL(/job_id=/);

  await prompt.fill("e2e draft prompt, never submitted");
  await page.locator('select[name="resolution"]').selectOption("480p");
  await page.locator('input[name="batch_size"][type="range"]').fill("4");
  await expect(page.getByText(/4 images/).first()).toBeVisible();

  await page.getByText("Style guide", { exact: true }).click();
  await expect(page.locator('textarea[name="style_guide"]')).toBeVisible();
  await page.getByText("LoRAs", { exact: true }).click();
  await expect(page.getByText(/No LoRAs added/i)).toBeVisible();
  await page.getByText("Advanced", { exact: true }).click();
  await expect(page.locator('select[name="image_model"]')).toBeVisible();
  await expect(page.locator('select[name="style_preset"]')).toBeVisible();

  await page.locator("#sidebar-gallery").click();
  await expect(page).toHaveURL(/\/gallery/);
  await page.locator("#sidebar-image").click();
  await expect(page.locator('textarea[name="prompt"]')).toHaveValue(
    "e2e draft prompt, never submitted",
  );
  await expect(page.locator('select[name="resolution"]')).toHaveValue("480p");

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.locator('textarea[name="prompt"]')).toHaveValue("");
  if (settings.default_resolution) {
    await expect(page.locator('select[name="resolution"]')).toHaveValue(
      settings.default_resolution,
    );
  }
  await expect(page).toHaveURL(/\/create\/image/);
});

test("create image: the result panel shows the real state of a finished job", async ({
  page,
  request,
}) => {
  const { jobs } = (await (await request.get("/api/jobs")).json()) as {
    jobs: { id: string; name: string; kind: string; status: string }[];
  };
  const job = jobs.find((j) => j.kind === "image" && j.status === "complete");
  test.skip(!job, "no completed image job in this database");
  await page.goto(`/create/image?show_progress=true&job_id=${job!.id}`);
  const panel = page.locator("#result-panel");
  await expect(panel).toContainText(job!.name, { timeout: 10000 });
  await expect(panel.getByText("Completed")).toBeVisible();
  await expect(panel.getByText("Active", { exact: true })).toHaveCount(0);
  await expect(panel.getByRole("link", { name: "Open job" })).toHaveAttribute(
    "href",
    new RegExp(`/jobs/${job!.id}`),
  );
});

test("create image: single column on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/create/image");
  await expect(page.locator('textarea[name="prompt"]')).toBeVisible({
    timeout: 10000,
  });
  await expect(page.locator("#submit-btn")).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
