import type { ConstraintId, SymbolId, CellId } from "./problem";
import type { ExactStats } from "./exact";
import type { Assembly } from "./rules/types";
import type { RunKey, SolverSnapshot } from "./snapshot";
import { makeSnapshot } from "./snapshot";
import type { ReadView } from "./state/types";
import type { CheckedStep } from "./proof/types";
import { canonicalProblem } from "./problem";
import { EXACT_METHOD, isWitness, exactInitializationReservation } from "./exact";
import { isAcceptedPath } from "./state/candidates";
import { symbolMask } from "./state/read";

export type CountProof =
  | {
      readonly kind: "duplicate-givens";
      readonly constraintId: ConstraintId;
      readonly symbol: SymbolId;
      readonly cells: readonly CellId[];
    }
  | {
      readonly kind: "root-exhausted";
      readonly key: RunKey;
      readonly method: string;
      readonly stats: ExactStats;
      readonly frontierEmpty: true;
    };
export type CountEvidence =
  | {
      readonly kind: "unknown";
      readonly witnesses: readonly (readonly number[])[];
      readonly lowerBound: 0 | 1;
    }
  | { readonly kind: "zero"; readonly proof: CountProof; readonly evidenceId: string }
  | {
      readonly kind: "unique";
      readonly witness: readonly number[];
      readonly evidenceId: string;
      readonly proof: Extract<CountProof, { kind: "root-exhausted" }>;
      readonly rootExhausted: true;
    }
  | {
      readonly kind: "multiple";
      readonly witnesses: readonly [readonly number[], readonly number[]];
      readonly lowerBound: 2;
    };
export type HumanStatus =
  | "not-started"
  | "solved"
  | "stalled-within-profile"
  | "incomplete"
  | "contradiction"
  | "invalidated";
export type Quality = "perfect-verified" | "not-established" | "not-applicable" | "inconsistent";
export interface QualityContext {
  /** Controller-owned actual operation, never inferred from a branch label. */
  readonly run: RunKey;
  readonly assembly: Assembly;
  readonly initialView: ReadView;
  readonly acceptedView: ReadView;
}
export interface EvidenceContext extends QualityContext {
  readonly snapshot: SolverSnapshot;
  readonly accepted: readonly CheckedStep[];
  readonly human: HumanStatus;
  /** Explicit lifecycle authority: only the active primary exact phase may exhaust. */
  readonly activeExactRun: RunKey | null;
  readonly phase: "human" | "exact" | "terminal";
}
export interface EvidenceMerge {
  readonly count: CountEvidence;
  readonly human: HumanStatus;
  readonly diagnostics: readonly string[];
}

// Local acceptance survives terminalization but cannot be forged by deserialization.
// A transport receiver must first authorize/revalidate fresh process evidence here.
const acceptedCounts = new WeakMap<CountEvidence, Readonly<RunKey>>();
declare const uniqueParentBrand: unique symbol;
/** Read-only, realm-local authority. No count witness is exposed to proof consumers. */
export interface AcceptedUniqueParent {
  readonly [uniqueParentBrand]: true;
  readonly evidenceId: string;
}
export interface UniqueParentDetails {
  readonly snapshot: SolverSnapshot;
  readonly run: Readonly<RunKey>;
  readonly assembly: Assembly;
  readonly prefix: readonly CheckedStep[];
}
const uniqueParents = new WeakMap<AcceptedUniqueParent, UniqueParentDetails>();
const uniqueParentCounts = new WeakMap<AcceptedUniqueParent, CountEvidence>();
const revokedUniqueCounts = new WeakSet<CountEvidence>();

/**
 * The controller calls this with its actual current, non-quarantined primary
 * acceptance context. Serialized evidence, invalidated paths and witness-only
 * unknown counts cannot create this capability. On lifecycle invalidation the
 * controller must revoke the returned parent before admitting further work.
 */
