import { matchingFacts } from "../state/source-index";
import type { Json } from "../problem";
import type { ReadView } from "../state/types";
import type { DeductionProposal, Effect, ProofNode, Proposition } from "../proof/types";
import type { Discovery, DiscoveryContext, DiscoveryEvent, TechniqueDescriptor } from "./types";
import { IndexInterrupted, type WorkspaceReservation } from "../indexes/workspace";
import { clause } from "../proof/primitives";
import { assertOwnedView } from "../state/candidates";
import { coverageEntry } from "./manifest";
import {
  fishHouse,
  fishNames,
  mixedFishForm,
  type FishComponent,
  type FishPattern,
} from "./fish-grammar";
import { houseCells, houseWithCells, symbolMask } from "../state/read";
import { defined } from "../invariants";

type Work = { kind: "work"; units: number };
/** Running work total against the operation's allowance. */
class WorkMeter {
  used = 0;
  constructor(readonly limit: number) {}
  exceeded(units: number): boolean {
    this.used += units;
    return this.used > this.limit;
  }
}
type Candidate = { pattern: FishPattern; effects: readonly Effect[] };
type CountTerm = { premise: number; coefficient: number };
/** What one fish component contributes to a cover-count root. */
interface FishRequirement {
  /** Cover incidence minus base incidence per cell. */
  readonly coefficients: readonly number[];
  readonly effects: readonly Effect[];
  readonly covers: readonly CountTerm[];
  readonly capacities: readonly CountTerm[];
}
const literal = (cell: number, symbol: number, positive: boolean): Proposition => ({
  kind: "literal",
  value: { cell, symbol, positive },
});
function classicScopes(view: ReadView) {
  return view.assembly.allDifferent.filter((house) => {
    try {
      fishHouse(view, house.id);
      return true;
    } catch {
      return false;
    }
  });
}
function sourceKey(cells: readonly number[], symbol: number) {
  return cells.join() + "/" + symbol;
}
/** Invocation-local recipe lookup; primitive checking authenticates every ID. */
class FishSources {
  readonly ids = new Map<string, number>();
  next = 0;
  constructor(
    readonly view: ReadView,
    readonly lease: WorkspaceReservation,
  ) {}
  *prepare(): Generator<Work> {
    for (const [id, fact] of this.view.facts) {
      yield { kind: "work", units: 1 };
      this.next = Math.max(this.next, id + 1);
      const proposition = fact.proposition;
      if (
        (proposition.kind !== "cover" && proposition.kind !== "all-different") ||
        fact.openAssumptions.length
      )
        continue;
      const key = sourceKey(
        proposition.cells,
        proposition.kind === "cover" ? proposition.symbol : 0,
      );
      if (!this.ids.has(key)) {
        this.lease.grow(1, 512);
        this.ids.set(key, id);
      }
    }
  }
  has(cells: readonly number[], symbol = 0): boolean {
    return this.ids.has(sourceKey(cells, symbol));
  }
  source(id: string, symbol = 0): number {
    const cells = houseCells(this.view, id),
      value = this.ids.get(cells.join() + "/" + symbol);
    if (value === undefined) throw Error("fish-missing-source");
    return value;
  }
}

/** Compiler owns only its proposal lease. House/domain IDs remain borrowed facts.
 * For w=cover-base and equal house counts, sum(w*x)<=0. All negative w cells
 * need x=0; target w>0 then implies not-target. Overlaps retain multiplicity.
 */
