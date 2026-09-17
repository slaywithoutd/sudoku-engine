import type { ReadView, Literal } from "../state/types";
import type { Effect } from "../proof/types";
import type { Discovery, DiscoveryContext, TechniqueDescriptor, DiscoveryEvent } from "./types";
import { coverageEntries } from "./manifest";
import { uniqueAuthorityMatches } from "../conditional";
import { compileUnique, type UniqueGeometry, type UniquePlan } from "./unique-compiler";
import { UniqueRectangles, uniqueSymbols, type UniqueGeometryCursor } from "./unique-rectangles";
import { UniqueLoops } from "./unique-loops";
import { Bug } from "./bug";
import { buildImplications, type ImplicationIndex } from "../indexes/implications";
import { IndexInterrupted, type WorkspaceReservation } from "../indexes/workspace";
import { ForcingGraph } from "./forcing-runtime";
import { forcingProofFits, opposite, signedKey, type ForcingLink } from "./forcing-proof";
import { houseCells } from "../state/read";
import { defined } from "../invariants";
type Work = { kind: "work"; units: number };

/** Per-invocation graph traversal; authority and solutions never enter recipes. */
class UniqueConsequenceSearch {
  constructor(
    readonly graph: ForcingGraph,
    readonly context: DiscoveryContext,
  ) {}
  *paths(start: Literal, geometry: UniqueGeometry): Generator<Work, Map<string, ForcingLink[]>> {
    const lease = this.context.workspace.reserve(1, 3000000);
    try {
      const paths = new Map<string, ForcingLink[]>([[signedKey(start), []]]),
        queue = [start];
      for (let i = 0; i < queue.length; i++) {
        const path = defined(paths.get(signedKey(queue[i])), "path");
        if (path.length === 24) continue;
        for (const link of this.graph.arcs.get(signedKey(queue[i])) ?? []) {
          yield { kind: "work", units: 1 };
          if (
            geometry.kind === "type3" &&
            (link.reason.kind === "house-cover" ||
              (link.reason.kind === "cell-cover" &&
                !geometry.auxiliaryCells.includes(link.from.cell) &&
                !geometry.cells.includes(link.from.cell)))
          )
            continue;
          if (
            geometry.strongSymbol !== null &&
            link.reason.kind === "house-cover" &&
            link.reason.symbol === geometry.strongSymbol &&
            !(geometry.kind === "type6" ? geometry.causalHouses : geometry.strongHouses).includes(
              defined(link.reason.house, "house"),
            )
          )
            continue;
          const key = signedKey(link.to);
          if (paths.has(key)) continue;
          paths.set(key, [...path, link]);
          queue.push(link.to);
        }
      }
      return paths;
    } finally {
      lease.dispose();
    }
  }
}

function* effects(view: ReadView, geometry: UniqueGeometry): Generator<Effect> {
  const core = uniqueSymbols(geometry.coreMasks[0]),
    roofs = geometry.cells.filter((cell) =>
      geometry.guardians.some((literal) => literal.cell === cell),
    );
  const peers = (left: number, right: number) =>
    left !== right &&
    view.assembly.allDifferent.some(
      (house) => house.cells.includes(left) && house.cells.includes(right),
    );
  if (geometry.row === "U04") {
    yield { kind: "place", cell: geometry.guardians[0].cell, symbol: geometry.guardians[0].symbol };
    return;
  }
  for (const cell of view.assembly.problem.cells)
    if (!view.state.values[cell])
      for (const symbol of uniqueSymbols(view.state.domains[cell]))
        for (const kind of ["remove", "place"] as const) {
          let allowed = true;
          if (geometry.kind === "type1" || geometry.kind === "avoidable1")
            allowed = kind === "remove" && roofs[0] === cell && core.includes(symbol);
          if (["type2", "type5", "avoidable2"].includes(geometry.kind))
            allowed =
              kind === "remove" &&
              !geometry.cells.includes(cell) &&
              symbol === geometry.guardians[0].symbol &&
              roofs.every((c) => peers(c, cell));
          if (geometry.kind === "type3")
            allowed =
              kind === "remove" &&
              !geometry.cells.includes(cell) &&
              !geometry.auxiliaryCells.includes(cell) &&
              geometry.guardians.some((literal) => literal.symbol === symbol) &&
              !!view.assembly.allDifferent
                .find((house) => house.id === geometry.subsetHouse)
                ?.cells.includes(cell);
          if (geometry.kind === "type4")
            allowed =
              kind === "remove" &&
              roofs.includes(cell) &&
              core.includes(symbol) &&
              symbol !== geometry.strongSymbol;
          if (geometry.kind === "type6")
            allowed = kind === "remove" && roofs.includes(cell) && symbol === geometry.strongSymbol;
          if (geometry.kind === "hidden")
            allowed =
              kind === "remove" &&
              geometry.cells.includes(cell) &&
              geometry.cells.some(
                (c) =>
                  Math.floor(c / 9) !== Math.floor(cell / 9) &&
                  c % 9 !== cell % 9 &&
                  view.state.domains[c] === geometry.coreMasks[0],
              ) &&
              core.includes(symbol) &&
              symbol !== geometry.strongSymbol &&
              geometry.strongHouses.every((id) => houseCells(view, id).includes(cell));
          if (allowed) yield { kind, cell, symbol };
        }
}