export function acceptedUniqueParent(
  count: CountEvidence,
  context: EvidenceContext,
  quarantined: boolean,
): AcceptedUniqueParent | undefined {
  const accepted = acceptedCounts.get(count);
  if (
    quarantined !== false ||
    revokedUniqueCounts.has(count) ||
    !accepted ||
    count.kind !== "unique" ||
    !context ||
    context.run.operation !== "primary" ||
    context.human === "invalidated" ||
    !sameRun(accepted, context.run) ||
    !boundContext(context.snapshot, context) ||
    !isAcceptedPath(context.initialView, context.acceptedView, context.accepted) ||
    !unconditional(context.accepted) ||
    !compatible(count.witness, context.acceptedView)
  )
    return undefined;
  const parent = Object.freeze({ evidenceId: count.evidenceId }) as AcceptedUniqueParent;
  uniqueParents.set(
    parent,
    Object.freeze({
      snapshot: makeSnapshot(
        context.snapshot.problem,
        context.snapshot.source,
        context.snapshot.snapshotId,
        context.snapshot.inputRevision,
      ),
      run: accepted,
      assembly: context.assembly,
      prefix: Object.freeze([...context.accepted]),
    }),
  );
  uniqueParentCounts.set(parent, count);
  return parent;
}

/** Read-only active-parent query. It cannot authenticate a wire-shaped record. */
export function uniqueParentDetails(parent: AcceptedUniqueParent): UniqueParentDetails | undefined {
  const count = uniqueParentCounts.get(parent);
  return count && !revokedUniqueCounts.has(count) ? uniqueParents.get(parent) : undefined;
}

/** Revocation is monotone; callers cannot restore an old parent capability. */
export function revokeUniqueParent(parent: AcceptedUniqueParent): void {
  const count = uniqueParentCounts.get(parent);
  if (count) {
    revokedUniqueCounts.add(count);
    acceptedCounts.delete(count);
  }
  uniqueParents.delete(parent);
}
const runFields = [
  "requestId",
  "snapshotId",
  "inputRevision",
  "problemKey",
  "operation",
  "mode",
  "engine",
  "profile",
  "scheduler",
  "checker",
  "exact",
  "optionsKey",
  "parentEvidenceId",
] as const;
const version = /^[a-z][a-z0-9-]*@[1-9]\d*$/;
function validRun(run: RunKey): boolean {
  return (
    !!run &&
    typeof run === "object" &&
    Object.keys(run).length === runFields.length &&
    runFields.every((field) => Object.hasOwn(run, field)) &&
    [run.requestId, run.snapshotId, run.problemKey, run.optionsKey].every(
      (value) => typeof value === "string" && value.length > 0,
    ) &&
    Number.isSafeInteger(run.inputRevision) &&
    run.inputRevision >= 0 &&
    (run.mode === "explain" || run.mode === "analyze") &&
    [run.engine, run.profile, run.scheduler, run.checker, run.exact].every(
      (value) => typeof value === "string" && version.test(value),
    ) &&
    ((run.operation === "primary" && run.parentEvidenceId === null) ||
      (run.operation === "conditional" &&
        typeof run.parentEvidenceId === "string" &&
        run.parentEvidenceId.length > 0))
  );
}
function sameRun(left: RunKey, right: RunKey): boolean {
  return (
    validRun(left) && validRun(right) && runFields.every((field) => left[field] === right[field])
  );
}
function boundContext(snapshot: SolverSnapshot, context: QualityContext): boolean {
  try {
    exactInitializationReservation(snapshot.problem, context.assembly);
    return (
      validRun(context.run) &&
      context.run.snapshotId === snapshot.snapshotId &&
      context.run.inputRevision === snapshot.inputRevision &&
      context.run.problemKey === canonicalProblem(snapshot.problem).key &&
      canonicalProblem(context.assembly.problem).key === context.run.problemKey &&
      context.initialView.assembly.problem.key === context.run.problemKey &&
      context.acceptedView.assembly.problem.key === context.run.problemKey &&
      snapshot.problem.constraints.every((rule) => {
        const module = context.assembly.modules.get(rule.id);
        return (
          !!module &&
          module.type === rule.type &&
          module === context.initialView.assembly.modules.get(rule.id) &&
          module === context.acceptedView.assembly.modules.get(rule.id)
        );
      })
    );
  } catch {
    return false;
  }
}
function sameWitness(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, cell) => value === right[cell]);
}
function compatible(witness: readonly number[], view: ReadView): boolean {
  return witness.every(
    (symbol, cell) =>
      (view.state.values[cell] === 0 || view.state.values[cell] === symbol) &&
      (view.state.domains[cell] & symbolMask(symbol)) !== 0,
  );
}
function unconditional(accepted: readonly CheckedStep[]): boolean {
  return accepted.every((step) =>
    step.consequences.every(
      (inference) => !inference.conditional && inference.openAssumptions.length === 0,
    ),
  );
}
function validStats(stats: ExactStats): boolean {
  return (
    !!stats &&
    Object.keys(stats).length === 3 &&
    [stats.nodes, stats.backtracks, stats.maxDepth].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) &&
    stats.nodes >= 1 &&
    stats.backtracks <= stats.nodes &&
    stats.maxDepth <= 81 &&
    stats.maxDepth < stats.nodes
  );
}
function validExhaustion(
  proof: Extract<CountProof, { kind: "root-exhausted" }>,
  context: EvidenceContext,
): boolean {
  return (
    !!proof &&
    Object.keys(proof).length === 5 &&
    proof.kind === "root-exhausted" &&
    proof.frontierEmpty === true &&
    proof.method === EXACT_METHOD &&
    proof.key?.exact === EXACT_METHOD &&
    validStats(proof.stats) &&
    context.phase === "exact" &&
    context.run.operation === "primary" &&
    !!context.activeExactRun &&
    sameRun(proof.key, context.activeExactRun) &&
    sameRun(proof.key, context.run)
  );
}
function validDuplicate(proof: CountProof, context: EvidenceContext): boolean {
  if (!proof || Object.keys(proof).length !== 4 || proof.kind !== "duplicate-givens") return false;
  const problem = context.snapshot.problem;
  const rule = problem.constraints.find((rule) => rule.id === proof.constraintId);
  return (
    !!rule &&
    rule.type === "all-different@1" &&
    context.assembly.modules.get(rule.id)?.type === rule.type &&
    problem.symbols.includes(proof.symbol) &&
    Array.isArray(proof.cells) &&
    proof.cells.length >= 2 &&
    proof.cells.length <= rule.cells.length &&
    new Set(proof.cells).size === proof.cells.length &&
    proof.cells.every((cell) => rule.cells.includes(cell) && problem.givens[cell] === proof.symbol)
  );
}
function freezeProof(proof: CountProof): CountProof {
  return proof.kind === "duplicate-givens"
    ? Object.freeze({ ...proof, cells: Object.freeze([...proof.cells]) })
    : Object.freeze({
        ...proof,
        key: Object.freeze({ ...proof.key }),
        stats: Object.freeze({ ...proof.stats }),
      });
}

