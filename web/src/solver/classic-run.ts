import type { Limits } from "./limits";
import type { CheckedStep, Effect } from "./proof/types";
import type { CountEvidence, HumanStatus } from "./evidence";
import { normalizeClassic, type EngineProblem } from "./problem";
import { makeSnapshot, type RunKey } from "./snapshot";
import { assemble } from "./rules/assemble";
import { productionRules } from "./rules/registry";
import { profileFor, profileReadiness } from "./techniques/registry";
import { initialize, commitChecked } from "./state/candidates";
import { IndexWorkspace } from "./indexes/workspace";
import {
  schedulingOptions,
  type PolicyId,
  type PolicyParameters,
  type TierCap,
  canonicalOptionsKey,
  SCHEDULER_VERSION,
} from "./scheduling/work";
import { assembleTechniqueJobs } from "./techniques/registry";
import { EXACT_METHOD, exactSteps } from "./exact";
import { runSolver } from "./run";
import { coverageEntries, variantEntries } from "./techniques/manifest";
import { defined } from "./invariants";
import type { Ledger } from "./techniques/types";

const techniqueTiers = new Map<string, number>(
  [...coverageEntries, ...variantEntries].map((entry) => [entry.version, entry.tier] as const),
);
type Difficulty = Extract<ClassicSolveEvent, { kind: "result" }>["difficulty"];
function noDifficulty(): Difficulty {
  return { schema: "difficulty@0", maxTier: -1, stepsByTier: [] };
}
function difficultyOf(tiers: readonly number[]): Difficulty {
  const stepsByTier = Array(8).fill(0) as number[];
  for (const tier of tiers) stepsByTier[tier + 1] += 1;
  return { schema: "difficulty@0", maxTier: Math.max(-1, ...tiers), stepsByTier };
}
const techniqueNames = new Map<string, string>([
  ["rule-propagation@1", "Basic elimination"],
  ["rule-relation@1", "Relation propagation"],
  ["rule-sum@1", "Sum bounds"],
  ...variantEntries.map(
    (entry) => [entry.version, entry.aliases[0] ?? entry.id] as [string, string],
  ),
  ...coverageEntries.map(
    (entry) => [entry.version, entry.aliases[0] ?? entry.id] as [string, string],
  ),
]);

export type ClassicMode = "explain" | "analyze";
/** Plain, structured-cloneable events for the Solve screen. */
export type ClassicSolveEvent =
  | {
      readonly kind: "step";
      readonly index: number;
      readonly technique: string;
      readonly name: string;
      readonly effects: readonly Effect[];
      readonly values: readonly number[];
      /**
       * Candidate bitmasks (bit n-1 = digit n) before the step, and the cells its pattern reasons
       * about.
       */
      readonly candidates: readonly number[];
      readonly cells: readonly number[];
      /** Accounted work units of the logical phase when the step was proposed (informative). */
      readonly workUnits: number;
      /** A simpler step may exist: the selection was cut by a budget (spec M2.6 §4.5). */
      readonly budgetLimited: boolean;
    }
  | { readonly kind: "precount"; readonly solution: readonly number[] }
  | { readonly kind: "progress"; readonly phase: "human" | "exact"; readonly workUnits: number }
  | {
      readonly kind: "result";
      readonly outcome: "complete" | "timeout" | "resource-limit" | "error";
      readonly code?: string;
      readonly human: HumanStatus;
      readonly count: "zero" | "unique" | "multiple" | "unknown";
      readonly solution: readonly number[] | null;
      readonly logicalValues: readonly number[];
      readonly steps: number;
      /**
       * Informative only (spec §3.8): the highest catalogue tier among accepted
       * steps and the count of accepted steps per tier (index 0 = rule
       * maintenance, then tier 0..6). Nothing schedules or certifies on it.
       */
      readonly difficulty: {
        readonly schema: "difficulty@0";
        readonly maxTier: number;
        readonly stepsByTier: readonly number[];
      };
      /** Why the logical phase ended (spec M2.6 §4.5); see stopReasonOf and `outcome`. */
      readonly stopReason: StopReason;
      /** Milliseconds from the start until the count was proved, when it was. */
      readonly countVerifiedMs?: number;
      /** What the logical phase covered, by technique display name. */
      readonly coverage: Coverage;
      /** Accepted steps a budget may have kept from being the simplest. */
      readonly budgetLimitedSteps: number;
    };

