import type { Json } from "../../src/solver/problem";
import type { DeductionProposal, Effect, Literal, Proposition } from "../../src/solver/proof/types";
import type { ChainPattern, StrongSource } from "../../src/solver/techniques/chains-certificate";
import type { ColoringPattern } from "../../src/solver/techniques/coloring";
import { fixtureView, type TechniqueFixture } from "./acceptance";
import { FixtureProof } from "./short-pattern-acceptance";
import c14 from "./fixtures/C14.json";
import c15 from "./fixtures/C15.json";
import c16 from "./fixtures/C16.json";
import c17 from "./fixtures/C17.json";

export const chainFixtures = [...c14, ...c15, ...c16, ...c17] as unknown as TechniqueFixture[];
export const chainFixture = (id: string): TechniqueFixture => structuredClone(chainFixtures.find(f => f.id === id)!);
const term = (pair: number[]): Literal => ({ cell: pair[0], symbol: pair[1], positive: true });
const sees = (a: Literal, b: Literal): boolean => a.cell === b.cell ? a.symbol !== b.symbol : a.symbol === b.symbol &&
  (Math.floor(a.cell / 9) === Math.floor(b.cell / 9) || a.cell % 9 === b.cell % 9 ||
    Math.floor(a.cell / 27) === Math.floor(b.cell / 27) && Math.floor(a.cell % 9 / 3) === Math.floor(b.cell % 9 / 3));

