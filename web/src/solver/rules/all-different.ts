import type { ConstraintInstance, EngineProblem } from "../problem";
import { CertificateBuilder } from "../proof/builder";
import { inference, requireProof, sameValue } from "../proof/primitives";
import type { PrimitiveInput, CheckContext, CheckedInference } from "../proof/types";
import type {
  Assignment,
  Discovery,
  ReadView,
  RuleCapabilities,
  RuleContext,
  RuleIssue,
  RuleModule,
} from "./types";
import { symbolMask } from "../state/read";

/** Versioned strategy for the only production rule supported in M2. */
export class AllDifferentRule implements RuleModule {
  readonly type = "all-different@1";

  constructor() {
    Object.freeze(this);
  }

  normalize(input: ConstraintInstance): ConstraintInstance {
    return { ...input, cells: [...input.cells].sort((left, right) => left - right) };
  }

  validate(problem: EngineProblem, rule: ConstraintInstance): readonly RuleIssue[] {
    const issues: RuleIssue[] = [];
    if (
      rule.parameters === null ||
      typeof rule.parameters !== "object" ||
      Array.isArray(rule.parameters) ||
      Object.keys(rule.parameters).length !== 0
    )
      issues.push({
        code: "invalid-parameters",
        constraintId: rule.id,
        message: "all-different@1 accepts no parameters",
      });
    if (rule.cells.length < 2)
      issues.push({
        code: "invalid-scope",
        constraintId: rule.id,
        message: "all-different@1 requires at least two cells",
      });
    if (new Set(rule.cells).size !== rule.cells.length)
      issues.push({
        code: "invalid-scope",
        constraintId: rule.id,
        message: "all-different@1 cells must be distinct",
      });
    if (rule.cells.some((cell) => !problem.cells.includes(cell)))
      issues.push({
        code: "invalid-scope",
        constraintId: rule.id,
        message: "all-different@1 references an unknown cell",
      });
    return issues;
  }

  checkComplete(rule: ConstraintInstance, assignment: Assignment): boolean {
    const seen = new Set<number>();
    for (const cell of rule.cells) {
      const value = assignment.values[cell];
      if (!Number.isSafeInteger(value) || value <= 0 || seen.has(value)) return false;
      seen.add(value);
    }
    return true;
  }

  capabilities(rule: ConstraintInstance, context: RuleContext): RuleCapabilities {
    const premise = context.roots.get(rule.id);
    if (premise === undefined) throw new Error(`Missing assembler root for ${rule.id}`);
    /*
     * Pairwise conflict is valid for every all-different scope. A symbol cover
     * additionally claims existence, so it is sound here only when the scope
     * has one cell per symbol in the problem's shared domain. In particular, a
     * three-cell cage must never masquerade as a nine-cell Sudoku house.
     */
    const covers =
      rule.cells.length === context.problem.symbols.length
        ? context.problem.symbols.map((symbol) => ({
            id: `${rule.id}:symbol:${symbol}`,
            symbol,
            cells: [...rule.cells],
            premise,
          }))
        : [];
    return {
      allDifferent: [{ id: rule.id, cells: [...rule.cells], premise }],
      covers,
      relations: [],
      primitiveIds: ["rule-instance@1", "all-different@1", "cover@1"],
    };
  }

  *propagate(view: ReadView, rule: ConstraintInstance): Discovery {
    const builder = new CertificateBuilder(view),
      seen = new Set<string>();
    for (const source of rule.cells)
      for (const cell of rule.cells) {
        yield { kind: "work", units: 1 };
        const symbol = view.state.values[source];
        if (
          source === cell ||
          !symbol ||
          view.state.values[cell] ||
          !(view.state.domains[cell] & symbolMask(symbol))
        )
          continue;
        if (seen.has(`${cell}:${symbol}`)) continue;
        seen.add(`${cell}:${symbol}`);
        const fact = [...view.facts.values()].find(
          (candidate) =>
            candidate.proposition.kind === "literal" &&
            candidate.proposition.value.positive &&
            candidate.proposition.value.cell === source &&
            candidate.proposition.value.symbol === symbol &&
            !candidate.conditional &&
            !candidate.openAssumptions.length,
        );
        if (!fact) throw Error("missing-value-evidence");
        builder.peer(fact.root, source, cell, symbol, rule.cells);
      }
    if (seen.size)
      yield {
        kind: "proposal",
        proposal: builder.finish("rule-propagation@1", { kind: "propagation" }),
      };
    yield { kind: "exhausted" };
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
    if (input.rule === "rule-instance@1") {
      requireProof(
        input.premises.length === 0 &&
          sameValue(input.parameters, {}) &&
          sameValue(input.conclusion, { kind: "rule", constraintId: rule.id }),
        "invalid-rule-root",
      );
    } else {
      requireProof(
        sameValue(input.parameters, { constraintId: rule.id }),
        "invalid-capability-parameters",
      );
      requireProof(
        input.premises.length === 1 &&
          sameValue(context.retained.get(input.premises[0])?.conclusion, {
            kind: "rule",
            constraintId: rule.id,
          }),
        "missing-rule-premise",
      );
      if (input.rule === "all-different@1") {
        requireProof(
          sameValue(input.conclusion, { kind: "all-different", cells: rule.cells }),
          "invalid-all-different-scope",
        );
      } else {
        requireProof(
          input.rule === "cover@1" &&
            input.conclusion.kind === "cover" &&
            problem.symbols.includes(input.conclusion.symbol) &&
            rule.cells.length === problem.symbols.length &&
            sameValue(input.conclusion, {
              kind: "cover",
              symbol: input.conclusion.symbol,
              cells: rule.cells,
            }),
          "invalid-cover-scope",
        );
      }
    }
    return inference(input, [rule.id]);
  }
}
