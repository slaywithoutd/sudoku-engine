import { PROFILES } from "../techniques/registry";
import type { Limits } from "../limits";
import type { VersionId } from "../problem";

export interface Budget {
  spend(units: number): boolean;
  remaining(): number;
}
export interface WorkHold {
  settle(units: number): void;
  dispose(): void;
}
export interface ReservableBudget extends Budget {
  reserve(units: number): WorkHold;
}
export interface WorkClock {
  now(): number;
}
export const SCHEDULER_VERSION = "scheduler@1";
export const QUANTUM = 256;
export type PolicyId =
  | "explain-fair@1"
  | "analyze-fair@1"
  | "fixed-scan@1"
  | "event-fixed@1"
  | "explain-fair@2"
  | "analyze-fair@2";
export const POLICY_IDS: readonly PolicyId[] = Object.freeze([
  "explain-fair@1",
  "analyze-fair@1",
  "fixed-scan@1",
  "event-fixed@1",
  "explain-fair@2",
  "analyze-fair@2",
]);
/**
 * Parameters of the @2 policies (spec §3.7, §3.11). They are part of the
 * canonical options, hence of the RunKey; the @1 policies carry none so
 * their keys stay byte-identical to M2.
 */
export interface PolicyParameters {
  /** Explain only: tiers below this keep the canonical @1 order. */
  readonly scoreFromTier: number;
  /** Every k-th ticket serves the least recently served active job. */
  readonly rotationEvery: number;
  /** effectiveHit = hit >> min(decayShiftCap, consecutive empty quanta). */
  readonly decayShiftCap: number;
}
export const DEFAULT_POLICY_PARAMETERS: PolicyParameters = Object.freeze({
  scoreFromTier: 3,
  rotationEvery: 4,
  decayShiftCap: 4,
});
export function isScoredPolicy(policy: PolicyId): boolean {
  return policy === "explain-fair@2" || policy === "analyze-fair@2";
}
export class WorkLimit extends Error {
  constructor(readonly reason = "work-limit") {
    super(reason);
  }
}
function integer(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw Error("invalid-work-units");
}
/** Atomic reservations leave no negative balance. Failed work never becomes free credit. */
export class WorkBudget implements Budget {
  #used = 0;
  #held = 0;
  constructor(readonly capacity: number) {
    integer(capacity);
  }
  get used(): number {
    return this.#used;
  }
  remaining(): number {
    return this.capacity - this.#used - this.#held;
  }
  spend(units: number): boolean {
    integer(units);
    if (units > this.remaining()) return false;
    this.#used += units;
    return true;
  }
  charge(units: number): void {
    if (!this.spend(units)) throw new WorkLimit();
  }
  /** Hold worst-case capacity; settlement never refunds already consumed work. */
  reserve(units: number): WorkHold {
    integer(units);
    if (units > this.remaining()) throw new WorkLimit();
    this.#held += units;
    let active = true;
    return Object.freeze({
      settle: (actual: number) => {
        if (!active) throw Error("settled-work-reservation");
        integer(actual);
        if (actual > units) throw Error("work-reservation-overflow");
        this.#held -= units;
        this.#used += actual;
        active = false;
      },
      dispose: () => {
        if (active) {
          this.#held -= units;
          active = false;
        }
      },
    });
  }
}
export interface SchedulingOptions {
  readonly mode: "explain" | "analyze";
  readonly policy: PolicyId;
  readonly profile: VersionId;
  readonly rollout: boolean;
  readonly limits: Readonly<Limits>;
  readonly phaseWorkUnits: number;
  readonly phaseTimeMs: number;
  /** Present exactly when the policy is scored (@2). */
  readonly policyParameters?: PolicyParameters;
}
/** Logical options only: task slices do not enter deterministic decisions. */
export function schedulingOptions(
  input: Partial<Omit<SchedulingOptions, "limits">> & { limits: Limits },
): SchedulingOptions {
  const mode = input.mode ?? "explain",
    policy = input.policy ?? (mode === "explain" ? "explain-fair@1" : "analyze-fair@1");
  const scored = (POLICY_IDS as readonly string[]).includes(policy) && isScoredPolicy(policy);
  const options: SchedulingOptions = {
    mode,
    policy,
    profile: input.profile ?? "classic-expanded@1",
    rollout: input.rollout ?? false,
    limits: Object.freeze({ ...input.limits }),
    phaseWorkUnits: input.phaseWorkUnits ?? input.limits.workUnits,
    phaseTimeMs: input.phaseTimeMs ?? input.limits.timeMs,
    ...(scored
      ? {
          policyParameters: Object.freeze({
            ...DEFAULT_POLICY_PARAMETERS,
            ...(input.policyParameters ?? {}),
          }),
        }
      : {}),
  };
  if (!["explain", "analyze"].includes(mode) || !(POLICY_IDS as readonly string[]).includes(policy))
    throw Error("invalid-scheduler-policy");
  if (
    (policy.startsWith("explain-fair") && mode !== "explain") ||
    (policy.startsWith("analyze-fair") && mode !== "analyze")
  )
    throw Error("policy-mode-mismatch");
  if (!scored && input.policyParameters !== undefined) throw Error("policy-parameters-unscored");
  if (options.policyParameters) {
    const { scoreFromTier, rotationEvery, decayShiftCap } = options.policyParameters;
    if (
      !Number.isSafeInteger(scoreFromTier) ||
      scoreFromTier < 0 ||
      !Number.isSafeInteger(rotationEvery) ||
      rotationEvery < 2 ||
      !Number.isSafeInteger(decayShiftCap) ||
      decayShiftCap < 0 ||
      decayShiftCap > 10 ||
      Object.keys(options.policyParameters).length !== 3
    )
      throw Error("invalid-policy-parameters");
  }
  if (!(PROFILES as readonly string[]).includes(options.profile)) throw Error("unknown-profile");
  if (typeof options.rollout !== "boolean") throw Error("invalid-rollout-option");
  if (options.rollout && (mode !== "analyze" || options.profile !== "classic-expanded@1"))
    throw Error("rollout-requires-analyze-primary");
  for (const value of [
    ...Object.values(options.limits),
    options.phaseWorkUnits,
    options.phaseTimeMs,
  ])
    integer(value);
  if (
    options.phaseWorkUnits > options.limits.workUnits ||
    options.phaseTimeMs > options.limits.timeMs
  )
    throw Error("invalid-phase-limit");
  return Object.freeze(options);
}
/** One canonical encoder shared with worker/controller identity construction. */
export function canonicalOptionsKey(input: SchedulingOptions): string {
  const options = schedulingOptions(input);
  const order = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(order)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((k) => [k, order((value as Record<string, unknown>)[k])]),
          )
        : value;
  return JSON.stringify(order(options));
}
