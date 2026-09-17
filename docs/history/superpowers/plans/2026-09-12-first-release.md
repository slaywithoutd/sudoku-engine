# First Usable Release Implementation Plan

_Historical record, kept as written on 2026-09-12. Branch and worktree names it mentions no longer exist; everything is on `master`._

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Follow the active session's delegation rules; inline execution is sufficient and does not require adding agents.

**Goal:** Deliver the approved local classic Sudoku creator/player with a personal library, durable undo/redo, and JSON backups.

**Architecture:** Build a browser-owned TypeScript application with pure domain operations, a native IndexedDB repository, and plain DOM view modules. Keep finished puzzle definitions separate from authoring and play state. Place the new application in `web/`; retain the existing Spring source as a historical reference while changing the documented entry point to Vite.

**Tech Stack:** TypeScript 7.0.2, Vite 8.3.0, native IndexedDB, Vitest 5.0.0, fake-indexeddb 6.2.5, Playwright Test 1.63.0, Node 24.19.0/npm 11.17.0 baseline. No runtime UI framework or storage wrapper is required.

**Spec:** [Approved first-release behavior](../specs/2026-09-12-first-release-design.md) and [platform architecture](../specs/2026-09-12-platform-design.md).

**Status:** COMPLETE, 2026-09-12. All ten tasks were implemented on local branch release/first-release, based on 7c9512b. Verified implementation commit: 66b8381. Clean install, typecheck, 54 unit/storage/controller tests, production build and 20 Chromium tests passed. See [actual release evidence](../../release-verification.md) and [resume handoff](../../../README.md). The steps and examples below retain the execution contract; checked boxes record completed work.

## Global Constraints

- Localhost desktop-browser application with a start menu, classic 9×9 creator/player, personal saved-puzzle list, and basic Settings.
- Solve and community Explore identify future features.
- Shift temporarily enters corner notes. Select one cell at a time.
- Arrows wrap within the same row/column; given clues are selectable but locked in play.
- Player digits hide existing notes, and erasing the digit reveals them.
- Notes are manual, without automatic peer cleanup.
- Creation always highlights conflicts and blocks Finish while conflicts exist; drafts autosave anyway.
- Play conflict highlighting is off by default and configurable.
- Undo reverses edits, erases, and resets, restores notes, ignores navigation, and persists separately for drafts and play sessions.
- Settings initially contains the play conflict-highlighting switch and backup export/import.
- Keep the existing Portuguese UI language initially; documentation may stay in English.
- No theme customization is required for this release.
- No solver, gameplay hints, variant editor, community backend, or AI runtime in this release. The solver's future worker boundary does not require an empty worker implementation now.
- Application input must not wait for HTTP validation or an IndexedDB write before updating the board.
- Use `http://localhost:5173` for personal data; tests exclusively use `http://127.0.0.1:5174` and isolated browser profiles.
- Preserve user changes and existing repository files. Do not recursively delete/move the Spring project or personal browser data.

---

## Repository baseline and file map

