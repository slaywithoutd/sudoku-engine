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

test("the live preview floats over the full settings page, updates live, drags and can be minimized or closed", async ({ page }) => {
  await page.goto("/");
  await openSettings(page);
  const panel = page.locator(".live-preview-panel");
  await expect(panel).toBeVisible();

  // Stays visible (fixed position) while the settings list scrolls under it.
  await page.mouse.wheel(0, 1200);
  await expect(panel).toBeVisible();

  // Updates live as a board-affecting setting changes.
  await expect(panel.locator(".board")).not.toHaveClass(/with-labels/);
  await page.getByRole("switch", { name: "Row and column labels" }).check();
  await expect(panel.locator(".board")).toHaveClass(/with-labels/);
  await page.getByRole("switch", { name: "Row and column labels" }).uncheck();

  // Draggable, clamped to a sane on-screen position.
  const before = (await panel.boundingBox())!;
  const header = panel.locator(".live-preview-header");
  const handle = (await header.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x - 250, handle.y + 150, { steps: 5 });
  await page.mouse.up();
  const after = (await panel.boundingBox())!;
  expect(after.x).not.toBeCloseTo(before.x, 0);
  const viewport = page.viewportSize()!;
  expect(after.x).toBeGreaterThanOrEqual(0);
  expect(after.y).toBeGreaterThanOrEqual(0);
  expect(after.x + after.width).toBeLessThanOrEqual(viewport.width);

  // Minimize hides the board but keeps the panel (and a way back).
  await page.getByRole("button", { name: "Minimize preview" }).click();
  await expect(panel.locator(".live-preview-board")).toBeHidden();
  await page.getByRole("button", { name: "Expand preview" }).click();
  await expect(panel.locator(".live-preview-board")).toBeVisible();

  // Close hides it entirely; an inline control brings it back.
  await page.getByRole("button", { name: "Hide preview" }).click();
  await expect(panel).toBeHidden();
  await page.getByRole("button", { name: "Show live preview", exact: true }).click();
  await expect(panel).toBeVisible();
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
  // The live preview is only useful on the full config screen; Play's quick
  // settings would otherwise show a floating board unrelated to the game.
  await expect(page.locator(".live-preview-panel")).toHaveCount(0);
  await dialog.getByRole("switch", { name: "Hide keypad" }).check();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  expect(page.url()).toBe(url);
  await expect(page.getByRole("button", { name: "Number 1", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Game settings", exact: true }).click();
  await dialog.getByRole("switch", { name: "Hide keypad" }).uncheck();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
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
