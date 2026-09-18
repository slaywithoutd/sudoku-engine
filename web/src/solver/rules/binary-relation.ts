import type { ConstraintInstance, EngineProblem, SymbolId } from "../problem";
import { symbolValue } from "../problem";
import { CertificateBuilder, literal } from "../proof/builder";
import { inference, requireProof, sameValue } from "../proof/primitives";
import type { PrimitiveInput, CheckContext, CheckedInference } from "../proof/types";
import { sourceFacts } from "../state/source-index";
import { symbolMask } from "../state/read";
import type {
  Assignment,
  Discovery,
  ReadView,
  RuleCapabilities,
  RuleContext,
  RuleIssue,
  RuleModule,
} from "./types";

/** Technique id of relation maintenance proposals; its closed grammar lives in variant-grammar.ts. */
export const RELATION_MAINTENANCE = "rule-relation@1";

/**
 * Shared strategy for rules over exactly two cells whose meaning is a finite
 * set of value pairs (order, consecutive, ratio, negative dots). Each concrete
 * module supplies `holds(left, right)` over numeric values; everything else —
 * validation, the published relation capability, propagation through a
 * complete two-cell table and the independent capability check — is common.
 *
 * The capability lists the relation over the two cells in ascending cell
 * order, so a rule written as [b, a] publishes tuples whose first column is
 * cell min(a, b). `holds` always receives the values in the rule's own order.
 */
/**
 * Tuples depend on the rule instance and on the problem's symbol alphabet.
 * canonicalProblem always builds fresh frozen instances per problem, but the
 * public methods are keyed on both so an instance reused across alphabets
 * can never read another problem's table.
 */
const tupleCache = new WeakMap<ConstraintInstance, Map<string, readonly (readonly SymbolId[])[]>>();

export abstract class BinaryRelationRule implements RuleModule {
  abstract readonly type: string;

  /** True when the pair of numeric values satisfies the rule, in the rule's cell order. */
  protected abstract holds(left: number, right: number, rule: ConstraintInstance): boolean;

  /** Parameter validation specific to the concrete rule; empty when valid. */
  protected abstract parameterIssues(rule: ConstraintInstance): readonly string[];

  normalize(input: ConstraintInstance): ConstraintInstance {
    // The pair is ordered: [a, b] and [b, a] mean different things for `<`.
    return { ...input, cells: [...input.cells] };
  }

  validate(problem: EngineProblem, rule: ConstraintInstance): readonly RuleIssue[] {
    const issues: RuleIssue[] = [];
    if (rule.cells.length !== 2 || rule.cells[0] === rule.cells[1])
      issues.push({
        code: "invalid-scope",
        constraintId: rule.id,
        message: `${this.type} requires two distinct cells`,
      });
    if (rule.cells.some((cell) => !problem.cells.includes(cell)))
      issues.push({
        code: "invalid-scope",
        constraintId: rule.id,
        message: `${this.type} references an unknown cell`,
      });
    for (const message of this.parameterIssues(rule))
      issues.push({ code: "invalid-parameters", constraintId: rule.id, message });
    return issues;
  }

  checkComplete(rule: ConstraintInstance, assignment: Assignment): boolean {
    // Assignments carry symbol ids; symbolValue is the identity today (spec §3.3 A).
    const [left, right] = rule.cells.map((cell) => assignment.values[cell]);
    if (!left || !right) return false;
    return this.holds(left, right, rule);
  }

  /** Relation tuples in ascending cell order, sorted lexicographically. */
  tuples(rule: ConstraintInstance, problem: EngineProblem): readonly (readonly SymbolId[])[] {
    const alphabet = problem.symbols.join(",");
    const perRule = tupleCache.get(rule) ?? new Map<string, readonly (readonly SymbolId[])[]>();
    const cached = perRule.get(alphabet);
    if (cached) return cached;
    const computed = this.computeTuples(rule, problem);
    perRule.set(alphabet, computed);
    tupleCache.set(rule, perRule);
    return computed;
  }

  private computeTuples(
    rule: ConstraintInstance,
    problem: EngineProblem,
  ): readonly (readonly SymbolId[])[] {
    const [a, b] = rule.cells;
    const swapped = a > b;
    const tuples: SymbolId[][] = [];
    for (const first of problem.symbols)
      for (const second of problem.symbols) {
        const leftSymbol = swapped ? second : first;
        const rightSymbol = swapped ? first : second;
        if (this.holds(symbolValue(problem, leftSymbol), symbolValue(problem, rightSymbol), rule))
          tuples.push([first, second]);
      }
    return Object.freeze(tuples.sort((left, right) => left[0] - right[0] || left[1] - right[1]));
  }

