import { expect, test, type Page } from "@playwright/test";
import { cell, saved } from "./helpers";
import { categoryOf, expectStep, label, pack, probe, required, stored } from "./train-helpers";
import type { TrainingPosition } from "../../src/domain/training-pack";

// Train hub and statistics (spec §6 T4, D106). Math.random is pinned to 0, so a
// sprint shows the selected categories' positions in pack order.

/** Switches every category off except `keep`, from the hub. */
async function only(page: Page, keep: string) {
  // The checkboxes appear once the pack has loaded.
  await expect(page.getByRole("checkbox", { name: new RegExp(`^${label(keep)}`) })).toBeVisible();
  for (const box of await page.getByRole("checkbox").all()) {
    const name =
      (await box.getAttribute("aria-label")) ??
      (await box.evaluate((node) => {
        const text = node.parentElement?.textContent ?? null;
        if (text === null) throw new Error("A category checkbox has no label text.");
        return text;
      }));
    if (name.startsWith(label(keep))) await box.check();
    else await box.uncheck();
  }
}

/** Answers the positions in order, after each step's time on the installed clock. */
async function answerScript(
  page: Page,
  positions: readonly TrainingPosition[],
  script: readonly { ms: number; correct: boolean }[],
) {
  for (const [i, step] of script.entries()) {
    if (i) await page.getByRole("button", { name: "Next", exact: true }).click();
    const target = probe(positions[i]);
    await page.clock.runFor(step.ms);
    await cell(page, target.open).click();
    await page.keyboard.press(String(step.correct ? target.right : target.wrong));
    await expect(page.getByTestId("train-result")).toBeVisible();
  }
}

const fmt = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** The one statistics row: 4 attempts, 75 %, best and median of the correct times. */
async function expectStatsRow(page: Page, category: string, correct: readonly number[]) {
  const rows = page.getByTestId("train-stats").locator("tbody tr");
  await expect(rows).toHaveCount(1);
  const row = rows.first();
  await expect(row).toHaveAttribute("data-category", category);
  await expect(row.locator("th")).toHaveText(label(category));
  await expect(row.locator("td").nth(0)).toHaveText("4");
  await expect(row.locator("td").nth(1)).toHaveText("75%");
  await expect(row.locator("td").nth(2)).toHaveText(fmt(correct[0]));
  await expect(row.locator("td").nth(3)).toHaveText(fmt(correct[1]));
  // Best and median differ here (about 2 s and 3 s), so swapped columns would fail.
  expect(fmt(correct[0])).not.toBe(fmt(correct[1]));
}

test("the hub statistics match a scripted sequence of attempts", async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto("/#/train");
  // One category, four positions: correct, correct, miss, correct.
  const category = "scan";
  const positions = pack.positions
    .filter((position) => categoryOf(position) === category)
    .slice(0, 4);
  await only(page, category);
  await saved(page);
  await page.getByRole("button", { name: "Start sprint", exact: true }).click();
  // The clock starts with the position: wait for it, then stop real time from
  // flowing so each attempt lasts exactly its scripted time.
  await expect(page.getByRole("grid", { name: "Training position" })).toBeVisible();
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 50);
  const script = [
    { ms: 3_000, correct: true },
    { ms: 2_000, correct: true },
    { ms: 5_000, correct: false },
    { ms: 4_000, correct: true },
  ];
  await answerScript(page, positions, script);
  await saved(page);
  const recorded = (await stored(page)).training.attempts as { ms: number; position: string }[];
  expect(recorded.map((entry) => entry.position)).toEqual(positions.map((position) => position.id));
  // The paused clock moves only by the scripted time; the first attempt also
  // holds the real time between the position appearing and the pause. The
  // table must show these stored times.
  for (const [i, step] of script.entries()) {
    expect(recorded[i].ms).toBeGreaterThanOrEqual(step.ms - 50);
    expect(recorded[i].ms).toBeLessThan(step.ms + (i === 0 ? 2_000 : 300));
  }
  await page.getByRole("button", { name: "Back to Train", exact: true }).click();
  const overall = page.getByTestId("train-overall");
  const stat = (term: string) => overall.locator("div", { hasText: term }).locator("dd");
  await expect(stat("Current streak")).toHaveText("1");
  await expect(stat("Longest streak")).toHaveText("2");
  await expect(stat("Positions seen")).toHaveText("4");
  await expect(stat("Missed, waiting")).toHaveText("1");
  const correct = [0, 1, 3].map((i) => recorded[i].ms).sort((left, right) => left - right);
  await expectStatsRow(page, category, correct);
  // History, newest first; a past position reopens without a clock or a record.
  const items = page.getByTestId("train-history").locator("li");
  await expect(items).toHaveCount(4);
  await expect(items.locator(".result")).toHaveText(["Correct", "Missed", "Correct", "Correct"]);
  await items
    .nth(1)
    .getByRole("button", { name: /^Study: Missed, / })
    .click();
  await expect(page).toHaveURL(new RegExp(`#/train/study/${positions[2].id}$`));
  await expect(page.getByRole("grid", { name: "Study position" })).toBeVisible();
  await expect(page.getByRole("timer")).toHaveCount(0);
  await page.getByRole("button", { name: "Show the answer", exact: true }).click();
  await expectStep(page, positions[2]);
  await saved(page);
  expect((await stored(page)).training.attemptCount).toBe(4);
});

test("the category filter limits a sprint to the chosen categories", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto("/#/train");
  // The pack's first position decides an unfiltered sprint; switch its category off.
  const off = categoryOf(pack.positions[0]);
  const expected = required(
    pack.positions.find((position) => categoryOf(position) !== off),
    "position outside the first category",
  );
  await page.getByRole("checkbox", { name: new RegExp(`^${label(off)}`) }).uncheck();
  await saved(page);
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: new RegExp(`^${label(off)}`) }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Start sprint", exact: true }).click();
  await expect(page.getByRole("grid", { name: "Training position" })).toBeVisible();
  // Every cell matches the expected position (placed digits and, for a technique, notes).
  for (const [index, value] of [...expected.values].entries())
    if (value !== "0") await expect(cell(page, index).locator("[data-value]")).toHaveText(value);
  const first = [...pack.positions[0].values].findIndex((digit, i) => digit !== expected.values[i]);
  expect(first).toBeGreaterThanOrEqual(0);
  // With every category off, a sprint cannot start.
  await page.goto("/#/train");
  for (const box of await page.getByRole("checkbox").all()) await box.uncheck();
  await expect(page.getByRole("button", { name: "Start sprint", exact: true })).toBeDisabled();
});
