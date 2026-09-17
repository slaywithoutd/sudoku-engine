import type { CellState, Value } from "./model";
import { conflictingCells } from "./classic";
import { sameCell, makeCell } from "./editor";

export const GAME_FORMAT = "sudoku-engine-game";
export const IMPORT_EXTENSIONS = [".txt", ".sdk", ".ss", ".sdm", ".json"];
export const IMPORT_FORMATS_SUMMARY =
  "81 digits (0 or . for blanks), a 9-line grid, .sdk/.ss/.sdm/.txt files or a game export (.json).";

export interface ParsedPuzzle {
  givens: Value[];
  name?: string;
  /** Player progress from a game export (empty for plain puzzles). */
  cells?: CellState[];
  elapsedMs?: number;
  clues: number;
  conflicts: number;
}
export interface ParseResult {
  puzzles: ParsedPuzzle[];
  /** Blocking problems; when present, `puzzles` is empty. */
  error?: string;
}

const EMPTY = new Set(["0", ".", "_", "*", "x", "X"]);
const summarize = (givens: Value[], extra: Partial<ParsedPuzzle> = {}): ParsedPuzzle => ({
  givens,
  clues: givens.filter(Boolean).length,
  conflicts: conflictingCells(givens).length,
  ...extra,
});

/** Cells on one line: digits and blank markers; grid decoration is ignored. */
function lineCells(line: string): string[] {
  return [...line].filter((c) => /[1-9]/.test(c) || EMPTY.has(c));
}
const toValues = (cells: string[]): Value[] =>
  cells.map((c) => (EMPTY.has(c) ? 0 : (Number(c) as Value)));

function parseGame(json: unknown): ParsedPuzzle {
  const fail = (): never => {
    throw new Error("This JSON file is not a Sudoku Engine game export.");
  };
  if (!json || typeof json !== "object") fail();
  const x = json as Record<string, unknown>;
  if (x.format === "sudoku-engine-backup")
    throw new Error("This is a full library backup. Import it from Settings → Data.");
  if (x.format !== GAME_FORMAT || x.version !== 1 || typeof x.givens !== "string") fail();
  const text = x.givens as string;
  if (!/^[0-9.]{81}$/.test(text)) fail();
  const givens = toValues([...text]);
  const extra: Partial<ParsedPuzzle> = {};
  if (typeof x.name === "string" && x.name.trim()) extra.name = x.name.trim().slice(0, 120);
  if (Array.isArray(x.cells)) {
    if (x.cells.length !== 81) fail();
    extra.cells = x.cells.map((raw, i) => {
      const c = raw as Record<string, unknown>;
      const digits = (v: unknown) =>
        v === undefined
          ? []
          : Array.isArray(v) &&
              v.every(
                (n, k) => Number.isInteger(n) && n >= 1 && n <= 9 && (k === 0 || v[k - 1] < n),
              )
            ? (v as CellState["notes"])
            : fail();
      if (
        !c ||
        typeof c !== "object" ||
        !Number.isInteger(c.value) ||
        (c.value as number) < 0 ||
        (c.value as number) > 9
      )
        fail();
      const color =
        c.color === undefined
          ? 0
          : Number.isInteger(c.color) && (c.color as number) >= 1 && (c.color as number) <= 6
            ? (c.color as 1)
            : fail();
      const cell = makeCell(c.value as Value, digits(c.notes), digits(c.center), color);
      // Clue cells never carry player values or notes.
      if (givens[i] && !sameCell(cell, makeCell(0, [], [], color))) fail();
      return cell;
    });
  }
  if (x.elapsedMs !== undefined) {
    if (!Number.isSafeInteger(x.elapsedMs) || (x.elapsedMs as number) < 0) fail();
    extra.elapsedMs = x.elapsedMs as number;
  }
  return summarize(givens, extra);
}

/**
 * Accepts one or many puzzles: 81-cell lines, multi-line grids (with any
 * |, -, + decoration), SadMan .sdk/.ss/.sdm files and game exports.
 * Errors name the line or block so the user can fix the source.
 */
export function parsePuzzles(text: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { puzzles: [], error: "Paste a puzzle or choose a file." };
  if (trimmed.startsWith("{")) {
    try {
      return { puzzles: [parseGame(JSON.parse(trimmed))] };
    } catch (error) {
      return {
        puzzles: [],
        error:
          error instanceof SyntaxError ? "The JSON could not be read." : (error as Error).message,
      };
    }
  }
  // Comment/metadata lines (#A author, [Puzzle] headers) carry no cells.
  const lines = trimmed.split(/\r?\n/).filter((line) => !/^\s*(#|\[)/.test(line));
  const blocks: string[][] = [[]];
  for (const line of lines) {
    if (!line.trim()) {
      if (blocks.at(-1)!.length) blocks.push([]);
    } else blocks.at(-1)!.push(line);
  }
  const puzzles: ParsedPuzzle[] = [];
  for (const [b, block] of blocks.filter((x) => x.length).entries()) {
    const perLine = block.map(lineCells).filter((cells) => cells.length);
    if (perLine.length && perLine.every((cells) => cells.length === 81)) {
      perLine.forEach((cells) => puzzles.push(summarize(toValues(cells))));
      continue;
    }
    const all = perLine.flat();
    if (all.length === 81) {
      puzzles.push(summarize(toValues(all)));
      continue;
    }
    const where = blocks.length > 1 ? `Puzzle ${b + 1}` : "The puzzle";
    const badRow = perLine.length === 9 ? perLine.findIndex((cells) => cells.length !== 9) : -1;
    return {
      puzzles: [],
      error:
        badRow >= 0
          ? `${where}: row ${badRow + 1} has ${perLine[badRow].length} cells; each row needs 9.`
          : `${where} has ${all.length} cells; a classic Sudoku needs 81.`,
    };
  }
  if (!puzzles.length)
    return { puzzles: [], error: "No puzzle found. Use digits 1–9 and 0 or . for blanks." };
  return { puzzles };
}

export function gameExport(options: {
  name: string;
  givens: readonly Value[];
  cells?: readonly CellState[];
  elapsedMs?: number;
}): string {
  return JSON.stringify(
    {
      format: GAME_FORMAT,
      version: 1,
      name: options.name,
      givens: options.givens.map((v) => (v ? String(v) : ".")).join(""),
      ...(options.cells ? { cells: options.cells } : {}),
      ...(options.elapsedMs !== undefined ? { elapsedMs: Math.round(options.elapsedMs) } : {}),
    },
    null,
    2,
  );
}
