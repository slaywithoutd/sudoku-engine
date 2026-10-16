/**
 * Deterministic 9x9 corpus generator (spec §3.9, plan T13). Test-only: it
 * imports the independent oracles, never the production solver. Every case
 * starts from a random complete grid, so constraints are read off a known
 * witness; uniqueness is then established by the oracles alone.
 */
import { oracle } from "../oracle";
import { variantOracle, type VariantConstraint } from "../oracle-variants";
import { rng } from "../generate-small";

export type CorpusFamily = "classic" | "killer" | "thermometer" | "kropki" | "arrow" | "mixed";

export interface CorpusConstraint {
  readonly id: string;
  readonly type: "cage@1" | "order@1" | "difference@1" | "arrow@1";
  readonly cells: readonly number[];
  readonly parameters: Readonly<Record<string, number | string>>;
}

export interface CorpusCase {
  readonly id: string;
  readonly family: CorpusFamily;
  /** 81 digits, 0 for an open cell; classic rows/columns/boxes are implied. */
  readonly puzzle: string;
  readonly constraints: readonly CorpusConstraint[];
  readonly givens: number;
  readonly oracleCount: 1;
  readonly sourceGroup: string;
  readonly license: "repository-generated";
  readonly seed: number;
}

const WIDTH = 9;
const CELLS = WIDTH * WIDTH;
const SYMBOLS = Array.from({ length: WIDTH }, (_, index) => index + 1);

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

function classicScopes(): VariantConstraint[] {
  const scopes: VariantConstraint[] = [];
  for (let index = 0; index < WIDTH; index += 1) {
    scopes.push({
      kind: "all-different",
      cells: Array.from({ length: WIDTH }, (_, c) => index * WIDTH + c),
    });
    scopes.push({
      kind: "all-different",
      cells: Array.from({ length: WIDTH }, (_, r) => r * WIDTH + index),
    });
  }
  for (let box = 0; box < WIDTH; box += 1) {
    const cells: number[] = [];
    for (let r = 0; r < 3; r += 1)
      for (let c = 0; c < 3; c += 1)
        cells.push((Math.floor(box / 3) * 3 + r) * WIDTH + (box % 3) * 3 + c);
    scopes.push({ kind: "all-different", cells });
  }
  return scopes;
}

let baseGrid: number[] | undefined;

/** A random complete classic grid: the exact-cover oracle's first witness under valid symmetries. */
export function completeGrid(random: () => number): number[] {
  if (!baseGrid) {
    const result = oracle({ givens: Array(CELLS).fill(0), limit: 1, maxNodes: 1_000_000 });
    baseGrid = [...result.witnesses[0]];
  }
  const permutation = shuffle(SYMBOLS, random);
  const lines = () => {
    const bands = shuffle([0, 1, 2], random);
    return bands.flatMap((band) => shuffle([0, 1, 2], random).map((line) => band * 3 + line));
  };
  const rows = lines(),
    columns = lines();
  const transpose = random() < 0.5;
  const grid: number[] = [];
  for (let r = 0; r < WIDTH; r += 1)
    for (let c = 0; c < WIDTH; c += 1) {
      const source = transpose
        ? baseGrid[columns[c] * WIDTH + rows[r]]
        : baseGrid[rows[r] * WIDTH + columns[c]];
      grid.push(permutation[source - 1]);
    }
  return grid;
}

function neighbours(cell: number): number[] {
  const r = Math.floor(cell / WIDTH),
    c = cell % WIDTH;
  const result: number[] = [];
  if (c + 1 < WIDTH) result.push(cell + 1);
  if (r + 1 < WIDTH) result.push(cell + WIDTH);
  if (c > 0) result.push(cell - 1);
  if (r > 0) result.push(cell - WIDTH);
  return result;
}