export type StopReason =
  | "solved"
  | "profile-stall"
  | "work-limit"
  | "time-limit"
  | "tier-cap"
  | "contradiction"
  | "not-started";
export interface Coverage {
  /**
   * Nothing more to offer when the logical phase ended: exhausted or excluded
   * on the final state, or, on a solved grid, every technique that ran.
   */
  readonly exhausted: readonly string[];
  /**
   * Served but not finished on the final state of an unsolved run: capped by
   * the tier cap, interrupted on its own allowance, or still in progress or
   * pending when a budget ended the phase.
   */
  readonly capped: readonly string[];
  /** Never served on any state. */
  readonly notStarted: readonly string[];
  /** Highest catalogue tier with any served work; -1 when none. */
  readonly highestTierTried: number;
}

/**
 * Technique rows of the final scheduler ledger as display-name lists; every
 * technique row lands in exactly one list (rule jobs, tier -1, are not
 * techniques). Without a ledger every profile technique is "not started".
 */
export function coverageOf(
  ledger: Ledger | undefined,
  techniques: readonly string[],
  solved = false,
): Coverage {
  const name = (version: string) => techniqueNames.get(version) ?? version;
  const rows = ledger
    ? ledger.filter((row) => techniqueTiers.has(row.technique))
    : techniques.map((technique) => ({ technique, status: "pending" as const, work: 0 }));
  const exhausted: string[] = [],
    capped: string[] = [],
    notStarted: string[] = [];
  let highestTierTried = -1;
  for (const row of rows) {
    if (row.work > 0)
      highestTierTried = Math.max(highestTierTried, techniqueTiers.get(row.technique) ?? -1);
    if (row.status === "exhausted" || row.status === "excluded" || (solved && row.work > 0))
      exhausted.push(name(row.technique));
    else if (row.work > 0) capped.push(name(row.technique));
    else notStarted.push(name(row.technique));
  }
  // Each list holds at most 60 names (spec §4.5); the catalogue has 40 versions.
  const bound = (list: string[]) => Object.freeze(list.slice(0, 60));
  return Object.freeze({
    exhausted: bound(exhausted),
    capped: bound(capped),
    notStarted: bound(notStarted),
    highestTierTried,
  });
}

/**
 * Why the logical phase ended, from its status, its own stop reason and the
 * final ledger (spec §4.5); the result's `outcome` says how the whole run
 * ended (an exact phase that timed out afterwards is a "timeout" outcome).
 * Order: not started, solved, contradiction (also a logical path the count
 * invalidated), the time safety stop, then a tier cap whenever a technique
 * is capped (explain-fair@3 reopens capped jobs until the work runs out),
 * then a stall, then any other work or resource limit.
 */
export function stopReasonOf(
  human: HumanStatus,
  logicalStop: string | undefined,
  ledger: Ledger | undefined,
): StopReason {
  if (human === "not-started") return "not-started";
  if (human === "solved") return "solved";
  if (human === "contradiction" || human === "invalidated") return "contradiction";
  if (logicalStop === "time-limit") return "time-limit";
  // Capped now, or reopened after a cap on this state (reason kept).
  if (ledger?.some((row) => row.status === "capped" || row.reason === "tier-work-cap"))
    return "tier-cap";
  if (human === "stalled-within-profile") return "profile-stall";
  return "work-limit";
}

/**
 * Work budget per millisecond of the time limit (spec M2.6 §4.3, T08,
 * docs/history/m26-benchmark.md). The logical phase is cut by work, so a run
 * gives the same result every time as long as it ends before the time safety
 * stop. After a conclusive count the logical phase gets nearly the whole
 * budget; at 137k units per second, the slowest rate measured over a whole
 * 60 s run (Chromium, the laptop's slow state), 120 units per ms ends it at
 * about 88 % of the time limit. Escargot, Inkala 2012 and Golden Nugget reach tier 5
 * within 1.8M units (the 15 s preset); Golden Nugget's tier-5 step comes at
 * 1.16M.
 */
