import { canonicalJson } from "../problem";
import type { EngineProblem, Json } from "../problem";
import type { Assembly } from "../rules/types";
import { M2_ROOT_LIMITS } from "../limits";
import type { CheckContext, CheckedInference, PrimitiveInput } from "./types";

export class ProofError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ProofError";
  }
}
export function requireProof(condition: unknown, code: string): asserts condition {
  if (!condition) throw new ProofError(code);
}

/** Cheap cardinality gate shared by root construction and primitive dispatch. */
export function assertM2ProblemBounds(problem: EngineProblem): void {
  requireRootData(problem, ["schema", "cells", "symbols", "givens", "constraints", "key"]);
  requireProof(Array.isArray(problem.cells) && problem.cells.length > 0 &&
    problem.cells.length <= M2_ROOT_LIMITS.cells, "root-cell-limit");
  requireProof(Array.isArray(problem.symbols) && problem.symbols.length > 0 &&
    problem.symbols.length <= M2_ROOT_LIMITS.symbols, "root-symbol-limit");
  requireProof(Array.isArray(problem.givens) && problem.givens.length === problem.cells.length,
    "root-given-limit");
  requireProof(Array.isArray(problem.constraints) && problem.constraints.length <= M2_ROOT_LIMITS.rules,
    "root-rule-limit");
}

/** Inspect descriptors before any payload reads, including scope/parameter reads. */
function requireRootData(value: unknown, fields: readonly string[]): void {
  requireProof(value !== null && typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null),
    "invalid-root-data");
  requireProof(Reflect.ownKeys(value).length === fields.length, "invalid-root-data");
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    requireProof(descriptor?.enumerable && "value" in descriptor, "invalid-root-data");
  }
}

/** Inspect only arrays whose lengths have already passed their structural cap. */
function requireDenseRootArray(values: readonly unknown[]): void {
  requireProof(Reflect.ownKeys(values).length === values.length + 1, "invalid-root-array");
  for (let index = 0; index < values.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(values, index);
    requireProof(descriptor?.enumerable && "value" in descriptor, "invalid-root-array");
  }
}

function requireRootScope(cells: readonly number[]): void {
  requireProof(Array.isArray(cells) && cells.length > 0 && cells.length <= M2_ROOT_LIMITS.scopeCells,
    "root-scope-limit");
  requireDenseRootArray(cells);
  requireProof(cells.every(cell => Number.isSafeInteger(cell) && cell >= 0 && cell < M2_ROOT_LIMITS.cells),
    "invalid-root-scope");
}

function requireRootIdentifier(id: string, suffixAllowance = 0): void {
  requireProof(typeof id === "string" && id.length > 0 &&
    id.length <= M2_ROOT_LIMITS.identifierCharacters + suffixAllowance, "root-identifier-limit");
}

/**
 * Bounds the original allocation before canonical traversal or root creation.
 * T03 has only all-different rule semantics: parameters must be empty and no
 * relation tables can enter this synchronous factory. Later rule support must
 * provide its own bounded parameter validation before widening this gate.
 */
export function assertM2RootAssemblyBounds(assembly: Assembly): void {
  requireRootData(assembly, ["problem", "modules", "allDifferent", "covers", "relations", "peers", "supportSignature"]);
  assertM2ProblemBounds(assembly.problem);
  requireProof(Array.isArray(assembly.allDifferent) && assembly.allDifferent.length <= M2_ROOT_LIMITS.allDifferent &&
    Array.isArray(assembly.covers) && assembly.covers.length <= M2_ROOT_LIMITS.covers,
    "root-capability-limit");
  requireProof(Array.isArray(assembly.relations) && assembly.relations.length === 0,
    "unsupported-relation-root");
  const problem = assembly.problem;
  requireProof(problem.cells.length + problem.givens.length + problem.constraints.length +
    assembly.allDifferent.length + assembly.covers.length <= M2_ROOT_LIMITS.nodes, "root-node-limit");
  for (const values of [problem.cells, problem.symbols, problem.givens, problem.constraints,
    assembly.allDifferent, assembly.covers, assembly.relations]) requireDenseRootArray(values);
  for (const rule of problem.constraints) {
    requireRootData(rule, ["id", "type", "cells", "parameters"]);
    requireProof(rule.type === "all-different@1", "unsupported-rule-root");
    requireRootIdentifier(rule.id);
    requireRootScope(rule.cells);
    requireProof(rule.parameters !== null && typeof rule.parameters === "object" &&
      !Array.isArray(rule.parameters) && Object.getPrototypeOf(rule.parameters) === Object.prototype &&
      Reflect.ownKeys(rule.parameters).length === 0, "invalid-root-parameters");
  }
  const capabilityFields = new Map([
    [assembly.allDifferent, ["id", "cells", "premise"]],
    [assembly.covers, ["id", "cells", "premise", "symbol"]],
  ]);
  for (const [capabilities, fields] of capabilityFields) for (const capability of capabilities) {
    requireRootData(capability, fields);
    requireRootIdentifier(capability.id, 16);
    requireRootScope(capability.cells);
  }
}
/** Exact structural comparison also rejects ignored/unsupported fields. */
export function sameValue(left: unknown, right: unknown): boolean {
  return canonicalJson(left as Json) === canonicalJson(right as Json);
}
export function inference(input: PrimitiveInput, rules: readonly string[] = []): CheckedInference {
  return Object.freeze({
    conclusion: input.conclusion,
    openAssumptions: Object.freeze([]),
    conditional: false,
    rules: Object.freeze([...rules]),
  });
}
type Strategy = (input: PrimitiveInput, context: CheckContext) => CheckedInference;