Inspected baseline: commit `a45d465`, Java 17/Spring Boot static frontend in `src/main/resources/static/`, classic validators under `src/main/java/com/sudoku/validation/`, no checked-in solver or persistent puzzle data. See [baseline](../../../decisions.md#d098---remove-legacy-javaspring-prototype).

Read any current `AGENTS.md` and inspect `git status --short` before execution. Recheck the actual baseline if another chat has made changes. Create an isolated working branch/worktree at execution time if needed, using the applicable skill; do not mix unrelated edits into task commits.

| File or group | Responsibility |
| --- | --- |
| `web/package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `playwright.config.ts` | Reproducible tooling and separate unit/browser test execution. |
| `web/index.html`, `src/main.ts`, `src/styles.css` | Browser entry, bootstrap, visual tokens/layout. |
| `web/src/domain/model.ts` | Serializable classic puzzle, editor, library, and history types. |
| `web/src/domain/classic.ts` | Conflict cells, completion, string import, effective values. |
| `web/src/domain/editor.ts` | Pure edits, note layering, navigation, undo/redo. |
| `web/src/domain/library.ts` | Draft lifecycle, Finish, resume, rename, copy, reset and delete boundaries. |
| `web/src/domain/backup.ts` | Runtime validation, export envelope, restore preview and graph remapping. |
| `web/src/storage/repository.ts` | Native IndexedDB transactions, revision conflict detection, close/upgrade handling. |
| `web/src/app/controller.ts`, `src/app/router.ts` | In-memory state, serial save queue, navigation, action dispatch. |
| `web/src/ui/board.ts`, `src/ui/input.ts` | Accessible grid rendering and keyboard/mouse translation. |
| `web/src/ui/home.ts`, `library.ts`, `creator.ts`, `player.ts`, `settings.ts`, `dialogs.ts` | Screen composition and user feedback; no independent business rules. |
| `web/tests/unit/`, `tests/storage/`, `tests/e2e/`, `tests/browser/`, `tests/fixtures.ts` | Behavioral fixtures and test suites/harnesses. |
| Root `README.md`, `.gitignore`, `docs/README.md` | Startup instructions, generated-file exclusions, final handoff. |

Files are assigned by responsibility, not a requirement to fill every file with boilerplate. Every named public contract below must be defined in the owning task; UI-only helper functions can remain private.

## Task 1 — Tooling and executable classic puzzle contract

**Files:** create tooling files, `web/index.html`, `web/src/main.ts`, `web/src/domain/model.ts`, `web/src/domain/classic.ts`, `web/tests/unit/classic.test.ts`, `web/tests/fixtures.ts`; modify root `.gitignore`.

**Consumes:** baseline classic row/column/box behavior for reference.

**Produces:** domain types below; `emptyEditor(): EditorState`, `parsePuzzleString(text: string): Value[]`, `conflictingCells(values: readonly Value[]): number[]`, `isComplete(values: readonly Value[]): boolean`, `effectiveValues(editor: EditorState, givens: readonly Value[]): Value[]`.

- [x] Create `web/` without altering the Spring tree. Initialize the package as private ESM, then install exact development pins inside `web/`:

```powershell
npm install --save-dev --save-exact typescript@7.0.2 vite@8.3.0 vitest@5.0.0 @playwright/test@1.63.0 fake-indexeddb@6.2.5 @types/node@24.13.4
npx playwright install chromium
```

Use these package fields; the installation writes the pinned `devDependencies` and lockfile:

```json
{
  "name": "sudoku-platform",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "typecheck": "tsc --noEmit",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:serve": "vite --host 127.0.0.1 --port 5174 --strictPort"
  }
}
```

```ts
// web/vite.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  server: { host: 'localhost', port: 5173, strictPort: true },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/storage/**/*.test.ts'],
  },
});
```

```json
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext", "moduleResolution": "Bundler", "strict": true,
    "noEmit": true, "isolatedModules": true, "skipLibCheck": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "tests", "vite.config.ts", "playwright.config.ts"]
}
```

```ts
// web/playwright.config.ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://127.0.0.1:5174', browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run test:serve', url: 'http://127.0.0.1:5174',
    reuseExistingServer: false, timeout: 30_000,
  },
});
```

- [x] Define the serializable model. Arrays have runtime shape validation; do not rely on TypeScript to validate imported JSON. The `finishedPuzzleId` link retains completed authoring history without allowing mutation of a finished puzzle.

```ts
export type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type Value = 0 | Digit;
export type Tool = 'value' | 'corner';
export interface CellState { value: Value; notes: Digit[] }
export interface CellChange { index: number; before: CellState; after: CellState }
export interface Edit { label: 'digit' | 'note' | 'erase' | 'reset'; changes: CellChange[] }
export interface EditorState {
  cells: CellState[]; selected: number; tool: Tool; past: Edit[]; future: Edit[];
}
export interface EditorContext { mode: 'create' | 'play'; givens: readonly Value[] }
export interface ClassicDefinition {
  kind: 'classic'; version: 1; width: 9; height: 9;
  givens: Value[];
}
export interface Draft {
  id: string; name: string; createdAt: string; updatedAt: string;
  editor: EditorState; sourcePuzzleId?: string; finishedPuzzleId?: string;
}
export interface Puzzle {
  id: string; name: string; createdAt: string; definition: ClassicDefinition;
}
export interface PlaySession { puzzleId: string; updatedAt: string; editor: EditorState }
export interface Settings { showConflicts: boolean; language: 'pt-BR' }
export interface LibraryData {
  formatVersion: 1; revision: number;
  drafts: Record<string, Draft>; puzzles: Record<string, Puzzle>;
  sessions: Record<string, PlaySession>; settings: Settings;
}
export function emptyEditor(): EditorState {
  return { cells: Array.from({ length: 81 }, () => ({ value: 0, notes: [] })),
    selected: 0, tool: 'value', past: [], future: [] };
}
```

- [x] Add independent fixtures and failing rule/import tests. Put fixture constants in `tests/fixtures.ts` for later tasks:

```ts
export const SOLUTION = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
export const PUZZLE = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
```

```ts
import { expect, test } from 'vitest';
import { parsePuzzleString, conflictingCells, isComplete } from '../../src/domain/classic';
import { SOLUTION } from '../fixtures';
test('import and classic validity are distinct contracts', () => {
  expect(parsePuzzleString('.'.repeat(81))).toEqual(Array(81).fill(0));
  expect(() => parsePuzzleString('0'.repeat(80))).toThrow();
  expect(() => parsePuzzleString('0'.repeat(80) + 'x')).toThrow();
  const conflict = parsePuzzleString('11' + '0'.repeat(79));
  expect(conflictingCells(conflict)).toEqual([0, 1]);
  expect(isComplete(parsePuzzleString(SOLUTION))).toBe(true);
  expect(isComplete(parsePuzzleString('0'.repeat(81)))).toBe(false);
});
```

- [x] Run `npm test -- tests/unit/classic.test.ts`; expect failure because the parser/checker behavior is absent. Implement the parser and unit-based duplicate collection; add cases for column-only/box-only conflicts and whitespace.

```ts
export function parsePuzzleString(text: string): Value[] {
  const normalized = text.replace(/\s/g, '');
  if (!/^[1-9.0]{81}$/.test(normalized)) throw new Error('Informe exatamente 81 células: 1–9, 0 ou ponto.');
  return [...normalized].map(c => c === '.' ? 0 : Number(c) as Value);
}
// Build 9 row, 9 column, and 9 box index arrays. For every unit, group
// nonzero values by digit and add every index in groups of length > 1
// to a Set. Return its numeric sort; a cell may conflict in several units.
```

The unit construction is concrete:

```ts
const units: number[][] = [];
for (let n = 0; n < 9; n++) {
  units.push(Array.from({ length: 9 }, (_, c) => n * 9 + c));
  units.push(Array.from({ length: 9 }, (_, r) => r * 9 + n));
  const br = Math.floor(n / 3) * 3, bc = (n % 3) * 3;
  units.push(Array.from({ length: 9 }, (_, k) => (br + Math.floor(k / 3)) * 9 + bc + k % 3));
}
```

- [x] Run the focused tests, `npm run typecheck`, and `npm run build`. `index.html` uses `lang="pt-BR"` and imports `/src/main.ts`; bootstrap only the app root at this task. Add `web/node_modules/`, `web/dist/`, `web/test-results/`, and `web/playwright-report/` to `.gitignore`, preserving existing entries. Commit this testable foundation with an explicit file list.

## Task 2 — Reversible board edits and navigation

**Files:** create `web/src/domain/editor.ts`, `web/tests/unit/editor.test.ts`.

**Consumes:** Task 1 models, `emptyEditor()`.

**Produces:** `reduceEditor(context: EditorContext, state: EditorState, action: BoardAction): EditorState`; immutable action union below. No DOM, database, selection history, or automatic peer cleanup.

```ts
export type BoardAction =
  | { type: 'digit'; digit: Digit; corner: boolean }
  | { type: 'erase' } | { type: 'reset' } | { type: 'undo' } | { type: 'redo' }
  | { type: 'select'; index: number }
  | { type: 'move'; dr: number; dc: number }
  | { type: 'tool'; tool: Tool };
