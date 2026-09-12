import { expect, test } from "@playwright/test";
import { PUZZLE } from "../fixtures";
import { cell, playString } from "./helpers";
for (const [width, height] of [
  [1280, 800],
  [1920, 1080],
])
  test(`desktop visual acceptance ${width}x${height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Resolver — em breve", exact: true }),
    ).toBeDisabled();
    await page.screenshot({
      path: info.outputPath("home.png"),
      fullPage: true,
    });
    await playString(page, PUZZLE);
    await cell(page, 2).click();
    for (let n = 1; n <= 9; n++) await page.keyboard.press(`Shift+Digit${n}`);
    await expect(cell(page, 2).locator("[data-notes]")).toHaveText("123456789");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const bounds = await page.locator(".board-panel").boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
    await page.screenshot({
      path: info.outputPath("player.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
    await page
      .getByRole("button", { name: "Editar cópia", exact: true })
      .click();
    await cell(page, 2).click();
    await page.keyboard.press("5");
    await expect(cell(page, 2)).toHaveClass(/conflict/);
    const creatorBounds = await page.locator('.board-panel').boundingBox();
    expect(creatorBounds!.y + creatorBounds!.height).toBeLessThanOrEqual(height);
    await page.screenshot({
      path: info.outputPath("creator-conflicts.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Configurações", exact: true })
      .click();
    await page.screenshot({
      path: info.outputPath("settings.png"),
      fullPage: true,
    });
  });
