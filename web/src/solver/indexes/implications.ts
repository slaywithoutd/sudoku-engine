import type { Fact, Literal, Proposition, ReadView } from "../state/types";
import {
  buildIndex,
  evidence,
  freezeRecord,
  IndexWorkspace,
  provedSources,
  OwnedIndex,
  reserveRecord,
  work,
} from "./workspace";
import type { IndexEntry, IndexEvent, WorkspaceReservation } from "./workspace";
import { symbolMask } from "../state/read";

/**
 * Bounded, untrusted recipes. A detector must expand these through its named
 * proposal/checker path; an edge is never a candidate fact or CheckedStep.
 * cell-cover: cover-clause(domain). house-cover: support(original, ALL scope
 * domains), then cover-clause. Weak recipes use weak-link on the cited source.
 * relation-conflict: assume the source candidate, restrict its domain, join
 * the proved <=256-row relation with one-cell complete domain filters, then
 * project not-target (<=16 filters/joins). Do not fabricate a clause primitive.
 */
export type ImplicationRecipe =
  | { readonly kind: "cell-cover" | "cell-conflict"; readonly source: number }
  | {
      readonly kind: "house-cover" | "scope-conflict" | "relation-conflict";
      readonly source: number;
    };
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
function pairKey(left: Literal, right: Literal): string {
  return left.cell < right.cell || (left.cell === right.cell && left.symbol < right.symbol)
    ? `${left.cell}:${left.symbol}/${right.cell}:${right.symbol}`
    : `${right.cell}:${right.symbol}/${left.cell}:${left.symbol}`;
}