```

- [x] Add a failing regression test for hidden notes, layered erasure, and undo before implementing actions:

```ts
import { expect, test } from 'vitest';
import { emptyEditor, type EditorContext } from '../../src/domain/model';
import { reduceEditor } from '../../src/domain/editor';
test('a value hides notes; erase reveals; undo restores value and notes', () => {
  const ctx: EditorContext = { mode: 'play', givens: Array(81).fill(0) };
  let state = reduceEditor(ctx, emptyEditor(), { type: 'digit', digit: 2, corner: true });
  state = reduceEditor(ctx, state, { type: 'digit', digit: 5, corner: false });
  expect(state.cells[0]).toEqual({ value: 5, notes: [2] });
  state = reduceEditor(ctx, state, { type: 'erase' });
  expect(state.cells[0]).toEqual({ value: 0, notes: [2] });
  state = reduceEditor(ctx, state, { type: 'undo' });
  expect(state.cells[0]).toEqual({ value: 5, notes: [2] });
  expect(state.past).toHaveLength(2);
});
```

- [x] Run `npm test -- tests/unit/editor.test.ts` and confirm the behavioral failure. Implement edits as changed-cell deltas, cloning before/after values; no-op edits return the original state and do not discard redo.

```ts
function applyEdit(state: EditorState, label: Edit['label'], changes: CellChange[]): EditorState {
  if (changes.length === 0) return state;
  const cells = state.cells.slice();
  for (const change of changes) cells[change.index] = structuredClone(change.after);
  return { ...state, cells, past: [...state.past, { label, changes: structuredClone(changes) }], future: [] };
}
function move(state: EditorState, dr: number, dc: number): EditorState {
  const row = (Math.floor(state.selected / 9) + dr + 9) % 9;
  const col = (state.selected % 9 + dc + 9) % 9;
  return { ...state, selected: row * 9 + col };
}
```

Digit action: block if a play given. In play, a corner action toggles a sorted unique note only in an empty cell; on a filled cell it is a no-op, never a replacement digit. Ordinary digit actions replace the value and retain notes. Creation interprets digit actions as clue entry regardless of the modifier. Erase: clear nonzero value first; if no value, clear notes. Reset: one edit clearing every editable cell's value and notes. Undo: pop `past`, apply `before`, push to `future`; redo pops `future`, applies `after`, and pushes to `past`. Preserve `selected`/`tool` through undo/redo. Validate indices and ignore unsupported move increments from malformed callers.

- [x] Add tests for all four edge wraps, selectable locked givens, same-digit/no-op history, note toggle repeats, notes ignored on filled cells, create mode rejecting corner-note interpretation, reset restoring multiple hidden notes in one undo, redo after navigation, and fresh edits discarding redo.

```ts
test('navigation does not consume undo and givens are immutable', () => {
  const givens = Array(81).fill(0); givens[8] = 7;
  const ctx: EditorContext = { mode: 'play', givens };
  let state = reduceEditor(ctx, emptyEditor(), { type: 'move', dr: 0, dc: -1 });
  expect(state.selected).toBe(8);
  state = reduceEditor(ctx, state, { type: 'digit', digit: 4, corner: false });
  expect(state.cells[8].value).toBe(0);
  expect(state.past).toHaveLength(0);
});
```

- [x] Run focused editor/classic tests and typecheck. Commit the domain reducer and regression tests; do not add UI or storage logic here.

## Task 3 — Draft, puzzle, and play-session lifecycle

**Files:** create `web/src/domain/library.ts`, `web/tests/unit/library.test.ts`; extend `web/tests/fixtures.ts` only with reusable data fixtures.

**Consumes:** models, classic checks/import, editor reducer.

**Produces:** `emptyLibrary(): LibraryData`, `createDraft(data, id, now, values?): LibraryData`, `finishDraft(data, draftId, puzzleId, now): LibraryData`, `startPlay(data, puzzleId, now): LibraryData`, `copyPuzzleToDraft(data, puzzleId, draftId, now): LibraryData`, `renameRecord(data, kind: 'draft'|'puzzle', id, name, now): LibraryData`, `deleteRecord(data, kind, id): LibraryData`. Every unannotated argument is `LibraryData`, string ID/ISO time, or `readonly Value[]` as applicable; returns are immutable library snapshots. IDs and clock values are supplied by the caller for deterministic tests.

- [x] Write the failing lifecycle test and run `npm test -- tests/unit/library.test.ts`:

```ts
import { expect, test } from 'vitest';
import { createDraft, emptyLibrary, finishDraft, startPlay, copyPuzzleToDraft } from '../../src/domain/library';
import { parsePuzzleString } from '../../src/domain/classic';
import { PUZZLE } from '../fixtures';
test('finish and copy preserve immutable puzzle identity and play state', () => {
  const now = '2026-09-12T12:00:00.000Z';
  let data = createDraft(emptyLibrary(), 'd1', now, parsePuzzleString(PUZZLE));
  data = finishDraft(data, 'd1', 'p1', now);
  data = startPlay(data, 'p1', now);
  const original = structuredClone(data.puzzles.p1);
  data = copyPuzzleToDraft(data, 'p1', 'd2', now);
  expect(data.puzzles.p1).toEqual(original);
  expect(data.drafts.d2.sourcePuzzleId).toBe('p1');
  expect(data.drafts.d2.editor.past).toEqual([]);
  expect(Object.keys(data.sessions)).toEqual(['p1']);
});
```

- [x] Implement initial settings and draft creation. Name blank records `Sem título`; use a trimmed nonempty name when renaming. A parsed import starts a new draft with the imported givens as its initial state, not a mutation of the current draft.

```ts
export function emptyLibrary(): LibraryData {
  return { formatVersion: 1, revision: 0, drafts: {}, puzzles: {}, sessions: {},
    settings: { showConflicts: false, language: 'pt-BR' } };
}
```

- [x] Implement Finish as an immutable transition. Reject missing/already-finished drafts, duplicate destination IDs, and conflicts. Create `ClassicDefinition` from draft cell values; retain the source draft/history with `finishedPuzzleId` and exclude it from active Drafts. Reopening that archived authoring route goes to its finished puzzle, never edits it. Empty drafts may Finish. Keep solution properties unverified; do not infer them from local checks.

```ts
const givens = draft.editor.cells.map(cell => cell.value);
const conflicts = conflictingCells(givens);
if (conflicts.length) throw new Error('Resolva os conflitos antes de finalizar.');
const puzzle: Puzzle = {
  id: puzzleId, name: draft.name, createdAt: now,
  definition: { kind: 'classic', version: 1, width: 9, height: 9, givens },
};
```

- [x] Implement resume without overwriting an existing session; new sessions have empty player values/notes/history and read givens from the definition. Copy-to-draft copies definition values and metadata name, sets `sourcePuzzleId`, and starts a fresh authoring history. Reset calls the editor's one-action reset, not session replacement.
- [x] Implement deletion through domain functions without UI prompts: deleting a puzzle deletes its session and associated archived authoring records. Independent active draft copies retain their clue data but lose the deleted puzzle's provenance link. Deleting an active draft only removes that draft. This prevents orphaned archived history from reappearing as an editable draft. UI confirmation belongs in Task 8. Add tests for no duplicate active sessions, conflicting/zero-clue Finish, archived draft immutability, rename, and reference cleanup.
- [x] Run lifecycle/classic/editor suites and typecheck; commit the lifecycle layer. Later tasks must not recreate these transitions in UI code.

## Task 4 — Runtime validation and lossless backup merge

**Files:** create `web/src/domain/backup.ts`, `web/tests/unit/backup.test.ts`.

**Consumes:** all domain record types and lifecycle fixtures.

**Produces:** `BackupEnvelope`, `RestorePreview`, `validateLibrary(value: unknown): LibraryData`, `parseBackup(text: string): BackupEnvelope`, `exportBackup(data: LibraryData, now: string): string`, `previewRestore(current: LibraryData, incoming: BackupEnvelope, nextId: () => string, restoreSettings: boolean): RestorePreview`. Preview is pure and includes `data: LibraryData`, `added: number`, `copied: number`, `skipped: number`; applying it is a later repository transaction.

```ts
export interface BackupEnvelope {
  format: 'sudoku-engine-backup'; version: 1; exportedAt: string; data: LibraryData;
}
export interface RestorePreview { data: LibraryData; added: number; copied: number; skipped: number }
```

- [x] Add failing tests for complete round-trip and atomic rejection before writing the parser:

```ts
import { expect, test } from 'vitest';
import { emptyLibrary, createDraft } from '../../src/domain/library';
import { exportBackup, parseBackup, previewRestore } from '../../src/domain/backup';
test('identical backup is skipped and malformed history is rejected', () => {
  const now = '2026-09-12T12:00:00.000Z';
  const data = createDraft(emptyLibrary(), 'd1', now);
  const parsed = parseBackup(exportBackup(data, now));
  const preview = previewRestore(data, parsed, () => 'copy-1', false);
  expect(preview.added).toBe(0);
  expect(preview.copied).toBe(0);
  expect(preview.data.drafts).toEqual(data.drafts);
  const bad = JSON.parse(exportBackup(data, now));
  bad.data.drafts.d1.editor.cells[0].notes = [12];
  expect(() => parseBackup(JSON.stringify(bad))).toThrow();
  expect(data.drafts.d1.editor.cells[0].notes).toEqual([]);
});
```

- [x] Run `npm test -- tests/unit/backup.test.ts` and confirm failure. Validate discriminants, schema versions, ordinary object structure, record key/ID agreement, timestamps, 81 cells, integers 0–9, sorted unique notes 1–9, selection 0–80, tool, booleans, definition shape and references. Reject unsupported newer versions without partial import. Produce validated objects field-by-field; reject dangerous record IDs such as `__proto__`, `prototype`, and `constructor`, and never trust imported prototypes.
- [x] Validate history as executable data: unique valid cell indices per edit, allowed labels, valid before/after cells, nonempty changes, no edits to play givens, and consistency when replaying past backward from present and future forward. Draft cells/history contain no notes. Verify finished draft values match their linked definition. Reject an envelope with invalid references or impossible history before any storage call.

```ts
function sameCell(a: CellState, b: CellState): boolean {
  return a.value === b.value && a.notes.length === b.notes.length && a.notes.every((n, i) => n === b.notes[i]);
}
// Backward validation: start from current cells, traverse past in reverse,
// require each current cell to match change.after, then replace with before.
// Forward validation: independently start at present, traverse future in
// reverse stack order, require before to match, then replace with after.
```

- [x] Implement graph-aware merge. Allocate unique IDs before remapping references. Exact same-ID/content records skip; same-ID/different-content records copy. If an imported session conflicts with the local session of an otherwise identical puzzle, copy its puzzle branch too, so both sessions remain attached to different puzzle identities. Remap session keys/puzzle IDs and draft provenance/finished links. Identical imported archived drafts whose linked puzzle branch is copied must also copy/remap. Use the current library revision; imported revision cannot overwrite the repository's revision.
- [x] Retain current settings unless `restoreSettings` is true. Cover changed-session collisions, changed-puzzle collisions, two drafts referencing one copied puzzle, duplicate IDs produced by the supplied generator (retry), invalid versions, given edits hidden in history, and preservation of hidden notes/redo. Assert the current library never mutates during preview.
- [x] Run the backup/domain tests and typecheck; commit validated backup logic. No browser download/upload UI yet.

## Task 5 — Atomic IndexedDB state/history persistence

**Files:** create `web/src/storage/repository.ts`, `web/tests/storage/repository.test.ts`.

**Consumes:** `LibraryData`, `emptyLibrary()`, `validateLibrary()`.

**Produces:** `openRepository(factory?: IDBFactory, name?: string, onBlocked?: () => void): Promise<Repository>`, `RevisionConflictError`, and the adapter contract:

```ts
export interface Repository {
  load(): Promise<LibraryData>;
  commit(data: LibraryData, expectedRevision: number): Promise<LibraryData>;
  close(): void;
}
export class RevisionConflictError extends Error {}
```

Use IndexedDB database `sudoku-engine`, database version 1, object store `library`, root key `current`. The initial personal dataset can be one versioned aggregate: it makes backups and state/history transitions atomic. The adapter hides this choice so a later measured migration can introduce per-record stores without changing domain APIs. Do not introduce a separate database per puzzle.

- [x] Write a failing test using a fresh fake factory per test. Run `npm test -- tests/storage/repository.test.ts`:

```ts
import { expect, test } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openRepository, RevisionConflictError } from '../../src/storage/repository';
import { emptyLibrary, createDraft } from '../../src/domain/library';
test('reopen retains complete state and stale revisions cannot overwrite it', async () => {
  const factory = new IDBFactory();
  const repo = await openRepository(factory, 'test-library');
  const data = createDraft(emptyLibrary(), 'd1', '2026-09-12T12:00:00.000Z');
  const saved = await repo.commit(data, 0);
  expect(saved.revision).toBe(1);
  await expect(repo.commit(emptyLibrary(), 0)).rejects.toBeInstanceOf(RevisionConflictError);
  repo.close();
  const reopened = await openRepository(factory, 'test-library');
  expect(await reopened.load()).toEqual(saved);
  reopened.close();
});
```

- [x] Open/create the store in `onupgradeneeded`, report blocked opening through the callback, close the connection on `versionchange`, and reject failed opens without clearing existing data. `load()` returns a validated current record or `emptyLibrary()` when absent. A corrupt stored record is an error with a recovery path, not a reason to reset the database.
- [x] Implement commit in one readwrite transaction. Validate the proposed data before opening the transaction. After reading current revision, compare with `expectedRevision`, allocate the next revision, and put the full aggregate. Only resolve after `oncomplete`; request success alone must never announce Saved.

```ts
function commit(db: IDBDatabase, data: LibraryData, expectedRevision: number): Promise<LibraryData> {
  const validated = validateLibrary(data);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('library', 'readwrite');
    const store = tx.objectStore('library');
    let result: LibraryData | undefined;
    let failure: Error | undefined;
    const request = store.get('current');
    request.onsuccess = () => {
      const currentRevision = request.result?.revision ?? 0;
      if (currentRevision !== expectedRevision) {
        failure = new RevisionConflictError('Os dados foram alterados em outra aba.');
        tx.abort(); return;
      }
      result = { ...validated, revision: currentRevision + 1 };
      store.put(result, 'current');
    };
    tx.oncomplete = () => result ? resolve(result) : reject(new Error('A gravação não foi concluída.'));
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('Não foi possível salvar.'));
    tx.onerror = () => { failure ??= tx.error ?? new Error('Erro ao salvar.'); };
  });
}
```

Catch synchronous exceptions inside request callbacks, assign `failure`, and abort; never leave a promise pending when `put` throws. Implement readonly load completion/error handling with the same transaction-lifecycle discipline. Do not perform timers or network work inside the transaction.

- [x] Add persistence tests containing real editor history/hidden notes and restored backup data. Test malformed data rejection leaves the previous record unchanged, competing revisions retain the winner, close/reopen works, and a failed/aborted write does not resolve as saved. Use explicit fake failure injection in the test adapter layer where browser quota cannot be simulated; do not claim that fake tests prove quota/eviction behavior.
- [x] Run storage tests, domain tests, and typecheck. Commit the adapter. The real-browser durability check is scheduled in Task 10.

## Task 6 — Application state, save queue, and navigation contracts

**Files:** create `web/src/app/controller.ts`, `web/src/app/router.ts`, `web/tests/unit/controller.test.ts`, `web/tests/unit/router.test.ts`.

**Consumes:** repository, immutable domain functions, `LibraryData`.

**Produces:** `createController(repository: Repository, initial: LibraryData): Controller`, `parseRoute(hash: string): Route`, `routeHash(route: Route): string`.

```ts
export type SaveStatus = { kind: 'saved' | 'saving' } | { kind: 'error'; error: Error };
export interface Controller {
  snapshot(): LibraryData;
  status(): SaveStatus;
  update(transform: (data: LibraryData) => LibraryData): void;
  subscribe(listener: () => void): () => void;
  flush(): Promise<void>;
  retry(): Promise<void>;
}
export type Route =
  | { screen: 'home' } | { screen: 'library'; tab: 'drafts' | 'puzzles' }
  | { screen: 'create'; id: string } | { screen: 'play'; id: string }
  | { screen: 'settings' };
