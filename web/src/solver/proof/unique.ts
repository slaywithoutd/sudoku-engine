import type { CheckContext, CheckedInference, PrimitiveInput } from "./types";
import type { Proposition } from "../state/types";
import { clause, derived, domainAssertion, requireProof, sameValue } from "./primitives";
import { uniqueAuthorityEvidenceId, uniqueAuthorityMatches } from "../conditional";
import { symbolMask } from "../state/read";
import { defined } from "../invariants";

/** All current domains and original givens/rules are explicit conjunction leaves. */
export interface UniqueTransform {
  readonly cells: readonly number[];
  readonly coreMasks: readonly number[];
  /** A cell permutation for the six-cell trade; null means per-cell pair complement. */
  readonly permutation: readonly number[] | null;
  readonly evidenceId: string;
}
const symbols = (mask: number): number[] =>
  Array.from({ length: 9 }, (_, i) => i + 1).filter((symbol) => mask & symbolMask(symbol));

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
    const claimed = input.parameters as unknown as UniqueTransform | undefined,
      problem = context.view.assembly.problem;
    requireProof(
      claimed &&
        sameValue(Object.keys(claimed).sort(), [
          "cells",
          "coreMasks",
          "evidenceId",
          "permutation",
        ]) &&
        claimed.evidenceId === uniqueAuthorityEvidenceId(context.uniqueAuthority),
      "unique-source-binding",
    );
    const transform = claimed;
    requireProof(
      Array.isArray(transform.cells) &&
        transform.cells.length >= 4 &&
        transform.cells.length <= 81 &&
        transform.cells.every(
          (cell, i) =>
            Number.isSafeInteger(cell) &&
            problem.cells.includes(cell) &&
            (!i || cell > transform.cells[i - 1]),
        ) &&
        Array.isArray(transform.coreMasks) &&
        transform.coreMasks.length === transform.cells.length,
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
      const domain = domainAssertion(leaf);
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
      } else if (leaf.kind === "literal" && leaf.value.positive && domain) {
        requireProof(!domains.has(domain.cell), "unique-duplicate-domain");
        domains.set(domain.cell, domain.mask);
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
        problem.cells.every((cell) => domains.get(cell) === context.view.state.domains[cell]) &&
        givens.size === problem.givens.filter(Boolean).length &&
        problem.cells.every(
          (cell) => !problem.givens[cell] || givens.get(cell) === problem.givens[cell],
        ) &&
        rules.size === problem.constraints.length &&
        problem.constraints.every((rule) => rules.has(rule.id)),
      "unique-incomplete-premises",
    );
    const core = new Map<number, number>();
    for (const [i, cell] of transform.cells.entries()) {
      yield 1;
      const mask = transform.coreMasks[i];
      requireProof(
        problem.givens[cell] === 0 &&
          Number.isSafeInteger(mask) &&
          mask > 0 &&
          mask <= 511 &&
          symbols(mask).length === (transform.permutation === null ? 2 : 3) &&
          (defined(domains.get(cell), "domain") & mask) !== 0,
        "unique-invalid-core",
      );
      core.set(cell, mask);
    }
    const affected = problem.constraints.filter((rule) =>
      rule.cells.some((cell) => core.has(cell)),
    );
    for (const rule of affected) {
      yield 1;
      requireProof(rule.type === "all-different@1", "unique-unsupported-rule-preservation");
    }
    if (transform.permutation === null) {
      for (const rule of affected)
        for (const symbol of problem.symbols) {
          yield 1;
          const occurrences = rule.cells.filter(
            (cell) => (core.get(cell) ?? 0) & symbolMask(symbol),
          );
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
        transform.cells.length === 6 &&
          Array.isArray(transform.permutation) &&
          transform.permutation.length === 6 &&
          new Set(transform.permutation).size === 6 &&
          transform.permutation.every((cell) => core.has(cell)),
        "unique-cell-permutation",
      );
      const assignment = new Map<number, number>();
      let compatible = 0;
      function* visit(index: number): Generator<number, void, void> {
        yield 1;
        if (index < transform.cells.length) {
          const cell = transform.cells[index];
          for (const symbol of symbols(defined(core.get(cell), "core"))) {
            if (
              affected.some(
                (rule) =>
                  rule.cells.includes(cell) &&
                  rule.cells.some((other) => assignment.get(other) === symbol),
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
        const after = new Map(
          transform.cells.map((cell, i) => [
            cell,
            defined(assignment.get(defined(transform.permutation, "permutation")[i]), "assignment"),
          ]),
        );
        requireProof(
          transform.cells.some((cell) => assignment.get(cell) !== after.get(cell)),
          "unique-identity-transform",
        );
        for (const rule of affected) {
          yield 1;
          const touched = rule.cells.filter((cell) => core.has(cell));
          requireProof(
            sameValue(
              touched.map((cell) => assignment.get(cell)).sort(),
              touched.map((cell) => after.get(cell)).sort(),
            ),
            "unique-house-multiset-preservation",
          );
        }
      }
      yield* visit(0);
      requireProof(compatible > 0, "unique-incompatible-core");
    }
    const guardians = transform.cells.flatMap((cell) =>
      symbols(defined(domains.get(cell), "domain") & ~defined(core.get(cell), "core")).map(
        (symbol) => ({
          cell,
          symbol,
          positive: true,
        }),
      ),
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