function toOracleConstraints(constraints: readonly CorpusConstraint[]): VariantConstraint[] {
  const result: VariantConstraint[] = classicScopes();
  for (const constraint of constraints)
    switch (constraint.type) {
      case "cage@1":
        result.push({ kind: "all-different", cells: constraint.cells });
        result.push({
          kind: "sum",
          cells: constraint.cells,
          total: constraint.parameters.total as number,
        });
        break;
      case "order@1":
        result.push({ kind: "order", cells: [constraint.cells[0], constraint.cells[1]] });
        break;
      case "difference@1":
        result.push({
          kind: "difference",
          cells: [constraint.cells[0], constraint.cells[1]],
          relation: constraint.parameters.kind as "consecutive" | "ratio" | "neither",
        });
        break;
      case "arrow@1": {
        const [circle, ...arm] = constraint.cells;
        result.push({
          kind: "sum",
          cells: [circle, ...arm],
          coefficients: [-1, ...arm.map(() => 1)],
          total: 0,
        });
        break;
      }
    }
  return result;
}

export interface UniquenessOptions {
  readonly maxNodes?: number;
}

/** Unique under the classic oracle (no constraints) or the variant oracle; undefined when inconclusive. */
export function isUnique(
  givens: readonly number[],
  constraints: readonly CorpusConstraint[],
  options: UniquenessOptions = {},
): boolean | undefined {
  if (constraints.length === 0) {
    const result = oracle({
      givens: [...givens],
      limit: 2,
      maxNodes: options.maxNodes ?? 2_000_000,
    });
    if (!result.exhausted && result.witnesses.length < 2) return undefined;
    return result.witnesses.length === 1;
  }
  const result = variantOracle({
    cellCount: CELLS,
    symbols: SYMBOLS,
    givens,
    constraints: toOracleConstraints(constraints),
    limit: 2,
    maxNodes: options.maxNodes ?? 400_000,
  });
  if (result.interrupted && result.witnesses.length < 2) return undefined;
  return result.witnesses.length === 1;
}

/** Remove givens in random order while uniqueness survives; never removes below `floor` givens. */
function thinGivens(
  solution: readonly number[],
  keep: readonly boolean[],
  constraints: readonly CorpusConstraint[],
  random: () => number,
  floor: number,
): number[] | undefined {
  const givens = solution.map((value, cell) => (keep[cell] ? value : 0));
  const unique = isUnique(givens, constraints);
  if (unique !== true) return undefined;
  for (const cell of shuffle(
    Array.from({ length: CELLS }, (_, c) => c),
    random,
  )) {
    if (givens[cell] === 0) continue;
    if (givens.filter((v) => v !== 0).length <= floor) break;
    const value = givens[cell];
    givens[cell] = 0;
    if (isUnique(givens, constraints) !== true) givens[cell] = value;
  }
  return givens;
}

export function classicCase(seed: number): CorpusCase | undefined {
  const random = rng(seed);
  const solution = completeGrid(random);
  const givens = thinGivens(
    solution,
    solution.map(() => true),
    [],
    random,
    17,
  );
  if (!givens) return undefined;
  return {
    id: `classic-${seed}`,
    family: "classic",
    puzzle: givens.join(""),
    constraints: [],
    givens: givens.filter((v) => v !== 0).length,
    oracleCount: 1,
    sourceGroup: `gen-classic-${seed}`,
    license: "repository-generated",
    seed,
  };
}

function cages(
  solution: readonly number[],
  random: () => number,
  coverage: number,
): CorpusConstraint[] {
  const used = new Set<number>();
  const result: CorpusConstraint[] = [];
  const order = shuffle(
    Array.from({ length: CELLS }, (_, c) => c),
    random,
  );
  for (const start of order) {
    if (used.has(start) || result.length >= coverage) continue;
    const cells = [start];
    used.add(start);
    const size = 2 + Math.floor(random() * 3);
    while (cells.length < size) {
      const frontier = cells
        .flatMap(neighbours)
        .filter((cell) => !used.has(cell) && !cells.some((c) => solution[c] === solution[cell]));
      if (frontier.length === 0) break;
      const next = frontier[Math.floor(random() * frontier.length)];
      cells.push(next);
      used.add(next);
    }
    if (cells.length < 2) {
      used.delete(start);
      continue;
    }
    const sorted = [...cells].sort((a, b) => a - b);
    result.push({
      id: `cage:${result.length}`,
      type: "cage@1",
      cells: sorted,
      parameters: { total: sorted.reduce((t, cell) => t + solution[cell], 0) },
    });
  }
  return result;
}