export const WORK_UNITS_PER_MS = 120;
/** Limits for a time preset of the Solve screen: the work budget scales with the time. */
export function classicLimitsFor(timeMs: number): Readonly<Limits> {
  return Object.freeze({
    ...CLASSIC_SOLVE_LIMITS,
    timeMs,
    workUnits: Math.round(timeMs * WORK_UNITS_PER_MS),
  });
}
/**
 * Interactive ceilings for one classic 9x9 run (the 60 s preset); the exact phase inherits what
 * the logical phase leaves.
 */
export const CLASSIC_SOLVE_LIMITS: Readonly<Limits> = Object.freeze({
  timeMs: 60_000,
  workUnits: 60_000 * WORK_UNITS_PER_MS,
  exactNodes: 1_000_000,
  stepNodes: 4096,
  runNodes: 65536,
  proofBytes: 8_000_000,
  stepBytes: 2_000_000,
  batchBytes: 65536,
  inFlightBatches: 2,
  workspaceBytes: 64_000_000,
});

export interface ClassicSolveInput {
  readonly givens: readonly number[];
  readonly mode?: ClassicMode;
  readonly requestId?: string;
  readonly limits?: Readonly<Limits>;
  /** Engine-side override for ablations; the application keeps the mode's default policy. */
  readonly policy?: PolicyId;
  readonly policyParameters?: PolicyParameters;
  /** Engine-side override of the explain-fair@3 tier cap (benchmarks, T08). */
  readonly tierCap?: TierCap;
}
export interface ClassicSolvePorts {
  readonly clock: { now(): number };
  readonly emit: (event: ClassicSolveEvent) => void;
  readonly progressEveryMs?: number;
}

function exactPrecount(
  problem: ReturnType<typeof normalizeClassic>,
  assembly: Parameters<typeof exactSteps>[1],
  limits: Readonly<Pick<Limits, "workUnits" | "timeMs">>,
  clock: { now(): number },
):
  { kind: "zero" | "multiple" | "inconclusive" } | { kind: "unique"; solution: readonly number[] } {
  const deadline = clock.now() + limits.timeMs,
    cap = limits.workUnits;
  let used = 0;
  const witnesses: (readonly number[])[] = [];
  const exact = exactSteps(problem, assembly);
  try {
    for (const event of exact) {
      if (event.kind === "work") {
        used += event.units;
        if (used > cap || clock.now() > deadline) return { kind: "inconclusive" };
      } else if (event.kind === "witness") witnesses.push(event.values);
      else if (event.kind === "cap-reached") return { kind: "multiple" };
      else
        return witnesses.length === 0
          ? { kind: "zero" }
          : witnesses.length === 1
            ? { kind: "unique", solution: witnesses[0] }
            : { kind: "multiple" };
    }
  } finally {
    exact.return();
  }
  return { kind: "inconclusive" };
}
/**
 * Presentation-only: cells named by a technique pattern (`cell`/`cells`
 * fields at any depth, bounded). Never used for proof or acceptance.
 */
export function patternCells(pattern: unknown): number[] {
  const found = new Set<number>();
  let budget = 2000;
  const isCell = (n: unknown): n is number =>
    Number.isInteger(n) && (n as number) >= 0 && (n as number) < 81;
  const walk = (x: unknown, depth: number) => {
    if (depth > 8 || budget-- <= 0 || !x || typeof x !== "object") return;
    if (Array.isArray(x)) {
      for (const item of x) walk(item, depth + 1);
      return;
    }
    for (const [key, value] of Object.entries(x as Record<string, unknown>)) {
      if (key === "cell" && isCell(value)) found.add(value);
      else if (key === "cells" && Array.isArray(value))
        value.forEach((item) => isCell(item) && found.add(item));
      else walk(value, depth + 1);
    }
  };
  walk(pattern, 0);
  return [...found].sort((left, right) => left - right);
}
/**
 * Budget of the independent count behind the correctness marks: its own
 * fixed caps, the 18M units and 18 s it had before T08 tied the Solve
 * screen's work budget to the time preset (T08 review).
 */
