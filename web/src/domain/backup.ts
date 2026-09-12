import type {
  CellState,
  Digit,
  Draft,
  Edit,
  EditorState,
  LibraryData,
  PlaySession,
  Puzzle,
  Value,
} from "./model";
import { sameCell } from "./editor";
import { safeId } from "./library";
import { conflictingCells } from "./classic";
export interface BackupEnvelope {
  format: "sudoku-engine-backup";
  version: 1;
  exportedAt: string;
  data: LibraryData;
}
export interface RestorePreview {
  data: LibraryData;
  added: number;
  copied: number;
  skipped: number;
}
function requireValid(
  condition: unknown,
  message = "Invalid backup data.",
): asserts condition {
  if (!condition) throw new Error(message);
}
function object(x: unknown): Record<string, unknown> {
  requireValid(
    x !== null &&
      typeof x === "object" &&
      !Array.isArray(x) &&
      [Object.prototype, null].includes(Object.getPrototypeOf(x)),
  );
  return x as Record<string, unknown>;
}
function array(x: unknown): unknown[] {
  requireValid(Array.isArray(x));
  return x;
}
function string(x: unknown): string {
  requireValid(typeof x === "string");
  return x;
}
function id(x: unknown): string {
  const s = string(x);
  requireValid(safeId(s));
  return s;
}
function date(x: unknown): string {
  const s = string(x);
  requireValid(
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s) &&
      Number.isFinite(Date.parse(s)) &&
      new Date(s).toISOString() === s,
  );
  return s;
}
function integer(x: unknown, min: number, max: number): number {
  requireValid(
    typeof x === "number" && Number.isSafeInteger(x) && x >= min && x <= max,
  );
  return x;
}
function value(x: unknown): Value {
  return integer(x, 0, 9) as Value;
}
function cell(x: unknown, create: boolean): CellState {
  const c = object(x),
    notes = array(c.notes).map((n) => integer(n, 1, 9) as Digit);
  requireValid(
    notes.every((n, i) => i === 0 || notes[i - 1] < n) &&
      (!create || notes.length === 0),
  );
  return { value: value(c.value), notes };
}
function editor(
  x: unknown,
  create: boolean,
  givens: readonly Value[] = Array(81).fill(0),
): EditorState {
  const e = object(x),
    cells = array(e.cells).map((c) => cell(c, create));
  requireValid(cells.length === 81);
  const selected = integer(e.selected, 0, 80);
  requireValid(e.tool === "value" || e.tool === "corner");
  const parseEdits = (x: unknown): Edit[] =>
    array(x).map((raw) => {
      const r = object(raw);
      requireValid(
        ["digit", "note", "erase", "reset"].includes(string(r.label)),
      );
      const seen = new Set<number>();
      const changes = array(r.changes).map((rawChange) => {
        const c = object(rawChange),
          index = integer(c.index, 0, 80);
        requireValid(!seen.has(index) && !givens[index]);
        seen.add(index);
        const before = cell(c.before, create),
          after = cell(c.after, create);
        requireValid(!sameCell(before, after));
        return { index, before, after };
      });
      requireValid(changes.length > 0);
      return { label: r.label as Edit["label"], changes };
    });
  const past = parseEdits(e.past),
    future = parseEdits(e.future);
  for (let i = 0; i < 81; i++)
    if (givens[i])
      requireValid(cells[i].value === 0 && cells[i].notes.length === 0);
  const replay = (edits: Edit[], backward: boolean) => {
    const state = structuredClone(cells);
    for (const edit of [...edits].reverse())
      for (const change of edit.changes) {
        requireValid(
          sameCell(
            state[change.index],
            backward ? change.after : change.before,
          ),
          "Inconsistent history.",
        );
        state[change.index] = backward ? change.before : change.after;
      }
  };
  replay(past, true);
  replay(future, false);
  return { cells, selected, tool: e.tool, past, future };
}
export function validateLibrary(input: unknown): LibraryData {
  const x = object(input);
  requireValid(x.formatVersion === 1, "Unsupported data version.");
  const revision = integer(x.revision, 0, Number.MAX_SAFE_INTEGER - 1),
    puzzles: Record<string, Puzzle> = {},
    drafts: Record<string, Draft> = {},
    sessions: Record<string, PlaySession> = {};
  for (const [key, raw] of Object.entries(object(x.puzzles))) {
    id(key);
    const p = object(raw);
    requireValid(id(p.id) === key);
    const d = object(p.definition);
    requireValid(
      d.kind === "classic" &&
        d.version === 1 &&
        d.width === 9 &&
        d.height === 9,
    );
    const givens = array(d.givens).map(value);
    requireValid(givens.length === 81 && conflictingCells(givens).length === 0);
    puzzles[key] = {
      id: key,
      name: string(p.name),
      createdAt: date(p.createdAt),
      definition: { kind: "classic", version: 1, width: 9, height: 9, givens },
    };
  }
  for (const [key, raw] of Object.entries(object(x.drafts))) {
    id(key);
    const d = object(raw);
    requireValid(id(d.id) === key && !Object.hasOwn(puzzles, key));
    const draft: Draft = {
      id: key,
      name: string(d.name),
      createdAt: date(d.createdAt),
      updatedAt: date(d.updatedAt),
      editor: editor(d.editor, true),
    };
    for (const link of ["sourcePuzzleId", "finishedPuzzleId"] as const)
      if (d[link] !== undefined) {
        const target = id(d[link]);
        requireValid(Object.hasOwn(puzzles, target));
        draft[link] = target;
      }
    if (draft.finishedPuzzleId)
      requireValid(
        draft.editor.cells.every(
          (c, i) =>
            c.value === puzzles[draft.finishedPuzzleId!].definition.givens[i],
        ),
      );
    drafts[key] = draft;
  }
  for (const [key, raw] of Object.entries(object(x.sessions))) {
    id(key);
    const s = object(raw);
    requireValid(id(s.puzzleId) === key && Object.hasOwn(puzzles, key));
    sessions[key] = {
      puzzleId: key,
      updatedAt: date(s.updatedAt),
      editor: editor(s.editor, false, puzzles[key].definition.givens),
    };
  }
  const settings = object(x.settings);
  requireValid(
    typeof settings.showConflicts === "boolean" &&
      (settings.language === "pt-BR" || settings.language === "en"),
  );
  return {
    formatVersion: 1,
    revision,
    drafts,
    puzzles,
    sessions,
    settings: { showConflicts: settings.showConflicts, language: "en" },
  };
}
export function parseBackup(text: string): BackupEnvelope {
  const x = object(JSON.parse(text));
  requireValid(
    x.format === "sudoku-engine-backup" && x.version === 1,
    "Backup format or version is not supported.",
  );
  return {
    format: "sudoku-engine-backup",
    version: 1,
    exportedAt: date(x.exportedAt),
    data: validateLibrary(x.data),
  };
}
export function exportBackup(data: LibraryData, now: string): string {
  return JSON.stringify(
    {
      format: "sudoku-engine-backup",
      version: 1,
      exportedAt: date(now),
      data: validateLibrary(data),
    },
    null,
    2,
  );
}
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function previewRestore(
  current: LibraryData,
  incoming: BackupEnvelope,
  nextId: () => string,
  restoreSettings: boolean,
): RestorePreview {
  const local = validateLibrary(current),
    source = validateLibrary(incoming.data);
  const data = structuredClone(local),
    result: RestorePreview = { data, added: 0, copied: 0, skipped: 0 };
  // Reserve every original ID before allocating copies, so later incoming records cannot collide.
  const reserved = new Set([
    ...Object.keys(local.puzzles),
    ...Object.keys(local.drafts),
    ...Object.keys(source.puzzles),
    ...Object.keys(source.drafts),
  ]);
  const allocate = (): string => {
    for (let tries = 0; tries < 10000; tries++) {
      const fresh = nextId();
      if (typeof fresh === "string" && safeId(fresh) && !reserved.has(fresh)) {
        reserved.add(fresh);
        return fresh;
      }
    }
    throw new Error("Could not create identifiers for the copies.");
  };
  const puzzleIds = new Map<string, string>();
  for (const p of Object.values(source.puzzles)) {
    const existing = local.puzzles[p.id],
      session = source.sessions[p.id],
      localSession = local.sessions[p.id];
    const conflict =
      Object.hasOwn(local.drafts, p.id) ||
      (existing && !equal(existing, p)) ||
      (session && localSession && !equal(session, localSession));
    puzzleIds.set(p.id, conflict ? allocate() : p.id);
  }
  for (const p of Object.values(source.puzzles)) {
    const target = puzzleIds.get(p.id)!;
    if (target !== p.id) {
      data.puzzles[target] = { ...p, id: target };
      result.copied++;
    } else if (local.puzzles[target]) result.skipped++;
    else {
      data.puzzles[target] = p;
      result.added++;
    }
  }
  for (const d of Object.values(source.drafts)) {
    const remapped = { ...d };
    if (d.sourcePuzzleId)
      remapped.sourcePuzzleId = puzzleIds.get(d.sourcePuzzleId)!;
    if (d.finishedPuzzleId)
      remapped.finishedPuzzleId = puzzleIds.get(d.finishedPuzzleId)!;
    const existing = local.drafts[d.id];
    if (existing && equal(existing, remapped)) result.skipped++;
    else if (existing || Object.hasOwn(local.puzzles, d.id)) {
      const target = allocate();
      data.drafts[target] = { ...remapped, id: target };
      result.copied++;
    } else {
      data.drafts[d.id] = remapped;
      result.added++;
    }
  }
  for (const s of Object.values(source.sessions)) {
    const target = puzzleIds.get(s.puzzleId)!;
    if (target !== s.puzzleId) {
      data.sessions[target] = { ...s, puzzleId: target };
      result.copied++;
    } else if (local.sessions[target]) result.skipped++;
    else {
      data.sessions[target] = s;
      result.added++;
    }
  }
  if (restoreSettings) data.settings = source.settings;
  result.data = validateLibrary(data);
  return result;
}