export function killerCase(seed: number): CorpusCase | undefined {
  const random = rng(seed);
  const solution = completeGrid(random);
  // Full cage coverage; givens are thinned from a small random seed set.
  const constraints = cages(solution, random, CELLS);
  const keep = solution.map(() => random() < 0.15);
  const givens = thinGivens(solution, keep, constraints, random, 0);
  if (!givens) return undefined;
  return {
    id: `killer-${seed}`,
    family: "killer",
    puzzle: givens.join(""),
    constraints,
    givens: givens.filter((v) => v !== 0).length,
    oracleCount: 1,
    sourceGroup: `gen-killer-${seed}`,
    license: "repository-generated",
    seed,
  };
}

export function thermometers(
  solution: readonly number[],
  random: () => number,
  count: number,
): CorpusConstraint[] {
  const result: CorpusConstraint[] = [];
  const used = new Set<number>();
  let attempts = 0;
  while (result.length < count && attempts < count * 20) {
    attempts += 1;
    const start = Math.floor(random() * CELLS);
    if (used.has(start)) continue;
    const path = [start];
    used.add(start);
    while (path.length < 6) {
      const current = path[path.length - 1];
      const next = neighbours(current).filter(
        (cell) => !used.has(cell) && solution[cell] > solution[current],
      );
      if (next.length === 0 || (path.length >= 3 && random() < 0.35)) break;
      const chosen = next[Math.floor(random() * next.length)];
      path.push(chosen);
      used.add(chosen);
    }
    if (path.length < 3) {
      for (const cell of path) used.delete(cell);
      continue;
    }
    for (let index = 0; index + 1 < path.length; index += 1)
      result.push({
        id: `thermo:${result.length}`,
        type: "order@1",
        cells: [path[index], path[index + 1]],
        parameters: {},
      });
  }
  return result;
}

export function thermometerCase(seed: number): CorpusCase | undefined {
  const random = rng(seed);
  const solution = completeGrid(random);
  const constraints = thermometers(solution, random, 6);
  if (constraints.length < 6) return undefined;
  // Random subsets below ~55 givens are rarely unique; thinning removes the surplus.
  const keep = solution.map(() => random() < 0.65);
  const givens = thinGivens(solution, keep, constraints, random, 12);
  if (!givens) return undefined;
  return {
    id: `thermometer-${seed}`,
    family: "thermometer",
    puzzle: givens.join(""),
    constraints,
    givens: givens.filter((v) => v !== 0).length,
    oracleCount: 1,
    sourceGroup: `gen-thermometer-${seed}`,
    license: "repository-generated",
    seed,
  };
}

function kropkiDots(solution: readonly number[], negative: boolean): CorpusConstraint[] {
  const result: CorpusConstraint[] = [];
  for (let cell = 0; cell < CELLS; cell += 1)
    for (const other of [cell + 1, cell + WIDTH]) {
      if (other >= CELLS || (other === cell + 1 && cell % WIDTH === WIDTH - 1)) continue;
      const a = solution[cell],
        b = solution[other];
      const ratio = a === 2 * b || b === 2 * a;
      const consecutive = Math.abs(a - b) === 1;
      const kind = ratio ? "ratio" : consecutive ? "consecutive" : negative ? "neither" : undefined;
      if (!kind) continue;
      result.push({
        id: `dot:${cell}-${other}`,
        type: "difference@1",
        cells: [cell, other],
        parameters: { kind },
      });
    }
  return result;
}

