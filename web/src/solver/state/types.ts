import type { CellId, SymbolId, Mask, ConstraintId } from "../problem";
import type { Assembly, FactId, NodeId } from "../rules/types";
import type { StateKey } from "../snapshot";

export interface Literal {
  readonly cell: CellId;
  readonly symbol: SymbolId;
  readonly positive: boolean;
}
export type Proposition =
  | { readonly kind: "literal"; readonly value: Literal }
  | { readonly kind: "and"; readonly terms: readonly Proposition[] }
  | { readonly kind: "clause"; readonly alternatives: readonly Literal[] }
  | { readonly kind: "domain"; readonly cell: CellId; readonly mask: Mask }
  | { readonly kind: "rule"; readonly constraintId: ConstraintId }
  | { readonly kind: "all-different"; readonly cells: readonly CellId[] }
  | { readonly kind: "cover"; readonly symbol: SymbolId; readonly cells: readonly CellId[] }
  | { readonly kind: "relation"; readonly cells: readonly CellId[]; readonly tuples: readonly (readonly SymbolId[])[] }
  | { readonly kind: "false" };
export interface Fact {
  readonly id: FactId;
  readonly proposition: Proposition;
  readonly root: NodeId;
  readonly state: StateKey;
  readonly openAssumptions: readonly NodeId[];
  readonly conditional: boolean;
  readonly rules: readonly ConstraintId[];
}
/**
 * Missing bits require evidence. domainFacts points to an exact domain claim,
 * except initialized givens, whose positive checked literal proves a singleton.
 * All arrays and the key are immutable in candidate-owned published views.
 */
export interface CandidateState {
  readonly key: StateKey;
  readonly values: readonly (SymbolId | 0)[];
  readonly domains: readonly Mask[];
  readonly domainFacts: readonly FactId[];
}
export interface ReadView {
  readonly assembly: Assembly;
  readonly state: CandidateState;
  readonly facts: ReadonlyMap<FactId, Fact>;
  supports(coverId: string): readonly CellId[];
}
