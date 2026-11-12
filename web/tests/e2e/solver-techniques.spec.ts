import { expect, test, type Page } from "@playwright/test";

// M2.7 S3 (D105): the technique selector on the Solve screen.

/** The technique selection proposal's §2 puzzle: unique, and the logic stalls. */
const stall = "1....7.9..3..2...8..96..5....53..9...1..8...26....4...3......1..4......7..7...3..";

async function importPuzzle(page: Page, puzzle: string) {
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByLabel("Puzzle text").fill(puzzle);
  await page.getByRole("button", { name: "Load puzzle", exact: true }).click();
}
const solve = (page: Page) => page.getByRole("button", { name: "Solve", exact: true });
const techniques = (page: Page) => page.getByRole("radiogroup", { name: "Techniques" });

async function solveAndRead(page: Page) {
  await solve(page).click();
  await expect(page.locator(".game-solve")).toHaveAttribute("data-phase", "result", {
    timeout: 90_000,
  });
  return {
    heading: await page.locator(".result-headline h2").textContent(),
    count: await page.locator(".solver-analysis .result-detail").first().textContent(),
    coverage: await page.getByTestId("technique-coverage").textContent(),
    set: await page.getByTestId("technique-set").textContent(),
    techniques: await page.locator(".technique-list li span:first-child").allTextContents(),
  };
}

test("switching No fish on the stall puzzle changes the technique coverage shown, not the count", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto("#/solve");
  await page.getByText("Solver options").click();
  await page.getByRole("radio", { name: "15 s" }).click();
  await expect(techniques(page).getByRole("radio", { name: "All" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("radio", { name: "Analyze" }).click();
  await importPuzzle(page, stall);
  const all = await solveAndRead(page);
  expect(all.heading).toBe("Unique solution");
  expect(all.set).toBe("Techniques: All");
  expect(all.coverage).not.toContain("not selected");

  await page.getByRole("button", { name: "Edit puzzle", exact: true }).click();
  await techniques(page).getByRole("radio", { name: "No fish" }).click();
  await expect(page.getByTestId("technique-set")).toHaveText("Techniques: No fish (28 of 33)");
  const noFish = await solveAndRead(page);
  // The count is the exact phase's: the set never reaches it.
  expect(noFish.heading).toBe(all.heading);
  expect(noFish.count).toBe(all.count);
  expect(noFish.set).toBe("Techniques: No fish (28 of 33)");
  expect(noFish.coverage).toContain("5 not selected");
  expect(noFish.coverage).not.toBe(all.coverage);
  for (const fish of ["X-Wing", "Finned X-Wing", "Franken X-Wing", "Kraken Fish"])
    expect(noFish.techniques).not.toContain(fish);
});

test("a custom set is chosen family by family and survives a reload", async ({ page }) => {
  await page.goto("#/solve");
  await page.getByText("Solver options").click();
  await expect(page.getByRole("group", { name: "Tier 2" })).toBeHidden();
  await techniques(page).getByRole("radio", { name: "Custom" }).click();
  await expect(page.getByTestId("technique-set")).toHaveText("Techniques: Custom");
  await page.getByRole("checkbox", { name: "Basic fish (X-Wing, Swordfish, Jellyfish)" }).uncheck();
  await page.getByRole("checkbox", { name: "Kraken fish" }).uncheck();
  await expect(page.getByTestId("technique-set")).toHaveText("Techniques: Custom (31 of 33)");
  await page.getByRole("button", { name: "Switch all off", exact: true }).click();
  await expect(page.getByTestId("technique-set")).toHaveText("Techniques: Custom (0 of 33)");
  await page.getByRole("checkbox", { name: "Hidden single" }).check();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByTestId("technique-set")).toHaveText("Techniques: Custom (1 of 33)");
  // Choosing a preset keeps the custom set for later (D105 item 4).
  await page.getByText("Solver options").click();
  await techniques(page).getByRole("radio", { name: "All" }).click();
  await expect(page.getByTestId("technique-set")).toHaveText("Techniques: All");
  await techniques(page).getByRole("radio", { name: "Custom" }).click();
  await expect(page.getByTestId("technique-set")).toHaveText("Techniques: Custom (1 of 33)");
  // The empty set is allowed (D105 item 6): the run keeps only basic eliminations.
  await page.getByRole("checkbox", { name: "Hidden single" }).uncheck();
  await importPuzzle(
    page,
    "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
  );
  await solve(page).click();
  await expect(page.locator(".game-solve")).toHaveAttribute("data-phase", "result", {
    timeout: 60_000,
  });
  await page.getByRole("radio", { name: "Analyze" }).click();
  await expect(page.getByRole("heading", { name: "Unique solution" })).toBeVisible();
  await expect(page.getByTestId("logic-stop")).toContainText(
    "no step with the selected techniques",
  );
});
