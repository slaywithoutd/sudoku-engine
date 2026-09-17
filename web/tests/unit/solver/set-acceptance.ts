import type { Json } from "../../../src/solver/problem";
import type { Literal } from "../../../src/solver/state/types";
import { fixtureView, type TechniqueFixture } from "../../solver/acceptance";
import { IndependentChainProof } from "../../solver/chains-acceptance";
import { originalCluePrefix } from "../../solver/acceptance";
import { checkProposal } from "../../../src/solver/proof/checker";
import { commitChecked, retainedProof } from "../../../src/solver/state/candidates";
import type { ReadView } from "../../../src/solver/state/types";
import type { DeductionProposal, Effect } from "../../../src/solver/proof/types";
import { discoveryContext } from "../../solver/discovery-context";
import c20 from "../../solver/fixtures/C20.json";
import c21 from "../../solver/fixtures/C21.json";

export const setFixtures = [...c20, ...c21] as unknown as TechniqueFixture[];
export const setFixture = (id: string) => structuredClone(setFixtures.find(f => f.id === id)!);
const bit = (s: number) => 2 ** (s - 1);
const digits = (mask: number) => Array.from({ length: 9 }, (_, i) => i + 1).filter(s => Math.floor(mask / bit(s)) % 2);
export const product = (xs: number[][]): number[][] => xs.reduce<number[][]>((rows, values) => rows.flatMap(row => values.map(s => [...row, s])), [[]]);

const extended = new Map<string, { view: ReadView; prefix: DeductionProposal[] }>();
/** Replay the independent author's actual basic prefix. Singleton arguments are
 * ordinary named placements outside the final eleven-cell SDC geometry. */
export function setView(f: TechniqueFixture): ReadView {
  const seed = f as TechniqueFixture & { independentPrefix?: any[] };
  if (!seed.independentPrefix) return fixtureView(f);
  const cached = extended.get(f.id); if (cached) return cached.view;
  const values = [...f.givens].map(Number), peer = (a: number, b: number) => a !== b && (Math.floor(a / 9) === Math.floor(b / 9) || a % 9 === b % 9 ||
    Math.floor(a / 27) === Math.floor(b / 27) && Math.floor(a % 9 / 3) === Math.floor(b % 9 / 3));
  const domains = values.map((s, c) => s ? bit(s) : digits(511).filter(d => !values.some((v, p) => v === d && peer(c, p))).reduce((mask, d) => mask + bit(d), 0));
  const original = { ...f, preState: { values, domains } };
  let view = fixtureView(original); const prefix = [...originalCluePrefix(original)];
  for (const step of seed.independentPrefix) {
    const b = new IndependentChainProof(view), effects: Effect[] = [], roots: number[] = []; let pattern: Json;
    if (step.kind === "singleton-peer") {
      const symbol = digits(step.mask)[0], positive = b.cell(step.cell);
      effects.push({ kind: "place", cell: step.cell, symbol }); roots.push(positive);
      for (let cell = 0; cell < 81; cell++) if (peer(cell, step.cell) && !view.state.values[cell] && (view.state.domains[cell] & bit(symbol))) {
        effects.push({ kind: "remove", cell, symbol }); roots.push(b.infer([positive, b.weak({ cell: step.cell, symbol, positive: true }, { cell, symbol, positive: true })], { cell, symbol, positive: false }));
      }
      pattern = { kind: "single", alias: "Naked Single", cell: step.cell, symbol, house: null };
    } else {
      const house = view.assembly.allDifferent.find(h => h.id === step.house)!;
      const source = [...view.facts.values()].find(f => f.proposition.kind === "all-different" && f.proposition.cells.join() === house.cells.join())!;
      for (const cell of house.cells) if (!step.cells.includes(cell) && !view.state.values[cell]) for (const symbol of digits(view.state.domains[cell] & step.mask)) {
        effects.push({ kind: "remove", cell, symbol }); roots.push(b.add("hall@1", [source.id, ...step.cells.map((c: number) => view.state.domainFacts[c])], { kind: "literal", value: { cell, symbol, positive: false } }));
      }
      pattern = { kind: "subset", alias: "Naked Pair", form: "naked", house: step.house, cells: step.cells, symbols: digits(step.mask), complement: null };
    }
    const proposal = b.proposal(step.kind === "singleton-peer" ? "C01" : "C04", pattern, effects, roots);
    const result = [...checkProposal(proposal, { view, retained: retainedProof(view), limits: discoveryContext().limits, policy: "unconditional", uniqueEvidenceId: null })].at(-1);
    if (result?.kind !== "checked") throw Error("independent-set-prefix:" + JSON.stringify(result));
    prefix.push(result.step.proposal); view = commitChecked(view, result.step).view;
    for (const [cell, mask] of step.effects) if (view.state.domains[cell] !== mask) throw Error("independent-step-domain-mismatch");
  }
  if (JSON.stringify(view.state.domains) !== JSON.stringify(f.preState.domains) || JSON.stringify(view.state.values) !== JSON.stringify(f.preState.values)) throw Error("independent-final-set-prefix-mismatch");
  extended.set(f.id, { view, prefix }); return view;
}
export function setPrefix(f: TechniqueFixture): readonly DeductionProposal[] { setView(f); return extended.get(f.id)?.prefix ?? originalCluePrefix(f); }

