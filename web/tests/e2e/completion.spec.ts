import { expect, test } from "@playwright/test";
import { SOLUTION } from "../fixtures";
import { cell, openMenu, openSettings, playString } from "./helpers";

test("valid completion is dismissible and reappears only on a new complete transition", async ({ page }) => {
  await playString(page, SOLUTION.slice(0, 80) + "0");
  await cell(page, 80).click();
  await page.keyboard.press("9");
  await expect(page.getByRole("heading", { name: "Solved", exact: true })).toBeVisible();
  await expect(page.locator(".completion")).not.toContainText(/unique|perfect/i);
  await page.getByRole("button", { name: "Dismiss message", exact: true }).click();
  await cell(page, 79).click();
  await expect(page.locator(".completion")).toBeHidden();
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".completion")).toBeVisible();
  // A solved game stops its timer and hides the pause control.
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeHidden();
});

test("full conflicting board stays editable; checking can be manual", async ({ page }) => {
  await playString(page, SOLUTION.slice(0, 80) + "0");
  await cell(page, 80).click();
  await page.keyboard.press("1");
  await expect(page.locator(".completion")).toBeHidden();
  await expect(page.locator(".cell.conflict")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await openMenu(page, "Check puzzle");
  await expect(page.locator(".toast")).toContainText("Not solved");
  await openSettings(page);
  await page.getByRole("switch", { name: "Warn on conflicting digits" }).check();
  await page.getByRole("switch", { name: "Check when the grid is full" }).uncheck();
  await page.goBack();
  await expect(cell(page, 80)).toHaveClass(/conflict/);
  await cell(page, 80).click();
  await page.keyboard.press("9");
  await expect(page.locator(".completion")).toBeHidden();
  await openMenu(page, "Check puzzle");
  await expect(page.locator(".completion")).toBeVisible();
});

test("mark correct digits uses the unique solution found in a worker", async ({ page }) => {
  await playString(page, SOLUTION.slice(0, 70) + "0".repeat(11));
  await openSettings(page);
  await page.getByRole("switch", { name: "Mark correct digits" }).check();
  await page.goBack();
  await cell(page, 70).click();
  await page.keyboard.press(SOLUTION[70]);
  await cell(page, 71).click();
  await page.keyboard.press(SOLUTION[71] === "1" ? "2" : "1");
  await expect(cell(page, 70)).toHaveClass(/correct/, { timeout: 15_000 });
  await expect(cell(page, 71)).not.toHaveClass(/correct/);
});
