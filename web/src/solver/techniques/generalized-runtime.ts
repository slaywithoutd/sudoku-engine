import type { ReadView } from "../state/types";
import type { Discovery, DiscoveryContext, TechniqueDescriptor } from "./types";
import { IndexInterrupted, type WorkspaceReservation } from "../indexes/workspace";
import { assertOwnedView, HypotheticalSession } from "../state/candidates";
import { coverageEntries } from "./manifest";
import {
  buildCspVariables,
  cspVariableReservation,
  candidatesConflict,
  candidateGroup,
  candidateKey,
  candidateLiteral,
  members,
  type Candidate,
  type CandidateSet,
  type CspVariable,
} from "./csp-variables";
import {
  compileGeneralized,
  type GeneralizedGrammar,
  type GeneralizedPlan,
  type GeneralizedPosition,
} from "./generalized-chains";
import { forcingProofFits } from "./forcing-proof";
import { defined } from "../invariants";

type Work = { kind: "work"; units: number };
export type GeneralizedSearchEvent = Work | { kind: "plan"; plan: GeneralizedPlan };

/** One bounded invocation owns accounting, including consumer time between yields. */
export class GeneralizedRun {
  readonly deadline: number;
  #work = 0;
  constructor(readonly context: DiscoveryContext) {
    this.deadline = performance.now() + context.limits.timeMs;
  }
  tick(): void {
    this.context.workspace.checkpoint();
    if (performance.now() >= this.deadline) throw Error("generalized-time-limit");
    if (++this.#work > this.context.limits.workUnits) throw Error("generalized-work-limit");
  }
  *proposal(view: ReadView, plan: GeneralizedPlan): Discovery {
    const lease = this.context.workspace.reserve(1, 5000000);
    let session: HypotheticalSession | undefined;
    try {
      session = new HypotheticalSession(view, "generalized", this.context.workspace);
      for (const e of session.assume(candidateLiteral(plan.target), this.context.limits)) {
        this.tick();
        if (e.kind === "work") yield e;
        else if (e.kind === "rejected") throw Error(e.code);
      }
      const proposal = compileGeneralized(view, plan, lease);
      this.tick();
      if (!forcingProofFits(proposal, this.context.limits))
        throw Error("generalized-proof-step-limit");
      yield { kind: "proposal", proposal };
    } finally {
      session?.dispose();
      lease.dispose();
    }
  }
}

/** All supplied positions must contribute causally to closure. Braids can skip
 * the predecessor, so ordinary chain continuity alone does not guarantee this.
 */
export function causalPositions(plan: GeneralizedPlan): boolean {
  const needed = new Set<number>(),
    pending = [plan.positions.length - 1];
  while (pending.length) {
    const i = defined(pending.pop(), "pending");
    if (needed.has(i)) continue;
    needed.add(i);
    const position = plan.positions[i];
    for (const witness of [
      position.leftConflict,
      ...position.excluded.map((conflict) => conflict.conflictWith),
    ]) {
      const j = plan.positions
        .slice(0, i)
        .findIndex(
          (position) =>
            position.right &&
            JSON.stringify(members(position.right)) === JSON.stringify(members(witness)),
        );
      if (j >= 0) pending.push(j);
    }
  }
  return needed.size === plan.positions.length;
}

/** Semantic proof feature key, excluding variable display and equivalent paths.
 * Deduplication only suppresses repeated proposals; it never marks a search done.
 */
export function generalizedFeatures(plan: GeneralizedPlan): string {
  let zDigit = false,
    other = false,
    nonpredecessor = false;
  const target = JSON.stringify([plan.target]);
  for (const [i, position] of plan.positions.entries()) {
    const previous = JSON.stringify(
      i ? members(defined(plan.positions[i - 1].right, "right")) : [plan.target],
    );
    nonpredecessor ||= JSON.stringify(members(position.leftConflict)) !== previous;
    if (i === plan.positions.length - 1) continue;
    for (const conflict of position.excluded) {
      if (JSON.stringify(members(conflict.conflictWith)) === target) zDigit = true;
      else other = true;
    }
  }
  const groups = plan.positions.filter(
    (position) => position.right && members(position.right).length > 1,
  );
  return `${plan.grammar}:${plan.target}:${zDigit}:${other}:${nonpredecessor}:${groups.length}:${Math.max(1, ...groups.map((position) => members(defined(position.right, "right")).length))}:${plan.source ?? ""}`;
}

/** Pair enumeration operates directly on complete CSP variables. It is neither
 * an AIC walk nor recursive exact search. Each extension reconstructs every
 * rejected alternative under the selected z/t/general policy.
 */
export class GeneralizedSearch {
  readonly #locations = new Map<string, { variable: CspVariable; left: Candidate }[]>();
  constructor(
    readonly view: ReadView,
    readonly variables: readonly CspVariable[],
  ) {
    for (const variable of variables)
      for (const left of variable.alternatives) {
        const key = candidateKey(left),
          locations = this.#locations.get(key) ?? [];
        locations.push({ variable, left });
        this.#locations.set(key, locations);
      }
  }
  private linkedVariables(
    rights: readonly CandidateSet[],
    source?: { id: number; values: CandidateSet },
  ): readonly CspVariable[] {
    const variables = new Map<string, CspVariable>();
    for (const right of rights) {
      // A group conflict must hold for every member. Its first member supplies
      // a complete superset of possible lefts; extension checks the others.
      const [cell, symbol] = right[0];
      for (const other of this.view.assembly.problem.symbols)
        if (other !== symbol)
          for (const location of this.#locations.get(`${cell}:${other}`) ?? [])
            variables.set(location.variable.id, location.variable);
      for (const peer of this.view.assembly.peers[cell])
        for (const location of this.#locations.get(`${peer}:${symbol}`) ?? [])
          variables.set(location.variable.id, location.variable);
    }
    if (source)
      variables.set("proved-or", {
        id: "proved-or",
        alternatives: source.values,
        premises: [source.id],
      });
    return [...variables.values()].sort((left, right) => left.id.localeCompare(right.id));
  }
  *plans(
    grammar: GeneralizedGrammar,
    maximum = 12,
    source?: { id: number; values: CandidateSet },
    onlyTarget?: Candidate,
    consequence?: Candidate,
  ): Generator<GeneralizedSearchEvent> {
    const targets = onlyTarget
      ? [onlyTarget]
      : this.variables
          .filter((value) => value.cell !== undefined)
          .flatMap((value) => value.alternatives);
    for (let length = 1; length <= maximum; length++)
      for (const target of targets) {
        yield { kind: "work", units: 1 };
        yield* this.extend(grammar, target, [], length, source, consequence);
      }
  }
  private *extend(
    grammar: GeneralizedGrammar,
    target: Candidate,
    positions: readonly GeneralizedPosition[],
    length: number,
    source?: { id: number; values: CandidateSet },
    consequence?: Candidate,
  ): Generator<GeneralizedSearchEvent> {
    const rights: CandidateSet[] = [
        [target],
        ...positions.map((position) => members(defined(position.right, "right"))),
      ],
      previous = defined(rights.at(-1), "right");
    const used = new Set([
      candidateKey(target),
      ...positions.flatMap((position) =>
        [position.left, ...members(defined(position.right, "right"))].map(candidateKey),
      ),
    ]);
    const groups = positions.filter(
      (position) => members(defined(position.right, "right")).length > 1,
    ).length;
    const withConflict = (value: Candidate, set: CandidateSet) =>
      set.every((candidate) => candidatesConflict(this.view, value, candidate));
    for (const variable of this.linkedVariables(
      grammar === "braid" ? rights : [previous],
      source,
    )) {
      yield { kind: "work", units: 1 };
      const isOr = variable.id === "proved-or";
      const mayRevisit =
        grammar === "g-whip" && previous.length > 1 && positions.at(-1)?.variable !== variable.id;
      if (!mayRevisit && positions.some((position) => position.variable === variable.id)) continue;
      if (grammar === "bivalue" && variable.alternatives.length !== 2) continue;
      if (grammar === "t" && positions.length === 0 && variable.alternatives.length !== 2) continue;
      for (const left of variable.alternatives) {
        yield { kind: "work", units: 1 };
        if (used.has(candidateKey(left))) continue;
        const leftWitness =
          grammar === "braid"
            ? rights.find((set) => withConflict(left, set))
            : withConflict(left, previous)
              ? previous
              : undefined;
        if (!leftWitness) continue;
        const allowed =
          grammar === "bivalue"
            ? []
            : grammar === "z"
              ? [rights[0]]
              : grammar === "t"
                ? rights.slice(1)
                : rights;
        const rejected: { literal: Candidate; conflictWith: CandidateSet }[] = [],
          survivors: Candidate[] = [];
        for (const value of variable.alternatives) {
          if (candidateKey(value) === candidateKey(left)) continue;
          const witness = allowed.find((set) => withConflict(value, set));
          if (witness) rejected.push({ literal: value, conflictWith: witness });
          else survivors.push(value);
        }
        let closingCandidate: Candidate | undefined;
        if (grammar === "t" && survivors.length === 1 && withConflict(survivors[0], [target]))
          closingCandidate = survivors[0];
        const terminal = survivors.length === 0 || !!closingCandidate;
        if (isOr && terminal) continue;
        if (
          !terminal &&
          (survivors.some((candidate) => used.has(candidateKey(candidate))) ||
            (survivors.length > 1 &&
              (grammar !== "g-whip" || groups === 4 || !candidateGroup(this.view, survivors))))
        )
          continue;
        if (
          !terminal &&
          survivors.some((candidate) => rights.slice(1).some((set) => withConflict(candidate, set)))
        )
          continue;
        if (
          !terminal &&
          consequence &&
          survivors.some((candidate) => withConflict(candidate, [target])) &&
          !survivors.every((candidate) => withConflict(consequence, [candidate]))
        )
          continue;
        if (!terminal && survivors.length === 0) continue;
        const position: GeneralizedPosition = {
          variable: variable.id,
          alternatives: variable.alternatives,
          left,
          leftConflict: leftWitness,
          excluded: rejected,
          right: terminal ? null : survivors,
          ...(isOr ? { role: "or" as const } : {}),
          ...(closingCandidate ? { closingCandidate, closingConflict: target } : {}),
        };
        const next = [...positions, position],
          endpoint =
            !terminal &&
            survivors.every((candidate) => withConflict(consequence ?? target, [candidate]));
        const enoughGroup = grammar !== "g-whip" || groups > 0 || survivors.length > 1;
        const enoughOr = grammar !== "inserted-or-whip" || next.some((p) => p.role === "or");
        if (terminal || endpoint) {
          if (next.length === length && enoughGroup && enoughOr) {
            const plan: GeneralizedPlan = {
              grammar,
              target,
              positions: next,
              ...(source ? { source: source.id } : {}),
              ...(!terminal && consequence ? { consequence } : {}),
            };
            if (causalPositions(plan)) yield { kind: "plan", plan };
          }
          continue;
        }
        if (next.length < length)
          yield* this.extend(grammar, target, next, length, source, consequence);
      }
    }
  }
}

export function interruption(error: unknown): Discovery extends Generator<infer E> ? E : never {
  if (error instanceof IndexInterrupted) return { kind: "interrupted", reason: error.reason };
  if (error instanceof Error && error.message.endsWith("time-limit"))
    return { kind: "interrupted", reason: "time-limit" };
  if (error instanceof Error && error.message.endsWith("work-limit"))
    return { kind: "interrupted", reason: "work-limit" };
  if (error instanceof Error && error.message.endsWith("limit"))
    return { kind: "interrupted", reason: "proof-step-limit" };
  throw error;
}

/** Deterministic round-robin work service protects independent grammar cursors.
 * Every local cursor retains increasing length, then canonical target/variable order.
 */
export function* discoverGeneralized(
  view: ReadView,
  context: DiscoveryContext,
  grammars: readonly GeneralizedGrammar[],
): Discovery {
  assertOwnedView(view);
  const run = new GeneralizedRun(context),
    cursors: Generator<GeneralizedSearchEvent>[] = [];
  const proposed = new Set<string>();
  let lease: WorkspaceReservation | undefined;
  try {
    run.tick();
    const storage = cspVariableReservation(view);
    lease = context.workspace.reserve(storage.entries, storage.bytes + grammars.length * 250000);
    const search = new GeneralizedSearch(view, buildCspVariables(view));
    cursors.push(...grammars.map((group) => search.plans(group)));
    while (cursors.length)
      for (let i = 0; i < cursors.length;) {
        run.tick();
        const next = cursors[i].next();
        if (next.done) cursors.splice(i, 1);
        else {
          if (next.value.kind === "work") yield next.value;
          else {
            const key = generalizedFeatures(next.value.plan);
            if (!proposed.has(key)) {
              lease.grow(1, 512);
              proposed.add(key);
              yield* run.proposal(view, next.value.plan);
            }
          }
          i++;
        }
      }
    yield { kind: "exhausted" };
  } catch (error) {
    yield interruption(error);
  } finally {
    for (const cursor of cursors) cursor.return(undefined);
    lease?.dispose();
  }
}

export function generalizedDescriptor(
  family: "C25" | "C26" | "C27" | "C28",
  discover: TechniqueDescriptor["discover"],
): TechniqueDescriptor {
  const entry = defined(
    coverageEntries.find((e) => e.id === family),
    "coverageEntry",
  );
  return {
    id: entry.version,
    aliases: entry.aliases,
    tier: entry.tier,
    requires: entry.capabilities,
    assumptionPolicy: entry.assumptionPolicy,
    bounds: {
      maxLength: family === "C28" ? 24 : 12,
      maxBranchDepth: 1,
      maxAlternatives: family === "C28" ? 4 : 9,
      maxPatternCells: 81,
      maxSetSize: family === "C27" ? 3 : 0,
    },
    watches: () => [{ kind: "all" }],
    eligible: (view) => {
      assertOwnedView(view);
      return view.assembly.allDifferent.length && view.assembly.covers.length
        ? { kind: "yes" }
        : {
            kind: "excluded",
            reason: "missing-capability",
            dependencies: [{ kind: "all" }],
          };
    },
    estimate: () => ({ hit: 1, gain: 1, cost: 7 }),
    discover,
  };
}
export const generalizedTechniques = Object.freeze([
  generalizedDescriptor("C25", (view, context) =>
    discoverGeneralized(view, context, ["bivalue", "z"]),
  ),
  generalizedDescriptor("C26", (view, context) =>
    discoverGeneralized(view, context, ["t", "whip"]),
  ),
  generalizedDescriptor("C27", (view, context) =>
    discoverGeneralized(view, context, ["braid", "g-whip"]),
  ),
]);
