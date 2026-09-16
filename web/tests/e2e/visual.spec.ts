import { expect, test } from "@playwright/test";
import { PUZZLE } from "../fixtures";
import { cell, openLibrary, openSettings, playString } from "./helpers";
for (const [width, height] of [
  [1280, 800],
  [1920, 1080],
])
  test(`desktop visual acceptance ${width}x${height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page).toHaveTitle("Sudoku Engine");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const navigation = await page
      .getByRole("navigation", { name: "Main navigation" })
      .boundingBox();
    expect(navigation!.x).toBeLessThan(200);
    await expect(
      page.getByRole("button", { name: "Sudoku Engine", exact: true }),
    ).toBeVisible();
    // Play, Create and Solve share equal dimensions on the home screen.
    const cards = await page.locator(".home-card").evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return [Math.round(r.width), Math.round(r.height)].join("x");
      }),
    );
    expect(cards).toHaveLength(3);
    expect(new Set(cards).size).toBe(1);
    await expect(page.getByText("Saved in this browser")).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath("home.png"),
      fullPage: true,
    });
    await playString(page, PUZZLE);
    await cell(page, 2).click();
    for (let n = 1; n <= 9; n++) await page.keyboard.press(`Shift+Digit${n}`);
    await expect(cell(page, 2).locator("[data-notes]")).toHaveText("123456789");
    await page.getByRole("button", { name: "Number 6", exact: true }).click();
    await expect(cell(page, 2).locator("[data-value]")).toHaveText("6");
    await page.getByRole("button", { name: "Number 6", exact: true }).click();
    await expect(cell(page, 2).locator("[data-value]")).toBeEmpty();
    await expect(cell(page, 2).locator("[data-notes]")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const bounds = await page.locator(".board").boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
    const grid = await page.getByRole("grid").boundingBox();
    // The board keeps nearly all height below the compact top bar.
    expect(grid!.height).toBeGreaterThan(height * 0.8);
    expect(Math.abs(grid!.width - grid!.height)).toBeLessThan(1);
    const numbers = await page
      .getByRole("button", { name: "Number 1", exact: true })
      .boundingBox();
    expect(numbers!.x).toBeGreaterThanOrEqual(grid!.x + grid!.width);
    await page
      .getByRole("button", { name: "Number 5", exact: true })
      .click({ modifiers: ["Shift"] });
    await expect(cell(page, 2).locator("[data-notes]")).toHaveText("12346789");
    await page
      .getByRole("button", { name: "Number 5", exact: true })
      .click({ modifiers: ["Shift"] });
    expect(
      await page
        .getByRole("grid")
        .evaluate((e) => getComputedStyle(e).borderWidth),
    ).toBe("0px");
    await page.getByRole("button", { name: "Number 1", exact: true }).focus();
    await page.keyboard.press("6");
    await expect(cell(page, 2).locator("[data-value]")).toHaveText("6");
    await page.getByRole("button", { name: "Undo", exact: true }).focus();
    await page.keyboard.press("Control+z");
    await expect(cell(page, 2).locator("[data-value]")).toBeEmpty();
    await expect(cell(page, 2).locator("[data-notes]")).toHaveText("123456789");
    await page.screenshot({
      path: info.outputPath("player.png"),
      fullPage: true,
    });
    await openLibrary(page);
    await page.getByRole("button", { name: /^More actions for/ }).click();
    await page.getByRole("menuitem", { name: "Edit a copy" }).click();
    await cell(page, 2).click();
    await page.keyboard.press("5");
    await expect(cell(page, 2)).toHaveClass(/conflict/);
    const creatorBounds = await page.locator(".board").boundingBox();
    expect(creatorBounds!.y + creatorBounds!.height).toBeLessThanOrEqual(
      height,
    );
    await page.screenshot({
      path: info.outputPath("creator-conflicts.png"),
      fullPage: true,
    });
    await openSettings(page);
    await page.screenshot({
      path: info.outputPath("settings.png"),
      fullPage: true,
    });
  });
