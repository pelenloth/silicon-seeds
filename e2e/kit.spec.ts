import { expect, test } from "@playwright/test";

test("ui kit: toast, confirm, modal, segmented, slider, lightbox", async ({
  page,
}) => {
  await page.goto("/dev/kit");
  await expect(page.getByRole("heading", { name: "UI kit" })).toBeVisible({
    timeout: 10000,
  });

  await page.getByRole("button", { name: "Success toast" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Ask to confirm" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete this?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("confirm-result")).toHaveText("confirmed");

  await page.getByRole("button", { name: "Open modal" }).click();
  const modal = page.getByRole("dialog", { name: "Example modal" });
  await expect(modal).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();

  await page.getByRole("radio", { name: "Videos" }).check({ force: true });
  await expect(page.getByTestId("segmented-value")).toHaveText("video");

  const slider = page.locator('input[type="range"][name="kit_slider"]');
  await slider.fill("7");
  await expect(page.getByTestId("slider-value")).toHaveText("7s");

  await page.getByTestId("kit-tiles").getByRole("button").first().click();
  const lightbox = page.getByRole("dialog", { name: "Media viewer" });
  await expect(lightbox).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(lightbox.getByTestId("lightbox-position")).toHaveText("2 / 3");
  await page.keyboard.press("Escape");
  await expect(lightbox).toBeHidden();

  await expect(page.getByText("Running").first()).toBeVisible();
  await expect(page.getByText("Nothing here yet")).toBeVisible();
});

test("ui kit: back-to-back confirm dialog stays open after first closes", async ({
  page,
}) => {
  await page.goto("/dev/kit");
  const askBtn = page.getByRole("button", { name: "Ask to confirm" });
  const confirm = page.getByRole("dialog", { name: "Delete this?" });

  await askBtn.click();
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Delete" }).click();
  await askBtn.click();
  await page.waitForTimeout(300);
  await expect(confirm).toBeVisible();
});