export function kropkiCase(seed: number): CorpusCase | undefined {
  const random = rng(seed);
  const solution = completeGrid(random);
  const negative = seed % 2 === 0;
  let constraints = kropkiDots(solution, negative);
  // Without the negative constraint keep about half of the dots; a full set is often trivial.
  if (!negative) constraints = constraints.filter(() => random() < 0.6);
  const keep = solution.map(() => random() < (negative ? 0.12 : 0.35));
  const givens = thinGivens(solution, keep, constraints, random, negative ? 0 : 10);
  if (!givens) return undefined;
  return {
    id: `kropki-${seed}`,
    family: "kropki",
    puzzle: givens.join(""),
    constraints,
    givens: givens.filter((v) => v !== 0).length,
    oracleCount: 1,
    sourceGroup: `gen-kropki-${seed}`,
    license: "repository-generated",
    seed,
  };
}

function arrows(
  solution: readonly number[],
  random: () => number,
  count: number,
): CorpusConstraint[] {
  const result: CorpusConstraint[] = [];
  const used = new Set<number>();
  let attempts = 0;
  while (result.length < count && attempts < count * 30) {
    attempts += 1;
    const circle = Math.floor(random() * CELLS);
    if (used.has(circle) || solution[circle] < 3) continue;
    const arm: number[] = [];
    let current = circle;
    let sum = 0;
    while (sum < solution[circle]) {
      const next = neighbours(current).filter(
        (cell) =>
          cell !== circle &&
          !used.has(cell) &&
          !arm.includes(cell) &&
          sum + solution[cell] <= solution[circle],
      );
      if (next.length === 0) break;
      current = next[Math.floor(random() * next.length)];
      arm.push(current);
      sum += solution[current];
    }
    if (arm.length < 2 || sum !== solution[circle]) continue;
    used.add(circle);
    for (const cell of arm) used.add(cell);
    result.push({
      id: `arrow:${result.length}`,
      type: "arrow@1",
      cells: [circle, ...arm.sort((a, b) => a - b)],
      parameters: {},
    });
  }
  return result;
}

export function arrowCase(seed: number): CorpusCase | undefined {
  const random = rng(seed);
  const solution = completeGrid(random);
  const constraints = arrows(solution, random, 7);
  if (constraints.length < 5) return undefined;
  // Random subsets below ~55 givens are rarely unique; thinning removes the surplus.
  const keep = solution.map(() => random() < 0.65);
  const givens = thinGivens(solution, keep, constraints, random, 12);
  if (!givens) return undefined;
  return {
    id: `arrow-${seed}`,
    family: "arrow",
    puzzle: givens.join(""),
    constraints,
    givens: givens.filter((v) => v !== 0).length,
    oracleCount: 1,
    sourceGroup: `gen-arrow-${seed}`,
    license: "repository-generated",
    seed,
  };
}

export function mixedCase(seed: number): CorpusCase | undefined {
  const random = rng(seed);
  const solution = completeGrid(random);
  const constraints = [
    ...cages(solution, random, 8),
    ...thermometers(solution, random, 2),
    ...arrows(solution, random, 2),
  ];
  const dotted = kropkiDots(solution, false).filter(() => random() < 0.2);
  const all = [...constraints, ...dotted].filter(
    (constraint, index, list) =>
      list.findIndex(
        (other) => other.cells.join() === constraint.cells.join() && other.type === constraint.type,
      ) === index,
  );
  const keep = solution.map(() => random() < 0.55);
  const givens = thinGivens(solution, keep, all, random, 8);
  if (!givens) return undefined;
  return {
    id: `mixed-${seed}`,
    family: "mixed",
    puzzle: givens.join(""),
    constraints: all,
    givens: givens.filter((v) => v !== 0).length,
    oracleCount: 1,
    sourceGroup: `gen-mixed-${seed}`,
    license: "repository-generated",
    seed,
  };
}

export const generators: Record<CorpusFamily, (seed: number) => CorpusCase | undefined> = {
  classic: classicCase,
  killer: killerCase,
  thermometer: thermometerCase,
  kropki: kropkiCase,
  arrow: arrowCase,
  mixed: mixedCase,
};
