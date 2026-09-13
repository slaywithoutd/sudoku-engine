import type { Literal, ReadView } from "../state/types";
import { buildIndex, evidence, freezeRecord, IndexWorkspace, provedSources, OwnedIndex, reserveRecord, work } from "./workspace";
import type { IndexEntry, IndexEvent, WorkspaceReservation } from "./workspace";

/**
 * Bounded, untrusted recipes. A detector must expand these through its named
 * proposal/checker path; an edge is never a candidate fact or CheckedStep.
 * cell-cover: cover-clause(domain). house-cover: support(original, ALL scope
 * domains), then cover-clause. Weak recipes use weak-link on the cited source.
 * relation-conflict: assume the source candidate, restrict its domain, join
 * the proved <=256-row relation with one-cell complete domain filters, then
 * project not-target (<=16 filters/joins). Do not fabricate a clause primitive.
 */
export type ImplicationRecipe = { readonly kind: "cell-cover" | "cell-conflict"; readonly source: number }
  | { readonly kind: "house-cover" | "scope-conflict" | "relation-conflict"; readonly source: number };
export interface CoverEntry extends IndexEntry {
  readonly kind: "cover";
  readonly literals: readonly Literal[];
  readonly recipe: ImplicationRecipe;
}
export interface ImplicationEdge extends IndexEntry {
  readonly kind: "weak" | "strong";
  readonly literals: readonly [Literal, Literal];
  readonly recipe: ImplicationRecipe;
}
const candidate = (cell: number, symbol: number): Literal => ({ cell, symbol, positive: true });
function pairKey(a: Literal, b: Literal): string {
  return a.cell < b.cell || (a.cell === b.cell && a.symbol < b.symbol)
    ? `${a.cell}:${a.symbol}/${b.cell}:${b.symbol}` : `${b.cell}:${b.symbol}/${a.cell}:${a.symbol}`;
}

export class ImplicationIndex extends OwnedIndex<CoverEntry | ImplicationEdge> {
  #covers: readonly CoverEntry[];
  #edges: readonly ImplicationEdge[];
  readonly #weak: Set<string>;
  readonly #strong: Set<string>;
  constructor(view: ReadView, entries: (CoverEntry | ImplicationEdge)[], reservation: WorkspaceReservation,
    covers: CoverEntry[], edges: ImplicationEdge[], weak: Set<string>, strong: Set<string>) {
    super(view, entries, reservation);
    this.#covers = Object.freeze(covers); this.#edges = Object.freeze(edges);
    this.#weak = weak; this.#strong = strong;
  }
  get covers(): readonly CoverEntry[] { this.source; return this.#covers; }
  get edges(): readonly ImplicationEdge[] { this.source; return this.#edges; }
  /** Strong means an exhaustive positive pair; weak means a negative pair. */
  strong(a: Literal, b: Literal): boolean { return this.has("strong", a, b); }
  weak(a: Literal, b: Literal): boolean { return this.has("weak", a, b); }
  private has(kind: "weak" | "strong", a: Literal, b: Literal): boolean {
    this.source;
    return a.positive === true && b.positive === true && (kind === "weak" ? this.#weak : this.#strong).has(pairKey(a,b));
  }
  override dispose(): void {
    this.#covers = []; this.#edges = []; this.#weak.clear(); this.#strong.clear(); super.dispose();
  }
}

/** Canonical cell records, then proved source ID / cell pair / symbol order. */
export function* buildImplications(view: ReadView, workspace: IndexWorkspace): Generator<IndexEvent<ImplicationIndex>> {
  yield* buildIndex(view, workspace, function* (reservation: WorkspaceReservation) {
    const entries: (CoverEntry | ImplicationEdge)[] = [];
    const covers: CoverEntry[] = [], edges: ImplicationEdge[] = [], weak = new Set<string>(), strong = new Set<string>();
    const symbols = (cell: number) => view.assembly.problem.symbols.filter(s => view.state.domains[cell] & (1 << (s-1)));
    const edge = (kind: "weak" | "strong", a: Literal, b: Literal, premises: number[], recipe: ImplicationRecipe) => {
      reserveRecord(reservation, 5 + premises.length);
      const entry = freezeRecord({ ...evidence(view, premises), kind, literals: [a,b] as [Literal,Literal], recipe });
      entries.push(entry); edges.push(entry); (kind === "weak" ? weak : strong).add(pairKey(a,b));
    };
    const cover = (literals: Literal[], premises: number[], recipe: ImplicationRecipe) => {
      reserveRecord(reservation, 1 + literals.length + premises.length);
      const entry = freezeRecord({ ...evidence(view, premises), kind: "cover" as const, literals, recipe });
      entries.push(entry); covers.push(entry);
      if (literals.length === 2) edge("strong", literals[0], literals[1], premises, recipe);
    };
    for (const cell of view.assembly.problem.cells) {
      yield* work(workspace);
      const values = symbols(cell), source = view.state.domainFacts[cell];
      cover(values.map(s => candidate(cell,s)), [source], { kind: "cell-cover", source });
      for (let i = 0; i < values.length; i++) for (let j = i+1; j < values.length; j++) {
        yield* work(workspace);
        edge("weak", candidate(cell,values[i]), candidate(cell,values[j]), [source], { kind: "cell-conflict", source });
      }
    }
    for (const event of provedSources(view, workspace)) {
      if (event.kind === "work") { yield event; continue; }
      const fact = event.fact, p = fact.proposition;
      if (p.kind === "cover") {
        yield* work(workspace);
        cover(p.cells.filter(c => view.state.domains[c] & (1 << (p.symbol-1))).map(c => candidate(c,p.symbol)),
          [fact.id,...p.cells.map(c => view.state.domainFacts[c])], { kind: "house-cover", source: fact.id });
      }
      if (p.kind !== "all-different" && p.kind !== "relation") continue;
      const cells = [...p.cells].sort((a,b) => a-b);
      for (let i = 0; i < cells.length; i++) for (let j = i+1; j < cells.length; j++) {
        yield* work(workspace);
        for (const a of symbols(cells[i])) for (const b of symbols(cells[j])) {
          yield* work(workspace);
          if (p.kind === "all-different") {
            if (a === b) edge("weak", candidate(cells[i],a), candidate(cells[j],b), [fact.id],
              { kind: "scope-conflict", source: fact.id });
          } else {
            let compatible = false;
            for (const tuple of p.tuples) {
              yield* work(workspace);
              if (tuple[p.cells.indexOf(cells[i])] === a && tuple[p.cells.indexOf(cells[j])] === b &&
                p.cells.every((c,k) => view.state.domains[c] & (1 << (tuple[k]-1)))) { compatible = true; break; }
            }
            if (!compatible) edge("weak", candidate(cells[i],a), candidate(cells[j],b),
              [fact.id,...p.cells.map(c => view.state.domainFacts[c])], { kind: "relation-conflict", source: fact.id });
          }
        }
      }
    }
    return new ImplicationIndex(view, entries, reservation, covers, edges, weak, strong);
  });
}
