import { sourceMaximumId, matchingFacts } from "../state/source-index";
import type { Json } from "../problem";
import type { ReadView, Proposition, Literal } from "../state/types";
import type { DeductionProposal, Effect, ProofNode } from "./types";
import { symbolMask } from "../state/read";

/** Elementary untrusted syntax helpers; they never issue proof authority. */
export function literal(cell: number, symbol: number, positive: boolean): Proposition {
  return { kind: "literal", value: { cell, symbol, positive } };
}
export function proposedClause(values: readonly Literal[]): Proposition {
  const alternatives = [
    ...new Map(
      values.map((value) => [`${value.cell}:${value.symbol}:${value.positive}`, value]),
    ).values(),
  ].sort(
    (left, right) =>
      left.cell - right.cell ||
      left.symbol - right.symbol ||
      Number(left.positive) - Number(right.positive),
  );
  return alternatives.length === 1
    ? { kind: "literal", value: alternatives[0] }
    : alternatives.length === 0
      ? { kind: "false" }
      : { kind: "clause", alternatives };
}

/**
 * Assembles proposed DAG records and imports only. A builder cannot construct a
 * CheckedStep, authenticate a Fact, retain a node, or edit owned candidates.
 * Family checkers independently constrain the entire resulting computation.
 */
export class CertificateBuilder {
  readonly #nodes: ProofNode[] = [];
  readonly #imports = new Set<number>();
  readonly #effects = new Map<string, { effect: Effect; root: number }>();
  readonly #additionalRoots: number[] = [];
  #next: number;
  constructor(readonly view: ReadView) {
    this.#next = sourceMaximumId(view) + 1;
  }
  add(
    rule: string,
    premises: readonly number[],
    conclusion: Proposition,
    parameters: Json = {},
  ): number {
    for (const id of premises) if (this.view.facts.has(id)) this.#imports.add(id);
    const id = this.#next++;
    this.#nodes.push({ id, rule, premises: [...premises], conclusion, parameters, scope: [] });
    return id;
  }
  fact(proposition: Proposition): number {
    const fact = matchingFacts(this.view, proposition).find(
      (candidate) => candidate.openAssumptions.length === 0 && !candidate.conditional,
    );
    if (!fact) throw Error("missing-proposed-premise");
    return fact.root;
  }
  effect(effect: Effect, root: number): void {
    const previous = this.#effects.get(`${effect.kind}:${effect.cell}:${effect.symbol}`);
    if (previous) this.#additionalRoots.push(previous.root);
    this.#effects.set(`${effect.kind}:${effect.cell}:${effect.symbol}`, { effect, root });
  }
  peer(
    source: number,
    sourceCell: number,
    cell: number,
    symbol: number,
    scope: readonly number[],
  ): void {
    const weak = this.add(
      "weak-link@1",
      [this.fact({ kind: "all-different", cells: scope })],
      proposedClause([
        { cell: sourceCell, symbol, positive: false },
        { cell, symbol, positive: false },
      ]),
    );
    const negative = this.add("resolution@1", [weak, source], literal(cell, symbol, false));
    this.effect({ kind: "remove", cell, symbol }, negative);
  }
  place(cell: number, symbol: number, root: number): void {
    this.effect({ kind: "place", cell, symbol }, root);
    const peers = new Map<number, readonly number[]>();
    for (const scope of this.view.assembly.allDifferent)
      if (scope.cells.includes(cell))
        for (const peer of scope.cells)
          if (peer !== cell && !peers.has(peer)) peers.set(peer, scope.cells);
    for (const [peer, scope] of [...peers].sort(([left], [right]) => left - right))
      if (!this.view.state.values[peer] && this.view.state.domains[peer] & symbolMask(symbol))
        this.peer(root, cell, peer, symbol, scope);
  }
  support(symbol: number, cells: readonly number[]): number {
    return this.add(
      "support@1",
      [
        this.fact({ kind: "cover", symbol, cells }),
        ...cells.map((cell) => this.view.state.domainFacts[cell]),
      ],
      {
        kind: "cover",
        symbol,
        cells: cells.filter((cell) => (this.view.state.domains[cell] & symbolMask(symbol)) !== 0),
      },
    );
  }
  finish(technique: string, pattern: Json): DeductionProposal {
    const entries = [...this.#effects.values()].sort(
      (left, right) =>
        left.effect.cell - right.effect.cell ||
        left.effect.symbol - right.effect.symbol ||
        left.effect.kind.localeCompare(right.effect.kind),
    );
    const roots = [...entries.map((entry) => entry.root), ...this.#additionalRoots],
      domains = new Map<number, { id: number; mask: number }>();
    for (const { effect, root } of entries) {
      const prior = domains.get(effect.cell) ?? {
        id: this.view.state.domainFacts[effect.cell],
        mask: this.view.state.domains[effect.cell],
      };
      const bit = symbolMask(effect.symbol),
        mask = effect.kind === "place" ? prior.mask & bit : prior.mask & ~bit;
      domains.set(effect.cell, {
        id: this.add("domain-restrict@1", [prior.id, root], {
          kind: "domain",
          cell: effect.cell,
          mask,
        }),
        mask,
      });
    }
    roots.push(...[...domains.values()].map((domain) => domain.id));
    return {
      technique,
      state: this.view.state.key,
      effects: entries.map((entry) => entry.effect),
      pattern,
      proof: {
        state: this.view.state.key,
        nodes: [...this.#nodes],
        imports: [...this.#imports].sort((left, right) => left - right),
        roots,
      },
    };
  }
}
