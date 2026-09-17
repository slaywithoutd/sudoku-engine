import type { ReadView, Literal, Proposition } from "../state/types";
import type { DeductionProposal, Effect } from "../proof/types";
import type { Discovery, TechniqueDescriptor } from "./types";
import { coverageEntries } from "./manifest";
import { IndexInterrupted, type WorkspaceReservation } from "../indexes/workspace";
import { ForcingProof, forcingProofFits } from "./forcing-proof";
import { clause, literals, sameValue } from "../proof/primitives";
import { findHouseEqualTo, findHouseWithCells, symbolMask } from "../state/read";
import { defined } from "../invariants";

export const boxOf = (cell: number): number =>
  Math.floor(cell / 27) * 3 + Math.floor((cell % 9) / 3);
export const bitOf = (symbol: number): number => symbolMask(symbol);
export const sortedCells = (cells: readonly number[]): number[] =>
  [...new Set(cells)].sort((left, right) => left - right);
export const candidates = (view: ReadView, cell: number): number[] =>
  view.assembly.problem.symbols.filter((symbol) => view.state.domains[cell] & bitOf(symbol));
export type SpecializedWork = { kind: "work"; units: number };
export const specializedWork: SpecializedWork = { kind: "work", units: 1 };
export function* choose<T>(
  items: readonly T[],
  size: number,
  start = 0,
  prefix: T[] = [],
): Generator<T[]> {
  if (!size) {
    yield prefix;
    return;
  }
  for (let i = start; i <= items.length - size; i++)
    yield* choose(items, size - 1, i + 1, [...prefix, items[i]]);
}
export function* product(
  choices: readonly (readonly number[])[],
  prefix: number[] = [],
): Generator<number[]> {
  if (prefix.length === choices.length) {
    yield prefix;
    return;
  }
  for (const value of choices[prefix.length]) yield* product(choices, [...prefix, value]);
}

/** Coordinate labels are resolved to actual declared scopes, never trusted IDs. */
export class ClassicHouses {
  readonly rows: (readonly number[] | undefined)[] = [];
  readonly columns: (readonly number[] | undefined)[] = [];
  readonly boxes: (readonly number[] | undefined)[] = [];
  constructor(readonly view: ReadView) {
    for (let i = 0; i < 9; i++)
      for (const [kind, list] of [
        ["row", this.rows],
        ["column", this.columns],
        ["box", this.boxes],
      ] as const) {
        const cells = Array.from({ length: 81 }, (_, cell) => cell).filter(
          (cell) =>
            (kind === "row" ? Math.floor(cell / 9) : kind === "column" ? cell % 9 : boxOf(cell)) ===
            i,
        );
        list.push(findHouseEqualTo(view, cells)?.cells);
      }
  }
  peer(left: number, right: number): boolean {
    return (
      left !== right &&
      [...this.rows, ...this.columns, ...this.boxes].some(
        (scope) => scope?.includes(left) && scope.includes(right),
      )
    );
  }
  scope(left: number, right: number): readonly number[] {
    const found = [...this.rows, ...this.columns, ...this.boxes].find(
      (scope) => scope?.includes(left) && scope.includes(right),
    );
    if (!found) throw Error("missing-specialized-scope");
    return found;
  }
  house(id: string): readonly number[] {
    const [kind, n] = id.split(":"),
      scope = (
        kind === "row"
          ? this.rows
          : kind === "column"
            ? this.columns
            : kind === "box"
              ? this.boxes
              : []
      )[Number(n)];
    if (!scope) throw Error("missing-specialized-house");
    return scope;
  }
  id(cells: readonly number[]): string {
    for (const [name, list] of [
      ["row", this.rows],
      ["column", this.columns],
      ["box", this.boxes],
    ] as const) {
      const i = list.findIndex((scope) => sameValue(scope, cells));
      if (i >= 0) return `${name}:${i}`;
    }
    throw Error("missing-specialized-house");
  }
}