/** Test-only algebra authored independently of production compiler, grammar and graph indexes. */
export class IndependentChainProof extends FixtureProof {
  lexicalScope: number[] = [];
  override add(rule: string, premises: number[], conclusion: Proposition, parameters: Json = {}) {
    const signature = JSON.stringify([rule, premises, conclusion, parameters, this.lexicalScope]), old = this.memo.get(signature);
    if (old !== undefined) return old;
    const id = this.next++; this.nodes.push({ id, rule, premises, conclusion, parameters, scope: [...this.lexicalScope] }); this.memo.set(signature, id); return id;
  }
  package(ids: number[]): number[] {
    const unique = [...new Set(ids)];
    if (unique.length !== ids.length) { const values = this.package(unique); return ids.map(id => values[unique.indexOf(id)]); }
    const levels: { id: number; leaves: number[] }[] = [];
    for (let i = 0; i < ids.length; i += 16) {
      const leaves = ids.slice(i, i + 16), id = this.add("conjunction@1", leaves, { kind: "and", terms: leaves.map(n => this.nodes.find(p => p.id === n)!.conclusion) });
      levels.push({ id, leaves });
    }
    if (levels.length === 1) return ids.map((id, index) => this.add("conjunction@1", [levels[0].id], this.nodes.find(n => n.id === id)!.conclusion, { index }));
    const parents = this.package(levels.map(l => l.id));
    return levels.flatMap((level, i) => level.leaves.map((id, index) => this.add("conjunction@1", [parents[i]], this.nodes.find(n => n.id === id)!.conclusion, { index })));
  }
  infer(ids: number[], target: Literal): number {
    let list = [...new Set(ids)];
    const variables = [...new Set(list.flatMap(id => this.terms(id).map(l => `${l.cell}/${l.symbol}`)))].filter(k => k !== `${target.cell}/${target.symbol}`);
    for (const variable of variables) {
      const positive = list.filter(id => this.terms(id).some(l => `${l.cell}/${l.symbol}` === variable && l.positive));
      const negative = list.filter(id => this.terms(id).some(l => `${l.cell}/${l.symbol}` === variable && !l.positive));
      list = list.filter(id => !this.terms(id).some(l => `${l.cell}/${l.symbol}` === variable));
      for (const a of positive) for (const b of negative) {
        const joined = [...this.terms(a), ...this.terms(b)].filter(l => `${l.cell}/${l.symbol}` !== variable);
        if (joined.some(l => joined.some(r => l.cell === r.cell && l.symbol === r.symbol && l.positive !== r.positive))) continue;
        const conclusion = this.clause(joined);
        if (list.some(id => JSON.stringify(this.nodes.find(n => n.id === id)!.conclusion) === JSON.stringify(conclusion))) continue;
        list.push(this.add("resolution@1", [a, b], conclusion));
      }
    }
    const result = list.find(id => JSON.stringify(this.nodes.find(n => n.id === id)!.conclusion) === JSON.stringify(this.clause([target])));
    if (result === undefined) throw Error("independent-chain-resolution-failed"); return result;
  }
  strong(source: StrongSource, members: Literal[]): number {
    if (source.kind === "cell") return this.cell(source.cell);
    if (source.kind === "house") return this.house(source.house, source.symbol);
    if (source.kind === "proved-cover") {
      const original = this.view.facts.get(source.source)!.proposition;
      if (original.kind !== "cover") throw Error("independent-cover");
      const cells = original.cells.filter(c => Math.floor(this.view.state.domains[c] / 2 ** (source.symbol - 1)) % 2);
      const filtered = this.add("support@1", [source.source, ...original.cells.map(c => this.view.state.domainFacts[c])], { kind: "cover", cells, symbol: source.symbol });
      return this.add("cover-clause@1", [filtered], this.clause(cells.map(cell => ({ cell, symbol: source.symbol, positive: true }))));
    }
    const house = this.view.assembly.allDifferent.find(h => h.id === source.house)!.cells;
    const fact = [...this.view.facts.values()].find(f => f.proposition.kind === "all-different" && JSON.stringify(f.proposition.cells) === JSON.stringify(house))!;
    const subset = this.add("all-different-subset@1", [fact.id], { kind: "all-different", cells: source.cells });
    const premises = source.cells.map(c => this.view.state.domainFacts[c]).concat(subset);
    const fill = (masks: number[]): { id: number; count: number } => {
      const choices = masks.map(m => Array.from({ length: 9 }, (_, i) => i + 1).filter(s => Math.floor(m / 2 ** (s - 1)) % 2));
      if (choices.reduce((n, xs) => n * xs.length, 1) > 256) {
        const at = choices.findIndex(xs => xs.length > 1), left = [...masks], right = [...masks];
        left[at] = 2 ** (choices[at][0] - 1); right[at] -= left[at];
        const a = fill(left), b = fill(right), count = a.count + b.count;
        return { id: this.add("table-union@1", [a.id, b.id], { kind: "table", cells: source.cells, count, definition: this.next }), count };
      }
      let count = 0;
      const walk = (tuple: number[]): void => { if (tuple.length === choices.length) { if (new Set(tuple).size === tuple.length) count++; return; }
        choices[tuple.length].forEach(s => walk([...tuple, s])); }; walk([]);
      return { id: this.add("table-filter@1", premises, { kind: "table", cells: source.cells, count, definition: this.next }, { cells: source.cells, box: masks }), count };
    };
    const table = fill(source.cells.map(c => this.view.state.domains[c]));
    return this.add("table-project@1", [table.id], this.clause(members));
  }
  proposal(row: string, pattern: Json, effects: Effect[], roots: number[]): DeductionProposal {
    const domains = new Map<number, { id: number; mask: number }>();
    effects.forEach((e, i) => { const before = domains.get(e.cell) ?? { id: this.view.state.domainFacts[e.cell], mask: this.view.state.domains[e.cell] };
      const mask = e.kind === "place" ? 2 ** (e.symbol - 1) : before.mask - 2 ** (e.symbol - 1);
      domains.set(e.cell, { mask, id: this.add("domain-restrict@1", [before.id, roots[i]], { kind: "domain", cell: e.cell, mask }) }); });
    const ends = [...new Set(roots.concat([...domains.values()].map(d => d.id)))], needed = new Set<number>(), pending = [...ends];
    while (pending.length) { const id = pending.pop()!; if (needed.has(id)) continue; needed.add(id); pending.push(...(this.nodes.find(n => n.id === id)?.premises ?? [])); }
    return { technique: row.toLowerCase() + "@1", state: this.view.state.key, pattern, effects, proof: { state: this.view.state.key,
      nodes: this.nodes.filter(n => needed.has(n.id)), imports: [...needed].filter(id => this.view.facts.has(id)).sort((a, b) => a - b), roots: ends } };
  }
}

