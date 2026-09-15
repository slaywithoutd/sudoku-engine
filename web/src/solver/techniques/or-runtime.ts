import type { ReadView, Literal } from "../state/types";
import type { Discovery, DiscoveryContext } from "./types";
import { assertOwnedView } from "../state/candidates";
import {
  buildProvedClauses,
  type ProvedClauseIndex,
  type ProvedClauseEntry,
} from "../indexes/proved-clauses";
import {
  buildImplications,
  type ImplicationIndex,
} from "../indexes/implications";
import {
  IndexInterrupted,
  type WorkspaceReservation,
} from "../indexes/workspace";
import { ForcingGraph } from "./forcing-runtime";
import { forcingProofFits, signedKey, type ForcingLink } from "./forcing-proof";
import {
  compileOrForcing,
  type OrForcingPlan,
  type OrBranch,
} from "./or-forcing";
import {
  GeneralizedRun,
  GeneralizedSearch,
  generalizedDescriptor,
  interruption,
  type GeneralizedSearchEvent,
} from "./generalized-runtime";
import { buildCspVariables, cspVariableReservation } from "./csp-variables";
import type { GeneralizedGrammar } from "./generalized-chains";

type OrEvent =
  | { kind: "work"; units: number }
  | {
      kind: "or-plan";
      plan: OrForcingPlan;
      effect: { kind: "remove" | "place"; cell: number; symbol: number };
    };

/** Static signed branch strategy. Full clause membership is borrowed verbatim;
 * no automatic mutual exclusion or recursive cases are added to the graph.
 */
function* forcingPlans(
  view: ReadView,
  context: DiscoveryContext,
  graph: ForcingGraph,
  sources: readonly ProvedClauseEntry[],
): Generator<OrEvent> {
  for (const source of sources) {
    const lease = context.workspace.reserve(
      1,
      source.alternatives.length * 1500000,
    );
    try {
      const results: {
        assumption: Literal;
        paths: Map<string, ForcingLink[]>;
        contradiction?: ForcingLink[][];
      }[] = [];
      for (const assumption of source.alternatives) {
        const cursor = graph.paths(assumption);
        let next = cursor.next();
        try {
          while (!next.done) {
            yield next.value;
            next = cursor.next();
          }
          const paths = next.value;
          results.push({
            assumption,
            paths,
            contradiction: graph.contradiction(assumption, paths),
          });
        } finally {
          cursor.return(new Map());
        }
      }
      for (const cell of view.assembly.problem.cells)
        if (!view.state.values[cell])
          for (const symbol of view.assembly.problem.symbols)
            if (view.state.domains[cell] & (1 << (symbol - 1)))
              for (const positive of [false, true]) {
                yield { kind: "work", units: 1 };
                const result = { cell, symbol, positive };
                if (
                  !results.every(
                    (r) => r.contradiction || r.paths.has(signedKey(result)),
                  )
                )
                  continue;
                yield {
                  kind: "or-plan",
                  effect: { kind: positive ? "place" : "remove", cell, symbol },
                  plan: {
                    kind: "or-forcing",
                    source: source.source,
                    alternatives: source.alternatives,
                    branches: results.map((r) => ({
                      assumption: r.assumption,
                      result: r.contradiction ? "false" : result,
                      paths: r.contradiction ?? [
                        r.paths.get(signedKey(result))!,
                      ],
                    })),
                  },
                };
              }
    } finally {
      lease.dispose();
    }
  }
}

/** One OR insertion cursor per arity keeps common binary clauses from starving
 * ternary/quaternary sources. Signed-only sources are eligible for forcing only.
 */
function* insertedPlans(
  search: GeneralizedSearch,
  sources: readonly ProvedClauseEntry[],
): Generator<GeneralizedSearchEvent> {
  for (let length = 1; length <= 12; length++)
    for (const source of sources) {
      const cursor = search.plans("inserted-or-whip", length, {
        id: source.source,
        values: source.alternatives.map((v) => [v.cell, v.symbol]),
      });
      try {
        for (const event of cursor) {
          if (event.kind === "plan" && event.plan.positions.length !== length)
            continue;
          yield event;
        }
      } finally {
        cursor.return(undefined);
      }
    }
}

