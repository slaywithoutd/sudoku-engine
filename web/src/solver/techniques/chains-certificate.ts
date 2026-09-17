import { matchingFacts } from "../state/source-index";
import type { Json } from "../problem";
import type { Literal, Proposition, ReadView } from "../state/types";
import type { DeductionProposal, Effect, Limits } from "../proof/types";
import { clause, literals } from "../proof/primitives";
import { PatternBuilder, type PatternGraph } from "./pattern-runtime";
import { findHouse, symbolMask } from "../state/read";
import { defined } from "../invariants";

/** An event means OR of all its members. ALS events deliberately have no group-size cap. */
export interface ChainEvent {
  members: Literal[];
  als: number[] | null;
}
export type StrongSource =
  | { kind: "cell"; cell: number }
  | { kind: "house"; house: string; symbol: number }
  | { kind: "proved-cover"; source: number; house: string; symbol: number }
  | { kind: "als"; cells: number[]; house: string; symbols: number[] };
export interface ChainLink {
  kind: "strong" | "weak";
  source: StrongSource | null;
  roots: number[];
}
export interface ChainPattern {
  kind: "chain";
  alias: string;
  vertices: ChainEvent[];
  links: ChainLink[];
  closed: boolean;
  polarity: "on" | "off" | null;
  inferenceLinks: number;
  /** Continuous loops select one weak edge to strengthen for each effect. */
  cuts: number[];
}
export const candidate = (cell: number, symbol: number): Literal => ({
  cell,
  symbol,
  positive: true,
});
export const literalKey = (literal: Literal): string => `${literal.cell}:${literal.symbol}`;
export const eventKey = (e: ChainEvent): string =>
  `${e.als ? `als:${e.als.join()}:` : ""}${e.members.map(literalKey).join("/")}`;
export type ChainWork = { kind: "work"; units: number };

/** Match the checker's wire caps before a detector publishes an inadmissible proposal. */
export function chainProofFits(proposal: DeductionProposal, limits: Limits): boolean {
  if (proposal.proof.nodes.length > Math.min(limits.stepNodes, 16384)) return false;
  const encoder = new TextEncoder();
  const header = encoder.encode(
    JSON.stringify({ ...proposal, proof: { ...proposal.proof, nodes: [] } }),
  ).length;
  if (header > 32768) return false;
  let bytes = header + Math.max(0, proposal.proof.nodes.length - 1);
  for (const node of proposal.proof.nodes) {
    const size = encoder.encode(JSON.stringify(node)).length;
    if (size > 16384) return false;
    bytes += size;
    if (bytes > limits.stepBytes) return false;
  }
  return bytes <= limits.stepBytes;
}

/** Untrusted algebra compiler. Primitive admission, named geometry and lineage are separate. */
export class ChainCertificate extends PatternBuilder {
  /** Lexical scopes are used only by the explicitly bounded coloring case tree. */
  scope: number[] = [];
  constructor(view: ReadView, graph: PatternGraph) {
    super(view, graph);
  }
  override add(
    rule: string,
    premises: number[],
    conclusion: Proposition,
    parameters: Json = {},
  ): number {
    const key = JSON.stringify([rule, premises, conclusion, parameters, this.scope]),
      old = this.memo.get(key);
    if (old !== undefined) return old;
    defined(this.graph.compilation, "compilation").grow(
      1,
      2048 + JSON.stringify(conclusion).length * 4 + premises.length * 16,
    );
    const id = this.next++;
    premises.filter((id) => this.view.facts.has(id)).forEach((id) => this.imports.add(id));
    this.nodes.push({ id, rule, premises, conclusion, parameters, scope: [...this.scope] });
    this.values.set(id, conclusion);
    this.memo.set(key, id);
    return id;
  }

