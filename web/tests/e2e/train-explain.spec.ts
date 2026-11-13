import { expect, test, type Page } from "@playwright/test";
import { cell, saved } from "./helpers";
import { categoryOf, expectStep, label, pack } from "./train-helpers";
import type { TrainingPosition } from "../../src/domain/training-pack";

// The key step after the answer, in both colour modes (spec §6 T5, D106).
// Math.random is pinned to 0: a sprint over one category starts with that
// category's first position in pack order.

const collides = (p: TrainingPosition) => p.removed.some(([c]) => p.targets.some(([t]) => t === c));
const categories = [...new Set(pack.positions.map(categoryOf))];
const firstOf = (category: string) => pack.positions.find((p) => categoryOf(p) === category)!;
/** A technique category whose first position removes candidates from a cell it then fills. */
const hard = categories.find((c) => c !== "scan" && collides(firstOf(c)))!;

async function sprintOver(page: Page, category: string) {
  await page.goto("/#/train");
  await expect(
    page.getByRole("checkbox", { name: new RegExp(`^${label(category)}`) }),
  ).toBeVisible();
  for (const other of categories)
    if (other !== category)
      await page.getByRole("checkbox", { name: new RegExp(`^${label(other)}`) }).uncheck();
  await saved(page);
  await page.getByRole("button", { name: "Start sprint", exact: true }).click();
}

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
    expect(hard).toBeDefined();
    await sprintOver(page, hard);
    const position = firstOf(hard);
    // Answer in the target cell that also loses candidates: its removals must stay visible.
    const [targetCell, targetDigit] = position.targets.find(([t]) =>
      position.removed.some(([c]) => c === t),
    )!;
    await cell(page, targetCell).click();
    await page.keyboard.press(String(targetDigit));
    const explanation = page.getByTestId("train-explanation");
    await expect(explanation).toBeVisible();
    // The engine's name; C04 is named naked or hidden from where its removals fall.
    await expect(explanation.getByRole("heading")).toHaveText(
      position.technique === "c04@1"
        ? /^Found with (Naked|Hidden) (Pair|Triple|Quad)$/
        : `Found with ${position.name}`,
    );
    await expect(explanation).not.toContainText("requires");
    await expectStep(page, position);
    await expect(cell(page, targetCell)).toHaveClass(/\bcorrect\b/);
    await expect(page.locator("html")).toHaveAttribute("data-mode", mode);
    // Text, legend and struck-candidate contrast against the panel or cell background.
    const ratio = (selector: string, within: "panel" | "cell") =>
      (within === "panel" ? explanation : cell(page, position.removed[0][0])).evaluate(
        (root, sel) => {
          const node = (sel ? root.querySelector(sel) : root) as HTMLElement;
          const probe = document.createElement("canvas").getContext("2d")!;
          const rgb = (c: string) => {
            probe.fillStyle = "#000";
            probe.fillStyle = c;
            probe.fillRect(0, 0, 1, 1);
            return [...probe.getImageData(0, 0, 1, 1).data].slice(0, 3);
          };
          const lum = ([r, g, b]: number[]) => {
            const f = (v: number) => {
              const s = v / 255;
              return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            };
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
          };
          let at: Element | null = node,
            bg = "rgba(0, 0, 0, 0)";
          while (at && /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) {
            bg = getComputedStyle(at).backgroundColor;
            at = at.parentElement;
          }
          const a = lum(rgb(getComputedStyle(node).color)),
            b = lum(rgb(bg));
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        },
        selector,
      );
    expect(await ratio("", "panel")).toBeGreaterThanOrEqual(4.5);
    expect(await ratio(".legend-item span", "panel")).toBeGreaterThanOrEqual(4.5);
    expect(await ratio("[data-notes] .removed", "cell")).toBeGreaterThanOrEqual(3);
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
  await expectStep(page, position);
  // Screen readers hear the step with the result.
  await expect(page.getByRole("status").filter({ hasText: text! })).toHaveCount(1);
  await saved(page);
  await page.goto(`/#/train/study/${position.id}`);
  await page.getByRole("button", { name: "Show the answer", exact: true }).click();
  await expect(page.getByTestId("train-explanation").locator("p").first()).toHaveText(text!);
  await expect(
    page.getByTestId("train-explanation").getByRole("heading", { level: 2 }),
  ).toBeVisible();
  await expectStep(page, position);
});

test("removals in a target cell stay visible in the study view", async ({ page }) => {
  const colliding = pack.positions.filter(collides).slice(0, 4);
  expect(colliding).toHaveLength(4);
  for (const position of colliding) {
    await page.goto(`/#/train/study/${position.id}`);
    await page.getByRole("button", { name: "Show the answer", exact: true }).click();
    await expect(page.getByTestId("train-explanation")).toBeVisible();
    await expectStep(page, position);
  }
});
