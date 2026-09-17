import type { ReadView } from "../state/types";
import type { Effect } from "../proof/types";
import type { Discovery, DiscoveryContext, TechniqueDescriptor } from "./types";
import { coverageEntries } from "./manifest";
import { buildAls, type AlsIndex } from "../indexes/als";
import { buildImplications, type ImplicationIndex } from "../indexes/implications";
import { IndexInterrupted, type WorkspaceReservation } from "../indexes/workspace";
import { PatternGraph } from "./pattern-runtime";
import { candidate, chainProofFits, type ChainWork } from "./chains-certificate";
import {
  AlsCertificate,
  alsMembers,
  alsOverlaps,
  type AlsSet,
  type AlsCandidate,
  type AlsPattern,
  type AlsRoute,
  type AlsProjection,
  type BlossomPattern,
} from "./als-certificate";
import { classicHouseEqualTo, symbolMask } from "../state/read";
import { defined } from "../invariants";

const projection = (set: number, left: number, right: number): AlsProjection => ({
  set,
  symbols: [left, right],
  root: -1,
});
type Cursor = Generator<ChainWork | AlsCandidate>;

/** Invocation-owned ALS recipes and charged RCC cache. Complete implication recipes
 * establish each cross-occurrence conflict; a cached boolean is never a proof. */
