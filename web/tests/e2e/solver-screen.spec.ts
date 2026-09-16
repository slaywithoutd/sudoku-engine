import {expect,test,type Page} from "@playwright/test";

const unique="530070000600195000098000060800060003400803001700020006060000280000419005000080079";
const solution="534678912672195348198342567859761423426853791713924856961537284287419635345286179";

async function pastePuzzle(page:Page,puzzle:string){
  await page.getByRole("button",{name:"Paste puzzle",exact:true}).click();
  await page.getByLabel("81 cells").fill(puzzle);
  await page.getByRole("button",{name:"Load puzzle",exact:true}).click();
}

test("opens the temporary English Solve screen on the shared board",async({page})=>{
  await page.goto("#/");
  await page.getByRole("button",{name:"Solve",exact:true}).click();
  await expect(page.getByRole("radio",{name:"Explain",exact:true})).toBeChecked();
  await expect(page.getByText("Temporary input and analysis.",{exact:false})).toBeVisible();
  await expect(page.getByRole("grid",{name:"Sudoku board"})).toBeVisible();
  await page.getByRole("gridcell",{name:"Row 1, column 1, empty"}).click();
  await page.getByRole("button",{name:"Number 5"}).click();
  await expect(page.getByText("1 clues · No visible conflicts.")).toBeVisible();
});

test("solves a pasted puzzle end to end in a real worker",async({page})=>{
  test.setTimeout(180_000);
  await page.goto("#/solve");
  await pastePuzzle(page,unique);
  await expect(page.getByText("30 clues · No visible conflicts.")).toBeVisible();
  await page.getByRole("button",{name:"Start",exact:true}).click();
  await expect(page.getByText("Exactly one solution, verified by exhaustive search.")).toBeVisible({timeout:150_000});
  await expect(page.getByTestId("solver-status")).toHaveText("Complete");
  // Reaching the human-phase time/work ceiling on a slower host is an honestly
  // reported, documented fallback (docs/decisions.md D063), not a failure: the
  // exact count above already proves the grid below is correct either way.
  await expect(page.getByText(/Solved logically in \d+ explained steps\.|logical explanation stopped at its limit/)).toBeVisible();
  const cells=page.getByRole("grid",{name:"Sudoku board"}).getByRole("gridcell");
  await expect(cells).toHaveCount(81);
  const shown=await cells.evaluateAll(nodes=>nodes.map(node=>node.querySelector("[data-value]")?.textContent||"0").join(""));
  expect(shown).toBe(solution);
  await expect(page.getByRole("gridcell",{name:"Row 1, column 1, 5, fixed clue"})).toBeVisible();
  await page.getByRole("button",{name:"Edit puzzle",exact:true}).click();
  await expect(page.getByText("30 clues · No visible conflicts.")).toBeVisible();
});

test("reports puzzles without a unique solution quickly",async({page})=>{
  await page.goto("#/solve");
  await pastePuzzle(page,"0".repeat(80)+"1");
  await page.getByRole("button",{name:"Start",exact:true}).click();
  await expect(page.getByText("This puzzle has more than one solution.")).toBeVisible({timeout:15_000});
  await page.getByRole("button",{name:"Edit puzzle",exact:true}).click();
  await pastePuzzle(page,"123456780000000009"+"0".repeat(63));
  await page.getByRole("button",{name:"Start",exact:true}).click();
  await expect(page.getByText("This puzzle has no solution.")).toBeVisible({timeout:15_000});
});

test("blocks conflicting clues and cancels a running analysis",async({page})=>{
  await page.goto("#/solve");
  await pastePuzzle(page,"55"+"0".repeat(79));
  await expect(page.getByText("Resolve the highlighted conflicts before solving.")).toBeVisible();
  await expect(page.getByRole("button",{name:"Start",exact:true})).toBeDisabled();
  await pastePuzzle(page,unique);
  await page.getByRole("button",{name:"Start",exact:true}).click();
  await expect(page.getByRole("button",{name:"Cancel",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  await expect(page.getByTestId("solver-status")).toHaveText("Cancelled");
});
