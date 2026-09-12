import { expect, test } from "vitest";
import {
  createDraft,
  emptyLibrary,
  finishDraft,
  startPlay,
  copyPuzzleToDraft,
} from "../../src/domain/library";
import {
  exportBackup,
  parseBackup,
  previewRestore,
  validateLibrary,
} from "../../src/domain/backup";
import { reduceEditor } from "../../src/domain/editor";
import { NOW } from "../fixtures";
const fixture = () =>
  startPlay(
    finishDraft(createDraft(emptyLibrary(), "d", NOW), "d", "p", NOW),
    "p",
    NOW,
  );
const envelope = (data = fixture()) => parseBackup(exportBackup(data, NOW));

test.each(["pt-BR", "en"])(
  "loads %s data in English without changing names or history",
  (language) => {
    const original = fixture();
    original.drafts.d.name = "Meu Sudoku";
    const stored = { ...original, settings: { showConflicts: true, language } };
    const loaded = validateLibrary(stored);
    expect(loaded.settings).toEqual({ showConflicts: true, language: "en" });
    expect(loaded.drafts).toEqual(original.drafts);
    expect(loaded.sessions).toEqual(original.sessions);
    const imported = parseBackup(
      JSON.stringify({
        format: "sudoku-engine-backup",
        version: 1,
        exportedAt: NOW,
        data: stored,
      }),
    );
    expect(imported.data).toEqual(loaded);
    expect(JSON.parse(exportBackup(loaded, NOW)).data.settings.language).toBe(
      "en",
    );
  },
);
test.each(["toString", "valueOf", "hasOwnProperty", "__defineGetter__"])(
  "rejects inherited dictionary key %s throughout lifecycle and restore",
  (key) => {
    expect(() => createDraft(emptyLibrary(), key, NOW)).toThrow();
    expect(() =>
      finishDraft(createDraft(emptyLibrary(), "d", NOW), "d", key, NOW),
    ).toThrow();
    const x = JSON.parse(exportBackup(fixture(), NOW));
    x.data.puzzles[key] = { ...x.data.puzzles.p, id: key };
    delete x.data.puzzles.p;
    x.data.drafts.d.finishedPuzzleId = key;
    delete x.data.sessions.p;
    expect(() => parseBackup(JSON.stringify(x))).toThrow();
  },
);
test("roundtrip keeps hidden notes, redo, settings; identical records skip", () => {
  const d = fixture(),
    ctx = { mode: "play" as const, givens: d.puzzles.p.definition.givens };
  let s = reduceEditor(ctx, d.sessions.p.editor, {
    type: "digit",
    digit: 2,
    corner: true,
  });
  s = reduceEditor(ctx, s, { type: "digit", digit: 5, corner: false });
  s = reduceEditor(ctx, s, { type: "undo" });
  d.sessions.p.editor = s;
  d.settings.showConflicts = true;
  const parsed = envelope(d);
  expect(parsed.data).toEqual(d);
  const preview = previewRestore(d, parsed, () => "copy", false);
  expect(preview).toMatchObject({ added: 0, copied: 0, skipped: 3 });
  expect(preview.data).toEqual(d);
});
test("changed session copies its identical puzzle and archived history branch", () => {
  const current = fixture(),
    incoming = structuredClone(current);
  incoming.sessions.p.editor.selected = 1;
  let n = 0;
  const before = structuredClone(current);
  const result = previewRestore(
    current,
    envelope(incoming),
    () => `new${++n}`,
    false,
  );
  expect(result.copied).toBe(3);
  expect(current).toEqual(before);
  const imported = Object.values(result.data.puzzles).find(
    (p) => p.id !== "p",
  )!;
  expect(result.data.sessions[imported.id].editor.selected).toBe(1);
  expect(
    Object.values(result.data.drafts).some(
      (d) => d.id !== "d" && d.finishedPuzzleId === imported.id,
    ),
  ).toBe(true);
  expect(validateLibrary(result.data)).toEqual(result.data);
});
test("changed puzzle remaps two draft links and retries generated collisions", () => {
  let incoming = copyPuzzleToDraft(fixture(), "p", "copy", NOW);
  incoming.puzzles.p.name = "Changed";
  const ids = ["p", "d", "fresh-p", "copy", "fresh-d"];
  const result = previewRestore(
    fixture(),
    envelope(incoming),
    () => ids.shift()!,
    false,
  );
  expect(result.data.drafts.copy.sourcePuzzleId).toBe("fresh-p");
  expect(result.data.drafts["fresh-d"].finishedPuzzleId).toBe("fresh-p");
  expect(result.data.puzzles.p.name).toBe("Untitled");
});
test("settings remain local unless requested; revision remains local", () => {
  const current = emptyLibrary();
  current.revision = 4;
  const incoming = emptyLibrary();
  incoming.revision = 99;
  incoming.settings.showConflicts = true;
  expect(
    previewRestore(current, envelope(incoming), () => "x", false).data,
  ).toMatchObject({ revision: 4, settings: { showConflicts: false } });
  expect(
    previewRestore(current, envelope(incoming), () => "x", true).data.settings
      .showConflicts,
  ).toBe(true);
});
test.each([
  (x: any) => (x.version = 2),
  (x: any) => (x.data.formatVersion = 2),
  (x: any) => x.data.drafts.d.editor.cells.pop(),
  (x: any) => (x.data.drafts.d.editor.cells[0].notes = [2]),
  (x: any) => (x.data.sessions.p.editor.cells[0].notes = [2, 2]),
  (x: any) => (x.data.sessions.p.editor.selected = 81),
  (x: any) => (x.data.puzzles.p.definition.givens[0] = 10),
  (x: any) => (x.data.drafts.d.finishedPuzzleId = "missing"),
  (x: any) => (x.data.sessions.p.puzzleId = "wrong"),
  (x: any) => (x.data.drafts.d.createdAt = "yesterday"),
  (x: any) => (x.data.drafts.d.id = "wrong"),
  (x: any) => (x.data.drafts.d.editor.past = [{ label: "erase", changes: [] }]),
  (x: any) =>
    Object.defineProperty(x.data.drafts, "__proto__", {
      value: x.data.drafts.d,
      enumerable: true,
    }),
])("rejects malformed payload %# without touching source", (mutate) => {
  const x = JSON.parse(exportBackup(fixture(), NOW));
  mutate(x);
  expect(() => parseBackup(JSON.stringify(x))).toThrow();
});
test("rejects inconsistent past/future and given edits even in hidden history", () => {
  const d = fixture();
  const cell = { value: 0 as const, notes: [] };
  d.sessions.p.editor.past = [
    {
      label: "digit",
      changes: [{ index: 0, before: cell, after: { value: 2, notes: [] } }],
    },
  ];
  expect(() => validateLibrary(d)).toThrow();
  d.sessions.p.editor.past = [];
  d.sessions.p.editor.future = [
    {
      label: "digit",
      changes: [{ index: 0, before: { value: 2, notes: [] }, after: cell }],
    },
  ];
  expect(() => validateLibrary(d)).toThrow();
  d.puzzles.p.definition.givens[0] = 2;
  d.drafts.d.editor.cells[0].value = 2;
  d.sessions.p.editor.future = [
    {
      label: "digit",
      changes: [{ index: 0, before: cell, after: { value: 2, notes: [] } }],
    },
  ];
  expect(() => validateLibrary(d)).toThrow();
});
