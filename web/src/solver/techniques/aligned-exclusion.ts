import type { ReadView } from "../state/types";
import type { Effect } from "../proof/types";
import type { PatternGraph } from "./pattern-runtime";
import type { LocalSet, AlignedPattern } from "./set-contracts";
import { candidate, type ChainWork } from "./chains-certificate";
import { assignments, combinations, setDigits } from "./set-certificate";
import { setDescriptor, type SetCursor } from "./set-runtime";
import { SubsetCountingSearch } from "./subset-counting";

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
      pairs = selected.flatMap((a, i) => selected.slice(i + 1).map((b) => [a, b]));
    for (const tuple of assignments(selected.map((c) => this.view.state.domains[c]))) {
      yield { kind: "work", units: 1 };
      const direct = pairs.findIndex(([a, b]) =>
        this.graph.has(
          candidate(a, tuple[selected.indexOf(a)]),
          candidate(b, tuple[selected.indexOf(b)]),
        ),
      );
      if (direct >= 0) {
        reasons.push(-1 - direct);
        continue;
      }
      let reason = 0;
      for (const [i, auxiliary] of auxiliaries.entries()) {
        yield { kind: "work", units: 1 };
        const reduced = auxiliary.cells.map((c) =>
          setDigits(this.view.state.domains[c])
            .filter(
              (s) =>
                !selected.some((v, j) => this.graph.has(candidate(c, s), candidate(v, tuple[j]))),
            )
            .reduce((mask, s) => mask | (1 << (s - 1)), 0),
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
      if (!reason) tuple.forEach((s, i) => (support[i] |= 1 << (s - 1)));
    }
    return { reasons, support };
  }
  *patterns(size: number): SetCursor {
    const empty = this.view.assembly.problem.cells.filter((c) => !this.view.state.values[c]);
    for (const selected of combinations(empty, size)) {
      yield { kind: "work", units: 1 };
      const scratch = this.graph.context.workspace.reserve(0, 262144 + this.sets.length * 16);
      try {
        const auxiliaries: LocalSet[] = [],
          seen = new Set<string>();
        for (const a of this.sets) {
          yield { kind: "work", units: 1 };
          if (a.cells.some((c) => selected.includes(c)) || seen.has(a.cells.join())) continue;
          seen.add(a.cells.join());
          auxiliaries.push(a);
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
        const used = [...new Set(reasons.filter((r) => r > 0))].sort((a, b) => a - b);
        const p: AlignedPattern = {
          kind: "aligned",
          alias:
            size === 2
              ? "Aligned Pair Exclusion"
              : size === 3
                ? "Aligned Triple Exclusion"
                : "Generalized Aligned Exclusion",
          selected,
          domains: selected.map((c) => this.view.state.domains[c]),
          auxiliaries: used.map((r) => ({
            ...auxiliaries[r - 1],
            domains: auxiliaries[r - 1].cells.map((c) => this.view.state.domains[c]),
            table: -1,
          })),
          reasons: reasons.map((r) => (r > 0 ? used.indexOf(r) + 1 : r)),
          rejections: [],
          roots: [],
        };
        yield { kind: "candidate", pattern: p, effects };
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
