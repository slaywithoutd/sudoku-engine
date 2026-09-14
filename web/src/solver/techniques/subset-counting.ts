import {matchingFacts,sourceFacts} from "../state/source-index";
import type { ReadView } from "../state/types";
import type { PatternGraph } from "./pattern-runtime";
import type { CountPattern, CountScope } from "./set-contracts";
import type { SetCursor } from "./set-runtime";
import type { ChainWork } from "./chains-certificate";
import { combinations, setDigits, setUnion } from "./set-certificate";

/** Untrusted occupancy maxima compiler. The primitive independently enumerates
 * subsets in numeric order; this search enumerates cardinalities from largest
 * to smallest and stops only after finding an actual compatible occupancy. */
export function* countCapacities(view: ReadView, cells: number[], scopes: { cells: number[] }[], target: { cell: number; symbol: number }): Generator<ChainWork, number[]> {
  const symbols = setUnion(view, cells), capacities: number[] = [];
  for (const symbol of symbols) {
    const possible = cells.filter(c => c === target.cell ? symbol === target.symbol :
      (view.state.domains[c] & (1 << (symbol - 1))) && !(symbol === target.symbol && scopes.some(s => s.cells.includes(c) && s.cells.includes(target.cell))));
    let maximum = 0;
    search: for (let size = possible.length; size >= 1; size--) for (const occupancy of combinations(possible, size)) {
      yield { kind: "work", units: 1 };
      if (scopes.every(s => s.cells.filter(c => occupancy.includes(c)).length <= 1)) { maximum = size; break search; }
    }
    capacities.push(maximum); yield { kind: "work", units: 1 };
  }
  return capacities;
}

/** Exhaustive finite scope/cell cursor. Invocation-level round-robin service
 * keeps the twelve counted-cell and four scope-size spaces independent. */
export class SubsetCountingSearch {
  constructor(readonly view: ReadView, readonly graph: PatternGraph) {}
  *patterns(cellCount: number, scopeCount: number, withSingletons = false): SetCursor {
    const view = this.view, empty = view.assembly.problem.cells.filter(c => !view.state.values[c]);
    const houses = view.assembly.allDifferent.filter(h => matchingFacts(view,{kind:"all-different",cells:h.cells}).some(f=>!f.openAssumptions.length));
    const pool = withSingletons ? view.assembly.problem.cells : empty;
    if (cellCount > pool.length) return;
    // A consistent singleton assignment witnesses every occupancy simultaneously;
    // no forced current candidate can lower the total capacity below cell count.
    if (view.assembly.problem.cells.every(c => setDigits(view.state.domains[c]).length === 1) &&
      houses.every(h => new Set(h.cells.map(c => view.state.domains[c])).size === h.cells.length)) return;
    const scratch = this.graph.context.workspace.reserve(0, 65536);
    try {
      for (const cell of empty) for (const symbol of setDigits(view.state.domains[cell])) for (const cells of combinations(pool, cellCount)) {
        yield { kind: "work", units: 1 };
        if (withSingletons && cells.every(c => !view.state.values[c])) continue;
        const local = [...new Set([...cells, cell])], available = houses.filter(h => h.cells.filter(c => local.includes(c)).length >= 2);
        for (const indexes of combinations(available.map((_, i) => i), scopeCount)) {
          yield { kind: "work", units: 1 };
          const scopes: CountScope[] = indexes.map(i => ({ house: available[i].id, cells: available[i].cells.filter(c => local.includes(c)), root: -1 }));
          if (new Set(scopes.map(s => s.cells.join())).size !== scopes.length) continue;
          const capacities = yield* countCapacities(view, cells, scopes, { cell, symbol });
          if (capacities.reduce((a, b) => a + b, 0) >= cells.length) continue;
          const p: CountPattern = { kind: "count", alias: "Subset counting", cells, domains: local.sort((a, b) => a - b).map(c => view.state.domains[c]),
            symbols: setUnion(view, cells), scopes, target: { cell, symbol }, capacities, assumption: -1, contradiction: -1, root: -1 };
          yield { kind: "candidate", pattern: p, effects: [{ kind: "remove", cell, symbol }] };
        }
      }
    } finally { scratch.dispose(); }
  }
  cursors(): SetCursor[] { return [false, true].flatMap(placed => Array.from({ length: 12 }, (_, i) => i + 1)
    .flatMap(size => [1, 2, 3, 4].map(scopes => this.patterns(size, scopes, placed)))); }
}
