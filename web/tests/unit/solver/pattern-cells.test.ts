import { expect, test } from "vitest";
import { patternCells } from "../../../src/solver/classic-run";

// Presentation-only cells of a step (Train T1 review, D106): the Solve screen
// and the training pack draw them as the step's reasoning.
test("cell and cells fields at any depth, as before", () => {
  expect(patternCells({ outer: { cell: 7 }, list: [{ cells: [3, 1] }] })).toEqual([1, 3, 7]);
  expect(patternCells({ cell: 81, cells: [-1, 2.5, "4"] })).toEqual([]);
});
test("wing fields: pivot, wings, endpoints, bridge", () => {
  // An XY-Wing pattern as the engine emits it: its digit fields x, y, z are not cells.
  const xyWing: unknown = JSON.parse(
    '{"alias":"XY-Wing","pivot":40,"wings":[36,44],"x":1,"y":2,"z":3}',
  );
  expect(patternCells(xyWing)).toEqual([36, 40, 44]);
  expect(
    patternCells({ alias: "W-Wing", endpoints: [0, 80], bridge: [9, 17], cover: "row:1" }),
  ).toEqual([0, 9, 17, 80]);
});
test("short-path vertices are lists of cells", () => {
  expect(
    patternCells({ alias: "Skyscraper", paths: [{ symbol: 4, vertices: [[0, 1], [10], [19]] }] }),
  ).toEqual([0, 1, 10, 19]);
});
test("chain vertices stay objects and are still walked", () => {
  expect(
    patternCells({ vertices: [{ members: [{ cell: 5, symbol: 2 }] }, { members: [{ cell: 6 }] }] }),
  ).toEqual([5, 6]);
});
test("a fish's base houses give their cells that hold the symbol", () => {
  const domains = Array<number>(81).fill(0);
  for (const cell of [2, 6, 29, 33, 40]) domains[cell] = 1 << 4; // digit 5
  domains[3] = 1 << 3; // digit 4 only
  const fish = { alias: "X-Wing", symbol: 5, bases: ["row:0", "row:3"], covers: [], fins: [] };
  expect(patternCells(fish, domains)).toEqual([2, 6, 29, 33]);
  expect(patternCells({ ...fish, bases: ["column:2", "box:4"] }, domains)).toEqual([2, 29, 40]);
  // Without the candidates there is nothing to read the houses against.
  expect(patternCells(fish)).toEqual([]);
});
