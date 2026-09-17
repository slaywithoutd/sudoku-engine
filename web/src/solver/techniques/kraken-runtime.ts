import type { ReadView } from "../state/types";
import type { Discovery, DiscoveryContext } from "./types";
import { assertOwnedView, HypotheticalSession } from "../state/candidates";
import { buildImplications, type ImplicationIndex } from "../indexes/implications";
import { IndexInterrupted, type WorkspaceReservation } from "../indexes/workspace";
import { ForcingGraph, forcingDescriptor } from "./forcing-runtime";
import { forcingProofFits, signedKey, symbols } from "./forcing-proof";
import { krakenFishShapes } from "./fish";
import { compileKraken } from "./kraken";
import { houseCells } from "../state/read";
import { defined } from "../invariants";

/** Fair C07/C08 size cursors consume scalar implication reachability recipes. */
export function* discoverKraken(view: ReadView, context: DiscoveryContext): Discovery {
  assertOwnedView(view);
  let index: ImplicationIndex | undefined,
    lease: WorkspaceReservation | undefined,
    work = 0;
  const deadline = performance.now() + context.limits.timeMs;
  const tick = () => {
    context.workspace.checkpoint();
    if (performance.now() >= deadline) throw Error("kraken-time-limit");
    if (++work > context.limits.workUnits) throw Error("kraken-work-limit");
  };
  try {
    lease = context.workspace.reserve(1, 4000000);
    const graph = new ForcingGraph(view, context, lease);
    for (const indexEvent of buildImplications(view, context.workspace)) {
      if (indexEvent.kind === "ready") index = indexEvent.value;
      else if (indexEvent.kind === "interrupted") throw new IndexInterrupted(indexEvent.reason);
      tick();
      if (indexEvent.kind === "work") yield indexEvent;
    }
    for (const prepared of graph.prepare(defined(index, "index"))) {
      tick();
      yield prepared;
    }
    const reachable = new Map<string, Set<number>>();
    for (const cell of view.assembly.problem.cells)
      if (!view.state.values[cell])
        for (const symbol of symbols(view, cell)) {
          const cursor = graph.paths({ cell, symbol, positive: true });
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
          lease.grow(1, 8192);
          reachable.set(
            `${cell}:${symbol}`,
            new Set(
              [...next.value.values()].flatMap((path) => {
                const last = path.at(-1)?.to;
                return last && !last.positive && last.symbol === symbol ? [last.cell] : [];
              }),
            ),
          );
        }
    for (const event of krakenFishShapes(
      view,
      context,
      (symbol, target, fin) => reachable.get(`${target}:${symbol}`)?.has(fin) ?? false,
    )) {
      tick();
      if ("kind" in event) {
        yield event;
        continue;
      }
      if ("components" in event.pattern) continue;
      const fish = event.pattern;
      for (const target of event.effects) {
        const cursor = graph.paths({ cell: target.cell, symbol: target.symbol, positive: true });
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
        const finBranches = fish.fins.map((fin) => ({
          fin,
          assumption: { cell: target.cell, symbol: target.symbol, positive: true },
          path: defined(
            next.value.get(signedKey({ cell: fin, symbol: target.symbol, positive: false })),
            "value",
          ),
        }));
        const incidence = view.assembly.problem.cells.map(
          (cell) =>
            fish.covers.reduce((sum, id) => sum + Number(houseCells(view, id).includes(cell)), 0) -
            fish.bases.reduce((sum, id) => sum + Number(houseCells(view, id).includes(cell)), 0),
        );
        const scratch = context.workspace.reserve(1, 4000000);
        let session: HypotheticalSession | undefined;
        try {
          session = new HypotheticalSession(view, "kraken", context.workspace);
          for (const event of session.assume(
            { cell: target.cell, symbol: target.symbol, positive: true },
            context.limits,
          )) {
            tick();
            if (event.kind === "work") yield event;
            else if (event.kind === "rejected") throw Error(event.code);
          }
          const proposal = compileKraken(view, {
            fish,
            target: { cell: target.cell, symbol: target.symbol },
            finBranches,
            incidence,
          });
          if (!forcingProofFits(proposal, context.limits)) {
            yield { kind: "interrupted", reason: "proof-step-limit" };
            return;
          }
          yield { kind: "proposal", proposal };
        } finally {
          session?.dispose();
          scratch.dispose();
        }
      }
    }
    yield { kind: "exhausted" };
  } catch (error) {
    if (error instanceof IndexInterrupted) yield { kind: "interrupted", reason: error.reason };
    else if (
      error instanceof Error &&
      ["kraken-work-limit", "proof-work-limit"].includes(error.message)
    )
      yield { kind: "interrupted", reason: "work-limit" };
    else if (
      error instanceof Error &&
      ["kraken-time-limit", "proof-time-limit"].includes(error.message)
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
export const krakenTechniques = Object.freeze([forcingDescriptor("C24", discoverKraken)]);
