import { expect, test } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/tests/browser/board.html");
});
const corner = (page: import("@playwright/test").Page, index: number) =>
  page.locator(`[data-cell-index="${index}"] [data-notes]`);
const center = (page: import("@playwright/test").Page, index: number) =>
  page.locator(`[data-cell-index="${index}"] [data-center-notes]`);

test("repeated value entry erases, restores hidden notes and ignores held keys", async ({ page }) => {
  const cell = page.locator('[data-cell-index="0"]');
  await cell.click();
  await page.keyboard.press("Shift+Digit2");
  await page.keyboard.down("Digit5");
  await page.keyboard.down("Digit5");
  await page.keyboard.up("Digit5");
  await expect(cell.locator("[data-value]")).toHaveText("5");
  await page.keyboard.press("5");
  await expect(cell.locator("[data-value]")).toBeEmpty();
  await expect(corner(page, 0)).toBeVisible();
  await expect(corner(page, 0)).toHaveText("2");
  await page.keyboard.press("Control+z");
  await expect(cell.locator("[data-value]")).toHaveText("5");
  await page.keyboard.press("Control+y");
  await expect(cell.locator("[data-value]")).toBeEmpty();
});

test("corner notes fill corners first and leave the middle to center notes", async ({ page }) => {
  const cell = page.locator('[data-cell-index="0"]');
  await cell.click();
  for (const n of [7, 2, 9, 4]) await page.keyboard.press(`Shift+Digit${n}`);
  await page.keyboard.press("Control+Digit5");
  await page.keyboard.press("Control+Digit1");
  await expect(corner(page, 0)).toHaveText("2479");
  await expect(center(page, 0)).toHaveText("15");
  const box = (await cell.boundingBox())!;
  const spots = await corner(page, 0).locator("span").evaluateAll((nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }),
  );
  // Sorted digits 2,4,7,9 occupy top-left, top-right, bottom-left, bottom-right.
  expect(spots[0].x).toBeLessThan(box.x + box.width / 3);
  expect(spots[0].y).toBeLessThan(box.y + box.height / 3);
  expect(spots[1].x).toBeGreaterThan(box.x + (box.width * 2) / 3);
  expect(spots[2].y).toBeGreaterThan(box.y + (box.height * 2) / 3);
  expect(spots[3].x).toBeGreaterThan(box.x + (box.width * 2) / 3);
  const middle = (await center(page, 0).boundingBox())!;
  expect(Math.abs(middle.y + middle.height / 2 - (box.y + box.height / 2))).toBeLessThan(box.height * 0.1);
});

test("wrap, deselection, hidden notes and undo use real events", async ({ page }) => {
  await expect(page.getByRole("row")).toHaveCount(9);
  await expect(page.getByRole("row").first().getByRole("gridcell")).toHaveCount(9);
  const cell = page.locator('[data-cell-index="0"]');
  await cell.click();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator('[data-cell-index="8"]')).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowUp");
  await expect(page.locator('[data-cell-index="72"]')).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Shift+Digit2");
  await expect(corner(page, 0)).toHaveText("2");
  await page.keyboard.press("5");
  await expect(cell.locator("[data-value]")).toHaveText("5");
  await expect(corner(page, 0)).toBeHidden();
  await page.keyboard.press("Backspace");
  await expect(corner(page, 0)).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(cell.locator("[data-value]")).toHaveText("5");
  // Clicking the selected cell, clicking outside and Escape all clear the selection.
  await cell.click();
  await expect(page.locator('[aria-selected="true"]')).toHaveCount(0);
  await page.keyboard.press("7");
  await expect(cell.locator("[data-value]")).toHaveText("5");
  await cell.click();
  await page.getByRole("button", { name: "Number 3", exact: true }).click();
  await expect(cell).toHaveAttribute("aria-selected", "true");
  await page.mouse.click(5, 5);
  await expect(page.locator('[aria-selected="true"]')).toHaveCount(0);
  await cell.click();
  await page.keyboard.press("Escape");
  await expect(page.locator('[aria-selected="true"]')).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[aria-selected="true"]')).toHaveCount(1);
});

