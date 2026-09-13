import { canonicalProblem } from "../../src/solver/problem";
import type {
  ConstraintInstance,
  EngineProblem,
  Json,
} from "../../src/solver/problem";
import { AllDifferentRule } from "../../src/solver/rules/all-different";
import { requireProof, sameValue } from "../../src/solver/proof/primitives";
import type { CheckContext, CheckedInference, PrimitiveInput } from "../../src/solver/proof/types";
import type {
  Assignment,
  RuleCapabilities,
  RuleContext,
  RuleIssue,
  RuleModule,
} from "../../src/solver/rules/types";

/** Small test rule semantics; no production registry imports these modules. */
function relationCapabilities(rule: ConstraintInstance, context: RuleContext): RuleCapabilities {
  const tuples = context.problem.symbols.flatMap(a => context.problem.symbols
    .filter(b => rule.type === "sum@1" ? a + b === (rule.parameters as { total: number }).total : a < b).map(b => [a,b]));
  return { allDifferent: [], covers: [], relations: [{ id: `${rule.id}:relation`, cells: rule.cells, tuples,
    premise: context.roots.get(rule.id)! }], primitiveIds: ["relation@1"] };
}

/** Independently reconstruct tuples, without calling capability discovery. */
function checkMockPrimitive(input: PrimitiveInput, context: CheckContext): CheckedInference {
  const id = input.conclusion.kind === "rule" ? input.conclusion.constraintId : (input.parameters as { constraintId: string }).constraintId;
  const rule = context.view.assembly.problem.constraints.find(rule => rule.id === id)!;
  requireProof(rule && rule.cells.length === 2, "invalid-mock-scope");
  if (input.rule === "rule-instance@1") requireProof(input.premises.length === 0 && sameValue(input.parameters, {}) &&
    sameValue(input.conclusion, { kind: "rule", constraintId: id }), "invalid-mock-root");
  else {
    requireProof(input.rule === "relation@1" && input.premises.length === 1 && sameValue(input.parameters, { constraintId: id }) &&
      sameValue(context.retained.get(input.premises[0])?.conclusion, { kind: "rule", constraintId: id }), "invalid-mock-relation-premise");
    const tuples: number[][] = [];
    for (const a of context.view.assembly.problem.symbols) for (const b of context.view.assembly.problem.symbols) {
      const valid = rule.type === "order@1" ? b > a : b === (rule.parameters as { total: number }).total - a;
      if (valid) tuples.push([a,b]);
    }
    requireProof(sameValue(input.conclusion, { kind: "relation", cells: rule.cells, tuples }), "invalid-mock-relation");
  }
  return { conclusion: input.conclusion, rules: [id], conditional: false, openAssumptions: [] };
}

function parameterObject(parameters: Json): Readonly<Record<string, Json>> | null {
  return parameters !== null &&
    typeof parameters === "object" &&
    !Array.isArray(parameters)
    ? (parameters as Readonly<Record<string, Json>>)
    : null;
}

function issue(rule: ConstraintInstance, message: string): readonly RuleIssue[] {
  return [{ code: "invalid-parameters", constraintId: rule.id, message }];
}

const sumRule: RuleModule = Object.freeze({
  type: "sum@1",
  normalize(input: ConstraintInstance): ConstraintInstance {
    return { ...input, cells: [...input.cells].sort((a, b) => a - b) };
  },
  validate(_problem: EngineProblem, rule: ConstraintInstance): readonly RuleIssue[] {
    const parameters = parameterObject(rule.parameters);
    if (
      parameters === null ||
      Object.keys(parameters).length !== 1 ||
      !Number.isSafeInteger(parameters.total) ||
      (parameters.total as number) <= 0
    )
      return issue(rule, "sum@1 requires exactly one positive integer total");
    return [];
  },
  checkComplete(rule: ConstraintInstance, assignment: Assignment): boolean {
    const parameters = parameterObject(rule.parameters);
    return (
      parameters !== null &&
      typeof parameters.total === "number" &&
      rule.cells.reduce((total, cell) => total + (assignment.values[cell] ?? 0), 0) ===
        parameters.total
    );
  },
  capabilities: relationCapabilities,
  *propagate() {
    yield { kind: "exhausted" } as const;
  },
  checkPrimitive: checkMockPrimitive,
});

const orderRule: RuleModule = Object.freeze({
  type: "order@1",
  normalize(input: ConstraintInstance): ConstraintInstance {
    return { ...input, cells: [...input.cells] };
  },
  validate(_problem: EngineProblem, rule: ConstraintInstance): readonly RuleIssue[] {
    const parameters = parameterObject(rule.parameters);
    if (
      rule.cells.length !== 2 ||
      parameters === null ||
      Object.keys(parameters).length !== 0
    )
      return issue(rule, "order@1 requires two ordered cells and no parameters");
    return [];
  },
  checkComplete(rule: ConstraintInstance, assignment: Assignment): boolean {
    const [left, right] = rule.cells;
    return assignment.values[left] > 0 && assignment.values[left] < assignment.values[right];
  },
  capabilities(rule: ConstraintInstance, context: RuleContext): RuleCapabilities {
    const symbols = context.problem.symbols;
    const tuples = symbols.flatMap((left) =>
      symbols.filter((right) => left < right).map((right) => [left, right] as const),
    );
    return {
      allDifferent: [],
      covers: [],
      relations: [
        {
          id: `${rule.id}:relation`,
          cells: [...rule.cells],
          tuples,
          premise: context.roots.get(rule.id)!,
        },
      ],
      primitiveIds: [],
    };
  },
  *propagate() {
    yield { kind: "exhausted" } as const;
  },
  checkPrimitive: checkMockPrimitive,
});

export const mockRuleRegistry: readonly RuleModule[] = Object.freeze([
  new AllDifferentRule(),
  sumRule,
  orderRule,
]);

export function makeMockProblem(
  constraints: readonly ConstraintInstance[] = [
    {
      id: "cage:0",
      type: "all-different@1",
      cells: [2, 0, 1],
      parameters: {},
    },
    { id: "sum:0", type: "sum@1", cells: [1, 0], parameters: { total: 10 } },
    { id: "order:0", type: "order@1", cells: [1, 0], parameters: {} },
  ],
): EngineProblem {
  return canonicalProblem({
    schema: 1,
    cells: Array.from({ length: 9 }, (_, cell) => cell),
    symbols: Array.from({ length: 9 }, (_, index) => index + 1),
    givens: Array(9).fill(0),
    constraints,
  });
}