export const COUNT_CLASSIC_LIMITS: Readonly<Pick<Limits, "workUnits" | "timeMs">> = Object.freeze({
  workUnits: 18_000_000,
  timeMs: 18_000,
});
/** Independent exact count for a 9x9 grid (used for correctness marks). */
export function countClassic(
  givens: readonly number[],
  clock: { now(): number },
  limits: Readonly<Pick<Limits, "workUnits" | "timeMs">> = COUNT_CLASSIC_LIMITS,
):
  { kind: "zero" | "multiple" | "inconclusive" } | { kind: "unique"; solution: readonly number[] } {
  const problem = normalizeClassic({
    kind: "classic",
    version: 1,
    width: 9,
    height: 9,
    givens: [...givens],
  });
  const assembled = assemble(problem, productionRules());
  if (!assembled.ok) return { kind: "zero" };
  return exactPrecount(problem, assembled.value, limits, clock);
}
function countKind(count: CountEvidence): "zero" | "unique" | "multiple" | "unknown" {
  return count.kind;
}
function solutionOf(count: CountEvidence): readonly number[] | null {
  if (count.kind === "unique") return count.witness;
  return null;
}

/**
 * Composes the existing M2 pipeline for one 9x9 classic grid:
 * normalizeClassic -> assemble -> initialize -> exact count (reused) -> logical
 * phase (auto-accepted) -> exact count resumed only when still unknown.
 * Throws ProblemInputError for malformed givens; reports rule conflicts as an "error" result.
 */
export async function solveClassic(
  input: ClassicSolveInput,
  ports: ClassicSolvePorts,
): Promise<void> {
  const problem = normalizeClassic({
    kind: "classic",
    version: 1,
    width: 9,
    height: 9,
    givens: [...input.givens],
  });
  await solveProblem(problem, input, ports);
}

/**
 * The same pipeline over an already-normalized EngineProblem: the bench
 * harness and the ablation use it for variant corpus cases, which have no
 * classic definition (spec §3.2: variants are constraint instances only).
 */
