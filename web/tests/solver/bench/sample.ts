/**
 * Sampling harness (spec §3.9, plan T14). Not a policy: on every view of the
 * Explain trajectory it drives `descriptor.discover()` directly for every
 * eligible technique of every tier, to exhaustion or a per-technique quantum
 * cap, and records the board feature vector with (found?, work to first
 * checked proposal or the censored cap, utility). It then advances with the
 * genuine explain-fair@1 choice. Not every state is sampled: while a rule
 * still propagates the scheduler never scores a technique; states solved by
 * a single (tiers 0-1) are decided in a few units before any scored tier is
 * reached, so only every SINGLES_STRIDE-th of them is kept, and tier-2
 * states every LOW_STRIDE-th; every state whose Explain choice is tier >= 3
 * or a stop is sampled. Deterministic and offline: the work counts come from
 * the detectors' own accounting, never a clock.
 */
import {
  canonicalProblem,
  normalizeClassic,
  type EngineProblem,
} from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { productionRules } from "../../../src/solver/rules/registry";
import { initialize, commitChecked, retainedProof } from "../../../src/solver/state/candidates";
import type { ReadView } from "../../../src/solver/state/types";
import { assembleTechniqueJobs, profileFor } from "../../../src/solver/techniques/registry";
import type { DeductionProposal } from "../../../src/solver/proof/types";
import { checkProposal } from "../../../src/solver/proof/checker";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import { TemplateOperationContext } from "../../../src/solver/indexes/templates";
import { selectStep } from "../../../src/solver/scheduling/select";
import { boardFeatures } from "../../../src/solver/scheduling/features-board";
import { stepFeatures } from "../../../src/solver/scheduling/features";
import { QUANTUM, schedulingOptions } from "../../../src/solver/scheduling/work";
import type { Limits } from "../../../src/solver/limits";
import type { CorpusEntry } from "./corpus-schema";

/** Per technique: found (1/0), work units to the first checked proposal (or the cap), utility. */
export type TechniqueSample = readonly [hit: 0 | 1, work: number, utility: number];

export interface StateSample {
  readonly case: string;
  readonly partition: CorpusEntry["partition"];
  readonly family: CorpusEntry["family"];
  readonly state: number;
  readonly features: readonly number[];
  readonly techniques: Readonly<Record<string, TechniqueSample>>;
  /** The explain-fair@1 step taken from this state, or the stop reason. */
  readonly chosen: string;
}

export const SAMPLER_VERSION = "sampler@1";
/** Per-technique work cap in units (spec §3.9: the cap is the cost control). */
export const DEFAULT_CAP = 4 * QUANTUM;
/** One in this many singles-solved (tier 0-1) states is sampled. */
export const SINGLES_STRIDE = 8;
/** One in this many tier-2 states is sampled. */
export const LOW_STRIDE = 3;

export const SAMPLE_LIMITS: Readonly<Limits> = Object.freeze({
  timeMs: 600_000,
  workUnits: 2_000_000,
  exactNodes: 500_000,
  stepNodes: 4096,
  runNodes: 65536,
  proofBytes: 8_000_000,
  stepBytes: 2_000_000,
  batchBytes: 65536,
  inFlightBatches: 2,
  workspaceBytes: 64_000_000,
});

/** Classic houses plus the case's variant constraints as one EngineProblem. */
export function corpusProblem(entry: Pick<CorpusEntry, "puzzle" | "constraints">): EngineProblem {
  const classic = normalizeClassic({
    kind: "classic",
    version: 1,
    width: 9,
    height: 9,
    givens: [...entry.puzzle].map(Number),
  });
  if (entry.constraints.length === 0) return classic;
  return canonicalProblem({
    schema: 1,
    cells: [...classic.cells],
    symbols: [...classic.symbols],
    givens: [...classic.givens],
    constraints: [
      ...classic.constraints.map((c) => ({
        id: c.id,
        type: c.type,
        cells: [...c.cells],
        parameters: {},
      })),
      ...entry.constraints.map((c) => ({
        id: c.id,
        type: c.type,
        cells: [...c.cells],
        parameters: { ...c.parameters },
      })),
    ],
  });
}

