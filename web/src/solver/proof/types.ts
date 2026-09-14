import type { Json, VersionId, ConstraintId, CellId, SymbolId } from "../problem";
import type { NodeId } from "../rules/types";
import type { StateKey } from "../snapshot";
import type { Proposition, ReadView } from "../state/types";
import type { Limits } from "../limits";
import type { UniqueAuthority } from "../conditional";
export type { Limits } from "../limits";
export type { Proposition, Fact, Literal } from "../state/types";
export type AssumptionPolicy = "unconditional" | "discharged" | "unique-only";

/** A primitive's explicit premises and typed claim; metadata is never authority. */
export interface PrimitiveInput {
  readonly rule: VersionId;
  readonly premises: readonly NodeId[];
  readonly parameters: Json;
  readonly conclusion: Proposition;
}
export interface ProofNode extends PrimitiveInput {
  readonly id: NodeId;
  readonly scope: readonly NodeId[];
}
export interface ProofBundle {
  readonly state: StateKey;
  readonly nodes: readonly ProofNode[];
  readonly imports: readonly NodeId[];
  readonly roots: readonly NodeId[];
}
export interface Effect {
  readonly kind: "place" | "remove";
  readonly cell: CellId;
  readonly symbol: SymbolId;
}
export interface DeductionProposal {
  readonly technique: VersionId;
  readonly state: StateKey;
  readonly effects: readonly Effect[];
  readonly proof: ProofBundle;
  readonly pattern: Json;
}

/** The caller supplies the complete accepted prefix, including initialization. */
export interface CheckContext {
  readonly view: ReadView;
  readonly retained: ReadonlyMap<NodeId, ProofNode>;
  readonly policy: AssumptionPolicy;
  readonly uniqueEvidenceId: string | null;
  readonly uniqueAuthority?: UniqueAuthority;
  /** Checker-populated exact owned view, before bounded presentation copies. */
  readonly authorityView?: ReadView;
  readonly limits: Limits;
  /** Checker-populated metadata for the exact admitted premise objects. */
  readonly premiseInferences?: ReadonlyMap<NodeId, CheckedInference>;
  /** Checker-owned lexical position, never taken from detector metadata. */
  readonly currentNode?: ProofNode;
  /** Remaining checker workspace after retained/current wire data is charged. */
  readonly workspaceRemaining?: number;
}
export interface CheckedInference {
  readonly conclusion: Proposition;
  readonly openAssumptions: readonly NodeId[];
  readonly conditional: boolean;
  readonly rules: readonly ConstraintId[];
}

// The declaration is private; runtime authenticity is separately enforced by the checker.
declare const checkedStepBrand: unique symbol;

/** A checker-issued immutable value; reducers must also call isCheckedStep. */
export interface CheckedStep {
  readonly [checkedStepBrand]: true;
  readonly proposal: DeductionProposal;
  readonly consequences: readonly CheckedInference[];
  readonly afterRevision: number;
}
export type CheckEvent = { readonly kind: "work"; readonly units: number }
  | { readonly kind: "checked"; readonly step: CheckedStep }
  | { readonly kind: "rejected"; readonly code: string };

declare const checkedCertificateBrand: unique symbol;
/** Primitive semantics only; deliberately confers no candidate/replay authority. */
export interface CheckedCertificate {
  readonly [checkedCertificateBrand]: true;
  readonly proposal: DeductionProposal;
  readonly consequences: readonly CheckedInference[];
}
export type CertificateEvent = { readonly kind: "work"; readonly units: number }
  | { readonly kind: "verified"; readonly certificate: CheckedCertificate }
  | { readonly kind: "rejected"; readonly code: string };

declare const branchCertificateBrand: unique symbol;
/** Confined computational result. Never accepted by primary commit/retention. */
export interface BranchCertificate {
  readonly [branchCertificateBrand]: true;
  readonly proposal: DeductionProposal;
  readonly consequences: readonly CheckedInference[];
  readonly scope: readonly number[];
}
export type BranchEvent = { readonly kind: "work"; readonly units: number }
  | { readonly kind: "branch-checked"; readonly certificate: BranchCertificate }
  | { readonly kind: "rejected"; readonly code: string };
