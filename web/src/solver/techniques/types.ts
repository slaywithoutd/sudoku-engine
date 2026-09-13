import type { VersionId } from "../problem";
import type { StateKey } from "../snapshot";
import type { Watch } from "../state/events";

export type DetectorStatus = "pending" | "in-progress" | "found" | "exhausted" | "excluded" | "interrupted";
/** Type-only scheduler handoff; resumable detector cursors are owned elsewhere. */
export interface LedgerEntry {
  readonly technique: VersionId;
  readonly scopeKey: string;
  readonly state: StateKey;
  readonly status: DetectorStatus;
  readonly dependencies: readonly Watch[];
  readonly work: number;
  readonly reason?: string;
}
export type Ledger = readonly LedgerEntry[];