```

- [x] Write a test showing that edits are visible before asynchronous commit completes and later edits are not lost. Use a controlled fake repository with the actual `Repository` contract:

```ts
import { expect, test } from 'vitest';
import { createController } from '../../src/app/controller';
import { emptyLibrary, createDraft } from '../../src/domain/library';
import type { LibraryData } from '../../src/domain/model';
test('UI state updates immediately while durable saves are serialized', async () => {
  let stored = emptyLibrary();
  const revisions: number[] = [];
  const controller = createController({
    load: async () => stored,
    commit: async (data: LibraryData, expected: number) => {
      await Promise.resolve();
      expect(expected).toBe(stored.revision);
      stored = structuredClone({ ...data, revision: expected + 1 });
      revisions.push(stored.revision); return stored;
    },
    close() {},
  }, stored);
  controller.update(data => createDraft(data, 'a', '2026-09-12T12:00:00.000Z'));
  controller.update(data => createDraft(data, 'b', '2026-09-12T12:00:00.000Z'));
  expect(Object.keys(controller.snapshot().drafts)).toEqual(['a', 'b']);
  await controller.flush();
  expect(Object.keys(stored.drafts)).toEqual(['a', 'b']);
  expect(controller.status().kind).toBe('saved');
  expect(revisions.every((n, i) => n === i + 1)).toBe(true);
});
```

- [x] Run focused tests to establish the missing behavior. Maintain live in-memory state, an edit generation, saved generation, and last committed revision. One save loop captures the latest immutable snapshot and serially commits it; coalescing pending snapshots is allowed because the latest includes the full history. Do not mark newer work saved when only an older generation completed.

```ts
// Core save-loop ordering, inside createController:
while (savedGeneration < generation) {
  const capturedGeneration = generation;
  const capturedData = data;
  const committed = await repository.commit(capturedData, committedRevision);
  committedRevision = committed.revision;
  data = { ...data, revision: committedRevision };
  savedGeneration = capturedGeneration;
  notify();
}
```

Define these closure variables explicitly in the implementation; `notify` calls a Set of subscribed listeners. Catch failures outside the loop, keep live work, expose error status, and leave work dirty. `retry()` restarts the queue for the same work. On revision conflict, require reload or export recovery instead of silently replacing the expected revision and overwriting another tab. `flush()` waits for the current dirty generation or rejects with the save error.

- [x] Add tests for old completion versus newer edits, save rejection retaining work/history, successful retry, listener unsubscribe, no-op updates not writing, and stale-revision errors remaining visible. Do not add an automatic discard/reset path.
- [x] Implement hash routes `#/`, `#/library/puzzles`, `#/library/drafts`, `#/create/<encoded-id>`, `#/play/<encoded-id>`, and `#/settings`. Unknown/malformed paths resolve Home; missing record IDs show a Portuguese message and a Library link at screen mounting. Route changes never clear unsaved in-memory edits.
- [x] Run controller/router tests and typecheck; commit the controller and routing contracts.