/** Independent local-table author. Its only production dependencies are value types;
 * it composes test algebra and never calls a detector, index or named validator. */
export function independentSetCertificate(f: TechniqueFixture) {
  const view = setView(f), b = new IndependentChainProof(view), seed = structuredClone(f.expectedPattern) as any;
  const table = (cells: number[], scopes: { cells: number[]; house: string }[]) => independentLocalTable(b, cells, scopes);
  const pos = (cell: number, symbol: number): Literal => ({ cell, symbol, positive: true });
  const sees = (a: number, c: number) => a !== c && view.assembly.allDifferent.some(h => h.cells.includes(a) && h.cells.includes(c));
  if (seed.alias === "Subset counting") {
    const domains = [...new Set([...seed.cells, seed.target.cell])].sort((a: any, c: any) => a - c) as number[];
    const scopes = seed.scopes.map((s: any) => {
      const house = view.assembly.allDifferent.find(h => h.id === s.house)!;
      const source = [...view.facts.values()].find(f => f.proposition.kind === "all-different" && f.proposition.cells.join() === house.cells.join())!;
      return { ...s, root: b.add("all-different-subset@1", [source.id], { kind: "all-different", cells: s.cells }) };
    });
    const assumption = b.add("assume@1", [], b.clause([pos(seed.target.cell, seed.target.symbol)])); b.lexicalScope = [assumption];
    const contradiction = b.add("subset-count@1", [assumption, ...domains.map(c => view.state.domainFacts[c]), ...scopes.map((s: any) => s.root)],
      { kind: "false" }, { cells: seed.cells, symbols: seed.symbols, capacities: seed.capacities, target: seed.target });
    b.lexicalScope = [];
    const root = b.add("discharge@1", [assumption, contradiction], b.clause([{ ...pos(seed.target.cell, seed.target.symbol), positive: false }]));
    const p = { kind: "count", alias: "Subset counting", cells: seed.cells, domains: domains.map(c => view.state.domains[c]), symbols: seed.symbols,
      scopes, target: seed.target, capacities: seed.capacities, assumption, contradiction, root };
    return b.proposal(f.rowId, p as unknown as Json, f.expectedEffects, [root]);
  }
  if (f.rowId === "C20") {
    const cells: number[] = [...seed.intersection, ...seed.lineSide, ...seed.boxSide].sort((a, c) => a - c);
    const p = { kind: "sdc", alias: seed.alias, line: seed.line, box: seed.box, intersection: seed.intersection,
      lineSide: seed.lineSide, boxSide: seed.boxSide, domains: cells.map(c => view.state.domains[c]),
      table: table(cells, [{ cells: [...seed.intersection, ...seed.lineSide].sort((a, c) => a - c), house: seed.line },
        { cells: [...seed.intersection, ...seed.boxSide].sort((a, c) => a - c), house: seed.box }]), routes: [] as any[] };
    for (const e of f.expectedEffects) {
      const which = view.assembly.allDifferent.find(h => h.id === seed.line)!.cells.includes(e.cell) && !seed.lineSide.includes(e.cell) &&
        !seed.boxSymbols.includes(e.symbol) ? "line" : "box";
      const occurrences = [...seed.intersection, ...(which === "line" ? seed.lineSide : seed.boxSide)].sort((a, c) => a - c)
        .filter(c => digits(view.state.domains[c]).includes(e.symbol));
      const projection = b.add("table-project@1", [p.table], b.clause(occurrences.map(c => pos(c, e.symbol))));
      const visibility = occurrences.map(c => b.weak(pos(c, e.symbol), pos(e.cell, e.symbol)));
      const root = b.infer([projection, ...visibility], { ...pos(e.cell, e.symbol), positive: false });
      p.routes.push({ sector: which, occurrences, projection, visibility, root });
    }
    return b.proposal(f.rowId, p as unknown as Json, f.expectedEffects, p.routes.map(r => r.root));
  }
  const selected: number[] = seed.selected;
  const p = { kind: "aligned", alias: seed.alias, selected, domains: selected.map(c => view.state.domains[c]),
    auxiliaries: seed.auxiliaries.map((a: any) => ({ ...a, domains: a.cells.map((c: number) => view.state.domains[c]), table: table(a.cells, [a]) })),
    reasons: [] as number[], rejections: [] as number[], roots: [] as number[] };
  const tuples = product(p.domains.map(digits)), pairs = selected.flatMap((a, i) => selected.slice(i + 1).map(c => [a, c]));
  for (const tuple of tuples) {
    const conflict = pairs.findIndex(([a, c]) => sees(a, c) && tuple[selected.indexOf(a)] === tuple[selected.indexOf(c)]);
    if (conflict >= 0) {
      const [a, c] = pairs[conflict]; p.reasons.push(-conflict - 1);
      p.rejections.push(b.weak(pos(a, tuple[selected.indexOf(a)]), pos(c, tuple[selected.indexOf(c)]))); continue;
    }
    let reason = 0, root = -1;
    for (let i = 0; i < p.auxiliaries.length; i++) {
      const a = p.auxiliaries[i], remaining = a.cells.map((c: number) => digits(view.state.domains[c]).filter(s => !selected.some((v, j) => sees(c, v) && tuple[j] === s)));
      if (product(remaining).some(row => new Set(row).size === row.length)) continue;
      const blocked: Literal[] = a.cells.flatMap((c: number) => digits(view.state.domains[c]).filter(s => selected.some((v, j) => sees(c, v) && tuple[j] === s)).map(s => pos(c, s)));
      root = b.add("table-project@1", [a.table], b.clause(blocked));
      for (const l of blocked) {
        const index = selected.findIndex((c, j) => sees(l.cell, c) && tuple[j] === l.symbol), weak = b.weak(l, pos(selected[index], tuple[index]));
        root = b.add("resolution@1", [root, weak], b.clause([...b.terms(root).filter(v => v.cell !== l.cell || v.symbol !== l.symbol),
          { cell: selected[index], symbol: tuple[index], positive: false }]));
      }
      reason = i + 1; break;
    }
    p.reasons.push(reason); p.rejections.push(root);
  }
  const sources = [...selected.map(c => b.cell(c)), ...p.rejections.filter(n => n >= 0)];
  // Every rejected tuple remains a checked certificate component, including
  // rejections unrelated to this particular projected candidate.
  const packaged = b.package([...sources, ...p.auxiliaries.map((a: any) => a.table)]).slice(0, sources.length);
  for (const e of f.expectedEffects) p.roots.push(b.infer(packaged, { ...pos(e.cell, e.symbol), positive: false }));
  return b.proposal(f.rowId, p as unknown as Json, f.expectedEffects, p.roots);
}