function domain(input: PrimitiveInput, context: CheckContext): CheckedInference {
  const problem = context.view.assembly.problem;
  const conclusion = input.conclusion;
  requireProof(input.premises.length === 0 && sameValue(input.parameters, {}), "invalid-root-parameters");
  requireProof(conclusion.kind === "domain" && problem.cells.includes(conclusion.cell) &&
    sameValue(conclusion, { kind: "domain", cell: conclusion.cell, mask: 2 ** problem.symbols.length - 1 }), "invalid-domain-axiom");
  return inference(input);
}
function given(input: PrimitiveInput, context: CheckContext): CheckedInference {
  const problem = context.view.assembly.problem;
  const conclusion = input.conclusion;
  requireProof(input.premises.length === 0 && sameValue(input.parameters, {}), "invalid-root-parameters");
  requireProof(conclusion.kind === "literal" && problem.cells.includes(conclusion.value.cell) &&
    problem.givens[conclusion.value.cell] !== 0 && sameValue(conclusion, {
      kind: "literal", value: { cell: conclusion.value.cell, symbol: problem.givens[conclusion.value.cell], positive: true },
    }), "invalid-given");
  return inference(input);
}
function declaredRule(input: PrimitiveInput, context: CheckContext): CheckedInference {
  const id = input.conclusion.kind === "rule" ? input.conclusion.constraintId :
    (input.parameters as { constraintId?: string } | null)?.constraintId;
  const assembly = context.view.assembly;
  const rule = assembly.problem.constraints.find(rule => rule.id === id);
  requireProof(rule, "unknown-rule-instance");
  const module = assembly.modules.get(rule.id);
  requireProof(module?.type === rule.type, "unknown-rule-module");
  // A rule strategy certifies semantics from its declared original constraint.
  // Its capability discovery output is deliberately not used as a proof oracle.
  const checked = module.checkPrimitive(input, context);
  requireProof(sameValue(checked.conclusion, input.conclusion) &&
    sameValue(checked.openAssumptions, []) && checked.conditional === false &&
    sameValue(checked.rules, [rule.id]), "invalid-rule-inference");
  return inference(input, [rule.id]);
}

/** Closed, explicit version ownership, shared with capability assembly. */
export class PrimitiveRegistry {
  readonly #strategies: ReadonlyMap<string, Strategy> = new Map([
    ["domain-axiom@1", domain], ["given@1", given],
    ["rule-instance@1", declaredRule], ["all-different@1", declaredRule], ["cover@1", declaredRule],
  ]);
  constructor() {
    Object.freeze(this);
  }

  has(id: string): boolean {
    return this.#strategies.has(id);
  }

  get ids(): readonly string[] {
    return Object.freeze([...this.#strategies.keys()].sort());
  }

  check(input: PrimitiveInput, context: CheckContext): CheckedInference {
    const strategy = this.#strategies.get(input.rule);
    requireProof(strategy, "unknown-primitive");
    assertM2ProblemBounds(context.view.assembly.problem);
    return strategy(input, context);
  }
}
export const primitiveRegistry = new PrimitiveRegistry();
