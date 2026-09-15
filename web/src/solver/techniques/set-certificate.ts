import {matchingFacts} from "../state/source-index";
import type { Json } from "../problem";
import type { ReadView, Literal } from "../state/types";
import type { DeductionProposal, Effect } from "../proof/types";
import { clause, literals } from "../proof/primitives";
import { ChainCertificate, candidate, type ChainWork } from "./chains-certificate";
import type { PatternGraph } from "./pattern-runtime";
import type { SdcPattern, AlignedPattern, CountPattern, SetPattern } from "./set-contracts";

export const setDigits = (mask: number) => Array.from({ length: 9 }, (_, i) => i + 1).filter(s => mask & (1 << (s - 1)));
export const setUnion = (view: ReadView, cells: number[]) => setDigits(cells.reduce((m, c) => m | view.state.domains[c], 0));
export function* combinations(xs: readonly number[], size: number, start = 0, prefix: number[] = []): Generator<number[]> {
  if (!size) { yield prefix; return; }
  for (let i = start; i <= xs.length - size; i++) yield* combinations(xs, size - 1, i + 1, [...prefix, xs[i]]);
}
/** Constant-memory Cartesian cursor; includes conflicting rows and empty domains. */
export function* assignments(domains: readonly number[]): Generator<number[]> {
  const choices = domains.map(setDigits), indexes = choices.map(() => 0);
  if (choices.some(xs => !xs.length)) return;
  while (true) {
    yield choices.map((xs, i) => xs[indexes[i]]);
    let at = indexes.length - 1;
    while (at >= 0 && ++indexes[at] === choices[at].length) { indexes[at] = 0; at--; }
    if (at < 0) return;
  }
}

/** Untrusted set algebra. Complete table partitions are local, never a board
 * solve. Compiler state and yielded proposals borrow the invocation lease. */