/** Untrusted, operation-owned finite rows. The checker recomputes every tuple. */
export interface LocalRelation {
  readonly id: number;
  readonly cells: readonly number[];
  readonly rows: readonly (readonly number[])[];
}
export class SpecializedProof {
  readonly wire: ForcingProof;
  readonly houses: ClassicHouses;
  constructor(
    readonly view: ReadView,
    readonly lease?: WorkspaceReservation,
  ) {
    this.wire = new ForcingProof(view, lease);
    this.houses = new ClassicHouses(view);
  }
  get nodes() {
    return this.wire.nodes;
  }
  cover(cells: readonly number[], symbol: number): number {
    const supports = cells.filter((cell) => this.view.state.domains[cell] & bitOf(symbol));
    const source = this.add(
      "support@1",
      [
        this.wire.fact({ kind: "cover", cells, symbol }),
        ...cells.map((cell) => this.view.state.domainFacts[cell]),
      ],
      { kind: "cover", cells: supports, symbol },
    );
    return this.add(
      "cover-clause@1",
      [source],
      clause(supports.map((cell) => ({ cell, symbol, positive: true }))),
    );
  }
  add(
    rule: string,
    premises: readonly number[],
    conclusion: Proposition,
    parameters: any = {},
  ): number {
    return this.wire.add(rule, premises, conclusion, parameters);
  }
  private table(
    rule: string,
    premises: readonly number[],
    cells: readonly number[],
    rows: readonly (readonly number[])[],
    parameters: any = {},
  ): LocalRelation {
    const next = this.wire.nextId;
    return {
      id: this.add(
        rule,
        premises,
        { kind: "table", cells, count: rows.length, definition: next },
        parameters,
      ),
      cells,
      rows,
    };
  }
  scope(cells: readonly number[], house?: readonly number[]): number {
    const selected = sortedCells(cells),
      source = house ?? findHouseWithCells(this.view, ...selected)?.cells;
    if (!source) throw Error("missing-specialized-scope");
    return this.add(
      "all-different-subset@1",
      [this.wire.fact({ kind: "all-different", cells: source })],
      { kind: "all-different", cells: selected },
    );
  }
  *local(
    cells: readonly number[],
    scopes: readonly (readonly number[])[] = [],
    domains?: ReadonlyMap<number, { id: number; mask: number }>,
  ): Generator<SpecializedWork, LocalRelation> {
    const ordered = sortedCells(cells),
      sources = scopes.map((group) => this.scope(group));
    const build = function* (
      this: SpecializedProof,
      masks: number[],
    ): Generator<SpecializedWork, LocalRelation> {
      const choices = masks.map((mask) =>
        this.view.assembly.problem.symbols.filter((symbol) => mask & bitOf(symbol)),
      );
      if (choices.reduce((n, choice) => n * choice.length, 1) > 256) {
        const i = choices.findIndex((value) => value.length > 1),
          left = [...masks],
          right = [...masks];
        left[i] = bitOf(choices[i][0]);
        right[i] &= ~left[i];
        const relation = yield* build.call(this, left),
          b = yield* build.call(this, right);
        this.lease?.grow(0, (relation.rows.length + b.rows.length) * 16);
        return this.table("table-union@1", [relation.id, b.id], ordered, [
          ...relation.rows,
          ...b.rows,
        ]);
      }
      const rows: number[][] = [];
      for (const row of product(choices)) {
        yield specializedWork;
        if (
          scopes.every(
            (group) =>
              new Set(group.map((cell) => row[ordered.indexOf(cell)])).size === group.length,
          )
        ) {
          this.lease?.grow(1, 64 + ordered.length * 16);
          rows.push(row);
        }
      }
      return this.table(
        "table-filter@1",
        [
          ...ordered.map((cell) => domains?.get(cell)?.id ?? this.view.state.domainFacts[cell]),
          ...sources,
        ],
        ordered,
        rows,
        { cells: ordered, box: masks },
      );
    };
    return yield* build.call(
      this,
      ordered.map((cell) => domains?.get(cell)?.mask ?? this.view.state.domains[cell]),
    );
  }

