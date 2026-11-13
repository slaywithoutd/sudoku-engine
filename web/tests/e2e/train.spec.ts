import { expect, test } from "@playwright/test";
import { cell, saved } from "./helpers";
import { expectStep, first, pack, probe, seconds, startSprint, stored } from "./train-helpers";

// Train run screen (spec §6 T3, D106).
test("a correct digit raises the streak and records the time", async ({ page }) => {
  await page.clock.install();
  await startSprint(page);
  const { open, right } = probe(first);
  await page.clock.runFor(4_000);
  await cell(page, open).click();
  await page.keyboard.press(String(right));
  const result = page.getByTestId("train-result");
  await expect(result).toBeVisible();
  await expect(result.getByRole("heading", { level: 2 })).toHaveText("Correct");
  await expect(page.getByTestId("train-streak")).toHaveText("Streak 1");
  await saved(page);
  const data = await stored(page);
  expect(data.training).toMatchObject({ attemptCount: 1, streak: 1, longestStreak: 1 });
  expect(data.training.attempts).toHaveLength(1);
  expect(data.training.attempts[0]).toMatchObject({
    position: first.id,
    result: "correct",
    cell: open,
    digit: right,
  });
  expect(data.training.attempts[0].ms).toBeGreaterThanOrEqual(3_500);
  expect(data.training.positions[first.id].bestMs).toBe(data.training.attempts[0].ms);
});

test("a wrong digit ends the attempt, resets the streak and shows the intended placement", async ({
  page,
}) => {
  await startSprint(page);
  const { open, right } = probe(first);
  await cell(page, open).click();
  await page.keyboard.press(String(right));
  await expect(page.getByTestId("train-streak")).toHaveText("Streak 1");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  const second = pack.positions[1];
  const miss = probe(second);
  await cell(page, miss.open).click();
  await page.keyboard.press(String(miss.wrong));
  const result = page.getByTestId("train-result");
  await expect(result.getByRole("heading", { level: 2 })).toHaveText("Not this time");
  await expect(page.getByTestId("train-streak")).toHaveText("Streak 0");
  await expect(result.locator(".train-intended")).toContainText("Intended placement:");
  // The key step is drawn: targets as placements, removed candidates struck through.
  await expectStep(page, second);
  // Further digits are ignored once the attempt has ended.
  await page.keyboard.press(String(miss.right));
  await saved(page);
  const data = await stored(page);
  expect(data.training).toMatchObject({ attemptCount: 2, streak: 0, longestStreak: 1 });
  expect(data.training.attempts[1]).toMatchObject({
    position: second.id,
    result: "miss",
    digit: miss.wrong,
  });
  expect(data.training.missed).toEqual([{ position: second.id, due: 12 }]);
});

test("losing focus covers the board and stops the clock", async ({ page }) => {
  await page.clock.install();
  await startSprint(page);
  const { open, right } = probe(first);
  await cell(page, open).click();
  await page.clock.runFor(5_000);
  const before = await seconds(page);
  expect(before).toBeGreaterThanOrEqual(4);
  await page.evaluate(() => {
    document.hasFocus = () => false;
    window.dispatchEvent(new Event("blur"));
  });
  await expect(page.locator(".pause-cover")).toBeVisible();
  await page.clock.runFor(60_000);
  // A digit while covered does nothing, even with a cell selected.
  await page.keyboard.press(String(right));
  await expect(page.getByTestId("train-result")).toBeHidden();
  await page.evaluate(() => {
    document.hasFocus = () => true;
    window.dispatchEvent(new Event("focus"));
  });
  // Still covered until the player resumes, and the clock stays stopped meanwhile.
  await page.clock.runFor(10_000);
  await expect(page.locator(".pause-cover")).toBeVisible();
  expect(await seconds(page)).toBeLessThanOrEqual(before + 1);
  await saved(page);
  expect((await stored(page))?.training?.attemptCount ?? 0).toBe(0);
  await page.getByRole("button", { name: "Resume", exact: true }).first().click();
  await expect(page.locator(".pause-cover")).toBeHidden();
  await page.clock.runFor(2_000);
  expect(await seconds(page)).toBeGreaterThanOrEqual(before + 1);
  expect(await seconds(page)).toBeLessThanOrEqual(before + 3);
  // The cell is still selected from before the blur.
  await page.keyboard.press(String(right));
  await expect(page.getByTestId("train-result").getByRole("heading", { level: 2 })).toHaveText(
    "Correct",
  );
});

test("a note modifier never answers, and Next returns focus to the board", async ({ page }) => {
  await startSprint(page);
  const { open, right } = probe(first);
  await cell(page, open).click();
  await page.keyboard.press(`Shift+Digit${right}`);
  await page.keyboard.press(`Control+Digit${right}`);
  await expect(page.getByTestId("train-result")).toBeHidden();
  await expect(page.getByTestId("train-streak")).toHaveText("Streak 0");
  await page.keyboard.press(String(right));
  await expect(page.getByTestId("train-result").getByRole("heading", { level: 2 })).toHaveText(
    "Correct",
  );
  await expect(page.getByRole("status").filter({ hasText: "Correct:" })).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("train-result")).toBeHidden();
  await expect(page.locator(".cell:focus")).toHaveCount(1);
});

test("reloading during an attempt records nothing", async ({ page }) => {
  await startSprint(page);
  await cell(page, probe(first).open).click();
  await page.reload();
  await expect(page.getByRole("grid", { name: "Training position" })).toBeVisible();
  await saved(page);
  const data = await stored(page);
  expect(data?.training?.attemptCount ?? 0).toBe(0);
  expect(data?.training?.attempts ?? []).toEqual([]);
});
