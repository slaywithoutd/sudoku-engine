import { matchingFacts } from "../state/source-index";
import type { ReadView } from "../state/types";
import type { PatternGraph } from "./pattern-runtime";
import type { CountPattern, CountScope } from "./set-contracts";
import type { SetCursor } from "./set-runtime";
import type { ChainWork } from "./chains-certificate";
import { combinations, setDigits, setUnion } from "./set-certificate";
import { symbolMask } from "../state/read";

/** Untrusted occupancy maxima compiler. The primitive independently enumerates
 * subsets in numeric order; this search enumerates cardinalities from largest
 * to smallest and stops only after finding an actual compatible occupancy. */
export function* countCapacities(
  view: ReadView,
  cells: number[],
  scopes: { cells: number[] }[],
  target: { cell: number; symbol: number },
): Generator<ChainWork, number[]> {
  const symbols = setUnion(view, cells),
    capacities: number[] = [];
  for (const symbol of symbols) {
    const possible = cells.filter((cell) =>
      cell === target.cell
        ? symbol === target.symbol
        : view.state.domains[cell] & symbolMask(symbol) &&
          !(
            symbol === target.symbol &&
            scopes.some((scope) => scope.cells.includes(cell) && scope.cells.includes(target.cell))
          ),
    );
    let maximum = 0;
    search: for (let size = possible.length; size >= 1; size--)
      for (const occupancy of combinations(possible, size)) {
        yield { kind: "work", units: 1 };
        if (
          scopes.every(
            (scope) => scope.cells.filter((cell) => occupancy.includes(cell)).length <= 1,
          )
        ) {
          maximum = size;
          break search;
        }
      }
    capacities.push(maximum);
    yield { kind: "work", units: 1 };
  }
  return capacities;
}

/** Exhaustive finite scope/cell cursor. Invocation-level round-robin service
 * keeps the twelve counted-cell and four scope-size spaces independent. */
export class SubsetCountingSearch {
  constructor(
    readonly view: ReadView,
    readonly graph: PatternGraph,
  ) {}
  *patterns(cellCount: number, scopeCount: number, withSingletons = false): SetCursor {
    const view = this.view,
      empty = view.assembly.problem.cells.filter((cell) => !view.state.values[cell]);
    const houses = view.assembly.allDifferent.filter((house) =>
      matchingFacts(view, { kind: "all-different", cells: house.cells }).some(
        (fact) => !fact.openAssumptions.length,
      ),
    );
    const pool = withSingletons ? view.assembly.problem.cells : empty;
    if (cellCount > pool.length) return;
    // A consistent singleton assignment witnesses every occupancy simultaneously;
    // no forced current candidate can lower the total capacity below cell count.
    if (
      view.assembly.problem.cells.every(
        (cell) => setDigits(view.state.domains[cell]).length === 1,
      ) &&
      houses.every(
        (house) =>
          new Set(house.cells.map((cell) => view.state.domains[cell])).size === house.cells.length,
      )
    )
      return;
    const scratch = this.graph.context.workspace.reserve(0, 65536);
    try {
      for (const cell of empty)
        for (const symbol of setDigits(view.state.domains[cell]))
          for (const cells of combinations(pool, cellCount)) {
            yield { kind: "work", units: 1 };
            if (withSingletons && cells.every((other) => !view.state.values[other])) continue;
            const local = [...new Set([...cells, cell])],
              available = houses.filter(
                (house) => house.cells.filter((other) => local.includes(other)).length >= 2,
              );
            for (const indexes of combinations(
              available.map((_, i) => i),
              scopeCount,
            )) {
              yield { kind: "work", units: 1 };
              const scopes: CountScope[] = indexes.map((i) => ({
                house: available[i].id,
                cells: available[i].cells.filter((other) => local.includes(other)),
                root: -1,
              }));
              if (new Set(scopes.map((scope) => scope.cells.join())).size !== scopes.length)
                continue;
              const capacities = yield* countCapacities(view, cells, scopes, { cell, symbol });
              if (capacities.reduce((left, right) => left + right, 0) >= cells.length) continue;
              const pattern: CountPattern = {
                kind: "count",
                alias: "Subset counting",
                cells,
                domains: local
                  .sort((left, right) => left - right)
                  .map((other) => view.state.domains[other]),
                symbols: setUnion(view, cells),
                scopes,
                target: { cell, symbol },
                capacities,
                assumption: -1,
                contradiction: -1,
                root: -1,
              };
              yield {
                kind: "candidate",
                pattern: pattern,
                effects: [{ kind: "remove", cell, symbol }],
              };
            }
          }
    } finally {
      scratch.dispose();
    }
  }
  cursors(): SetCursor[] {
    return [false, true].flatMap((placed) =>
      Array.from({ length: 12 }, (_, i) => i + 1).flatMap((size) =>
        [1, 2, 3, 4].map((scopes) => this.patterns(size, scopes, placed)),
      ),
    );
  }
}
