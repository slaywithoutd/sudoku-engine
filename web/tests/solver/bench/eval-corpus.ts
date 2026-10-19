/**
 * Builder for the M2.6 evaluation corpus (`eval-corpus.json`, spec §5 T01).
 *
 * Test-only and free of production imports: grids come from published
 * puzzles, from transformations of the repository seed `SOLUTION`, and from a
 * mulberry32 stream; labels come from the independent reference DFS. The
 * committed JSON is the artefact; `buildEvalCorpus` reproduces it and the unit
 * test checks the seeded cases against it.
 */
import { SOLUTION, PUZZLE } from "../../fixtures";
import { rng } from "../generate-small";
import { parseGrid, referenceCount } from "../reference-dfs";

export type EvalFamily = "named" | "derived" | "random" | "poisoned";
export type CountLabel = "0" | "1" | "2+";
export type SinglesLabel = "naked" | "hidden" | "none";

export interface EvalCase {
  readonly id: string;
  readonly family: EvalFamily;
  readonly puzzle: string;
  readonly givens: number;
  readonly source: string;
  readonly count: CountLabel;
  /** The unique solution, present only when `count` is "1". */
  readonly solution?: string;
  /** Whether naked singles, or naked plus hidden singles, solve the grid from its givens. */
  readonly singles: SinglesLabel;
  readonly seed?: number;
  /** Too slow for the default suite with the baseline engine; run with M26_HEAVY=1. */
  readonly heavy?: true;
}

export interface EvalCorpus {
  readonly schema: 1;
  readonly cases: readonly EvalCase[];
}

/** Published puzzles, kept as test data only (see tests/solver/bench/README.md). */
export const NAMED: readonly { id: string; puzzle: string; source: string }[] = [
  { id: "easy", puzzle: PUZZLE, source: "repository fixture tests/fixtures.ts PUZZLE" },
  {
    id: "seventeen",
    puzzle: "000000010400000000020000000000050407008000300001090000300400200050100000000806000",
    source: "17-clue puzzle, Gordon Royle's minimum-Sudoku collection",
  },
  {
    id: "escargot",
    puzzle: "100007090030020008009600500005300900010080002600004000300000010040000007007000300",
    source: "AI Escargot, Arto Inkala, 2006",
  },
  {
    id: "inkala-2012",
    puzzle: "800000000003600000070090200050007000000045700000100030001000068008500010090000400",
    source: "Arto Inkala, 2012 ('world's hardest Sudoku')",
  },
  {
    id: "golden-nugget",
    puzzle: "000000039000001005003050800008090006070002000100400000009080050020000600400700000",
    source: "Golden Nugget, tarek, Sudoku Players' Forum, 2007",
  },
  {
    id: "anti-brute-force",
    puzzle: "000000000000003085001020000000507000004000100090000000500000073002010000000040009",
    source: "Grid designed against brute-force search, Wikipedia 'Sudoku solving algorithms'",
  },
  {
    id: "norvig-hard1",
    puzzle: "000006000059000008200008000045000000003000000006003054000325006000000000000000000",
    source: "hard1, Peter Norvig, 'Solving Every Sudoku Puzzle' (not a proper puzzle)",
  },
  { id: "empty", puzzle: "0".repeat(81), source: "empty grid" },
];

/** Measured on the baseline engine (docs/history/m26-baseline.md): minutes per run. */
export const HEAVY = new Set(["norvig-hard1"]);

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

/** A complete grid from SOLUTION under digit relabeling, band/stack/line permutations and transposition. */
export function transformedSolution(random: () => number): number[] {
  const seed = parseGrid(SOLUTION);
  const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], random);
  const lines = (): number[] =>
    shuffle([0, 1, 2], random).flatMap((band) =>
      shuffle([0, 1, 2], random).map((line) => band * 3 + line),
    );
  const rows = lines(),
    columns = lines(),
    transpose = random() < 0.5;
  const grid: number[] = [];
  for (let row = 0; row < 9; row++)
    for (let column = 0; column < 9; column++) {
      const [from, to] = transpose ? [columns[column], rows[row]] : [rows[row], columns[column]];
      grid.push(digits[seed[from * 9 + to] - 1]);
    }
  return grid;
}

