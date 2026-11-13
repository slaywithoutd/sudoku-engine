import { expect, test } from "@playwright/test";
import { cell, saved } from "./helpers";
import { categoryOf, label, pack, probe, startSprint, stored } from "./train-helpers";

// Train hub and statistics (spec §6 T4, D106).
test("the hub statistics match a scripted sequence of attempts", async ({ page }) => {
  await page.clock.install();
  await startSprint(page);
  // Correct in 3 s, missed in 5 s, correct in 2 s.
  const script = [
    { position: pack.positions[0], ms: 3_000, correct: true },
    { position: pack.positions[1], ms: 5_000, correct: false },
    { position: pack.positions[2], ms: 2_000, correct: true },
  ];
  for (const [i, step] of script.entries()) {
    if (i) await page.getByRole("button", { name: "Next", exact: true }).click();
    const target = probe(step.position);
    await page.clock.runFor(step.ms);
    await cell(page, target.open).click();
    await page.keyboard.press(String(step.correct ? target.right : target.wrong));
    await expect(page.getByTestId("train-result")).toBeVisible();
  }
  await saved(page);
  await page.getByRole("button", { name: "Back to Train", exact: true }).click();
  const overall = page.getByTestId("train-overall");
  await expect(overall.locator("div", { hasText: "Current streak" }).locator("dd")).toHaveText("1");
  await expect(overall.locator("div", { hasText: "Longest streak" }).locator("dd")).toHaveText("1");
  await expect(overall.locator("div", { hasText: "Positions seen" }).locator("dd")).toHaveText("3");
  await expect(overall.locator("div", { hasText: "Missed, waiting" }).locator("dd")).toHaveText(
    "1",
  );
  // Per category: attempts, accuracy, best and median, from the same script. The
  // installed clock keeps flowing between steps, so each recorded time is the
  // scripted duration plus a little real time; the table must show those times.
  const recorded = (await stored(page)).training.attempts as { ms: number }[];
  expect(recorded).toHaveLength(3);
  const groups = new Map<string, { ms: number; correct: boolean }[]>();
  for (const [i, step] of script.entries()) {
    expect(recorded[i].ms).toBeGreaterThanOrEqual(step.ms - 50);
    expect(recorded[i].ms).toBeLessThan(step.ms + 3_000);
    const key = categoryOf(step.position);
    groups.set(key, [...(groups.get(key) ?? []), { ms: recorded[i].ms, correct: step.correct }]);
  }
  const table = page.getByTestId("train-stats");
  for (const [category, steps] of groups) {
    const times = steps
      .filter((s) => s.correct)
      .map((s) => s.ms)
      .sort((a, b) => a - b);
    const median = times.length
      ? times.length % 2
        ? times[(times.length - 1) / 2]
        : (times[times.length / 2 - 1] + times[times.length / 2]) / 2
      : null;
    const row = table.locator(`tr[data-category="${category}"]`);
    const fmt = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`);
    await expect(row.locator("th")).toHaveText(label(category));
    await expect(row.locator("td").nth(0)).toHaveText(String(steps.length));
    await expect(row.locator("td").nth(1)).toHaveText(
      `${Math.round((100 * times.length) / steps.length)}%`,
    );
    await expect(row.locator("td").nth(2)).toHaveText(fmt(times[0] ?? null));
    await expect(row.locator("td").nth(3)).toHaveText(fmt(median));
  }
  // History, newest first; a past position reopens without a clock or a record.
  const items = page.getByTestId("train-history").locator("li");
  await expect(items).toHaveCount(3);
  await expect(items.nth(0).locator(".result")).toHaveText("Correct");
  await expect(items.nth(1).locator(".result")).toHaveText("Missed");
  await items.nth(1).getByRole("button", { name: "Study", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/train/study/${pack.positions[1].id}$`));
  await expect(page.getByRole("grid", { name: "Study position" })).toBeVisible();
  await expect(page.getByRole("timer")).toHaveCount(0);
  await page.getByRole("button", { name: "Show the answer", exact: true }).click();
  for (const [target, digit] of pack.positions[1].targets)
    await expect(cell(page, target).locator("[data-value]")).toHaveText(String(digit));
  await saved(page);
  expect((await stored(page)).training.attemptCount).toBe(3);
});

test("the category filter limits a sprint to the chosen categories", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto("/#/train");
  const technique = pack.positions.find((p) => p.kind === "technique")!;
  await page.getByRole("checkbox", { name: /^Scanning/ }).uncheck();
  await saved(page);
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /^Scanning/ })).not.toBeChecked();
  await page.getByRole("button", { name: "Start sprint", exact: true }).click();
  // The first technique position by id; its candidates are shown as notes.
  const open = probe(technique).open;
  const mask = technique.candidates![open];
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => mask & (1 << (d - 1))).join("");
  await expect(cell(page, open).locator("[data-notes]")).toHaveText(digits);
});
