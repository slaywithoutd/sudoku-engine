/**
 * Deterministic generator of small mixed variant problems for property tests.
 *
 * Problems are built from a random complete grid so every instance has at
 * least one solution; the constraints are read off that grid (cage totals,
 * order directions, dot relations). The output uses the oracle's neutral
 * vocabulary; `toEngineConstraints` maps it onto the production module
 * instance shapes so the same instance can be given to the engine.
 */
import { variantOracle, type VariantConstraint } from "./oracle-variants";

export interface SmallProblem {
  readonly seed: number;
  readonly width: number;
  readonly boxWidth: number;
  readonly boxHeight: number;
  readonly cellCount: number;
  readonly symbols: readonly number[];
  readonly givens: readonly number[];
  readonly constraints: readonly VariantConstraint[];
  /** The grid the constraints were read from; a witness, not necessarily the only one. */
  readonly solution: readonly number[];
}

export interface GeneratorOptions {
  readonly width?: 4 | 6;
  readonly cages?: number;
  readonly orders?: number;
  readonly dots?: number;
  readonly negativeDots?: boolean;
  readonly arrows?: number;
  readonly givens?: number;
}

/** mulberry32: small, seedable, good enough for fixtures. */
export function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

export function classicScopes(
  width: number,
  boxWidth: number,
  boxHeight: number,
): VariantConstraint[] {
  const scopes: VariantConstraint[] = [];
  for (let index = 0; index < width; index += 1) {
    scopes.push({
      kind: "all-different",
      cells: Array.from({ length: width }, (_, c) => index * width + c),
    });
    scopes.push({
      kind: "all-different",
      cells: Array.from({ length: width }, (_, r) => r * width + index),
    });
  }
  for (let boxRow = 0; boxRow < width / boxHeight; boxRow += 1)
    for (let boxColumn = 0; boxColumn < width / boxWidth; boxColumn += 1) {
      const cells: number[] = [];
      for (let r = 0; r < boxHeight; r += 1)
        for (let c = 0; c < boxWidth; c += 1)
          cells.push((boxRow * boxHeight + r) * width + boxColumn * boxWidth + c);
      scopes.push({ kind: "all-different", cells });
    }
  return scopes;
}

function completeGrid(
  width: number,
  boxWidth: number,
  boxHeight: number,
  scopes: VariantConstraint[],
  random: () => number,
): number[] {
  // Relabel symbols and permute rows within bands, bands, columns within
  // stacks and stacks: every such move preserves rows, columns and boxes, so
  // the oracle's single deterministic witness yields a different valid grid
  // per seed.
  const symbols = Array.from({ length: width }, (_, index) => index + 1);
  const result = variantOracle({
    cellCount: width * width,
    symbols,
    givens: Array(width * width).fill(0),
    constraints: scopes,
    limit: 1,
    maxNodes: 100000,
  });
  if (result.witnesses.length === 0) throw new Error("no base grid");
  const permutation = shuffle(symbols, random);
  const lines = (size: number) => {
    const groups = shuffle(
      Array.from({ length: width / size }, (_, g) => g),
      random,
    );
    return groups.flatMap((group) =>
      shuffle(
        Array.from({ length: size }, (_, i) => group * size + i),
        random,
      ),
    );
  };
  const rows = lines(boxHeight),
    columns = lines(boxWidth);
  const base = result.witnesses[0];
  const grid: number[] = [];
  for (let r = 0; r < width; r += 1)
    for (let c = 0; c < width; c += 1)
      grid.push(permutation[base[rows[r] * width + columns[c]] - 1]);
  return grid;
}

function neighbours(cell: number, width: number): number[] {
  const r = Math.floor(cell / width),
    c = cell % width;
  const result: number[] = [];
  if (c + 1 < width) result.push(cell + 1);
  if (r + 1 < width) result.push(cell + width);
  return result;
}