/** Preserve every supplied occurrence and house; infer only omitted serialization fields from original domains. */
export function independentChainCertificate(f: TechniqueFixture): DeductionProposal {
  const view = fixtureView(f), seed = f.expectedPattern as Record<string, any>, b = new IndependentChainProof(view);
  const effects: Effect[] = structuredClone(f.expectedEffects);
  if (f.rowId === "C14" || f.rowId === "C15") {
    const components = seed.components.map((c: any) => ({ colors: c.colors.map((xs: number[][]) => xs.map(term)),
      edges: c.edges.map((e: any) => ({ ends: e.ends.map(term), source: e.source.kind === "cell" ? { kind: "cell", cell: e.source.cell } :
        { kind: "house", house: e.source.id, symbol: e.source.symbol }, roots: [] })) }));
    const p: ColoringPattern = { kind: "coloring", alias: f.alias, form: f.id.includes("multi") ? "multi" : f.id.includes("cell-wrap") ? "cell-wrap" : f.id.includes("wrap") ? "house-wrap" : "trap", components, branches: [] };
    const all: number[] = [];
    for (const component of components) for (const edge of component.edges) {
      edge.roots = [b.strong(edge.source, edge.ends), b.weak(edge.ends[0], edge.ends[1])]; all.push(...edge.roots);
    }
    for (let mask = 0; mask < 2 ** components.length; mask++) {
      const colors = components.map((_: unknown, i: number) => Math.floor(mask / 2 ** (components.length - i - 1)) % 2);
      const assigned: Literal[] = components.flatMap((c: any, i: number) => c.colors[colors[i]]);
      let conflict: [Literal, Literal] | null = null;
      for (let i = 0; i < assigned.length && !conflict; i++) for (let j = i + 1; j < assigned.length; j++) if (sees(assigned[i], assigned[j])) { conflict = [assigned[i], assigned[j]]; break; }
      const witnesses = conflict ? [] : effects.map(e => assigned.find(l => sees(l, { cell: e.cell, symbol: e.symbol, positive: true }))!);
      const roots = conflict ? [b.weak(...conflict)] : witnesses.map((l, i) => b.weak(l, { cell: effects[i].cell, symbol: effects[i].symbol, positive: true }));
      p.branches.push({ colors, conflict, witnesses, roots, proofs: [] }); all.push(...roots);
    }
    const packaged = b.package(all), mapped = new Map(all.map((id, i) => [id, packaged[i]])), roots: number[] = [];
    const visit = (effectIndex: number, choices: number[], known: Map<string, number>): number => {
      const variable = (l: Literal) => `${l.cell}/${l.symbol}`, depth = choices.length, effect = effects[effectIndex];
      const target = b.clause([{ cell: effect.cell, symbol: effect.symbol, positive: false }]);
      if (depth === components.length) {
        const leaf = p.branches.find(branch => JSON.stringify(branch.colors) === JSON.stringify(choices))!;
        const terms = leaf.conflict ?? [leaf.witnesses[effectIndex]];
        let id = mapped.get(leaf.roots[leaf.conflict ? 0 : effectIndex])!;
        for (const literal of terms) id = b.resolve(id, known.get(variable(literal))!, literal.cell, literal.symbol);
        leaf.proofs[effectIndex] = { assumptions: [...b.lexicalScope], root: id }; return id;
      }
      const c = components[depth], edge = c.edges[0], inputs = [mapped.get(edge.roots[0])!];
      const representatives: Literal[] = [...edge.ends].sort((a, b) => a.cell - b.cell || a.symbol - b.symbol);
      for (const representative of representatives) {
        const assumption = b.add("assume@1", [], b.clause([representative])); b.lexicalScope.push(assumption);
        const knownHere = new Map(known), truth = new Map<string, boolean>([[variable(representative), true]]);
        knownHere.set(variable(representative), assumption);
        let changed = true;
        while (changed) {
          changed = false;
          for (const edge of c.edges) for (const [a, next] of [edge.ends, [...edge.ends].reverse()]) {
            if (!truth.has(variable(a)) || truth.has(variable(next))) continue;
            const value = truth.get(variable(a))!, id = b.resolve(mapped.get(edge.roots[value ? 1 : 0])!, knownHere.get(variable(a))!, a.cell, a.symbol);
            truth.set(variable(next), !value); knownHere.set(variable(next), id); changed = true;
          }
        }
        const color = c.colors.findIndex((xs: Literal[]) => xs.some(l => variable(l) === variable(representative)));
        inputs.push(assumption, visit(effectIndex, [...choices, color], knownHere)); b.lexicalScope.pop();
      }
      return b.add("cases@1", inputs, target);
    };
    effects.forEach((_, i) => roots.push(visit(i, [], new Map())));
    return b.proposal(f.rowId, p as unknown as Json, effects, roots);
  }
  const als = seed.als;
  const vertices = als ? [
    { members: als.occurrences[seed.eliminationSymbol].map((cell: number) => term([cell, seed.eliminationSymbol])), als: als.cells },
    { members: als.occurrences[seed.restrictedSymbol].map((cell: number) => term([cell, seed.restrictedSymbol])), als: als.cells },
    { members: [term([seed.outerBivalue, seed.restrictedSymbol])], als: null }, { members: [term([seed.outerBivalue, seed.eliminationSymbol])], als: null },
  ] : seed.vertices.map((v: number[] | number[][]) => ({ members: Array.isArray(v[0]) ? (v as number[][]).map(term) : [term(v as number[])],
    als: seed.alsVisits?.includes(v[0]) ? [v[0]] : null }));
  const names: Record<string, string> = { "X-Chain": "X-Chains", "XY-Chain": "XY-Chains", AIC: "AICs", "Continuous Nice Loop": "Continuous Nice Loops", "Discontinuous Nice Loop": "Discontinuous Nice Loops" };
  const p: ChainPattern = { kind: "chain", alias: names[seed.alias] ?? seed.alias, vertices, links: [], closed: !!seed.closed,
    polarity: seed.polarity ?? null, inferenceLinks: seed.inferenceLinks, cuts: [] };
  let strongIndex = 0;
  for (const [i, kind] of (seed.links ?? ["strong", "weak", "strong"]).entries()) {
    const a = vertices[i].members as Literal[], next = vertices[(i + 1) % vertices.length].members as Literal[];
    let source: StrongSource | null = null; const roots: number[] = [];
    if (kind === "strong") {
      if (als && i === 0) source = { kind: "als", cells: als.cells, house: als.house, symbols: als.symbols };
      else if (a.length === 1 && next.length === 1 && a[0].cell === next[0].cell) source = seed.alsVisits?.includes(a[0].cell) ?
        { kind: "als", cells: [a[0].cell], house: `row:${Math.floor(a[0].cell / 9)}`, symbols: [a[0].symbol, next[0].symbol].sort((a, b) => a - b) } : { kind: "cell", cell: a[0].cell };
      else {
        const symbol = a[0].symbol, members = [...a, ...next].map(l => l.cell).sort((x, y) => x - y);
        const house = seed.strongHouses?.[strongIndex] ?? view.assembly.allDifferent.find(h =>
          JSON.stringify(h.cells.filter(c => Math.floor(view.state.domains[c] / 2 ** (symbol - 1)) % 2)) === JSON.stringify(members))!.id;
        source = { kind: "house", house, symbol };
      }
      roots.push(b.strong(source, [...a, ...next])); strongIndex++;
    } else for (const x of a) for (const y of next) roots.push(b.weak(x, y));
    p.links.push({ kind, source, roots });
  }
  if (p.polarity === "on") {
    const endpoint = vertices[0].members[0];
    for (let cell = 0; cell < 81; cell++) if (!view.state.values[cell] && cell !== endpoint.cell &&
      Math.floor(view.state.domains[cell] / 2 ** (endpoint.symbol - 1)) % 2 && sees(endpoint, term([cell, endpoint.symbol])))
      effects.push({ kind: "remove", cell, symbol: endpoint.symbol });
  }
  const all = p.links.flatMap(l => l.roots), packaged = b.package(all), mapping = new Map(all.map((id, i) => [id, packaged[i]])), roots: number[] = [];
  for (const e of effects) {
    const target = { cell: e.cell, symbol: e.symbol, positive: e.kind === "place" };
    const cut = p.closed && p.polarity === null ? p.links.findIndex((l, i) => l.kind === "weak" &&
      [...vertices[i].members, ...vertices[(i + 1) % vertices.length].members].every((l: Literal) => sees(l, target))) : -1;
    p.cuts.push(cut); const selected = p.links.flatMap((l, i) => i === cut ? [] : l.roots.map(id => mapping.get(id)!));
    if (p.polarity === null) {
      const ends = p.closed ? [vertices[cut], vertices[(cut + 1) % vertices.length]] : [vertices[0], vertices.at(-1)];
      ends.flatMap(v => v.members).forEach(l => selected.push(b.weak(l, { ...target, positive: true })));
    } else if (e.cell !== vertices[0].members[0].cell || e.symbol !== vertices[0].members[0].symbol) {
      const endpoint = vertices[0].members[0], positive = b.infer(selected, endpoint);
      roots.push(b.resolve(positive, b.weak(endpoint, { ...target, positive: true }), endpoint.cell, endpoint.symbol)); continue;
    }
    roots.push(b.infer(selected, target));
  }
  return b.proposal(f.rowId, p as unknown as Json, effects, roots);
}