/** Linear accepted-lineage validation plus bounded full-rule checking; no replay or discovery. */
export function deriveQuality(
  snapshot: SolverSnapshot,
  human: HumanStatus,
  accepted: readonly CheckedStep[],
  count: CountEvidence,
  usedFallback: boolean,
  context: QualityContext,
): Quality {
  if (!context || !boundContext(snapshot, context)) return "not-established";
  if (context.run.operation !== "primary") return "not-established";
  if (!isAcceptedPath(context.initialView, context.acceptedView, accepted)) return "inconsistent";
  if (human === "invalidated") return "inconsistent";
  if (
    snapshot.problem.givens.every((value) => value !== 0) &&
    isWitness(snapshot.problem, context.assembly, snapshot.problem.givens)
  )
    return "not-applicable";
  const complete = isWitness(snapshot.problem, context.assembly, context.acceptedView.state.values);
  if (human === "solved" && !complete) return "inconsistent";
  if (human !== "solved" || usedFallback || !unconditional(accepted)) return "not-established";
  if (
    count.kind === "multiple" &&
    count.witnesses.every((witness) => isWitness(snapshot.problem, context.assembly, witness)) &&
    !sameWitness(count.witnesses[0], count.witnesses[1])
  )
    return "inconsistent";
  const authority = acceptedCounts.get(count);
  if (!authority || !sameRun(authority, context.run)) return "not-established";
  if (count.kind === "zero") return "inconsistent";
  if (count.kind !== "unique") return "not-established";
  return sameWitness(count.witness, context.acceptedView.state.values)
    ? "perfect-verified"
    : "inconsistent";
}

/**
 * Witnesses carry direct mathematical evidence; exhaustion carries authorized
 * active-run process evidence. Rejection of the latter never deletes the former.
 * Diagnostics are returned to the controller for persistent operation quarantine.
 */