/** One job fairly owns all lazy subfamily cursors and releases before terminal events. */
export function* discoverUnique(
  family: UniqueGeometry["row"],
  view: ReadView,
  context: DiscoveryContext,
): Discovery {
  if (!uniqueAuthorityMatches(context.uniqueAuthority, view)) {
    yield { kind: "disabled", reason: "missing-unique-authority" };
    return;
  }
  let index: ImplicationIndex | undefined,
    lease: WorkspaceReservation | undefined,
    terminal: DiscoveryEvent = { kind: "exhausted" };
  const deadline = performance.now() + context.limits.timeMs;
  let work = 0;
  const tick = () => {
    context.workspace.checkpoint();
    if (!uniqueAuthorityMatches(context.uniqueAuthority, view)) throw Error("unique-disabled");
    if (performance.now() >= deadline) throw Error("unique-time-limit");
    if (++work > context.limits.workUnits) throw Error("unique-work-limit");
  };
  const cursors: UniqueGeometryCursor[] =
    family === "U01" || family === "U02"
      ? new UniqueRectangles().cursors(view, family)
      : family === "U03"
        ? [new UniqueLoops().geometries(view)]
        : [new Bug().geometries(view, family)];
  try {
    lease = context.workspace.reserve(1, 65536);
    const graph = new ForcingGraph(view, context, lease);
    for (const event of buildImplications(view, context.workspace)) {
      if (event.kind === "ready") index = event.value;
      else if (event.kind === "interrupted") throw new IndexInterrupted(event.reason);
      tick();
      if (event.kind === "work") yield event;
    }
    for (const prepared of graph.prepare(defined(index, "index"))) {
      tick();
      yield prepared;
    }
    const search = new UniqueConsequenceSearch(graph, context);
    while (cursors.length)
      for (let i = 0; i < cursors.length;) {
        tick();
        const next = cursors[i].next();
        if (next.done) {
          cursors.splice(i, 1);
          continue;
        }
        i++;
        if (next.value.kind === "work") {
          yield next.value;
          continue;
        }
        const geometry = next.value.geometry,
          storage = context.workspace.reserve(1, 4000000 + geometry.guardians.length * 1500000);
        try {
          const results: {
            assumption: Literal;
            paths: Map<string, ForcingLink[]>;
            falsePaths?: ForcingLink[][];
          }[] = [];
          for (const assumption of geometry.guardians) {
            const cursor = search.paths(assumption, geometry);
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
            results.push({
              assumption,
              paths: next.value,
              falsePaths: graph.contradiction(assumption, next.value),
            });
          }
          for (const effect of effects(view, geometry)) {
            tick();
            yield { kind: "work", units: 1 };
            const target: Literal = {
              cell: effect.cell,
              symbol: effect.symbol,
              positive: effect.kind === "place",
            };
            if (
              geometry.kind === "type6" &&
              effect.cell !==
                geometry.cells.find((cell) =>
                  geometry.guardians.some((literal) => literal.cell === cell),
                )
            )
              continue;
            let plan: UniquePlan | undefined;
            if (
              geometry.row === "U01" ||
              geometry.row === "U02" ||
              geometry.guardians.length === 1
            ) {
              const cursor = search.paths(opposite(target), geometry);
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
              const paths = geometry.guardians.map((literal) =>
                next.value.get(signedKey(opposite(literal))),
              );
              if (
                paths.every((path) => path !== undefined) &&
                new Set(
                  paths.flatMap((path) =>
                    defined(path, "pattern").map((link) => JSON.stringify(link)),
                  ),
                ).size <= 24
              )
                plan = {
                  geometry: geometry,
                  consequence: { kind: "denial", paths: paths as ForcingLink[][] },
                };
            }
            if (!plan && results.every((r) => r.falsePaths || r.paths.has(signedKey(target))))
              plan = {
                geometry: geometry,
                consequence: {
                  kind: "cases",
                  branches: results.map((r) => ({
                    assumption: r.assumption,
                    result: r.falsePaths ? "false" : target,
                    paths: r.falsePaths ?? [defined(r.paths.get(signedKey(target)), "path")],
                  })),
                },
              };
            if (!plan) continue;
            if (
              plan.consequence.kind === "cases" &&
              plan.consequence.branches.some(
                (branch) =>
                  new Set(branch.paths.flat().map((link) => JSON.stringify(link))).size > 24,
              )
            )
              continue;
            if (geometry.kind === "type6") {
              const cell = defined(
                  geometry.cells.find(
                    (c) =>
                      c !== effect.cell && geometry.guardians.some((literal) => literal.cell === c),
                  ),
                  "cell",
                ),
                otherEffect: Effect = { kind: "remove", cell, symbol: effect.symbol };
              const cursor = search.paths(
                { cell, symbol: effect.symbol, positive: true },
                geometry,
              );
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
              const paths = geometry.guardians.map((literal) =>
                next.value.get(signedKey(opposite(literal))),
              );
              if (
                paths.some((path) => !path) ||
                new Set(
                  paths.flatMap((path) =>
                    defined(path, "path").map((link) => JSON.stringify(link)),
                  ),
                ).size > 24
              )
                continue;
              plan = {
                ...plan,
                companion: {
                  effect: otherEffect,
                  consequence: { kind: "denial", paths: paths as ForcingLink[][] },
                },
              };
            }
            const allPaths = [
              ...(plan.consequence.kind === "denial"
                ? plan.consequence.paths
                : plan.consequence.branches.flatMap((branch) => branch.paths)),
              ...(plan.companion?.consequence.kind === "denial"
                ? plan.companion.consequence.paths
                : []),
            ];
            if (
              (geometry.kind === "type6" ? geometry.causalHouses : geometry.strongHouses).some(
                (house) =>
                  !allPaths
                    .flat()
                    .some(
                      (link) =>
                        link.reason.kind === "house-cover" &&
                        link.reason.house === house &&
                        link.reason.symbol === geometry.strongSymbol,
                    ),
              )
            )
              continue;
            if (
              geometry.kind === "type3" &&
              geometry.auxiliaryCells.some(
                (cell) =>
                  !allPaths
                    .flat()
                    .some((link) => link.reason.kind === "cell-cover" && link.reason.cell === cell),
              )
            )
              continue;
            const compilation = context.workspace.reserve(1, 5000000);
            try {
              const proposal = compileUnique(
                view,
                plan,
                effect,
                defined(context.uniqueAuthority, "uniqueAuthority"),
                compilation,
              );
              if (!forcingProofFits(proposal, context.limits)) throw Error("unique-proof-limit");
              yield { kind: "proposal", proposal };
            } finally {
              compilation.dispose();
            }
          }
        } finally {
          storage.dispose();
        }
      }
  } catch (error) {
    if (error instanceof IndexInterrupted) terminal = { kind: "interrupted", reason: error.reason };
    else if (error instanceof Error && error.message === "unique-disabled")
      terminal = { kind: "disabled", reason: "missing-unique-authority" };
    else if (error instanceof Error && error.message === "unique-work-limit")
      terminal = { kind: "interrupted", reason: "work-limit" };
    else if (error instanceof Error && error.message === "unique-time-limit")
      terminal = { kind: "interrupted", reason: "time-limit" };
    else if (error instanceof Error && error.message === "unique-proof-limit")
      terminal = { kind: "interrupted", reason: "proof-step-limit" };
    else throw error;
  } finally {
    for (const cursor of cursors) cursor.return();
    index?.dispose();
    lease?.dispose();
  }
  yield terminal;
}

