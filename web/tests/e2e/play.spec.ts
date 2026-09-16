import { expect, test } from "@playwright/test";
import { PUZZLE, SOLUTION } from "../fixtures";
import { cell, openMenu, openSettings, playString, saved } from "./helpers";

const seconds = async (page: import("@playwright/test").Page) => {
  const text = (await page.getByRole("timer").textContent())!;
  const [m, s] = text.split(":").map(Number);
  return m * 60 + s;
};

test("the timer tracks active play while hidden, ignores pauses and inactive pages, and persists", async ({ page }) => {
  await page.clock.install();
  await playString(page, PUZZLE);
  await openSettings(page);
  await page.getByRole("switch", { name: "Show timer" }).uncheck();
  await page.goBack();
  await expect(page.getByRole("timer")).toBeHidden();
  await page.clock.runFor(180_000);
  await openSettings(page);
  await page.getByRole("switch", { name: "Show timer" }).check();
  await page.goBack();
  // Time spent on the settings page does not count; the three minutes of play do.
  expect(await seconds(page)).toBeGreaterThanOrEqual(179);
  expect(await seconds(page)).toBeLessThanOrEqual(182);
  const before = await seconds(page);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator(".pause-cover")).toBeVisible();
  await page.keyboard.press("4");
  await page.clock.runFor(60_000);
  expect(await seconds(page)).toBeLessThanOrEqual(before + 1);
  await page.keyboard.press("P");
  await expect(page.locator(".pause-cover")).toBeHidden();
  // A hidden page never counts.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(60_000);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(2_000);
  expect(await seconds(page)).toBeLessThanOrEqual(before + 4);
  await saved(page);
  const kept = await seconds(page);
  await page.reload();
  // Time is persisted periodically and when the page is hidden or closed.
  expect(await seconds(page)).toBeGreaterThanOrEqual(kept - 10);
});

test("games can start the timer on the first move and restart with or without resetting it", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await openSettings(page);
  await page.getByRole("radio", { name: "On first move" }).click();
  await playString(page, PUZZLE);
  await page.clock.runFor(30_000);
  await expect(page.getByRole("timer")).toHaveText("0:00");
  await cell(page, 2).click();
  await page.keyboard.press("4");
  await page.clock.runFor(10_000);
  expect(await seconds(page)).toBeGreaterThanOrEqual(9);
  await openMenu(page, "Restart puzzle");
  await page.getByRole("switch", { name: "Also reset the timer" }).uncheck();
  await page.getByRole("dialog").getByRole("button", { name: "Restart", exact: true }).click();
  await expect(cell(page, 2).locator("[data-value]")).toBeEmpty();
  expect(await seconds(page)).toBeGreaterThanOrEqual(9);
  await openMenu(page, "Restart puzzle");
  await page.getByRole("dialog").getByRole("button", { name: "Restart", exact: true }).click();
  await expect(page.getByRole("timer")).toHaveText("0:00");
});

test("fill notes uses only row, column and box constraints and is undoable", async ({ page }) => {
  await playString(page, PUZZLE);
  await page.getByRole("button", { name: "Fill notes", exact: true }).click();
  // A3 sees 3, 5, 7 in its row, 8 in its column and 6, 9 in its box.
  const notes = await cell(page, 2).locator("[data-notes]").textContent();
  expect(notes).toBe("124");
  expect(notes).toContain(SOLUTION[2]);
  await page.keyboard.press("Control+z");
  await expect(cell(page, 2).locator("[data-notes]")).toBeHidden();
});

test("note warnings, labels, seen cells and completed digits follow their settings", async ({ page }) => {
  await playString(page, PUZZLE);
  await cell(page, 2).click();
  await page.keyboard.press("Shift+Digit5");
  await expect(cell(page, 2).locator(".bad")).toHaveCount(0);
  await expect(cell(page, 20)).toHaveClass(/peer/);
  await openSettings(page);
  await page.getByRole("switch", { name: "Warn on conflicting notes" }).check();
  await page.getByRole("switch", { name: "Highlight seen cells" }).uncheck();
  await page.getByRole("switch", { name: "Row and column labels" }).check();
  await page.getByRole("switch", { name: "Invert keyboard layout" }).check();
  await page.goBack();
  await expect(cell(page, 2).locator(".bad")).toHaveText("5");
  await expect(cell(page, 20)).not.toHaveClass(/peer/);
  await expect(page.locator(".board-labels.rows")).toBeVisible();
  const one = (await page.getByRole("button", { name: "Number 1", exact: true }).boundingBox())!;
  const seven = (await page.getByRole("button", { name: "Number 7", exact: true }).boundingBox())!;
  expect(seven.y).toBeLessThan(one.y);
});

test("export game, copy puzzle and fullscreen are available from the game chrome", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await playString(page, PUZZLE);
  await cell(page, 2).click();
  await page.keyboard.press("4");
  await openMenu(page, "Copy puzzle");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(PUZZLE.replace(/0/g, "."));
  const download = page.waitForEvent("download");
  await openMenu(page, "Export game");
  const file = await (await download).createReadStream();
  const text = await new Promise<string>((resolve) => {
    let out = "";
    file.on("data", (chunk) => (out += chunk));
    file.on("end", () => resolve(out));
  });
  const game = JSON.parse(text);
  expect(game).toMatchObject({ format: "sudoku-engine-game", version: 1 });
  expect(game.cells[2].value).toBe(4);
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/focus-mode/);
  await expect(page.locator(".sidebar")).toBeHidden();
  await page.keyboard.press("F");
  await expect(page.locator("html")).not.toHaveClass(/focus-mode/);
});
