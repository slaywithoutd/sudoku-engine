import type {
  CellId,
  ConstraintId,
  ConstraintInstance,
  EngineProblem,
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

export interface RuleCapabilities {
  allDifferent: readonly AllDifferent[];
  covers: readonly Cover[];
  relations: readonly Relation[];
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
  peers: readonly (readonly CellId[])[];
  supportSignature: string;
}

export type AssemblyResult =
  { ok: true; value: Assembly } | { ok: false; issues: readonly RuleIssue[] };
