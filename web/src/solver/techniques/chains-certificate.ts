import {matchingFacts} from "../state/source-index";
import type { Json } from "../problem";
import type { Literal, Proposition, ReadView } from "../state/types";
import type { DeductionProposal, Effect, Limits } from "../proof/types";
import { clause, literals } from "../proof/primitives";
import { PatternBuilder, type PatternGraph } from "./pattern-runtime";

/** An event means OR of all its members. ALS events deliberately have no group-size cap. */
export interface ChainEvent { members: Literal[]; als: number[] | null }
export type StrongSource = { kind: "cell"; cell: number } | { kind: "house"; house: string; symbol: number }
  | { kind: "proved-cover"; source: number; house: string; symbol: number }
  | { kind: "als"; cells: number[]; house: string; symbols: number[] };
export interface ChainLink { kind: "strong" | "weak"; source: StrongSource | null; roots: number[] }
export interface ChainPattern {
  kind: "chain"; alias: string; vertices: ChainEvent[]; links: ChainLink[];
  closed: boolean; polarity: "on" | "off" | null; inferenceLinks: number;
  /** Continuous loops select one weak edge to strengthen for each effect. */
  cuts: number[];
}
export const candidate = (cell: number, symbol: number): Literal => ({ cell, symbol, positive: true });
export const literalKey = (l: Literal): string => `${l.cell}:${l.symbol}`;
export const eventKey = (e: ChainEvent): string => `${e.als ? `als:${e.als.join()}:` : ""}${e.members.map(literalKey).join("/")}`;
export type ChainWork = { kind: "work"; units: number };

/** Match the checker's wire caps before a detector publishes an inadmissible proposal. */
export function chainProofFits(proposal: DeductionProposal, limits: Limits): boolean {
  if (proposal.proof.nodes.length > Math.min(limits.stepNodes, 16384)) return false;
  const encoder = new TextEncoder();
  const header = encoder.encode(JSON.stringify({ ...proposal, proof: { ...proposal.proof, nodes: [] } })).length;
  if (header > 32768) return false;
  let bytes = header + Math.max(0, proposal.proof.nodes.length - 1);
  for (const node of proposal.proof.nodes) {
    const size = encoder.encode(JSON.stringify(node)).length; if (size > 16384) return false;
    bytes += size; if (bytes > limits.stepBytes) return false;
  }
  return bytes <= limits.stepBytes;
}

/** Untrusted algebra compiler. Primitive admission, named geometry and lineage are separate. */
export class ChainCertificate extends PatternBuilder {
  /** Lexical scopes are used only by the explicitly bounded coloring case tree. */
  scope: number[] = [];
  constructor(view: ReadView, graph: PatternGraph) { super(view, graph); }
  override add(rule: string, premises: number[], conclusion: Proposition, parameters: Json = {}): number {
    const key = JSON.stringify([rule, premises, conclusion, parameters, this.scope]), old = this.memo.get(key);
    if (old !== undefined) return old;
    this.graph.compilation!.grow(1, 2048 + JSON.stringify(conclusion).length * 4 + premises.length * 16);
    const id = this.next++; premises.filter(id => this.view.facts.has(id)).forEach(id => this.imports.add(id));
    this.nodes.push({ id, rule, premises, conclusion, parameters, scope: [...this.scope] });
    this.values.set(id, conclusion); this.memo.set(key, id); return id;
  }

