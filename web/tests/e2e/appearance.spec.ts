import { expect, test } from "@playwright/test";
import { cell, openLibrary, openSettings, playString, saved } from "./helpers";
import { PUZZLE } from "../fixtures";

test("all ten appearances apply across settings, board and dialogs and survive reload", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await playString(page, PUZZLE);
  const playUrl = page.url();
  await cell(page, 3).click();
  await page.keyboard.press("6");
  await cell(page, 2).click();
  for (let n = 1; n <= 9; n++) await page.keyboard.press(`Shift+Digit${n}`);
  await saved(page);
  const colors = new Set<string>();
  for (const mode of ["Light", "Dark"]) {
    for (const theme of ["Blue", "Green", "Pink", "Purple", "Gray"]) {
      await openSettings(page);
      await page.getByRole("radio", { name: mode, exact: true }).check();
      await page.getByRole("radio", { name: theme, exact: true }).check();
      await expect(
        page.getByRole("radio", { name: mode, exact: true }),
      ).toBeChecked();
      await expect(
        page.getByRole("radio", { name: theme, exact: true }),
      ).toBeChecked();
      await saved(page);
      await page.goto(playUrl);
      // Leaving the board clears the selection; select again to measure note contrast on it.
      await cell(page, 2).click();
      await expect(cell(page, 2)).toHaveAttribute("aria-selected", "true");
      await expect(page.locator("html")).toHaveAttribute(
        "data-mode",
        mode.toLowerCase(),
      );
      await expect(page.locator("html")).toHaveAttribute(
        "data-theme",
        theme.toLowerCase(),
      );
      await expect(cell(page, 2).locator("[data-notes]")).toHaveText(
        "123456789",
      );
      await expect(cell(page, 3).locator("[data-value]")).toHaveText("6");
      const appearance = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        return {
          background: root.backgroundColor,
          text: root.color,
          mode: root.colorScheme,
        };
      });
      expect(appearance.mode).toBe(mode.toLowerCase());
      expect(appearance.background).not.toBe(appearance.text);
      colors.add(appearance.background);
      const contrast = await page.evaluate(() => {
        // color-mix() results serialize as the modern color(srgb r g b / a)
        // syntax, with 0-1 channels, not legacy rgb()'s 0-255 — normalize both.
        const channels = (color: string): [number, number, number, number] => {
          const modern = color.startsWith("color(");
          const [r, g, b, a = 1] = color.match(/[\d.]+/g)!.map(Number);
          return modern ? [r * 255, g * 255, b * 255, a] : [r, g, b, a];
        };
        // Highlights such as the selection ring are intentionally translucent
        // (see .cell::before) so an annotation color underneath stays
        // visible; composite over the real backdrop before measuring, the
        // way the browser actually paints it, rather than reading its raw
        // (alpha-blind) color.
        const composite = (fg: string, bg: string) => {
          const [fr, fg_, fb, fa] = channels(fg),
            [br, bg_, bb] = channels(bg);
          if (fa >= 1) return fg;
          return `rgb(${fr * fa + br * (1 - fa)}, ${fg_ * fa + bg_ * (1 - fa)}, ${fb * fa + bb * (1 - fa)})`;
        };
        const luminance = (color: string) => {
          const rgb = channels(color)
            .slice(0, 3)
            .map((v) => {
              v /= 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            });
          return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
        };
        const ratio = (a: string, b: string) => {
          const x = luminance(a),
            y = luminance(b);
          return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
        };
        const style = (selector: string, pseudo?: string) =>
          getComputedStyle(document.querySelector(selector)!, pseudo);
        // Nothing between the cell and <html> paints its own background.
        const pageBackdrop = style("html").backgroundColor;
        const selectedBackdrop = composite(style('[data-cell-index="2"]', "::before").backgroundColor, pageBackdrop);
        return [
          ratio(style("html").color, style("html").backgroundColor),
          ratio(
            style(".save-area").color,
            style(".sidebar").backgroundColor,
          ),
          ratio(
            style('[data-cell-index="3"]').color,
            style("html").backgroundColor,
          ),
          ratio(style('[data-cell-index="2"] [data-notes]').color, selectedBackdrop),
        ];
      });
      expect(Math.min(...contrast)).toBeGreaterThanOrEqual(4.5);
      await page.mouse.move(0, 0);
      await page.screenshot({ path: info.outputPath(`${mode}-${theme}.png`) });
    }
  }
  expect(colors.size).toBe(10);
  await openSettings(page);
  await page.reload();
  await expect(
    page.getByRole("radio", { name: "Dark", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Gray", exact: true }),
  ).toBeChecked();
  await page.getByRole("radio", { name: "Gray", exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("radio", { name: "Purple", exact: true }),
  ).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("radio", { name: "Gray", exact: true }),
  ).toBeChecked();
  await page.screenshot({
    path: info.outputPath("dark-settings.png"),
    fullPage: true,
  });
  await openLibrary(page);
  await page.getByRole("button", { name: /^More actions for/ }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: info.outputPath("dark-dialog.png") });
});