export async function solveProblem(
  problem: EngineProblem,
  input: Omit<ClassicSolveInput, "givens">,
  ports: ClassicSolvePorts,
): Promise<void> {
  const limits = input.limits ?? CLASSIC_SOLVE_LIMITS,
    mode = input.mode ?? "explain",
    requestId = input.requestId ?? "solve";
  const started = ports.clock.now();
  const empty = (code: string, human: HumanStatus = "not-started") =>
    ports.emit({
      kind: "result",
      outcome: "error",
      code,
      human,
      count: "unknown",
      solution: null,
      logicalValues: [...problem.givens],
      steps: 0,
      difficulty: noDifficulty(),
      stopReason: "not-started",
      coverage: coverageOf(undefined, []),
      budgetLimitedSteps: 0,
    });
  const assembled = assemble(problem, productionRules());
  if (!assembled.ok) {
    empty(assembled.issues.map((issue) => issue.code).join(",") || "assembly-failed");
    return;
  }
  const assembly = assembled.value,
    snapshot = makeSnapshot(problem, { kind: "manual" }, requestId, 0);
  // runSolver counts first (spec M2.6 §4.3): zero or multiple solutions end the
  // run before the logical phase, and a conclusive count is reused, never recomputed.
  let view = initialize(assembly, "primary");
  const workspace = new IndexWorkspace({ entryLimit: 100_000, byteLimit: limits.workspaceBytes });
  // Classic input keeps the classic profile and RunKey; a declared variant rule
  // selects the variant profile that appends the K rows (spec §3.6).
  const PROFILE = profileFor(problem);
  if (!profileReadiness(PROFILE).ready) {
    empty("profile-incomplete");
    return;
  }
  const options = schedulingOptions({
    limits,
    mode,
    profile: PROFILE,
    // The M2.6 policies are the defaults (D103); @1/@2 stay selectable and
    // keep their traces (D094).
    policy: input.policy ?? (mode === "explain" ? "explain-fair@3" : "analyze-fair@3"),
    ...(input.policyParameters ? { policyParameters: input.policyParameters } : {}),
    ...(input.tierCap ? { tierCap: input.tierCap } : {}),
  });
  const run: RunKey = {
    requestId,
    snapshotId: snapshot.snapshotId,
    inputRevision: 0,
    problemKey: problem.key,
    operation: "primary",
    mode,
    engine: "engine@1",
    profile: PROFILE,
    scheduler: SCHEDULER_VERSION,
    checker: "checker@1",
    exact: EXACT_METHOD,
    optionsKey: canonicalOptionsKey(options),
    parentEvidenceId: null,
  };
  const progressEvery = ports.progressEveryMs ?? 250;
  let lastProgress = ports.clock.now(),
    work = 0,
    // Logical-phase work only, as the step event documents; `work` also counts
    // the exact phases for progress.
    logicalWork = 0,
    steps = 0;
  const tiersSeen: number[] = [];
  let pending:
    | {
        technique: string;
        effects: readonly Effect[];
        candidates: readonly number[];
        cells: readonly number[];
        workUnits: number;
        budgetLimited: boolean;
      }
    | undefined;
  let ledger: Ledger | undefined,
    budgetLimitedSteps = 0,
    countVerifiedMs: number | undefined;
  const registry = assembleTechniqueJobs(assembly, PROFILE);
  const noteCount = (count: CountEvidence | undefined) => {
    if (countVerifiedMs === undefined && count && count.kind !== "unknown")
      countVerifiedMs = Math.max(0, Math.round(ports.clock.now() - started));
  };
  const emitStep = (step: NonNullable<typeof pending>) =>
    ports.emit({
      kind: "step",
      index: steps,
      technique: step.technique,
      name: techniqueNames.get(step.technique) ?? step.technique,
      effects: step.effects,
      values: [...view.state.values],
      candidates: step.candidates,
      cells: step.cells,
      workUnits: step.workUnits,
      budgetLimited: step.budgetLimited,
    });
  await runSolver(
    {
      snapshot,
      assembly,
      view,
      registry,
      workspace,
      limits,
      options,
      run,
      accept: (step: CheckedStep) => {
        view = commitChecked(view, step).view;
        return view;
      },
    },
    {
      clock: ports.clock,
      yieldTask: async () => {},
      awaitAcceptance: async () => "accepted",
      publish: async (raw: unknown) => {
        const event = raw as {
          kind: string;
          phase?: "human" | "exact";
          units?: number;
          step?: CheckedStep;
          outcome?: "complete" | "timeout" | "resource-limit" | "error";
          code?: string;
          human?: HumanStatus;
          count?: CountEvidence;
          budgetLimited?: boolean;
          ledger?: Ledger;
          logicalStop?: string;
        };
        if (event.ledger) ledger = event.ledger;
        if (event.kind === "evidence" || event.kind === "precount" || event.kind === "terminal")
          noteCount(event.count);
        if (event.kind === "precount") {
          const count = defined(event.count, "count");
          if (count.kind === "unique")
            ports.emit({ kind: "precount", solution: [...count.witness] });
        } else if (event.kind === "work") {
          work += event.units ?? 0;
          if (event.phase !== "exact") logicalWork += event.units ?? 0;
          const now = ports.clock.now();
          if (pending) {
            emitStep(pending);
            pending = undefined;
          }
          if (now - lastProgress >= progressEvery) {
            lastProgress = now;
            ports.emit({ kind: "progress", phase: event.phase ?? "human", workUnits: work });
          }
        } else if (event.kind === "proposal" && event.step) {
          // The step is committed by `accept` after this publish resolves; flush its board on the
          // next event.
          if (pending) emitStep(pending);
          steps++;
          if (event.budgetLimited) budgetLimitedSteps++;
          tiersSeen.push(techniqueTiers.get(event.step.proposal.technique) ?? -1);
          pending = {
            technique: event.step.proposal.technique,
            effects: event.step.proposal.effects,
            candidates: [...view.state.domains],
            cells: patternCells(event.step.proposal.pattern),
            workUnits: logicalWork,
            budgetLimited: !!event.budgetLimited,
          };
        } else if (event.kind === "terminal") {
          if (pending) {
            emitStep(pending);
            pending = undefined;
          }
          const count = defined(event.count, "count"),
            human = event.human ?? "not-started",
            // An error during the logical phase leaves its status unset.
            logicalHuman = human === "not-started" && steps > 0 ? "incomplete" : human;
          ports.emit({
            kind: "result",
            outcome: event.outcome ?? "error",
            code: event.code,
            human,
            count: countKind(count),
            solution: solutionOf(count),
            logicalValues: [...view.state.values],
            steps,
            difficulty: difficultyOf(tiersSeen),
            stopReason: stopReasonOf(logicalHuman, event.logicalStop, ledger),
            ...(countVerifiedMs === undefined ? {} : { countVerifiedMs }),
            coverage: coverageOf(
              ledger,
              registry.techniques.map((technique) => technique.id),
              human === "solved",
            ),
            budgetLimitedSteps,
          });
        }
      },
    },
  );
}