  *strong(source: StrongSource, members: Literal[]): Generator<ChainWork, number> {
    yield { kind: "work", units: 1 };
    if (source.kind === "cell") return this.cell(source.cell);
    if (source.kind === "house") return this.house(source.house, source.symbol);
    if (source.kind === "proved-cover") {
      const fact = this.view.facts.get(source.source)!.proposition;
      if (fact.kind !== "cover") throw Error("missing-proved-cover");
      const cells = fact.cells.filter(c => this.view.state.domains[c] & (1 << (source.symbol - 1)));
      const support = this.add("support@1", [source.source, ...fact.cells.map(c => this.view.state.domainFacts[c])], { kind: "cover", symbol: source.symbol, cells });
      return this.add("cover-clause@1", [support], clause(cells.map(c => candidate(c, source.symbol))));
    }
    const house = this.view.assembly.allDifferent.find(h => h.id === source.house)!;
    const fact = matchingFacts(this.view,{kind:"all-different",cells:house.cells}).find(f=>!f.openAssumptions.length)!;
    const subset = this.add("all-different-subset@1", [fact.id], { kind: "all-different", cells: source.cells });
    const premises = [...source.cells.map(c => this.view.state.domainFacts[c]), subset];
    const recurse = function*(this: ChainCertificate, box: number[]): Generator<ChainWork, { id: number; count: number }> {
      yield { kind: "work", units: 1 };
      const choices = box.map(mask => this.view.assembly.problem.symbols.filter(s => mask & (1 << (s - 1))));
      if (choices.reduce((n, xs) => n * xs.length, 1) > 256) {
        const at = choices.findIndex(xs => xs.length > 1), left = [...box], right = [...box];
        left[at] = 1 << (choices[at][0] - 1); right[at] &= ~left[at];
        const a = yield* recurse.call(this, left), b = yield* recurse.call(this, right), count = a.count + b.count;
        return { id: this.add("table-union@1", [a.id, b.id], { kind: "table", cells: source.cells, count, definition: this.next }), count };
      }
      let count = 0;
      const walk = function*(tuple: number[]): Generator<ChainWork> {
        yield { kind: "work", units: 1 };
        if (tuple.length === choices.length) { if (new Set(tuple).size === tuple.length) count++; return; }
        for (const symbol of choices[tuple.length]) yield* walk([...tuple, symbol]);
      };
      yield* walk([]);
      return { id: this.add("table-filter@1", premises, { kind: "table", cells: source.cells, count, definition: this.next },
        { cells: source.cells, box }), count };
    };
    const table = yield* recurse.call(this, source.cells.map(c => this.view.state.domains[c]));
    return this.add("table-project@1", [table.id], clause(members));
  }

  /** Complete binary partition eliminator; every intermediate operation yields. */
  *derive(sources: number[], target: Literal): Generator<ChainWork, number> {
    let active = [...new Set(sources)];
    const variables = [...new Set(active.flatMap(id => literals(this.values.get(id)!).map(literalKey)))].filter(k => k !== literalKey(target));
    for (const variable of variables) {
      const plus: number[] = [], minus: number[] = [], rest: number[] = [];
      for (const id of active) {
        yield { kind: "work", units: 1 };
        const terms = literals(this.values.get(id)!);
        if (terms.some(l => literalKey(l) === variable && l.positive)) plus.push(id);
        else if (terms.some(l => literalKey(l) === variable && !l.positive)) minus.push(id);
        else rest.push(id);
      }
      const seen = new Set(rest.map(id => JSON.stringify(this.values.get(id))));
      for (const a of plus) for (const b of minus) {
        yield { kind: "work", units: 1 };
        const pivot = literals(this.values.get(a)!).find(l => literalKey(l) === variable)!;
        const terms = [...literals(this.values.get(a)!), ...literals(this.values.get(b)!)].filter(l => literalKey(l) !== variable);
        if (terms.some(l => terms.some(r => literalKey(r) === literalKey(l) && r.positive !== l.positive))) continue;
        const key = JSON.stringify(clause(terms)); if (seen.has(key)) continue; seen.add(key);
        rest.push(this.resolve(a, b, pivot));
      }
      active = rest;
    }
    const expected = JSON.stringify(clause([target])), result = active.find(id => JSON.stringify(this.values.get(id)) === expected);
    if (result === undefined) throw Error("unproductive-chain-certificate");
    return result;
  }

  /** Keep a complete named certificate reachable, while projections retain exact identity. */
  package(sources: number[]): number[] {
    if (!sources.length) return [];
    const unique = [...new Set(sources)];
    if (unique.length !== sources.length) { const packaged = this.package(unique); return sources.map(id => packaged[unique.indexOf(id)]); }
    // Carry one small clause through binary packages. A growing nested `and`
    // proposition would exceed the wire's per-node byte cap on large components.
    let carrier = sources[0];
    for (const source of sources.slice(1)) {
      const pair = this.add("conjunction@1", [carrier, source], { kind: "and", terms: [this.values.get(carrier)!, this.values.get(source)!] });
      carrier = this.add("conjunction@1", [pair], this.values.get(carrier)!, { index: 0 });
    }
    return sources.map((source, index) => {
      if (!index) return carrier;
      const pair = this.add("conjunction@1", [carrier, source], { kind: "and", terms: [this.values.get(carrier)!, this.values.get(source)!] });
      return this.add("conjunction@1", [pair], this.values.get(source)!, { index: 1 });
    });
  }