  *strong(source: StrongSource, members: Literal[]): Generator<ChainWork, number> {
    yield { kind: "work", units: 1 };
    if (source.kind === "cell") return this.cell(source.cell);
    if (source.kind === "house") return this.house(source.house, source.symbol);
    if (source.kind === "proved-cover") {
      const proposition = defined(this.view.facts.get(source.source), "fact").proposition;
      if (proposition.kind !== "cover") throw Error("missing-proved-cover");
      const cells = proposition.cells.filter(
        (cell) => this.view.state.domains[cell] & symbolMask(source.symbol),
      );
      const support = this.add(
        "support@1",
        [source.source, ...proposition.cells.map((cell) => this.view.state.domainFacts[cell])],
        { kind: "cover", symbol: source.symbol, cells },
      );
      return this.add(
        "cover-clause@1",
        [support],
        clause(cells.map((cell) => candidate(cell, source.symbol))),
      );
    }
    const house = defined(findHouse(this.view, source.house), "findHouse");
    const fact = defined(
      matchingFacts(this.view, { kind: "all-different", cells: house.cells }).find(
        (f) => !f.openAssumptions.length,
      ),
      "find",
    );
    const subset = this.add("all-different-subset@1", [fact.id], {
      kind: "all-different",
      cells: source.cells,
    });
    const premises = [...source.cells.map((cell) => this.view.state.domainFacts[cell]), subset];
    const recurse = function* (
      this: ChainCertificate,
      box: number[],
    ): Generator<ChainWork, { id: number; count: number }> {
      yield { kind: "work", units: 1 };
      const choices = box.map((mask) =>
        this.view.assembly.problem.symbols.filter((symbol) => mask & symbolMask(symbol)),
      );
      if (choices.reduce((n, xs) => n * xs.length, 1) > 256) {
        const at = choices.findIndex((xs) => xs.length > 1),
          left = [...box],
          right = [...box];
        left[at] = symbolMask(choices[at][0]);
        right[at] &= ~left[at];
        const a = yield* recurse.call(this, left),
          b = yield* recurse.call(this, right),
          count = a.count + b.count;
        return {
          id: this.add("table-union@1", [a.id, b.id], {
            kind: "table",
            cells: source.cells,
            count,
            definition: this.next,
          }),
          count,
        };
      }
      let count = 0;
      const walk = function* (tuple: number[]): Generator<ChainWork> {
        yield { kind: "work", units: 1 };
        if (tuple.length === choices.length) {
          if (new Set(tuple).size === tuple.length) count++;
          return;
        }
        for (const symbol of choices[tuple.length]) yield* walk([...tuple, symbol]);
      };
      yield* walk([]);
      return {
        id: this.add(
          "table-filter@1",
          premises,
          { kind: "table", cells: source.cells, count, definition: this.next },
          { cells: source.cells, box },
        ),
        count,
      };
    };
    const table = yield* recurse.call(
      this,
      source.cells.map((cell) => this.view.state.domains[cell]),
    );
    return this.add("table-project@1", [table.id], clause(members));
  }

  /** Complete binary partition eliminator; every intermediate operation yields. */
  *derive(sources: number[], target: Literal): Generator<ChainWork, number> {
    let active = [...new Set(sources)];
    const variables = [
      ...new Set(
        active.flatMap((id) => literals(defined(this.values.get(id), "value")).map(literalKey)),
      ),
    ].filter((k) => k !== literalKey(target));
    for (const variable of variables) {
      const plus: number[] = [],
        minus: number[] = [],
        rest: number[] = [];
      for (const id of active) {
        yield { kind: "work", units: 1 };
        const terms = literals(defined(this.values.get(id), "value"));
        if (terms.some((literal) => literalKey(literal) === variable && literal.positive))
          plus.push(id);
        else if (terms.some((literal) => literalKey(literal) === variable && !literal.positive))
          minus.push(id);
        else rest.push(id);
      }
      const seen = new Set(rest.map((id) => JSON.stringify(this.values.get(id))));
      for (const left of plus)
        for (const right of minus) {
          yield { kind: "work", units: 1 };
          const pivot = defined(
            literals(defined(this.values.get(left), "value")).find(
              (literal) => literalKey(literal) === variable,
            ),
            "find",
          );
          const terms = [
            ...literals(defined(this.values.get(left), "value")),
            ...literals(defined(this.values.get(right), "value")),
          ].filter((literal) => literalKey(literal) !== variable);
          if (
            terms.some((literal) =>
              terms.some(
                (r) => literalKey(r) === literalKey(literal) && r.positive !== literal.positive,
              ),
            )
          )
            continue;
          const key = JSON.stringify(clause(terms));
          if (seen.has(key)) continue;
          seen.add(key);
          rest.push(this.resolve(left, right, pivot));
        }
      active = rest;
    }
    const expected = JSON.stringify(clause([target])),
      result = active.find((id) => JSON.stringify(this.values.get(id)) === expected);
    if (result === undefined) throw Error("unproductive-chain-certificate");
    return result;
  }

  /** Keep a complete named certificate reachable, while projections retain exact identity. */
  package(sources: number[]): number[] {
    if (!sources.length) return [];
    const unique = [...new Set(sources)];
    if (unique.length !== sources.length) {
      const packaged = this.package(unique);
      return sources.map((id) => packaged[unique.indexOf(id)]);
    }
    // Carry one small clause through binary packages. A growing nested `and`
    // proposition would exceed the wire's per-node byte cap on large components.
    let carrier = sources[0];
    for (const source of sources.slice(1)) {
      const pair = this.add("conjunction@1", [carrier, source], {
        kind: "and",
        terms: [
          defined(this.values.get(carrier), "value"),
          defined(this.values.get(source), "value"),
        ],
      });
      carrier = this.add("conjunction@1", [pair], defined(this.values.get(carrier), "value"), {
        index: 0,
      });
    }
    return sources.map((source, index) => {
      if (!index) return carrier;
      const pair = this.add("conjunction@1", [carrier, source], {
        kind: "and",
        terms: [
          defined(this.values.get(carrier), "value"),
          defined(this.values.get(source), "value"),
        ],
      });
      return this.add("conjunction@1", [pair], defined(this.values.get(source), "value"), {
        index: 1,
      });
    });
  }