## Task 7 — Accessible board and unified keyboard/mouse input

**Files:** create `web/src/ui/board.ts`, `web/src/ui/input.ts`, `web/tests/browser/board.html`, `web/tests/browser/board.ts`, `web/tests/e2e/board.spec.ts`; add board styles to `web/src/styles.css`.

**Consumes:** editor state/context, reducer, classic conflict/effective-value functions.

**Produces:** `mountBoard(container: HTMLElement, options: BoardOptions): BoardView` and `digitFromEvent(event: KeyboardEvent): Digit | null`. `BoardView.update(state, showConflicts)` rerenders data; `destroy()` removes listeners.

```ts
export interface BoardOptions {
  context: EditorContext; state: EditorState; showConflicts: boolean;
  onAction: (action: BoardAction) => void;
}
export interface BoardView { update(state: EditorState, showConflicts: boolean): void; destroy(): void }
export function digitFromEvent(event: KeyboardEvent): Digit | null {
  if (/^[1-9]$/.test(event.key)) return Number(event.key) as Digit;
  const match = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
  return match ? Number(match[1]) as Digit : null;
}
```

- [x] Create a dedicated browser harness under `tests/browser/`, serving the actual board module with `emptyEditor()` and a reducer-backed callback. It is not a production app route or a duplicate renderer. Add a text field in the harness to test input focus isolation.
- [x] Write failing browser assertions and run `npm run test:e2e -- board.spec.ts` before implementing the handlers:

