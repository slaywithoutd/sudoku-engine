import type { ReadView, Literal } from "../state/types";
import type { Discovery, DiscoveryContext, TechniqueDescriptor } from "./types";
import { buildImplications, type ImplicationIndex } from "../indexes/implications";
import { IndexInterrupted, type WorkspaceReservation } from "../indexes/workspace";
import { assertOwnedView, HypotheticalSession } from "../state/candidates";
import { findHouseEqualTo } from "../state/read";
import { coverageEntries } from "./manifest";
import { compileForcing, type ForcingPlan } from "./forcing";
import {
  forcingProofFits,
  bit,
  symbols,
  opposite,
  signedKey,
  type ForcingLink,
  type ForcingReason,
} from "./forcing-proof";
type Work = { kind: "work"; units: number };

/** Invocation-owned scalar graph; static branches borrow this frozen graph. */
export class ForcingGraph {
  readonly arcs = new Map<string, ForcingLink[]>();
  constructor(
    readonly view: ReadView,
    readonly context: DiscoveryContext,
    readonly lease: WorkspaceReservation,
  ) {}
  *prepare(index: ImplicationIndex): Generator<Work> {
    for (const edge of index.edges) {
      yield { kind: "work", units: 1 };
      const r = edge.recipe;
      if (r.kind === "relation-conflict") continue;
      const [a, b] = edge.literals;
      let reason: ForcingReason;
      if (r.kind === "cell-conflict" || r.kind === "cell-cover")
        reason = { kind: r.kind, cell: a.cell };
      else {
        const p = this.view.facts.get(r.source)!.proposition;
        if (!("cells" in p)) continue;
        const h = findHouseEqualTo(this.view, p.cells);
        if (!h) continue;
        reason = { kind: r.kind, house: h.id, symbol: a.symbol };
      }
      for (const [x, y] of [
        [a, b],
        [b, a],
      ]) {
        const from = edge.kind === "weak" ? x : opposite(x),
          to = edge.kind === "weak" ? opposite(y) : y,
          key = signedKey(from),
          list = this.arcs.get(key) ?? [];
        this.lease.grow(1, 512);
        list.push({ from, to, reason });
        this.arcs.set(key, list);
      }
    }
    for (const list of this.arcs.values())
      list.sort(
        (a, b) =>
          a.to.cell - b.to.cell ||
          a.to.symbol - b.to.symbol ||
          Number(a.to.positive) - Number(b.to.positive) ||
          JSON.stringify(a.reason).localeCompare(JSON.stringify(b.reason)),
      );
  }
  *paths(
    assumption: Literal,
    singleDigit = false,
    changed?: (link: ForcingLink) => boolean,
  ): Generator<Work, Map<string, ForcingLink[]>> {
    const lease = this.context.workspace.reserve(1, 3000000);
    try {
      const paths = new Map<string, ForcingLink[]>(),
        visited = new Map<string, ForcingLink[]>([[signedKey(assumption) + ":false", []]]),
        queue = [{ value: assumption, changed: false }];
      if (!changed) paths.set(signedKey(assumption), []);
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const item = queue[cursor],
          from = item.value,
          path = visited.get(signedKey(from) + ":" + item.changed)!;
        if (path.length === 24) continue;
        for (const link of this.arcs.get(signedKey(from)) ?? []) {
          yield { kind: "work", units: 1 };
          if (
            singleDigit &&
            (link.to.symbol !== assumption.symbol ||
              !["house-cover", "scope-conflict"].includes(link.reason.kind))
          )
            continue;
          const used = item.changed || !!changed?.(link),
            key = signedKey(link.to) + ":" + used;
          if (visited.has(key)) continue;
          const next = [...path, link];
          visited.set(key, next);
          queue.push({ value: link.to, changed: used });
          if ((!changed || used) && !paths.has(signedKey(link.to)))
            paths.set(signedKey(link.to), next);
        }
      }
      return paths;
    } finally {
      lease.dispose();
    }
  }
  contradiction(
    assumption: Literal,
    paths: Map<string, ForcingLink[]>,
  ): ForcingLink[][] | undefined {
    let best: ForcingLink[][] | undefined;
    for (const path of paths.values()) {
      const value = path.at(-1)?.to ?? assumption,
        other = paths.get(signedKey(opposite(value)));
      if (
        other &&
        path.length + other.length <= 24 &&
        (!best || path.length + other.length < best[0].length + best[1].length)
      )
        best = [path, other];
    }
    return best;
  }
}
export const forcingAliases = {
  digit: "Digit forcing chains",
  cell: "Cell forcing chains",
  unit: "Unit forcing chains",
  nishio: "Nishio",
} as const;
type Split = { kind: ForcingPlan["kind"]; cover: ForcingPlan["cover"]; alternatives: Literal[] };
/** Round-robin family service, canonical increasing cell/house/symbol locally. */
function* splits(view: ReadView): Generator<Split> {
  const candidates = function* () {
    for (const cell of view.assembly.problem.cells)
      if (!view.state.values[cell])
        for (const symbol of symbols(view, cell)) yield { cell, symbol, positive: true } as Literal;
  };
  const digit = function* (kind: "digit" | "nishio") {
    for (const candidate of candidates())
      if (symbols(view, candidate.cell).length >= 2)
        yield {
          kind,
          cover: { candidate },
          alternatives: kind === "digit" ? [candidate, opposite(candidate)] : [candidate],
        };
  };
  const cell = function* () {
    for (const cell of view.assembly.problem.cells)
      if (!view.state.values[cell]) {
        const alternatives = symbols(view, cell).map((symbol) => ({
          cell,
          symbol,
          positive: true,
        }));
        if (alternatives.length >= 2)
          yield { kind: "cell" as const, cover: { cell }, alternatives };
      }
  };
  const unit = function* () {
    for (const house of view.assembly.allDifferent)
      for (const symbol of view.assembly.problem.symbols) {
        const alternatives = house.cells
          .filter((cell) => !view.state.values[cell] && view.state.domains[cell] & bit(symbol))
          .map((cell) => ({ cell, symbol, positive: true }));
        if (alternatives.length >= 2)
          yield { kind: "unit" as const, cover: { house: house.id, symbol }, alternatives };
      }
  };
  const cursors = [digit("digit"), cell(), unit(), digit("nishio")];
  try {
    while (cursors.length)
      for (let i = 0; i < cursors.length;) {
        const next = cursors[i].next();
        if (next.done) cursors.splice(i, 1);
        else {
          yield next.value;
          i++;
        }
      }
  } finally {
    for (const cursor of cursors) cursor.return();
  }
}

