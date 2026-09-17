import {
  derived,
  domainAssertion,
  premises,
  requireProof,
  sameValue,
  validLiteral,
} from "./primitives";
import type { CheckContext, CheckedInference, PrimitiveInput, Proposition } from "./types";
import { symbolMask } from "../state/read";

/** Scope reduction preserves exclusion only; it never establishes existence. */
export class AllDifferentSubsetStrategy {
  readonly id = "all-different-subset@1";
  check(input: PrimitiveInput, context: CheckContext): CheckedInference {
    const [source] = premises(input, context, 1),
      claim = input.conclusion;
    requireProof(
      source.kind === "all-different" &&
        claim.kind === "all-different" &&
        claim.cells.length > 0 &&
        claim.cells.every(
          (cell, index) =>
            source.cells.includes(cell) && (index === 0 || cell > claim.cells[index - 1]),
        ) &&
        sameValue(claim, { kind: "all-different", cells: claim.cells }),
      "invalid-all-different-subset",
    );
    return derived(input, context);
  }
}

/** Every scoped cell appears once; a cached support list cannot stand in for evidence. */
export function provedDomains(
  sources: readonly Proposition[],
  cells: readonly number[],
): Map<number, number> {
  const domains = sources.map(domainAssertion);
  requireProof(
    domains.length === cells.length &&
      domains.every(Boolean) &&
      new Set(domains.map((d) => d!.cell)).size === cells.length &&
      domains.every((d) => cells.includes(d!.cell)),
    "incomplete-domain-evidence",
  );
  return new Map(domains.map((d) => [d!.cell, d!.mask]));
}

export class SupportStrategy {
  readonly id = "support@1";
  check(input: PrimitiveInput, context: CheckContext): CheckedInference {
    const [cover, ...sources] = premises(input, context, input.premises.length);
    requireProof(cover?.kind === "cover", "expected-cover");
    const domains = provedDomains(sources, cover.cells);
    const cells = cover.cells.filter(
      (cell) => (domains.get(cell)! & symbolMask(cover.symbol)) !== 0,
    );
    requireProof(
      sameValue(input.conclusion, { kind: "cover", symbol: cover.symbol, cells }),
      "invalid-support",
    );
    return derived(input, context);
  }
}

export class HallStrategy {
  readonly id = "hall@1";
  check(input: PrimitiveInput, context: CheckContext): CheckedInference {
    const [scope, ...sources] = premises(input, context, input.premises.length);
    requireProof(scope?.kind === "all-different" && sources.length > 0, "expected-all-different");
    const domains = sources.map(domainAssertion);
    requireProof(
      domains.every((d) => d && scope.cells.includes(d.cell)) &&
        new Set(domains.map((d) => d!.cell)).size === domains.length,
      "invalid-hall-domains",
    );
    const mask = domains.reduce((mask, d) => mask | d!.mask, 0);
    const size = context.view.assembly.problem.symbols.filter(
      (symbol) => mask & symbolMask(symbol),
    ).length;
    const claim = input.conclusion;
    const valid =
      size < domains.length
        ? sameValue(claim, { kind: "false" })
        : size === domains.length &&
          claim.kind === "literal" &&
          validLiteral(claim.value, context) &&
          sameValue(claim, { kind: "literal", value: claim.value }) &&
          !claim.value.positive &&
          scope.cells.includes(claim.value.cell) &&
          !domains.some((d) => d!.cell === claim.value.cell) &&
          (mask & symbolMask(claim.value.symbol)) !== 0;
    requireProof(valid, "invalid-hall-conclusion");
    return derived(input, context);
  }
}

export interface WeightedPremise {
  readonly premise: number;
  readonly coefficient: number;
}
/** Count-only evidence: negative coefficients require x=0. All other x are
 * nonnegative already, so their domains add no necessary inequality premise.
 * Validate optional evidence too; silently ignoring an extra would hide taint.
 * Keep provedDomains' complete-scope contract for support and other clients.
 */