export class AlsSearch {
  readonly sets: AlsSet[] = [];
  readonly #rcc = new Map<string, boolean>();
  constructor(
    readonly view: ReadView,
    readonly graph: PatternGraph,
    readonly index: AlsIndex,
  ) {}
  *prepare(): Generator<ChainWork> {
    if (!this.index.completeFor(this.view) || !this.graph.index.completeFor(this.view))
      throw Error("incomplete-als-source-prefix");
    const seen = new Set<string>();
    for (const entry of this.index.entries) {
      yield { kind: "work", units: 1 };
      const source = defined(this.view.facts.get(entry.recipe.source), "fact").proposition;
      if (source.kind !== "all-different") continue;
      const house = classicHouseEqualTo(this.view, source.cells);
      if (!house || seen.has(entry.cells.join())) continue;
      this.graph.lease.grow(1, 1024 + entry.cells.length * entry.symbols.length * 64);
      seen.add(entry.cells.join());
      this.sets.push({
        cells: [...entry.cells],
        symbols: [...entry.symbols],
        house: house.id,
        occurrences: Object.fromEntries(
          entry.occurrences.map((occurrence) => [occurrence.symbol, [...occurrence.cells]]),
        ),
      });
    }
    this.sets.sort(
      (left, right) =>
        left.cells.length - right.cells.length ||
        left.cells.join().localeCompare(right.cells.join()),
    );
  }
  private *rcc(first: number, second: number, symbol: number): Generator<ChainWork, boolean> {
    yield { kind: "work", units: 1 };
    const key = `${Math.min(first, second)}/${Math.max(first, second)}/${symbol}`,
      prior = this.#rcc.get(key);
    if (prior !== undefined) return prior;
    let valid = true;
    // The record is sparse: a symbol absent from the set has no entry.
    const left = this.sets[first].occurrences[symbol] as number[] | undefined,
      right = this.sets[second].occurrences[symbol] as number[] | undefined;
    if (!left || !right) valid = false;
    else
      outer: for (const x of left)
        for (const y of right) {
          yield { kind: "work", units: 1 };
          if (x === y || !this.graph.has(candidate(x, symbol), candidate(y, symbol))) {
            valid = false;
            break outer;
          }
        }
    this.graph.lease.grow(1, 128);
    this.#rcc.set(key, valid);
    return valid;
  }
  private *effects(
    pattern: AlsPattern,
    symbol: number,
    form: AlsRoute["form"],
    selected: number[],
    lockedSet = -1,
  ): Cursor {
    const sequence = selected.map((i) => pattern.rccs[i].symbol);
    let witnesses =
      lockedSet >= 0
        ? alsMembers(pattern.sets, lockedSet, symbol)
        : [
            ...alsMembers(pattern.sets, 0, symbol),
            ...alsMembers(pattern.sets, pattern.sets.length - 1, symbol),
          ];
    witnesses = [
      ...new Map(
        witnesses.map((literal) => [literal.cell + ":" + literal.symbol, literal]),
      ).values(),
    ];
    const projections =
      lockedSet >= 0
        ? [
            projection(lockedSet, sequence[0], symbol),
            projection(lockedSet, sequence[1], symbol),
            projection(1 - lockedSet, sequence[0], sequence[1]),
          ]
        : pattern.sets.map((_, i) =>
            projection(
              i,
              i ? sequence[i - 1] : symbol,
              i === pattern.sets.length - 1 ? symbol : sequence[i],
            ),
          );
    const effects: Effect[] = [];
    for (const cell of this.view.assembly.problem.cells) {
      yield { kind: "work", units: 1 };
      if (this.view.state.values[cell] || !(this.view.state.domains[cell] & symbolMask(symbol)))
        continue;
      let valid = true;
      for (const literal of witnesses) {
        yield { kind: "work", units: 1 };
        if (!this.graph.has(literal, candidate(cell, symbol))) {
          valid = false;
          break;
        }
      }
      if (valid) effects.push({ kind: "remove", cell, symbol });
    }
    if (effects.length)
      yield {
        kind: "candidate",
        effects,
        pattern: {
          ...pattern,
          routes: effects.map(() => ({
            form,
            projections,
            rccs: selected,
            witnesses,
            visibility: [],
            root: -1,
          })),
        },
      };
  }
  /** Two-set XZ includes genuine double-RCC locked-set and locked-union routes. */
  *xz(): Cursor {
    for (let left = 0; left < this.sets.length; left++)
      for (let right = left + 1; right < this.sets.length; right++) {
        yield { kind: "work", units: 1 };
        const common = this.sets[left].symbols.filter((symbol) =>
            this.sets[right].symbols.includes(symbol),
          ),
          restricted: number[] = [];
        for (const symbol of common)
          if (yield* this.rcc(left, right, symbol)) restricted.push(symbol);
        const sets = [this.sets[left], this.sets[right]],
          base = {
            kind: "als" as const,
            alias: "ALS-XZ" as const,
            sets,
            overlaps: alsOverlaps(sets),
            routes: [],
          };
        for (const x of restricted)
          for (const zDigit of common.filter((symbol) => symbol !== x))
            yield* this.effects(
              { ...base, rccs: [{ left: 0, right: 1, symbol: x, roots: [] }] },
              zDigit,
              "path",
              [0],
            );
        for (let x = 0; x < restricted.length; x++)
          for (let y = x + 1; y < restricted.length; y++) {
            const rccs = [restricted[x], restricted[y]].map((symbol) => ({
                left: 0,
                right: 1,
                symbol,
                roots: [],
              })),
              pattern = { ...base, rccs };
            for (let side = 0; side < 2; side++)
              for (const symbol of sets[side].symbols.filter(
                (digit) => !rccs.some((row) => row.symbol === digit),
              ))
                yield* this.effects(pattern, symbol, "locked", [0, 1], side);
            for (let i = 0; i < 2; i++)
              yield* this.effects(pattern, rccs[i].symbol, "rcc", [1 - i]);
          }
      }
  }
  /** Increasing set count and canonical simple paths; extension work is always visible. */
  *chains(xy: boolean): Cursor {
    const visit = function* (
      this: AlsSearch,
      path: number[],
      links: number[],
      length: number,
    ): Cursor {
      yield { kind: "work", units: 1 };
      if (path.length === length) {
        const first = this.sets[path[0]],
          last = this.sets[defined(path.at(-1), "path")];
        const sets = path.map((i) => this.sets[i]);
        for (const zDigit of first.symbols.filter(
          (symbol) =>
            last.symbols.includes(symbol) && symbol !== links[0] && symbol !== links.at(-1),
        )) {
          const pattern: AlsPattern = {
            kind: "als",
            alias: xy ? "ALS-XY-Wing" : "ALS chains",
            sets,
            overlaps: alsOverlaps(sets),
            rccs: links.map((symbol, i) => ({ left: i, right: i + 1, symbol, roots: [] })),
            routes: [],
          };
          yield* this.effects(
            pattern,
            zDigit,
            "path",
            links.map((_, i) => i),
          );
        }
        return;
      }
      const from = defined(path.at(-1), "path");
      for (let next = 0; next < this.sets.length; next++) {
        yield { kind: "work", units: 1 };
        if (path.includes(next)) continue;
        for (const symbol of this.sets[from].symbols) {
          yield { kind: "work", units: 1 };
          if (
            symbol === links.at(-1) ||
            !this.sets[next].symbols.includes(symbol) ||
            !(yield* this.rcc(from, next, symbol))
          )
            continue;
          yield* visit.call(this, [...path, next], [...links, symbol], length);
        }
      }
    };
    for (let length = xy ? 3 : 2; length <= (xy ? 3 : 6); length++)
      for (let start = 0; start < this.sets.length; start++)
        yield* visit.call(this, [start], [], length);
  }
  /** One cursor per stem size prevents numerous bivalue stems starving size four. */
  *blossoms(size: number): Cursor {
    const scratch = this.graph.context.workspace.reserve(0, 8192 + this.sets.length * size * 48);
    try {
      for (const stem of this.view.assembly.problem.cells) {
        yield { kind: "work", units: 1 };
        const symbols = this.view.assembly.problem.symbols.filter(
          (symbol) => this.view.state.domains[stem] & symbolMask(symbol),
        );
        if (this.view.state.values[stem] || symbols.length !== size) continue;
        for (const zDigit of this.view.assembly.problem.symbols.filter(
          (symbol) => !symbols.includes(symbol),
        )) {
          const choices: number[][] = symbols.map(() => []);
          for (let i = 0; i < symbols.length; i++)
            for (let set = 0; set < this.sets.length; set++) {
              yield { kind: "work", units: 1 };
              const als = this.sets[set];
              if (
                als.cells.includes(stem) ||
                !als.symbols.includes(symbols[i]) ||
                !als.symbols.includes(zDigit)
              )
                continue;
              let valid = true;
              for (const cell of als.occurrences[symbols[i]]) {
                yield { kind: "work", units: 1 };
                if (!this.graph.has(candidate(stem, symbols[i]), candidate(cell, symbols[i]))) {
                  valid = false;
                  break;
                }
              }
              if (valid) choices[i].push(set);
            }
          // Every branch must exclude the same target. Filter before the Cartesian
          // product so unproductive petal combinations do not hide other stem sizes.
          for (const cell of this.view.assembly.problem.cells) {
            yield { kind: "work", units: 1 };
            if (
              this.view.state.values[cell] ||
              !(this.view.state.domains[cell] & symbolMask(zDigit))
            )
              continue;
            const local: number[][] = choices.map(() => []);
            for (let i = 0; i < choices.length; i++)
              for (const set of choices[i]) {
                yield { kind: "work", units: 1 };
                let valid = true;
                for (const occurrence of this.sets[set].occurrences[zDigit]) {
                  yield { kind: "work", units: 1 };
                  if (!this.graph.has(candidate(occurrence, zDigit), candidate(cell, zDigit))) {
                    valid = false;
                    break;
                  }
                }
                if (valid) local[i].push(set);
              }
            if (local.some((xs) => !xs.length)) continue;
            const combine = function* (this: AlsSearch, selected: number[]): Cursor {
              yield { kind: "work", units: 1 };
              if (selected.length !== symbols.length) {
                for (const set of local[selected.length])
                  yield* combine.call(this, [...selected, set]);
                return;
              }
              const unique = [...new Set(selected)],
                sets = unique.map((i) => this.sets[i]),
                petals = selected.map((i) => unique.indexOf(i));
              const pattern: BlossomPattern = {
                kind: "blossom",
                alias: "Death Blossom",
                sets,
                overlaps: alsOverlaps(sets),
                stem,
                symbols,
                petals,
                cover: -1,
                branches: [
                  symbols.map((symbol, i) => ({
                    symbol,
                    petal: petals[i],
                    projection: projection(petals[i], symbol, zDigit),
                    conflicts: [],
                    visibility: [],
                    assumption: -1,
                    root: -1,
                  })),
                ],
              };
              yield {
                kind: "candidate",
                pattern: pattern,
                effects: [{ kind: "remove", cell, symbol: zDigit }],
              };
            };
            yield* combine.call(this, []);
          }
        }
      }
    } finally {
      scratch.dispose();
    }
  }
}