export function generateSmall(seed: number, options: GeneratorOptions = {}): SmallProblem {
  const width = options.width ?? 4;
  const boxWidth = width === 4 ? 2 : 3;
  const boxHeight = 2;
  const random = rng(seed);
  const scopes = classicScopes(width, boxWidth, boxHeight);
  const solution = completeGrid(width, boxWidth, boxHeight, scopes, random);
  const cellCount = width * width;
  const constraints: VariantConstraint[] = [...scopes];
  const used = new Set<number>();

  for (let cage = 0; cage < (options.cages ?? 0); cage += 1) {
    const start = Math.floor(random() * cellCount);
    if (used.has(start)) continue;
    const cells = [start];
    used.add(start);
    const size = 2 + Math.floor(random() * 2);
    while (cells.length < size) {
      const frontier = cells
        .flatMap((cell) => neighbours(cell, width))
        .filter((cell) => !used.has(cell));
      if (frontier.length === 0) break;
      const next = frontier[Math.floor(random() * frontier.length)];
      cells.push(next);
      used.add(next);
    }
    if (cells.length < 2 || new Set(cells.map((cell) => solution[cell])).size !== cells.length)
      continue;
    const sorted = [...cells].sort((a, b) => a - b);
    constraints.push({ kind: "all-different", cells: sorted });
    constraints.push({
      kind: "sum",
      cells: sorted,
      total: sorted.reduce((t, cell) => t + solution[cell], 0),
    });
  }

  const orderPairs = new Set<string>();
  for (let order = 0; order < (options.orders ?? 0); order += 1) {
    const a = Math.floor(random() * cellCount);
    const candidates = neighbours(a, width);
    if (candidates.length === 0) continue;
    const b = candidates[Math.floor(random() * candidates.length)];
    if (solution[a] === solution[b] || orderPairs.has(`${a}-${b}`)) continue;
    orderPairs.add(`${a}-${b}`);
    constraints.push({ kind: "order", cells: solution[a] < solution[b] ? [a, b] : [b, a] });
  }

  const dotPairs = new Set<string>();
  for (let dot = 0; dot < (options.dots ?? 0); dot += 1) {
    const a = Math.floor(random() * cellCount);
    const candidates = neighbours(a, width);
    if (candidates.length === 0) continue;
    const b = candidates[Math.floor(random() * candidates.length)];
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    if (dotPairs.has(key)) continue;
    dotPairs.add(key);
    const consecutive = Math.abs(solution[a] - solution[b]) === 1;
    const ratio = solution[a] === 2 * solution[b] || solution[b] === 2 * solution[a];
    if (ratio) constraints.push({ kind: "difference", cells: [a, b], relation: "ratio" });
    else if (consecutive)
      constraints.push({ kind: "difference", cells: [a, b], relation: "consecutive" });
    else if (options.negativeDots)
      constraints.push({ kind: "difference", cells: [a, b], relation: "neither" });
  }
  if (options.negativeDots)
    for (let cell = 0; cell < cellCount; cell += 1)
      for (const b of neighbours(cell, width)) {
        const key = `${cell}-${b}`;
        if (dotPairs.has(key)) continue;
        dotPairs.add(key);
        const consecutive = Math.abs(solution[cell] - solution[b]) === 1;
        const ratio = solution[cell] === 2 * solution[b] || solution[b] === 2 * solution[cell];
        if (!consecutive && !ratio)
          constraints.push({ kind: "difference", cells: [cell, b], relation: "neither" });
      }

  for (let arrow = 0; arrow < (options.arrows ?? 0); arrow += 1) {
    const circle = Math.floor(random() * cellCount);
    const arm: number[] = [];
    let current = circle;
    const length = 2;
    while (arm.length < length) {
      const next = neighbours(current, width).filter(
        (cell) => cell !== circle && !arm.includes(cell),
      );
      if (next.length === 0) break;
      current = next[Math.floor(random() * next.length)];
      arm.push(current);
    }
    if (arm.length < 2 || arm.reduce((t, cell) => t + solution[cell], 0) !== solution[circle])
      continue;
    constraints.push({
      kind: "sum",
      cells: [circle, ...arm],
      coefficients: [-1, ...arm.map(() => 1)],
      total: 0,
    });
  }

  const givens = Array(cellCount).fill(0);
  for (const cell of shuffle(
    Array.from({ length: cellCount }, (_, c) => c),
    random,
  ).slice(0, options.givens ?? 0))
    givens[cell] = solution[cell];

  return {
    seed,
    width,
    boxWidth,
    boxHeight,
    cellCount,
    symbols: Array.from({ length: width }, (_, index) => index + 1),
    givens,
    constraints,
    solution,
  };
}

/** Production module instance shapes (spec §3.4); ids are stable per problem. */
export interface EngineConstraintShape {
  readonly id: string;
  readonly type: string;
  readonly cells: readonly number[];
  readonly parameters: Readonly<Record<string, number | string>>;
}

export function toEngineConstraints(problem: SmallProblem): EngineConstraintShape[] {
  const result: EngineConstraintShape[] = [];
  const counters = new Map<string, number>();
  const next = (prefix: string) => {
    const count = counters.get(prefix) ?? 0;
    counters.set(prefix, count + 1);
    return `${prefix}:${count}`;
  };
  const cageCells = new Set<string>();
  for (const constraint of problem.constraints) {
    if (constraint.kind === "sum" && !constraint.coefficients)
      cageCells.add(constraint.cells.join(","));
  }
  for (const constraint of problem.constraints) {
    switch (constraint.kind) {
      case "all-different":
        // Cage scopes are published by cage@1 itself; only geometry scopes stay all-different@1.
        if (!cageCells.has(constraint.cells.join(",")))
          result.push({
            id: next("scope"),
            type: "all-different@1",
            cells: constraint.cells,
            parameters: {},
          });
        break;
      case "sum":
        if (constraint.coefficients)
          result.push({
            id: next("arrow"),
            type: "arrow@1",
            cells: constraint.cells,
            parameters: {},
          });
        else
          result.push({
            id: next("cage"),
            type: "cage@1",
            cells: constraint.cells,
            parameters: { total: constraint.total },
          });
        break;
      case "order":
        result.push({
          id: next("order"),
          type: "order@1",
          cells: constraint.cells,
          parameters: {},
        });
        break;
      case "difference":
        result.push({
          id: next("difference"),
          type: "difference@1",
          cells: constraint.cells,
          parameters: { kind: constraint.relation },
        });
        break;
    }
  }
  return result;
}
