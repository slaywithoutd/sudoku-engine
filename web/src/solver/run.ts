import type { Assembly } from "./rules/types";
import type { ReadView } from "./state/types";
import type { TechniqueJobs } from "./scheduling/ledger";
import type { SelectionOptions } from "./scheduling/select";
import type { IndexWorkspace } from "./indexes/workspace";
import type { RunKey, SolverSnapshot } from "./snapshot";
import type { Limits } from "./limits";
import type { CheckedStep } from "./proof/types";
import { humanSteps, type HumanStopStatus } from "./human";
import { exactInitializationReservation, exactSteps, EXACT_METHOD } from "./exact";
import {
  mergeEvidence,
  type CountEvidence,
  type EvidenceContext,
  type HumanStatus,
} from "./evidence";
import type { ExactEvent, ExactStats } from "./exact";
import { WorkBudget } from "./scheduling/work";

export interface SolverRunRequest {
  readonly snapshot: SolverSnapshot;
  readonly assembly: Assembly;
  readonly view: ReadView;
  readonly registry: TechniqueJobs;
  readonly workspace: IndexWorkspace;
  readonly limits: Limits;
  readonly options: SelectionOptions;
  readonly run: RunKey;
  readonly accept: (step: CheckedStep) => ReadView;
  readonly conditional?: boolean;
  readonly priorCount?: CountEvidence;
}
export interface SolverPorts {
  readonly clock: { now(): number };
  readonly yieldTask: () => Promise<void>;
  readonly publish: (event: unknown) => Promise<void>;
  readonly awaitAcceptance: (stepId: number) => Promise<"accepted" | "human-stopped">;
}
export interface SolverTerminal {
  readonly kind: "terminal";
  readonly outcome: "complete" | "timeout" | "resource-limit" | "error";
  readonly code?: string;
  readonly human: HumanStatus;
  readonly count: CountEvidence;
}
const unknownCount: CountEvidence = Object.freeze({
  kind: "unknown",
  witnesses: Object.freeze([]),
  lowerBound: 0,
});

function exactStats(stats: ExactStats): ExactStats {
  return stats;
}
function status(value: HumanStopStatus): HumanStopStatus {
  return value;
}

/**
 * Share of the work and time limits the exact count may use before the logical
 * phase (spec M2.6 §4.3). Provisional until T08 re-derives the defaults.
 */
export const PRECOUNT_SHARE = 0.3;

type ExactDrive = "complete" | "resource-limit" | "timeout";
/** Exact nodes per publish and clock read. */
const EXACT_QUANTUM = 256;

/**
 * Owns the assemble -> exact count -> human -> exact (only if still unknown)
 * phase order. The exact search runs once: a conclusive precount is reused and
 * never recomputed; an inconclusive one is suspended and resumed after the
 * logical phase with the remaining budget (D049 as restated in D103).
 */