  *join(
    a: LocalRelation,
    b: LocalRelation,
    filters: readonly number[] = [],
  ): Generator<SpecializedWork, LocalRelation> {
    const cells = sortedCells([...a.cells, ...b.cells]),
      shared = a.cells.filter((cell) => b.cells.includes(cell)),
      rows: number[][] = [];
    const constraints = filters.map(
      (id) =>
        this.nodes.find((n) => n.id === id)?.conclusion ?? this.view.facts.get(id)?.proposition,
    );
    for (const left of a.rows)
      for (const right of b.rows) {
        yield specializedWork;
        if (!shared.every((cell) => left[a.cells.indexOf(cell)] === right[b.cells.indexOf(cell)]))
          continue;
        const row = cells.map((cell) =>
          a.cells.includes(cell) ? left[a.cells.indexOf(cell)] : right[b.cells.indexOf(cell)],
        );
        if (
          !constraints.every((proposition) =>
            proposition?.kind === "all-different"
              ? new Set(proposition.cells.map((cell) => row[cells.indexOf(cell)])).size ===
                proposition.cells.length
              : proposition?.kind === "clause" &&
                proposition.alternatives.some(
                  (literal) =>
                    (row[cells.indexOf(literal.cell)] === literal.symbol) === literal.positive,
                ),
          )
        )
          continue;
        this.lease?.grow(1, 64 + cells.length * 16);
        rows.push(row);
      }
    return this.table("table-join-filter@1", [a.id, b.id, ...filters], cells, rows);
  }
  *joinPeers(
    left: LocalRelation,
    right: LocalRelation,
    extra: readonly number[] = [],
  ): Generator<SpecializedWork, LocalRelation> {
    const pairs: number[] = [];
    for (const x of left.cells)
      for (const y of right.cells)
        if (
          x !== y &&
          this.houses.peer(x, y) &&
          !left.cells.includes(y) &&
          !right.cells.includes(x)
        )
          pairs.push(this.scope([x, y]));
    return yield* this.join(left, right, [...pairs, ...extra]);
  }
  project(table: LocalRelation, claim: Proposition): number {
    return this.add("table-project@1", [table.id], claim);
  }
  resolve(left: number, right: number, pivot: Literal): number {
    const get = (id: number) =>
      this.nodes.find((n) => n.id === id)?.conclusion ??
      defined(this.view.facts.get(id), "fact").proposition;
    return this.add(
      "resolution@1",
      [left, right],
      clause([
        ...literals(get(left)).filter((literal) => !sameValue(literal, pivot)),
        ...literals(get(right)).filter(
          (literal) => !sameValue(literal, { ...pivot, positive: !pivot.positive }),
        ),
      ]),
    );
  }
  finish(
    technique: string,
    pattern: unknown,
    effects: readonly Effect[],
    roots: readonly number[],
  ): DeductionProposal {
    const domains = new Map<number, { id: number; mask: number }>(),
      all = [...roots];
    for (const [i, effect] of effects.entries()) {
      const prior = domains.get(effect.cell) ?? {
        id: this.view.state.domainFacts[effect.cell],
        mask: this.view.state.domains[effect.cell],
      };
      const mask =
        effect.kind === "place" ? bitOf(effect.symbol) : prior.mask & ~bitOf(effect.symbol);
      domains.set(effect.cell, {
        id: this.add("domain-restrict@1", [prior.id, roots[i]], {
          kind: "domain",
          cell: effect.cell,
          mask,
        }),
        mask,
      });
    }
    all.push(...[...domains.values()].map((x) => x.id));
    return this.wire.bundle(technique, pattern, effects, all);
  }
}

export interface SpecializedStrategy {
  plans(
    view: ReadView,
    lease?: WorkspaceReservation,
  ): Generator<SpecializedWork | { kind: "plan"; plan: unknown }>;
  compile(
    view: ReadView,
    plan: any,
    lease?: WorkspaceReservation,
  ): Generator<SpecializedWork, DeductionProposal | null>;
  /** A fixed family decomposition, never one job per candidate combination. */
  subfamilies?(): readonly SpecializedStrategy[];
}
interface LiveSpecializedJob {
  readonly strategy: SpecializedStrategy;
  readonly plans: ReturnType<SpecializedStrategy["plans"]>;
  readonly search: WorkspaceReservation;
  compiler?: ReturnType<SpecializedStrategy["compile"]>;
  compilation?: WorkspaceReservation;
  exhausted: boolean;
}
/** At most four internal jobs, one search/current compiler per job. Each round
 * advances each live job once, sharing invocation limits and consumer time. */
