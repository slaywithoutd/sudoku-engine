import { expect, test, type Page } from "@playwright/test";
import { cell, saved } from "./helpers";
import { pack, probe, stored } from "./train-helpers";

// Timed run (spec §4.2, §6 T6, D106): three minutes of active time or three
// misses, recorded once. Math.random is pinned to 0, so positions come in
// pack order.

async function startTimed(page: Page) {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto("/#/train");
  await page.getByRole("button", { name: "Timed run", exact: true }).click();
  await expect(page).toHaveURL(/#\/train\/timed$/);
  await expect(page.getByRole("grid", { name: "Training position" })).toBeVisible();
}
async function answer(page: Page, index: number, correct: boolean) {
  const target = probe(pack.positions[index]);
  await cell(page, target.open).click();
  await page.keyboard.press(String(correct ? target.right : target.wrong));
}
const runs = async (page: Page) => (await stored(page))?.training?.runs;

test("the third miss ends the run and records it once", async ({ page }) => {
  await startTimed(page);
  await expect(page.getByRole("timer", { name: "Time left" })).toHaveText(/^(3:00|2:5\d)$/);
  await answer(page, 0, true);
  await expect(page.getByTestId("train-score")).toHaveText("Solved 1 · Misses 0/3");
  for (const index of [1, 2]) {
    await answer(page, index, false);
    await expect(page.getByTestId("train-flash")).toContainText("Missed:");
  }
  await expect(page.getByTestId("train-score")).toHaveText("Solved 1 · Misses 2/3");
  await expect(page.getByTestId("train-run-summary")).toBeHidden();
  await answer(page, 3, false);
  const summary = page.getByTestId("train-run-summary");
  await expect(summary.getByRole("heading")).toHaveText("Three misses");
  await expect(summary).toContainText("Solved 1 · Misses 3");
  await expect(summary).toContainText("Best run: 1 solved");
  // Further digits do nothing; the run is recorded exactly once.
  await page.keyboard.press("5");
  await saved(page);
  const recorded = await runs(page);
  expect(recorded.count).toBe(1);
  expect(recorded.best).toBe(1);
  expect(recorded.recent).toHaveLength(1);
  expect(recorded.recent[0]).toMatchObject({ solved: 1, misses: 3 });
  expect(recorded.recent[0].ms).toBeLessThan(180_000);
  // Every answer is also an ordinary attempt.
  expect((await stored(page)).training.attemptCount).toBe(4);
  await page.getByRole("button", { name: "Back to Train", exact: true }).click();
  await expect(
    page.getByTestId("train-overall").locator("div", { hasText: "Best timed run" }).locator("dd"),
  ).toHaveText("1");
  await saved(page);
  expect((await runs(page)).count).toBe(1);
});

test("the run ends at three minutes of active time; a run left early is not recorded", async ({
  page,
}) => {
  await page.clock.install();
  await startTimed(page);
  await answer(page, 0, true);
  await answer(page, 1, true);
  await page.clock.runFor(60_000);
  // A pause does not count toward the three minutes.
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator(".pause-cover")).toBeVisible();
  await page.clock.runFor(300_000);
  await expect(page.getByTestId("train-run-summary")).toBeHidden();
  await page.getByRole("button", { name: "Resume", exact: true }).first().click();
  // About 179 s of active time: still running; past 180 s: over.
  await page.clock.runFor(115_000);
  await expect(page.getByTestId("train-run-summary")).toBeHidden();
  await expect(page.getByRole("timer", { name: "Time left" })).toHaveText(/^0:0\d$/);
  await page.clock.runFor(10_000);
  const summary = page.getByTestId("train-run-summary");
  await expect(summary.getByRole("heading")).toHaveText("Time is up");
  await expect(summary).toContainText("Solved 2 · Misses 0");
  await page.clock.runFor(30_000);
  await saved(page);
  let recorded = await runs(page);
  expect(recorded.count).toBe(1);
  expect(recorded.recent[0]).toMatchObject({ solved: 2, misses: 0, ms: 180_000 });
  // A second run, abandoned after one answer: its attempt counts, the run does not.
  await page.getByRole("button", { name: "Run again", exact: true }).click();
  await expect(page.getByTestId("train-score")).toHaveText("Solved 0 · Misses 0/3");
  await answer(page, 0, true);
  await page.goto("/#/train");
  await saved(page);
  recorded = await runs(page);
  expect(recorded.count).toBe(1);
  expect((await stored(page)).training.attemptCount).toBe(3);
});

test("after an answer the next position starts with nothing selected", async ({ page }) => {
  await startTimed(page);
  await answer(page, 0, true);
  await expect(page.locator('[aria-selected="true"]')).toHaveCount(0);
  // Clicking any cell of the new position selects it, even the one answered before.
  await cell(page, probe(pack.positions[0]).open).click();
  await expect(page.locator('[aria-selected="true"]')).toHaveCount(1);
});

test("with every category off a timed run records nothing", async ({ page }) => {
  await page.goto("/#/train");
  await expect(page.getByRole("checkbox").first()).toBeVisible();
  for (const box of await page.getByRole("checkbox").all()) await box.uncheck();
  await expect(page.getByRole("button", { name: "Timed run", exact: true })).toBeDisabled();
  await saved(page);
  await page.goto("/#/train/timed");
  const summary = page.getByTestId("train-run-summary");
  await expect(summary.getByRole("heading")).toHaveText("No category selected");
  await page.getByRole("button", { name: "Run again", exact: true }).click();
  await saved(page);
  expect((await runs(page)).count).toBe(0);
});

test("a version 4 library saved before timed runs still loads", async ({ page }) => {
  // Store a library once (a setting change commits it), then drop its runs.
  await page.goto("/#/train");
  const box = page.getByRole("checkbox").first();
  await box.uncheck();
  await box.check();
  await saved(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("sudoku-engine", 1);
        request.onsuccess = () => {
          const store = request.result.transaction("library", "readwrite").objectStore("library");
          const get = store.get("current");
          get.onsuccess = () => {
            const data = get.result;
            delete data.training.runs;
            const put = store.put(data, "current");
            put.onsuccess = () => {
              request.result.close();
              resolve();
            };
            put.onerror = () => reject(put.error);
          };
        };
      }),
  );
  await page.reload();
  await page.goto("/#/train");
  await expect(
    page.getByTestId("train-overall").locator("div", { hasText: "Best timed run" }).locator("dd"),
  ).toHaveText("0");
});