/** Descriptor lifecycle owns both transferred indexes, live subcursors and one
 * proposal lease. Consumers retaining a yielded proposal must reserve their copy. */
export function alsDescriptor(id: "C18" | "C19"): TechniqueDescriptor {
  const entry = defined(
    coverageEntries.find((entry) => entry.id === id),
    "coverageEntry",
  );
  return Object.freeze({
    id: entry.version,
    aliases: entry.aliases,
    tier: entry.tier,
    requires: entry.capabilities,
    assumptionPolicy: entry.assumptionPolicy,
    bounds: {
      maxLength: id === "C19" ? 24 : 0,
      maxBranchDepth: id === "C19" ? 1 : 0,
      maxAlternatives: id === "C19" ? 4 : 9,
      maxPatternCells: id === "C19" ? 31 : 15,
      maxSetSize: 5,
    },
    watches: () => [{ kind: "all" as const }],
    eligible: () => ({ kind: "yes" as const }),
    estimate: () => ({ hit: 1, gain: 1, cost: 9 }),
    *discover(view: ReadView, context: DiscoveryContext): Discovery {
      let implications: ImplicationIndex | undefined,
        als: AlsIndex | undefined,
        lease: WorkspaceReservation | undefined,
        work = 0;
      const cursors: Cursor[] = [];
      const tick = () => {
        context.workspace.checkpoint();
        if (++work > context.limits.workUnits) throw Error("als-work-limit");
      };
      try {
        for (const event of buildImplications(view, context.workspace)) {
          if (event.kind === "ready") implications = event.value; // Capture ownership BEFORE a throwing checkpoint.
          tick();
          if (event.kind !== "ready") {
            yield event;
            if (event.kind === "interrupted") return;
          }
        }
        for (const event of buildAls(view, context.workspace)) {
          if (event.kind === "ready") als = event.value;
          tick();
          if (event.kind !== "ready") {
            yield event;
            if (event.kind === "interrupted") return;
          }
        }
        if (!implications?.completeFor(view) || !als?.completeFor(view))
          throw Error("incomplete-als-source-prefix");
        lease = context.workspace.reserve(0, 65536);
        const graph = new PatternGraph(implications, context, lease);
        for (const event of graph.prepare(view)) {
          tick();
          yield event;
        }
        const search = new AlsSearch(view, graph, als);
        for (const event of search.prepare()) {
          tick();
          yield event;
        }
        cursors.push(
          ...(id === "C18"
            ? [search.xz(), search.chains(true)]
            : [search.chains(false), search.blossoms(2), search.blossoms(3), search.blossoms(4)]),
        );
        while (cursors.length)
          for (let i = 0; i < cursors.length; i++) {
            tick();
            const next = cursors[i].next();
            if (next.done) {
              cursors.splice(i--, 1);
              continue;
            }
            if (next.value.kind === "work") {
              yield next.value;
              continue;
            }
            graph.compilation = context.workspace.reserve(0, 65536);
            const compiler = new AlsCertificate(view, graph).compile(
              next.value.pattern,
              next.value.effects,
            );
            try {
              for (;;) {
                tick();
                const step = compiler.next();
                if (step.done) {
                  if (!chainProofFits(step.value, context.limits)) {
                    yield { kind: "interrupted", reason: "proof-step-limit" };
                    return;
                  }
                  yield { kind: "proposal", proposal: step.value };
                  break;
                }
                yield step.value;
              }
            } finally {
              compiler.return(undefined as never);
              graph.compilation.dispose();
              graph.compilation = undefined;
            }
          }
        yield { kind: "exhausted" };
      } catch (error) {
        if (error instanceof IndexInterrupted) yield { kind: "interrupted", reason: error.reason };
        else if (error instanceof Error && error.message === "als-work-limit")
          yield { kind: "interrupted", reason: "work-limit" };
        else throw error;
      } finally {
        cursors.forEach((cursor) => cursor.return(undefined));
        lease?.dispose();
        als?.dispose();
        implications?.dispose();
      }
    },
  });
}
