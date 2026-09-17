import type { ConstraintId, CellId } from "../problem";
import type { StateKey } from "../snapshot";
import type { Literal } from "./types";
import { sameValue } from "../proof/primitives";
import type { Ledger } from "../techniques/types";
export type { Ledger, LedgerEntry, DetectorStatus } from "../techniques/types";

export type Watch =
  | { readonly kind: "cell"; readonly cell: CellId }
  | { readonly kind: "cover" | "relation" | "constraint"; readonly id: string }
  | { readonly kind: "graph" | "all" };
export interface ChangeSet {
  readonly before: StateKey;
  readonly after: StateKey;
  readonly removed: readonly Literal[];
  readonly placed: readonly Literal[];
  readonly cells: readonly CellId[];
  readonly coverIds: readonly string[];
  readonly relationIds: readonly string[];
  readonly constraintIds: readonly ConstraintId[];
  readonly graphChanged: boolean;
  /** Accepted proof-prefix changes may add sources without a candidate revision. */
  readonly sourceChanged?: boolean;
}
function affected(watch: Watch, changes: ChangeSet): boolean {
  switch (watch.kind) {
    case "all":
      return true;
    case "graph":
      return changes.graphChanged;
    case "cell":
      return changes.cells.includes(watch.cell);
    case "cover":
      return !!changes.sourceChanged || changes.coverIds.includes(watch.id);
    case "relation":
      return !!changes.sourceChanged || changes.relationIds.includes(watch.id);
    case "constraint":
      return changes.constraintIds.includes(watch.id);
    default:
      return true;
  }
}

/**
 * Only completed work whose complete watched inputs survived this exact change
 * may carry forward. Global graph watches cover downstream graph/ALS caches;
 * resumable cursors and missing dependencies always restart conservatively.
 */
export function invalidate(changes: ChangeSet, ledger: Ledger): Ledger {
  const after = Object.freeze({ ...changes.after });
  return Object.freeze(
    ledger.map((entry) => {
      const keep =
        sameValue(entry.state, changes.before) &&
        (entry.status === "exhausted" || entry.status === "excluded") &&
        entry.dependencies.length > 0 &&
        !entry.dependencies.some((watch) => affected(watch, changes));
      const { reason, ...base } = entry;
      return Object.freeze({
        ...base,
        state: after,
        status: keep ? entry.status : "pending",
        dependencies: Object.freeze(entry.dependencies.map((watch) => Object.freeze({ ...watch }))),
        ...(keep && reason !== undefined ? { reason } : {}),
      });
    }),
  );
}