function descriptor(family: UniqueGeometry["row"]): TechniqueDescriptor {
  const entry = defined(
      coverageEntries.find((e) => e.id === family),
      "coverageEntry",
    ),
    tradeCells = family === "U01" ? 4 : family === "U02" ? 6 : family === "U03" ? 12 : 81;
  return Object.freeze({
    id: entry.version,
    aliases: entry.aliases,
    tier: entry.tier,
    requires: entry.capabilities,
    assumptionPolicy: "unique-only" as const,
    bounds: {
      maxLength: 24,
      maxBranchDepth: 1,
      maxAlternatives: family === "U01" ? 28 : family === "U02" ? 36 : family === "U04" ? 1 : 4,
      maxPatternCells: tradeCells,
      maxSetSize: family === "U01" ? 4 : family === "U02" ? 3 : family === "U03" ? 2 : 4,
      uniqueness: {
        maxTradeCells: tradeCells,
        maxLoopCells: family === "U03" ? 12 : 0,
        maxGuardianOccurrences:
          family === "U01" ? 28 : family === "U02" ? 36 : family === "U04" ? 1 : 4,
        maxConsequenceLinksPerBranch: 24,
        maxVirtualSubset: family === "U01" ? 4 : 0,
      },
    },
    watches: () => [{ kind: "all" as const }],
    eligible: (view: ReadView) =>
      view.assembly.problem.cells.length === 81
        ? { kind: "yes" as const }
        : {
            kind: "excluded" as const,
            reason: "missing-classic-geometry",
            dependencies: [{ kind: "all" as const }],
          },
    estimate: () => ({ hit: 1, gain: 1, cost: 7 }),
    discover: (view: ReadView, context: DiscoveryContext) => discoverUnique(family, view, context),
  });
}
export const uniqueTechniques = Object.freeze(
  (["U01", "U02", "U03", "U04", "U05"] as const).map(descriptor),
);