/** Generalized case strategy: an ordinary ordered branch may refute its own
 * alternative or directly derive the common negative effect. Static and these
 * six independent grammar searches receive separate round-robin work service.
 */
function* generalizedForcingPlans(
  view: ReadView,
  context: DiscoveryContext,
  graph: ForcingGraph,
  search: GeneralizedSearch,
  sources: readonly ProvedClauseEntry[],
  grammar: GeneralizedGrammar,
): Generator<OrEvent> {
  for (const source of sources) {
    const lease = context.workspace.reserve(
      1,
      source.alternatives.length * 1500000,
    );
    try {
      const paths: Map<string, ForcingLink[]>[] = [],
        contradictions: (ForcingLink[][] | undefined)[] = [];
      for (const assumption of source.alternatives) {
        const cursor = graph.paths(assumption);
        let next = cursor.next();
        try {
          while (!next.done) {
            yield next.value;
            next = cursor.next();
          }
          paths.push(next.value);
          contradictions.push(graph.contradiction(assumption, next.value));
        } finally {
          cursor.return(new Map());
        }
      }
      const effects = new Map<string, Literal>();
      for (const a of source.alternatives)
        effects.set(`${a.cell}:${a.symbol}`, { ...a, positive: false });
      for (const variable of search.variables)
        if (variable.cell !== undefined)
          for (const [cell, symbol] of variable.alternatives)
            effects.set(`${cell}:${symbol}`, { cell, symbol, positive: false });
      function* caseJob(target: Literal, selected: number): Generator<OrEvent> {
        const branches: (OrBranch | undefined)[] = source.alternatives.map(
          (a, i) =>
            i === selected
              ? undefined
              : contradictions[i]
                ? { assumption: a, result: "false", paths: contradictions[i] }
                : paths[i].has(signedKey(target))
                  ? {
                      assumption: a,
                      result: target,
                      paths: [paths[i].get(signedKey(target))!],
                    }
                  : undefined,
        );
        const needed = source.alternatives.flatMap((a, i) =>
          !branches[i] ? [i] : [],
        );
        if (
          !needed.length ||
          needed.some((i) => !source.alternatives[i].positive)
        )
          return;
        const storage = context.workspace.reserve(1, needed.length * 600000);
        const cursors: {
          branch: number;
          cursor: Generator<GeneralizedSearchEvent>;
        }[] = [];
        try {
          for (const i of needed) {
            const a = source.alternatives[i],
              own = a.cell === target.cell && a.symbol === target.symbol;
            // Other cases may require a different scalar/group grammar. Their
            // independent searches are interleaved instead of pooling rights.
            for (const form of i === selected
              ? [grammar]
              : (["braid", "g-whip"] as const))
              cursors.push({
                branch: i,
                cursor: search.plans(
                  form,
                  12,
                  undefined,
                  [a.cell, a.symbol],
                  own ? undefined : [target.cell, target.symbol],
                ),
              });
          }
          while (cursors.length)
            for (let i = 0; i < cursors.length; ) {
              const item = cursors[i];
              if (branches[item.branch]) {
                item.cursor.return(undefined);
                cursors.splice(i, 1);
                continue;
              }
              const next = item.cursor.next();
              if (next.done) {
                cursors.splice(i, 1);
                continue;
              }
              if (next.value.kind === "work") yield next.value;
              else {
                const plan = next.value.plan;
                branches[item.branch] = {
                  assumption: source.alternatives[item.branch],
                  result: plan.consequence ? target : "false",
                  generalized: plan,
                };
              }
              i++;
            }
          if (branches.every((b): b is OrBranch => !!b))
            yield {
              kind: "or-plan",
              effect: {
                kind: "remove",
                cell: target.cell,
                symbol: target.symbol,
              },
              plan: {
                kind: "or-forcing",
                source: source.source,
                alternatives: source.alternatives,
                branches,
              },
            };
        } finally {
          for (const item of cursors) item.cursor.return(undefined);
          storage.dispose();
        }
      }
      const ownJobs = source.alternatives.flatMap((a, i) =>
        a.positive ? [caseJob({ ...a, positive: false }, i)] : [],
      );
      try {
        while (ownJobs.length)
          for (let i = 0; i < ownJobs.length; ) {
            const next = ownJobs[i].next();
            if (next.done) ownJobs.splice(i, 1);
            else {
              yield next.value;
              i++;
            }
          }
      } finally {
        for (const job of ownJobs) job.return(undefined);
      }
      for (const target of effects.values()) {
        yield { kind: "work", units: 1 };
        yield* caseJob(target, -1);
      }
    } finally {
      lease.dispose();
    }
  }
}