  /** Domain closure honors positive placements; prune only algebra branches unused by any result. */
  close(technique: string, pattern: Json, effects: Effect[], roots: number[]): DeductionProposal {
    const domains = new Map<number, { id: number; mask: number }>();
    effects.forEach((effect, i) => {
      const prior = domains.get(effect.cell) ?? {
        id: this.view.state.domainFacts[effect.cell],
        mask: this.view.state.domains[effect.cell],
      };
      const mask =
        effect.kind === "place"
          ? symbolMask(effect.symbol)
          : prior.mask & ~symbolMask(effect.symbol);
      domains.set(effect.cell, {
        id: this.add("domain-restrict@1", [prior.id, roots[i]], {
          kind: "domain",
          cell: effect.cell,
          mask,
        }),
        mask,
      });
    });
    const end = [...new Set([...roots, ...[...domains.values()].map((domain) => domain.id)])];
    const byId = new Map(this.nodes.map((n) => [n.id, n])),
      needed = new Set<number>(),
      pending = [...end];
    while (pending.length) {
      const id = defined(pending.pop(), "pending");
      if (needed.has(id)) continue;
      needed.add(id);
      pending.push(...(byId.get(id)?.premises ?? []));
    }
    return {
      technique,
      state: this.view.state.key,
      pattern,
      effects,
      proof: {
        state: this.view.state.key,
        nodes: this.nodes.filter((n) => needed.has(n.id)),
        imports: [...needed]
          .filter((id) => this.view.facts.has(id))
          .sort((left, right) => left - right),
        roots: end,
      },
    };
  }
}

/** Compile all declared edge clauses before deriving any effect. No graph edge is an axiom. */
export function* compileChain(
  view: ReadView,
  graph: PatternGraph,
  input: ChainPattern,
  effects: Effect[],
): Generator<ChainWork, DeductionProposal> {
  const certificate = new ChainCertificate(view, graph),
    pattern = structuredClone(input);
  for (let i = 0; i < pattern.links.length; i++) {
    const left = pattern.vertices[i].members,
      next = pattern.vertices[(i + 1) % pattern.vertices.length].members,
      link = pattern.links[i];
    link.roots = [];
    if (link.kind === "strong")
      link.roots.push(
        yield* certificate.strong(defined(link.source, "source"), [...left, ...next]),
      );
    else for (const x of left) for (const y of next) link.roots.push(yield* certificate.weak(x, y));
  }
  const raw = pattern.links.flatMap((link) => link.roots),
    packaged = certificate.package(raw),
    mapped = new Map(raw.map((id, i) => [id, packaged[i]]));
  const roots: number[] = [];
  for (const [i, effect] of effects.entries()) {
    const cut = pattern.cuts[i],
      ids = pattern.links.flatMap((link, j) =>
        j === cut ? [] : link.roots.map((id) => defined(mapped.get(id), "mapped")),
      );
    if (pattern.polarity === null) {
      const order = pattern.vertices.map((_, j) =>
        pattern.closed ? (cut + 1 + j) % pattern.vertices.length : j,
      );
      const strong = order
        .slice(0, -1)
        .filter((_, j) => j % 2 === 0)
        .map((at) => defined(mapped.get(pattern.links[at].roots[0]), "mapped"));
      const endpoint = yield* certificate.path(
        order.map((at) => pattern.vertices[at].members),
        strong,
      );
      roots.push(yield* certificate.eliminate(endpoint, effect));
      continue;
    } else if (
      effect.cell !== pattern.vertices[0].members[0].cell ||
      effect.symbol !== pattern.vertices[0].members[0].symbol
    ) {
      const endpoint = pattern.vertices[0].members[0],
        positive = yield* certificate.derive(ids, endpoint);
      roots.push(
        certificate.resolve(
          positive,
          yield* certificate.weak(endpoint, candidate(effect.cell, effect.symbol)),
          endpoint,
        ),
      );
      continue;
    }
    roots.push(
      yield* certificate.derive(ids, {
        cell: effect.cell,
        symbol: effect.symbol,
        positive: effect.kind === "place",
      }),
    );
  }
  return certificate.close(
    pattern.alias === "X-Chains" || pattern.alias === "XY-Chains" || pattern.alias === "AICs"
      ? "c16@1"
      : "c17@1",
    pattern as unknown as Json,
    effects,
    roots,
  );
}