export function specializedDescriptor(
  rowId: string,
  strategy: SpecializedStrategy,
  bounds: readonly [number, number, number, number, number],
): TechniqueDescriptor {
  const entry = defined(
    coverageEntries.find((entry) => entry.id === rowId),
    "coverageEntry",
  );
  const eligible = (view: ReadView) =>
    view.assembly.problem.cells.length === 81 &&
    view.assembly.problem.symbols.length === 9 &&
    view.assembly.allDifferent.length > 0
      ? { kind: "yes" as const }
      : {
          kind: "excluded" as const,
          reason: "missing-classic-geometry",
          dependencies: [{ kind: "all" as const }],
        };
  return {
    id: entry.version,
    aliases: entry.aliases,
    tier: entry.tier,
    requires: entry.capabilities,
    assumptionPolicy: entry.assumptionPolicy,
    bounds: {
      maxLength: bounds[0],
      maxBranchDepth: bounds[1],
      maxAlternatives: bounds[2],
      maxPatternCells: bounds[3],
      maxSetSize: bounds[4],
    },
    eligible,
    watches: () => [{ kind: "all" }],
    estimate: () => ({ hit: 1, gain: 1, cost: entry.tier + 1 }),
    *discover(view, context): Discovery {
      const status = eligible(view);
      if (status.kind === "excluded") {
        yield { kind: "excluded", reason: status.reason, dependencies: status.dependencies };
        return;
      }
      const deadline = performance.now() + context.limits.timeMs;
      let work = 0;
      const tick = () => {
        context.workspace.checkpoint();
        if (performance.now() >= deadline) throw Error("specialized-time-limit");
        if (++work > context.limits.workUnits) throw Error("specialized-work-limit");
      };
      let search: WorkspaceReservation | undefined;
      const jobs: LiveSpecializedJob[] = [];
      try {
        search = context.workspace.reserve(1, 2000000);
        const strategies = strategy.subfamilies?.() ?? [strategy];
        if (strategies.length < 1 || strategies.length > 4)
          throw Error("invalid-specialized-job-count");
        for (const subfamily of strategies) {
          const owner = context.workspace.reserve(0, 0);
          try {
            jobs.push({
              strategy: subfamily,
              plans: subfamily.plans(view, owner),
              search: owner,
              exhausted: false,
            });
          } catch (error) {
            owner.dispose();
            throw error;
          }
        }
        while (jobs.some((job) => !job.exhausted))
          for (const job of jobs) {
            if (job.exhausted) continue;
            tick();
            if (job.compiler) {
              const n = job.compiler.next();
              if (!n.done) {
                yield n.value;
                continue;
              }
              job.compiler = undefined;
              try {
                if (n.value) {
                  if (!forcingProofFits(n.value, context.limits))
                    throw Error("specialized-proof-step-limit");
                  yield { kind: "proposal", proposal: n.value };
                }
              } finally {
                defined(job.compilation, "compilation").dispose();
                job.compilation = undefined;
              }
            } else {
              const n = job.plans.next();
              if (n.done) {
                job.exhausted = true;
                job.search.dispose();
                continue;
              }
              if (n.value.kind === "work") {
                yield n.value;
                continue;
              }
              // Capture ownership before invoking the compiler factory. A yielded
              // proposal remains borrowed under this lease until the next resume.
              job.compilation = context.workspace.reserve(0, 65536);
              job.compiler = job.strategy.compile(view, n.value.plan, job.compilation);
            }
          }
        yield { kind: "exhausted" };
      } catch (error) {
        if (error instanceof IndexInterrupted) yield { kind: "interrupted", reason: error.reason };
        else if (
          error instanceof Error &&
          error.message.startsWith("specialized-") &&
          error.message.endsWith("-limit")
        )
          yield {
            kind: "interrupted",
            reason: error.message.slice(12) as "time-limit" | "work-limit" | "proof-step-limit",
          };
        else throw error;
      } finally {
        for (const job of jobs) {
          try {
            job.compiler?.return(null);
            job.plans.return(undefined);
          } finally {
            job.compilation?.dispose();
            job.search.dispose();
          }
        }
        search?.dispose();
      }
    },
  };
}
