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
      (c) => !view.state.values[c] && digits(view, c).length >= 2 && digits(view, c).length <= 6,
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
      const symbols = [...new Set(selected.flatMap((c) => digits(view, c)))].sort((a, b) => a - b);
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
        symbols.map((s) => [s, selected.filter((c) => view.state.domains[c] & symbolMask(s))]),
      );
      const unrestricted = symbols.filter((s) =>
        occurrences[s].some((a, i) =>
          occurrences[s]
            .slice(i + 1)
            .some((b) => !conflicts.some((pair) => pair.includes(a) && pair.includes(b))),
        ),
      );
      if (unrestricted.length !== 1) continue;
      const z = unrestricted[0];
      const effects: Effect[] = [];
      for (const target of view.assembly.problem.cells) {
        yield { kind: "work" as const, units: 1 };
        if (
          !view.state.values[target] &&
          !selected.includes(target) &&
          view.state.domains[target] & symbolMask(z) &&
          occurrences[z].every((c) => graph.has(pos(c, z), pos(target, z)))
        )
          effects.push({ kind: "remove", cell: target, symbol: z });
      }
      if (!effects.length) continue;
      const values = selected.map((c) => digits(view, c)),
        cursor = values.map(() => 0);
      let done = false,
        survivors = 0,
        counterexample = false;
      while (!done) {
        yield { kind: "work" as const, units: 1 };
        const assignment = values.map((v, i) => v[cursor[i]]);
        if (
          conflicts.every(
            ([a, b]) => assignment[selected.indexOf(a)] !== assignment[selected.indexOf(b)],
          )
        ) {
          survivors++;
          if (!assignment.includes(z)) {
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
            nonrestrictedSymbol: z,
            occurrences,
            conflicts,
          },
          effects,
        };
    }
  }
  *compile(view: ReadView, graph: PatternGraph, pattern: Json, effects: Effect[]) {
    const b = new PatternBuilder(view, graph),
      root = yield* b.bentTable(pattern as unknown as BentPattern),
      roots: number[] = [];
    for (const e of effects) roots.push(yield* b.eliminate(root, e));
    return b.finish("c12@1", pattern, effects, roots);
  }
}
export const bentSubsetTechniques = Object.freeze([
  descriptor("C12", new BentSubsets(), [0, 1, 9, 6, 6]),
]);
