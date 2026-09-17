import { expect, test, type Page } from "@playwright/test";
import { PUZZLE } from "../fixtures";
import { playString } from "./helpers";

const nav = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name, exact: true });
const focusMode = (page: Page) => page.evaluate(() => document.documentElement.classList.contains("focus-mode"));
const boardWidth = async (page: Page) => (await page.locator(".board").boundingBox())!.width;

test("fullscreen is application-wide: it survives navigation and only the user turns it off", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await playString(page, PUZZLE);
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  expect(await focusMode(page)).toBe(true);
  for (const screen of ["Library", "Settings", "Solver", "Help", "Home"]) {
    await nav(page, screen).click();
    expect(await focusMode(page), `still fullscreen on ${screen}`).toBe(true);
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.getByRole("button", { name: "Exit fullscreen", exact: true })).toBeVisible();
  }
  // The shortcut is global too, not limited to board screens.
  await nav(page, "Library").click();
  await page.locator("body").click({ position: { x: 700, y: 850 } });
  await page.keyboard.press("F");
  expect(await focusMode(page)).toBe(false);
});

test("the sidebar collapses to a rail for more board space and restores without shrinking the board", async ({ page }) => {
  // Width-bound workspace, where the sidebar's width directly limits the board.
  await page.setViewportSize({ width: 1500, height: 1100 });
  await playString(page, PUZZLE);
  const expanded = await boardWidth(page);
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeVisible();
  await expect(nav(page, "Library")).toBeVisible();
  await expect.poll(() => boardWidth(page)).toBeGreaterThan(expanded + 40);
  await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
  await expect.poll(() => boardWidth(page)).toBeCloseTo(expanded, 0);

  // Fullscreen enters with the rail and restores the expanded sidebar on exit.
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Exit fullscreen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Collapse sidebar", exact: true })).toBeVisible();
});

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 2560, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 844, height: 390 },
  { width: 390, height: 844 },
];

test("one layout system fits the board, keypad and Multi-select at every proportion", async ({ page }) => {
  await playString(page, PUZZLE);
  // The browser window cannot be resized while truly fullscreen; the app's
  // fullscreen state (and the layout it drives) is what's under test here.
  await page.evaluate(() => {
    Element.prototype.requestFullscreen = async () => {};
  });
  for (const fullscreen of [false, true]) {
    if (fullscreen) await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
    for (const size of VIEWPORTS) {
      await page.setViewportSize(size);
      const label = `${size.width}x${size.height}${fullscreen ? " fullscreen" : ""}`;
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), label).toBe(true);
      const main = (await page.locator("main").boundingBox())!;
      const board = (await page.locator(".board").boundingBox())!;
      const keypad = (await page.locator(".keypad-panel").boundingBox())!;
      // Nothing clipped horizontally, and the board keeps a substantial share.
      for (const box of [board, keypad]) {
        expect(box.x, label).toBeGreaterThanOrEqual(main.x);
        expect(box.x + box.width, label).toBeLessThanOrEqual(main.x + main.width + 0.5);
      }
      expect(board.width, label).toBeGreaterThanOrEqual(Math.min(main.width, main.height) * 0.5);
      // The board itself is always fully in view without scrolling.
      expect(board.y + board.height, label).toBeLessThanOrEqual(size.height);
      const multi = page.getByRole("button", { name: /^Multi-select mode/ });
      await multi.scrollIntoViewIfNeeded();
      await expect(multi, label).toBeInViewport({ ratio: 1 });
    }
  }
});
