import { matchingFacts, sourceFacts } from "../state/source-index";
import type { ReadView } from "../state/types";
import type { Effect } from "../proof/types";
import type { Discovery, DiscoveryContext, TechniqueDescriptor } from "./types";
import { coverageEntries } from "./manifest";
import { buildImplications, type ImplicationIndex } from "../indexes/implications";
import { IndexInterrupted, type WorkspaceReservation } from "../indexes/workspace";
import { PatternGraph } from "./pattern-runtime";
import { chainProofFits, type ChainWork } from "./chains-certificate";
import { combinations, setUnion, SetCertificate } from "./set-certificate";
import type { LocalSet, SetPattern } from "./set-contracts";
import { assertOwnedView } from "../state/candidates";
import { defined } from "../invariants";

export type SetCandidate = { kind: "candidate"; pattern: SetPattern; effects: Effect[] };
export type SetCursor = Generator<ChainWork | SetCandidate>;
export type SetStrategy = (
  view: ReadView,
  graph: PatternGraph,
  sets: readonly LocalSet[],
) => SetCursor[];

function eligibility(
  view: ReadView,
  id: "C20" | "C21",
): ReturnType<TechniqueDescriptor["eligible"]> {
  const scopes = view.assembly.allDifferent.filter((house) =>
    matchingFacts(view, { kind: "all-different", cells: house.cells }).some(
      (fact) => !fact.openAssumptions.length,
    ),
  );
  const lines = scopes.filter(
    (house) =>
      house.cells.length === 9 &&
      (new Set(house.cells.map((cell) => Math.floor(cell / 9))).size === 1 ||
        new Set(house.cells.map((cell) => cell % 9)).size === 1),
  );
  const boxes = scopes.filter(
    (house) =>
      house.cells.length === 9 &&
      new Set(house.cells.map((cell) => Math.floor(cell / 27) * 3 + Math.floor((cell % 9) / 3)))
        .size === 1,
  );
  const capable =
    id === "C20"
      ? lines.some((left) =>
          boxes.some(
            (right) => left.cells.filter((cell) => right.cells.includes(cell)).length === 3,
          ),
        )
      : scopes.length > 0 ||
        sourceFacts(view, "relation").some((fact) => !fact.openAssumptions.length);
  return capable
    ? { kind: "yes" }
    : { kind: "excluded", reason: "missing-set-capability", dependencies: [{ kind: "all" }] };
}

/** Complete closed-source ALS inventory; a recipe is only a discovery hint.
 * Named C20/C21 validators independently reconstruct every chosen domain. */
export function* localSets(
  view: ReadView,
  graph: PatternGraph,
  max: number,
): Generator<ChainWork, LocalSet[]> {
  if (!graph.index.completeFor(view)) throw Error("incomplete-set-source-prefix");
  const sets: LocalSet[] = [],
    seen = new Set<string>();
  for (const house of view.assembly.allDifferent) {
    yield { kind: "work", units: 1 };
    if (
      !matchingFacts(view, { kind: "all-different", cells: house.cells }).some(
        (fact) => !fact.openAssumptions.length,
      )
    )
      continue;
    const empty = house.cells.filter((cell) => !view.state.values[cell]);
    for (let size = 1; size <= Math.min(max, empty.length); size++)
      for (const cells of combinations(empty, size)) {
        yield { kind: "work", units: 1 };
        const symbols = setUnion(view, cells),
          key = house.id + "/" + cells.join();
        if (symbols.length !== size + 1 || seen.has(key)) continue;
        graph.lease.grow(1, 512 + size * 32);
        seen.add(key);
        sets.push({ cells, house: house.id, symbols });
      }
  }
  return sets;
}

/** One finite cursor per semantic size form, round-robin serviced. Both index
 * transfer and per-yield proposal ownership are explicit across cancellation. */
export function setDescriptor(id: "C20" | "C21", strategy: SetStrategy): TechniqueDescriptor {
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
      maxLength: 0,
      maxBranchDepth: id === "C21" ? 1 : 0,
      maxAlternatives: id === "C21" ? 6561 : 9,
      maxPatternCells: id === "C20" ? 11 : 12,
      maxSetSize: id === "C20" ? 4 : 5,
    },
    watches: () => [{ kind: "all" as const }],
    eligible: (view: ReadView) => eligibility(view, id),
    estimate: () => ({ hit: 1, gain: 1, cost: 10 }),
    *discover(view: ReadView, context: DiscoveryContext): Discovery {
      assertOwnedView(view);
      const applicable = eligibility(view, id);
      if (applicable.kind === "excluded") {
        yield applicable;
        return;
      }
      let index: ImplicationIndex | undefined,
        lease: WorkspaceReservation | undefined,
        work = 0;
      const cursors: SetCursor[] = [];
      const tick = () => {
        context.workspace.checkpoint();
        if (++work > context.limits.workUnits) throw Error("set-work-limit");
      };
      try {
        for (const event of buildImplications(view, context.workspace)) {
          if (event.kind === "ready") index = event.value;
          tick();
          if (event.kind !== "ready") {
            yield event;
            if (event.kind === "interrupted") return;
          }
        }
        if (!index?.completeFor(view)) throw Error("incomplete-set-source-prefix");
        lease = context.workspace.reserve(0, 65536);
        const graph = new PatternGraph(index, context, lease);
        for (const event of graph.prepare(view)) {
          tick();
          yield event;
        }
        const preparer = localSets(view, graph, id === "C20" ? 4 : 5);
        let sets: LocalSet[];
        try {
          for (;;) {
            tick();
            const event = preparer.next();
            if (event.done) {
              sets = event.value;
              break;
            }
            yield event.value;
          }
        } finally {
          preparer.return([]);
        }
        cursors.push(...strategy(view, graph, sets));
        while (cursors.length)
          for (let i = 0; i < cursors.length; i++) {
            tick();
            const event = cursors[i].next();
            if (event.done) {
              cursors.splice(i--, 1);
              continue;
            }
            if (event.value.kind === "work") {
              yield event.value;
              continue;
            }
            graph.compilation = context.workspace.reserve(0, 65536);
            const compiler = new SetCertificate(view, graph).compile(
              event.value.pattern,
              event.value.effects,
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
        else if (error instanceof Error && error.message === "set-work-limit")
          yield { kind: "interrupted", reason: "work-limit" };
        else throw error;
      } finally {
        cursors.forEach((cursor) => cursor.return(undefined));
        lease?.dispose();
        index?.dispose();
      }
    },
  });
}
