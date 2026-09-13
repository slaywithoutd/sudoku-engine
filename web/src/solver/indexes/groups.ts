import type { Literal, ReadView } from "../state/types";
import { buildIndex, combinations, evidence, freezeRecord, IndexWorkspace, provedSources, OwnedIndex, reserveRecord, work } from "./workspace";
import type { IndexEntry, IndexEvent } from "./workspace";

export interface GroupEntry extends IndexEntry {
  readonly symbol: number;
  readonly cells: readonly number[];
  readonly members: readonly Literal[];
  /** Membership syntax, not an existence proposition. */
  readonly recipe: { readonly kind: "group-members"; readonly source: number };
}
export class GroupIndex extends OwnedIndex<GroupEntry> {}

/**
 * Every <=3-member same-symbol group in each proved all-different scope.
 * Distinct scope occurrences preserve every provenance choice. A downstream
 * grouped link must cite an exhaustive implication cover and prove conflicts
 * for ALL members; this index does not assert the disjunction is true.
 * These are generic groups; classic named detectors must additionally enforce
 * their house-intersection geometry. This index is not a named-technique profile.
 */
export function* buildGroups(view: ReadView, workspace: IndexWorkspace): Generator<IndexEvent<GroupIndex>> {
  yield* buildIndex(view, workspace, function* (reservation) {
    const entries: GroupEntry[] = [];
    for (const event of provedSources(view, workspace)) {
      if (event.kind === "work") { yield event; continue; }
      const fact = event.fact, p = fact.proposition;
      if (p.kind !== "all-different") continue;
      for (const symbol of view.assembly.problem.symbols) {
        yield* work(workspace);
        const available = p.cells.filter(c => view.state.domains[c] & (1 << (symbol-1)));
        for (const selection of combinations(available, 3, workspace)) {
          if (selection.kind === "work") { yield selection; continue; }
          const cells = selection.cells;
          reserveRecord(reservation, 1 + 3*cells.length);
          entries.push(freezeRecord({ ...evidence(view, [fact.id,...cells.map(c => view.state.domainFacts[c])]),
            symbol, cells, members: cells.map(cell => ({ cell, symbol, positive: true })),
            recipe: { kind: "group-members", source: fact.id } }));
        }
      }
    }
    return new GroupIndex(view, entries, reservation);
  });
}
