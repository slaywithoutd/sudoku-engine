/**
 * Independent 9x9 classic reference solver for the M2.6 evaluation corpus.
 *
 * A plain bitmask depth-first search: row, column and box masks of used
 * digits, naked-single propagation only, MRV cell choice (lowest index on
 * ties) and ascending digit order. It imports nothing from `src/solver` and
 * shares no code with the Algorithm X oracle (`oracle.ts`), so it is a second
 * independent witness for the engine's exact count (spec §5 T01).
 *
 * A node is counted each time a search state is entered. The search stops at
 * `limit` solutions; `exhausted` is true only when the whole tree was
 * traversed.
 */

export interface ReferenceResult {
  /** Number of solutions found, at most `limit`. */
  readonly count: number;
  /** True when the whole search tree was traversed (count is exact). */
  readonly exhausted: boolean;
  /** Solutions in discovery order, as 81-digit strings. */
  readonly solutions: readonly string[];
  readonly nodes: number;
}

const ALL = 0x1ff;

function popcount(mask: number): number {
  let count = 0;
  for (let value = mask; value !== 0; value &= value - 1) count++;
  return count;
}

function boxOf(cell: number): number {
  return Math.floor(Math.floor(cell / 9) / 3) * 3 + Math.floor((cell % 9) / 3);
}

/** Parses an 81-character grid of digits 0-9 ('.' is accepted as 0). */
export function parseGrid(puzzle: string): number[] {
  if (puzzle.length !== 81) throw new Error("reference-grid-length");
  return [...puzzle].map((character) => {
    const digit = character === "." ? 0 : character.charCodeAt(0) - 48;
    if (!(digit >= 0 && digit <= 9)) throw new Error("reference-grid-digit");
    return digit;
  });
}

/** True when `solution` is a complete valid grid that agrees with every given of `puzzle`. */
export function isSolutionOf(puzzle: string, solution: string): boolean {
  const givens = parseGrid(puzzle),
    values = parseGrid(solution);
  for (let cell = 0; cell < 81; cell++) {
    if (values[cell] === 0) return false;
    if (givens[cell] !== 0 && givens[cell] !== values[cell]) return false;
  }
  for (let unit = 0; unit < 9; unit++) {
    let row = 0,
      column = 0,
      box = 0;
    for (let index = 0; index < 9; index++) {
      row |= 1 << (values[unit * 9 + index] - 1);
      column |= 1 << (values[index * 9 + unit] - 1);
      const boxCell =
        (Math.floor(unit / 3) * 3 + Math.floor(index / 3)) * 9 + (unit % 3) * 3 + (index % 3);
      box |= 1 << (values[boxCell] - 1);
    }
    if (row !== ALL || column !== ALL || box !== ALL) return false;
  }
  return true;
}

export function referenceCount(puzzle: string, limit = 2): ReferenceResult {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("reference-limit");
  const values = parseGrid(puzzle);
  const rows = new Array<number>(9).fill(0),
    columns = new Array<number>(9).fill(0),
    boxes = new Array<number>(9).fill(0);
  for (let cell = 0; cell < 81; cell++) {
    const digit = values[cell];
    if (digit === 0) continue;
    const bit = 1 << (digit - 1),
      row = Math.floor(cell / 9),
      column = cell % 9,
      box = boxOf(cell);
    // A repeated given makes the grid unsatisfiable before any search.
    if ((rows[row] | columns[column] | boxes[box]) & bit)
      return { count: 0, exhausted: true, solutions: [], nodes: 0 };
    rows[row] |= bit;
    columns[column] |= bit;
    boxes[box] |= bit;
  }

  const solutions: string[] = [];
  let nodes = 0;
  const place = (cell: number, bit: number, digit: number): void => {
    values[cell] = digit;
    rows[Math.floor(cell / 9)] |= bit;
    columns[cell % 9] |= bit;
    boxes[boxOf(cell)] |= bit;
  };
  const clear = (cell: number, bit: number): void => {
    values[cell] = 0;
    rows[Math.floor(cell / 9)] &= ~bit;
    columns[cell % 9] &= ~bit;
    boxes[boxOf(cell)] &= ~bit;
  };
  const candidates = (cell: number): number =>
    ALL & ~(rows[Math.floor(cell / 9)] | columns[cell % 9] | boxes[boxOf(cell)]);

  // Returns true when the limit was reached and the search must unwind.
  const search = (): boolean => {
    nodes++;
    const placed: number[] = [];
    const undo = (): void => {
      for (let index = placed.length - 1; index >= 0; index--) {
        const cell = placed[index];
        clear(cell, 1 << (values[cell] - 1));
      }
    };
    // Naked singles to a fixed point, then pick the most constrained cell.
    for (;;) {
      let best = -1,
        bestCount = 10,
        progressed = false;
      for (let cell = 0; cell < 81; cell++) {
        if (values[cell] !== 0) continue;
        const mask = candidates(cell),
          count = popcount(mask);
        if (count === 0) {
          undo();
          return false;
        }
        if (count === 1) {
          const digit = 31 - Math.clz32(mask) + 1;
          place(cell, mask, digit);
          placed.push(cell);
          progressed = true;
        } else if (count < bestCount) {
          best = cell;
          bestCount = count;
        }
      }
      if (progressed) continue;
      if (best === -1) {
        solutions.push(values.join(""));
        const stop = solutions.length >= limit;
        undo();
        return stop;
      }
      const mask = candidates(best);
      for (let digit = 1; digit <= 9; digit++) {
        const bit = 1 << (digit - 1);
        if ((mask & bit) === 0) continue;
        place(best, bit, digit);
        const stop = search();
        clear(best, bit);
        if (stop) {
          undo();
          return true;
        }
      }
      undo();
      return false;
    }
  };
  const stopped = search();
  return { count: solutions.length, exhausted: !stopped, solutions, nodes };
}