function peersOf(cell: number): number[] {
  const row = Math.floor(cell / 9),
    column = cell % 9,
    box = Math.floor(row / 3) * 3 + Math.floor(column / 3);
  const peers: number[] = [];
  for (let other = 0; other < 81; other++) {
    if (other === cell) continue;
    const otherRow = Math.floor(other / 9),
      otherColumn = other % 9;
    if (
      otherRow === row ||
      otherColumn === column ||
      Math.floor(otherRow / 3) * 3 + Math.floor(otherColumn / 3) === box
    )
      peers.push(other);
  }
  return peers;
}
const PEERS = Array.from({ length: 81 }, (_, cell) => peersOf(cell));
const HOUSES: number[][] = [
  ...Array.from({ length: 9 }, (_, row) => Array.from({ length: 9 }, (_, i) => row * 9 + i)),
  ...Array.from({ length: 9 }, (_, column) => Array.from({ length: 9 }, (_, i) => i * 9 + column)),
  ...Array.from({ length: 9 }, (_, box) =>
    Array.from(
      { length: 9 },
      (_, i) => (Math.floor(box / 3) * 3 + Math.floor(i / 3)) * 9 + (box % 3) * 3 + (i % 3),
    ),
  ),
];

/** Fills singles until stuck; true when the grid completes without contradiction. */
function singlesSolve(puzzle: readonly number[], hidden: boolean): boolean {
  const values = [...puzzle];
  const options = (cell: number): number[] => {
    const used = new Set(PEERS[cell].map((peer) => values[peer]));
    return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((digit) => !used.has(digit));
  };
  for (;;) {
    let progressed = false;
    for (let cell = 0; cell < 81; cell++) {
      if (values[cell] !== 0) continue;
      const digits = options(cell);
      if (digits.length === 0) return false;
      if (digits.length === 1) {
        values[cell] = digits[0];
        progressed = true;
      }
    }
    if (hidden && !progressed)
      for (const house of HOUSES)
        for (let digit = 1; digit <= 9; digit++) {
          if (house.some((cell) => values[cell] === digit)) continue;
          const places = house.filter(
            (cell) => values[cell] === 0 && options(cell).includes(digit),
          );
          if (places.length === 0) return false;
          if (places.length === 1) {
            values[places[0]] = digit;
            progressed = true;
          }
        }
    if (!progressed) return values.every((value) => value !== 0);
  }
}

export function singlesLabel(puzzle: string): SinglesLabel {
  const values = parseGrid(puzzle);
  if (singlesSolve(values, false)) return "naked";
  return singlesSolve(values, true) ? "hidden" : "none";
}

/** A grid that naked plus hidden singles solve but naked singles alone do not. */
function hiddenSinglesPuzzle(): { puzzle: string; seed: number } {
  for (let seed = 1; ; seed++) {
    const random = rng(0x6d26_0000 + seed);
    const values = transformedSolution(random);
    for (const cell of shuffle(
      Array.from({ length: 81 }, (_, index) => index),
      random,
    )) {
      const kept = values[cell];
      values[cell] = 0;
      if (!singlesSolve(values, true)) values[cell] = kept;
    }
    if (!singlesSolve(values, false)) return { puzzle: values.join(""), seed };
  }
}

/** Replaces the first empty cell's value with a digit that differs from `solution` and from every peer given. */
function poison(
  puzzle: readonly number[],
  solution: readonly number[],
  order: readonly number[],
): number[] {
  for (const cell of order) {
    if (puzzle[cell] !== 0) continue;
    const used = new Set(PEERS[cell].map((peer) => puzzle[peer]));
    const digit = [1, 2, 3, 4, 5, 6, 7, 8, 9].find(
      (candidate) => candidate !== solution[cell] && !used.has(candidate),
    );
    if (digit === undefined) continue;
    const copy = [...puzzle];
    copy[cell] = digit;
    return copy;
  }
  throw new Error("eval-corpus-no-poison-cell");
}

