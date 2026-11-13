import {
  EDIT_LABELS,
  TOOLS,
  type CellState,
  type Digit,
  type Draft,
  type Edit,
  type EditorState,
  type LibraryData,
  type PlaySession,
  type Puzzle,
  type TimerState,
  type Value,
} from "./model";
import { normalizeSettings } from "./settings";
import {
  ATTEMPT_RING,
  RECENT_TIMES,
  RUN_RING,
  TIMED_RUN_MISSES,
  TIMED_RUN_MS,
  TRAIN_CATEGORY_PATTERN,
  type TimedRun,
  emptyTraining,
  type CategoryRecord,
  type MissedRecord,
  type PositionRecord,
  type TrainingAttempt,
  type TrainingData,
  type TrainingResult,
} from "./training";
import { sameCell } from "./editor";
import { defined, lookup } from "./invariants";
import { safeId } from "./library";
import { conflictingCells } from "./classic";
export interface BackupEnvelope {
  format: "sudoku-engine-backup";
  /** 4 since Train (D106); versions 1–3 are read and migrated. */
  version: 4;
  exportedAt: string;
  data: LibraryData;
  /**
   * False for a version 1–3 backup: it had no training section, so restoring
   * its (empty) training data would only erase the local statistics.
   */
  trainingIncluded?: boolean;
}
export interface RestorePreview {
  data: LibraryData;
  added: number;
  copied: number;
  skipped: number;
}
function requireValid(condition: unknown, message = "Invalid backup data."): asserts condition {
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
  requireValid(typeof x === "number" && Number.isSafeInteger(x) && x >= min && x <= max);
  return x;
}
function value(x: unknown): Value {
  return integer(x, 0, 9) as Value;
}
function digits(x: unknown): Digit[] {
  const list = array(x).map((n) => integer(n, 1, 9) as Digit);
  requireValid(list.every((n, i) => i === 0 || list[i - 1] < n));
  return list;
}
function cell(x: unknown, create: boolean): CellState {
  const c = object(x),
    notes = digits(c.notes),
    result: CellState = { value: value(c.value), notes };
  // Empty optional layers are omitted, never stored as [] or 0.
  if (c.center !== undefined) {
    result.center = digits(c.center);
    requireValid(result.center.length > 0);
  }
  if (c.color !== undefined) result.color = integer(c.color, 1, 6) as 1;
  requireValid(!create || (notes.length === 0 && !result.center && !result.color));
  return result;
}
/** Given cells hold no player value or notes; only a background color. */
const blankGiven = (c: CellState) => c.value === 0 && c.notes.length === 0 && !c.center;
function editor(
  x: unknown,
  create: boolean,
  givens: readonly Value[] = Array(81).fill(0),
): EditorState {
  const e = object(x),
    cells = array(e.cells).map((c) => cell(c, create));
  requireValid(cells.length === 81);
  const selected = integer(e.selected, -1, 80);
  // Older backups predate multi-selection; treat a missing field as "none".
  const extraSelected =
    e.extraSelected === undefined
      ? []
      : [...new Set(array(e.extraSelected).map((i) => integer(i, 0, 80)))].filter(
          (i) => i !== selected,
        );
  requireValid((TOOLS as readonly unknown[]).includes(e.tool));
  const parseEdits = (x: unknown): Edit[] =>
    array(x).map((raw) => {
      const r = object(raw);
      requireValid((EDIT_LABELS as readonly string[]).includes(string(r.label)));
      const seen = new Set<number>();
      const changes = array(r.changes).map((rawChange) => {
        const c = object(rawChange),
          index = integer(c.index, 0, 80);
        requireValid(!seen.has(index));
        seen.add(index);
        const before = cell(c.before, create),
          after = cell(c.after, create);
        requireValid(
          !sameCell(before, after) && (!givens[index] || (blankGiven(before) && blankGiven(after))),
        );
        return { index, before, after };
      });
      requireValid(changes.length > 0);
      return { label: r.label as Edit["label"], changes };
    });
  const past = parseEdits(e.past),
    future = parseEdits(e.future);
  for (let i = 0; i < 81; i++) if (givens[i]) requireValid(blankGiven(cells[i]));
  const replay = (edits: Edit[], backward: boolean) => {
    const state = structuredClone(cells);
    for (const edit of [...edits].reverse())
      for (const change of edit.changes) {
        requireValid(
          sameCell(state[change.index], backward ? change.after : change.before),
          "Inconsistent history.",
        );
        state[change.index] = backward ? change.before : change.after;
      }
  };
  replay(past, true);
  replay(future, false);
  return {
    cells,
    selected,
    extraSelected,
    tool: e.tool as EditorState["tool"],
    past,
    future,
  };
}
const RESULTS: readonly TrainingResult[] = ["correct", "miss"];
const POSITION_ID = /^[0-9a-f]{16}$/;
function positionId(x: unknown): string {
  const s = string(x);
  requireValid(POSITION_ID.test(s));
  return s;
}
function category(x: unknown): string {
  const s = string(x);
  requireValid(TRAIN_CATEGORY_PATTERN.test(s));
  return s;
}
const ms = (x: unknown) => integer(x, 0, Number.MAX_SAFE_INTEGER);
const bestMs = (x: unknown) => (x === null ? null : ms(x));
function result(x: unknown): TrainingResult {
  requireValid((RESULTS as readonly unknown[]).includes(x));
  return x as TrainingResult;
}
/** The Train section (D106); a library before version 4 has none and starts empty. */
function training(x: unknown, version: number): TrainingData {
  // Older versions never wrote the section; anything there is ignored.
  if (version < 4) return emptyTraining();
  const t = object(x),
    attemptCount = integer(t.attemptCount, 0, Number.MAX_SAFE_INTEGER),
    streak = integer(t.streak, 0, attemptCount),
    longestStreak = integer(t.longestStreak, streak, attemptCount);
  const categories: Record<string, CategoryRecord> = {};
  for (const [key, raw] of Object.entries(object(t.categories))) {
    const c = object(raw),
      attempts = integer(c.attempts, 1, attemptCount),
      correct = integer(c.correct, 0, attempts),
      recentMs = array(c.recentMs).map(ms),
      best = bestMs(c.bestMs);
    requireValid(
      (best === null) === (correct === 0) &&
        recentMs.length <= Math.min(correct, RECENT_TIMES) &&
        (correct === 0 || recentMs.length > 0) &&
        recentMs.every((time) => best !== null && time >= best),
    );
    categories[category(key)] = { attempts, correct, bestMs: best, recentMs };
  }
  const positions: Record<string, PositionRecord> = {};
  for (const [key, raw] of Object.entries(object(t.positions))) {
    const p = object(raw),
      attempts = integer(p.attempts, 1, attemptCount),
      correct = integer(p.correct, 0, attempts),
      last = result(p.last),
      best = bestMs(p.bestMs);
    requireValid(
      (best === null) === (correct === 0) &&
        (last === "correct" ? correct > 0 : correct < attempts),
    );
    positions[positionId(key)] = { attempts, correct, last, bestMs: best };
  }
  const missed: MissedRecord[] = array(t.missed).map((raw) => {
    const m = object(raw);
    return { position: positionId(m.position), due: integer(m.due, 1, Number.MAX_SAFE_INTEGER) };
  });
  requireValid(
    new Set(missed.map((m) => m.position)).size === missed.length &&
      missed.every((m) => positions[m.position]?.last === "miss"),
  );
  const attempts: TrainingAttempt[] = array(t.attempts).map((raw) => {
    const a = object(raw);
    return {
      position: positionId(a.position),
      category: category(a.category),
      at: date(a.at),
      ms: ms(a.ms),
      result: result(a.result),
      cell: integer(a.cell, 0, 80),
      digit: integer(a.digit, 1, 9),
    };
  });
  requireValid(attempts.length <= Math.min(ATTEMPT_RING, attemptCount));
  const r = object(t.runs),
    count = integer(r.count, 0, Number.MAX_SAFE_INTEGER),
    recent: TimedRun[] = array(r.recent).map((raw) => {
      const run = object(raw),
        misses = integer(run.misses, 0, TIMED_RUN_MISSES);
      return {
        at: date(run.at),
        solved: integer(run.solved, 0, attemptCount),
        misses,
        ms: integer(run.ms, 0, TIMED_RUN_MS),
      };
    }),
    best = integer(r.best, 0, attemptCount);
  requireValid(
    recent.length <= Math.min(count, RUN_RING) &&
      (count === 0) === (recent.length === 0) &&
      // A run also ends early when the selected categories run out of positions.
      recent.every((run) => run.solved <= best),
  );
  const runs = { count, best, recent };
  return { attemptCount, streak, longestStreak, categories, positions, missed, attempts, runs };
}
export function validateLibrary(input: unknown): LibraryData {
  const x = object(input);
  // Older versions migrate by giving missing settings their defaults.
  requireValid(
    x.formatVersion === 1 ||
      x.formatVersion === 2 ||
      x.formatVersion === 3 ||
      x.formatVersion === 4,
    "Unsupported data version.",
  );
  const revision = integer(x.revision, 0, Number.MAX_SAFE_INTEGER - 1),
    puzzles: Record<string, Puzzle> = {},
    drafts: Record<string, Draft> = {},
    sessions: Record<string, PlaySession> = {};
  for (const [key, raw] of Object.entries(object(x.puzzles))) {
    id(key);
    const p = object(raw);
    requireValid(id(p.id) === key);
    const d = object(p.definition);
    requireValid(d.kind === "classic" && d.version === 1 && d.width === 9 && d.height === 9);
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
    if (draft.finishedPuzzleId) {
      const finished = lookup(puzzles, draft.finishedPuzzleId);
      requireValid(
        finished !== undefined &&
          draft.editor.cells.every((c, i) => c.value === finished.definition.givens[i]),
      );
    }
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
    if (s.timer !== undefined) {
      const t = object(s.timer);
      requireValid(typeof t.paused === "boolean" && typeof t.started === "boolean");
      const timer: TimerState = {
        elapsedMs: integer(t.elapsedMs, 0, Number.MAX_SAFE_INTEGER),
        paused: t.paused as boolean,
        started: t.started as boolean,
      };
      sessions[key].timer = timer;
    }
  }
  const settings = normalizeSettings(object(x.settings), () => {
    throw new Error("Invalid backup data.");
  });
  return {
    formatVersion: 4,
    revision,
    drafts,
    puzzles,
    sessions,
    settings,
    training: training(x.training, x.formatVersion as number),
  };
}
export function parseBackup(text: string): BackupEnvelope {
  const x = object(JSON.parse(text));
  requireValid(
    x.format === "sudoku-engine-backup" &&
      (x.version === 1 || x.version === 2 || x.version === 3 || x.version === 4),
    "Backup format or version is not supported.",
  );
  return {
    format: "sudoku-engine-backup",
    version: 4,
    exportedAt: date(x.exportedAt),
    data: validateLibrary(x.data),
    trainingIncluded: x.version === 4,
  };
}
export function exportBackup(data: LibraryData, now: string): string {
  return JSON.stringify(
    {
      format: "sudoku-engine-backup",
      version: 4,
      exportedAt: date(now),
      data: validateLibrary(data),
    },
    null,
    2,
  );
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function previewRestore(
  current: LibraryData,
  incoming: BackupEnvelope,
  nextId: () => string,
  restoreSettings: boolean,
  /** Train (D106): replace the local training statistics with the backup's. */
  restoreTraining = false,
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
  // Every source puzzle receives a target id here, so the lookups below cannot miss.
  const targetOf = (puzzleId: string) => defined(puzzleIds.get(puzzleId), "target-puzzle-id");
  for (const p of Object.values(source.puzzles)) {
    const existing = lookup(local.puzzles, p.id),
      session = lookup(source.sessions, p.id),
      localSession = lookup(local.sessions, p.id);
    const conflict =
      Object.hasOwn(local.drafts, p.id) ||
      (existing && !equal(existing, p)) ||
      (session && localSession && !equal(session, localSession));
    puzzleIds.set(p.id, conflict ? allocate() : p.id);
  }
  for (const p of Object.values(source.puzzles)) {
    const target = targetOf(p.id);
    if (target !== p.id) {
      data.puzzles[target] = { ...p, id: target };
      result.copied++;
    } else if (Object.hasOwn(local.puzzles, target)) result.skipped++;
    else {
      data.puzzles[target] = p;
      result.added++;
    }
  }
  for (const d of Object.values(source.drafts)) {
    const remapped = { ...d };
    if (d.sourcePuzzleId) remapped.sourcePuzzleId = targetOf(d.sourcePuzzleId);
    if (d.finishedPuzzleId) remapped.finishedPuzzleId = targetOf(d.finishedPuzzleId);
    const existing = lookup(local.drafts, d.id);
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
    const target = targetOf(s.puzzleId);
    if (target !== s.puzzleId) {
      data.sessions[target] = { ...s, puzzleId: target };
      result.copied++;
    } else if (Object.hasOwn(local.sessions, target)) result.skipped++;
    else {
      data.sessions[target] = s;
      result.added++;
    }
  }
  if (restoreSettings) data.settings = source.settings;
  if (restoreTraining && incoming.trainingIncluded !== false) data.training = source.training;
  result.data = validateLibrary(data);
  return result;
}
