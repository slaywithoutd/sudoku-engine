import { CoverCountClauseChecker } from "./count-clause";
import { TemplateCoverChecker } from "./template-cover";
import { UniqueTransformChecker } from "./unique";
import { canonicalJson } from "../problem";
import type { EngineProblem, Json } from "../problem";
import type { Assembly } from "../rules/types";
import { M2_ROOT_LIMITS } from "../limits";
import type { CheckContext, CheckedInference, PrimitiveInput } from "./types";
import type { Literal, Proposition } from "../state/types";
import { AssumptionStrategy, ConjunctionStrategy, ContradictionStrategy, DischargeStrategy, CasesStrategy } from "./assumptions";
import { SupportStrategy, HallStrategy, CoverCountStrategy, AllDifferentSubsetStrategy } from "./counts";
import { TableChecker } from "./tables";
import { SubsetCountChecker } from "./subset-count";
import type { TableDefinition } from "./tables";
import type { ProofNode } from "./types";

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
 * Relation roots have small explicit tuples only. Larger relations belong in
 * cooperative table DAGs. Scalar parameter bounds precede module validation.
 */
export function assertM2RootAssemblyBounds(assembly: Assembly): void {
  requireRootData(assembly, ["problem", "modules", "allDifferent", "covers", "relations", "peers", "supportSignature"]);
  assertM2ProblemBounds(assembly.problem);
  requireProof(Array.isArray(assembly.allDifferent) && assembly.allDifferent.length <= M2_ROOT_LIMITS.allDifferent &&
    Array.isArray(assembly.covers) && assembly.covers.length <= M2_ROOT_LIMITS.covers,
    "root-capability-limit");
  requireProof(Array.isArray(assembly.relations) && assembly.relations.length <= 256, "root-relation-limit");
  const problem = assembly.problem;
  requireProof(problem.cells.length + problem.givens.length + problem.constraints.length +
    assembly.allDifferent.length + assembly.covers.length + assembly.relations.length <= M2_ROOT_LIMITS.nodes, "root-node-limit");
  for (const values of [problem.cells, problem.symbols, problem.givens, problem.constraints,
    assembly.allDifferent, assembly.covers, assembly.relations]) requireDenseRootArray(values);
  for (const rule of problem.constraints) {
    requireRootData(rule, ["id", "type", "cells", "parameters"]);
    requireRootIdentifier(rule.type);
    requireProof(assembly.modules.get(rule.id)?.type === rule.type, "unsupported-rule-root");
    requireRootIdentifier(rule.id);
    requireRootScope(rule.cells);
    requireProof(rule.parameters !== null && typeof rule.parameters === "object" &&
      !Array.isArray(rule.parameters) && Object.getPrototypeOf(rule.parameters) === Object.prototype &&
      Reflect.ownKeys(rule.parameters).length <= 16, "invalid-root-parameters");
    for (const key of Reflect.ownKeys(rule.parameters)) {
      const descriptor = Object.getOwnPropertyDescriptor(rule.parameters, key)!;
      requireProof(typeof key === "string" && key.length <= 64 && descriptor.enumerable && "value" in descriptor &&
        (typeof descriptor.value === "boolean" || Number.isSafeInteger(descriptor.value)), "invalid-root-parameters");
    }
  }
  for (const relation of assembly.relations) {
    requireRootData(relation, ["id", "cells", "tuples", "premise"]);
    requireRootIdentifier(relation.id, 16);
    requireRootScope(relation.cells);
    requireProof(relation.cells.length <= 16 && Array.isArray(relation.tuples) && relation.tuples.length <= 256 &&
      relation.cells.length * relation.tuples.length <= 2048, "root-relation-tuple-limit");
    requireDenseRootArray(relation.tuples);
    for (const tuple of relation.tuples) {
      requireProof(Array.isArray(tuple) && tuple.length === relation.cells.length, "invalid-root-tuple");
      requireDenseRootArray(tuple);
      requireProof(tuple.every(symbol => problem.symbols.includes(symbol)), "invalid-root-tuple");
    }
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

/**
 * A positive checked clue is singleton-domain authority at initialization.
 * Later candidate restrictions use explicit domain propositions. This common
 * interpretation prevents a full-domain root from being relabeled as narrower.
 */
export function domainAssertion(proposition: Proposition): { cell: number; mask: number } | undefined {
  if (proposition.kind === "domain") return { cell: proposition.cell, mask: proposition.mask };
  if (proposition.kind === "literal" && proposition.value.positive)
    return { cell: proposition.value.cell, mask: 1 << (proposition.value.symbol - 1) };
  return undefined;
}

export function derived(input: PrimitiveInput, context: CheckContext): CheckedInference {
  const premises = input.premises.map(id => context.premiseInferences?.get(id));
  requireProof(premises.every(Boolean), "missing-premise-inference");
  return Object.freeze({ conclusion: input.conclusion,
    openAssumptions: Object.freeze([...new Set(premises.flatMap(p => p!.openAssumptions))].sort((a,b) => a-b)),
    conditional: premises.some(p => p!.conditional),
    rules: Object.freeze([...new Set(premises.flatMap(p => p!.rules))].sort()) });
}
export function premises(input: PrimitiveInput, context: CheckContext, count: number): Proposition[] {
  requireProof(input.premises.length === count && new Set(input.premises).size === count && sameValue(input.parameters, {}), "invalid-inference-parameters");
  return input.premises.map(id => {
    const node = context.retained.get(id);
    requireProof(node, "missing-inference-premise");
    return node.conclusion;
  });
}
export function validLiteral(value: Literal, context: CheckContext): boolean {
  return context.view.assembly.problem.cells.includes(value.cell) &&
    context.view.assembly.problem.symbols.includes(value.symbol) && typeof value.positive === "boolean" &&
    sameValue(value, { cell: value.cell, symbol: value.symbol, positive: value.positive });
}
export function literals(proposition: Proposition): readonly Literal[] {
  if (proposition.kind === "literal") return [proposition.value];
  requireProof(proposition.kind === "clause", "expected-clause");
  return proposition.alternatives;
}
export function clause(values: readonly Literal[]): Proposition {
  const sorted = [...new Map(values.map(value => [`${value.cell}:${value.symbol}:${value.positive}`, value])).values()]
    .sort((a, b) => a.cell - b.cell || a.symbol - b.symbol || Number(a.positive) - Number(b.positive));
  if (sorted.length === 0) return { kind: "false" };
  if (sorted.length === 1) return { kind: "literal", value: sorted[0] };
  return { kind: "clause", alternatives: sorted };
}
function restrictDomain(input: PrimitiveInput, context: CheckContext): CheckedInference {
  const [base, restriction] = premises(input, context, 2), domain = domainAssertion(base);
  requireProof(domain && restriction.kind === "literal" && validLiteral(restriction.value, context) &&
    restriction.value.cell === domain.cell, "invalid-domain-restriction");
  const bit = 1 << (restriction.value.symbol - 1);
  const mask = restriction.value.positive ? domain.mask & bit : domain.mask & ~bit;
  requireProof(sameValue(input.conclusion, { kind: "domain", cell: domain.cell, mask }), "invalid-domain-restriction");
  return derived(input, context);
}
function weakLink(input: PrimitiveInput, context: CheckContext): CheckedInference {
  const [scope] = premises(input, context, 1);
  const alternatives = literals(input.conclusion);
  requireProof(alternatives.length === 2 && alternatives.every(value => validLiteral(value, context) && !value.positive) &&
    sameValue(input.conclusion, clause(alternatives)), "invalid-weak-link");
  const [a,b] = alternatives, domain = domainAssertion(scope);
  const valid = domain ? a.cell === domain.cell && b.cell === domain.cell && a.symbol !== b.symbol :
    scope.kind === "all-different" && scope.cells.includes(a.cell) && scope.cells.includes(b.cell) &&
      a.cell !== b.cell && a.symbol === b.symbol;
  requireProof(valid, "invalid-weak-link");
  return derived(input, context);
}
function coverClause(input: PrimitiveInput, context: CheckContext): CheckedInference {
  const [source] = premises(input, context, 1), domain = domainAssertion(source);
  let alternatives: Literal[];
  if (source.kind === "cover") alternatives = source.cells.map(cell => ({ cell, symbol: source.symbol, positive: true }));
  else {
    requireProof(domain, "invalid-cover-clause");
    alternatives = context.view.assembly.problem.symbols.filter(symbol => (domain.mask & (1 << (symbol - 1))) !== 0)
      .map(symbol => ({ cell: domain.cell, symbol, positive: true }));
  }
  requireProof(sameValue(input.conclusion, clause(alternatives)), "invalid-cover-clause");
  return derived(input, context);
}
function resolve(input: PrimitiveInput, context: CheckContext): CheckedInference {
  const [left, right] = premises(input, context, 2).map(literals);
  requireProof([...left, ...right].every(value => validLiteral(value, context)), "invalid-resolution");
  const valid = left.some(a => right.some(b => a.cell === b.cell && a.symbol === b.symbol && a.positive !== b.positive &&
    sameValue(input.conclusion, clause([...left.filter(v => !sameValue(v, a)), ...right.filter(v => !sameValue(v, b))]))));
  requireProof(valid, "invalid-resolution");
  return derived(input, context);
}

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
  readonly #tables: TableChecker;
  readonly #subsetCount = new SubsetCountChecker();
  readonly #countClause = new CoverCountClauseChecker();
  readonly #templates = new TemplateCoverChecker();
  readonly #unique = new UniqueTransformChecker();
  readonly #strategies: ReadonlyMap<string, Strategy> = new Map([
    ["domain-axiom@1", domain], ["given@1", given],
    ["rule-instance@1", declaredRule], ["all-different@1", declaredRule], ["cover@1", declaredRule],
    ["relation@1", declaredRule],
    ["domain-restrict@1", restrictDomain], ["weak-link@1", weakLink],
    ["cover-clause@1", coverClause], ["resolution@1", resolve],
    ...[new AssumptionStrategy(), new ConjunctionStrategy(), new ContradictionStrategy(),
      new DischargeStrategy(), new CasesStrategy(), new SupportStrategy(), new HallStrategy(), new CoverCountStrategy(),
      new AllDifferentSubsetStrategy()].map(strategy => [strategy.id,
        (input: PrimitiveInput, context: CheckContext) => strategy.check(input, context)] as const),
  ]);
  constructor(tables: Iterable<readonly [ProofNode, TableDefinition]> = []) {
    this.#tables = new TableChecker(tables);
    Object.freeze(this);
  }

  tableDefinition(node: ProofNode): TableDefinition | undefined { return this.#tables.get(node); }

  has(id: string): boolean {
    return this.#strategies.has(id) || this.#tables.has(id) || id === this.#subsetCount.id || id === this.#countClause.id || id === this.#templates.id || id === this.#unique.id;
  }

  get ids(): readonly string[] {
    return Object.freeze([...this.#strategies.keys(), ...this.#tables.ids, this.#subsetCount.id, this.#countClause.id, this.#templates.id, this.#unique.id].sort());
  }

  check(input: PrimitiveInput, context: CheckContext): CheckedInference {
    const strategy = this.#strategies.get(input.rule);
    requireProof(strategy, "unknown-primitive");
    assertM2ProblemBounds(context.view.assembly.problem);
    return strategy(input, context);
  }

  /** Expensive finite-table semantics yield at tuple/pair/rejection boundaries. */
  *checkSteps(input: PrimitiveInput, context: CheckContext): Generator<number, CheckedInference, void> {
    if (input.rule === this.#unique.id) return yield* this.#unique.check(input, context);
    if (input.rule === this.#templates.id) return yield* this.#templates.check(input, context);
    if (input.rule === this.#subsetCount.id) return yield* this.#subsetCount.check(input, context);
    if (input.rule === this.#countClause.id) return yield* this.#countClause.check(input, context);
    if (this.#tables.has(input.rule)) return yield* this.#tables.check(input, context);
    return this.check(input, context);
  }
}
export const primitiveRegistry = new PrimitiveRegistry();