function countDomains(
  sources: readonly Proposition[],
  coefficients: ReadonlyMap<number, number>,
  symbol: number,
): void {
  const domains = new Map<number, number>();
  for (const source of sources) {
    const domain = domainAssertion(source);
    requireProof(
      domain && coefficients.has(domain.cell) && !domains.has(domain.cell),
      "invalid-count-domain-evidence",
    );
    domains.set(domain.cell, domain.mask);
  }
  for (const [cell, coefficient] of coefficients)
    if (coefficient < 0)
      requireProof(
        domains.has(cell) && !(domains.get(cell)! & symbolMask(symbol)),
        "uncovered-count-incidence",
      );
}
/**
 * Sum weighted covers (at least one) and all-different capacities (at most one).
 * Per-candidate coefficients preserve overlaps. If u-l is nonnegative, then
 * sum((u-l)*x) <= U-L; an individual coefficient exceeding U-L proves not-x.
 */
export class CoverCountStrategy {
  readonly id = "cover-count@1";
  check(input: PrimitiveInput, context: CheckContext): CheckedInference {
    const { symbol, covers, capacities } = input.parameters as unknown as {
      symbol: number;
      covers: WeightedPremise[];
      capacities: WeightedPremise[];
    };
    requireProof(
      context.view.assembly.problem.symbols.includes(symbol) &&
        Array.isArray(covers) &&
        Array.isArray(capacities) &&
        covers.length > 0 &&
        capacities.length > 0 &&
        sameValue(input.parameters, { symbol, covers, capacities }),
      "invalid-count-parameters",
    );
    const cursor = weightedIncidences(input, context, symbol, covers, capacities);
    let computed: { coefficients: Map<number, number>; bound: number; domainIds: Set<number> };
    while (true) {
      const next = cursor.next();
      if (next.done) {
        computed = next.value;
        break;
      }
    }
    const { coefficients, bound, domainIds } = computed as {
      coefficients: Map<number, number>;
      bound: number;
      domainIds: Set<number>;
    };
    countDomains(
      [...domainIds].map((id) => context.retained.get(id)!.conclusion),
      coefficients,
      symbol,
    );
    const claim = input.conclusion;
    requireProof(
      bound < 0
        ? sameValue(claim, { kind: "false" })
        : claim.kind === "literal" &&
            validLiteral(claim.value, context) &&
            sameValue(claim, { kind: "literal", value: claim.value }) &&
            !claim.value.positive &&
            claim.value.symbol === symbol &&
            (coefficients.get(claim.value.cell) ?? 0) > bound,
      "invalid-count-conclusion",
    );
    return derived(input, context);
  }
}

/** Shared arithmetic only: callers retain their distinct conclusion semantics. */
export function* weightedIncidences(
  input: PrimitiveInput,
  context: CheckContext,
  symbol: number,
  covers: readonly WeightedPremise[],
  capacities: readonly WeightedPremise[],
): Generator<number, { coefficients: Map<number, number>; bound: number; domainIds: Set<number> }> {
  const coefficients = new Map<number, number>(),
    domainIds = new Set(input.premises);
  let bound = 0;
  for (const [entries, direction] of [
    [covers, -1],
    [capacities, 1],
  ] as const) {
    requireProof(
      new Set(entries.map((e) => e.premise)).size === entries.length,
      "duplicate-count-premise",
    );
    for (const entry of entries) {
      requireProof(
        Number.isSafeInteger(entry.coefficient) &&
          entry.coefficient > 0 &&
          entry.coefficient <= 81 &&
          sameValue(entry, { premise: entry.premise, coefficient: entry.coefficient }) &&
          input.premises.includes(entry.premise),
        "invalid-count-coefficient",
      );
      const scope = context.retained.get(entry.premise)?.conclusion;
      requireProof(
        scope &&
          (direction === -1
            ? scope.kind === "cover" && scope.symbol === symbol
            : scope.kind === "all-different"),
        "invalid-count-scope",
      );
      requireProof(scope.kind === "cover" || scope.kind === "all-different", "invalid-count-scope");
      bound += direction * entry.coefficient;
      domainIds.delete(entry.premise);
      requireProof(Number.isSafeInteger(bound), "count-integer-overflow");
      for (const cell of scope.cells) {
        coefficients.set(cell, (coefficients.get(cell) ?? 0) + direction * entry.coefficient);
        requireProof(Number.isSafeInteger(coefficients.get(cell)), "count-integer-overflow");
        yield 1;
      }
    }
  }
  return { coefficients, bound, domainIds };
}