```ts
import { expect, test } from '@playwright/test';
test('wrap, shifted corner entry, hidden notes and undo use real keyboard events', async ({ page }) => {
  await page.goto('/tests/browser/board.html');
  const cell = page.locator('[data-cell-index="0"]');
  await cell.click();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-cell-index="8"]')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+Digit2');
  await expect(cell.locator('[data-notes]')).toHaveText('2');
  await page.keyboard.press('5');
  await expect(cell.locator('[data-value]')).toHaveText('5');
  await expect(cell.locator('[data-notes]')).toBeHidden();
  await page.keyboard.press('Backspace');
  await expect(cell.locator('[data-notes]')).toHaveText('2');
  await page.keyboard.press('Control+z');
  await expect(cell.locator('[data-value]')).toHaveText('5');
});
```

- [x] Render a grid with 81 reusable cell nodes, clear 3×3 boundaries, a separate value/notes span, `data-cell-index`, `aria-selected`, and a Portuguese label containing row/column/value/given status. Use roving focus for the selected cell. Givens render definition values and stay selectable. Update nodes in place so typing and focus are not lost on each edit. All metadata/names use `textContent`, never interpolated HTML.

```ts
const button = document.createElement('button');
button.type = 'button';
button.setAttribute('role', 'gridcell');
button.dataset.cellIndex = String(index);
button.tabIndex = index === state.selected ? 0 : -1;
button.setAttribute('aria-selected', String(index === state.selected));
button.setAttribute('aria-label', `Linha ${Math.floor(index / 9) + 1}, coluna ${index % 9 + 1}`);
```

- [x] Map keyboard and number buttons to the same actions. Handle Ctrl+Z/Y/Shift+Z before digit parsing; do not steal other Ctrl/Meta/Alt shortcuts. Shift or selected corner tool requests notes; creation always enters clues. Ignore repeated keydown toggles for notes/undo while allowing arrow repeat. Erase keys are 0/Backspace/Delete. A number-button click uses `MouseEvent.shiftKey`, avoiding a sticky global Shift flag. Selecting a cell/using keypad returns focus to the selected cell; updates from other controls must not steal input-field focus.
- [x] Limit shortcut handling to the mounted board/keypad when they own interaction. Exclude `input`, `textarea`, `select`, and contenteditable targets. Remove listeners with an `AbortController` on destroy. A name or import textarea must accept normal keys and native text undo.
- [x] Test shifted symbols on the number row, numpad codes, Shift+button, persistent note mode, note toggle/erasure layers, all wraps, no duplicate actions, locked givens, input focus isolation, and remount cleanup. Add a screenshot/manual visual check at a desktop viewport with all nine corner notes, selection, and conflicts. Unit tests remain focused on domain semantics rather than duplicating DOM classes.
- [x] Run the board browser suite, domain tests, typecheck, and build. Commit board rendering/input with its harness; do not expose the harness in app navigation.

## Task 8 — Creator, library, player, and local application shell

**Files:** create screen modules `web/src/ui/home.ts`, `library.ts`, `creator.ts`, `player.ts`, `settings.ts`, `dialogs.ts`; implement `web/src/main.ts`; create `web/tests/e2e/lifecycle.spec.ts`; extend styles.

**Consumes:** controller/router, board view, domain lifecycle/reducer, native repository.

**Produces:** working Home → Create → Finish → Library → Play flow; screen mounts return a disposer. Use shared `ScreenServices` to avoid each screen inventing persistence behavior.

```ts
export interface ScreenServices {
  controller: Controller;
  navigate: (route: Route) => void;
  newId: () => string;
  now: () => string;
}
// Export ScreenServices from src/app/controller.ts; import Route as a type.
// Each declaration below belongs in its matching ui module.
export declare function mountHome(container: HTMLElement, services: ScreenServices): () => void;
export declare function mountLibrary(container: HTMLElement, services: ScreenServices, tab: 'drafts' | 'puzzles'): () => void;
export declare function mountCreator(container: HTMLElement, services: ScreenServices, id: string): () => void;
export declare function mountPlayer(container: HTMLElement, services: ScreenServices, id: string): () => void;
export declare function mountSettings(container: HTMLElement, services: ScreenServices): () => void;
```

