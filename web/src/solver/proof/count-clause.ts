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
import { symbolMask } from "../state/read";
import { defined } from "../invariants";

/** Finite signed-count entailment. Falsifying the proposed clause fixes unary
 * occupancy bits; an exact lower bound above U-L rejects that whole assignment
 * product. Incompatible fixings are rejected rather than treated as a count. */
export class CoverCountClauseChecker {
  readonly id = "cover-count-clause@1";
  *check(input: PrimitiveInput, context: CheckContext): Generator<number, CheckedInference> {
    const pattern = input.parameters as unknown as
        | {
            symbol: number;
            covers: WeightedPremise[];
            capacities: WeightedPremise[];
          }
        | undefined,
      claim = input.conclusion;
    requireProof(
      pattern &&
        context.view.assembly.problem.symbols.includes(pattern.symbol) &&
        Array.isArray(pattern.covers) &&
        pattern.covers.length > 0 &&
        Array.isArray(pattern.capacities) &&
        pattern.capacities.length > 0 &&
        sameValue(input.parameters, {
          symbol: pattern.symbol,
          covers: pattern.covers,
          capacities: pattern.capacities,
        }),
      "invalid-count-parameters",
    );
    const scratch =
      65536 +
      input.premises.length * 256 +
      (pattern.covers.length + pattern.capacities.length) * 128 +
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
      pattern.symbol,
      pattern.covers,
      pattern.capacities,
    );
    const fixings = new Map<number, number>();
    for (const value of claim.alternatives) {
      yield 1;
      requireProof(
        validLiteral(value, context) &&
          value.symbol === pattern.symbol &&
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
      const domain = domainAssertion(defined(context.retained.get(id), "retained").conclusion);
      requireProof(
        domain && needed.has(domain.cell) && !domains.has(domain.cell) && domain.mask !== 0,
        "incomplete-count-clause-domains",
      );
      domains.set(domain.cell, domain.mask);
    }
    requireProof(domains.size === needed.size, "incomplete-count-clause-domains");
    let minimum = 0;
    const bit = symbolMask(pattern.symbol);
    for (const [cell, mask] of domains) {
      yield 1;
      const canOne = (mask & bit) !== 0,
        canZero = (mask & ~bit) !== 0,
        fixed = fixings.get(cell),
        coefficient = defined(coefficients.get(cell), "coefficient");
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
