import { expect, test } from "vitest";
import { emptyEditor, type EditorContext } from "../../src/domain/model";
import { reduceEditor, selectionOf, type BoardAction } from "../../src/domain/editor";
const ctx: EditorContext = { mode: "play", givens: Array(81).fill(0) };
const digit = (n: 2 | 5, corner = false): BoardAction => ({
  type: "digit",
  digit: n,
  tool: corner ? "corner" : "value",
});
test("hidden notes, layered erase, undo and redo retain independent cell state", () => {
  let s = reduceEditor(ctx, { ...emptyEditor(), selected: 0 }, digit(2, true));
  s = reduceEditor(ctx, s, digit(5));
  expect(s.cells[0]).toEqual({ value: 5, notes: [2] });
  expect(reduceEditor(ctx, s, digit(2, true))).toBe(s);
  s = reduceEditor(ctx, s, { type: "erase" });
  expect(s.cells[0]).toEqual({ value: 0, notes: [2] });
  s = reduceEditor(ctx, s, { type: "undo" });
  expect(s.cells[0]).toEqual({ value: 5, notes: [2] });
  s = reduceEditor(ctx, s, { type: "redo" });
  s = reduceEditor(ctx, s, { type: "erase" });
  expect(s.cells[0]).toEqual({ value: 0, notes: [] });
});
test.each([
  [0, 0, -1, 8],
  [8, 0, 1, 0],
  [0, -1, 0, 72],
  [72, 1, 0, 0],
])("wraps from %i", (selected, dr, dc, want) => {
  expect(
    reduceEditor(ctx, { ...{ ...emptyEditor(), selected: 0 }, selected }, { type: "move", dr, dc })
      .selected,
  ).toBe(want);
});
test("givens lock edits but permit selection; malformed moves and indices ignored", () => {
  const c = { ...ctx, givens: [7, ...Array(80).fill(0)] };
  const s = { ...emptyEditor(), selected: 0 };
  for (const a of [
    digit(2),
    digit(2, true),
    { type: "erase" },
    { type: "reset" },
    { type: "select", index: 81 },
    { type: "move", dr: 2, dc: 0 },
  ] as BoardAction[])
    expect(reduceEditor(c, s, a)).toBe(s);
  expect(reduceEditor(c, s, { type: "select", index: 1 }).selected).toBe(1);
});
test("no-op keeps redo, navigation is outside history, new edits discard redo", () => {
  let s = reduceEditor(ctx, { ...emptyEditor(), selected: 0 }, digit(5));
  expect(reduceEditor(ctx, s, { type: "select", index: 0 })).toBe(s);
  s = reduceEditor(ctx, s, { type: "undo" });
  expect(reduceEditor(ctx, s, { type: "erase" })).toBe(s);
  s = reduceEditor(ctx, s, { type: "move", dr: 0, dc: 1 });
  s = reduceEditor(ctx, s, { type: "redo" });
  expect(s.selected).toBe(1);
  expect(s.cells[0].value).toBe(5);
  s = reduceEditor(ctx, s, { type: "undo" });
  s = reduceEditor(ctx, s, digit(2));
  expect(s.future).toEqual([]);
});
test.each(["play", "create"] as const)(
  "reentering a value erases it in %s and remains undoable",
  (mode) => {
    const context = { ...ctx, mode };
    let state = { ...emptyEditor(), selected: 0 };
    if (mode === "play") state = reduceEditor(context, state, digit(2, true));
    state = reduceEditor(context, state, digit(5));
    const filled = state;
    state = reduceEditor(context, state, digit(5));
    expect(state.cells[0]).toEqual({
      value: 0,
      notes: mode === "play" ? [2] : [],
    });
    expect(state.past.at(-1)?.label).toBe("erase");
    state = reduceEditor(context, state, { type: "undo" });
    expect(state.cells).toEqual(filled.cells);
    state = reduceEditor(context, state, { type: "redo" });
    expect(state.cells[0].value).toBe(0);
  },
);
test("reentering a fixed clue never erases it or adds history", () => {
  const context = { ...ctx, givens: [5, ...Array(80).fill(0)] };
  const state = { ...emptyEditor(), selected: 0 };
  expect(reduceEditor(context, state, digit(5))).toBe(state);
});
test("reset is one undoable edit, keeps selection/tool and never cleans peers", () => {
  let s = reduceEditor(ctx, { ...emptyEditor(), selected: 0 }, digit(2, true));
  s = reduceEditor(ctx, s, { type: "select", index: 1 });
  s = reduceEditor(ctx, s, digit(2, true));
  s = reduceEditor(ctx, s, digit(5));
  expect(s.cells[0].notes).toEqual([2]);
  const prior = s;
  s = reduceEditor(ctx, s, { type: "reset" });
  expect(s.past.length).toBe(prior.past.length + 1);
  expect(reduceEditor(ctx, s, { type: "undo" }).cells).toEqual(prior.cells);
});
test("toggle select builds, shrinks and demotes a multi-selection", () => {
  let s = { ...emptyEditor(), selected: 0 };
  s = reduceEditor(ctx, s, { type: "select", index: 3, mode: "toggle" });
  expect(selectionOf(s)).toEqual([0, 3]);
  s = reduceEditor(ctx, s, { type: "select", index: 5, mode: "toggle" });
  expect(selectionOf(s)).toEqual([0, 3, 5]);
  // Toggling an extra off removes just that cell.
  s = reduceEditor(ctx, s, { type: "select", index: 3, mode: "toggle" });
  expect(selectionOf(s)).toEqual([0, 5]);
  // Toggling the primary off promotes the next extra in its place.
  s = reduceEditor(ctx, s, { type: "select", index: 0, mode: "toggle" });
  expect(s.selected).toBe(5);
  expect(selectionOf(s)).toEqual([5]);
  s = reduceEditor(ctx, s, { type: "select", index: 5, mode: "toggle" });
  expect(selectionOf(s)).toEqual([]);
  expect(s.selected).toBe(-1);
});
test("a plain (non-toggle) select always replaces the whole selection", () => {
  let s = { ...emptyEditor(), selected: 0 };
  s = reduceEditor(ctx, s, { type: "select", index: 3, mode: "toggle" });
  s = reduceEditor(ctx, s, { type: "select", index: 7 });
  expect(selectionOf(s)).toEqual([7]);
});
test("extending a move grows the selection; a plain move replaces it", () => {
  let s = { ...emptyEditor(), selected: 0 };
  s = reduceEditor(ctx, s, { type: "move", dr: 0, dc: 1, extend: true });
  expect(selectionOf(s)).toEqual([1, 0]);
  s = reduceEditor(ctx, s, { type: "move", dr: 0, dc: 1, extend: true });
  expect(selectionOf(s)).toEqual([2, 0, 1]);
  s = reduceEditor(ctx, s, { type: "move", dr: 0, dc: 1 });
  expect(selectionOf(s)).toEqual([3]);
});
test("editing actions apply to every selected cell as one undoable batch", () => {
  let s = { ...emptyEditor(), selected: 0 };
  s = reduceEditor(ctx, s, { type: "select", index: 1, mode: "toggle" });
  s = reduceEditor(ctx, s, { type: "select", index: 2, mode: "toggle" });
  s = reduceEditor(ctx, s, digit(5));
  expect(s.cells[0].value).toBe(5);
  expect(s.cells[1].value).toBe(5);
  expect(s.cells[2].value).toBe(5);
  expect(s.past.length).toBe(1);
  s = reduceEditor(ctx, s, { type: "undo" });
  expect(s.cells[0].value).toBe(0);
  expect(s.cells[1].value).toBe(0);
  expect(s.cells[2].value).toBe(0);
});
test("a given cell in the selection is skipped without blocking the rest", () => {
  const c = { ...ctx, givens: [7, 0, 0, ...Array(78).fill(0)] };
  let s = { ...emptyEditor(), selected: 0 };
  s = reduceEditor(c, s, { type: "select", index: 1, mode: "toggle" });
  s = reduceEditor(c, s, digit(5));
  expect(s.cells[0].value).toBe(0); // given cell untouched
  expect(s.cells[1].value).toBe(5);
});
test("corner toggle sorts notes; creation always enters clues", () => {
  let s = reduceEditor(ctx, { ...emptyEditor(), selected: 0 }, digit(5, true));
  s = reduceEditor(ctx, s, digit(2, true));
  expect(s.cells[0].notes).toEqual([2, 5]);
  s = reduceEditor(ctx, s, digit(5, true));
  expect(s.cells[0].notes).toEqual([2]);
  expect(
    reduceEditor({ ...ctx, mode: "create" }, { ...emptyEditor(), selected: 0 }, digit(2, true))
      .cells[0],
  ).toEqual({ value: 2, notes: [] });
});