test("pointer modifiers, persistent tools, numpad, colors, locked givens and form isolation", async ({ page }) => {
  const cell = page.locator('[data-cell-index="0"]');
  await cell.click();
  await page.getByRole("button", { name: "Number 3", exact: true }).click({ modifiers: ["Shift"] });
  await expect(corner(page, 0)).toHaveText("3");
  await page.getByRole("radio", { name: /^Corner/ }).click();
  await page.keyboard.press("Numpad2");
  await expect(corner(page, 0)).toHaveText("23");
  await page.keyboard.press("C");
  await expect(page.getByRole("radio", { name: /^Center/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Center note 8", exact: true }).click();
  await expect(center(page, 0)).toHaveText("8");
  await page.keyboard.press("V");
  await page.getByRole("button", { name: "Blue (5)", exact: true }).click();
  await expect(cell).toHaveAttribute("data-color", "5");
  await page.keyboard.press("Z");
  await page.keyboard.press("Numpad5");
  await expect(cell.locator("[data-value]")).toHaveText("5");
  const name = page.getByLabel("Name");
  await name.fill("");
  await name.pressSequentially("123");
  await name.press("Control+z");
  await expect(cell.locator("[data-value]")).toHaveText("5");
  const given = page.locator('[data-cell-index="80"]');
  await given.click();
  await page.keyboard.press("2");
  await page.keyboard.press("Delete");
  await expect(given.locator("[data-value]")).toHaveText("9");
});

test("remount removes listeners; all nine notes fit and copy/paste carries every layer", async ({ page }, info) => {
  await page.getByRole("button", { name: "Remount", exact: true }).click();
  const cell = page.locator('[data-cell-index="0"]');
  await cell.click();
  for (let n = 1; n <= 9; n++) await page.keyboard.press(`Shift+Digit${n}`);
  await expect(corner(page, 0)).toHaveText("123456789");
  expect(
    await corner(page, 0).evaluate((e) => e.scrollWidth <= e.clientWidth && e.scrollHeight <= e.clientHeight),
  ).toBe(true);
  await page.keyboard.press("Control+Digit4");
  await page.keyboard.press("Control+c");
  await page.locator('[data-cell-index="1"]').click();
  await page.keyboard.press("Control+v");
  await expect(corner(page, 1)).toHaveText("123456789");
  await expect(center(page, 1)).toHaveText("4");
  await page.keyboard.press("Control+z");
  await expect(corner(page, 1)).toBeHidden();
  await page.screenshot({ path: info.outputPath("nine-notes.png") });
});

test("repeated note keydown is ignored, unbound shortcuts stay native, numpad zero erases", async ({ page }) => {
  const cell = page.locator('[data-cell-index="0"]');
  await cell.click();
  await page.keyboard.down("Shift");
  await page.keyboard.down("Digit2");
  await page.keyboard.down("Digit2");
  await page.keyboard.up("Digit2");
  await page.keyboard.up("Shift");
  await expect(corner(page, 0)).toHaveText("2");
  await page.keyboard.press("Alt+Digit3");
  await expect(cell.locator("[data-value]")).toBeEmpty();
  await expect(center(page, 0)).toBeHidden();
  await page.keyboard.press("5");
  await page.keyboard.press("Numpad0");
  await expect(cell.locator("[data-value]")).toBeEmpty();
  await expect(corner(page, 0)).toBeVisible();
});

test("keypad minimizes to a restore bar and defaults to 1 2 3 on top", async ({ page }) => {
  await page.getByRole("button", { name: "Minimize keypad", exact: true }).click();
  await expect(page.getByRole("button", { name: "Number 1", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Show keypad", exact: true }).click();
  await expect(page.getByRole("button", { name: "Number 1", exact: true })).toBeVisible();
  const one = (await page.getByRole("button", { name: "Number 1", exact: true }).boundingBox())!;
  const seven = (await page.getByRole("button", { name: "Number 7", exact: true }).boundingBox())!;
  expect(one.y).toBeLessThan(seven.y);
});
