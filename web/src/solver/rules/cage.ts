import type { ConstraintInstance, EngineProblem } from "../problem";
import { inference, requireProof, sameValue } from "../proof/primitives";
import type { PrimitiveInput, CheckContext, CheckedInference } from "../proof/types";
import {
  canonicalEquation,
  checkRuleRoot,
  checkSumCapability,
  propagateSum,
  scalarParameters,
  scopeIssues,
  type Equation,
} from "./linear-rule";
import { M2_ROOT_LIMITS } from "../limits";
import type {
  Assignment,
  Discovery,
  ReadView,
  RuleCapabilities,
  RuleContext,
  RuleIssue,
  RuleModule,
} from "./types";

/**
 * cage@1: a killer cage — distinct values whose sum is `total` (lemma M1). It
 * publishes both an all-different scope (so subsets, ALS and peers work on
 * the cage) and a unit-coefficient sum. A cage never claims symbol covers:
 * a full-house cage is a house, and the all-different module owns houses.
 */
export class CageRule implements RuleModule {
  readonly type = "cage@1";

  constructor() {
    Object.freeze(this);
  }

  static total(rule: ConstraintInstance): number | undefined {
    const parameters = scalarParameters(rule);
    const total = parameters?.total;
    return parameters !== null &&
      Object.keys(parameters).length === 1 &&
      Number.isSafeInteger(total)
      ? (total as number)
      : undefined;
  }

  equation(rule: ConstraintInstance): Equation {
    return canonicalEquation({
      cells: rule.cells,
      coefficients: rule.cells.map(() => 1),
      total: CageRule.total(rule) ?? 0,
    });
  }

  normalize(input: ConstraintInstance): ConstraintInstance {
    return { ...input, cells: [...input.cells].sort((left, right) => left - right) };
  }

  validate(problem: EngineProblem, rule: ConstraintInstance): readonly RuleIssue[] {
    const issues = scopeIssues(this.type, problem, rule, 2);
    if (rule.cells.length > M2_ROOT_LIMITS.sumCells)
      issues.push({
        code: "invalid-scope",
        constraintId: rule.id,
        message: `cage@1 supports at most ${M2_ROOT_LIMITS.sumCells} cells`,
      });
    const total = CageRule.total(rule);
    if (total === undefined || total <= 0 || total > M2_ROOT_LIMITS.sumTotal)
      issues.push({
        code: "invalid-parameters",
        constraintId: rule.id,
        message: "cage@1 requires exactly one positive integer total",
      });
    return issues;
  }

  checkComplete(rule: ConstraintInstance, assignment: Assignment): boolean {
    const seen = new Set<number>();
    let sum = 0;
    for (const cell of rule.cells) {
      const value = assignment.values[cell];
      if (!Number.isSafeInteger(value) || value <= 0 || seen.has(value)) return false;
      seen.add(value);
      sum += value;
    }
    return sum === CageRule.total(rule);
  }

  capabilities(rule: ConstraintInstance, context: RuleContext): RuleCapabilities {
    const premise = context.roots.get(rule.id);
    if (premise === undefined) throw new Error(`Missing assembler root for ${rule.id}`);
    return {
      allDifferent: [{ id: rule.id, cells: [...rule.cells], premise }],
      covers: [],
      relations: [],
      sums: [{ id: `${rule.id}:sum`, ...this.equation(rule), premise }],
      primitiveIds: ["rule-instance@1", "all-different@1", "sum@1"],
    };
  }

  *propagate(view: ReadView, rule: ConstraintInstance): Discovery {
    yield* propagateSum(view, rule, this.equation(rule));
  }

  checkPrimitive(input: PrimitiveInput, context: CheckContext): CheckedInference {
    const problem = context.view.assembly.problem;
    const id =
      input.conclusion.kind === "rule"
        ? input.conclusion.constraintId
        : (input.parameters as { constraintId?: string } | null)?.constraintId;
    const rule = problem.constraints.find((rule) => rule.id === id);
    requireProof(
      rule?.type === this.type && this.validate(problem, rule).length === 0,
      "invalid-rule-instance",
    );
    if (input.rule === "rule-instance@1") return checkRuleRoot(input, rule);
    if (input.rule === "all-different@1") {
      requireProof(
        sameValue(input.parameters, { constraintId: rule.id }) &&
          input.premises.length === 1 &&
          sameValue(context.retained.get(input.premises[0])?.conclusion, {
            kind: "rule",
            constraintId: rule.id,
          }) &&
          sameValue(input.conclusion, { kind: "all-different", cells: rule.cells }),
        "invalid-all-different-scope",
      );
      return inference(input, [rule.id]);
    }
    return checkSumCapability(input, context, rule, this.equation(rule));
  }
}