export function* discoverForcing(view: ReadView, context: DiscoveryContext): Discovery {
  assertOwnedView(view);
  let index: ImplicationIndex | undefined, lease: WorkspaceReservation | undefined;
  let work = 0;
  const deadline = performance.now() + context.limits.timeMs;
  const tick = () => {
    context.workspace.checkpoint();
    if (performance.now() >= deadline) throw Error("forcing-time-limit");
    if (++work > context.limits.workUnits) throw Error("forcing-work-limit");
  };
  try {
    lease = context.workspace.reserve(1, 65536);
    const graph = new ForcingGraph(view, context, lease);
    for (const event of buildImplications(view, context.workspace)) {
      if (event.kind === "ready")
        index = event.value; // Transfer before a throwable checkpoint.
      else if (event.kind === "interrupted") throw new IndexInterrupted(event.reason);
      tick();
      if (event.kind === "work") yield event;
    }
    for (const event of graph.prepare(index!)) {
      tick();
      yield event;
    }
    for (const split of splits(view)) {
      tick();
      yield { kind: "work", units: 1 };
      const results: {
        assumption: Literal;
        paths: Map<string, ForcingLink[]>;
        falsePaths?: ForcingLink[][];
      }[] = [];
      const storage = context.workspace.reserve(1, split.alternatives.length * 1500000);
      try {
        for (const assumption of split.alternatives) {
          const session = new HypotheticalSession(view, "forcing", context.workspace);
          try {
            for (const e of session.assume(assumption, context.limits)) {
              tick();
              if (e.kind === "work") yield e;
              else if (e.kind === "rejected") throw Error(e.code);
            }
            const cursor = graph.paths(assumption, split.kind === "nishio");
            let next = cursor.next();
            try {
              while (!next.done) {
                tick();
                yield next.value;
                next = cursor.next();
              }
            } finally {
              cursor.return(new Map());
            }
            const paths = next.value;
            results.push({ assumption, paths, falsePaths: graph.contradiction(assumption, paths) });
          } finally {
            session.dispose();
          }
        }
        for (const cell of view.assembly.problem.cells)
          if (!view.state.values[cell])
            for (const symbol of symbols(view, cell))
              for (const positive of [false, true]) {
                tick();
                yield { kind: "work", units: 1 };
                const target = { cell, symbol, positive };
                if (
                  split.kind === "nishio" &&
                  (positive ||
                    cell !== split.alternatives[0].cell ||
                    symbol !== split.alternatives[0].symbol)
                )
                  continue;
                if (results.every((r) => r.falsePaths || r.paths.has(signedKey(target)))) {
                  const plan: ForcingPlan = {
                    ...split,
                    alias: forcingAliases[split.kind],
                    branches: results.map((r) => ({
                      assumption: r.assumption,
                      result: r.falsePaths ? "false" : target,
                      paths: r.falsePaths ?? [r.paths.get(signedKey(target))!],
                    })),
                  };
                  if (split.kind === "nishio" && !results[0].falsePaths) continue;
                  const compilation = context.workspace.reserve(1, 5000000);
                  try {
                    const proposal = compileForcing(view, plan, {
                      kind: positive ? "place" : "remove",
                      cell,
                      symbol,
                    });
                    if (!forcingProofFits(proposal, context.limits)) {
                      yield { kind: "interrupted", reason: "proof-step-limit" };
                      return;
                    }
                    yield { kind: "proposal", proposal };
                  } finally {
                    compilation.dispose();
                  }
                }
              }
      } finally {
        storage.dispose();
      }
    }
    yield { kind: "exhausted" };
  } catch (error) {
    if (error instanceof IndexInterrupted) yield { kind: "interrupted", reason: error.reason };
    else if (
      error instanceof Error &&
      ["forcing-work-limit", "proof-work-limit"].includes(error.message)
    )
      yield { kind: "interrupted", reason: "work-limit" };
    else if (
      error instanceof Error &&
      ["forcing-time-limit", "proof-time-limit"].includes(error.message)
    )
      yield { kind: "interrupted", reason: "time-limit" };
    else if (
      error instanceof Error &&
      error.message.startsWith("proof-") &&
      error.message.endsWith("limit")
    )
      yield { kind: "interrupted", reason: "proof-step-limit" };
    else throw error;
  } finally {
    index?.dispose();
    lease?.dispose();
  }
}
/** Shared descriptor metadata, with family-owned bounded discovery strategies. */
export function forcingDescriptor(
  row: "C22" | "C23" | "C24",
  discover: TechniqueDescriptor["discover"],
): TechniqueDescriptor {
  const e = coverageEntries.find((e) => e.id === row)!;
  return Object.freeze({
    id: e.version,
    aliases: e.aliases,
    tier: e.tier,
    requires: e.capabilities,
    assumptionPolicy: e.assumptionPolicy,
    bounds: {
      maxLength: 24,
      maxBranchDepth: row === "C23" ? 2 : 1,
      maxAlternatives: row === "C24" ? 2 : 9,
      maxPatternCells: 81,
      maxSetSize: row === "C24" ? 4 : 0,
    },
    watches: () => [{ kind: "all" as const }],
    eligible: (view: ReadView) => {
      assertOwnedView(view);
      return view.assembly.allDifferent.length && view.assembly.covers.length
        ? { kind: "yes" as const }
        : {
            kind: "excluded" as const,
            reason: "missing-capability",
            dependencies: [{ kind: "all" as const }],
          };
    },
    estimate: () => ({ hit: 1, gain: 1, cost: 7 }),
    discover,
  });
}
