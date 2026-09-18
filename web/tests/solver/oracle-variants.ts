/**
 * Independent counting oracle for variant constraints (D052, spec §7).
 *
 * This file imports nothing from src/solver. It has its own constraint
 * vocabulary and its own evaluators; the engine's modules, primitives and
 * candidate logic never influence what it counts. The depth-first search only
 * forward-checks with rules whose correctness is obvious from the constraint
 * definition, and every complete assignment is validated against every
 * constraint from scratch, so an over-eager filter can only slow the oracle
 * down, never change its count. `bruteForce` below enumerates without any
 * filtering and is the oracle's own reference on small instances.
 */

export type VariantConstraint =
  | { readonly kind: "all-different"; readonly cells: readonly number[] }
  | {
      readonly kind: "sum";
      readonly cells: readonly number[];
      readonly coefficients?: readonly number[];
      readonly total: number;
    }
  /** cells[0] < cells[1]. */
  | { readonly kind: "order"; readonly cells: readonly [number, number] }
  | {
      readonly kind: "difference";
      readonly cells: readonly [number, number];
      readonly relation: "consecutive" | "ratio" | "neither";
    };

export interface VariantOracleInput {
  readonly cellCount: number;
  readonly symbols: readonly number[];
  readonly givens: readonly number[];
  readonly constraints: readonly VariantConstraint[];
  /** Optional restriction used by per-elimination forcing tests. */
  readonly force?: readonly [number, number];
  readonly forbid?: readonly [number, number];
  /** Stop after this many witnesses (exhaustion is then false). */
  readonly limit: number;
  readonly maxNodes: number;
}

export interface VariantOracleResult {
  readonly witnesses: readonly (readonly number[])[];
  readonly exhausted: boolean;
  readonly interrupted: boolean;
  readonly nodes: number;
}

function validate(input: VariantOracleInput): void {
  const { cellCount, symbols, givens, constraints } = input;
  if (!Number.isInteger(cellCount) || cellCount <= 0) throw new RangeError("cellCount");
  if (!Array.isArray(symbols) || symbols.length === 0) throw new RangeError("symbols");
  if (
    new Set(symbols).size !== symbols.length ||
    symbols.some((s) => !Number.isInteger(s) || s <= 0)
  )
    throw new RangeError("symbols must be distinct positive integers");
  if (!Array.isArray(givens) || givens.length !== cellCount) throw new RangeError("givens");
  for (const given of givens)
    if (given !== 0 && !symbols.includes(given)) throw new RangeError("given outside symbols");
  const cellOk = (cell: number) => Number.isInteger(cell) && cell >= 0 && cell < cellCount;
  for (const constraint of constraints) {
    if (!constraint.cells.every(cellOk)) throw new RangeError(`${constraint.kind} cell`);
    if (new Set(constraint.cells).size !== constraint.cells.length)
      throw new RangeError(`${constraint.kind} repeats a cell`);
    if (constraint.kind === "sum") {
      const coefficients = constraint.coefficients ?? constraint.cells.map(() => 1);
      if (
        coefficients.length !== constraint.cells.length ||
        coefficients.some((c) => !Number.isInteger(c))
      )
        throw new RangeError("sum coefficients");
      if (!Number.isInteger(constraint.total)) throw new RangeError("sum total");
    }
    if (
      (constraint.kind === "order" || constraint.kind === "difference") &&
      (constraint.cells as readonly number[]).length !== 2
    )
      throw new RangeError(`${constraint.kind} needs two cells`);
  }
  for (const restriction of [input.force, input.forbid])
    if (restriction && (!cellOk(restriction[0]) || !symbols.includes(restriction[1])))
      throw new RangeError("restriction");
  if (!Number.isInteger(input.limit) || input.limit < 1) throw new RangeError("limit");
  if (!Number.isInteger(input.maxNodes) || input.maxNodes < 1) throw new RangeError("maxNodes");
}

/** Truth of one constraint on a complete assignment; the only semantics the oracle trusts. */
export function satisfied(constraint: VariantConstraint, values: readonly number[]): boolean {
  switch (constraint.kind) {
    case "all-different": {
      const seen = new Set<number>();
      for (const cell of constraint.cells) {
        if (seen.has(values[cell])) return false;
        seen.add(values[cell]);
      }
      return true;
    }
    case "sum": {
      const coefficients = constraint.coefficients ?? constraint.cells.map(() => 1);
      let total = 0;
      constraint.cells.forEach((cell, index) => {
        total += coefficients[index] * values[cell];
      });
      return total === constraint.total;
    }
    case "order":
      return values[constraint.cells[0]] < values[constraint.cells[1]];
    case "difference": {
      const a = values[constraint.cells[0]],
        b = values[constraint.cells[1]];
      const consecutive = Math.abs(a - b) === 1;
      const ratio = a === 2 * b || b === 2 * a;
      if (constraint.relation === "consecutive") return consecutive;
      if (constraint.relation === "ratio") return ratio;
      return !consecutive && !ratio;
    }
  }
}

/** Exhaustive enumeration with no pruning at all; feasible only for tiny inputs. */
export function bruteForce(input: VariantOracleInput): number {
  validate(input);
  const values = [...input.givens];
  const open = values.map((value, cell) => (value === 0 ? cell : -1)).filter((cell) => cell >= 0);
  let count = 0;
  const recurse = (index: number): void => {
    if (index === open.length) {
      if (input.force && values[input.force[0]] !== input.force[1]) return;
      if (input.forbid && values[input.forbid[0]] === input.forbid[1]) return;
      if (input.constraints.every((constraint) => satisfied(constraint, values))) count += 1;
      return;
    }
    for (const symbol of input.symbols) {
      values[open[index]] = symbol;
      recurse(index + 1);
    }
    values[open[index]] = 0;
  };
  recurse(0);
  return count;
}

