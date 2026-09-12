import { expect, test } from "vitest";
import { emptyEditor, type EditorContext } from "../../src/domain/model";
import { reduceEditor, type BoardAction } from "../../src/domain/editor";
const ctx: EditorContext = { mode: "play", givens: Array(81).fill(0) };
const digit = (n: 2 | 5, corner = false): BoardAction => ({
  type: "digit",
  digit: n,
  corner,
});
test("hidden notes, layered erase, undo and redo retain independent cell state", () => {
  let s = reduceEditor(ctx, emptyEditor(), digit(2, true));
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
    reduceEditor(ctx, { ...emptyEditor(), selected }, { type: "move", dr, dc })
      .selected,
  ).toBe(want);
});
test("givens lock edits but permit selection; malformed moves and indices ignored", () => {
  const c = { ...ctx, givens: [7, ...Array(80).fill(0)] };
  const s = emptyEditor();
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
  let s = reduceEditor(ctx, emptyEditor(), digit(5));
  expect(reduceEditor(ctx, s, digit(5))).toBe(s);
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
test("reset is one undoable edit, keeps selection/tool and never cleans peers", () => {
  let s = reduceEditor(ctx, emptyEditor(), digit(2, true));
  s = reduceEditor(ctx, s, { type: "select", index: 1 });
  s = reduceEditor(ctx, s, digit(2, true));
  s = reduceEditor(ctx, s, digit(5));
  expect(s.cells[0].notes).toEqual([2]);
  const prior = s;
  s = reduceEditor(ctx, s, { type: "reset" });
  expect(s.past.length).toBe(prior.past.length + 1);
  expect(reduceEditor(ctx, s, { type: "undo" }).cells).toEqual(prior.cells);
});
test("corner toggle sorts notes; creation always enters clues", () => {
  let s = reduceEditor(ctx, emptyEditor(), digit(5, true));
  s = reduceEditor(ctx, s, digit(2, true));
  expect(s.cells[0].notes).toEqual([2, 5]);
  s = reduceEditor(ctx, s, digit(5, true));
  expect(s.cells[0].notes).toEqual([2]);
  expect(
    reduceEditor({ ...ctx, mode: "create" }, emptyEditor(), digit(2, true))
      .cells[0],
  ).toEqual({ value: 2, notes: [] });
});