export function mergeEvidence(
  previous: CountEvidence,
  incoming: CountEvidence,
  context: EvidenceContext,
): EvidenceMerge {
  const diagnostics = new Set<string>();
  const witnesses: (readonly number[])[] = [];
  const claims: Extract<CountEvidence, { kind: "zero" | "unique" }>[] = [];
  const bound = boundContext(context.snapshot, context);
  if (!bound) diagnostics.add("evidence-context-mismatch");
  for (const evidence of [previous, incoming]) {
    if (!evidence || typeof evidence !== "object") {
      diagnostics.add("malformed-evidence");
      continue;
    }
    const offered =
      evidence.kind === "unique"
        ? [evidence.witness]
        : "witnesses" in evidence && Array.isArray(evidence.witnesses)
          ? evidence.witnesses.slice(0, 2)
          : [];
    for (const witness of offered) {
      if (!isWitness(context.snapshot.problem, context.assembly, witness)) {
        diagnostics.add("invalid-witness");
        continue;
      }
      if (witnesses.length < 2 && !witnesses.some((prior) => sameWitness(prior, witness)))
        witnesses.push(Object.freeze([...witness]));
    }
    if (evidence.kind === "zero" || evidence.kind === "unique") {
      const retained = acceptedCounts.get(evidence);
      const authorized = retained && sameRun(retained, context.run);
      const valid =
        bound &&
        typeof evidence.evidenceId === "string" &&
        evidence.evidenceId.length > 0 &&
        (evidence.kind !== "unique" ||
          (evidence.rootExhausted === true &&
            isWitness(context.snapshot.problem, context.assembly, evidence.witness))) &&
        (authorized ||
          (evidence.kind === "zero" && validDuplicate(evidence.proof, context)) ||
          (evidence.proof?.kind === "root-exhausted" && validExhaustion(evidence.proof, context)));
      if (valid) claims.push(evidence);
      else diagnostics.add("rejected-count-proof");
    } else if (
      (evidence.kind === "multiple" && (offered.length !== 2 || witnesses.length < 2)) ||
      (evidence.kind !== "unknown" && evidence.kind !== "multiple")
    )
      diagnostics.add("malformed-evidence");
  }
  let human = context.human;
  const path = bound && isAcceptedPath(context.initialView, context.acceptedView, context.accepted);
  // Existence is independently checkable even before/without running exact DFS.
  // This merge-only witness is never passed into that search's private frontier.
  const logicalComplete =
    path &&
    isWitness(context.snapshot.problem, context.assembly, context.acceptedView.state.values);
  if (
    logicalComplete &&
    witnesses.length < 2 &&
    !witnesses.some((witness) => sameWitness(witness, context.acceptedView.state.values))
  )
    witnesses.push(Object.freeze([...context.acceptedView.state.values]));
  if (!path || !unconditional(context.accepted)) {
    diagnostics.add("invalid-accepted-path");
    human = "invalidated";
  } else if (
    witnesses.some((witness) => !compatible(witness, context.acceptedView)) ||
    (human === "solved" && !logicalComplete) ||
    (human === "contradiction" && witnesses.length > 0)
  ) {
    diagnostics.add("incompatible-human-path");
    human = "invalidated";
  }
  const incompatible =
    claims.some((claim) =>
      claim.kind === "zero"
        ? witnesses.length > 0
        : witnesses.some((witness) => !sameWitness(witness, claim.witness)),
    ) ||
    (claims.some((claim) => claim.kind === "zero") &&
      claims.some((claim) => claim.kind === "unique"));
  if (incompatible) diagnostics.add("incompatible-exhaustion");
  let count: CountEvidence;
  if (witnesses.length >= 2)
    count = Object.freeze({
      kind: "multiple",
      witnesses: Object.freeze([witnesses[0], witnesses[1]]) as readonly [
        readonly number[],
        readonly number[],
      ],
      lowerBound: 2,
    });
  else if (!incompatible && claims.length > 0) {
    const claim = claims[0];
    count =
      claim.kind === "zero"
        ? Object.freeze({
            kind: "zero",
            proof: freezeProof(claim.proof),
            evidenceId: claim.evidenceId,
          })
        : Object.freeze({
            kind: "unique",
            witness: witnesses[0],
            proof: freezeProof(claim.proof) as typeof claim.proof,
            evidenceId: claim.evidenceId,
            rootExhausted: true,
          });
    acceptedCounts.set(count, Object.freeze({ ...context.run }));
  } else
    count = Object.freeze({
      kind: "unknown",
      witnesses: Object.freeze(witnesses),
      lowerBound: witnesses.length === 0 ? 0 : 1,
    });
  return Object.freeze({ count, human, diagnostics: Object.freeze([...diagnostics]) });
}
