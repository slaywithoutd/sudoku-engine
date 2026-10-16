/**
 * Ablation (spec §3.12, plan T15): metrics A-F in accounted work units on the
 * held-out partition, identical budgets, `@2` (over the rotation x decay
 * grid) against its `@1` counterpart. The work cap, not the clock, ends every
 * run, so each trace is reproducible on any machine.
 */
import { solveProblem, type ClassicSolveEvent } from "../../../src/solver/classic-run";
import type { PolicyId, PolicyParameters } from "../../../src/solver/scheduling/work";
import { coverageEntries, variantEntries } from "../../../src/solver/techniques/manifest";
import type { Limits } from "../../../src/solver/limits";
import type { CorpusEntry } from "./corpus-schema";
import { corpusProblem } from "./sample";

export const ABLATION_GRID: readonly PolicyParameters[] = [2, 4, 8].flatMap((rotationEvery) =>
  [2, 4, 6].map((decayShiftCap) => ({ scoreFromTier: 3, rotationEvery, decayShiftCap })),
);

/**
 * Two budgets, time generous so only work ends a run. `spec` is the 2 M-unit
 * budget of spec §3.12 metric C. `stop` exists because one Explain selection
 * costs ~87 k accounted units on master and on this branch alike (the M2
 * selection window services every job), so 2 M ends most runs after ~16
 * steps; 16 M lets generated puzzles reach their logical stop for A, B, D and
 * F. The gate reads C at `spec` and A, B, D, F at `stop` (D101).
 */
export const ABLATION_BUDGETS = { spec: 2_000_000, stop: 16_000_000 } as const;
export type Budget = keyof typeof ABLATION_BUDGETS;

export function ablationLimits(budget: Budget): Readonly<Limits> {
  return Object.freeze({
    timeMs: 3_600_000,
    workUnits: ABLATION_BUDGETS[budget],
    exactNodes: 1,
    stepNodes: 4096,
    runNodes: 65536,
    proofBytes: 8_000_000,
    stepBytes: 2_000_000,
    batchBytes: 65536,
    inFlightBatches: 2,
    workspaceBytes: 64_000_000,
  });
}

export const ABLATION_LIMITS: Readonly<Limits> = ablationLimits("stop");

const tiers = new Map<string, number>(
  [...coverageEntries, ...variantEntries].map((entry) => [entry.version, entry.tier] as const),
);

export interface TraceStep {
  readonly technique: string;
  readonly tier: number;
  readonly workUnits: number;
  readonly effects: string;
}

export interface RunTrace {
  readonly case: string;
  readonly family: CorpusEntry["family"];
  readonly mode: "explain" | "analyze";
  readonly policy: PolicyId;
  readonly parameters?: PolicyParameters;
  readonly steps: readonly TraceStep[];
  /** Accounted logical-phase work at the logical stop. */
  readonly stopWork: number;
  readonly human: string;
  readonly outcome: string;
}

export function configLabel(policy: PolicyId, parameters?: PolicyParameters): string {
  return parameters
    ? `${policy} r${parameters.rotationEvery} d${parameters.decayShiftCap}`
    : policy;
}

export async function runCase(
  entry: CorpusEntry,
  mode: "explain" | "analyze",
  policy: PolicyId,
  parameters?: PolicyParameters,
  limits: Readonly<Limits> = ABLATION_LIMITS,
): Promise<RunTrace> {
  // Progress arrives after every work event (millions per run): keep only the
  // last human-phase total instead of retaining them.
  const events: ClassicSolveEvent[] = [];
  let stopWork = 0;
  await solveProblem(
    corpusProblem(entry),
    { mode, policy, ...(parameters ? { policyParameters: parameters } : {}), limits },
    {
      clock: { now: () => 0 },
      emit: (event) => {
        if (event.kind !== "progress") events.push(event);
        else if (event.phase === "human") stopWork = event.workUnits;
      },
      progressEveryMs: 0,
    },
  );
  const result = events.at(-1);
  if (result?.kind !== "result") throw new Error(`no result for ${entry.id}`);
  const steps = events
    .filter((event): event is Extract<ClassicSolveEvent, { kind: "step" }> => event.kind === "step")
    .map((step) => ({
      technique: step.technique,
      tier: tiers.get(step.technique) ?? -1,
      workUnits: step.workUnits,
      effects: step.effects
        .map((effect) => `${effect.kind[0]}${effect.cell}:${effect.symbol}`)
        .sort()
        .join(","),
    }));
  return {
    case: entry.id,
    family: entry.family,
    mode,
    policy,
    ...(parameters ? { parameters } : {}),
    steps,
    stopWork: Math.max(stopWork, steps.at(-1)?.workUnits ?? 0),
    human: result.human,
    outcome: result.outcome,
  };
}

