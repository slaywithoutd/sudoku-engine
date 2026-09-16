import { emptyEditor, newTimer, type CellState, type LibraryData, type Value } from "./model";
import { conflictingCells } from "./classic";
import { defaultSettings } from "./settings";
export function emptyLibrary(): LibraryData {
  return {
    formatVersion: 2,
    revision: 0,
    drafts: {},
    puzzles: {},
    sessions: {},
    settings: defaultSettings(),
  };
}
/**
 * Next free "Puzzle N" across drafts and puzzles. Uses the highest existing
 * number rather than a count, so deleting a record never produces duplicates.
 */
export function nextPuzzleName(data: LibraryData): string {
  let highest = 0;
  for (const record of [
    ...Object.values(data.drafts),
    ...Object.values(data.puzzles),
  ]) {
    const match = /^Puzzle (\d{1,9})$/.exec(record.name);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `Puzzle ${highest + 1}`;
}
export function safeId(id: string): boolean {
  return !!id && id !== "prototype" && !Object.hasOwn(Object.prototype, id);
}
function available(data: LibraryData, id: string): void {
  if (
    !safeId(id) ||
    Object.hasOwn(data.drafts, id) ||
    Object.hasOwn(data.puzzles, id)
  )
    throw new Error("The identifier already exists or is invalid.");
}
export function createDraft(
  data: LibraryData,
  id: string,
  now: string,
  values: readonly Value[] = Array(81).fill(0),
  name = nextPuzzleName(data),
): LibraryData {
  available(data, id);
  if (
    values.length !== 81 ||
    !values.every((v) => Number.isInteger(v) && v >= 0 && v <= 9)
  )
    throw new Error("Invalid cells.");
  const editor = emptyEditor();
  editor.cells = values.map((value) => ({ value, notes: [] }));
  return {
    ...data,
    drafts: {
      ...data.drafts,
      [id]: { id, name, createdAt: now, updatedAt: now, editor },
    },
  };
}
export function finishDraft(
  data: LibraryData,
  draftId: string,
  puzzleId: string,
  now: string,
): LibraryData {
  const draft = data.drafts[draftId];
  if (!draft || draft.finishedPuzzleId)
    throw new Error("This draft is not available for editing.");
  available(data, puzzleId);
  const givens = draft.editor.cells.map((c) => c.value);
  if (conflictingCells(givens).length)
    throw new Error("Resolve conflicts before finishing.");
  return {
    ...data,
    drafts: {
      ...data.drafts,
      [draftId]: { ...draft, finishedPuzzleId: puzzleId, updatedAt: now },
    },
    puzzles: {
      ...data.puzzles,
      [puzzleId]: {
        id: puzzleId,
        name: draft.name,
        createdAt: now,
        definition: {
          kind: "classic",
          version: 1,
          width: 9,
          height: 9,
          givens,
        },
      },
    },
  };
}
export function startPlay(
  data: LibraryData,
  puzzleId: string,
  now: string,
): LibraryData {
  if (!data.puzzles[puzzleId]) throw new Error("Puzzle not found.");
  if (data.sessions[puzzleId]) return data;
  return {
    ...data,
    sessions: {
      ...data.sessions,
      [puzzleId]: {
        puzzleId,
        updatedAt: now,
        editor: emptyEditor(),
        timer: newTimer(data.settings.timerStart),
      },
    },
  };
}
export function copyPuzzleToDraft(
  data: LibraryData,
  puzzleId: string,
  draftId: string,
  now: string,
): LibraryData {
  const puzzle = data.puzzles[puzzleId];
  if (!puzzle) throw new Error("Puzzle not found.");
  const next = createDraft(
    data,
    draftId,
    now,
    puzzle.definition.givens,
    puzzle.name,
  );
  return {
    ...next,
    drafts: {
      ...next.drafts,
      [draftId]: {
        ...next.drafts[draftId],
        sourcePuzzleId: puzzleId,
      },
    },
  };
}
export function renameRecord(
  data: LibraryData,
  kind: "draft" | "puzzle",
  id: string,
  name: string,
  now: string,
): LibraryData {
  name = name.trim() || "Untitled";
  if (kind === "draft") {
    const draft = data.drafts[id];
    if (!draft || draft.finishedPuzzleId)
      throw new Error("This draft is not available for editing.");
    if (name === draft.name) return data;
    return {
      ...data,
      drafts: { ...data.drafts, [id]: { ...draft, name, updatedAt: now } },
    };
  }
  const puzzle = data.puzzles[id];
  if (!puzzle) throw new Error("Puzzle not found.");
  return name === puzzle.name
    ? data
    : { ...data, puzzles: { ...data.puzzles, [id]: { ...puzzle, name } } };
}
export function deleteRecord(
  data: LibraryData,
  kind: "draft" | "puzzle",
  id: string,
): LibraryData {
  if (kind === "draft") {
    if (!data.drafts[id] || data.drafts[id].finishedPuzzleId)
      throw new Error("Draft unavailable.");
    const drafts = { ...data.drafts };
    delete drafts[id];
    return { ...data, drafts };
  }
  if (!data.puzzles[id]) throw new Error("Puzzle not found.");
  const puzzles = { ...data.puzzles },
    sessions = { ...data.sessions },
    drafts = { ...data.drafts };
  delete puzzles[id];
  delete sessions[id];
  for (const draft of Object.values(drafts)) {
    if (draft.finishedPuzzleId === id) delete drafts[draft.id];
    else if (draft.sourcePuzzleId === id) {
      drafts[draft.id] = { ...draft };
      delete drafts[draft.id].sourcePuzzleId;
    }
  }
  return { ...data, puzzles, sessions, drafts };
}
/**
 * Adds a finished puzzle with restored progress from a game export.
 * History is not exported, so the session starts with an empty undo stack.
 */
export function importGame(
  data: LibraryData,
  puzzleId: string,
  now: string,
  game: { givens: readonly Value[]; cells: readonly CellState[]; elapsedMs?: number; name?: string },
): LibraryData {
  available(data, puzzleId);
  if (conflictingCells(game.givens).length)
    throw new Error("A puzzle with conflicting clues can only be imported as a draft.");
  const editor = emptyEditor();
  editor.cells = structuredClone([...game.cells]);
  return {
    ...data,
    puzzles: {
      ...data.puzzles,
      [puzzleId]: {
        id: puzzleId,
        name: game.name ?? nextPuzzleName(data),
        createdAt: now,
        definition: { kind: "classic", version: 1, width: 9, height: 9, givens: [...game.givens] },
      },
    },
    sessions: {
      ...data.sessions,
      [puzzleId]: {
        puzzleId,
        updatedAt: now,
        editor,
        timer: { ...newTimer(data.settings.timerStart), elapsedMs: game.elapsedMs ?? 0, started: true },
      },
    },
  };
}
