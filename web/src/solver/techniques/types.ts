import type { VersionId } from "../problem";
import type { StateKey } from "../snapshot";
import type { Watch } from "../state/events";
import type { AssumptionPolicy, DeductionProposal } from "../proof/types";
import type { ReadView } from "../state/types";
import type { Limits } from "../limits";
import type { IndexWorkspace, IndexInterruption } from "../indexes/workspace";
import type { TemplateOperationContext } from "../indexes/templates";

/** Operation-owned resources; detectors neither create run budgets nor retain globals. */
export interface DiscoveryContext {
  readonly workspace: IndexWorkspace; readonly limits: Limits;
  /** Explicit operation-owned per-candidate-revision C33 exploration allowance. */
  readonly templates?: TemplateOperationContext;
}

export type DiscoveryEvent = { readonly kind: "work"; readonly units: number }
  | { readonly kind: "proposal"; readonly proposal: DeductionProposal }
  | { readonly kind: "exhausted" }
  | { readonly kind: "excluded"; readonly reason:string; readonly dependencies:readonly Watch[] }
  | { readonly kind: "interrupted"; readonly reason: IndexInterruption | "proof-step-limit" | "work-limit" | "time-limit" };
export type Discovery = Generator<DiscoveryEvent, void, void>;
export interface TechniqueBounds {
  readonly maxLength: number; readonly maxBranchDepth: number; readonly maxAlternatives: number;
  readonly maxPatternCells: number; readonly maxSetSize: number;
  readonly templates?: {
    readonly maxTemplatesPerSymbol:number;
    readonly maxOverlaySymbols:number;
    readonly maxIncompatibilitySymbols:number;
    readonly maxTupleTestsPerRevision:number;
  };
}
export interface Estimate { readonly hit: number; readonly gain: number; readonly cost: number }
export interface TechniqueDescriptor {
  readonly id: VersionId; readonly aliases: readonly string[]; readonly tier: number;
  readonly requires: readonly string[]; readonly assumptionPolicy: AssumptionPolicy;
  readonly bounds: TechniqueBounds;
  watches(view: ReadView): readonly Watch[];
  eligible(view: ReadView): { readonly kind: "yes" } |
    { readonly kind: "excluded"; readonly reason: string; readonly dependencies: readonly Watch[] };
  estimate(view: ReadView): Estimate;
  discover(view: ReadView, context: DiscoveryContext): Discovery;
}

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
