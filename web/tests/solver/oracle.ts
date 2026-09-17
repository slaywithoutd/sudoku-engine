export interface OracleInput {
  givens: number[];
  domains?: number[];
  force?: [number, number];
  forbid?: [number, number];
  limit: number;
  maxNodes: number;
}

export interface OracleResult {
  witnesses: number[][];
  exhausted: boolean;
  interrupted: boolean;
  nodes: number;
}

interface CandidateRow {
  readonly cell: number;
  readonly digit: number;
  readonly columns: readonly [number, number, number, number];
}

const CELL_COUNT = 81;
const DIGIT_COUNT = 9;
const COLUMN_COUNT = 324;
const ALL_DIGITS = 511;

function validateCells(name: string, values: number[], minimum: number, maximum: number): void {
  if (!Array.isArray(values) || values.length !== CELL_COUNT) {
    throw new RangeError(
      `${name} must contain exactly 81 integers from ${minimum} through ${maximum}`,
    );
  }
  // Indexed access is intentional: array iteration methods skip sparse holes.
  for (let cell = 0; cell < CELL_COUNT; cell += 1) {
    const value = values[cell];
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new RangeError(
        `${name} must contain exactly 81 integers from ${minimum} through ${maximum}`,
      );
    }
  }
}

function validateRestriction(
  name: "force" | "forbid",
  restriction: [number, number] | undefined,
): void {
  if (restriction === undefined) return;
  if (
    !Array.isArray(restriction) ||
    restriction.length !== 2 ||
    !Number.isInteger(restriction[0]) ||
    restriction[0] < 0 ||
    restriction[0] >= CELL_COUNT ||
    !Number.isInteger(restriction[1]) ||
    restriction[1] < 1 ||
    restriction[1] > DIGIT_COUNT
  ) {
    throw new RangeError(`${name} must be a [cell 0..80, digit 1..9] pair`);
  }
}

/** Decode one of the nine input bits without using production mask helpers. */
function domainAllows(mask: number, digit: number): boolean {
  return Math.floor(mask / 2 ** (digit - 1)) % 2 === 1;
}

/**
 * A deliberately test-only, set-based Algorithm X implementation.
 *
 * Each search branch owns copies of its uncovered-column and active-row sets.
 * That makes row deletion explicit and prevents rollback bookkeeping from
 * accidentally turning this independent oracle into the production solver.
 */
class ExactCoverOracle {
  private readonly rows: CandidateRow[] = [];
  private readonly columnRows: number[][] = Array.from({ length: COLUMN_COUNT }, () => []);
  private readonly witnesses: number[][] = [];
  private nodes = 0;
  private interrupted = false;
  private capped = false;

  constructor(private readonly input: OracleInput) {
    this.validateInput();
    this.buildMatrix();
  }

  run(): OracleResult {
    const activeRows = new Set<number>();
    for (let rowId = 0; rowId < this.rows.length; rowId += 1) {
      if (this.rowIsAllowed(this.rows[rowId])) activeRows.add(rowId);
    }

    const uncoveredColumns = new Set<number>();
    for (let column = 0; column < COLUMN_COUNT; column += 1) uncoveredColumns.add(column);

    const exhausted = this.search(uncoveredColumns, activeRows, []);
    return {
      witnesses: this.witnesses,
      exhausted: exhausted && !this.interrupted && !this.capped,
      interrupted: this.interrupted,
      nodes: this.nodes,
    };
  }

  private validateInput(): void {
    validateCells("givens", this.input.givens, 0, 9);
    if (this.input.domains !== undefined)
      validateCells("domains", this.input.domains, 0, ALL_DIGITS);
    validateRestriction("force", this.input.force);
    validateRestriction("forbid", this.input.forbid);

    if (!Number.isInteger(this.input.limit) || this.input.limit < 1)
      throw new RangeError("limit must be a positive integer");
    if (!Number.isInteger(this.input.maxNodes) || this.input.maxNodes < 0)
      throw new RangeError("maxNodes must be a non-negative integer");
  }

  private buildMatrix(): void {
    for (let cell = 0; cell < CELL_COUNT; cell += 1) {
      const row = Math.floor(cell / 9);
      const column = cell % 9;
      const box = Math.floor(row / 3) * 3 + Math.floor(column / 3);
      for (let digitIndex = 0; digitIndex < DIGIT_COUNT; digitIndex += 1) {
        const candidate: CandidateRow = {
          cell,
          digit: digitIndex + 1,
          columns: [
            cell,
            81 + row * 9 + digitIndex,
            162 + column * 9 + digitIndex,
            243 + box * 9 + digitIndex,
          ],
        };
        const rowId = this.rows.length;
        this.rows.push(candidate);
        for (const exactCoverColumn of candidate.columns)
          this.columnRows[exactCoverColumn].push(rowId);
      }
    }
  }

  private rowIsAllowed(row: CandidateRow): boolean {
    const given = this.input.givens[row.cell];
    if (given !== 0 && given !== row.digit) return false;

    const mask = this.input.domains?.[row.cell] ?? ALL_DIGITS;
    if (!domainAllows(mask, row.digit)) return false;

    if (
      this.input.force !== undefined &&
      this.input.force[0] === row.cell &&
      this.input.force[1] !== row.digit
    ) {
      return false;
    }
    if (
      this.input.forbid !== undefined &&
      this.input.forbid[0] === row.cell &&
      this.input.forbid[1] === row.digit
    ) {
      return false;
    }
    return true;
  }

  /** Returns true only when this entire subtree was examined. */
  private search(
    uncoveredColumns: Set<number>,
    activeRows: Set<number>,
    selectedRows: number[],
  ): boolean {
    if (this.capped || this.interrupted) return false;
    if (this.nodes >= this.input.maxNodes) {
      this.interrupted = true;
      return false;
    }
    this.nodes += 1;

    // No exact-cover columns remain: this is a complete solution, not a dead end.
    if (uncoveredColumns.size === 0) {
      this.witnesses.push(this.decodeWitness(selectedRows));
      if (this.witnesses.length >= this.input.limit) {
        this.capped = true;
        return false;
      }
      return true;
    }

    let chosenColumn = -1;
    let chosenRows: number[] = [];
    for (const column of uncoveredColumns) {
      const candidates: number[] = [];
      for (const rowId of this.columnRows[column]) {
        if (activeRows.has(rowId)) candidates.push(rowId);
      }

      // An uncovered column with no row proves this branch impossible.
      if (candidates.length === 0) return true;
      if (chosenColumn === -1 || candidates.length < chosenRows.length) {
        chosenColumn = column;
        chosenRows = candidates;
      }
    }

    for (const rowId of chosenRows) {
      const selected = this.rows[rowId];
      const nextColumns = new Set(uncoveredColumns);
      const nextRows = new Set(activeRows);
      for (const coveredColumn of selected.columns) {
        nextColumns.delete(coveredColumn);
        for (const intersectingRow of this.columnRows[coveredColumn])
          nextRows.delete(intersectingRow);
      }

      selectedRows.push(rowId);
      const branchExhausted = this.search(nextColumns, nextRows, selectedRows);
      selectedRows.pop();
      if (!branchExhausted) return false;
    }
    return true;
  }

  private decodeWitness(selectedRows: number[]): number[] {
    const values = Array<number>(CELL_COUNT).fill(0);
    for (const rowId of selectedRows) {
      const row = this.rows[rowId];
      values[row.cell] = row.digit;
    }
    return values;
  }
}

/** Count classic completions under explicit, bounded test restrictions. */
export function oracle(input: OracleInput): OracleResult {
  return new ExactCoverOracle(input).run();
}
