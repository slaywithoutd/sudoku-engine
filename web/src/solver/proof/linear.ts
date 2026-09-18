import { derived, requireProof, sameValue, validLiteral } from "./primitives";
import { provedDomains } from "./counts";
import type { CheckContext, CheckedInference, PrimitiveInput, Proposition } from "./types";
import { symbolValue } from "../problem";
import { M2_ROOT_LIMITS } from "../limits";
import { symbolMask } from "../state/read";
import { defined } from "../invariants";

type Sum = Extract<Proposition, { kind: "sum" }>;

/** Retained premises in the order the node cites them; every id must be a checked node. */
function retainedPremises(input: PrimitiveInput, context: CheckContext): Proposition[] {
  requireProof(
    new Set(input.premises).size === input.premises.length,
    "invalid-inference-parameters",
  );
  return input.premises.map((id) => {
    const node = context.retained.get(id);
    requireProof(node, "missing-inference-premise");
    return node.conclusion;
  });
}

function isSum(proposition: Proposition | undefined): proposition is Sum {
  return proposition?.kind === "sum";
}

/** Numeric values a domain mask admits, through the problem's symbol table. */
function domainValues(mask: number, context: CheckContext): number[] {
  const problem = context.view.assembly.problem;
  return problem.symbols
    .filter((symbol) => (mask & symbolMask(symbol)) !== 0)
    .map((symbol) => symbolValue(problem, symbol));
}

/**
 * Lemma LS. With the sum S = <cells, coefficients, total> and one proved domain
 * per cell, lo_i/hi_i are the least and greatest coefficient-weighted values
 * each cell can still take (a negative coefficient swaps them, which is what
 * lets an arrow circle carry -1). A candidate d of cell t is impossible when
 * a_t*d plus the other cells' minima exceeds the total, or plus their maxima
 * cannot reach it; the whole equation is impossible when every minimum already
 * exceeds the total or every maximum falls short. Stale but valid domains only
 * weaken the bounds, so the conclusion stays sound for any retained domain fact.
 */
export class LinearSumStrategy {
  readonly id = "linear-sum@1";
  check(input: PrimitiveInput, context: CheckContext): CheckedInference {
    requireProof(sameValue(input.parameters, {}), "invalid-inference-parameters");
    const [sum, ...sources] = retainedPremises(input, context);
    requireProof(isSum(sum), "expected-sum");
    const domains = provedDomains(sources, sum.cells);
    const bounds = sum.cells.map((cell, index) => {
      const values = domainValues(defined(domains.get(cell), "domain"), context).map(
        (value) => sum.coefficients[index] * value,
      );
      requireProof(values.length > 0, "empty-domain-premise");
      return { lo: Math.min(...values), hi: Math.max(...values) };
    });
    const claim = input.conclusion;
    if (claim.kind === "false") {
      const lo = bounds.reduce((total, bound) => total + bound.lo, 0);
      const hi = bounds.reduce((total, bound) => total + bound.hi, 0);
      requireProof(lo > sum.total || hi < sum.total, "linear-sum-not-contradictory");
      return derived(input, context);
    }
    requireProof(
      claim.kind === "literal" && !claim.value.positive && validLiteral(claim.value, context),
      "expected-negative-literal",
    );
    const target = sum.cells.indexOf(claim.value.cell);
    requireProof(target >= 0, "target-outside-sum");
    const mask = defined(domains.get(claim.value.cell), "domain");
    requireProof((mask & symbolMask(claim.value.symbol)) !== 0, "target-already-absent");
    const weighted =
      sum.coefficients[target] * symbolValue(context.view.assembly.problem, claim.value.symbol);
    const othersLo = bounds.reduce(
      (total, bound, index) => (index === target ? total : total + bound.lo),
      0,
    );
    const othersHi = bounds.reduce(
      (total, bound, index) => (index === target ? total : total + bound.hi),
      0,
    );
    requireProof(
      weighted + othersLo > sum.total || weighted + othersHi < sum.total,
      "linear-sum-not-excluded",
    );
    return derived(input, context);
  }
}

/**
 * Lemma LC. Multiplying each cited sum by +1 or -1 and adding coefficient-wise
 * yields another valid equation over the union of their cells; cells whose
 * coefficients cancel drop out. Cancellation inside one node is what keeps the
 * innies/outies residual small: house + house - cages leaves only the cells the
 * cages do not cover. A residual with no cells and a nonzero total is false.
 */
export class LinearCombineStrategy {
  readonly id = "linear-combine@1";
  check(input: PrimitiveInput, context: CheckContext): CheckedInference {
    const parameters = input.parameters as { multipliers?: unknown } | null;
    const multipliers = parameters?.multipliers;
    requireProof(
      Array.isArray(multipliers) &&
        sameValue(input.parameters, { multipliers }) &&
        multipliers.length === input.premises.length &&
        multipliers.every((multiplier) => multiplier === 1 || multiplier === -1),
      "invalid-linear-combine-multipliers",
    );
    requireProof(
      input.premises.length >= 2 && input.premises.length <= M2_ROOT_LIMITS.sumCombinePremises,
      "linear-combine-premise-count",
    );
    const sums = retainedPremises(input, context);
    requireProof(sums.every(isSum), "expected-sum");
    const coefficients = new Map<number, number>();
    let total = 0;
    sums.forEach((sum, index) => {
      const multiplier = multipliers[index] as number;
      total += multiplier * sum.total;
      sum.cells.forEach((cell, position) => {
        coefficients.set(
          cell,
          (coefficients.get(cell) ?? 0) + multiplier * sum.coefficients[position],
        );
      });
    });
    const cells = [...coefficients]
      .filter(([, coefficient]) => coefficient !== 0)
      .map(([cell]) => cell)
      .sort((left, right) => left - right);
    const claim = input.conclusion;
    if (cells.length === 0) {
      requireProof(claim.kind === "false" && total !== 0, "linear-combine-trivial");
      return derived(input, context);
    }
    requireProof(
      cells.length <= M2_ROOT_LIMITS.sumCells &&
        cells.every(
          (cell) =>
            Math.abs(defined(coefficients.get(cell), "coefficient")) <=
            M2_ROOT_LIMITS.sumCoefficient,
        ),
      "linear-combine-out-of-profile",
    );
    requireProof(
      sameValue(claim, {
        kind: "sum",
        cells,
        coefficients: cells.map((cell) => defined(coefficients.get(cell), "coefficient")),
        total,
      }),
      "invalid-linear-combination",
    );
    return derived(input, context);
  }
}
