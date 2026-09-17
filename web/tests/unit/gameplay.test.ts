import { expect, test } from "vitest";
import { emptyEditor, type EditorContext, type Value } from "../../src/domain/model";
import { reduceEditor, type BoardAction } from "../../src/domain/editor";
import {
  candidatesFor,
  completedDigits,
  noteConflicts,
  parsePuzzleString,
} from "../../src/domain/classic";
import {
  createDraft,
  deleteRecord,
  emptyLibrary,
  finishDraft,
  nextPuzzleName,
  startPlay,
} from "../../src/domain/library";
import { validateLibrary } from "../../src/domain/backup";
import { defaultSettings } from "../../src/domain/settings";
import { NOW, PUZZLE, SOLUTION } from "../fixtures";

const givens = parsePuzzleString(PUZZLE);
const play: EditorContext = { mode: "play", givens };
const at = (selected: number) => ({ ...emptyEditor(), selected });
const run = (context: EditorContext, state: ReturnType<typeof at>, ...actions: BoardAction[]) =>
  actions.reduce((s, a) => reduceEditor(context, s, a), state);

test("new editors start without a selection; select -1 deselects and moves reselect", () => {
  expect(emptyEditor().selected).toBe(-1);
  const s = run(play, at(2), { type: "select", index: -1 });
  expect(s.selected).toBe(-1);
  expect(reduceEditor(play, s, { type: "digit", digit: 4, tool: "value" })).toBe(s);
  expect(reduceEditor(play, s, { type: "move", dr: 0, dc: 1 }).selected).toBe(0);
});

test("corner and center notes are independent layers and survive a value", () => {
  let s = run(
    play,
    at(2),
    { type: "digit", digit: 1, tool: "corner" },
    { type: "digit", digit: 4, tool: "center" },
    { type: "digit", digit: 2, tool: "center" },
  );
  expect(s.cells[2]).toEqual({ value: 0, notes: [1], center: [2, 4] });
  s = run(play, s, { type: "digit", digit: 4, tool: "value" }, { type: "erase" });
  expect(s.cells[2]).toEqual({ value: 0, notes: [1], center: [2, 4] });
  s = run(play, s, { type: "erase" });
  expect(s.cells[2]).toEqual({ value: 0, notes: [] });
  expect(s.past.map((e) => e.label)).toEqual([
    "note",
    "center",
    "center",
    "digit",
    "erase",
    "erase",
  ]);
});

test("cell colors toggle, apply to clues, erase last and are ignored when creating", () => {
  let s = run(play, at(0), { type: "digit", digit: 3, tool: "color" });
  expect(s.cells[0]).toEqual({ value: 0, notes: [], color: 3 });
  expect(run(play, s, { type: "color", color: 3 }).cells[0]).toEqual({ value: 0, notes: [] });
  s = run(play, s, { type: "erase" });
  expect(s.cells[0]).toEqual({ value: 0, notes: [] });
  expect(reduceEditor(play, at(0), { type: "digit", digit: 7, tool: "color" }).past).toHaveLength(
    0,
  );
  const create: EditorContext = { mode: "create", givens: Array(81).fill(0) };
  expect(run(create, at(0), { type: "digit", digit: 3, tool: "color" }).cells[0]).toEqual({
    value: 3,
    notes: [],
  });
});

test("paste copies every layer onto editable cells only", () => {
  const cell = {
    value: 0 as Value,
    notes: [1, 2] as const,
    center: [5] as const,
    color: 2 as const,
  };
  const s = run(play, at(2), { type: "paste", cell: structuredClone(cell) as never });
  expect(s.cells[2]).toEqual(cell);
  expect(s.past.at(-1)?.label).toBe("paste");
  expect(reduceEditor(play, at(0), { type: "paste", cell: cell as never }).past).toHaveLength(0);
});

test("auto-fill uses only row, column and box constraints in one undoable edit", () => {
  const s = run(play, at(-1), { type: "autofill" });
  expect(s.past).toHaveLength(1);
  const solution = [...SOLUTION].map(Number);
  givens.forEach((g, i) => {
    if (g) expect(s.cells[i].notes).toEqual([]);
    else {
      expect(s.cells[i].notes).toEqual(candidatesFor(givens, i));
      // Constraint candidates always include the true digit but are not the solution.
      expect(s.cells[i].notes).toContain(solution[i]);
    }
  });
  expect(s.cells.some((c) => c.notes.length > 1)).toBe(true);
  expect(run(play, s, { type: "undo" }).cells.every((c) => c.notes.length === 0)).toBe(true);
});

test("note conflicts and completed digits come from placed values", () => {
  const values = [...givens];
  const cells = emptyEditor().cells;
  cells[2] = { value: 0, notes: [5, 4], center: [3] };
  const conflicts = noteConflicts(values, cells);
  expect([...(conflicts.get(2) ?? [])].sort()).toEqual([3, 5]);
  expect(completedDigits([...SOLUTION].map(Number) as Value[]).size).toBe(9);
  expect(completedDigits(values).size).toBe(0);
});

test("default names use the highest Puzzle number and never duplicate after deletion", () => {
  let data = createDraft(emptyLibrary(), "a", NOW);
  data = createDraft(data, "b", NOW);
  expect([data.drafts.a.name, data.drafts.b.name]).toEqual(["Puzzle 1", "Puzzle 2"]);
  data = deleteRecord(data, "draft", "a");
  expect(nextPuzzleName(data)).toBe("Puzzle 3");
});

test("version 1 libraries load with defaults; new layers, timer and settings validate", () => {
  let data = startPlay(
    finishDraft(createDraft(emptyLibrary(), "d", NOW, givens), "d", "p", NOW),
    "p",
    NOW,
  );
  expect(data.sessions.p.timer).toEqual({ elapsedMs: 0, paused: false, started: true });
  const v1 = structuredClone(data) as unknown as Record<string, any>;
  v1.formatVersion = 1;
  v1.settings = { showConflicts: true, language: "en", colorMode: "dark", theme: "blue" };
  delete v1.sessions.p.timer;
  v1.sessions.p.editor.selected = 0;
  const loaded = validateLibrary(v1);
  expect(loaded.formatVersion).toBe(2);
  expect(loaded.settings).toEqual({
    ...defaultSettings(),
    showConflicts: true,
    colorMode: "dark",
    theme: "blue",
  });
  data = structuredClone(loaded);
  const session = data.sessions.p;
  session.editor = run(
    play,
    { ...session.editor, selected: 0 },
    { type: "color", color: 4 },
    { type: "select", index: 2 },
    { type: "digit", digit: 1, tool: "center" },
  );
  session.timer = { elapsedMs: 1234, paused: true, started: true };
  data.settings.shortcuts.pause = "Ctrl+Shift+P";
  expect(validateLibrary(data)).toEqual(data);
  for (const mutate of [
    (x: any) => (x.sessions.p.editor.cells[2].center = []),
    (x: any) => (x.sessions.p.editor.cells[0].color = 7),
    (x: any) => (x.sessions.p.editor.cells[0].value = 5),
    (x: any) => (x.sessions.p.timer.elapsedMs = -1),
    (x: any) => (x.settings.keypadHidden = "yes"),
    (x: any) => (x.settings.shortcuts.pause = "Ctrl+Nope"),
    (x: any) => (x.drafts.d.editor.cells[0].color = 1),
  ]) {
    const copy = structuredClone(data);
    mutate(copy);
    expect(() => validateLibrary(copy)).toThrow();
  }
});
