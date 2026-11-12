import { expect, test } from "./helpers/test";

test("ui kit: toast, confirm, modal, segmented, slider, lightbox", async ({
  page,
}) => {
  await page.goto("/dev/kit");
  await expect(
    page.getByRole("heading", { name: "UI kit", level: 2 }),
  ).toBeVisible({
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

test("ui kit: toast fired while modal is open appears above modal in top layer and can be dismissed", async ({
  page,
}) => {
  await page.goto("/dev/kit");
  await page.getByRole("button", { name: "Open modal" }).click();
  const modal = page.getByRole("dialog", { name: "Example modal" });
  await expect(modal).toBeVisible();

  await modal.getByRole("button", { name: "Toast from modal" }).click();
  const toastStatus = page
    .getByRole("status")
    .filter({ hasText: "Toast above the modal" });
  await expect(toastStatus).toBeVisible();

  const isOnTop = await toastStatus.evaluate((toastEl) => {
    const rect = toastEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    return Boolean(hit && toastEl.contains(hit));
  });
  expect(isOnTop).toBe(true);

  await toastStatus
    .getByRole("button", { name: "Dismiss notification" })
    .click();
  await expect(toastStatus).toBeHidden();
  await expect(modal).toBeVisible();
});

test("ui kit: toast raised inside modal remains visible after modal closes and focus stays on trigger", async ({
  page,
}) => {
  await page.goto("/dev/kit");

  const successBtn = page.getByRole("button", { name: "Success toast" });
  await successBtn.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "Saved" }),
  ).toBeVisible();
  await expect(successBtn).toBeFocused();

  await page.getByRole("button", { name: "Open modal" }).click();
  const modal = page.getByRole("dialog", { name: "Example modal" });
  await expect(modal).toBeVisible();

  await modal.getByRole("button", { name: "Toast from modal" }).click();
  const modalToast = page
    .getByRole("status")
    .filter({ hasText: "Toast above the modal" });
  await expect(modalToast).toBeVisible();

  await modal.getByRole("button", { name: "Done" }).click();
  await expect(modal).toBeHidden();
  await expect(modalToast).toBeVisible();
});

test("ui kit: TabLink marks only the active link with aria-current=page in tab and chip variants", async ({
  page,
}) => {
  await page.goto("/dev/kit");
  const tabsNav = page.locator('nav[aria-label="Demo tabs"]');
  await expect(tabsNav).toBeVisible();
  await expect(tabsNav.locator('[role="tab"]')).toHaveCount(0);
  await expect(tabsNav.locator('a[aria-current="page"]')).toHaveCount(1);
  await expect(tabsNav.getByRole("link", { name: "All" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  const chipsNav = page.locator('nav[aria-label="Demo chips"]');
  await expect(chipsNav).toBeVisible();
  await expect(chipsNav.locator('[role="tab"]')).toHaveCount(0);
  await expect(chipsNav.locator('a[aria-current="page"]')).toHaveCount(1);
  const allChip = chipsNav.getByRole("link", { name: "All" });
  const activeChip = chipsNav.getByRole("link", { name: "Active" });
  await expect(allChip).toHaveClass(/\bbtn\b/);
  await expect(allChip).toHaveClass(/\bbtn-primary\b/);
  await expect(allChip).not.toHaveClass(/\btab\b/);
  await expect(activeChip).toHaveClass(/\bbtn-ghost\b/);
  await expect(activeChip).not.toHaveClass(/\btab\b/);

  await tabsNav.getByRole("link", { name: "Active" }).click();
  await expect(page).toHaveURL(/tab=active/);
  await expect(tabsNav.locator('a[aria-current="page"]')).toHaveCount(1);
  await expect(tabsNav.getByRole("link", { name: "Active" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(chipsNav.locator('a[aria-current="page"]')).toHaveCount(1);
  await expect(activeChip).toHaveAttribute("aria-current", "page");
  await expect(activeChip).toHaveClass(/\bbtn-primary\b/);
});

test("ui kit: Segmented re-syncs radio checked state when parent rejects an option", async ({
  page,
}) => {
  await page.goto("/dev/kit");
  const group = page.getByRole("radiogroup", {
    name: "Media type (audio locked)",
  });
  await expect(group).toBeVisible();
  const allRadio = group.getByRole("radio", { name: "All" });
  const audioRadio = group.getByRole("radio", { name: "Audio" });
  await expect(allRadio).toBeChecked();

  await audioRadio.click({ force: true });
  await expect(audioRadio).not.toBeChecked();
  await expect(allRadio).toBeChecked();
});

test("ui kit: hovering a video tile plays the video visibly above the poster", async ({
  page,
  request,
}) => {
  const galleryRes = await request.get(
    "/api/gallery/items?limit=12&type=video",
  );
  const galleryData = (await galleryRes.json()) as { items?: unknown[] };
  test.skip(
    !galleryData.items || galleryData.items.length === 0,
    "No video items in gallery",
  );

  await page.goto("/dev/kit");
  await expect(
    page.getByRole("heading", { name: "UI kit", level: 2 }),
  ).toBeVisible({
    timeout: 10000,
  });
  const tiles = page.getByTestId("kit-tiles");
  await expect(tiles.getByRole("button").first()).toBeVisible();
  const videoTile = tiles.locator("button:has(video)").first();
  await videoTile
    .waitFor({ state: "visible", timeout: 3000 })
    .catch(() => undefined);
  test.skip(
    (await videoTile.count()) === 0,
    "DevKit video tile has no <video> element after loading",
  );

  await videoTile.hover();
  const videoEl = videoTile.locator("video");

  await expect
    .poll(
      async () =>
        videoEl.evaluate(
          (el: HTMLVideoElement) =>
            !el.paused &&
            el.currentTime > 0 &&
            getComputedStyle(el).opacity === "1",
        ),
      { timeout: 10000 },
    )
    .toBe(true);

  const hitCheck = await videoTile.evaluate((btn) => {
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    const vid = btn.querySelector("video");
    const opacity = vid ? getComputedStyle(vid).opacity : "0";
    return {
      isVideoHit: hit === vid,
      opacity,
    };
  });

  expect(hitCheck.opacity).toBe("1");
  expect(hitCheck.isVideoHit).toBe(true);
});

test("ui kit: with no dialog open, raising a toast renders exactly one toast item in the document without role=alert", async ({
  page,
}) => {
  await page.goto("/dev/kit");
  await page.getByRole("button", { name: "Error toast" }).click();
  const errToast = page
    .getByRole("status")
    .filter({ hasText: "Something went wrong" });
  await expect(errToast).toBeVisible();
  await expect(errToast).toHaveClass(/\balert-error\b/);
  await expect(page.locator('.toast-region [role="alert"]')).toHaveCount(0);
  await expect(page.locator('.toast-region [role="status"]')).toHaveCount(1);
});

test("ui kit: Escape closes modal and lightbox once without reopening", async ({
  page,
}) => {
  await page.goto("/dev/kit");

  await page.getByRole("button", { name: "Open modal" }).click();
  const modal = page.getByRole("dialog", { name: "Example modal" });
  await expect(modal).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  await expect(page.getByTestId("modal-close-count")).toHaveText("1");

  await page.getByTestId("kit-tiles").getByRole("button").first().click();
  const lightbox = page.getByRole("dialog", { name: "Media viewer" });
  await expect(lightbox).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(lightbox).toBeHidden();
  await expect(page.getByTestId("lightbox-close-count")).toHaveText("1");
});

test("ui kit: keyboard toast dismiss moves focus to next toast or back inside open dialog", async ({
  page,
}) => {
  await page.goto("/dev/kit");
  await page.getByRole("button", { name: "Open modal" }).click();
  const modal = page.getByRole("dialog", { name: "Example modal" });
  await expect(modal).toBeVisible();

  const trigger = modal.getByRole("button", { name: "Toast from modal" });
  await trigger.click();
  const toastStatus = modal
    .getByRole("status")
    .filter({ hasText: "Toast above the modal" });
  await expect(toastStatus).toBeVisible();

  const dismissBtn = toastStatus.getByRole("button", {
    name: "Dismiss notification",
  });
  await dismissBtn.focus();
  await page.keyboard.press("Enter");
  await expect(toastStatus).toBeHidden();

  const activeInsideModal = await modal.evaluate((d) =>
    Boolean(
      document.activeElement &&
      document.activeElement !== document.body &&
      d.contains(document.activeElement),
    ),
  );
  expect(activeInsideModal).toBe(true);
});

test("ui kit: confirm dialog opened on top of modal scopes toast to top-most dialog and preserves it in lower dialog on close", async ({
  page,
}) => {
  await page.goto("/dev/kit");
  await page.getByRole("button", { name: "Open modal" }).click();
  const modal = page.getByRole("dialog", { name: "Example modal" });
  await expect(modal).toBeVisible();

  await modal.getByRole("button", { name: "Confirm from modal" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete this?" });
  await expect(confirm).toBeVisible();

  const topToast = confirm
    .getByRole("status")
    .filter({ hasText: "Toast on confirm" });
  await expect(topToast).toBeVisible();

  const isTopClickable = await topToast.evaluate((toastEl) => {
    const rect = toastEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    return Boolean(hit && toastEl.contains(hit));
  });
  expect(isTopClickable).toBe(true);

  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  await expect(modal).toBeVisible();

  const lowerToast = modal
    .getByRole("status")
    .filter({ hasText: "Toast on confirm" });
  await expect(lowerToast).toBeVisible();
  await lowerToast
    .getByRole("button", { name: "Dismiss notification" })
    .click();
  await expect(lowerToast).toBeHidden();
});

test("ui kit: modal removed from DOM while open releases overlay so toast moves to root region and page is interactive", async ({
  page,
}) => {
  await page.goto("/dev/kit");
  await page.getByRole("button", { name: "Open modal" }).click();
  const modal = page.getByRole("dialog", { name: "Example modal" });
  await expect(modal).toBeVisible();

  await modal.getByRole("button", { name: "Toast from modal" }).click();
  await expect(
    modal.getByRole("status").filter({ hasText: "Toast above the modal" }),
  ).toBeVisible();

  await modal.getByRole("button", { name: "Unmount modal" }).click();
  await expect(modal).toHaveCount(0);

  const rootToast = page
    .locator('[data-toast-scope="root"]')
    .getByRole("status")
    .filter({ hasText: "Toast above the modal" });
  await expect(rootToast).toBeVisible();

  await page.getByRole("button", { name: "Success toast" }).click();
  await expect(
    page
      .locator('[data-toast-scope="root"]')
      .getByRole("status")
      .filter({ hasText: "Saved" }),
  ).toBeVisible();
});

test("ui kit: non-dismissible modal closed or unmounted by owner while a native close is pending does not reopen and throws nothing", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (err) => pageErrors.push(err));

  await page.goto("/dev/kit");
  await page.getByRole("button", { name: "Open modal" }).click();
  const modal = page.getByRole("dialog", { name: "Example modal" });
  await expect(modal).toBeVisible();

  await modal.getByRole("button", { name: "Lock modal" }).click();

  // Trigger a native close followed immediately by owner closing the modal before the queued close event fires
  await modal.evaluate((dialogEl: HTMLDialogElement) => {
    HTMLDialogElement.prototype.close.call(dialogEl);
    const doneBtn = Array.from(dialogEl.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Done",
    );
    doneBtn?.click();
  });

  await page.waitForTimeout(100);
  await expect(modal).toBeHidden();
  expect(pageErrors).toHaveLength(0);

  // Also test when unmounted while non-dismissible and native close is pending
  await page.getByRole("button", { name: "Open modal" }).click();
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "Lock modal" }).click();

  await modal.evaluate((dialogEl: HTMLDialogElement) => {
    HTMLDialogElement.prototype.close.call(dialogEl);
    const unmountBtn = Array.from(dialogEl.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Unmount modal",
    );
    unmountBtn?.click();
  });

  await page.waitForTimeout(100);
  await expect(modal).toHaveCount(0);
  expect(pageErrors).toHaveLength(0);
});
