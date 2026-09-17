import type { Json } from "../../../src/solver/problem";
import type { Literal, DeductionProposal } from "../../../src/solver/proof/types";
import type { AlsPattern, AlsSet, AlsRoute, BlossomPattern } from "../../../src/solver/techniques/als-certificate";
import { IndependentChainProof } from "../../solver/chains-acceptance";
import { fixtureView, type TechniqueFixture } from "../../solver/acceptance";
import c18 from "../../solver/fixtures/C18.json";
import c19 from "../../solver/fixtures/C19.json";

export const alsFixtures = [...c18, ...c19] as unknown as TechniqueFixture[];
export const productiveAlsFixtures = alsFixtures.filter(f => f.expectation === "productive");
export const alsFixture = (id: string) => structuredClone(alsFixtures.find(f => f.id === id)!);
const candidate = (cell: number, symbol: number): Literal => ({ cell, symbol, positive: true });

/** Independent seed interpreter: uses exact JSON sets and test-only primitive algebra.
 * No production detector, compiler, index or named grammar is a runtime dependency. */
export function independentAlsCertificate(f: TechniqueFixture): DeductionProposal {
  const view = fixtureView(f), seed = f.expectedPattern as Record<string, any>, b = new IndependentChainProof(view);
  const sets: AlsSet[] = structuredClone(seed.sets);
  const members = (set: number, symbol: number) => sets[set].occurrences[symbol].map(c => candidate(c, symbol));
  const projection = (set: number, symbols: [number, number]) => ({ set, symbols,
    root: b.strong({ kind: "als", cells: sets[set].cells, house: sets[set].house, symbols: sets[set].symbols }, symbols.flatMap(s => members(set, s))) });
  const overlaps = sets.flatMap((a, left) => sets.flatMap((s, right) => right > left ? [{ left, right, cells: a.cells.filter(c => s.cells.includes(c)) }] : []));
  if (f.alias === "Death Blossom") {
    const p: BlossomPattern = { kind: "blossom", alias: "Death Blossom", sets, overlaps, stem: seed.stem,
      symbols: seed.stemSymbols, petals: seed.petals ?? sets.map((_, i) => i), cover: b.cell(seed.stem), branches: [] };
    const roots: number[] = [];
    for (const effect of f.expectedEffects) {
      const branches = p.symbols.map((symbol, i) => {
        const petal = p.petals[i], strong = projection(petal, [symbol, effect.symbol]);
        const conflicts = members(petal, symbol).map(l => b.weak(candidate(p.stem, symbol), l));
        const visibility = members(petal, effect.symbol).map(l => b.weak(l, candidate(effect.cell, effect.symbol)));
        const assumption = b.add("assume@1", [], b.clause([candidate(p.stem, symbol)])); b.lexicalScope = [assumption];
        const root = b.infer([strong.root, ...conflicts, ...visibility, assumption], { cell: effect.cell, symbol: effect.symbol, positive: false });
        b.lexicalScope = [];
        return { symbol, petal, projection: strong, conflicts, visibility, assumption, root };
      });
      p.branches.push(branches);
      roots.push(b.add("cases@1", [p.cover, ...branches.flatMap(branch => [branch.assumption, branch.root])],
        b.clause([{ cell: effect.cell, symbol: effect.symbol, positive: false }])));
    }
    return b.proposal(f.rowId, p as unknown as Json, f.expectedEffects, roots);
  }
  const double = f.alias === "ALS-XZ" && seed.restrictedSymbols.length === 2;
  const p: AlsPattern = { kind: "als", alias: f.alias as AlsPattern["alias"], sets, overlaps,
    rccs: seed.restrictedSymbols.map((symbol: number, i: number) => ({ left: double ? 0 : i, right: double ? 1 : i + 1, symbol, roots: [] })), routes: [] };
  for (const edge of p.rccs) edge.roots = members(edge.left, edge.symbol).flatMap(a => members(edge.right, edge.symbol).map(c => b.weak(a, c)));
  const roots: number[] = [];
  for (const effect of f.expectedEffects) {
    let route: AlsRoute;
    if (double && !seed.restrictedSymbols.includes(effect.symbol)) {
      const set = sets.findIndex(s => s.symbols.includes(effect.symbol));
      route = { form: "locked", projections: [projection(set, [seed.restrictedSymbols[0], effect.symbol]), projection(set, [seed.restrictedSymbols[1], effect.symbol]), projection(1 - set, seed.restrictedSymbols)],
        rccs: [0, 1], witnesses: members(set, effect.symbol), visibility: [], root: -1 };
    } else {
      const restricted = double ? [1 - seed.restrictedSymbols.indexOf(effect.symbol)] : p.rccs.map((_, i) => i);
      const sequence = restricted.map(i => p.rccs[i].symbol);
      route = { form: double ? "rcc" : "path", projections: sets.map((_, i) => projection(i, [i ? sequence[i - 1] : effect.symbol, i === sets.length - 1 ? effect.symbol : sequence[i]])),
        rccs: restricted, witnesses: [...members(0, effect.symbol), ...members(sets.length - 1, effect.symbol)], visibility: [], root: -1 };
    }
    route.witnesses = [...new Map(route.witnesses.map(l => [l.cell + ":" + l.symbol, l])).values()];
    route.visibility = route.witnesses.map(l => b.weak(l, candidate(effect.cell, effect.symbol)));
    const sources = [...route.projections.map(s => s.root), ...route.rccs.flatMap(i => p.rccs[i].roots), ...route.visibility];
    // Keep all selected double-RCC certificates reachable even for locked-union effects.
    const packaged = b.package([...sources, ...p.rccs.flatMap(e => e.roots)]);
    route.root = b.infer(packaged.slice(0, sources.length), { cell: effect.cell, symbol: effect.symbol, positive: false });
    p.routes.push(route); roots.push(route.root);
  }
  return b.proposal(f.rowId, p as unknown as Json, f.expectedEffects, roots);
}