/**
 * Forward check after assigning `cell`: returns false when some constraint can
 * no longer be satisfied. Each test is a direct consequence of the constraint
 * definition over the remaining domains; none of them removes a value that a
 * complete solution consistent with the current assignment could still use.
 */
function consistent(
  constraint: VariantConstraint,
  values: readonly number[],
  domains: readonly (readonly number[])[],
): boolean {
  switch (constraint.kind) {
    case "all-different": {
      const seen = new Set<number>();
      for (const cell of constraint.cells) {
        const value = values[cell];
        if (value === 0) continue;
        if (seen.has(value)) return false;
        seen.add(value);
      }
      // An unassigned cell whose every option is already taken cannot be filled.
      return constraint.cells.every(
        (cell) => values[cell] !== 0 || domains[cell].some((symbol) => !seen.has(symbol)),
      );
    }
    case "sum": {
      const coefficients = constraint.coefficients ?? constraint.cells.map(() => 1);
      let lo = 0,
        hi = 0;
      constraint.cells.forEach((cell, index) => {
        const coefficient = coefficients[index];
        if (values[cell] !== 0) {
          lo += coefficient * values[cell];
          hi += coefficient * values[cell];
          return;
        }
        const weighted = domains[cell].map((symbol) => coefficient * symbol);
        lo += Math.min(...weighted);
        hi += Math.max(...weighted);
      });
      return lo <= constraint.total && constraint.total <= hi;
    }
    case "order":
    case "difference": {
      const [a, b] = constraint.cells;
      const left = values[a] !== 0 ? [values[a]] : domains[a];
      const right = values[b] !== 0 ? [values[b]] : domains[b];
      const probe = [...values];
      for (const x of left)
        for (const y of right) {
          probe[a] = x;
          probe[b] = y;
          if (satisfied(constraint, probe)) return true;
        }
      return false;
    }
  }
}

/** Depth-first enumeration with most-constrained-cell ordering and forward checking. */
export function variantOracle(input: VariantOracleInput): VariantOracleResult {
  validate(input);
  const values = [...input.givens];
  const byCell: VariantConstraint[][] = Array.from({ length: input.cellCount }, () => []);
  for (const constraint of input.constraints)
    for (const cell of constraint.cells) byCell[cell].push(constraint);
  const baseDomain = (cell: number): number[] => {
    let symbols = [...input.symbols];
    if (input.force && input.force[0] === cell)
      symbols = symbols.filter((s) => s === input.force![1]);
    if (input.forbid && input.forbid[0] === cell)
      symbols = symbols.filter((s) => s !== input.forbid![1]);
    return symbols;
  };
  const domains: number[][] = values.map((value, cell) =>
    value === 0 ? baseDomain(cell) : [value],
  );
  const witnesses: number[][] = [];
  let nodes = 0,
    interrupted = false;
  // Givens and restrictions must themselves be consistent before any search.
  for (let cell = 0; cell < input.cellCount; cell += 1)
    if (values[cell] !== 0) {
      if (input.force && input.force[0] === cell && input.force[1] !== values[cell])
        return { witnesses: [], exhausted: true, interrupted: false, nodes: 0 };
      if (input.forbid && input.forbid[0] === cell && input.forbid[1] === values[cell])
        return { witnesses: [], exhausted: true, interrupted: false, nodes: 0 };
    }
  if (!input.constraints.every((constraint) => consistent(constraint, values, domains)))
    return { witnesses: [], exhausted: true, interrupted: false, nodes: 0 };

  const search = (): boolean => {
    if (witnesses.length >= input.limit) return false;
    if (nodes >= input.maxNodes) {
      interrupted = true;
      return false;
    }
    nodes += 1;
    let chosen = -1;
    for (let cell = 0; cell < input.cellCount; cell += 1)
      if (values[cell] === 0 && (chosen < 0 || domains[cell].length < domains[chosen].length))
        chosen = cell;
    if (chosen < 0) {
      if (input.constraints.every((constraint) => satisfied(constraint, values)))
        witnesses.push([...values]);
      return witnesses.length < input.limit;
    }
    for (const symbol of domains[chosen]) {
      values[chosen] = symbol;
      // Shrink peer domains under all-different only; other constraints are
      // checked by `consistent`, which reads the current domains.
      const restored: [number, number[]][] = [];
      let ok = true;
      for (const constraint of byCell[chosen]) {
        if (constraint.kind === "all-different")
          for (const peer of constraint.cells)
            if (peer !== chosen && values[peer] === 0 && domains[peer].includes(symbol)) {
              restored.push([peer, domains[peer]]);
              domains[peer] = domains[peer].filter((s) => s !== symbol);
              if (domains[peer].length === 0) ok = false;
            }
      }
      if (ok) ok = byCell[chosen].every((constraint) => consistent(constraint, values, domains));
      if (ok && !search()) {
        for (const [peer, domain] of restored) domains[peer] = domain;
        values[chosen] = 0;
        return false;
      }
      for (const [peer, domain] of restored) domains[peer] = domain;
    }
    values[chosen] = 0;
    return true;
  };
  const finished = search();
  return {
    witnesses,
    exhausted: finished && !interrupted,
    interrupted,
    nodes,
  };
}