export const SEEDED_CASES = 60;

/** Random thinned grids (22-36 givens) and poisoned ones (26-40 givens plus one wrong digit). */
export function seededGrid(
  family: "random" | "poisoned",
  index: number,
): { puzzle: string; seed: number } {
  const seed = (family === "random" ? 0x6d26_1000 : 0x6d26_2000) + index;
  const random = rng(seed);
  const solution = transformedSolution(random);
  const givens = (family === "random" ? 22 : 26) + Math.floor(random() * 15);
  const order = shuffle(
    Array.from({ length: 81 }, (_, cell) => cell),
    random,
  );
  const keep = new Set(order.slice(0, givens));
  let puzzle = solution.map((value, cell) => (keep.has(cell) ? value : 0));
  if (family === "poisoned") puzzle = poison(puzzle, solution, order);
  return { puzzle: puzzle.join(""), seed };
}

function label(
  id: string,
  family: EvalFamily,
  puzzle: string,
  source: string,
  seed?: number,
): EvalCase {
  const reference = referenceCount(puzzle, 2);
  if (reference.count < 2 && !reference.exhausted) throw new Error("eval-corpus-unbounded");
  const count: CountLabel = reference.count === 0 ? "0" : reference.count === 1 ? "1" : "2+";
  return {
    id,
    family,
    puzzle,
    givens: [...puzzle].filter((digit) => digit !== "0").length,
    source,
    count,
    ...(count === "1" ? { solution: reference.solutions[0] } : {}),
    singles: singlesLabel(puzzle),
    ...(seed === undefined ? {} : { seed }),
    ...(HEAVY.has(id) ? { heavy: true as const } : {}),
  };
}

function namedPuzzle(id: string): string {
  const entry = NAMED.find((named) => named.id === id);
  if (!entry) throw new Error("eval-corpus-unknown-named-case");
  return entry.puzzle;
}

export function buildEvalCorpus(): EvalCorpus {
  const cases: EvalCase[] = NAMED.map(({ id, puzzle, source }) =>
    label(id, "named", puzzle, source),
  );
  const hidden = hiddenSinglesPuzzle();
  cases.splice(
    1,
    0,
    label(
      "hidden-singles",
      "derived",
      hidden.puzzle,
      "SOLUTION transformed and thinned while naked+hidden singles still solve it",
      hidden.seed,
    ),
  );
  const seventeen = namedPuzzle("seventeen");
  const last = seventeen.search(/[1-9][0]*$/);
  cases.push(
    label(
      "seventeen-minus-one",
      "derived",
      seventeen.slice(0, last) + "0" + seventeen.slice(last + 1),
      "seventeen with its last given removed",
    ),
  );
  const escargot = namedPuzzle("escargot");
  const escargotSolution = parseGrid(referenceCount(escargot, 1).solutions[0]);
  cases.push(
    label(
      "escargot-poisoned",
      "derived",
      poison(
        parseGrid(escargot),
        escargotSolution,
        Array.from({ length: 81 }, (_, cell) => cell),
      ).join(""),
      "escargot with its first empty cell set to a non-solution digit absent from its peers",
    ),
  );
  for (const family of ["random", "poisoned"] as const)
    for (let index = 0; index < SEEDED_CASES; index++) {
      const { puzzle, seed } = seededGrid(family, index);
      cases.push(
        label(
          `${family}-${String(index).padStart(2, "0")}`,
          family,
          puzzle,
          family === "random"
            ? "transformed SOLUTION thinned to random givens"
            : "transformed SOLUTION thinned, one empty cell set to a wrong non-conflicting digit",
          seed,
        ),
      );
    }
  return { schema: 1, cases };
}
