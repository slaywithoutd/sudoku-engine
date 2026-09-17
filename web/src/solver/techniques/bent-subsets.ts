import type { Json } from "../problem";
import type { ReadView } from "../state/types";
import type { Effect } from "../proof/types";
import { combinations } from "../indexes/workspace";
import { digits, pos, type BentPattern } from "./pattern-contracts";
import {
  descriptor,
  PatternBuilder,
  type PatternGraph,
  type PatternStrategy,
} from "./pattern-runtime";
import { symbolMask } from "../state/read";

/** Enumerates only the declared 4..6 cells; no grid search or solution facts. */
export class BentSubsets implements PatternStrategy {
  *patterns(view: ReadView, graph: PatternGraph) {
    const cells = view.assembly.problem.cells.filter(
      (cell) =>
        !view.state.values[cell] &&
        digits(view, cell).length >= 2 &&
        digits(view, cell).length <= 6,
    );
    for (const event of combinations(cells, 6, graph.context.workspace)) {
      if (event.kind === "work") {
        yield event;
        continue;
      }
      const selected = event.cells,
        n = selected.length;
      if (n < 4) continue;
      yield { kind: "work" as const, units: 1 };
      const symbols = [...new Set(selected.flatMap((cell) => digits(view, cell)))].sort(
        (left, right) => left - right,
      );
      if (symbols.length !== n) continue;
      const conflicts: number[][] = [];
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          yield { kind: "work" as const, units: 1 };
          // Local table constraints are exact subsets of proved all-different scopes.
          if (graph.scopes.has(`${selected[i]}:${selected[j]}`))
            conflicts.push([selected[i], selected[j]]);
        }
      const occurrences = Object.fromEntries(
        symbols.map((symbol) => [
          symbol,
          selected.filter((cell) => view.state.domains[cell] & symbolMask(symbol)),
        ]),
      );
      const unrestricted = symbols.filter((symbol) =>
        occurrences[symbol].some((left, i) =>
          occurrences[symbol]
            .slice(i + 1)
            .some(
              (right) => !conflicts.some((pair) => pair.includes(left) && pair.includes(right)),
            ),
        ),
      );
      if (unrestricted.length !== 1) continue;
      const zDigit = unrestricted[0];
      const effects: Effect[] = [];
      for (const target of view.assembly.problem.cells) {
        yield { kind: "work" as const, units: 1 };
        if (
          !view.state.values[target] &&
          !selected.includes(target) &&
          view.state.domains[target] & symbolMask(zDigit) &&
          occurrences[zDigit].every((cell) => graph.has(pos(cell, zDigit), pos(target, zDigit)))
        )
          effects.push({ kind: "remove", cell: target, symbol: zDigit });
      }
      if (!effects.length) continue;
      const values = selected.map((cell) => digits(view, cell)),
        cursor = values.map(() => 0);
      let done = false,
        survivors = 0,
        counterexample = false;
      while (!done) {
        yield { kind: "work" as const, units: 1 };
        const assignment = values.map((value, i) => value[cursor[i]]);
        if (
          conflicts.every(
            ([left, right]) =>
              assignment[selected.indexOf(left)] !== assignment[selected.indexOf(right)],
          )
        ) {
          survivors++;
          if (!assignment.includes(zDigit)) {
            counterexample = true;
            break;
          }
        }
        for (let i = n - 1; i >= 0; i--) {
          if (++cursor[i] < values[i].length) break;
          cursor[i] = 0;
          if (i === 0) done = true;
        }
      }
      if (survivors && !counterexample)
        yield {
          kind: "candidate" as const,
          pattern: {
            alias: n === 4 ? "WXYZ-Wing" : "Bent almost-locked subsets",
            cells: selected,
            symbols,
            nonrestrictedSymbol: zDigit,
            occurrences,
            conflicts,
          },
          effects,
        };
    }
  }
  *compile(view: ReadView, graph: PatternGraph, pattern: Json, effects: Effect[]) {
    const builder = new PatternBuilder(view, graph),
      root = yield* builder.bentTable(pattern as unknown as BentPattern),
      roots: number[] = [];
    for (const effect of effects) roots.push(yield* builder.eliminate(root, effect));
    return builder.finish("c12@1", pattern, effects, roots);
  }
}
export const bentSubsetTechniques = Object.freeze([
  descriptor("C12", new BentSubsets(), [0, 1, 9, 6, 6]),
]);