export function* discoverOr(
  view: ReadView,
  context: DiscoveryContext,
): Discovery {
  assertOwnedView(view);
  const run = new GeneralizedRun(context);
  let clauses: ProvedClauseIndex | undefined,
    implications: ImplicationIndex | undefined,
    lease: WorkspaceReservation | undefined;
  const cursors: Generator<OrEvent | GeneralizedSearchEvent>[] = [];
  try {
    run.tick();
    for (const event of buildProvedClauses(view, context.workspace)) {
      if (event.kind === "ready") clauses = event.value;
      else if (event.kind === "interrupted")
        throw new IndexInterrupted(event.reason);
      run.tick();
      if (event.kind === "work") yield event;
    }
    if (!clauses!.entries.length) {
      yield {
        kind: "excluded",
        reason: "missing-proved-or-clause",
        dependencies: [{ kind: "all" }],
      };
      return;
    }
    const storage = cspVariableReservation(view);
    lease = context.workspace.reserve(storage.entries, storage.bytes + 6000000);
    const graph = new ForcingGraph(view, context, lease);
    for (const event of buildImplications(view, context.workspace)) {
      if (event.kind === "ready") implications = event.value;
      else if (event.kind === "interrupted")
        throw new IndexInterrupted(event.reason);
      run.tick();
      if (event.kind === "work") yield event;
    }
    for (const event of graph.prepare(implications!)) {
      run.tick();
      yield event;
    }
    const search = new GeneralizedSearch(view, buildCspVariables(view));
    for (const size of [2, 3, 4]) {
      const entries = clauses!.entries.filter(
        (e) => e.alternatives.length === size,
      );
      const positive = entries.filter((e) =>
        e.alternatives.every((v) => v.positive),
      );
      const signed = entries.filter(
        (e) => !e.alternatives.every((v) => v.positive),
      );
      if (positive.length) {
        cursors.push(forcingPlans(view, context, graph, positive));
        cursors.push(insertedPlans(search, positive));
      }
      if (signed.length)
        cursors.push(forcingPlans(view, context, graph, signed));
    }
    // These searches include signed clauses but only speculate positively for
    // a generalized candidate branch; other signed alternatives use static paths.
    for (const grammar of [
      "bivalue",
      "z",
      "t",
      "whip",
      "braid",
      "g-whip",
    ] as const)
      cursors.push(
        generalizedForcingPlans(
          view,
          context,
          graph,
          search,
          clauses!.entries.filter((e) =>
            e.alternatives.some((a) => a.positive),
          ),
          grammar,
        ),
      );
    while (cursors.length)
      for (let i = 0; i < cursors.length; ) {
        run.tick();
        const next = cursors[i].next();
        if (next.done) {
          cursors.splice(i, 1);
          continue;
        }
        const event = next.value;
        if (event.kind === "work") yield event;
        else if (event.kind === "plan") yield* run.proposal(view, event.plan);
        else {
          const compilation = context.workspace.reserve(1, 5000000);
          try {
            const proposal = compileOrForcing(
              view,
              event.plan,
              event.effect,
              compilation,
            );
            run.tick();
            if (!forcingProofFits(proposal, context.limits))
              throw Error("generalized-proof-step-limit");
            yield { kind: "proposal", proposal };
          } finally {
            compilation.dispose();
          }
        }
        i++;
      }
    yield { kind: "exhausted" };
  } catch (error) {
    yield interruption(error);
  } finally {
    for (const cursor of cursors) cursor.return(undefined);
    clauses?.dispose();
    implications?.dispose();
    lease?.dispose();
  }
}
export const orTechniques = Object.freeze([
  generalizedDescriptor("C28", discoverOr),
]);
