import { expect, test, type Locator, type Page } from "@playwright/test";
import { cell, saved } from "./helpers";
import { categoryOf, expectStep, label, pack, required } from "./train-helpers";
import type { TrainingPosition } from "../../src/domain/training-pack";

// The key step after the answer, in both colour modes (spec §6 T5, D106).
// Math.random is pinned to 0: a sprint over one category starts with that
// category's first position in pack order.

const collides = (position: TrainingPosition) =>
  position.removed.some(([removedCell]) =>
    position.targets.some(([target]) => target === removedCell),
  );
const categories = [...new Set(pack.positions.map(categoryOf))];
const firstOf = (category: string) =>
  required(
    pack.positions.find((position) => categoryOf(position) === category),
    `position of ${category}`,
  );
/** A technique category whose first position removes candidates from a cell it then fills. */
const hard = categories.find((category) => category !== "scan" && collides(firstOf(category)));

/**
 * The contrast ratio of the text of `selector` under `root` (the root itself
 * for "") against the first opaque background at or above it.
 */
function contrast(root: Locator, selector: string): Promise<number> {
  return root.evaluate((within, sel) => {
    const node = (sel ? within.querySelector(sel) : within) as HTMLElement;
    const probe = document.createElement("canvas").getContext("2d");
    if (!probe) throw new Error("No 2D canvas context.");
    const rgb = (color: string) => {
      probe.fillStyle = "#000";
      probe.fillStyle = color;
      probe.fillRect(0, 0, 1, 1);
      return [...probe.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const lum = ([red, green, blue]: number[]) => {
      const channel = (value: number) => {
        const srgb = value / 255;
        return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
    };
    let at: Element | null = node,
      bg = "rgba(0, 0, 0, 0)";
    while (at && /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) {
      bg = getComputedStyle(at).backgroundColor;
      at = at.parentElement;
    }
    const text = lum(rgb(getComputedStyle(node).color)),
      background = lum(rgb(bg));
    return (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05);
  }, selector);
}

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
    const category = required(hard, "colliding technique category");
    await sprintOver(page, category);
    const position = firstOf(category);
    // Answer in the target cell that also loses candidates: its removals must stay visible.
    const [targetCell, targetDigit] = required(
      position.targets.find(([target]) =>
        position.removed.some(([removedCell]) => removedCell === target),
      ),
      "target cell with removals",
    );
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
    const struck = cell(page, position.removed[0][0]);
    expect(await contrast(explanation, "")).toBeGreaterThanOrEqual(4.5);
    expect(await contrast(explanation, ".legend-item span")).toBeGreaterThanOrEqual(4.5);
    expect(await contrast(struck, "[data-notes] .removed")).toBeGreaterThanOrEqual(3);
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
  const text = required(await explanation.locator("p").first().textContent(), "step text");
  await expectStep(page, position);
  // Screen readers hear the step with the result.
  await expect(page.getByRole("status").filter({ hasText: text })).toHaveCount(1);
  await saved(page);
  await page.goto(`/#/train/study/${position.id}`);
  await page.getByRole("button", { name: "Show the answer", exact: true }).click();
  await expect(page.getByTestId("train-explanation").locator("p").first()).toHaveText(text);
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