- [x] Write the browser lifecycle test using actual Portuguese controls. Run `npm run test:e2e -- lifecycle.spec.ts` and see the missing-screen failures:

```ts
import { expect, test } from '@playwright/test';
test('conflicting draft saves, cannot finish, and valid puzzle locks clues', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  await page.locator('[data-cell-index="0"]').click();
  await page.keyboard.press('1');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('1');
  await expect(page.getByRole('button', { name: 'Finalizar', exact: true })).toBeDisabled();
  await expect(page.getByTestId('save-status')).toHaveText('Salvo');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Finalizar', exact: true })).toBeDisabled();
  await page.locator('[data-cell-index="1"]').click();
  await page.keyboard.press('Backspace');
  await page.getByRole('button', { name: 'Finalizar', exact: true }).click();
  await page.getByRole('button', { name: 'Jogar agora', exact: true }).click();
  await page.locator('[data-cell-index="0"]').click();
  await page.keyboard.press('9');
  await expect(page.locator('[data-cell-index="0"] [data-value]')).toHaveText('1');
});
```

- [x] Bootstrap repository/load/controller once. Mount a screen on hash changes and dispose the previous screen/listeners. Each screen subscribes to update its existing nodes; do not remount the whole screen for every save-status notification. If storage opening fails, offer an in-memory session with an explicit unsaved indicator and export recovery; never claim persistence or clear an inaccessible database. Inject `crypto.randomUUID` and ISO time through services.

```ts
const repository = await openRepository(indexedDB, 'sudoku-engine', () => {
  status.textContent = 'Feche outras abas para concluir a abertura dos dados.';
});
const controller = createController(repository, await repository.load());
const services: ScreenServices = {
  controller, navigate: route => { location.hash = routeHash(route); },
  newId: () => crypto.randomUUID(), now: () => new Date().toISOString(),
};
```

- [x] Implement Home buttons `Jogar`, `Criar`, `Resolver — em breve`, and `Configurações`. Library has `Rascunhos`/`Jogos` tabs and `Explorar — em breve`. Future features are explanatory disabled controls, not fake working screens. Create allocates/saves a draft before navigation; Paste Puzzle validates into a new draft without replacing current work.
- [x] Wire creator edits through the domain reducer, retaining no-op identity so selection/edits have the intended save semantics:

```ts
function onDraftAction(action: BoardAction): void {
  services.controller.update(data => {
    const draft = data.drafts[id];
    if (!draft || draft.finishedPuzzleId) return data;
    const editor = reduceEditor({ mode: 'create', givens: Array(81).fill(0) }, draft.editor, action);
    if (editor === draft.editor) return data;
    return { ...data, drafts: { ...data.drafts,
      [id]: { ...draft, editor, updatedAt: services.now() } } };
  });
}
```

Always show conflicts and a reason when Finish is blocked. Finish calls the domain transition, then offers Play Now or Library. Mark solvability/uniqueness unverified, including for a zero-clue puzzle. Keep archived source history but never reopen it as a mutable definition.
- [x] Implement playable list open/resume, rename, `Editar cópia`, and delete confirmation. Player reads immutable givens, edits only its session, and has Notes, Erase, Undo, Redo, Reset, and Home/Library navigation. Apply reset through the reducer so it is one undoable action. Derive lifecycle badges from records/current board rather than storing contradictory duplicated flags.
- [x] Settings edits `showConflicts` in live state and persists it. Display save status (`Salvando…`, `Salvo`, or `Não salvo`) globally. Save failure exposes Retry/Export while retaining memory. Do not rebuild name/import fields on every saving-status notification; preserve cursor/focus and input composition.
- [x] Add full-board completion checking: valid full classic board shows a dismissible success message once per transition from incomplete/invalid to complete. Undo/redo can transition again. A full conflicting board stays editable; when highlighting is off, no unsolicited mistake popup appears. Completion says nothing about uniqueness.
- [x] Run lifecycle/board browser tests, all unit/storage tests, typecheck, and build. Commit the working create/play shell. Add tests for saved selection, returning Home without losing work, deleting with cancel/confirm, finished-copy independence, and configurable play conflicts versus mandatory creation conflicts.

## Task 9 — Backup/restore and failure recovery in the interface

**Files:** extend `web/src/ui/settings.ts`, `dialogs.ts`, controller integration; create `web/tests/e2e/backup.spec.ts`, `web/tests/e2e/save-failure.spec.ts`.

**Consumes:** validated backup/preview operations, controller snapshot/save status, repository commit, lifecycle operations.

**Produces:** actual JSON download/upload, restore preview with counts/settings choice, one atomic apply, and recovery export of unsaved live work.

- [x] Add a browser test that downloads a library containing a draft with history, imports it unchanged (skip), then imports a modified conflicting record (copy), preserving the original. Capture the download using Playwright rather than assuming a file was written:

```ts
const downloadPromise = page.waitForEvent('download');
await page.getByRole('button', { name: 'Exportar backup', exact: true }).click();
const download = await downloadPromise;
expect(download.suggestedFilename()).toMatch(/^sudoku-backup-.*\.json$/);
const file = await download.path();
if (!file) throw new Error('Download indisponível para verificação.');
await page.getByLabel('Importar backup').setInputFiles(file);
await expect(page.getByRole('dialog')).toContainText('Resumo da importação');
```

- [x] Run the failing browser test, then implement export from `controller.snapshot()`, including dirty in-memory work if a save failed. The export must not reload stale IndexedDB first. Use a JSON Blob, download link, and revoke the object URL after the click has been processed.

```ts
const json = exportBackup(services.controller.snapshot(), services.now());
const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
const link = document.createElement('a');
link.href = url;
link.download = `sudoku-backup-${services.now().slice(0, 10)}.json`;
link.click();
setTimeout(() => URL.revokeObjectURL(url), 0);
```