export class SetCertificate {
  readonly algebra: ChainCertificate;
  constructor(readonly view: ReadView, readonly graph: PatternGraph) {
    if (!graph.index.completeFor(view)) throw Error("incomplete-set-source-prefix");
    this.algebra = new ChainCertificate(view, graph);
  }
  *table(cells: number[], scopes: { cells: number[]; house: string }[]): Generator<ChainWork, number> {
    const b = this.algebra, constraints: number[] = [];
    for (const scope of scopes) {
      yield { kind: "work", units: 1 };
      const house = this.view.assembly.allDifferent.find(h => h.id === scope.house)!;
      const source = matchingFacts(this.view,{kind:"all-different",cells:house.cells}).find(f=>!f.openAssumptions.length);
      if (!source) throw Error("missing-set-source");
      constraints.push(b.add("all-different-subset@1", [source.id], { kind: "all-different", cells: scope.cells }));
    }
    const sources = [...cells.map(c => this.view.state.domainFacts[c]), ...constraints];
    const build = function*(box: number[]): Generator<ChainWork, { id: number; count: number }> {
      yield { kind: "work", units: 1 };
      const choices = box.map(setDigits), volume = choices.reduce((n, xs) => n * xs.length, 1);
      if (volume > 256) {
        const at = choices.findIndex(xs => xs.length > 1), left = [...box], right = [...box];
        left[at] = 1 << (choices[at][0] - 1); right[at] &= ~left[at];
        const a = yield* build(left), c = yield* build(right), count = a.count + c.count;
        return { id: b.add("table-union@1", [a.id, c.id], { kind: "table", cells, count, definition: b.next }), count };
      }
      let count = 0;
      for (const row of assignments(box)) {
        yield { kind: "work", units: 1 };
        if (scopes.every(scope => new Set(scope.cells.map(c => row[cells.indexOf(c)])).size === scope.cells.length)) count++;
      }
      return { id: b.add("table-filter@1", sources, { kind: "table", cells, count, definition: b.next }, { cells, box }), count };
    };
    return (yield* build(cells.map(c => this.view.state.domains[c]))).id;
  }
  *compile(input: SetPattern, effects: Effect[]): Generator<ChainWork, DeductionProposal> {
    const p = structuredClone(input), b = this.algebra;
    if (p.kind === "sdc") yield* this.sdc(p, effects);
    else if (p.kind === "aligned") yield* this.aligned(p, effects);
    else yield* this.count(p, effects);
    const roots = p.kind === "sdc" ? p.routes.map(r => r.root) : p.kind === "aligned" ? p.roots : [p.root];
    return b.close(p.kind === "sdc" ? "c20@1" : "c21@1", p as unknown as Json, effects, roots);
  }
  private *sdc(p: SdcPattern, effects: Effect[]): Generator<ChainWork> {
    const cells = [...p.intersection, ...p.lineSide, ...p.boxSide].sort((a, b) => a - b);
    p.table = yield* this.table(cells, [{ cells: [...p.intersection, ...p.lineSide].sort((a, b) => a - b), house: p.line },
      { cells: [...p.intersection, ...p.boxSide].sort((a, b) => a - b), house: p.box }]);
    for (const [i, route] of p.routes.entries()) {
      route.projection = this.algebra.add("table-project@1", [p.table], clause(route.occurrences.map(c => candidate(c, effects[i].symbol))));
      route.visibility = [];
      for (const c of route.occurrences) route.visibility.push(yield* this.algebra.weak(candidate(c, effects[i].symbol), candidate(effects[i].cell, effects[i].symbol)));
      route.root = yield* this.algebra.eliminate(route.projection, effects[i]);
    }
  }
  private *aligned(p: AlignedPattern, effects: Effect[]): Generator<ChainWork> {
    const b = this.algebra;
    for (const a of p.auxiliaries) a.table = yield* this.table(a.cells, [a]);
    const pairs = p.selected.flatMap((a, i) => p.selected.slice(i + 1).map(c => [a, c])); p.rejections = [];
    let index = 0;
    for (const tuple of assignments(p.domains)) {
      yield { kind: "work", units: 1 }; const reason = p.reasons[index++];
      if (!reason) { p.rejections.push(-1); continue; }
      if (reason < 0) {
        const pair = pairs[-reason - 1]; p.rejections.push(yield* b.weak(candidate(pair[0], tuple[p.selected.indexOf(pair[0])]), candidate(pair[1], tuple[p.selected.indexOf(pair[1])]))); continue;
      }
      const auxiliary = p.auxiliaries[reason - 1], blocked: { literal: Literal; selected: number }[] = [];
      for (const cell of auxiliary.cells) for (const symbol of setDigits(this.view.state.domains[cell])) {
        yield { kind: "work", units: 1 };
        const selected = p.selected.findIndex((c, i) => this.graph.has(candidate(cell, symbol), candidate(c, tuple[i])));
        if (selected >= 0) blocked.push({ literal: candidate(cell, symbol), selected });
      }
      let root = b.add("table-project@1", [auxiliary.table], clause(blocked.map(v => v.literal)));
      for (const v of blocked) root = b.resolve(root, yield* b.weak(v.literal, candidate(p.selected[v.selected], tuple[v.selected])), v.literal);
      p.rejections.push(root);
    }
    const sources = [...p.selected.map(c => b.cell(c)), ...p.rejections.filter(n => n >= 0)];
    const packaged = b.package([...sources, ...p.auxiliaries.map(a => a.table)]).slice(0, sources.length);
    const mapped = new Map(sources.map((id, i) => [id, packaged[i]])); p.roots = [];
    // Eliminate only the declared 2..4 selected variables. A recursive cell
    // cover resolution avoids exponential generic clause cross-products.
    for (const e of effects) {
      const rest = p.selected.filter(c => c !== e.cell);
      const infer = function*(depth: number, values: Map<number, number>): Generator<ChainWork, number> {
        yield { kind: "work", units: 1 };
        if (depth === rest.length) {
          let tupleIndex = 0;
          for (let i = 0; i < p.selected.length; i++) tupleIndex = tupleIndex * setDigits(p.domains[i]).length + setDigits(p.domains[i]).indexOf(values.get(p.selected[i])!);
          const root = p.rejections[tupleIndex]; if (root < 0) throw Error("retained-aligned-candidate"); return mapped.get(root)!;
        }
        const cell = rest[depth], alternatives = setDigits(b.view.state.domains[cell]); let root = mapped.get(b.cell(cell))!;
        for (const symbol of alternatives) {
          values.set(cell, symbol); const rejected = yield* infer(depth + 1, values);
          if (!literals(b.values.get(rejected)!).some(l => l.cell === cell)) return rejected;
          root = b.resolve(root, rejected, candidate(cell, symbol));
        }
        return root;
      };
      p.roots.push(yield* infer(0, new Map([[e.cell, e.symbol]])));
    }
  }
  private *count(p: CountPattern, _effects: Effect[]): Generator<ChainWork> {
    const b = this.algebra;
    for (const scope of p.scopes) {
      yield { kind: "work", units: 1 };
      const house = this.view.assembly.allDifferent.find(h => h.id === scope.house)!;
      const fact = matchingFacts(this.view,{kind:"all-different",cells:house.cells}).find(f=>!f.openAssumptions.length);
      if (!fact) throw Error("missing-set-source");
      scope.root = b.add("all-different-subset@1", [fact.id], { kind: "all-different", cells: scope.cells });
    }
    const cells = [...new Set([...p.cells, p.target.cell])].sort((a, c) => a - c);
    p.assumption = b.add("assume@1", [], clause([candidate(p.target.cell, p.target.symbol)])); b.scope = [p.assumption];
    p.contradiction = b.add("subset-count@1", [p.assumption, ...cells.map(c => this.view.state.domainFacts[c]), ...p.scopes.map(s => s.root)],
      { kind: "false" }, { cells: p.cells, symbols: p.symbols, capacities: p.capacities, target: p.target });
    b.scope = [];
    p.root = b.add("discharge@1", [p.assumption, p.contradiction], clause([{ ...candidate(p.target.cell, p.target.symbol), positive: false }]));
  }
}
