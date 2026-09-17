import { derived, domainAssertion, requireProof, sameValue, validLiteral } from "./primitives";
import type { CheckContext, CheckedInference, PrimitiveInput } from "./types";
import { symbolMask } from "../state/read";
import { defined } from "../invariants";

/** Extended Subset Principle, with exact per-symbol independent occupancy.
 * A forced candidate restricts only its own cell and explicitly cited peers.
 * Summing maxima is an upper bound even when different symbols attain their
 * maxima in incompatible assignments. A sum below the cell count is impossible.
 * No complete Sudoku assignment, new fact issuer or external oracle participates. */
export class SubsetCountChecker {
  readonly id = "subset-count@1";
  *check(input: PrimitiveInput, context: CheckContext): Generator<number, CheckedInference> {
    const pattern = input.parameters as unknown as
      | {
          cells: number[];
          symbols: number[];
          capacities: number[];
          target?: { cell: number; symbol: number };
        }
      | undefined;
    requireProof(
      pattern &&
        sameValue(input.parameters, {
          cells: pattern.cells,
          symbols: pattern.symbols,
          capacities: pattern.capacities,
          target: pattern.target,
        }) &&
        Array.isArray(pattern.cells) &&
        pattern.cells.length >= 1 &&
        pattern.cells.length <= 12 &&
        pattern.cells.every(
          (cell, i) =>
            context.view.assembly.problem.cells.includes(cell) &&
            (!i || cell > pattern.cells[i - 1]),
        ) &&
        pattern.target &&
        sameValue(pattern.target, { cell: pattern.target.cell, symbol: pattern.target.symbol }) &&
        validLiteral({ ...pattern.target, positive: true }, context),
      "invalid-subset-count-parameters",
    );
    const sources = input.premises.map((id) => defined(context.retained.get(id), "retained"));
    requireProof(new Set(input.premises).size === sources.length, "duplicate-subset-count-premise");
    const assumption = sources.at(0);
    requireProof(
      assumption?.rule === "assume@1" &&
        sameValue(assumption.conclusion, {
          kind: "literal",
          value: { ...pattern.target, positive: true },
        }) &&
        context.currentNode?.scope.includes(assumption.id),
      "missing-subset-count-assumption",
    );
    const local = [...new Set([...pattern.cells, pattern.target.cell])].sort(
        (left, right) => left - right,
      ),
      domainNodes = sources.slice(1, 1 + local.length);
    requireProof(
      domainNodes.length === local.length &&
        domainNodes.every((node, i) => domainAssertion(node.conclusion)?.cell === local[i]),
      "incomplete-subset-count-domains",
    );
    const domains = new Map(
      domainNodes.map((n) => {
        const domain = defined(domainAssertion(n.conclusion), "domainAssertion");
        return [domain.cell, domain.mask];
      }),
    );
    requireProof(
      defined(domains.get(pattern.target.cell), "domain") & symbolMask(pattern.target.symbol),
      "absent-subset-count-target",
    );
    const scopes = sources.slice(1 + local.length).map((n) => n.conclusion);
    requireProof(
      scopes.length >= 1 &&
        scopes.length <= 4 &&
        scopes.every(
          (scope) =>
            scope.kind === "all-different" &&
            scope.cells.length > 0 &&
            scope.cells.every((cell) => local.includes(cell)),
        ) &&
        new Set(scopes.map((scope) => (scope.kind === "all-different" ? scope.cells.join() : "")))
          .size === scopes.length,
      "invalid-subset-count-scopes",
    );
    const groups = scopes.map((scope) => {
      requireProof(scope.kind === "all-different", "invalid-subset-count-scopes");
      return scope.cells;
    });
    const union = pattern.cells.reduce(
        (mask, cell) => mask | defined(domains.get(cell), "domain"),
        0,
      ),
      symbols = context.view.assembly.problem.symbols.filter(
        (symbol) => union & symbolMask(symbol),
      );
    requireProof(
      symbols.length >= 1 &&
        symbols.length <= 9 &&
        sameValue(pattern.symbols, symbols) &&
        Array.isArray(pattern.capacities) &&
        pattern.capacities.length === symbols.length &&
        pattern.capacities.every(
          (n) => Number.isSafeInteger(n) && n >= 0 && n <= pattern.cells.length,
        ),
      "incomplete-subset-count-symbols",
    );
    requireProof((context.workspaceRemaining ?? 0) >= 4096, "subset-count-workspace-limit");
    const target = pattern.target;
    const masks = pattern.cells.map((cell) =>
      cell === target.cell
        ? symbolMask(target.symbol)
        : groups.some((group) => group.includes(cell) && group.includes(target.cell))
          ? defined(domains.get(cell), "domain") & ~symbolMask(target.symbol)
          : defined(domains.get(cell), "domain"),
    );
    for (let digit = 0; digit < symbols.length; digit++) {
      let maximum = 0;
      for (let subset = 0; subset < 2 ** pattern.cells.length; subset++) {
        yield 1;
        let size = 0,
          valid = true;
        for (let i = 0; i < pattern.cells.length && valid; i++)
          if (subset & (1 << i)) {
            yield 1;
            size++;
            if (!(masks[i] & symbolMask(symbols[digit]))) {
              valid = false;
              break;
            }
            for (let j = 0; j < i; j++)
              if (subset & (1 << j)) {
                yield 1;
                if (
                  groups.some(
                    (group) => group.includes(pattern.cells[i]) && group.includes(pattern.cells[j]),
                  )
                ) {
                  valid = false;
                  break;
                }
              }
          }
        if (valid) maximum = Math.max(maximum, size);
      }
      requireProof(pattern.capacities[digit] === maximum, "incorrect-subset-count-capacity");
    }
    requireProof(
      pattern.capacities.reduce((sum, n) => sum + n, 0) < pattern.cells.length &&
        sameValue(input.conclusion, { kind: "false" }),
      "invalid-subset-count-conclusion",
    );
    return derived(input, context);
  }
}
