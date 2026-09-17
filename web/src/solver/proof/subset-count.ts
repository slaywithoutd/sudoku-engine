import { derived, domainAssertion, requireProof, sameValue, validLiteral } from "./primitives";
import type { CheckContext, CheckedInference, PrimitiveInput } from "./types";

/** Extended Subset Principle, with exact per-symbol independent occupancy.
 * A forced candidate restricts only its own cell and explicitly cited peers.
 * Summing maxima is an upper bound even when different symbols attain their
 * maxima in incompatible assignments. A sum below the cell count is impossible.
 * No complete Sudoku assignment, new fact issuer or external oracle participates. */
export class SubsetCountChecker {
  readonly id = "subset-count@1";
  *check(input: PrimitiveInput, context: CheckContext): Generator<number, CheckedInference> {
    const p = input.parameters as unknown as {
      cells: number[];
      symbols: number[];
      capacities: number[];
      target: { cell: number; symbol: number };
    };
    requireProof(
      p &&
        sameValue(input.parameters, {
          cells: p.cells,
          symbols: p.symbols,
          capacities: p.capacities,
          target: p.target,
        }) &&
        Array.isArray(p.cells) &&
        p.cells.length >= 1 &&
        p.cells.length <= 12 &&
        p.cells.every(
          (c, i) => context.view.assembly.problem.cells.includes(c) && (!i || c > p.cells[i - 1]),
        ) &&
        p.target &&
        sameValue(p.target, { cell: p.target.cell, symbol: p.target.symbol }) &&
        validLiteral({ ...p.target, positive: true }, context),
      "invalid-subset-count-parameters",
    );
    const sources = input.premises.map((id) => context.retained.get(id)!);
    requireProof(new Set(input.premises).size === sources.length, "duplicate-subset-count-premise");
    const assumption = sources[0];
    requireProof(
      assumption?.rule === "assume@1" &&
        sameValue(assumption.conclusion, {
          kind: "literal",
          value: { ...p.target, positive: true },
        }) &&
        context.currentNode?.scope.includes(assumption.id),
      "missing-subset-count-assumption",
    );
    const local = [...new Set([...p.cells, p.target.cell])].sort((a, b) => a - b),
      domainNodes = sources.slice(1, 1 + local.length);
    requireProof(
      domainNodes.length === local.length &&
        domainNodes.every((node, i) => domainAssertion(node.conclusion)?.cell === local[i]),
      "incomplete-subset-count-domains",
    );
    const domains = new Map(
      domainNodes.map((n) => {
        const d = domainAssertion(n.conclusion)!;
        return [d.cell, d.mask];
      }),
    );
    requireProof(
      domains.get(p.target.cell)! & (1 << (p.target.symbol - 1)),
      "absent-subset-count-target",
    );
    const scopes = sources.slice(1 + local.length).map((n) => n.conclusion);
    requireProof(
      scopes.length >= 1 &&
        scopes.length <= 4 &&
        scopes.every(
          (s) =>
            s.kind === "all-different" &&
            s.cells.length > 0 &&
            s.cells.every((c) => local.includes(c)),
        ) &&
        new Set(scopes.map((s) => (s.kind === "all-different" ? s.cells.join() : ""))).size ===
          scopes.length,
      "invalid-subset-count-scopes",
    );
    const groups = scopes.map((s) => {
      requireProof(s.kind === "all-different", "invalid-subset-count-scopes");
      return s.cells;
    });
    const union = p.cells.reduce((mask, c) => mask | domains.get(c)!, 0),
      symbols = context.view.assembly.problem.symbols.filter((s) => union & (1 << (s - 1)));
    requireProof(
      symbols.length >= 1 &&
        symbols.length <= 9 &&
        sameValue(p.symbols, symbols) &&
        Array.isArray(p.capacities) &&
        p.capacities.length === symbols.length &&
        p.capacities.every((n) => Number.isSafeInteger(n) && n >= 0 && n <= p.cells.length),
      "incomplete-subset-count-symbols",
    );
    requireProof((context.workspaceRemaining ?? 0) >= 4096, "subset-count-workspace-limit");
    const masks = p.cells.map((c) =>
      c === p.target.cell
        ? 1 << (p.target.symbol - 1)
        : groups.some((g) => g.includes(c) && g.includes(p.target.cell))
          ? domains.get(c)! & ~(1 << (p.target.symbol - 1))
          : domains.get(c)!,
    );
    for (let digit = 0; digit < symbols.length; digit++) {
      let maximum = 0;
      for (let subset = 0; subset < 2 ** p.cells.length; subset++) {
        yield 1;
        let size = 0,
          valid = true;
        for (let i = 0; i < p.cells.length && valid; i++)
          if (subset & (1 << i)) {
            yield 1;
            size++;
            if (!(masks[i] & (1 << (symbols[digit] - 1)))) {
              valid = false;
              break;
            }
            for (let j = 0; j < i; j++)
              if (subset & (1 << j)) {
                yield 1;
                if (groups.some((g) => g.includes(p.cells[i]) && g.includes(p.cells[j]))) {
                  valid = false;
                  break;
                }
              }
          }
        if (valid) maximum = Math.max(maximum, size);
      }
      requireProof(p.capacities[digit] === maximum, "incorrect-subset-count-capacity");
    }
    requireProof(
      p.capacities.reduce((sum, n) => sum + n, 0) < p.cells.length &&
        sameValue(input.conclusion, { kind: "false" }),
      "invalid-subset-count-conclusion",
    );
    return derived(input, context);
  }
}
