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

/** T02's honest terminal event; later tasks widen this event union. */
export interface ExhaustedDiscoveryEvent {
  readonly kind: "exhausted";
}
export type DiscoveryEvent = ExhaustedDiscoveryEvent;
export type Discovery = Generator<DiscoveryEvent, void, void>;

/** Later tasks own these payloads. They are opaque here so T02 cannot forge facts. */
export type ReadView = Readonly<Record<string, unknown>>;
export type PrimitiveInput = Readonly<Record<string, unknown>>;
export type CheckContext = Readonly<Record<string, unknown>>;
export type CheckedInference = Readonly<Record<string, unknown>>;

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
  | { ok: true; value: Assembly }
  | { ok: false; issues: readonly RuleIssue[] };