- [x] Read a chosen file, parse/validate it, and compute a pure preview. Show additions/copies/skips and a default-unchecked `Restaurar configurações do backup` checkbox. Cancel closes with no state mutation. Capture the current edit generation/revision; if it changes before Apply, recompute the preview and require the updated summary to be acknowledged rather than applying stale merged state.
- [x] Apply the preview through the controller as one library update/transaction, outside board history. Existing histories remain attached to their copied/remapped records. Avoid calling per-record save in a loop. If commit fails, retain the complete proposed state as unsaved and show recovery controls; on refresh only a completed transaction is restored.
- [x] Test malformed/newer-version backup rejection, cancellation, changed-session branch copying, setting retention/restoration, XSS-like names displayed as text, and backup of hidden notes plus redo. Simulate repository failure at the adapter boundary in a test-only harness and verify live edits remain exportable and Retry clears the failure only after commit. Do not inject test hooks into public product Settings.
- [x] Run backup browser/unit tests plus controller/storage suites and typecheck; commit recovery and backup UI.

## Task 10 — End-to-end durability, visual QA, and delivery documentation

**Files:** create `web/tests/e2e/persistence.spec.ts`, `web/tests/e2e/completion.spec.ts`; update root `README.md`, `.gitignore` as needed, `docs/README.md`; fix only issues found by the release checks in the owning files.

**Consumes:** complete first-release application and all acceptance requirements.

**Produces:** verified local release, repeatable startup/test instructions, and an accurate resume record.

- [x] Add a real refresh/reopen test in the same browser context: enter notes/value, undo once, wait for `Salvo`, reload, redo, close page, open a new page at the same origin, and confirm editor/history/selection. A new isolated context is expected to be empty; do not mistake that for a persistence failure.
- [x] Add one true browser-restart persistence check with a temporary profile under the test output directory. Launch, save, close, relaunch the same profile, and verify state/history. Never point tests at a personal browser profile. Use Playwright's temporary artifact lifecycle to clean up only the test profile; verify its absolute path before any recursive cleanup on Windows.

```ts
import { chromium, expect, test } from '@playwright/test';
test('library survives a browser restart', async ({}, testInfo) => {
  const profile = testInfo.outputPath('isolated-profile');
  let context = await chromium.launchPersistentContext(profile, { headless: true });
  let page = await context.newPage();
  await page.goto('http://127.0.0.1:5174/');
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  await page.locator('[data-cell-index="0"]').click();
  await page.keyboard.press('8');
  await expect(page.getByTestId('save-status')).toHaveText('Salvo');
  const route = page.url();
  await context.close();
  context = await chromium.launchPersistentContext(profile, { headless: true });
  page = await context.newPage();
  await page.goto(route);
  await expect(page.locator('[data-cell-index="0"] [data-value]')).toHaveText('8');
  await page.locator('[data-cell-index="0"]').click();
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-cell-index="0"] [data-value]')).toHaveText('');
  await context.close();
});
```

Use `try/finally` in the implementation to close contexts if assertions fail; do not leave hidden browser processes behind.

- [x] Cover completion with a nearly full valid fixture, ordinary conflicting full entries with highlights off/on, and no false uniqueness wording. Verify keyboard and pointer controls, numeric keypad, normal text-field undo, and disabled future actions. Inspect desktop screenshots at 1280×800 and 1920×1080 for overflow, all nine corner notes, crisp 3×3 boundaries, focus, and legibility.
- [x] Execute the release gates from `web/`, separately, and inspect every result:

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Expected: installation succeeds with locked dependencies; typecheck exits 0; all unit/storage and browser tests pass; Vite emits a production build. If new failures require fixes, rerun the affected checks and the necessary final gates. Do not report browser quota/eviction guarantees from fake IndexedDB tests.

- [x] Write root startup instructions: install Node matching the baseline; `cd web`, `npm ci`, then `npm run dev`; open exactly `http://localhost:5173`. Explain that another port/hostname has separate browser data, provide backup instructions, list keyboard controls, and identify solver/variants/community as future stages. Document each test command and that existing Spring files are retained as a legacy reference, not the active runtime. Do not delete them merely to tidy the repository.
- [x] Check `git diff --check`, review changed paths, and ensure no generated dependencies, build output, personal data, secrets, or test profiles are staged. Commit the finished release with relevant docs. Update this plan's checkboxes and `docs/README.md` with actual results, commit identifier, known limitations, and the next checkpoint M2. Only claim completed behavior verified by the executed checks.

## Coverage map and execution order

| Approved requirement | Implementation tasks | Verification |
| --- | --- | --- |
| Local browser stack and stable origin | 1, 5, 10 | Locked install/typecheck/build and documented localhost address. |
| Manual and 81-cell import, mandatory creation conflicts | 1, 3, 8 | Parser/conflict fixtures and conflicting-draft browser flow. |
| Draft autosave, Finish, immutable clues, copy-on-edit | 3, 5, 6, 8 | Lifecycle tests and refresh/copy browser cases. |
| Arrow wrapping and selectable givens | 2, 7 | Four-direction unit tests and browser navigation. |
| Shift/persistent corner notes and hidden-note layering | 2, 7 | Reducer regressions plus real Shift/digit/button cases. |
| Undo/redo/reset, separate histories, no-op boundaries | 2, 3, 5 | History invariants, reset tests, persisted histories. |
| Saved selection, progress, reopen/restart | 5, 6, 10 | Fake adapter tests plus real persistent-profile restart. |
| Menu, library, one session, rename/delete/settings | 3, 8 | Domain identity tests and browser lifecycle. |
| Play conflicts optional/off, completion without uniqueness claim | 1, 8, 10 | Default-setting and completion browser tests. |
| Versioned backups, graph merge, history/settings recovery | 4, 5, 9 | Round-trip/collision/schema tests and download/upload workflow. |
| Save failure and stale-write protection | 5, 6, 9 | Aborted/stale writes, error indicator, live export/retry. |
| Portuguese light desktop UI and future-feature affordances | 7, 8, 10 | Visible interaction and screenshot review. |

Tasks 1–6 establish shared contracts; Task 7 builds board interaction; Task 8 completes creator before player integration; Task 9 completes backup UI; Task 10 verifies/delivers M1. Do not start M2 solving or the deferred feature branches during this plan.

## Planning verification versus application verification

During planning, check document links, resolved decision coverage, consistency of signatures, fixture length/validity, and absence of unresolved first-release requirements. The code examples in this plan guide implementation but are not already installed, compiled, or tested. Actual acceptance belongs to the execution gates above.
