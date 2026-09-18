import type { ConstraintInstance, EngineProblem } from "../problem";
import { requireProof } from "../proof/primitives";
import type { PrimitiveInput, CheckContext, CheckedInference } from "../proof/types";
import {
  canonicalEquation,
  checkRuleRoot,
  checkSumCapability,
  propagateSum,
  pruneSum,
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
 * arrow@1: cells[0] is the circle, the rest the arm; the arm's values sum to
 * the circle's (lemma M2). Published as one signed sum, +1 on every arm cell
 * and -1 on the circle, total 0. Arm cells may repeat values unless another
 * rule forbids it, so no all-different scope is claimed.
 */
const equationCache = new WeakMap<ConstraintInstance, Equation>();

export class ArrowRule implements RuleModule {
  readonly type = "arrow@1";

  constructor() {
    Object.freeze(this);
  }

  equation(rule: ConstraintInstance): Equation {
    const [circle, ...arm] = rule.cells;
    return canonicalEquation({
      cells: [circle, ...arm],
      coefficients: [-1, ...arm.map(() => 1)],
      total: 0,
    });
  }

  normalize(input: ConstraintInstance): ConstraintInstance {
    // The circle stays first; the arm is a set as far as the sum is concerned.
    const [circle, ...arm] = input.cells;
    return { ...input, cells: [circle, ...arm.sort((left, right) => left - right)] };
  }

  validate(problem: EngineProblem, rule: ConstraintInstance): readonly RuleIssue[] {
    const issues = scopeIssues(this.type, problem, rule, 3);
    if (rule.cells.length > M2_ROOT_LIMITS.sumCells)
      issues.push({
        code: "invalid-scope",
        constraintId: rule.id,
        message: `arrow@1 supports at most ${M2_ROOT_LIMITS.sumCells} cells including the circle`,
      });
    const parameters = scalarParameters(rule);
    if (parameters === null || Object.keys(parameters).length !== 0)
      issues.push({
        code: "invalid-parameters",
        constraintId: rule.id,
        message: "arrow@1 accepts no parameters",
      });
    return issues;
  }

  checkComplete(rule: ConstraintInstance, assignment: Assignment): boolean {
    const [circle, ...arm] = rule.cells.map((cell) => assignment.values[cell]);
    if (!circle || arm.some((value) => !value)) return false;
    return arm.reduce((total, value) => total + value, 0) === circle;
  }

  capabilities(rule: ConstraintInstance, context: RuleContext): RuleCapabilities {
    const premise = context.roots.get(rule.id);
    if (premise === undefined) throw new Error(`Missing assembler root for ${rule.id}`);
    return {
      allDifferent: [],
      covers: [],
      relations: [],
      sums: [{ id: `${rule.id}:sum`, ...this.equation(rule), premise }],
      primitiveIds: ["rule-instance@1", "sum@1"],
    };
  }

  *propagate(view: ReadView, rule: ConstraintInstance): Discovery {
    yield* propagateSum(view, rule, this.equation(rule));
  }

  prune(
    rule: ConstraintInstance,
    problem: EngineProblem,
    values: readonly number[],
    masks: readonly number[],
  ): readonly number[] | null {
    return pruneSum(problem, this.equation(rule), values, masks);
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
    return checkSumCapability(input, context, rule, this.equation(rule));
  }
}