class FishCompiler {
  readonly nodes: ProofNode[] = [];
  readonly imports = new Set<number>();
  readonly roots: number[] = [];
  next: number;
  constructor(
    readonly view: ReadView,
    readonly lease: WorkspaceReservation,
    readonly sources: FishSources,
  ) {
    this.next = sources.next;
  }
  add(
    rule: string,
    premises: number[],
    conclusion: Proposition,
    parameters: Json = {},
    scope: number[] = [],
  ): number {
    this.lease.grow(1, 4096 + premises.length * 32);
    const id = this.next++;
    premises.filter((id) => this.view.facts.has(id)).forEach((id) => this.imports.add(id));
    this.nodes.push({ id, rule, premises, conclusion, parameters, scope });
    return id;
  }
  source(house: string, symbol?: number): number {
    return this.sources.source(house, symbol);
  }
  *compile(technique: string, candidate: Candidate): Generator<Work, DeductionProposal> {
    const parts =
      "components" in candidate.pattern ? candidate.pattern.components : [candidate.pattern];
    const effectRoots = new Map<number, number>();
    for (const part of parts) {
      const requirement = this.requirementOf(part, candidate.effects);
      for (const effect of requirement.effects) {
        yield { kind: "work", units: 1 };
        const root = yield* this.proveEffect(part, requirement, effect);
        this.roots.push(root);
        effectRoots.set(effect.cell, root);
      }
    }
    for (const effect of candidate.effects) {
      yield { kind: "work", units: 1 };
      const root = defined(effectRoots.get(effect.cell), "fish-effect-root");
      this.roots.push(
        this.add("domain-restrict@1", [this.view.state.domainFacts[effect.cell], root], {
          kind: "domain",
          cell: effect.cell,
          mask: this.view.state.domains[effect.cell] & ~symbolMask(effect.symbol),
        }),
      );
    }
    return {
      technique,
      state: this.view.state.key,
      pattern: candidate.pattern as unknown as Json,
      effects: candidate.effects,
      proof: {
        state: this.view.state.key,
        nodes: this.nodes,
        imports: [...this.imports].sort((left, right) => left - right),
        roots: this.roots,
      },
    };
  }
  /** Cover-minus-base coefficients of one component and the effects it can justify. */
  private requirementOf(part: FishComponent, effects: readonly Effect[]): FishRequirement {
    const baseCount = Array(81).fill(0) as number[],
      coverCount = Array(81).fill(0) as number[];
    for (const id of part.bases) for (const cell of houseCells(this.view, id)) baseCount[cell]++;
    for (const id of part.covers) for (const cell of houseCells(this.view, id)) coverCount[cell]++;
    const seesEveryFin = (cell: number) =>
      part.fins.every((fin) => fin !== cell && this.view.assembly.peers[cell].includes(fin));
    return {
      coefficients: coverCount.map((cover, cell) => cover - baseCount[cell]),
      effects: effects.filter(
        (effect) =>
          coverCount[effect.cell] > baseCount[effect.cell] &&
          seesEveryFin(effect.cell) &&
          (part.alias !== "Cannibalistic fish" || baseCount[effect.cell] > 0),
      ),
      covers: part.bases.map((id) => ({ premise: this.source(id, part.symbol), coefficient: 1 })),
      capacities: part.covers.map((id) => ({ premise: this.source(id), coefficient: 1 })),
    };
  }
  /** One cover-count root for the effect; finned components assume the target
   * first, exclude every fin through a shared house, and discharge. */
  private *proveEffect(
    part: FishComponent,
    requirement: FishRequirement,
    effect: Effect,
  ): Generator<Work, number> {
    const symbol = part.symbol;
    const assumption = part.fins.length
      ? this.add("assume@1", [], literal(effect.cell, symbol, true))
      : undefined;
    const scope = assumption === undefined ? [] : [assumption];
    const domains = new Map<number, number>();
    for (let cell = 0; cell < 81; cell++)
      if (requirement.coefficients[cell] < 0) domains.set(cell, this.view.state.domainFacts[cell]);
    if (assumption !== undefined)
      for (const fin of part.fins) {
        yield { kind: "work", units: 1 };
        domains.set(fin, this.excludeFin(fin, effect.cell, symbol, assumption, scope));
      }
    let root = this.add(
      "cover-count@1",
      [
        ...requirement.covers.map((entry) => entry.premise),
        ...requirement.capacities.map((entry) => entry.premise),
        ...domains.values(),
      ],
      literal(effect.cell, symbol, false),
      { symbol, covers: requirement.covers, capacities: requirement.capacities },
      scope,
    );
    if (assumption !== undefined) {
      const conflict = this.add(
        "contradiction@1",
        [assumption, root],
        { kind: "false" },
        {},
        scope,
      );
      root = this.add("discharge@1", [assumption, conflict], literal(effect.cell, symbol, false));
    }
    return root;
  }
  /** Under the assumed target, the fin cannot hold the symbol: a restricted domain fact. */
  private excludeFin(
    fin: number,
    target: number,
    symbol: number,
    assumption: number,
    scope: number[],
  ): number {
    const house = houseWithCells(this.view, fin, target);
    const weak = this.add(
      "weak-link@1",
      [this.source(house.id)],
      clause([
        { cell: fin, symbol, positive: false },
        { cell: target, symbol, positive: false },
      ]),
      {},
      scope,
    );
    const negative = this.add(
      "resolution@1",
      [assumption, weak],
      literal(fin, symbol, false),
      {},
      scope,
    );
    return this.add(
      "domain-restrict@1",
      [this.view.state.domainFacts[fin], negative],
      { kind: "domain", cell: fin, mask: this.view.state.domains[fin] & ~symbolMask(symbol) },
      {},
      scope,
    );
  }
}