function sampleTechnique(
  view: ReadView,
  descriptor: ReturnType<typeof assembleTechniqueJobs>["techniques"][number],
  cap: number,
): TechniqueSample {
  const workspace = new IndexWorkspace({
    entryLimit: 100_000,
    byteLimit: SAMPLE_LIMITS.workspaceBytes,
  });
  const templates = new TemplateOperationContext(view);
  templates.advance(view, () => {});
  const discovery = descriptor.discover(view, { workspace, limits: SAMPLE_LIMITS, templates });
  let work = 0;
  let proposal: DeductionProposal | undefined;
  try {
    for (const event of discovery) {
      if (event.kind === "work") {
        work += event.units;
        if (work >= cap) break;
      } else if (event.kind === "proposal") {
        const checked = [
          ...checkProposal(event.proposal, {
            view,
            retained: retainedProof(view),
            limits: SAMPLE_LIMITS,
            policy: descriptor.assumptionPolicy,
            uniqueEvidenceId: null,
          }),
        ].at(-1);
        if (checked?.kind === "checked") {
          proposal = event.proposal;
          return [1, Math.max(1, work), stepFeatures(checked.step, view).utility];
        }
      } else break;
    }
  } catch (error) {
    // A detector that overruns its own workspace or budget is a censored miss.
    if (!(error instanceof Error)) throw error;
  } finally {
    discovery.return?.(undefined);
  }
  return [0, proposal ? Math.max(1, work) : Math.min(cap, Math.max(1, work)), 0];
}

/** Every quiescent state of the Explain trajectory of one corpus case. */
export function sampleCase(entry: CorpusEntry, cap = DEFAULT_CAP): StateSample[] {
  const problem = corpusProblem(entry);
  const assembled = assemble(problem, productionRules());
  if (!assembled.ok) throw new Error(`assembly: ${assembled.issues.map((i) => i.code).join(",")}`);
  const registry = assembleTechniqueJobs(assembled.value, profileFor(problem));
  let view = initialize(assembled.value, "primary");
  const samples: StateSample[] = [];
  const workspace = new IndexWorkspace({
    entryLimit: 100_000,
    byteLimit: SAMPLE_LIMITS.workspaceBytes,
  });
  const tiers = new Map(registry.techniques.map((descriptor) => [descriptor.id, descriptor.tier]));
  let singles = 0,
    low = 0;
  for (let state = 0; ; state += 1) {
    let chosen = "stop:incomplete";
    let next: ReadView | undefined;
    for (const event of selectStep(view, registry, {
      ...schedulingOptions({
        limits: SAMPLE_LIMITS,
        mode: "explain",
        profile: profileFor(problem),
        policy: "explain-fair@1",
      }),
      workspace,
      clock: { now: () => 0 },
    })) {
      if (event.kind === "checked-step") {
        chosen = event.step.proposal.technique;
        next = commitChecked(view, event.step).view;
        break;
      }
      if (event.kind === "logical-stop") chosen = `stop:${event.reason}`;
    }
    const tier = tiers.get(chosen);
    const sampled =
      !chosen.startsWith("rule-") &&
      (tier === undefined ||
        tier >= 3 ||
        (tier === 2 ? low++ % LOW_STRIDE === 0 : singles++ % SINGLES_STRIDE === 0));
    if (sampled) {
      const techniques: Record<string, TechniqueSample> = {};
      for (const descriptor of registry.techniques) {
        if (descriptor.eligible(view).kind !== "yes") continue;
        techniques[descriptor.id] = sampleTechnique(view, descriptor, cap);
      }
      samples.push({
        case: entry.id,
        partition: entry.partition,
        family: entry.family,
        state,
        features: boardFeatures(view),
        techniques,
        chosen,
      });
    }
    if (!next) break;
    view = next;
  }
  return samples;
}
