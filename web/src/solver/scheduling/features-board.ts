import type { ReadView } from "../state/types";
import { symbolMask } from "../state/read";
import { symbolValue } from "../problem";

/**
 * Board feature schema v1 (spec §3.8). Every entry is a non-negative integer
 * read from candidate masks and the assembly in O(cells x symbols); nothing
 * here builds an index, so the estimator never does a detector's work. The
 * order is part of the schema: a trained model is bound to this exact list
 * and any change bumps BOARD_FEATURE_SCHEMA and the policy id (D094).
 */
export const BOARD_FEATURE_SCHEMA = "board-features@1";

export const BOARD_FEATURE_NAMES = Object.freeze([
  "unsolvedCells",
  "bivalueCells",
  "trivalueCells",
  "wideCells",
  "candidates",
  "coversWithTwoSupports",
  "coversWithThreeSupports",
  "coversWithOneSupport",
  "maxTwoSupportCoversPerSymbol",
  "symbolsFullyPlaced",
  "alsScopes",
  "liveSums",
  "sumSlack",
  "smallLiveSums",
  "liveRelations",
  "scopes",
  "covers",
  "relations",
  "sums",
  "symbols",
  "cells",
] as const);

export type BoardFeatures = readonly number[];

const cache = new WeakMap<ReadView, BoardFeatures>();

function popcount(mask: number): number {
  let count = 0;
  for (let bits = mask; bits !== 0; bits &= bits - 1) count += 1;
  return count;
}

/** Feature vector of a view, computed once per view identity. */
export function boardFeatures(view: ReadView): BoardFeatures {
  const cached = cache.get(view);
  if (cached) return cached;
  const { assembly, state } = view;
  const problem = assembly.problem;
  let unsolved = 0,
    bivalue = 0,
    trivalue = 0,
    wide = 0,
    candidates = 0;
  for (const cell of problem.cells) {
    if (state.values[cell] !== 0) continue;
    unsolved += 1;
    const size = popcount(state.domains[cell]);
    candidates += size;
    if (size === 2) bivalue += 1;
    else if (size === 3) trivalue += 1;
    else if (size >= 4) wide += 1;
  }
  let two = 0,
    three = 0,
    one = 0;
  const twoPerSymbol = new Map<number, number>();
  for (const cover of assembly.covers) {
    if (cover.cells.some((cell) => state.values[cell] === cover.symbol)) continue;
    const supports = view.supports(cover.id).length;
    if (supports === 1) one += 1;
    else if (supports === 2) {
      two += 1;
      twoPerSymbol.set(cover.symbol, (twoPerSymbol.get(cover.symbol) ?? 0) + 1);
    } else if (supports === 3) three += 1;
  }
  const placedPerSymbol = new Map<number, number>();
  for (const cell of problem.cells)
    if (state.values[cell] !== 0)
      placedPerSymbol.set(state.values[cell], (placedPerSymbol.get(state.values[cell]) ?? 0) + 1);
  const fullyPlaced = problem.symbols.filter(
    (symbol) => (placedPerSymbol.get(symbol) ?? 0) >= problem.cells.length / problem.symbols.length,
  ).length;
  // Scope-level ALS proxy: a scope whose open cells number n and whose candidate
  // union has n + 1 symbols. Combinations inside a scope stay with the ALS index.
  let alsScopes = 0;
  for (const scope of assembly.allDifferent) {
    const open = scope.cells.filter((cell) => state.values[cell] === 0);
    if (open.length < 2) continue;
    const union = open.reduce((mask, cell) => mask | state.domains[cell], 0);
    if (popcount(union) === open.length + 1) alsScopes += 1;
  }
  let liveSums = 0,
    slack = 0,
    smallSums = 0;
  for (const sum of assembly.sums) {
    const open = sum.cells.filter((cell) => state.values[cell] === 0).length;
    if (open === 0) continue;
    liveSums += 1;
    if (open <= 3) smallSums += 1;
    let lo = 0,
      hi = 0;
    sum.cells.forEach((cell, index) => {
      const mask = state.values[cell] !== 0 ? symbolMask(state.values[cell]) : state.domains[cell];
      let least = Infinity,
        most = -Infinity;
      for (const symbol of problem.symbols) {
        if ((mask & symbolMask(symbol)) === 0) continue;
        const weighted = sum.coefficients[index] * symbolValue(problem, symbol);
        if (weighted < least) least = weighted;
        if (weighted > most) most = weighted;
      }
      if (least !== Infinity) {
        lo += least;
        hi += most;
      }
    });
    slack += Math.max(0, hi - lo);
  }
  const liveRelations = assembly.relations.filter((relation) =>
    relation.cells.some((cell) => state.values[cell] === 0),
  ).length;
  const features = Object.freeze([
    unsolved,
    bivalue,
    trivalue,
    wide,
    candidates,
    two,
    three,
    one,
    Math.max(0, ...twoPerSymbol.values()),
    fullyPlaced,
    alsScopes,
    liveSums,
    slack,
    smallSums,
    liveRelations,
    assembly.allDifferent.length,
    assembly.covers.length,
    assembly.relations.length,
    assembly.sums.length,
    problem.symbols.length,
    problem.cells.length,
  ]);
  cache.set(view, features);
  return features;
}