function* combinations<T>(
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
    yield* combinations(items, size - 1, i + 1, [...prefix, items[i]]);
}
interface House {
  id: string;
  cells: readonly number[];
  support: readonly number[];
}
interface SymbolGeometry {
  readonly symbol: number;
  /** Cells whose domain still holds the symbol. */
  readonly current: readonly number[];
  readonly houses: readonly House[];
  /** For each index into `current`, the other current cells it sees. */
  readonly peers: readonly Set<number>[];
}
interface SiameseComponent {
  readonly pattern: FishComponent;
  readonly effects: readonly Effect[];
  readonly shared: boolean;
  readonly deferred: boolean;
}
/** Everything one base set shares across its cover sets. */
interface SearchPass {
  readonly n: number;
  readonly equalEffects: boolean;
  readonly sharedHouses: boolean;
  readonly paired: boolean;
  readonly deferred: boolean;
  readonly simple: boolean;
  readonly geometry: SymbolGeometry;
  readonly bases: readonly House[];
  readonly baseCount: readonly number[];
  readonly parts: SiameseComponent[];
  readonly pairLease: WorkspaceReservation;
}
const boxOf = (cell: number): number => Math.floor(cell / 27) * 3 + Math.floor((cell % 9) / 3);
/** How many of the houses contain the cell. */
function incidenceOf(houses: readonly House[], cell: number): number {
  return houses.reduce((total, house) => total + Number(house.cells.includes(cell)), 0);
}
function sameEffectCells(left: readonly Effect[], right: readonly Effect[]): boolean {
  return left.length === right.length && left.every((effect, i) => effect.cell === right[i].cell);
}
/** Owns deterministic service and closure for a finite set of family cursors. */
export class FishCursorSet<T> {
  constructor(readonly cursors: readonly Generator<T, void, void>[]) {}
  *events(): Generator<T, void, void> {
    const active = new Set(this.cursors);
    try {
      while (active.size)
        for (const cursor of active) {
          const next = cursor.next();
          if (next.done) active.delete(cursor);
          else yield next.value;
        }
    } finally {
      for (const cursor of this.cursors) cursor.return();
    }
  }
}
/** Exhaustive finite combinations, ordered to examine unresolved houses first.
 * Solved/redundant houses are deferred, never dropped: density/size names can
 * remain valid even when a smaller fish proves the same removal.
 */