export function independentLocalTable(b: IndependentChainProof, cells: number[], scopes: { cells: number[]; house: string }[]): number {
  const view = b.view;

    const constraints = scopes.map(scope => {
      const house = view.assembly.allDifferent.find(h => h.id === scope.house)!;
      const fact = [...view.facts.values()].find(x => x.proposition.kind === "all-different" && x.proposition.cells.join() === house.cells.join())!;
      return b.add("all-different-subset@1", [fact.id], { kind: "all-different", cells: scope.cells });
    });
    const premises = [...cells.map(c => view.state.domainFacts[c]), ...constraints];
    const build = (box: number[]): { id: number; count: number } => {
      const xs = box.map(digits);
      if (xs.reduce((n, values) => n * values.length, 1) > 256) {
        const at = xs.findIndex(values => values.length > 1), left = [...box], right = [...box];
        left[at] = bit(xs[at][0]); right[at] -= left[at];
        const a = build(left), c = build(right), count = a.count + c.count;
        return { id: b.add("table-union@1", [a.id, c.id], { kind: "table", cells, count, definition: b.next }), count };
      }
      const count = product(xs).filter(tuple => scopes.every(s => new Set(s.cells.map(c => tuple[cells.indexOf(c)])).size === s.cells.length)).length;
      return { id: b.add("table-filter@1", premises, { kind: "table", cells, count, definition: b.next }, { cells, box }), count };
    };
    return build(cells.map(c => view.state.domains[c])).id;
}
