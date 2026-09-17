import type { Literal, ReadView } from "../state/types";
import { assertOwnedView, retainedProof } from "../state/candidates";
import {
  buildIndex,
  evidence,
  freezeRecord,
  OwnedIndex,
  reserveRecord,
  work,
  type IndexEntry,
  type IndexEvent,
  type IndexWorkspace,
} from "./workspace";

export interface ProvedClauseEntry extends IndexEntry {
  readonly source: number;
  readonly alternatives: readonly Literal[];
}
/** Borrowed authentic closed signed clauses. A same-revision fact extension
 * invalidates completeFor; acceptsView only authorizes reuse of existing recipes.
 * Neither clause truth nor index membership implies pairwise exclusivity.
 */
export class ProvedClauseIndex extends OwnedIndex<ProvedClauseEntry> {}
export function* buildProvedClauses(
  view: ReadView,
  workspace: IndexWorkspace,
): Generator<IndexEvent<ProvedClauseIndex>> {
  assertOwnedView(view);
  const nodes = retainedProof(view);
  yield* buildIndex(view, workspace, function* (lease) {
    const entries: ProvedClauseEntry[] = [];
    for (const fact of view.facts.values()) {
      yield* work(workspace);
      const proposition = fact.proposition;
      if (
        fact.openAssumptions.length ||
        nodes.get(fact.root)?.scope.length ||
        proposition.kind !== "clause" ||
        proposition.alternatives.length < 2 ||
        proposition.alternatives.length > 4
      )
        continue;
      // Scope is also lexical: a closed intermediate inside an assumption may
      // have no taint yet is not a global source. Authentic root scope is checked
      // when a compiler imports it; indexing excludes that source proactively.
      reserveRecord(lease, proposition.alternatives.length + 1);
      entries.push(
        freezeRecord({
          ...evidence(view, [fact.id]),
          source: fact.id,
          alternatives: proposition.alternatives,
        }),
      );
    }
    return new ProvedClauseIndex(view, entries, lease);
  });
}
