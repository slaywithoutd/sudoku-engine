import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { TrainingPack, TrainingPosition } from "../../src/domain/training-pack";

/**
 * Shared helpers for the Train specs (spec §6 T3–T5, D106). `Math.random` is
 * pinned to 0, so a sprint with every category on starts with the pack's first
 * position (sorted by id), and each next one is the first not yet shown.
 */
export const pack = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../src/assets/training-pack.json", import.meta.url)),
    "utf8",
  ),
) as TrainingPack;
export const first = pack.positions[0];

/** A value the spec's own fixtures guarantee; a missing one fails the test with `what`. */
export function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Missing ${what}.`);
  return value;
}

/** The first open cell of a position, its solution digit and a wrong digit. */
export function probe(position: TrainingPosition) {
  const open = [...position.values].findIndex((digit) => digit === "0");
  const right = Number(position.solution[open]);
  return { open, right, wrong: right === 9 ? 1 : right + 1 };
}
export async function stored(page: Page): Promise<any> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("sudoku-engine", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const get = request.result.transaction("library").objectStore("library").get("current");
          get.onsuccess = () => {
            request.result.close();
            resolve(get.result ?? null);
          };
        };
      }),
  );
}
export async function startSprint(page: Page) {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Train", exact: true }).first().click();
  await expect(page).toHaveURL(/#\/train$/);
  await page.getByRole("button", { name: "Start sprint", exact: true }).click();
  await expect(page).toHaveURL(/#\/train\/run$/);
  await expect(page.getByRole("grid", { name: "Training position" })).toBeVisible();
}
export const seconds = async (page: Page) => {
  const text = required(await page.getByRole("timer").textContent(), "timer text");
  const [minutes, secondsPart] = text.split(":").map(Number);
  return minutes * 60 + secondsPart;
};

export const label = (category: string) =>
  ({
    scan: "Scanning",
    "c04@1": "Naked and hidden subsets",
    "c05@1": "Locked subsets",
    "c06@1": "Fish",
    "c10@1": "Single-digit patterns",
    "c11@1": "Wings",
    "c13@1": "Remote pairs",
  })[category] ?? category;
export const categoryOf = (position: TrainingPosition) =>
  position.kind === "scan" ? "scan" : position.technique;

/**
 * The key step as drawn (T5): pattern cells as reasoning, every removed
 * candidate visible and struck through, every target without a removal drawn
 * as a placement (a target that also loses candidates keeps them visible).
 */
export async function expectStep(page: Page, position: TrainingPosition): Promise<void> {
  const cellAt = (index: number) => page.locator(`[data-cell-index="${index}"]`);
  for (const patternCell of position.cells)
    await expect(cellAt(patternCell)).toHaveClass(/\barea\b/);
  const removedCells = new Set(position.removed.map(([removedCell]) => removedCell));
  for (const [removedCell, digit] of position.removed) {
    const note = cellAt(removedCell).locator("[data-notes] .removed", { hasText: String(digit) });
    await expect(note).toBeVisible();
    expect(await note.evaluate((n) => getComputedStyle(n).textDecorationLine)).toBe("line-through");
  }
  for (const [target, digit] of position.targets)
    if (!removedCells.has(target))
      await expect(cellAt(target).locator("[data-value]")).toHaveText(String(digit));
}
