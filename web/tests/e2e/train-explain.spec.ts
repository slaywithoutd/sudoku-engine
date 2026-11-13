import { expect, test } from "@playwright/test";
import { cell, saved } from "./helpers";
import { pack } from "./train-helpers";

// The key step after the answer, in both colour modes (spec §6 T5, D106).
for (const mode of ["light", "dark"] as const)
  test(`after the answer the key step is explained (${mode} mode)`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => {
      Math.random = () => 0;
    });
    await page.goto("/#/settings");
    await page
      .getByRole("radio", { name: mode === "light" ? "Light" : "Dark", exact: true })
      .check();
    await saved(page);
    await page.goto("/#/train");
    await page.getByRole("checkbox", { name: /^Scanning/ }).uncheck();
    await saved(page);
    await page.getByRole("button", { name: "Start sprint", exact: true }).click();
    const technique = pack.positions.find((p) => p.kind === "technique")!;
    const [targetCell, targetDigit] = technique.targets[0];
    await cell(page, targetCell).click();
    await page.keyboard.press(String(targetDigit));
    const explanation = page.getByTestId("train-explanation");
    await expect(explanation).toBeVisible();
    await expect(explanation.getByRole("heading")).toHaveText(/^Found with /);
    await expect(explanation).not.toContainText("requires");
    // Pattern cells are drawn as reasoning; each removed candidate is struck through.
    for (const patternCell of technique.cells)
      await expect(cell(page, patternCell)).toHaveClass(/\barea\b/);
    for (const [removedCell, digit] of technique.removed) {
      const note = cell(page, removedCell).locator("[data-notes] .removed", {
        hasText: String(digit),
      });
      await expect(note).toBeVisible();
      expect(await note.evaluate((n) => getComputedStyle(n).textDecorationLine)).toBe(
        "line-through",
      );
    }
    await expect(page.locator("html")).toHaveAttribute("data-mode", mode);
    const contrast = await explanation.evaluate((node) => {
      const parse = (c: string) =>
        c
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number);
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      let bg = "rgba(0, 0, 0, 0)",
        at: Element | null = node;
      while (at && /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) {
        bg = getComputedStyle(at).backgroundColor;
        at = at.parentElement;
      }
      const a = lum(parse(getComputedStyle(node).color)),
        b = lum(parse(bg));
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: info.outputPath(`train-explanation-${mode}.png`) });
  });

test("a miss and a studied position show the same key step", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto("/#/train");
  await page.getByRole("button", { name: "Start sprint", exact: true }).click();
  const position = pack.positions[0];
  const [targetCell, targetDigit] = position.targets[0];
  await cell(page, targetCell).click();
  await page.keyboard.press(String((targetDigit % 9) + 1));
  const explanation = page.getByTestId("train-explanation");
  await expect(explanation.getByRole("heading")).toHaveText(/^Found with /);
  const text = await explanation.locator("p").first().textContent();
  await saved(page);
  await page.goto(`/#/train/study/${position.id}`);
  await page.getByRole("button", { name: "Show the answer", exact: true }).click();
  await expect(page.getByTestId("train-explanation").locator("p").first()).toHaveText(text!);
  for (const patternCell of position.cells)
    await expect(cell(page, patternCell)).toHaveClass(/\barea\b/);
});
