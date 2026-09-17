import type { ReadView } from "../state/types";
import type { Effect } from "../proof/types";
import type { Discovery, DiscoveryContext, TechniqueDescriptor } from "./types";
import { coverageEntries } from "./manifest";
import { buildImplications, type ImplicationIndex } from "../indexes/implications";
import { buildAls, type AlsIndex } from "../indexes/als";
import { IndexInterrupted, type WorkspaceReservation } from "../indexes/workspace";
import { PatternGraph } from "./pattern-runtime";
import {
  candidate,
  eventKey,
  literalKey,
  compileChain,
  chainProofFits,
  type ChainEvent,
  type ChainLink,
  type ChainPattern,
  type ChainWork,
  type StrongSource,
} from "./chains-certificate";
import { classicHouseContaining, classicHouseEqualTo, symbolMask } from "../state/read";
import { defined } from "../invariants";

export type ChainCandidate = { kind: "candidate"; pattern: ChainPattern; effects: Effect[] };
type Arc = { a: number; b: number; source: StrongSource };

/** An invocation-owned OR-event graph. Strong arcs and weak cross-products remain distinct. */
export class ChainSearch {
  readonly events: ChainEvent[] = [];
  readonly strong: Arc[] = [];
  readonly #eventIds = new Map<string, number>();
  readonly #arcs = new Set<string>();
  constructor(
    readonly view: ReadView,
    readonly graph: PatternGraph,
    readonly family: "scalar" | "group" | "als",
  ) {}
  private event(event: ChainEvent): number {
    const key = eventKey(event),
      prior = this.#eventIds.get(key);
    if (prior !== undefined) return prior;
    this.graph.lease.grow(1, 512 + event.members.length * 128);
    const id = this.events.length;
    this.events.push(event);
    this.#eventIds.set(key, id);
    return id;
  }
  private arc(left: ChainEvent, right: ChainEvent, source: StrongSource): void {
    const x = this.event(left),
      y = this.event(right),
      key = `${Math.min(x, y)}:${Math.max(x, y)}:${JSON.stringify(source)}`;
    if (x === y || this.#arcs.has(key)) return;
    this.graph.lease.grow(1, 512);
    this.#arcs.add(key);
    this.strong.push({ a: x, b: y, source });
  }
  *prepare(): Generator<ChainWork> {
    for (const entry of this.graph.index.covers) {
      yield { kind: "work", units: 1 };
      let source: StrongSource;
      if (entry.recipe.kind === "cell-cover")
        source = { kind: "cell", cell: entry.literals[0]?.cell ?? -1 };
      else {
        const proposition = defined(this.view.facts.get(entry.recipe.source), "fact").proposition;
        if (proposition.kind !== "cover") continue;
        const house = classicHouseContaining(this.view, proposition.cells);
        if (!house) continue;
        source =
          house.cells.join() === proposition.cells.join()
            ? { kind: "house", house: house.id, symbol: proposition.symbol }
            : {
                kind: "proved-cover",
                source: entry.recipe.source,
                house: house.id,
                symbol: proposition.symbol,
              };
      }
      if (entry.literals.some((literal) => this.view.state.values[literal.cell])) continue;
      for (const literal of entry.literals) this.event({ members: [literal], als: null });
      if (entry.literals.length === 2)
        this.arc(
          { members: [entry.literals[0]], als: null },
          { members: [entry.literals[1]], als: null },
          source,
        );
      if (
        this.family === "scalar" ||
        source.kind === "cell" ||
        entry.literals.length < 3 ||
        entry.literals.length > 6
      )
        continue;
      const n = entry.literals.length;
      for (let mask = 1; mask < (1 << n) - 1; mask += 2) {
        yield { kind: "work", units: 1 };
        const left = entry.literals.filter((_, i) => mask & (1 << i)),
          right = entry.literals.filter((_, i) => !(mask & (1 << i)));
        if (this.group(left) && this.group(right))
          this.arc({ members: [...left], als: null }, { members: [...right], als: null }, source);
      }
    }
    if (this.family !== "scalar")
      for (const house of this.view.assembly.allDifferent)
        for (const scope of this.view.assembly.allDifferent) {
          yield { kind: "work", units: 1 };
          if (house.id >= scope.id) continue;
          const cells = house.cells.filter((cell) => scope.cells.includes(cell));
          if (cells.length !== 3) continue;
          for (const symbol of this.view.assembly.problem.symbols) {
            yield { kind: "work", units: 1 };
            const members = cells
              .filter(
                (cell) =>
                  !this.view.state.values[cell] &&
                  this.view.state.domains[cell] & symbolMask(symbol),
              )
              .map((cell) => candidate(cell, symbol));
            if (members.length > 1) this.event({ members, als: null });
          }
        }
    if (this.family !== "als") return;
    let index: AlsIndex | undefined;
    try {
      for (const event of buildAls(this.view, this.graph.context.workspace)) {
        if (event.kind === "ready") index = event.value;
        else if (event.kind === "interrupted") throw new IndexInterrupted(event.reason);
        else yield event;
      }
      if (!index?.completeFor(this.view)) throw Error("incomplete-chain-als-index");
      for (const als of index.entries) {
        yield { kind: "work", units: 1 };
        const proposition = defined(this.view.facts.get(als.recipe.source), "fact").proposition;
        if (proposition.kind !== "all-different") continue;
        const house = classicHouseEqualTo(this.view, proposition.cells);
        if (!house) continue;
        for (let left = 0; left < als.occurrences.length; left++)
          for (let right = left + 1; right < als.occurrences.length; right++) {
            yield { kind: "work", units: 1 };
            this.arc(
              {
                members: als.occurrences[left].cells.map((cell) =>
                  candidate(cell, als.occurrences[left].symbol),
                ),
                als: [...als.cells],
              },
              {
                members: als.occurrences[right].cells.map((cell) =>
                  candidate(cell, als.occurrences[right].symbol),
                ),
                als: [...als.cells],
              },
              { kind: "als", cells: [...als.cells], symbols: [...als.symbols], house: house.id },
            );
          }
      }
    } finally {
      index?.dispose();
    }
  }
  private group(members: readonly { cell: number; symbol: number }[]): boolean {
    if (members.length === 1) return true;
    if (members.length > 3) return false;
    const symbol = members[0].symbol,
      cells = members.map((member) => member.cell).join();
    return this.view.assembly.allDifferent.some((left) =>
      this.view.assembly.allDifferent.some(
        (right) =>
          left.id !== right.id &&
          left.cells.filter((cell) => right.cells.includes(cell)).length === 3 &&
          left.cells
            .filter(
              (cell) =>
                right.cells.includes(cell) && this.view.state.domains[cell] & symbolMask(symbol),
            )
            .join() === cells,
      ),
    );
  }
  private weak(left: number, right: number): boolean {
    return this.events[left].members.every((x) =>
      this.events[right].members.every((y) => this.graph.has(x, y)),
    );
  }
  private simple(path: number[], next: number, kind: "strong" | "weak"): boolean {
    const event = this.events[next];
    if (
      path.some((id) =>
        this.events[id].members.some((left) =>
          event.members.some((right) => literalKey(left) === literalKey(right)),
        ),
      )
    )
      return false;
    const visits = new Set(
      path
        .filter((id) => this.events[id].als)
        .map((id) => defined(this.events[id].als, "als").join()),
    );
    let groups = path.filter(
      (id) => !this.events[id].als && this.events[id].members.length > 1,
    ).length;
    if (event.als) {
      const same = path.filter(
        (id) => this.events[id].als?.join() === defined(event.als, "als").join(),
      );
      if (same.length && !(same.length === 1 && same[0] === path.at(-1) && kind === "strong"))
        return false;
      visits.add(event.als.join());
    } else if (event.members.length > 1) groups++;
    return visits.size + groups <= 4;
  }
  private *effects(
    pattern: ChainPattern,
  ): Generator<ChainWork, { effects: Effect[]; cuts: number[] }> {
    const effects: Effect[] = [],
      cuts: number[] = [],
      vertices = pattern.vertices;
    if (pattern.polarity) {
      const endpoint = vertices[0].members[0];
      if (vertices[0].members.length !== 1 || vertices[0].als) return { effects, cuts };
      effects.push({
        kind: pattern.polarity === "on" ? "place" : "remove",
        cell: endpoint.cell,
        symbol: endpoint.symbol,
      });
      cuts.push(-1);
      if (pattern.polarity === "on")
        for (const cell of this.view.assembly.problem.cells) {
          yield { kind: "work", units: 1 };
          if (
            cell !== endpoint.cell &&
            !this.view.state.values[cell] &&
            this.view.state.domains[cell] & symbolMask(endpoint.symbol) &&
            this.graph.has(endpoint, candidate(cell, endpoint.symbol))
          ) {
            effects.push({ kind: "remove", cell, symbol: endpoint.symbol });
            cuts.push(-1);
          }
        }
      return { effects, cuts };
    }
    const choices = pattern.closed
      ? pattern.links.flatMap((link, i) => (link.kind === "weak" ? [i] : []))
      : [-1];
    for (const cut of choices) {
      const ends =
        cut < 0
          ? [vertices[0], defined(vertices.at(-1), "vertice")]
          : [vertices[cut], vertices[(cut + 1) % vertices.length]];
      for (const cell of this.view.assembly.problem.cells)
        for (const symbol of this.view.assembly.problem.symbols) {
          yield { kind: "work", units: 1 };
          if (
            this.view.state.values[cell] ||
            !(this.view.state.domains[cell] & symbolMask(symbol)) ||
            effects.some((effect) => effect.cell === cell && effect.symbol === symbol)
          )
            continue;
          const target = candidate(cell, symbol);
          if (
            ends.every((vertex) =>
              vertex.members.every((literal) => this.graph.has(literal, target)),
            )
          ) {
            effects.push({ kind: "remove", cell, symbol });
            cuts.push(cut);
          }
        }
    }
    return { effects, cuts };
  }
  /** Iterative deepening preserves increasing link count and canonical endpoint/edge order. */
  *patterns(loops: boolean): Generator<ChainWork | ChainCandidate> {
    yield* this.prepare();
    const order = this.events
      .map((_, i) => i)
      .sort((left, right) =>
        eventKey(this.events[left]).localeCompare(eventKey(this.events[right])),
      );
    const arcs = new Map<number, { next: number; source: StrongSource }[]>();
    for (const arc of this.strong) {
      yield { kind: "work", units: 1 };
      for (const [left, right] of [
        [arc.a, arc.b],
        [arc.b, arc.a],
      ]) {
        const list = arcs.get(left) ?? [];
        list.push({ next: right, source: arc.source });
        arcs.set(left, list);
      }
    }
    for (const list of arcs.values())
      list.sort(
        (left, right) =>
          eventKey(this.events[left.next]).localeCompare(eventKey(this.events[right.next])) ||
          JSON.stringify(left.source).localeCompare(JSON.stringify(right.source)),
      );
    const visit = function* (
      this: ChainSearch,
      path: number[],
      links: ChainLink[],
      length: number,
      closed: boolean,
      first: "strong" | "weak",
    ): Generator<ChainWork | ChainCandidate> {
      yield { kind: "work", units: 1 };
      if (links.length === length) {
        const vertices = path.map((id) => this.events[id]);
        const hasAls = vertices.some((vertex) => vertex.als),
          hasGroup = vertices.some((vertex) => !vertex.als && vertex.members.length > 1);
        if (
          (this.family === "group" && (!hasGroup || hasAls)) ||
          (this.family === "als" && !hasAls)
        )
          return;
        // An ALS event can only occur as the paired ends of its own strong transition.
        for (const cells of new Set(
          vertices
            .filter((vertex) => vertex.als)
            .map((vertex) => defined(vertex.als, "als").join()),
        ))
          if (vertices.filter((vertex) => vertex.als?.join() === cells).length !== 2) return;
        const polarity =
          closed && links[0].kind === defined(links.at(-1), "link").kind
            ? first === "strong"
              ? "on"
              : "off"
            : null;
        const aliases = !loops
          ? [
              "AICs",
              ...(new Set(
                vertices.flatMap((vertex) => vertex.members.map((literal) => literal.symbol)),
              ).size === 1
                ? ["X-Chains"]
                : []),
              ...(links.every((link) => link.kind === "weak" || link.source?.kind === "cell")
                ? ["XY-Chains"]
                : []),
            ]
          : [
              hasAls
                ? "ALS links"
                : hasGroup
                  ? closed
                    ? "Grouped loops"
                    : "Grouped AIC"
                  : polarity
                    ? "Discontinuous Nice Loops"
                    : "Continuous Nice Loops",
            ];
        const pattern: ChainPattern = {
          kind: "chain",
          alias: aliases[0],
          vertices,
          links: links.map((link) => ({ ...link })),
          closed,
          polarity,
          inferenceLinks: length,
          cuts: [],
        };
        const found = yield* this.effects(pattern);
        if (!found.effects.length) return;
        pattern.cuts = found.cuts;
        for (const alias of aliases)
          yield { kind: "candidate", pattern: { ...pattern, alias }, effects: found.effects };
        return;
      }
      const kind = links.length % 2 ? (first === "strong" ? "weak" : "strong") : first;
      const final = closed && links.length === length - 1;
      const choices =
        kind === "strong"
          ? (arcs.get(defined(path.at(-1), "path")) ?? [])
          : (final ? [path[0]] : order).map((next) => ({ next, source: null }));
      for (const edge of choices) {
        yield { kind: "work", units: 1 };
        if (final ? edge.next !== path[0] : !this.simple(path, edge.next, kind)) continue;
        if (kind === "weak" && !this.weak(defined(path.at(-1), "path"), edge.next)) continue;
        const link: ChainLink = { kind, source: edge.source, roots: [] };
        yield* visit.call(
          this,
          final ? path : [...path, edge.next],
          [...links, link],
          length,
          closed,
          first,
        );
      }
    };
    for (let length = 3; length <= 24; length++)
      for (const start of order) {
        if (!loops) {
          if (length % 2) yield* visit.call(this, [start], [], length, false, "strong");
        } else {
          if (this.family !== "scalar" && length % 2)
            yield* visit.call(this, [start], [], length, false, "strong");
          yield* visit.call(this, [start], [], length, true, "strong");
          if (length % 2) yield* visit.call(this, [start], [], length, true, "weak");
        }
      }
  }
}

/**
 * Each independent search space gets one deterministic turn; all own leases close on every exit.
 */
export function chainDescriptor(id: "C16" | "C17"): TechniqueDescriptor {
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
      maxLength: 24,
      maxBranchDepth: 1,
      maxAlternatives: id === "C17" ? 3 : 2,
      maxPatternCells: 81,
      maxSetSize: id === "C17" ? 5 : 0,
    },
    watches: () => [{ kind: "all" as const }],
    eligible: () => ({ kind: "yes" as const }),
    estimate: () => ({ hit: 1, gain: 1, cost: 8 }),
    *discover(view: ReadView, context: DiscoveryContext): Discovery {
      let index: ImplicationIndex | undefined,
        lease: WorkspaceReservation | undefined,
        work = 0;
      const cursors: Generator<ChainWork | ChainCandidate>[] = [];
      const tick = () => {
        context.workspace.checkpoint();
        if (++work > context.limits.workUnits) throw Error("chain-work-limit");
      };
      try {
        for (const event of buildImplications(view, context.workspace)) {
          // A ready event transfers ownership before either checkpoint in tick can throw.
          if (event.kind === "ready") index = event.value;
          tick();
          if (event.kind !== "ready") {
            yield event;
            if (event.kind === "interrupted") return;
          }
        }
        if (!index?.completeFor(view)) throw Error("incomplete-chain-index");
        lease = context.workspace.reserve(0, 65536);
        const graph = new PatternGraph(index, context, lease);
        for (const event of graph.prepare(view)) {
          tick();
          yield event;
        }
        for (const family of id === "C16"
          ? ["scalar" as const]
          : ["scalar" as const, "group" as const, "als" as const])
          cursors.push(new ChainSearch(view, graph, family).patterns(id === "C17"));
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
            const compiler = compileChain(view, graph, next.value.pattern, next.value.effects);
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
        else if (error instanceof Error && error.message === "chain-work-limit")
          yield { kind: "interrupted", reason: "work-limit" };
        else throw error;
      } finally {
        for (const cursor of cursors) cursor.return(undefined);
        lease?.dispose();
        index?.dispose();
      }
    },
  });
}
