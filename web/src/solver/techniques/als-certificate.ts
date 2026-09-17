import type { Json } from "../problem";
import type { Literal, ReadView } from "../state/types";
import type { DeductionProposal, Effect } from "../proof/types";
import { clause } from "../proof/primitives";
import { ChainCertificate, candidate, type ChainWork } from "./chains-certificate";
import type { PatternGraph } from "./pattern-runtime";

/** Exact set identity and every occurrence, including cells shared with another ALS. */
export interface AlsSet {
  cells: number[];
  symbols: number[];
  house: string;
  occurrences: Record<number, number[]>;
}
export interface AlsOverlap {
  left: number;
  right: number;
  cells: number[];
}
export interface AlsProjection {
  set: number;
  symbols: [number, number];
  root: number;
}
export interface AlsRcc {
  left: number;
  right: number;
  symbol: number;
  roots: number[];
}
export interface AlsRoute {
  form: "path" | "locked" | "rcc";
  projections: AlsProjection[];
  rccs: number[];
  witnesses: Literal[];
  visibility: number[];
  root: number;
}
export interface AlsPattern {
  kind: "als";
  alias: "ALS-XZ" | "ALS-XY-Wing" | "ALS chains";
  sets: AlsSet[];
  overlaps: AlsOverlap[];
  rccs: AlsRcc[];
  routes: AlsRoute[];
}
export interface BlossomBranch {
  symbol: number;
  petal: number;
  projection: AlsProjection;
  conflicts: number[];
  visibility: number[];
  assumption: number;
  root: number;
}
export interface BlossomPattern {
  kind: "blossom";
  alias: "Death Blossom";
  sets: AlsSet[];
  overlaps: AlsOverlap[];
  stem: number;
  symbols: number[];
  petals: number[];
  cover: number;
  branches: BlossomBranch[][];
}
export type AlsCandidate = {
  kind: "candidate";
  pattern: AlsPattern | BlossomPattern;
  effects: Effect[];
};
export const alsMembers = (sets: AlsSet[], set: number, symbol: number): Literal[] =>
  sets[set].occurrences[symbol].map((c) => candidate(c, symbol));
export const alsOverlaps = (sets: AlsSet[]): AlsOverlap[] =>
  sets.flatMap((a, left) =>
    sets.flatMap((b, right) =>
      left < right ? [{ left, right, cells: a.cells.filter((c) => b.cells.includes(c)) }] : [],
    ),
  );

/** Untrusted compiler composed with the existing checked table/resolution algebra.
 * Each projection reconstructs its own <=5-cell table; no whole-chain table exists. */
export class AlsCertificate {
  readonly algebra: ChainCertificate;
  readonly #projections = new Map<string, number>();
  constructor(
    readonly view: ReadView,
    readonly graph: PatternGraph,
  ) {
    this.algebra = new ChainCertificate(view, graph);
  }
  private *projection(sets: AlsSet[], p: AlsProjection): Generator<ChainWork> {
    const set = sets[p.set];
    yield { kind: "work", units: 1 };
    const key = JSON.stringify([set.cells, set.house, [...p.symbols].sort((a, b) => a - b)]),
      prior = this.#projections.get(key);
    if (prior !== undefined) {
      p.root = prior;
      return;
    }
    p.root = yield* this.algebra.strong(
      { kind: "als", cells: set.cells, symbols: set.symbols, house: set.house },
      p.symbols.flatMap((symbol) => alsMembers(sets, p.set, symbol)),
    );
    this.graph.compilation!.grow(1, 256);
    this.#projections.set(key, p.root);
  }
  *compile(
    input: AlsPattern | BlossomPattern,
    effects: Effect[],
  ): Generator<ChainWork, DeductionProposal> {
    const p = structuredClone(input),
      b = this.algebra,
      roots: number[] = [];
    if (p.kind === "als") {
      for (const edge of p.rccs) {
        edge.roots = [];
        for (const a of alsMembers(p.sets, edge.left, edge.symbol))
          for (const c of alsMembers(p.sets, edge.right, edge.symbol))
            edge.roots.push(yield* b.weak(a, c));
      }
      for (const [i, route] of p.routes.entries()) {
        for (const projection of route.projections) yield* this.projection(p.sets, projection);
        route.visibility = [];
        for (const witness of route.witnesses)
          route.visibility.push(
            yield* b.weak(witness, candidate(effects[i].cell, effects[i].symbol)),
          );
        const selected = [
          ...route.projections.map((s) => s.root),
          ...route.rccs.flatMap((j) => p.rccs[j].roots),
          ...route.visibility,
        ];
        const packaged = b.package([...selected, ...p.rccs.flatMap((e) => e.roots)]);
        if (route.form !== "locked") {
          // Establish the complete endpoint OR before applying target conflicts.
          // General elimination could silently choose a shorter overlapping route.
          const vertices = route.projections.flatMap((s) =>
            s.symbols.map((symbol) => alsMembers(p.sets, s.set, symbol)),
          );
          const endpoint = yield* b.path(vertices, packaged.slice(0, route.projections.length));
          route.root = yield* b.eliminate(endpoint, effects[i]);
        } else
          route.root = yield* b.derive(packaged.slice(0, selected.length), {
            cell: effects[i].cell,
            symbol: effects[i].symbol,
            positive: false,
          });
        roots.push(route.root);
      }
    } else {
      p.cover = b.cell(p.stem);
      for (const [i, branches] of p.branches.entries()) {
        for (const branch of branches) {
          yield* this.projection(p.sets, branch.projection);
          branch.conflicts = [];
          branch.visibility = [];
          for (const occurrence of alsMembers(p.sets, branch.petal, branch.symbol))
            branch.conflicts.push(yield* b.weak(candidate(p.stem, branch.symbol), occurrence));
          for (const occurrence of alsMembers(p.sets, branch.petal, effects[i].symbol))
            branch.visibility.push(
              yield* b.weak(occurrence, candidate(effects[i].cell, effects[i].symbol)),
            );
          branch.assumption = b.add("assume@1", [], clause([candidate(p.stem, branch.symbol)]));
          b.scope = [branch.assumption];
          branch.root = yield* b.derive(
            [branch.projection.root, ...branch.conflicts, ...branch.visibility, branch.assumption],
            { cell: effects[i].cell, symbol: effects[i].symbol, positive: false },
          );
          b.scope = [];
        }
        roots.push(
          b.add(
            "cases@1",
            [p.cover, ...branches.flatMap((branch) => [branch.assumption, branch.root])],
            clause([{ cell: effects[i].cell, symbol: effects[i].symbol, positive: false }]),
          ),
        );
      }
    }
    return b.close(
      p.alias === "ALS-XZ" || p.alias === "ALS-XY-Wing" ? "c18@1" : "c19@1",
      p as unknown as Json,
      effects,
      roots,
    );
  }
}