class FishSearch {
  constructor(
    readonly view: ReadView,
    readonly family: string,
    readonly context: DiscoveryContext,
    readonly sources: FishSources,
    readonly reaches?: (symbol: number, target: number, fin: number) => boolean,
    readonly maximum?: number,
  ) {}
  *ordered(houses: readonly House[], n: number): Generator<House[]> {
    const preferred = houses.filter((house) =>
        house.support.every((cell) => !this.view.state.values[cell]),
      ),
      other = houses.filter((house) => !preferred.includes(house));
    for (let count = 0; count <= n; count++)
      for (const preferredSet of combinations(preferred, n - count))
        for (const otherSet of combinations(other, count))
          yield [...preferredSet, ...otherSet].sort((left, right) =>
            left.id.localeCompare(right.id),
          );
  }
  /** Enumerate house sets, never candidate assignments. Every admissible count
   * must cover each base occurrence not visible to its target, and the target
   * needs capacity greater than its base multiplicity. Branch on a still-unmet
   * house incidence (at most three classic houses); sibling exclusions make
   * each set unique for that target. A per-base set removes cross-target copies.
   */
  *coverSets(
    houses: readonly House[],
    n: number,
    current: readonly number[],
    base: readonly number[],
    peers: readonly Set<number>[],
    lease: WorkspaceReservation,
  ): Generator<Work | House[]> {
    const seen = new Set<string>();
    for (let target = 0; target < current.length; target++) {
      yield { kind: "work", units: 1 };
      if (
        this.view.state.values[current[target]] ||
        base.some((count, i) => count > 1 && !peers[target].has(current[i]))
      )
        continue;
      const required = current.flatMap((cell, i) =>
        i === target
          ? [{ cell, count: base[i] + 1 }]
          : base[i] && !peers[target].has(cell)
            ? [{ cell, count: base[i] }]
            : [],
      );
      const options = required.map((requirement) =>
        houses
          .map((house, i) => (house.cells.includes(requirement.cell) ? i : -1))
          .filter((i) => i >= 0),
      );
      const visit = function* (chosen: number[], excluded: Set<number>): Generator<Work | House[]> {
        yield { kind: "work", units: 1 };
        let pivot = -1,
          best: number[] = [];
        for (let index = 0; index < required.length; index++) {
          const deficit =
            required[index].count - options[index].filter((i) => chosen.includes(i)).length;
          if (deficit <= 0) continue;
          const remaining = options[index].filter((i) => !chosen.includes(i) && !excluded.has(i));
          if (remaining.length < deficit || chosen.length + deficit > n) return;
          if (pivot < 0 || remaining.length < best.length) {
            pivot = index;
            best = remaining;
          }
        }
        if (pivot < 0) {
          const available = houses
            .map((_, i) => i)
            .filter((i) => !chosen.includes(i) && !excluded.has(i));
          for (const extra of combinations(available, n - chosen.length)) {
            const selected = [...chosen, ...extra].sort((left, right) => left - right),
              key = selected.join();
            yield { kind: "work", units: 1 };
            if (seen.has(key)) continue;
            lease.grow(1, 256);
            seen.add(key);
            yield selected.map((i) => houses[i]);
          }
          return;
        }
        const skip = new Set(excluded);
        for (const option of best) {
          yield* visit([...chosen, option], skip);
          skip.add(option);
        }
      };
      yield* visit([], new Set());
    }
  }
  *patterns(): Generator<Work | Candidate> {
    const max = this.maximum ?? (["C06", "C07"].includes(this.family) ? 7 : 4);
    // Distinct-effect Siamese explanations precede equal-effect presentations.
    // The latter remain in a complete second pass, with all repeated work paid.
    const simple = ["C06", "C07"].includes(this.family);
    for (const sharedHouses of simple ? [false] : [false, true])
      for (const equalEffects of this.family === "C09" ? [false, true] : [false]) {
        const modes = this.family === "C09" ? (equalEffects ? [true] : [false, true]) : [false];
        const cursors = Array.from({ length: max - 1 }, (_, i) =>
          (simple ? [false] : [false, true]).flatMap((overlap) =>
            modes.map((paired) =>
              this.sizePatterns(i + 2, equalEffects, sharedHouses, overlap, paired),
            ),
          ),
        ).flat();
        yield* new FishCursorSet(cursors).events();
      }
  }
  /** Cells still holding `symbol`, the classic houses with their live support
   * for it, and which of those cells see each other. `undefined` once every
   * candidate cell is already placed. */
  private symbolGeometry(symbol: number): SymbolGeometry | undefined {
    const bit = symbolMask(symbol);
    const current = this.view.assembly.problem.cells.filter(
      (cell) => this.view.state.domains[cell] & bit,
    );
    if (current.every((cell) => this.view.state.values[cell])) return undefined;
    // At most 27*9 cells and 81*81 peer flags; paid by the invocation lease.
    const houses = classicScopes(this.view)
      .filter((house) => this.sources.has(house.cells))
      .map((house) => ({
        id: house.id,
        cells: house.cells,
        support: house.cells.filter((cell) => this.view.state.domains[cell] & bit),
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
    const sees = (cell: number, other: number) =>
      this.reaches
        ? this.reaches(symbol, cell, other)
        : this.view.assembly.allDifferent.some(
            (house) => house.cells.includes(cell) && house.cells.includes(other),
          );
    const peers = current.map(
      (cell) => new Set(current.filter((other) => cell !== other && sees(cell, other))),
    );
    return { symbol, current, houses, peers };
  }
  /** Base and cover candidates for one orientation; the second pass admits solved houses. */
  private housePools(
    houses: readonly House[],
    symbol: number,
    orientation: string,
    deferred: boolean,
    simple: boolean,
  ): { basePool: readonly House[]; coverPool: readonly House[] } {
    const available = deferred
      ? houses
      : houses.filter((house) => house.support.every((cell) => !this.view.state.values[cell]));
    const basePool = available.filter(
      (house) =>
        this.sources.has(house.cells, symbol) &&
        (!simple || house.id.startsWith(orientation + ":")),
    );
    const crossing = orientation === "row" ? "column" : "row";
    const coverPool = simple
      ? available.filter((house) => house.id.startsWith(crossing + ":"))
      : available;
    return { basePool, coverPool };
  }
  /** A fair cursor per supported size avoids claiming later sizes exhausted
   * merely because smaller Siamese pairs consume the operation's allowance. */
  *sizePatterns(
    n: number,
    equalEffects: boolean,
    sharedHouses: boolean,
    overlap: boolean,
    paired: boolean,
  ): Generator<Work | Candidate> {
    const scratch = this.context.workspace.reserve(0, 131072);
    try {
      const simple = this.family === "C06" || this.family === "C07";
      // Across all sizes/symbols, first examine houses without an already placed
      // symbol. The second pass includes every remaining combination exactly once.
      for (const deferred of [false, true])
        for (const symbol of this.view.assembly.problem.symbols) {
          const geometry = this.symbolGeometry(symbol);
          if (!geometry) continue;
          for (const orientation of simple ? ["row", "column"] : ["mixed"]) {
            const pools = this.housePools(geometry.houses, symbol, orientation, deferred, simple);
            for (const bases of this.ordered(pools.basePool, n)) {
              yield { kind: "work", units: 1 };
              const baseCount = geometry.current.map((cell) => incidenceOf(bases, cell));
              if (!simple && baseCount.some((value) => value > 1) !== overlap) continue;
              // Siamese pairs retain only the current base set and release on each step.
              const pairLease = this.context.workspace.reserve(0, 1024);
              const pass: SearchPass = {
                n,
                equalEffects,
                sharedHouses,
                paired,
                deferred,
                simple,
                geometry,
                bases,
                baseCount,
                parts: [],
                pairLease,
              };
              try {
                const coverCursor = simple
                  ? this.ordered(pools.coverPool, n)
                  : this.coverSets(
                      pools.coverPool,
                      n,
                      geometry.current,
                      baseCount,
                      geometry.peers,
                      pairLease,
                    );
                for (const coverEvent of coverCursor) {
                  if (!Array.isArray(coverEvent)) {
                    yield coverEvent;
                    continue;
                  }
                  yield* this.coverPatterns(pass, coverEvent);
                }
              } finally {
                pairLease.dispose();
              }
            }
          }
        }
    } finally {
      scratch.dispose();
    }
  }
  /** Candidates for one base/cover pair, plus Siamese pairings with earlier components. */
  private *coverPatterns(pass: SearchPass, covers: readonly House[]): Generator<Work | Candidate> {
    const { n, deferred, simple, geometry, bases, baseCount, parts } = pass;
    const { symbol, current, peers } = geometry;
    yield { kind: "work", units: 1 };
    const selectedShared = bases.some((house) => covers.some((cover) => house.id === cover.id));
    const selectedDeferred = [...bases, ...covers].some((house) =>
      house.support.some((cell) => this.view.state.values[cell]),
    );
    // Later Siamese passes must retain earlier components too, so pairs
    // crossing an ordering partition are neither lost nor duplicated.
    if (
      !simple &&
      (this.family === "C09"
        ? !pass.sharedHouses && selectedShared
        : selectedShared !== pass.sharedHouses)
    )
      return;
    if (deferred && !selectedDeferred && this.family !== "C09") return;
    const coverCount = current.map((cell) => incidenceOf(covers, cell));
    const finIndexes = baseCount.flatMap((count, i) =>
      count > 1 || (count > 0 && coverCount[i] === 0) ? [i] : [],
    );
    if (finIndexes.length > (this.family === "C06" ? 0 : 4)) return;
    const fins = finIndexes.map((i) => current[i]);
    if (this.family === "C07" && (!fins.length || new Set(fins.map(boxOf)).size !== 1)) return;
    const effects = current.flatMap((cell, i) =>
      coverCount[i] > baseCount[i] &&
      !this.view.state.values[cell] &&
      finIndexes.every((j) => peers[i].has(current[j]))
        ? [{ kind: "remove" as const, cell, symbol }]
        : [],
    );
    if (!effects.length) return;
    const pattern = this.describeComponent(n, symbol, bases, covers, fins, simple);
    if (this.family !== "C09") {
      yield { pattern, effects };
      return;
    }
    const ownPass = selectedShared === pass.sharedHouses && (!deferred || selectedDeferred);
    if (ownPass && !pass.paired && finIndexes.some((i) => baseCount[i] > 1))
      yield { pattern: { ...pattern, alias: "Endo-fin fish" }, effects };
    const cannibal = effects.filter((effect) => baseCount[current.indexOf(effect.cell)] > 0);
    if (ownPass && !pass.paired && cannibal.length)
      yield { pattern: { ...pattern, alias: "Cannibalistic fish" }, effects: cannibal };
    if (!pass.paired) return;
    const component: SiameseComponent = {
      pattern,
      effects,
      shared: selectedShared,
      deferred: selectedDeferred,
    };
    yield* this.siamesePairs(pass, component);
    pass.pairLease.grow(1, 8192);
    parts.push(component);
  }
  /** Pairs the component with every retained earlier component of the same base set. */
  private *siamesePairs(
    pass: SearchPass,
    component: SiameseComponent,
  ): Generator<Work | Candidate> {
    const { pattern, effects } = component;
    for (const previous of pass.parts) {
      yield { kind: "work", units: 1 };
      if (
        (previous.shared || component.shared) !== pass.sharedHouses ||
        (pass.deferred && !previous.deferred && !component.deferred)
      )
        continue;
      if (new Set([...previous.pattern.fins, ...pattern.fins]).size > 4) continue;
      if (sameEffectCells(previous.effects, effects) !== pass.equalEffects) continue;
      const union = [
        ...new Map(
          [...previous.effects, ...effects].map((effect) => [effect.cell, effect]),
        ).values(),
      ].sort((left, right) => left.cell - right.cell);
      yield {
        pattern: {
          alias: "Siamese fish",
          size: pass.n,
          symbol: pattern.symbol,
          components: [previous.pattern, pattern],
        },
        effects: union,
      };
    }
  }
  /** Names the form of one component; mixed families also record cover-minus-base incidence. */
  private describeComponent(
    n: number,
    symbol: number,
    bases: readonly House[],
    covers: readonly House[],
    fins: readonly number[],
    simple: boolean,
  ): FishComponent {
    const baseIds = bases.map((house) => house.id),
      coverIds = covers.map((house) => house.id);
    const sashimi = bases.some(
      (house) => house.support.filter((cell) => !fins.includes(cell)).length < 2,
    );
    const form = simple
      ? this.family === "C06"
        ? "basic"
        : sashimi
          ? "sashimi"
          : "finned"
      : mixedFishForm(baseIds, coverIds);
    const alias = simple
      ? form === "basic"
        ? fishNames[n]
        : form === "finned"
          ? "Finned fish"
          : "Sashimi fish"
      : form === "franken"
        ? "Franken fish"
        : "Mutant fish";
    const incidence = simple
      ? {}
      : {
          incidence: Array.from(
            { length: 81 },
            (_, cell) => incidenceOf(covers, cell) - incidenceOf(bases, cell),
          ),
        };
    return { alias, form, size: n, symbol, bases: baseIds, covers: coverIds, fins, ...incidence };
  }
}

class FishTechnique implements TechniqueDescriptor {
  readonly id: string;
  readonly aliases: readonly string[];
  readonly tier: number;
  readonly requires: readonly string[];
  readonly assumptionPolicy: "unconditional" | "discharged";
  readonly bounds;
  constructor(readonly family: string) {
    const entry = coverageEntry(family);
    this.id = entry.version;
    this.aliases = entry.aliases;
    this.tier = entry.tier;
    this.requires = entry.capabilities;
    this.assumptionPolicy = family === "C06" ? "unconditional" : "discharged";
    this.bounds = Object.freeze({
      maxLength: 0,
      maxBranchDepth: family === "C06" ? 0 : 1,
      maxAlternatives: family === "C06" ? 9 : 2,
      maxPatternCells: 81,
      maxSetSize: ["C06", "C07"].includes(family) ? 7 : 4,
    });
  }
  watches() {
    return [{ kind: "all" as const }];
  }
  eligible(view: ReadView) {
    const has = (cells: readonly number[], symbol: number) =>
      matchingFacts(
        view,
        symbol ? { kind: "cover", cells, symbol } : { kind: "all-different", cells },
      ).some((fact) => !fact.openAssumptions.length);
    const houses = classicScopes(view).filter((house) => has(house.cells, 0)),
      simple = ["C06", "C07"].includes(this.family);
    const possible = view.assembly.problem.symbols.some((symbol) => {
      const bases = houses.filter((house) => has(house.cells, symbol));
      return simple
        ? ["row", "column"].some(
            (orientation) =>
              bases.filter((house) => house.id.startsWith(orientation + ":")).length >= 2 &&
              houses.filter((house) =>
                house.id.startsWith((orientation === "row" ? "column" : "row") + ":"),
              ).length >= 2,
          )
        : bases.length >= 2 && houses.length >= 2;
    });
    return possible
      ? { kind: "yes" as const }
      : {
          kind: "excluded" as const,
          reason: "missing-classic-capability",
          dependencies: this.watches(),
        };
  }
  estimate() {
    return { hit: 1, gain: 1, cost: this.tier + 1 };
  }
  *discover(view: ReadView, context: DiscoveryContext): Discovery {
    assertOwnedView(view);
    const eligibility = this.eligible(view);
    if (eligibility.kind === "excluded") {
      yield eligibility;
      return;
    }
    let lease: WorkspaceReservation | undefined;
    const meter = new WorkMeter(context.limits.workUnits);
    try {
      lease = context.workspace.reserve(0, 262144);
      const sources = new FishSources(view, lease);
      for (const event of sources.prepare()) {
        context.workspace.checkpoint();
        if (meter.exceeded(event.units)) {
          yield { kind: "interrupted", reason: "work-limit" };
          return;
        }
        yield event;
      }
      const search = new FishSearch(view, this.family, context, sources);
      for (const event of search.patterns()) {
        context.workspace.checkpoint();
        if ("kind" in event) {
          if (meter.exceeded(event.units)) {
            yield { kind: "interrupted", reason: "work-limit" };
            return;
          }
          yield event;
          continue;
        }
        const proposal = yield* this.compileCandidate(view, context, sources, event, meter);
        if (!proposal) return;
        yield { kind: "proposal", proposal };
      }
      yield { kind: "exhausted" };
    } catch (error) {
      if (error instanceof IndexInterrupted) yield { kind: "interrupted", reason: error.reason };
      else throw error;
    } finally {
      lease?.dispose();
    }
  }
  /** Compiles one candidate under its own lease; `undefined` after yielding an interruption. */
  private *compileCandidate(
    view: ReadView,
    context: DiscoveryContext,
    sources: FishSources,
    candidate: Candidate,
    meter: WorkMeter,
  ): Generator<DiscoveryEvent, DeductionProposal | undefined> {
    const compilation = context.workspace.reserve(0, 65536);
    try {
      const compiler = new FishCompiler(view, compilation, sources).compile(this.id, candidate);
      let proposal: DeductionProposal;
      try {
        for (;;) {
          context.workspace.checkpoint();
          const next = compiler.next();
          if (next.done) {
            proposal = next.value;
            break;
          }
          if (meter.exceeded(next.value.units)) {
            yield { kind: "interrupted", reason: "work-limit" };
            return undefined;
          }
          yield next.value;
        }
      } finally {
        compiler.return(undefined as never);
      }
      if (
        proposal.proof.nodes.length > context.limits.stepNodes ||
        JSON.stringify(proposal).length * 2 > context.limits.stepBytes
      ) {
        yield { kind: "interrupted", reason: "proof-step-limit" };
        return undefined;
      }
      return proposal;
    } finally {
      compilation.dispose();
    }
  }
}

export const fishTechniques: readonly TechniqueDescriptor[] = Object.freeze(
  ["C06", "C07", "C08", "C09"].map((id) => Object.freeze(new FishTechnique(id))),
);

/** Untrusted C07/C08 geometry enumeration composed by Kraken's checked chains.
 * Reachability only selects recipes; Kraken replays every fin and count root. */
export function* krakenFishShapes(
  view: ReadView,
  context: DiscoveryContext,
  reaches: (symbol: number, target: number, fin: number) => boolean,
): Generator<Work | Candidate> {
  assertOwnedView(view);
  const lease = context.workspace.reserve(1, 262144);
  try {
    const sources = new FishSources(view, lease);
    yield* sources.prepare();
    const searches = [
      new FishSearch(view, "C07", context, sources, reaches, 4),
      new FishSearch(view, "C08", context, sources, reaches, 4),
    ];
    for (const event of new FishCursorSet(searches.map((search) => search.patterns())).events())
      if ("kind" in event || (!("components" in event.pattern) && event.pattern.fins.length > 0))
        yield event;
  } finally {
    lease.dispose();
  }
}
