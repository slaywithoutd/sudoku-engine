import { expect, test } from "vitest";
import {
  conflictingCells,
  effectiveValues,
  isComplete,
  parsePuzzleString,
} from "../../src/domain/classic";
import { emptyEditor } from "../../src/domain/model";
import { SOLUTION } from "../fixtures";
test("strict string syntax is independent of conflicts and completion", () => {
  expect(parsePuzzleString(" . ".repeat(81))).toEqual(Array(81).fill(0));
  for (const text of ["0".repeat(80), "0".repeat(82), "0".repeat(80) + "x"])
    expect(() => parsePuzzleString(text)).toThrow();
  expect(conflictingCells(parsePuzzleString("11" + "0".repeat(79)))).toEqual([
    0, 1,
  ]);
  expect(isComplete(parsePuzzleString(SOLUTION))).toBe(true);
  expect(isComplete(Array(81).fill(0))).toBe(false);
  expect(isComplete(Array(81).fill(1))).toBe(false);
});
test.each([
  [0, 27],
  [0, 10],
  [0, 3],
])("finds both participants %i and %i", (a, b) => {
  const values = Array(81).fill(0);
  values[a] = 4;
  values[b] = 4;
  expect(conflictingCells(values)).toEqual([a, b]);
});
test("effective values prioritize givens without mutating editor", () => {
  const editor = emptyEditor();
  editor.cells[1].value = 3;
  const givens = Array(81).fill(0);
  givens[0] = 5;
  expect(effectiveValues(editor, givens).slice(0, 2)).toEqual([5, 3]);
  expect(editor.cells[0].value).toBe(0);
});
