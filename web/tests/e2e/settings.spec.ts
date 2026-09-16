import { expect, test } from "@playwright/test";
import { PUZZLE } from "../fixtures";
import { cell, openSettings, playString, saved } from "./helpers";

test("accessibility settings apply immediately, persist and never rely on hue alone", async ({ page }) => {
  await page.goto("/");
  await openSettings(page);
  const html = page.locator("html");
  await page.getByRole("radio", { name: "Larger" }).first().click();
  await expect(html).toHaveAttribute("data-text-scale", "130");
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("20.8px");
  await page.getByRole("radio", { name: "Color-blind safe" }).click();
  await page.getByRole("switch", { name: "Patterns on cell colors" }).check();
  await page.getByRole("switch", { name: "High contrast" }).check();
  await page.getByRole("switch", { name: "Stronger digits" }).check();
  await expect(html).toHaveAttribute("data-palette", "colorblind");
  await expect(html).toHaveAttribute("data-contrast", "high");
  await saved(page);
  await page.reload();
  await expect(html).toHaveAttribute("data-patterns", "true");
  await expect(html).toHaveAttribute("data-bold-digits", "true");
  await playString(page, PUZZLE);
  await cell(page, 2).click();
  await page.keyboard.press("V");
  await page.keyboard.press("1");
  const background = await cell(page, 2).evaluate((e) => getComputedStyle(e).backgroundImage);
  expect(background).toContain("gradient");
});

test("keyboard shortcuts can be remapped, cleared and restored; Help lists the current keys", async ({ page }) => {
  await playString(page, PUZZLE);
  const playUrl = page.url();
  await openSettings(page);
  await page.getByRole("button", { name: /^Pause \/ resume timer: P/ }).click();
  await page.keyboard.press("Digit5");
  await expect(page.getByText("Numbers and arrow keys are reserved for the board.")).toBeVisible();
  await page.keyboard.press("Shift+KeyK");
  await expect(page.getByRole("button", { name: /^Pause \/ resume timer: Shift\+K/ })).toBeVisible();
  // Taking an existing combo moves it and says so.
  await page.getByRole("button", { name: /^Center note tool: C/ }).click();
  await page.keyboard.press("Shift+KeyK");
  await expect(page.getByText(/removed from “Pause \/ resume timer”/)).toBeVisible();
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await expect(page.getByRole("row", { name: /Center note tool/ })).toContainText("Shift+K");
  await page.goto(playUrl);
  await cell(page, 2).click();
  await page.keyboard.press("Shift+KeyK");
  await expect(page.getByRole("radio", { name: /^Center/ })).toHaveAttribute("aria-checked", "true");
  await openSettings(page);
  await page.getByRole("button", { name: "Restore defaults", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Center note tool: C/ })).toBeVisible();
});

test("quick game settings open from Play without leaving the game", async ({ page }) => {
  await playString(page, PUZZLE);
  const url = page.url();
  await page.getByRole("button", { name: "Game settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Game settings" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("radio", { name: "Minimized" }).click();
  await expect(page.getByRole("button", { name: "Show keypad", exact: true })).toBeAttached();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  expect(page.url()).toBe(url);
  await page.getByRole("button", { name: "Show keypad", exact: true }).click();
  await expect(page.getByRole("button", { name: "Number 1", exact: true })).toBeVisible();
});

test("puzzle files import with a preview; collections become drafts", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const rows = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((r) => PUZZLE.slice(r * 9, r * 9 + 9).replace(/0/g, "."));
  const sdk = `#Aauthor\n${rows.join("\n")}`;
  await page.locator(".import-dialog input[type=file]").setInputFiles({ name: "one.sdk", mimeType: "text/plain", buffer: Buffer.from(sdk) });
  await expect(page.getByRole("dialog")).toContainText("30 clues · no conflicts");
  await page.locator(".import-dialog input[type=file]").setInputFiles({ name: "many.txt", mimeType: "text/plain", buffer: Buffer.from(`${PUZZLE}\n${PUZZLE}\n${PUZZLE}`) });
  await expect(page.getByRole("dialog")).toContainText("3 puzzles");
  await page.getByRole("button", { name: "Import all 3", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Drafts/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("article")).toHaveCount(3);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.locator(".import-dialog input[type=file]").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from('{"format":"sudoku-engine-backup"}') });
  await expect(page.getByRole("alert")).toContainText("Settings");
});
