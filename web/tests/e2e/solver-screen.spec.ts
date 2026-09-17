import { expect, test, type Page } from "@playwright/test";

const unique = "530070000600195000098000060800060003400803001700020006060000280000419005000080079";
const solution =
  "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
/** Few blanks: solves logically in a handful of steps, quickly on any host. */
const easy = solution.slice(0, 60) + "0".repeat(8) + solution.slice(68, 75) + "000000";

async function importPuzzle(page: Page, puzzle: string) {
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByLabel("Puzzle text").fill(puzzle);
  await page.getByRole("button", { name: "Load puzzle", exact: true }).click();
}
const solve = (page: Page) => page.getByRole("button", { name: "Solve", exact: true });

test("opens the Solve screen with the same editing surface as Create", async ({ page }) => {
  await page.goto("#/");
  await page.getByRole("button", { name: "Solve", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Explain" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByText("Temporary input and analysis.", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
  await expect(solve(page)).toBeDisabled();
  await page.locator('[data-cell-index="0"]').click();
  await page.getByRole("button", { name: "Number 5" }).click();
  await expect(page.getByTestId("clue-summary")).toHaveText("1 clue");
  await page.locator('[data-cell-index="0"]').click();
  await expect(page.locator('[aria-selected="true"]')).toHaveCount(0);
  await page
    .getByRole("button", { name: "Library", exact: false })
    .filter({ has: page.locator(".select-text") })
    .click();
  await expect(page.getByRole("listbox")).toContainText("Your library is empty.");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("explains a puzzle step by step with highlighted deductions", async ({ page }) => {
  await page.goto("#/solve");
  await importPuzzle(page, easy);
  await solve(page).click();
  await expect(page.locator(".game-solve")).toHaveAttribute("data-phase", "result", {
    timeout: 60_000,
  });
  await expect(page.getByTestId("solver-status")).toHaveText("Complete");
  await expect(page.locator(".step-position")).toContainText(/Step 1 of \d+/);
  await expect(page.locator(".cell.focus").first()).toBeVisible();
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(page.locator(".step-position")).toContainText("Step 2 of");
  await page.keyboard.press("End");
  await expect(page.getByRole("button", { name: "Next step", exact: true })).toBeDisabled();
  await page.keyboard.press("Home");
  await expect(page.locator(".step-position")).toContainText("Step 1 of");
  await page.getByText("Solver options").click();
  await page.getByRole("switch", { name: "Hide basic eliminations" }).check();
  await expect(page.locator(".step-name", { hasText: "Basic elimination" })).toHaveCount(0);
  await page.getByRole("switch", { name: "Hide basic eliminations" }).uncheck();
  await page.getByRole("radio", { name: "Analyze" }).click();
  await expect(page.getByTestId("solver-verification")).toContainText("Unique solution");
  await expect(page.getByTestId("solver-verification")).toContainText("Logical steps");
  const shown = await page
    .getByRole("grid")
    .getByRole("gridcell")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.querySelector("[data-value]")?.textContent || "0").join(""),
    );
  expect(shown).toBe(solution);
  await page.getByRole("button", { name: "Edit puzzle", exact: true }).click();
  await expect(page.getByTestId("clue-summary")).toHaveText(
    `${easy.replace(/0/g, "").length} clues`,
  );
});

test("solves a full puzzle in a real worker with visible progress", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("#/solve");
  await importPuzzle(page, unique);
  await expect(page.getByTestId("clue-summary")).toHaveText("30 clues");
  await solve(page).click();
  await expect(page.getByRole("progressbar", { name: "Solving" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Import", exact: true })).toBeDisabled();
  await page.getByRole("radio", { name: "Analyze" }).click();
  await expect(page.getByTestId("solver-verification")).toContainText(
    "Exactly one solution, verified by exhaustive search.",
    { timeout: 150_000 },
  );
  // Reaching the human-phase ceiling on a slower host is an honestly reported
  // fallback (docs/decisions.md D063); the exact count proves the grid either way.
  await expect(
    page.getByText(
      /Solved logically in \d+ explained steps\.|logical explanation stopped at its limit/,
    ),
  ).toBeVisible();
  const shown = await page
    .getByRole("grid")
    .getByRole("gridcell")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.querySelector("[data-value]")?.textContent || "0").join(""),
    );
  expect(shown).toBe(solution);
  await expect(page.getByRole("gridcell", { name: "A1, 5, clue" })).toBeVisible();
});

test("reports puzzles without a unique solution quickly", async ({ page }) => {
  await page.goto("#/solve");
  await page.getByRole("radio", { name: "Analyze" }).click();
  await importPuzzle(page, "0".repeat(80) + "1");
  await solve(page).click();
  await expect(page.getByText("This puzzle has more than one solution.")).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Edit puzzle", exact: true }).click();
  await importPuzzle(page, "123456780000000009" + "0".repeat(63));
  await solve(page).click();
  await expect(page.getByText("This puzzle has no solution.")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("radio", { name: "Explain" }).click();
  await expect(page.locator(".empty-note")).toContainText("no logical steps");
});

test("blocks conflicting clues and cancels a running analysis", async ({ page }) => {
  await page.goto("#/solve");
  await importPuzzle(page, "55" + "0".repeat(79));
  await expect(page.getByText("Resolve the highlighted conflicts before solving.")).toBeVisible();
  await expect(solve(page)).toBeDisabled();
  await importPuzzle(page, unique);
  await solve(page).click();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByTestId("solver-status")).toHaveText("Cancelled");
  await expect(solve(page)).toBeEnabled();
});