  /** Domain closure honors positive placements; prune only algebra branches unused by any result. */
  close(technique: string, pattern: Json, effects: Effect[], roots: number[]): DeductionProposal {
    const domains = new Map<number, { id: number; mask: number }>();
    effects.forEach((e, i) => {
      const prior = domains.get(e.cell) ?? { id: this.view.state.domainFacts[e.cell], mask: this.view.state.domains[e.cell] };
      const mask = e.kind === "place" ? 1 << (e.symbol - 1) : prior.mask & ~(1 << (e.symbol - 1));
      domains.set(e.cell, { id: this.add("domain-restrict@1", [prior.id, roots[i]], { kind: "domain", cell: e.cell, mask }), mask });
    });
    const end = [...new Set([...roots, ...[...domains.values()].map(d => d.id)])];
    const byId = new Map(this.nodes.map(n => [n.id, n])), needed = new Set<number>(), pending = [...end];
    while (pending.length) { const id = pending.pop()!; if (needed.has(id)) continue; needed.add(id); pending.push(...(byId.get(id)?.premises ?? [])); }
    return { technique, state: this.view.state.key, pattern, effects, proof: { state: this.view.state.key,
      nodes: this.nodes.filter(n => needed.has(n.id)), imports: [...needed].filter(id => this.view.facts.has(id)).sort((a, b) => a - b), roots: end } };
  }
}

/** Compile all declared edge clauses before deriving any effect. No graph edge is an axiom. */
export function* compileChain(view: ReadView, graph: PatternGraph, input: ChainPattern, effects: Effect[]): Generator<ChainWork, DeductionProposal> {
  const b = new ChainCertificate(view, graph), p = structuredClone(input);
  for (let i = 0; i < p.links.length; i++) {
    const a = p.vertices[i].members, next = p.vertices[(i + 1) % p.vertices.length].members, link = p.links[i];
    link.roots = [];
    if (link.kind === "strong") link.roots.push(yield* b.strong(link.source!, [...a, ...next]));
    else for (const x of a) for (const y of next) link.roots.push(yield* b.weak(x, y));
  }
  const raw = p.links.flatMap(l => l.roots), packaged = b.package(raw), mapped = new Map(raw.map((id, i) => [id, packaged[i]]));
  const roots: number[] = [];
  for (const [i, e] of effects.entries()) {
    const cut = p.cuts[i], ids = p.links.flatMap((l, j) => j === cut ? [] : l.roots.map(id => mapped.get(id)!));
    if (p.polarity === null) {
      const order = p.vertices.map((_, j) => p.closed ? (cut + 1 + j) % p.vertices.length : j);
      const strong = order.slice(0, -1).filter((_, j) => j % 2 === 0).map(at => mapped.get(p.links[at].roots[0])!);
      const endpoint = yield* b.path(order.map(at => p.vertices[at].members), strong);
      roots.push(yield* b.eliminate(endpoint, e)); continue;
    } else if (e.cell !== p.vertices[0].members[0].cell || e.symbol !== p.vertices[0].members[0].symbol) {
      const endpoint = p.vertices[0].members[0], positive = yield* b.derive(ids, endpoint);
      roots.push(b.resolve(positive, yield* b.weak(endpoint, candidate(e.cell, e.symbol)), endpoint)); continue;
    }
    roots.push(yield* b.derive(ids, { cell: e.cell, symbol: e.symbol, positive: e.kind === "place" }));
  }
  return b.close(p.alias === "X-Chains" || p.alias === "XY-Chains" || p.alias === "AICs" ? "c16@1" : "c17@1", p as unknown as Json, effects, roots);
}