export class ImplicationIndex extends OwnedIndex<CoverEntry | ImplicationEdge> {
  #covers: readonly CoverEntry[];
  #edges: readonly ImplicationEdge[];
  readonly #weak: Set<string>;
  readonly #strong: Set<string>;
  constructor(
    view: ReadView,
    entries: (CoverEntry | ImplicationEdge)[],
    reservation: WorkspaceReservation,
    covers: CoverEntry[],
    edges: ImplicationEdge[],
    weak: Set<string>,
    strong: Set<string>,
  ) {
    super(view, entries, reservation);
    this.#covers = Object.freeze(covers);
    this.#edges = Object.freeze(edges);
    this.#weak = weak;
    this.#strong = strong;
  }
  get covers(): readonly CoverEntry[] {
    this.source;
    return this.#covers;
  }
  get edges(): readonly ImplicationEdge[] {
    this.source;
    return this.#edges;
  }
  /** Strong means an exhaustive positive pair; weak means a negative pair. */
  strong(left: Literal, right: Literal): boolean {
    return this.has("strong", left, right);
  }
  weak(left: Literal, right: Literal): boolean {
    return this.has("weak", left, right);
  }
  private has(kind: "weak" | "strong", left: Literal, right: Literal): boolean {
    this.source;
    return (
      left.positive === true &&
      right.positive === true &&
      (kind === "weak" ? this.#weak : this.#strong).has(pairKey(left, right))
    );
  }
  override dispose(): void {
    this.#covers = [];
    this.#edges = [];
    this.#weak.clear();
    this.#strong.clear();
    super.dispose();
  }
}

/** Canonical cell records, then proved source ID / cell pair / symbol order. */
export function* buildImplications(
  view: ReadView,
  workspace: IndexWorkspace,
): Generator<IndexEvent<ImplicationIndex>> {
  yield* buildIndex(view, workspace, function* (reservation: WorkspaceReservation) {
    const collector = new ImplicationCollector(view, workspace, reservation);
    for (const cell of view.assembly.problem.cells) yield* collector.cellRecords(cell);
    for (const event of provedSources(view, workspace)) {
      if (event.kind === "work") {
        yield event;
        continue;
      }
      yield* collector.sourceRecords(event.fact);
    }
    return collector.finish();
  });
}

/** Accumulates cover and edge records in publication order under one reservation. */
class ImplicationCollector {
  readonly #entries: (CoverEntry | ImplicationEdge)[] = [];
  readonly #covers: CoverEntry[] = [];
  readonly #edges: ImplicationEdge[] = [];
  readonly #weak = new Set<string>();
  readonly #strong = new Set<string>();
  constructor(
    readonly view: ReadView,
    readonly workspace: IndexWorkspace,
    readonly reservation: WorkspaceReservation,
  ) {}
  /** Symbols still open in the cell. */
  symbols(cell: number): number[] {
    return this.view.assembly.problem.symbols.filter(
      (symbol) => this.view.state.domains[cell] & symbolMask(symbol),
    );
  }
  edge(
    kind: "weak" | "strong",
    from: Literal,
    to: Literal,
    premises: number[],
    recipe: ImplicationRecipe,
  ): void {
    reserveRecord(this.reservation, 5 + premises.length);
    const entry = freezeRecord({
      ...evidence(this.view, premises),
      kind,
      literals: [from, to] as [Literal, Literal],
      recipe,
    });
    this.#entries.push(entry);
    this.#edges.push(entry);
    (kind === "weak" ? this.#weak : this.#strong).add(pairKey(from, to));
  }
  cover(literals: Literal[], premises: number[], recipe: ImplicationRecipe): void {
    reserveRecord(this.reservation, 1 + literals.length + premises.length);
    const entry = freezeRecord({
      ...evidence(this.view, premises),
      kind: "cover" as const,
      literals,
      recipe,
    });
    this.#entries.push(entry);
    this.#covers.push(entry);
    if (literals.length === 2) this.edge("strong", literals[0], literals[1], premises, recipe);
  }
  /** The cell's own cover and the weak links between its candidates. */
  *cellRecords(cell: number): Generator<{ kind: "work"; units: number }> {
    yield* work(this.workspace);
    const values = this.symbols(cell),
      source = this.view.state.domainFacts[cell];
    this.cover(
      values.map((symbol) => candidate(cell, symbol)),
      [source],
      { kind: "cell-cover", source },
    );
    for (let i = 0; i < values.length; i++)
      for (let j = i + 1; j < values.length; j++) {
        yield* work(this.workspace);
        this.edge("weak", candidate(cell, values[i]), candidate(cell, values[j]), [source], {
          kind: "cell-conflict",
          source,
        });
      }
  }
  /** House covers, then scope or relation conflicts for every cell pair of the source. */
  *sourceRecords(fact: Fact): Generator<{ kind: "work"; units: number }> {
    const view = this.view,
      proposition = fact.proposition;
    if (proposition.kind === "cover") {
      yield* work(this.workspace);
      this.cover(
        proposition.cells
          .filter((cell) => view.state.domains[cell] & symbolMask(proposition.symbol))
          .map((cell) => candidate(cell, proposition.symbol)),
        [fact.id, ...proposition.cells.map((cell) => view.state.domainFacts[cell])],
        { kind: "house-cover", source: fact.id },
      );
    }
    if (proposition.kind !== "all-different" && proposition.kind !== "relation") return;
    const cells = [...proposition.cells].sort((left, right) => left - right);
    for (let i = 0; i < cells.length; i++)
      for (let j = i + 1; j < cells.length; j++) {
        yield* work(this.workspace);
        for (const left of this.symbols(cells[i]))
          for (const right of this.symbols(cells[j])) {
            yield* work(this.workspace);
            if (proposition.kind === "all-different") {
              if (left === right)
                this.edge(
                  "weak",
                  candidate(cells[i], left),
                  candidate(cells[j], right),
                  [fact.id],
                  {
                    kind: "scope-conflict",
                    source: fact.id,
                  },
                );
            } else
              yield* this.relationConflict(fact, proposition, [cells[i], left], [cells[j], right]);
          }
      }
  }
  /** A weak link when no live tuple of the relation holds both candidates. */
  *relationConflict(
    fact: Fact,
    relation: Extract<Proposition, { kind: "relation" }>,
    [firstCell, firstSymbol]: readonly [number, number],
    [secondCell, secondSymbol]: readonly [number, number],
  ): Generator<{ kind: "work"; units: number }> {
    const view = this.view;
    let compatible = false;
    for (const tuple of relation.tuples) {
      yield* work(this.workspace);
      if (
        tuple[relation.cells.indexOf(firstCell)] === firstSymbol &&
        tuple[relation.cells.indexOf(secondCell)] === secondSymbol &&
        relation.cells.every((cell, k) => view.state.domains[cell] & symbolMask(tuple[k]))
      ) {
        compatible = true;
        break;
      }
    }
    if (!compatible)
      this.edge(
        "weak",
        candidate(firstCell, firstSymbol),
        candidate(secondCell, secondSymbol),
        [fact.id, ...relation.cells.map((cell) => view.state.domainFacts[cell])],
        { kind: "relation-conflict", source: fact.id },
      );
  }
  finish(): ImplicationIndex {
    return new ImplicationIndex(
      this.view,
      this.#entries,
      this.reservation,
      this.#covers,
      this.#edges,
      this.#weak,
      this.#strong,
    );
  }
}
