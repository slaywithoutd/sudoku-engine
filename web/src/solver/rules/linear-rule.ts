import type { ConstraintInstance, EngineProblem } from "../problem";
import { symbolValue } from "../problem";
import { CertificateBuilder, literal } from "../proof/builder";
import { inference, requireProof, sameValue } from "../proof/primitives";
import type { PrimitiveInput, CheckContext, CheckedInference } from "../proof/types";
import { sourceFacts } from "../state/source-index";
import { symbolMask } from "../state/read";
import type { Discovery, ReadView, RuleIssue } from "./types";

/** Technique id of sum maintenance proposals; its closed grammar lives in variant-grammar.ts. */
export const SUM_MAINTENANCE = "rule-sum@1";

export interface Equation {
  readonly cells: readonly number[];
  readonly coefficients: readonly number[];
  readonly total: number;
}

/** Canonical form: cells ascending, coefficients aligned. */
export function canonicalEquation(equation: Equation): Equation {
  const order = equation.cells
    .map((cell, index) => ({ cell, coefficient: equation.coefficients[index] }))
    .sort((left, right) => left.cell - right.cell);
  return {
    cells: order.map((entry) => entry.cell),
    coefficients: order.map((entry) => entry.coefficient),
    total: equation.total,
  };
}

/** Least and greatest weighted value a cell can still take under its domain. */
export function weightedBounds(
  problem: EngineProblem,
  mask: number,
  coefficient: number,
): { lo: number; hi: number } | undefined {
  const values = problem.symbols
    .filter((symbol) => (mask & symbolMask(symbol)) !== 0)
    .map((symbol) => coefficient * symbolValue(problem, symbol));
  if (values.length === 0) return undefined;
  return { lo: Math.min(...values), hi: Math.max(...values) };
}

/**
 * Candidates of `equation` that lemma LS excludes under `domains`: a value d
 * of cell t whose weighted value plus the other cells' minima exceeds the
 * total, or plus their maxima cannot reach it. Cells outside `open` (already
 * placed) keep their singleton domain as a bound but receive no removal.
 */
export function boundsRemovals(
  problem: EngineProblem,
  equation: Equation,
  domains: readonly number[],
  open: readonly boolean[],
): { cell: number; symbol: number }[] {
  const bounds = equation.cells.map((_, index) =>
    weightedBounds(problem, domains[index], equation.coefficients[index]),
  );
  if (bounds.some((bound) => bound === undefined)) return [];
  const removals: { cell: number; symbol: number }[] = [];
  equation.cells.forEach((cell, target) => {
    if (!open[target]) return;
    let othersLo = 0,
      othersHi = 0;
    bounds.forEach((bound, index) => {
      if (index === target || bound === undefined) return;
      othersLo += bound.lo;
      othersHi += bound.hi;
    });
    for (const symbol of problem.symbols) {
      if ((domains[target] & symbolMask(symbol)) === 0) continue;
      const weighted = equation.coefficients[target] * symbolValue(problem, symbol);
      if (weighted + othersLo > equation.total || weighted + othersHi < equation.total)
        removals.push({ cell, symbol });
    }
  });
  return removals;
}

export function scalarParameters(
  rule: ConstraintInstance,
): Readonly<Record<string, unknown>> | null {
  const parameters = rule.parameters;
  return parameters !== null && typeof parameters === "object" && !Array.isArray(parameters)
    ? (parameters as Readonly<Record<string, unknown>>)
    : null;
}

export function scopeIssues(
  type: string,
  problem: EngineProblem,
  rule: ConstraintInstance,
  minimum: number,
): RuleIssue[] {
  const issues: RuleIssue[] = [];
  if (rule.cells.length < minimum)
    issues.push({
      code: "invalid-scope",
      constraintId: rule.id,
      message: `${type} requires at least ${minimum} cells`,
    });
  if (new Set(rule.cells).size !== rule.cells.length)
    issues.push({
      code: "invalid-scope",
      constraintId: rule.id,
      message: `${type} cells must be distinct`,
    });
  if (rule.cells.some((cell) => !problem.cells.includes(cell)))
    issues.push({
      code: "invalid-scope",
      constraintId: rule.id,
      message: `${type} references an unknown cell`,
    });
  return issues;
}

/** Shared propagation for any module that publishes one `sum` capability. */
export function* propagateSum(
  view: ReadView,
  rule: ConstraintInstance,
  equation: Equation,
): Discovery {
  const problem = view.assembly.problem;
  const open = equation.cells.map((cell) => view.state.values[cell] === 0);
  if (!open.some(Boolean)) {
    yield { kind: "exhausted" };
    return;
  }
  const fact = sourceFacts(view, "sum").find(
    (candidate) =>
      candidate.proposition.kind === "sum" &&
      sameValue(candidate.proposition, { kind: "sum", ...equation }) &&
      sameValue(candidate.rules, [rule.id]) &&
      !candidate.conditional &&
      candidate.openAssumptions.length === 0,
  );
  if (!fact) throw Error("missing-sum-evidence");
  yield { kind: "work", units: equation.cells.length * problem.symbols.length };
  const domains = equation.cells.map((cell) => view.state.domains[cell]);
  const removals = boundsRemovals(problem, equation, domains, open);
  if (removals.length === 0) {
    yield { kind: "exhausted" };
    return;
  }
  const builder = new CertificateBuilder(view);
  const premises = [fact.root, ...equation.cells.map((cell) => view.state.domainFacts[cell])];
  for (const { cell, symbol } of removals) {
    yield { kind: "work", units: 1 };
    const root = builder.add("linear-sum@1", premises, literal(cell, symbol, false));
    builder.effect({ kind: "remove", cell, symbol }, root);
  }
  yield {
    kind: "proposal",
    proposal: builder.finish(SUM_MAINTENANCE, { kind: "sum", constraintId: rule.id }),
  };
  yield { kind: "exhausted" };
}

/** Independent check of a `sum@1` capability root against the rule's own equation. */
export function checkSumCapability(
  input: PrimitiveInput,
  context: CheckContext,
  rule: ConstraintInstance,
  equation: Equation,
): CheckedInference {
  requireProof(
    input.rule === "sum@1" &&
      sameValue(input.parameters, { constraintId: rule.id }) &&
      input.premises.length === 1 &&
      sameValue(context.retained.get(input.premises[0])?.conclusion, {
        kind: "rule",
        constraintId: rule.id,
      }),
    "missing-rule-premise",
  );
  requireProof(sameValue(input.conclusion, { kind: "sum", ...equation }), "invalid-sum-equation");
  return inference(input, [rule.id]);
}

export function checkRuleRoot(input: PrimitiveInput, rule: ConstraintInstance): CheckedInference {
  requireProof(
    input.rule === "rule-instance@1" &&
      input.premises.length === 0 &&
      sameValue(input.parameters, {}) &&
      sameValue(input.conclusion, { kind: "rule", constraintId: rule.id }),
    "invalid-rule-root",
  );
  return inference(input, [rule.id]);
}
