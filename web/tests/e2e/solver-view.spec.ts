import { expect, test, type Page } from "@playwright/test";
import {
  classicLimitsFor,
  solveClassic,
  type ClassicSolveEvent,
} from "../../src/solver/classic-run";
import { readFileSync } from "node:fs";

const evalCorpus = JSON.parse(
  readFileSync(new URL("../solver/bench/eval-corpus.json", import.meta.url), "utf8"),
) as { cases: { id: string; puzzle: string }[] };

// M2.7 S4 (D105): one Solve view, the step list with a summary header.

async function importPuzzle(page: Page, puzzle: string) {
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByLabel("Puzzle text").fill(puzzle);
  await page.getByRole("button", { name: "Load puzzle", exact: true }).click();
}
const solve = (page: Page) => page.getByRole("button", { name: "Solve", exact: true });
const finished = (page: Page) =>
  expect(page.locator(".game-solve")).toHaveAttribute("data-phase", "result", {
    timeout: 90_000,
  });
const puzzle = (id: string) => {
  const entry = evalCorpus.cases.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(id);
  return entry.puzzle;
};

test("there is no Analyze/Explain toggle and the header carries the M2.6 summary", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("#/solve");
  await expect(page.getByRole("radio", { name: "Analyze" })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Explain" })).toHaveCount(0);
  await page.getByText("Solver options").click();
  await page.getByRole("radio", { name: "15 s" }).click();
  await importPuzzle(page, puzzle("escargot"));
  await solve(page).click();
  await finished(page);
  const header = page.getByTestId("solve-summary");
  // Collapsed to one line, above the step list, which shows at once.
  await expect(header).not.toHaveAttribute("open");
  await expect(header.locator("summary")).toContainText("Unique solution");
  await expect(header.locator("summary")).toContainText(/stalled at tier \d|stopped/);
  // The collapsed header is one short row and the steps start on screen.
  const box = await header.boundingBox(),
    list = await page.locator(".step-list").boundingBox();
  expect(box && list && box.y < list.y).toBe(true);
  expect(box?.height ?? 999).toBeLessThan(90);
  await expect(page.locator(".step-card")).toBeInViewport();
  await header.locator("summary").click();
  await expect(page.getByTestId("count-verification")).toContainText("Count: verified in");
  await expect(page.getByTestId("logic-stop")).toContainText(/Logic: (stalled|stopped) at tier \d/);
  await expect(page.getByTestId("highest-tier")).toContainText(/Highest tier used/);
  await expect(page.getByTestId("steps-per-tier")).toContainText("Basic elimination");
  await expect(page.getByTestId("technique-coverage")).toContainText(/\d+ exhausted/);
  await expect(page.getByTestId("coverage-lists")).toContainText(/Exhausted|Capped|Not started/);
  // The step list is still there, and the board follows it.
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(page.locator(".step-position")).toContainText("Step 2 of");
  // Show solution keeps focus and says its state with aria-pressed.
  const toggle = page.getByRole("button", { name: "Show solution", exact: true });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toBeFocused();
  await page.getByRole("button", { name: "Previous step", exact: true }).click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  // The next run starts collapsed again.
  await page.getByRole("button", { name: "Edit puzzle", exact: true }).click();
  await solve(page).click();
  await finished(page);
  await expect(header).not.toHaveAttribute("open");
});

test("a run with a gap in its technique set counts its set-limited steps in the header", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("#/solve");
  await page.getByText("Solver options").click();
  await page.getByRole("radio", { name: "15 s" }).click();
  await page
    .getByRole("radiogroup", { name: "Techniques" })
    .getByRole("radio", { name: "Custom" })
    .click();
  // Hidden single off: every step from tier 1 up has a simpler switched-off family.
  await page.getByRole("checkbox", { name: "Hidden single" }).uncheck();
  await importPuzzle(page, puzzle("seventeen"));
  await solve(page).click();
  await finished(page);
  await page.getByTestId("solve-summary").locator("summary").click();
  await expect(page.getByTestId("set-limited-summary")).toContainText(
    /\d+ steps? may have a simpler explanation: a simpler technique is switched off\./,
  );
});

test("the step list is unchanged for the corpus cases", async ({ page }) => {
  test.setTimeout(180_000);
  for (const id of ["easy", "hidden-singles", "seventeen"]) {
    // The engine's own steps at the default 60 s preset; these cases are
    // solved well inside the work budget, so the list is the same on any host.
    const events: ClassicSolveEvent[] = [];
    await solveClassic(
      {
        givens: [...puzzle(id)].map(Number),
        mode: "explain",
        limits: classicLimitsFor(60_000),
      },
      { clock: { now: () => 0 }, emit: (event) => events.push(event) },
    );
    const expected = events.flatMap((event) => (event.kind === "step" ? [event.name] : []));
    expect(events.at(-1)).toMatchObject({ kind: "result", human: "solved" });
    await page.goto("#/solve");
    await importPuzzle(page, puzzle(id));
    await solve(page).click();
    await finished(page);
    await expect(page.locator(".step-list .step-name")).toHaveText(expected);
    await expect(page.locator(".step-position")).toHaveText(`Step 1 of ${expected.length}`);
  }
});