export async function runSolver(
  request: SolverRunRequest | any,
  ports: SolverPorts,
): Promise<void> {
  // A small injected phase driver is useful for protocol/worker tests and keeps
  // this domain module independent of DOM and Worker globals.
  if (request?.human && typeof request.human === "function") {
    const result = await request.human();
    await ports.publish({
      kind: "terminal",
      outcome: "complete",
      human: result.human,
      count: unknownCount,
    });
    return;
  }
  const start = ports.clock.now(),
    totalDeadline = start + request.limits.timeMs;
  let view = request.view as ReadView;
  const accepted: CheckedStep[] = [];
  let human: HumanStatus = "not-started";
  /** Why the logical phase stopped: its own reason, or "time-limit" for the safety stop. */
  let logicalStop: string | undefined;
  const totalBudget = new WorkBudget(request.limits.workUnits);
  let count: CountEvidence = request.priorCount ?? unknownCount;
  const evidenceRun = request.run;
  const context = (phase: EvidenceContext["phase"]): EvidenceContext => ({
    run: request.run,
    snapshot: request.snapshot,
    assembly: request.assembly,
    initialView: request.view,
    acceptedView: view,
    accepted,
    human,
    activeExactRun: evidenceRun,
    phase,
  });

  let exact: Generator<ExactEvent, void, void> | undefined;
  let lease: { dispose(): void } | undefined;
  let exactUsed = 0;
  let exactTerminal: ExactStats | undefined;
  /** A node's work event that did not fit the previous drive; charged first on resume. */
  let carried: Extract<ExactEvent, { kind: "work" }> | undefined;
  const release = () => {
    lease?.dispose();
    lease = undefined;
  };
  // Work is published, and the clock read, once per quantum of exact events
  // (one work event per node), not per node (spec §4.2); the work cut itself
  // stays per node.
  let ticks = 0,
    unpublished = 0,
    unpublishedStats: ExactStats | undefined;
  const flush = async () => {
    if (unpublished === 0) return;
    const units = unpublished;
    unpublished = 0;
    await ports.publish({ kind: "work", phase: "exact", units, stats: unpublishedStats });
  };
  /** Drives the one exact search until it ends, `workCap` or `deadline`. */
  const driveExact = async (workCap: number, deadline: number): Promise<ExactDrive> => {
    const result = await driveExactNodes(workCap, deadline);
    await flush();
    return result;
  };
  const driveExactNodes = async (workCap: number, deadline: number): Promise<ExactDrive> => {
    if (!exact) {
      const reservation = exactInitializationReservation(
        request.snapshot.problem,
        request.assembly,
      );
      lease = request.workspace.reserve(1, reservation.workspaceBytes);
      exact = exactSteps(request.snapshot.problem, request.assembly);
    }
    for (;;) {
      if (ticks++ % EXACT_QUANTUM === 0 && ports.clock.now() >= deadline) return "timeout";
      let event: ExactEvent;
      if (carried) event = carried;
      else {
        const next = exact.next();
        // The generator always yields a terminal event before it ends.
        if (next.done) return exactTerminal ? "complete" : "resource-limit";
        event = next.value;
      }
      carried = undefined;
      if (event.kind === "work") {
        if (exactUsed + event.units > workCap || !totalBudget.spend(event.units)) {
          carried = event;
          return "resource-limit";
        }
        exactUsed += event.units;
        unpublished += event.units;
        unpublishedStats = event.stats;
        if (ticks % EXACT_QUANTUM === 0) await flush();
      } else if (event.kind === "witness") {
        await flush();
        count = mergeEvidence(
          count,
          { kind: "unknown", witnesses: [event.values], lowerBound: 1 },
          context("exact"),
        ).count;
        await ports.publish({ kind: "evidence", count, stats: event.stats });
      } else if (event.kind === "exhausted") {
        await flush();
        exactTerminal = event.stats;
        const proof = {
          kind: "root-exhausted" as const,
          key: evidenceRun,
          method: EXACT_METHOD,
          stats: exactStats(event.stats),
          frontierEmpty: true as const,
        };
        const witness = count.kind === "unknown" ? count.witnesses[0] : undefined;
        // An exhausted root with no witness proves zero solutions, not a witness-less unique
        // claim.
        count = mergeEvidence(
          count,
          witness
            ? {
                kind: "unique",
                witness,
                evidenceId: `${evidenceRun.requestId}:count`,
                proof,
                rootExhausted: true,
              }
            : { kind: "zero", proof, evidenceId: `${evidenceRun.requestId}:count` },
          context("exact"),
        ).count;
        await ports.publish({ kind: "evidence", count, stats: event.stats });
        return "complete";
      } else {
        exactTerminal = event.stats;
        return "complete";
      }
    }
  };

  try {
    // Count first, within its share of the work and the time (spec §4.3).
    let reserved = 0;
    if (!request.conditional && count.kind === "unknown") {
      const share = Math.floor(request.limits.workUnits * PRECOUNT_SHARE);
      const drive = await driveExact(
        share,
        start + Math.floor(request.limits.timeMs * PRECOUNT_SHARE),
      );
      // An inconclusive precount keeps its unspent share for the resumed
      // search. Its time cap makes `exactUsed` clock-dependent, so the logical
      // phase is cut at limits - share either way, never at a clock-dependent
      // remainder (spec §3.4: the logical phase is cut by work units).
      if (drive !== "complete") reserved = share - exactUsed;
      if (drive === "complete") release();
      // driveExact updates `count` through its closure.
      const precount = count as CountEvidence;
      await ports.publish({ kind: "precount", count: precount });
      // Zero or several solutions make an explained logical phase meaningless.
      if (precount.kind === "zero" || precount.kind === "multiple") {
        await ports.publish({
          kind: "terminal",
          outcome: "complete",
          human,
          count,
          stats: exactTerminal,
        });
        return;
      }
    }

    // The logical phase gets the remaining work, which deterministically cuts
    // it; the remaining time is only a safety stop.
    const cursor = humanSteps(view, request.registry, {
      ...request.options,
      workspace: request.workspace,
      budget: totalBudget,
      phaseWorkUnits: Math.max(0, totalBudget.remaining() - reserved),
      phaseTimeMs: Math.max(0, Math.floor(totalDeadline - ports.clock.now())),
      clock: ports.clock,
      accept: (step: CheckedStep) => {
        const next = request.accept(step);
        view = next;
        accepted.push(step);
        return next;
      },
    });
    let next = cursor.next();
    while (!next.done) {
      const event = next.value;
      if (event.kind === "work") {
        await ports.publish({ kind: "work", phase: "human", units: event.units });
        await ports.yieldTask();
      } else if (event.kind === "proposal") {
        await ports.publish(event);
        const ack = await ports.awaitAcceptance(event.stepId);
        next = cursor.next(ack);
        continue;
      } else {
        human = status(event.human);
        logicalStop = event.reason;
        await ports.publish(event);
        break;
      }
      if (ports.clock.now() >= totalDeadline) {
        human = "incomplete";
        logicalStop = "time-limit";
        break;
      }
      next = cursor.next();
    }
    cursor.return();
    if (request.conditional) {
      await ports.publish({ kind: "terminal", outcome: "complete", human, count, logicalStop });
      return;
    }
    {
      // A conclusive count is reused, never recomputed; this merge only checks
      // it, or the witnesses of an inconclusive precount, against the accepted
      // logical path (which may itself add a witness).
      const merged = mergeEvidence(count, unknownCount, context("terminal"));
      count = merged.count;
      human = merged.human;
    }
    if (count.kind !== "unknown") {
      await ports.publish({
        kind: "terminal",
        outcome: "complete",
        human,
        count,
        stats: exactTerminal,
        logicalStop,
      });
      return;
    }
    if (ports.clock.now() >= totalDeadline) {
      await ports.publish({ kind: "terminal", outcome: "timeout", human, count, logicalStop });
      return;
    }
    const outcome =
      exactTerminal && !carried ? "complete" : await driveExact(Infinity, totalDeadline);
    await ports.publish({
      kind: "terminal",
      outcome,
      human,
      count,
      stats: exactTerminal,
      logicalStop,
    });
  } catch (error) {
    await ports.publish({
      kind: "terminal",
      outcome: "error",
      code: error instanceof Error ? error.message : "solver-error",
      human,
      count,
    });
  } finally {
    release();
    exact?.return();
  }
}