export interface Metrics {
  /**
   * Median, over each policy's own states whose accepted step is tier >= 3, of
   * the work spent in that state up to that step (everything since the
   * previous accepted step, rules and cheaper tiers included). Trajectories
   * diverge, so the two populations are not paired; both sizes are reported.
   */
  readonly A: {
    baseline: number;
    candidate: number;
    reduction: number;
    states: number;
    candidateStates: number;
  };
  /**
   * Mean total work to the logical stop (solved or stalled) per puzzle, over
   * the pairs where both runs reached it; `censored` pairs (either run
   * `incomplete`) are counted, not averaged in at the budget.
   */
  readonly B: { baseline: number; candidate: number; reduction: number; censored: number };
  /** `incomplete` rate at the budget. */
  readonly C: { baseline: number; candidate: number };
  /** Accepted steps per family: the worst candidate/baseline ratio and the families below 90 %. */
  readonly D: { worst: number; below: readonly string[] };
  /** Explain tiers 0-2 prefix identical between the two configurations; `null` for Analyze. */
  readonly F: { identical: number; total: number } | null;
  readonly pass: { A: boolean; B: boolean; C: boolean; D: boolean; F: boolean };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

/** Work between consecutive accepted steps, for the steps of tier >= 3. */
function highTierWork(trace: RunTrace): number[] {
  const work: number[] = [];
  trace.steps.forEach((step, index) => {
    if (step.tier >= 3) work.push(step.workUnits - (trace.steps[index - 1]?.workUnits ?? 0));
  });
  return work;
}

function prefixBelowTier(trace: RunTrace, tier: number): string {
  const prefix: string[] = [];
  for (const step of trace.steps) {
    if (step.tier >= tier) break;
    prefix.push(`${step.technique}:${step.effects}`);
  }
  return prefix.join("|");
}

export function compare(baseline: readonly RunTrace[], candidate: readonly RunTrace[]): Metrics {
  const byCase = new Map(candidate.map((trace) => [trace.case, trace]));
  const pairs = baseline.flatMap((base) => {
    const other = byCase.get(base.case);
    return other ? [[base, other] as const] : [];
  });
  const aBase = pairs.flatMap(([base]) => highTierWork(base));
  const aCand = pairs.flatMap(([, cand]) => highTierWork(cand));
  const A = {
    baseline: median(aBase),
    candidate: median(aCand),
    reduction: median(aBase) === 0 ? 0 : 1 - median(aCand) / median(aBase),
    states: aBase.length,
    candidateStates: aCand.length,
  };
  const stopped = pairs.filter(
    ([base, cand]) => base.human !== "incomplete" && cand.human !== "incomplete",
  );
  const bBase = mean(stopped.map(([base]) => base.stopWork));
  const bCand = mean(stopped.map(([, cand]) => cand.stopWork));
  const B = {
    baseline: bBase,
    candidate: bCand,
    reduction: bBase === 0 ? 0 : 1 - bCand / bBase,
    censored: pairs.length - stopped.length,
  };
  const incomplete = (traces: readonly (readonly [RunTrace, RunTrace])[], pick: 0 | 1) =>
    traces.filter((pair) => pair[pick].human === "incomplete").length / Math.max(1, traces.length);
  const C = { baseline: incomplete(pairs, 0), candidate: incomplete(pairs, 1) };
  const count = (pick: 0 | 1) => {
    const counts = new Map<string, number>();
    for (const pair of pairs)
      for (const step of pair[pick].steps)
        counts.set(step.technique, (counts.get(step.technique) ?? 0) + 1);
    return counts;
  };
  const baseCounts = count(0),
    candCounts = count(1);
  let worst = 1;
  const below: string[] = [];
  for (const [technique, total] of baseCounts) {
    const ratio = (candCounts.get(technique) ?? 0) / total;
    worst = Math.min(worst, ratio);
    if (ratio < 0.9) below.push(technique);
  }
  const D = { worst, below: below.sort() };
  const explain = pairs.every(([base]) => base.mode === "explain");
  const identical = pairs.filter(
    ([base, cand]) => prefixBelowTier(base, 3) === prefixBelowTier(cand, 3),
  ).length;
  const F = explain ? { identical, total: pairs.length } : null;
  return {
    A,
    B,
    C,
    D,
    F,
    pass: {
      A: A.states > 0 && A.candidateStates > 0 && A.reduction >= 0.2,
      B: stopped.length > 0 && B.reduction >= 0.1,
      C: C.candidate <= C.baseline,
      D: below.length === 0,
      F: F === null || F.identical === F.total,
    },
  };
}

/** Metric E: two runs of one configuration yield byte-identical traces. */
export function identicalTraces(first: readonly RunTrace[], second: readonly RunTrace[]): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}
