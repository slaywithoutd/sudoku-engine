import type { CheckContext, CheckedInference, PrimitiveInput } from "./types";
import type { Proposition } from "../state/types";
import { clause, derived, domainAssertion, requireProof, sameValue } from "./primitives";
import { uniqueAuthorityEvidenceId, uniqueAuthorityMatches } from "../conditional";
import { symbolMask } from "../state/read";

/** All current domains and original givens/rules are explicit conjunction leaves. */
export interface UniqueTransform {
  readonly cells: readonly number[];
  readonly coreMasks: readonly number[];
  /** A cell permutation for the six-cell trade; null means per-cell pair complement. */
  readonly permutation: readonly number[] | null;
  readonly evidenceId: string;
}
const symbols = (mask: number): number[] =>
  Array.from({ length: 9 }, (_, i) => i + 1).filter((s) => mask & symbolMask(s));

/**
 * Checks a universal alternate-completion mapping, never an exact solution.
 * Pair complement is algebraic even for a board-wide BUG core. Cell exchange
 * enumerates only its bounded six-cell core. Unsupported affected rules reject.
 */
export class UniqueTransformChecker {
  readonly id = "unique-transform@1";
  *check(input: PrimitiveInput, context: CheckContext): Generator<number, CheckedInference, void> {
    requireProof(
      context.policy === "unique-only" &&
        uniqueAuthorityMatches(context.uniqueAuthority, context.authorityView ?? context.view),
      "missing-unique-authority",
    );
    const p = input.parameters as unknown as UniqueTransform,
      problem = context.view.assembly.problem;
    requireProof(
      p &&
        sameValue(Object.keys(p).sort(), ["cells", "coreMasks", "evidenceId", "permutation"]) &&
        p.evidenceId === uniqueAuthorityEvidenceId(context.uniqueAuthority),
      "unique-source-binding",
    );
    requireProof(
      Array.isArray(p.cells) &&
        p.cells.length >= 4 &&
        p.cells.length <= 81 &&
        p.cells.every(
          (c, i) =>
            Number.isSafeInteger(c) && problem.cells.includes(c) && (!i || c > p.cells[i - 1]),
        ) &&
        Array.isArray(p.coreMasks) &&
        p.coreMasks.length === p.cells.length,
      "unique-transform-cells",
    );
    const leaves: Proposition[] = [];
    function flatten(proposition: Proposition, depth = 0): void {
      requireProof(depth <= 3 && leaves.length <= 418, "unique-premise-bound");
      if (proposition.kind === "and") proposition.terms.forEach((term) => flatten(term, depth + 1));
      else leaves.push(proposition);
    }
    for (const id of input.premises) {
      yield 1;
      const node = context.retained.get(id);
      requireProof(node, "unique-missing-premise");
      flatten(node.conclusion);
    }
    const domains = new Map<number, number>(),
      givens = new Map<number, number>(),
      rules = new Set<string>();
    for (const leaf of leaves) {
      yield 1;
      const d = domainAssertion(leaf);
      // Positive givens are also domain assertions, so distinguish exact kind.
      if (leaf.kind === "domain") {
        requireProof(!domains.has(leaf.cell), "unique-duplicate-domain");
        domains.set(leaf.cell, leaf.mask);
      } else if (
        leaf.kind === "literal" &&
        leaf.value.positive &&
        problem.givens[leaf.value.cell] === leaf.value.symbol
      ) {
        requireProof(!givens.has(leaf.value.cell), "unique-duplicate-given");
        givens.set(leaf.value.cell, leaf.value.symbol);
      } else if (leaf.kind === "literal" && leaf.value.positive && d) {
        requireProof(!domains.has(d.cell), "unique-duplicate-domain");
        domains.set(d.cell, d.mask);
      } else if (leaf.kind === "rule") {
        requireProof(!rules.has(leaf.constraintId), "unique-duplicate-rule");
        rules.add(leaf.constraintId);
      } else requireProof(false, "unique-premise-kind");
    }
    // Original positive facts may serve both as a current singleton and given root.
    for (const [cell, value] of givens)
      if (!domains.has(cell)) domains.set(cell, symbolMask(value));
    requireProof(
      domains.size === problem.cells.length &&
        problem.cells.every((c) => domains.get(c) === context.view.state.domains[c]) &&
        givens.size === problem.givens.filter(Boolean).length &&
        problem.cells.every((c) => !problem.givens[c] || givens.get(c) === problem.givens[c]) &&
        rules.size === problem.constraints.length &&
        problem.constraints.every((rule) => rules.has(rule.id)),
      "unique-incomplete-premises",
    );
    const core = new Map<number, number>();
    for (const [i, cell] of p.cells.entries()) {
      yield 1;
      const mask = p.coreMasks[i];
      requireProof(
        problem.givens[cell] === 0 &&
          Number.isSafeInteger(mask) &&
          mask > 0 &&
          mask <= 511 &&
          symbols(mask).length === (p.permutation === null ? 2 : 3) &&
          (domains.get(cell)! & mask) !== 0,
        "unique-invalid-core",
      );
      core.set(cell, mask);
    }
    const affected = problem.constraints.filter((rule) => rule.cells.some((c) => core.has(c)));
    for (const rule of affected) {
      yield 1;
      requireProof(rule.type === "all-different@1", "unique-unsupported-rule-preservation");
    }
    if (p.permutation === null) {
      for (const rule of affected)
        for (const symbol of problem.symbols) {
          yield 1;
          const occurrences = rule.cells.filter((c) => (core.get(c) ?? 0) & symbolMask(symbol));
          // Each selected cell has two values; every selected house-symbol has
          // two occurrences. Any valid core assignment uses each union symbol
          // once, and complement exchanges its selected occurrence with the other.
          requireProof(
            occurrences.length === 0 || occurrences.length === 2,
            "unique-house-pair-preservation",
          );
        }
    } else {
      requireProof(
        p.cells.length === 6 &&
          Array.isArray(p.permutation) &&
          p.permutation.length === 6 &&
          new Set(p.permutation).size === 6 &&
          p.permutation.every((c) => core.has(c)),
        "unique-cell-permutation",
      );
      const assignment = new Map<number, number>();
      let compatible = 0;
      function* visit(index: number): Generator<number, void, void> {
        yield 1;
        if (index < p.cells.length) {
          const cell = p.cells[index];
          for (const symbol of symbols(core.get(cell)!)) {
            if (
              affected.some(
                (h) => h.cells.includes(cell) && h.cells.some((c) => assignment.get(c) === symbol),
              )
            )
              continue;
            assignment.set(cell, symbol);
            yield* visit(index + 1);
            assignment.delete(cell);
          }
          return;
        }
        compatible++;
        const after = new Map(p.cells.map((c, i) => [c, assignment.get(p.permutation![i])!]));
        requireProof(
          p.cells.some((c) => assignment.get(c) !== after.get(c)),
          "unique-identity-transform",
        );
        for (const rule of affected) {
          yield 1;
          const touched = rule.cells.filter((c) => core.has(c));
          requireProof(
            sameValue(
              touched.map((c) => assignment.get(c)).sort(),
              touched.map((c) => after.get(c)).sort(),
            ),
            "unique-house-multiset-preservation",
          );
        }
      }
      yield* visit(0);
      requireProof(compatible > 0, "unique-incompatible-core");
    }
    const guardians = p.cells.flatMap((cell) =>
      symbols(domains.get(cell)! & ~core.get(cell)!).map((symbol) => ({
        cell,
        symbol,
        positive: true,
      })),
    );
    requireProof(
      guardians.length > 0 &&
        guardians.length <= 64 &&
        sameValue(input.conclusion, clause(guardians)),
      "unique-complete-guardians",
    );
    const inference = derived(input, context);
    return Object.freeze({ ...inference, conditional: true });
  }
}
