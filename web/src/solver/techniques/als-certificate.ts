import type { Json } from "../problem";
import type { Literal, ReadView } from "../state/types";
import type { DeductionProposal, Effect } from "../proof/types";
import { clause } from "../proof/primitives";
import { ChainCertificate, candidate, type ChainWork } from "./chains-certificate";
import type { PatternGraph } from "./pattern-runtime";
import { defined } from "../invariants";

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
  sets[set].occurrences[symbol].map((cell) => candidate(cell, symbol));
export const alsOverlaps = (sets: AlsSet[]): AlsOverlap[] =>
  sets.flatMap((a, left) =>
    sets.flatMap((b, right) =>
      left < right
        ? [{ left, right, cells: a.cells.filter((cell) => b.cells.includes(cell)) }]
        : [],
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
  private *projection(sets: AlsSet[], projection: AlsProjection): Generator<ChainWork> {
    const set = sets[projection.set];
    yield { kind: "work", units: 1 };
    const key = JSON.stringify([
        set.cells,
        set.house,
        [...projection.symbols].sort((left, right) => left - right),
      ]),
      prior = this.#projections.get(key);
    if (prior !== undefined) {
      projection.root = prior;
      return;
    }
    projection.root = yield* this.algebra.strong(
      { kind: "als", cells: set.cells, symbols: set.symbols, house: set.house },
      projection.symbols.flatMap((symbol) => alsMembers(sets, projection.set, symbol)),
    );
    defined(this.graph.compilation, "compilation").grow(1, 256);
    this.#projections.set(key, projection.root);
  }
  *compile(
    input: AlsPattern | BlossomPattern,
    effects: Effect[],
  ): Generator<ChainWork, DeductionProposal> {
    const pattern = structuredClone(input),
      certificate = this.algebra,
      roots: number[] = [];
    if (pattern.kind === "als") {
      for (const edge of pattern.rccs) {
        edge.roots = [];
        for (const literal of alsMembers(pattern.sets, edge.left, edge.symbol))
          for (const c of alsMembers(pattern.sets, edge.right, edge.symbol))
            edge.roots.push(yield* certificate.weak(literal, c));
      }
      for (const [i, route] of pattern.routes.entries()) {
        for (const projection of route.projections)
          yield* this.projection(pattern.sets, projection);
        route.visibility = [];
        for (const witness of route.witnesses)
          route.visibility.push(
            yield* certificate.weak(witness, candidate(effects[i].cell, effects[i].symbol)),
          );
        const selected = [
          ...route.projections.map((projection) => projection.root),
          ...route.rccs.flatMap((j) => pattern.rccs[j].roots),
          ...route.visibility,
        ];
        const packaged = certificate.package([
          ...selected,
          ...pattern.rccs.flatMap((rcc) => rcc.roots),
        ]);
        if (route.form !== "locked") {
          // Establish the complete endpoint OR before applying target conflicts.
          // General elimination could silently choose a shorter overlapping route.
          const vertices = route.projections.flatMap((projection) =>
            projection.symbols.map((symbol) => alsMembers(pattern.sets, projection.set, symbol)),
          );
          const endpoint = yield* certificate.path(
            vertices,
            packaged.slice(0, route.projections.length),
          );
          route.root = yield* certificate.eliminate(endpoint, effects[i]);
        } else
          route.root = yield* certificate.derive(packaged.slice(0, selected.length), {
            cell: effects[i].cell,
            symbol: effects[i].symbol,
            positive: false,
          });
        roots.push(route.root);
      }
    } else {
      pattern.cover = certificate.cell(pattern.stem);
      for (const [i, branches] of pattern.branches.entries()) {
        for (const branch of branches) {
          yield* this.projection(pattern.sets, branch.projection);
          branch.conflicts = [];
          branch.visibility = [];
          for (const occurrence of alsMembers(pattern.sets, branch.petal, branch.symbol))
            branch.conflicts.push(
              yield* certificate.weak(candidate(pattern.stem, branch.symbol), occurrence),
            );
          for (const occurrence of alsMembers(pattern.sets, branch.petal, effects[i].symbol))
            branch.visibility.push(
              yield* certificate.weak(occurrence, candidate(effects[i].cell, effects[i].symbol)),
            );
          branch.assumption = certificate.add(
            "assume@1",
            [],
            clause([candidate(pattern.stem, branch.symbol)]),
          );
          certificate.scope = [branch.assumption];
          branch.root = yield* certificate.derive(
            [branch.projection.root, ...branch.conflicts, ...branch.visibility, branch.assumption],
            { cell: effects[i].cell, symbol: effects[i].symbol, positive: false },
          );
          certificate.scope = [];
        }
        roots.push(
          certificate.add(
            "cases@1",
            [pattern.cover, ...branches.flatMap((branch) => [branch.assumption, branch.root])],
            clause([{ cell: effects[i].cell, symbol: effects[i].symbol, positive: false }]),
          ),
        );
      }
    }
    return certificate.close(
      pattern.alias === "ALS-XZ" || pattern.alias === "ALS-XY-Wing" ? "c18@1" : "c19@1",
      pattern as unknown as Json,
      effects,
      roots,
    );
  }
}
