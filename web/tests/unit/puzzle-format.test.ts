import { expect, test } from "vitest";
import { gameExport, parsePuzzles } from "../../src/domain/puzzle-format";
import { emptyLibrary, importGame } from "../../src/domain/library";
import { validateLibrary } from "../../src/domain/backup";
import { emptyEditor } from "../../src/domain/model";
import { NOW, PUZZLE } from "../fixtures";

const grid = (text: string) =>
  [0, 1, 2, 3, 4, 5, 6, 7, 8]
    .map((r) => text.slice(r * 9, r * 9 + 9))
    .map((row) => `${row.slice(0, 3)}|${row.slice(3, 6)}|${row.slice(6)}`);

test.each([
  ["single line with dots", PUZZLE.replace(/0/g, ".")],
  [
    "decorated grid",
    [...grid(PUZZLE).slice(0, 3), "---+---+---", ...grid(PUZZLE).slice(3)].join("\n"),
  ],
  ["SadMan header", `#Aauthor\n#Ttitle\n${grid(PUZZLE.replace(/0/g, ".")).join("\n")}`],
])("parses %s", (_, text) => {
  const result = parsePuzzles(text);
  expect(result.error).toBeUndefined();
  expect(result.puzzles).toHaveLength(1);
  expect(result.puzzles[0].givens.join("")).toBe(PUZZLE);
  expect(result.puzzles[0].clues).toBe(30);
});

test("parses collections and reports precise errors", () => {
  expect(parsePuzzles(`${PUZZLE}\n${PUZZLE}\n\n${PUZZLE}`).puzzles).toHaveLength(3);
  expect(parsePuzzles(PUZZLE.slice(1)).error).toMatch(/80 cells/);
  const rows = grid(PUZZLE);
  rows[4] = rows[4] + "1";
  expect(parsePuzzles(rows.join("\n")).error).toMatch(/row 5 has 10 cells/);
  expect(parsePuzzles("").error).toBeTruthy();
  expect(parsePuzzles('{"format":"sudoku-engine-backup"}').error).toMatch(/Settings/);
  expect(parsePuzzles("{nope").error).toMatch(/JSON/);
  expect(parsePuzzles("5".repeat(81)).puzzles[0].conflicts).toBeGreaterThan(0);
});

test("game exports round-trip progress into a valid library", () => {
  const cells = emptyEditor().cells;
  cells[2] = { value: 4, notes: [1], center: [7], color: 2 };
  cells[0] = { value: 0, notes: [], color: 5 };
  const text = gameExport({
    name: "Evening",
    givens: [...PUZZLE].map(Number) as never,
    cells,
    elapsedMs: 65_000,
  });
  const [parsed] = parsePuzzles(text).puzzles;
  expect(parsed).toMatchObject({ name: "Evening", elapsedMs: 65_000 });
  const data = validateLibrary(
    importGame(emptyLibrary(), "g", NOW, { ...parsed, cells: parsed.cells! }),
  );
  expect(data.sessions.g.editor.cells[2]).toEqual(cells[2]);
  expect(data.sessions.g.timer?.elapsedMs).toBe(65_000);
  const tampered = JSON.parse(text);
  tampered.cells[0].value = 3;
  expect(parsePuzzles(JSON.stringify(tampered)).error).toBeTruthy();
});