  /** Keeps, for each of the two cells, only the symbols some compatible tuple supports. */
  prune(
    rule: ConstraintInstance,
    problem: EngineProblem,
    values: readonly number[],
    masks: readonly number[],
  ): readonly number[] | null {
    const cells = [...rule.cells].sort((left, right) => left - right);
    const current = cells.map((cell) =>
      values[cell] !== 0 ? symbolMask(values[cell]) : masks[cell],
    );
    const supported = [0, 0];
    for (const tuple of this.tuples(rule, problem))
      if ((current[0] & symbolMask(tuple[0])) !== 0 && (current[1] & symbolMask(tuple[1])) !== 0) {
        supported[0] |= symbolMask(tuple[0]);
        supported[1] |= symbolMask(tuple[1]);
      }
    if (supported[0] === 0 || supported[1] === 0) return null;
    const next = [...masks];
    cells.forEach((cell, index) => {
      next[cell] = masks[cell] & supported[index];
    });
    return next;
  }

  capabilities(rule: ConstraintInstance, context: RuleContext): RuleCapabilities {
    const premise = context.roots.get(rule.id);
    if (premise === undefined) throw new Error(`Missing assembler root for ${rule.id}`);
    return {
      allDifferent: [],
      covers: [],
      relations: [
        {
          id: `${rule.id}:relation`,
          cells: [...rule.cells].sort((left, right) => left - right),
          tuples: this.tuples(rule, context.problem),
          premise,
        },
      ],
      sums: [],
      primitiveIds: ["rule-instance@1", "relation@1"],
    };
  }

  /**
   * Removes every candidate of either cell that no tuple compatible with the
   * current domains supports. One complete two-cell table (at most 81 rows)
   * is filtered from the relation fact and both current domain facts; each
   * removal projects a negative literal from that table (lemma M3 + D075).
   */
  *propagate(view: ReadView, rule: ConstraintInstance): Discovery {
    const cells = [...rule.cells].sort((left, right) => left - right);
    if (cells.every((cell) => view.state.values[cell])) {
      yield { kind: "exhausted" };
      return;
    }
    const fact = sourceFacts(view, "relation").find(
      (candidate) =>
        candidate.proposition.kind === "relation" &&
        sameValue(candidate.proposition.cells, cells) &&
        sameValue(candidate.rules, [rule.id]) &&
        !candidate.conditional &&
        candidate.openAssumptions.length === 0,
    );
    if (!fact || fact.proposition.kind !== "relation") throw Error("missing-relation-evidence");
    const domains = cells.map((cell) => view.state.domains[cell]);
    const supported = cells.map(() => 0);
    let count = 0;
    for (const tuple of fact.proposition.tuples) {
      yield { kind: "work", units: 1 };
      if (tuple.every((symbol, index) => domains[index] & symbolMask(symbol))) {
        count += 1;
        tuple.forEach((symbol, index) => {
          supported[index] |= symbolMask(symbol);
        });
      }
    }
    const removals = cells.flatMap((cell, index) =>
      view.state.values[cell]
        ? []
        : view.assembly.problem.symbols
            .filter(
              (symbol) =>
                domains[index] & symbolMask(symbol) && !(supported[index] & symbolMask(symbol)),
            )
            .map((symbol) => ({ cell, symbol })),
    );
    if (removals.length === 0) {
      yield { kind: "exhausted" };
      return;
    }
    const builder = new CertificateBuilder(view);
    const table = builder.add(
      "table-filter@1",
      [fact.root, ...cells.map((cell) => view.state.domainFacts[cell])],
      { kind: "table", cells, count, definition: builder.next },
      { cells, box: domains },
    );
    for (const { cell, symbol } of removals) {
      yield { kind: "work", units: 1 };
      const root = builder.add("table-project@1", [table], literal(cell, symbol, false));
      builder.effect({ kind: "remove", cell, symbol }, root);
    }
    yield {
      kind: "proposal",
      proposal: builder.finish(RELATION_MAINTENANCE, { kind: "relation", constraintId: rule.id }),
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
      return inference(input, [rule.id]);
    }
    requireProof(
      input.rule === "relation@1" &&
        sameValue(input.parameters, { constraintId: rule.id }) &&
        input.premises.length === 1 &&
        sameValue(context.retained.get(input.premises[0])?.conclusion, {
          kind: "rule",
          constraintId: rule.id,
        }),
      "missing-rule-premise",
    );
    // Recompute the tuple set from the rule's own semantics; discovery output is never trusted.
    requireProof(
      sameValue(input.conclusion, {
        kind: "relation",
        cells: [...rule.cells].sort((left, right) => left - right),
        tuples: this.tuples(rule, problem),
      }),
      "invalid-relation-tuples",
    );
    return inference(input, [rule.id]);
  }
}
