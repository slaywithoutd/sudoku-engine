import {
  clause,
  derived,
  domainAssertion,
  requireProof,
  sameValue,
  validLiteral,
} from "./primitives";
import { weightedIncidences, type WeightedPremise } from "./counts";
import type { CheckContext, CheckedInference, PrimitiveInput } from "./types";

/** Finite signed-count entailment. Falsifying the proposed clause fixes unary
 * occupancy bits; an exact lower bound above U-L rejects that whole assignment
 * product. Incompatible fixings are rejected rather than treated as a count. */
export class CoverCountClauseChecker {
  readonly id = "cover-count-clause@1";
  *check(input: PrimitiveInput, context: CheckContext): Generator<number, CheckedInference> {
    const p = input.parameters as unknown as {
        symbol: number;
        covers: WeightedPremise[];
        capacities: WeightedPremise[];
      },
      claim = input.conclusion;
    requireProof(
      p &&
        context.view.assembly.problem.symbols.includes(p.symbol) &&
        Array.isArray(p.covers) &&
        p.covers.length > 0 &&
        Array.isArray(p.capacities) &&
        p.capacities.length > 0 &&
        sameValue(input.parameters, {
          symbol: p.symbol,
          covers: p.covers,
          capacities: p.capacities,
        }),
      "invalid-count-parameters",
    );
    const scratch =
      65536 +
      input.premises.length * 256 +
      (p.covers.length + p.capacities.length) * 128 +
      (claim.kind === "clause" ? claim.alternatives.length * 128 : 0);
    requireProof((context.workspaceRemaining ?? 0) >= scratch, "count-clause-workspace-limit");
    requireProof(
      new Set(input.premises).size === input.premises.length,
      "duplicate-count-clause-premise",
    );
    requireProof(
      claim.kind === "clause" &&
        claim.alternatives.length >= 2 &&
        claim.alternatives.length <= 64 &&
        sameValue(claim, clause(claim.alternatives)),
      "invalid-count-clause",
    );
    const { coefficients, bound, domainIds } = yield* weightedIncidences(
      input,
      context,
      p.symbol,
      p.covers,
      p.capacities,
    );
    const fixings = new Map<number, number>();
    for (const value of claim.alternatives) {
      yield 1;
      requireProof(
        validLiteral(value, context) &&
          value.symbol === p.symbol &&
          coefficients.has(value.cell) &&
          !fixings.has(value.cell),
        "invalid-count-clause",
      );
      fixings.set(value.cell, value.positive ? 0 : 1);
    }
    const needed = new Set(
      [...coefficients].filter(([, coefficient]) => coefficient !== 0).map(([cell]) => cell),
    );
    fixings.forEach((_, cell) => needed.add(cell));
    const domains = new Map<number, number>();
    for (const id of domainIds) {
      yield 1;
      const d = domainAssertion(context.retained.get(id)!.conclusion);
      requireProof(
        d && needed.has(d.cell) && !domains.has(d.cell) && d.mask !== 0,
        "incomplete-count-clause-domains",
      );
      domains.set(d.cell, d.mask);
    }
    requireProof(domains.size === needed.size, "incomplete-count-clause-domains");
    let minimum = 0;
    const bit = 1 << (p.symbol - 1);
    for (const [cell, mask] of domains) {
      yield 1;
      const canOne = (mask & bit) !== 0,
        canZero = (mask & ~bit) !== 0,
        fixed = fixings.get(cell),
        coefficient = coefficients.get(cell)!;
      requireProof(
        fixed === undefined ? canOne || canZero : fixed === 1 ? canOne : canZero,
        "incompatible-count-clause-falsification",
      );
      minimum +=
        fixed !== undefined
          ? coefficient * fixed
          : !canOne
            ? 0
            : !canZero
              ? coefficient
              : Math.min(0, coefficient);
      requireProof(Number.isSafeInteger(minimum), "count-integer-overflow");
    }
    requireProof(minimum > bound, "invalid-count-clause-conclusion");
    return derived(input, context);
  }
}
