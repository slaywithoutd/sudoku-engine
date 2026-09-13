import { canonicalJson } from "../problem";
import type { Json } from "../problem";
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
  requireProof(problem.symbols.length <= 30, "unsupported-domain-size");
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
    return strategy(input, context);
  }
}
export const primitiveRegistry = new PrimitiveRegistry();
