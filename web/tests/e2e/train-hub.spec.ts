import { expect, test, type Page } from "@playwright/test";
import { cell, saved } from "./helpers";
import { categoryOf, label, pack, probe, stored } from "./train-helpers";

// Train hub and statistics (spec §6 T4, D106). Math.random is pinned to 0, so a
// sprint shows the selected categories' positions in pack order.

/** Switches every category off except `keep`, from the hub. */
async function only(page: Page, keep: string) {
  // The checkboxes appear once the pack has loaded.
  await expect(page.getByRole("checkbox", { name: new RegExp(`^${label(keep)}`) })).toBeVisible();
  for (const box of await page.getByRole("checkbox").all()) {
    const name =
      (await box.getAttribute("aria-label")) ??
      (await box.evaluate((n) => n.parentElement!.textContent!));
    if (name.startsWith(label(keep))) await box.check();
    else await box.uncheck();
  }
}

test("the hub statistics match a scripted sequence of attempts", async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto("/#/train");
  // One category, four positions: correct, correct, miss, correct.
  const category = "scan";
  const positions = pack.positions.filter((p) => categoryOf(p) === category).slice(0, 4);
  await only(page, category);
  await saved(page);
  await page.getByRole("button", { name: "Start sprint", exact: true }).click();
  const script = [
    { ms: 3_000, correct: true },
    { ms: 2_000, correct: true },
    { ms: 5_000, correct: false },
    { ms: 4_000, correct: true },
  ];
  for (const [i, step] of script.entries()) {
    if (i) await page.getByRole("button", { name: "Next", exact: true }).click();
    const target = probe(positions[i]);
    await page.clock.runFor(step.ms);
    await cell(page, target.open).click();
    await page.keyboard.press(String(step.correct ? target.right : target.wrong));
    await expect(page.getByTestId("train-result")).toBeVisible();
  }
  await saved(page);
  const recorded = (await stored(page)).training.attempts as { ms: number; position: string }[];
  expect(recorded.map((a) => a.position)).toEqual(positions.map((p) => p.id));
  // The installed clock keeps flowing between steps: each time is the scripted
  // duration plus a little real time, and the table must show the stored times.
  for (const [i, step] of script.entries()) {
    expect(recorded[i].ms).toBeGreaterThanOrEqual(step.ms - 50);
    expect(recorded[i].ms).toBeLessThan(step.ms + 1_000);
  }
  await page.getByRole("button", { name: "Back to Train", exact: true }).click();
  const overall = page.getByTestId("train-overall");
  const stat = (term: string) => overall.locator("div", { hasText: term }).locator("dd");
  await expect(stat("Current streak")).toHaveText("1");
  await expect(stat("Longest streak")).toHaveText("2");
  await expect(stat("Positions seen")).toHaveText("4");
  await expect(stat("Missed, waiting")).toHaveText("1");
  const fmt = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  const correct = [0, 1, 3].map((i) => recorded[i].ms).sort((a, b) => a - b);
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
  for (const [target, digit] of positions[2].targets)
    await expect(cell(page, target).locator("[data-value]")).toHaveText(String(digit));
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
  const expected = pack.positions.find((p) => categoryOf(p) !== off)!;
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
  const first = [...pack.positions[0].values].findIndex((v, i) => v !== expected.values[i]);
  expect(first).toBeGreaterThanOrEqual(0);
  // With every category off, a sprint cannot start.
  await page.goto("/#/train");
  for (const box of await page.getByRole("checkbox").all()) await box.uncheck();
  await expect(page.getByRole("button", { name: "Start sprint", exact: true })).toBeDisabled();
});
