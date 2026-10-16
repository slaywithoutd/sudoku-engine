import type {
  CellId,
  ConstraintId,
  ConstraintInstance,
  EngineProblem,
  Mask,
  SymbolId,
  VersionId,
} from "../problem";

export type FactId = number;
export type NodeId = number;

export interface RuleIssue {
  code: string;
  constraintId: ConstraintId;
  message: string;
}

export interface Assignment {
  values: readonly (SymbolId | 0)[];
}

export interface AllDifferent {
  id: string;
  cells: readonly CellId[];
  premise: FactId;
}

export interface Cover {
  id: string;
  symbol: SymbolId;
  cells: readonly CellId[];
  premise: FactId;
}

export interface Relation {
  id: string;
  cells: readonly CellId[];
  tuples: readonly (readonly SymbolId[])[];
  premise: FactId;
}

/**
 * A linear equation over cell values. Bounded by M2_ROOT_LIMITS.sumCells and
 * sumCoefficient; every coefficient is a nonzero integer so arrow circles can
 * carry -1. Values are symbolValue(problem, symbol), never raw mask bits.
 */
export interface LinearSum {
  id: string;
  cells: readonly CellId[];
  coefficients: readonly number[];
  total: number;
  premise: FactId;
}

export interface RuleCapabilities {
  allDifferent: readonly AllDifferent[];
  covers: readonly Cover[];
  relations: readonly Relation[];
  sums: readonly LinearSum[];
  primitiveIds: readonly VersionId[];
}

import type { Discovery } from "../techniques/types";
export type { Discovery, DiscoveryEvent } from "../techniques/types";

import type { ReadView } from "../state/types";
import type { PrimitiveInput, CheckContext, CheckedInference } from "../proof/types";
export type { ReadView } from "../state/types";
export type { PrimitiveInput, CheckContext, CheckedInference } from "../proof/types";

export interface RuleModule {
  type: VersionId;
  normalize(input: ConstraintInstance): ConstraintInstance;
  validate(problem: EngineProblem, rule: ConstraintInstance): readonly RuleIssue[];
  checkComplete(rule: ConstraintInstance, assignment: Assignment): boolean;
  capabilities(rule: ConstraintInstance, context: RuleContext): RuleCapabilities;
  propagate(view: ReadView, rule: ConstraintInstance): Discovery;
  checkPrimitive(input: PrimitiveInput, context: CheckContext): CheckedInference;
  /**
   * Evidence-side forward check for exact enumeration (spec §3.13, D049 as
   * refined by D100). Given a partial assignment (`0` = open) and the current
   * candidate masks, returns the masks this rule still permits, or `null` when
   * the rule can no longer be satisfied. It is trusted, not proof-checked: it
   * must never drop a value that some completion of the partial assignment
   * uses, and its only validation is the independent oracle differential.
   * Modules without a prune hook are checked at complete assignments only.
   */
  prune?(
    rule: ConstraintInstance,
    problem: EngineProblem,
    values: readonly number[],
    masks: readonly Mask[],
  ): readonly Mask[] | null;
}

export interface RuleContext {
  problem: EngineProblem;
  roots: ReadonlyMap<ConstraintId, FactId>;
}

export interface Assembly {
  problem: EngineProblem;
  modules: ReadonlyMap<ConstraintId, RuleModule>;
  allDifferent: readonly AllDifferent[];
  covers: readonly Cover[];
  relations: readonly Relation[];
  sums: readonly LinearSum[];
  peers: readonly (readonly CellId[])[];
  supportSignature: string;
}

export type AssemblyResult =
  { ok: true; value: Assembly } | { ok: false; issues: readonly RuleIssue[] };
