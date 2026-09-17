import type { ReadView } from "../state/types";
import type { Effect } from "../proof/types";
import type { PatternGraph } from "./pattern-runtime";
import type { LocalSet, AlignedPattern } from "./set-contracts";
import { candidate, type ChainWork } from "./chains-certificate";
import { assignments, combinations, setDigits } from "./set-certificate";
import { setDescriptor, type SetCursor } from "./set-runtime";
import { SubsetCountingSearch } from "./subset-counting";
import { symbolMask } from "../state/read";

/** Only an explicitly empty <=5-cell auxiliary matching rejects an assignment.
 * Equal symbols in nonpeer selected cells are permitted. */
export class AlignedExclusionSearch {
  constructor(
    readonly view: ReadView,
    readonly graph: PatternGraph,
    readonly sets: readonly LocalSet[],
  ) {}
  *classify(
    selected: number[],
    auxiliaries: readonly LocalSet[],
  ): Generator<ChainWork, { reasons: number[]; support: number[] }> {
    const reasons: number[] = [],
      support = selected.map(() => 0),
      pairs = selected.flatMap((left, i) => selected.slice(i + 1).map((right) => [left, right]));
    for (const tuple of assignments(selected.map((cell) => this.view.state.domains[cell]))) {
      yield { kind: "work", units: 1 };
      const direct = pairs.findIndex(([left, right]) =>
        this.graph.has(
          candidate(left, tuple[selected.indexOf(left)]),
          candidate(right, tuple[selected.indexOf(right)]),
        ),
      );
      if (direct >= 0) {
        reasons.push(-1 - direct);
        continue;
      }
      let reason = 0;
      for (const [i, auxiliary] of auxiliaries.entries()) {
        yield { kind: "work", units: 1 };
        const reduced = auxiliary.cells.map((cell) =>
          setDigits(this.view.state.domains[cell])
            .filter(
              (symbol) =>
                !selected.some((value, j) =>
                  this.graph.has(candidate(cell, symbol), candidate(value, tuple[j])),
                ),
            )
            .reduce((mask, symbol) => mask | symbolMask(symbol), 0),
        );
        let survives = false;
        for (const row of assignments(reduced)) {
          yield { kind: "work", units: 1 };
          if (new Set(row).size === row.length) {
            survives = true;
            break;
          }
        }
        if (!survives) {
          reason = i + 1;
          break;
        }
      }
      reasons.push(reason);
      if (!reason) tuple.forEach((symbol, i) => (support[i] |= symbolMask(symbol)));
    }
    return { reasons, support };
  }
  *patterns(size: number): SetCursor {
    const empty = this.view.assembly.problem.cells.filter((cell) => !this.view.state.values[cell]);
    for (const selected of combinations(empty, size)) {
      yield { kind: "work", units: 1 };
      const scratch = this.graph.context.workspace.reserve(0, 262144 + this.sets.length * 16);
      try {
        const auxiliaries: LocalSet[] = [],
          seen = new Set<string>();
        for (const set of this.sets) {
          yield { kind: "work", units: 1 };
          if (set.cells.some((cell) => selected.includes(cell)) || seen.has(set.cells.join()))
            continue;
          seen.add(set.cells.join());
          auxiliaries.push(set);
        }
        const { reasons, support } = yield* this.classify(selected, auxiliaries);
        if (support.some((mask) => !mask)) continue;
        const effects: Effect[] = selected.flatMap((cell, i) =>
          setDigits(this.view.state.domains[cell] & ~support[i]).map((symbol) => ({
            kind: "remove",
            cell,
            symbol,
          })),
        );
        if (!effects.length) continue;
        const used = [...new Set(reasons.filter((reason) => reason > 0))].sort(
          (left, right) => left - right,
        );
        const pattern: AlignedPattern = {
          kind: "aligned",
          alias:
            size === 2
              ? "Aligned Pair Exclusion"
              : size === 3
                ? "Aligned Triple Exclusion"
                : "Generalized Aligned Exclusion",
          selected,
          domains: selected.map((cell) => this.view.state.domains[cell]),
          auxiliaries: used.map((reason) => ({
            ...auxiliaries[reason - 1],
            domains: auxiliaries[reason - 1].cells.map((cell) => this.view.state.domains[cell]),
            table: -1,
          })),
          reasons: reasons.map((reason) => (reason > 0 ? used.indexOf(reason) + 1 : reason)),
          rejections: [],
          roots: [],
        };
        yield { kind: "candidate", pattern: pattern, effects };
      } finally {
        scratch.dispose();
      }
    }
  }
}
export const alignedExclusionTechniques = Object.freeze([
  setDescriptor("C21", (view, graph, sets) => {
    const search = new AlignedExclusionSearch(view, graph, sets);
    return [
      search.patterns(2),
      search.patterns(3),
      search.patterns(4),
      ...new SubsetCountingSearch(view, graph).cursors(),
    ];
  }),
]);
