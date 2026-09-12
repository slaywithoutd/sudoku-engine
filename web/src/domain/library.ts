import { emptyEditor, type LibraryData, type Value } from "./model";
import { conflictingCells } from "./classic";
export function emptyLibrary(): LibraryData {
  return {
    formatVersion: 1,
    revision: 0,
    drafts: {},
    puzzles: {},
    sessions: {},
    settings: { showConflicts: false, language: "pt-BR" },
  };
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
    throw new Error("Identificador já existe ou é inválido.");
}
export function createDraft(
  data: LibraryData,
  id: string,
  now: string,
  values: readonly Value[] = Array(81).fill(0),
): LibraryData {
  available(data, id);
  if (
    values.length !== 81 ||
    !values.every((v) => Number.isInteger(v) && v >= 0 && v <= 9)
  )
    throw new Error("Células inválidas.");
  const editor = emptyEditor();
  editor.cells = values.map((value) => ({ value, notes: [] }));
  return {
    ...data,
    drafts: {
      ...data.drafts,
      [id]: { id, name: "Sem título", createdAt: now, updatedAt: now, editor },
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
    throw new Error("Rascunho indisponível para edição.");
  available(data, puzzleId);
  const givens = draft.editor.cells.map((c) => c.value);
  if (conflictingCells(givens).length)
    throw new Error("Resolva os conflitos antes de finalizar.");
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
  if (!data.puzzles[puzzleId]) throw new Error("Jogo não encontrado.");
  if (data.sessions[puzzleId]) return data;
  return {
    ...data,
    sessions: {
      ...data.sessions,
      [puzzleId]: { puzzleId, updatedAt: now, editor: emptyEditor() },
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
  if (!puzzle) throw new Error("Jogo não encontrado.");
  const next = createDraft(data, draftId, now, puzzle.definition.givens);
  return {
    ...next,
    drafts: {
      ...next.drafts,
      [draftId]: {
        ...next.drafts[draftId],
        name: puzzle.name,
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
  name = name.trim() || "Sem título";
  if (kind === "draft") {
    const draft = data.drafts[id];
    if (!draft || draft.finishedPuzzleId)
      throw new Error("Rascunho indisponível para edição.");
    if (name === draft.name) return data;
    return {
      ...data,
      drafts: { ...data.drafts, [id]: { ...draft, name, updatedAt: now } },
    };
  }
  const puzzle = data.puzzles[id];
  if (!puzzle) throw new Error("Jogo não encontrado.");
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
      throw new Error("Rascunho indisponível.");
    const drafts = { ...data.drafts };
    delete drafts[id];
    return { ...data, drafts };
  }
  if (!data.puzzles[id]) throw new Error("Jogo não encontrado.");
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
