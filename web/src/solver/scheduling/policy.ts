import type { CheckedStep } from "../proof/types";
import type { ReadView } from "../state/types";
import type { TechniqueDescriptor } from "../techniques/types";
import { type SchedulingLedger, type JobKey, compareJob, compareText } from "./ledger";
import {
  DEFAULT_POLICY_PARAMETERS,
  isScoredPolicy,
  type PolicyId,
  type PolicyParameters,
} from "./work";
import { stepFeatures, compareFeatures, type StepFeatures } from "./features";

export interface SchedulerPolicy {
  next(ledger: SchedulingLedger, view: ReadView): JobKey;
  choose(checked: readonly CheckedStep[]): CheckedStep;
}
const clamp = (n: number) => Math.max(1, Math.min(1024, Number.isFinite(n) ? Math.floor(n) : 1));
/**
 * Frozen integer priorities are engineering hypotheses; tickets guarantee
 * service independently.
 */
export class FairPolicy implements SchedulerPolicy {
  #view?: ReadView;
  #features = new WeakMap<CheckedStep, StepFeatures>();
  readonly #tiers: ReadonlyMap<string, number>;
  readonly scored: boolean;
  readonly parameters: PolicyParameters;
  constructor(
    readonly id: PolicyId,
    techniques: readonly TechniqueDescriptor[],
    readonly mode: "explain" | "analyze" = id.startsWith("analyze-fair") ? "analyze" : "explain",
    parameters: PolicyParameters = DEFAULT_POLICY_PARAMETERS,
  ) {
    this.#tiers = new Map(techniques.map((descriptor) => [descriptor.id, descriptor.tier]));
    this.scored = isScoredPolicy(id);
    this.parameters = Object.freeze({ ...parameters });
  }
  next(ledger: SchedulingLedger, view: ReadView): JobKey {
    if (this.#view !== view) this.#features = new WeakMap();
    this.#view = view;
    let jobs = [...ledger.active];
    if (!jobs.length) throw Error("no-pending-job");
    // Original rules drain before every family selection window.
    if (jobs.some((j) => j.tier === -1)) jobs = jobs.filter((j) => j.tier === -1);
    else if (this.mode === "explain") {
      const tier = Math.min(...jobs.map((j) => j.tier));
      jobs = jobs.filter((j) => j.tier === tier);
    }
    const baseline = this.id === "fixed-scan@1" || this.id === "event-fixed@1";
    // A scored Explain policy keeps the canonical @1 order below scoreFromTier
    // (spec §3.7): declared constants, no model, no decay and the @1 rotation.
    const scoredHere =
      this.scored &&
      (this.mode === "analyze" || jobs.every((job) => job.tier >= this.parameters.scoreFromTier));
    const rotation = scoredHere ? this.parameters.rotationEvery : 4;
    const oldest = !baseline && (ledger.ticket + 1) % rotation === 0;
    const estimateOf = (job: (typeof jobs)[number]) => {
      if (!this.scored) return job.estimate;
      if (!scoredHere) return job.declared;
      const shift = Math.min(this.parameters.decayShiftCap, job.emptyQuanta);
      return { ...job.estimate, hit: Math.max(1, clamp(job.estimate.hit) >> shift) };
    };
    jobs.sort((left, right) => {
      if (oldest) return left.lastService - right.lastService || compareJob(left, right);
      if (baseline) return compareJob(left, right);
      const leftEstimate = estimateOf(left),
        rightEstimate = estimateOf(right);
      return (
        clamp(rightEstimate.hit) * clamp(rightEstimate.gain) * clamp(leftEstimate.cost) -
          clamp(leftEstimate.hit) * clamp(leftEstimate.gain) * clamp(rightEstimate.cost) ||
        compareJob(left, right)
      );
    });
    return jobs[0].key;
  }
  choose(checked: readonly CheckedStep[]): CheckedStep {
    if (!checked.length || !this.#view) throw Error("no-checked-candidate");
    const view = this.#view;
    const scored = checked.map((step) => {
      let features = this.#features.get(step);
      if (!features) {
        features = stepFeatures(step, view);
        this.#features.set(step, features);
      }
      return { step, features };
    });
    scored.sort((left, right) => {
      const tier =
        (this.#tiers.get(left.step.proposal.technique) ?? -1) -
        (this.#tiers.get(right.step.proposal.technique) ?? -1);
      return (
        (this.mode === "analyze"
          ? right.features.utility - left.features.utility ||
            compareFeatures(left.features, right.features)
          : 0) ||
        tier ||
        compareFeatures(left.features, right.features) ||
        compareText(left.step.proposal.technique, right.step.proposal.technique) ||
        compareText(left.features.effects, right.features.effects) ||
        compareText(left.features.proof, right.features.proof)
      );
    });
    return scored[0].step;
  }
}
