import { chromium, expect, test } from "@playwright/test";
import { cell, saved, playString } from "./helpers";
test("hidden notes, redo, reset and selection survive refresh and reopened page", async ({
  page,
  context,
  browser,
}) => {
  await playString(page, "0".repeat(81));
  await cell(page, 0).click();
  await page.keyboard.press("Shift+Digit2");
  await page.keyboard.press("5");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("ArrowRight");
  await saved(page);
  const url = page.url();
  await page.reload();
  await expect(cell(page, 1)).toHaveAttribute("aria-selected", "true");
  await cell(page, 1).click();
  await page.keyboard.press("Control+y");
  await expect(cell(page, 0).locator("[data-value]")).toHaveText("5");
  await saved(page);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(url);
  await cell(reopened, 0).click();
  await reopened.keyboard.press("Delete");
  await expect(cell(reopened, 0).locator("[data-notes]")).toHaveText("2");
  await reopened.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(cell(reopened, 0).locator("[data-notes]")).toBeEmpty();
  await reopened.keyboard.press("Control+z");
  await expect(cell(reopened, 0).locator("[data-notes]")).toHaveText("2");
  const isolated = await browser.newContext();
  try {
    const other = await isolated.newPage();
    await other.goto(url);
    await expect(
      other.getByText("Record not found", { exact: true }),
    ).toBeVisible();
  } finally {
    await isolated.close();
  }
});
test("library survives a true browser restart with history in an isolated temporary profile", async ({}, info) => {
  const profile = info.outputPath("isolated-profile");
  let context = await chromium.launchPersistentContext(profile, {
    headless: true,
  });
  try {
    let page = await context.newPage();
    await page.goto("http://127.0.0.1:5174/");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await cell(page, 0).click();
    await page.keyboard.press("8");
    await saved(page);
    const url = page.url();
    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
    });
    page = await context.newPage();
    await page.goto(url);
    await expect(cell(page, 0).locator("[data-value]")).toHaveText("8");
    await cell(page, 0).click();
    await page.keyboard.press("Control+z");
    await expect(cell(page, 0).locator("[data-value]")).toBeEmpty();
    await saved(page);
  } finally {
    await context.close();
  }
});
test("stale browser tab shows recovery and never overwrites the winning save", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await saved(page);
  const url = page.url(),
    other = await context.newPage();
  await other.goto(url);
  await expect(cell(other, 0)).toBeVisible();
  await cell(page, 0).click();
  await page.keyboard.press("1");
  await saved(page);
  await cell(other, 0).click();
  await other.keyboard.press("2");
  await expect(other.getByTestId("save-status")).toHaveText("Not saved");
  await expect(other.getByText(/another tab/)).toBeVisible();
  await page.reload();
  await expect(cell(page, 0).locator("[data-value]")).toHaveText("1");
  await other.close();
});
