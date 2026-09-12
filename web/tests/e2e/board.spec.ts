import { expect, test } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/tests/browser/board.html");
});

test("repeated value entry erases, restores hidden notes and ignores held keys", async ({
  page,
}) => {
  const cell = page.locator('[data-cell-index="0"]');
  await cell.click();
  await page.keyboard.press("Shift+Digit2");
  await page.keyboard.down("Digit5");
  await page.keyboard.down("Digit5");
  await page.keyboard.up("Digit5");
  await expect(cell.locator("[data-value]")).toHaveText("5");
  await page.keyboard.press("5");
  await expect(cell.locator("[data-value]")).toBeEmpty();
  await expect(cell.locator("[data-notes]")).toBeVisible();
  await expect(cell.locator("[data-notes]")).toHaveText("2");
  await page.keyboard.press("Control+z");
  await expect(cell.locator("[data-value]")).toHaveText("5");
  await page.keyboard.press("Control+y");
  await expect(cell.locator("[data-value]")).toBeEmpty();
});

test("notes use fixed 3 by 3 positions even when candidates are removed", async ({
  page,
}) => {
  const cell = page.locator('[data-cell-index="0"]');
  await cell.click();
  for (let n = 1; n <= 9; n++) await page.keyboard.press(`Shift+Digit${n}`);
  const positions = await cell
    .locator("[data-notes] > span")
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const { x, y, width, height } = node.getBoundingClientRect();
        return { digit: node.textContent, x, y, width, height };
      }),
    );
  expect(new Set(positions.map((p) => p.y)).size).toBe(3);
  expect(new Set(positions.map((p) => p.x)).size).toBe(3);
  expect(positions[0].y).toBe(positions[2].y);
  expect(positions[3].y).toBe(positions[5].y);
  expect(positions[6].y).toBe(positions[8].y);
  expect(positions[0].x).toBe(positions[3].x);
  expect(positions[3].x).toBe(positions[6].x);
  await page.keyboard.press("Shift+Digit1");
  await page.keyboard.press("Shift+Digit5");
  const remaining = await cell
    .locator("[data-notes] > span")
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const { x, y, width, height } = node.getBoundingClientRect();
        return { digit: node.textContent, x, y, width, height };
      }),
    );
  expect(remaining).toEqual(
    positions.filter((p) => p.digit !== "1" && p.digit !== "5"),
  );
});
test("wrap, shifted physical keys, hidden notes and undo use real events", async ({
  page,
}) => {
  await expect(page.getByRole("row")).toHaveCount(9);
  await expect(page.getByRole("row").first().getByRole("gridcell")).toHaveCount(
    9,
  );
  const cell = page.locator('[data-cell-index="0"]');
  await cell.click();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator('[data-cell-index="8"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowUp");
  await expect(page.locator('[data-cell-index="72"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Shift+Digit2");
  await expect(cell.locator("[data-notes]")).toHaveText("2");
  await page.keyboard.press("5");
  await expect(cell.locator("[data-value]")).toHaveText("5");
  await expect(cell.locator("[data-notes]")).toBeHidden();
  await page.keyboard.press("Backspace");
  await expect(cell.locator("[data-notes]")).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(cell.locator("[data-value]")).toHaveText("5");
});
test("pointer shift, persistent tool, numpad, locked givens and form isolation", async ({
  page,
}) => {
  const cell = page.locator('[data-cell-index="0"]');
  await cell.click();
  await page
    .getByRole("button", { name: "Number 3", exact: true })
    .click({ modifiers: ["Shift"] });
  await expect(cell.locator("[data-notes]")).toHaveText("3");
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.keyboard.press("Numpad2");
  await expect(cell.locator("[data-notes]")).toHaveText("23");
  await page.getByRole("button", { name: "Notes", exact: true }).click();
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
test("remount removes listeners; all nine notes fit and conflict feedback is visible", async ({
  page,
}, info) => {
  await page.getByRole("button", { name: "Remount", exact: true }).click();
  const cell = page.locator('[data-cell-index="0"]');
  await cell.click();
  for (let n = 1; n <= 9; n++) await page.keyboard.press(`Shift+Digit${n}`);
  await expect(cell.locator("[data-notes]")).toHaveText("123456789");
  expect(
    await cell
      .locator("[data-notes]")
      .evaluate(
        (e) =>
          e.scrollWidth <= e.clientWidth && e.scrollHeight <= e.clientHeight,
      ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("nine-notes.png") });
});
test("repeated note keydown is ignored, other shortcuts stay native, numpad zero erases", async ({
  page,
}) => {
  const cell = page.locator('[data-cell-index="0"]');
  await cell.click();
  await page.keyboard.down("Shift");
  await page.keyboard.down("Digit2");
  await page.keyboard.down("Digit2");
  await page.keyboard.up("Digit2");
  await page.keyboard.up("Shift");
  await expect(cell.locator("[data-notes]")).toHaveText("2");
  await page.keyboard.press("Control+Digit3");
  await expect(cell.locator("[data-value]")).toBeEmpty();
  await page.keyboard.press("5");
  await page.keyboard.press("Numpad0");
  await expect(cell.locator("[data-value]")).toBeEmpty();
  await expect(cell.locator("[data-notes]")).toBeVisible();
});
