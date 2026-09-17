import { normalizeClassic, canonicalProblem, type ConstraintInstance } from "../../src/solver/problem";
import { assemble } from "../../src/solver/rules/assemble";
import { AllDifferentRule } from "../../src/solver/rules/all-different";
import { makeSnapshot, type RunKey } from "../../src/solver/snapshot";
import { exactSteps, EXACT_METHOD } from "../../src/solver/exact";
import { mergeEvidence, acceptedUniqueParent, type CountEvidence, type EvidenceContext } from "../../src/solver/evidence";
import { initialize, retainedProof, commitChecked } from "../../src/solver/state/candidates";
import { checkProposal } from "../../src/solver/proof/checker";
import type { CheckedStep, DeductionProposal } from "../../src/solver/proof/types";
import { ConditionalOperation } from "../../src/solver/conditional";
import { IndexWorkspace } from "../../src/solver/indexes/workspace";
import { getTechniques } from "../../src/solver/techniques/registry";
import { compileForcing, type ForcingPlan } from "../../src/solver/techniques/forcing";
import type { RuleModule } from "../../src/solver/rules/types";
import type { UniqueSeed } from "./unique-independent";

export const uniqueLimits = { timeMs: 60000, workUnits: 100_000_000, exactNodes: 1_000_000, stepNodes: 8192,
  runNodes: 250000, proofBytes: 64_000_000, stepBytes: 2_000_000, batchBytes: 65536, inFlightBatches: 2, workspaceBytes: 256_000_000 };

/** Real exact/merge/check/commit only. Fixture witnesses never enter this harness. */
export function uniqueHarness(seed: UniqueSeed, extra?: {constraints:readonly ConstraintInstance[];modules:readonly RuleModule[]}) {
  const classic=normalizeClassic({kind:"classic",version:1,width:9,height:9,givens:[...seed.givens].map(Number)});
  const problem=extra?canonicalProblem({schema:classic.schema,cells:classic.cells,symbols:classic.symbols,givens:classic.givens,constraints:[...classic.constraints,...extra.constraints]}):classic;
  const assembled = assemble(problem, extra?.modules ?? [new AllDifferentRule()]);
  if (!assembled.ok) throw Error("unique-test-assembly");
  const assembly = assembled.value, snapshot = makeSnapshot(assembly.problem, { kind: "manual" }, seed.id, 0);
  const run: RunKey = { requestId: `${seed.id}:primary`, snapshotId: snapshot.snapshotId, inputRevision: 0, problemKey: assembly.problem.key,
    operation: "primary", mode: "explain", engine: "engine@1", profile: "classic-expanded@1", scheduler: "scheduler@1", checker: "checker@1",
    exact: EXACT_METHOD, optionsKey: "test", parentEvidenceId: null };
  const initialView = initialize(assembly, "primary"); let view = initialView;
  const accepted: CheckedStep[] = [];
  const context = (): EvidenceContext => ({ snapshot, run, assembly, initialView, acceptedView: view, accepted, human: "not-started", activeExactRun: run, phase: "exact" });
  const witnesses: (readonly number[])[] = []; let raw: CountEvidence | undefined, work = 0;
  for (const event of exactSteps(assembly.problem, assembly)) {
    if (++work > uniqueLimits.workUnits) throw Error("unique-test-exact-budget");
    if (event.kind === "witness") witnesses.push(event.values);
    if (event.kind === "exhausted" && witnesses.length === 1) raw = { kind: "unique", witness: witnesses[0], evidenceId: `${seed.id}:evidence`, rootExhausted: true,
      proof: { kind: "root-exhausted", key: run, method: EXACT_METHOD, stats: event.stats, frontierEmpty: true } };
  }
  if (!raw) throw Error("unique-test-not-unique");
  const merged = mergeEvidence({ kind: "unknown", witnesses: [], lowerBound: 0 }, raw, context());
  if (merged.count.kind !== "unique" || merged.diagnostics.length) throw Error("unique-test-merge-rejected");
  const commit = (proposal: DeductionProposal) => {
    const result = [...checkProposal(proposal, { view, retained: retainedProof(view), limits: uniqueLimits, policy: "discharged", uniqueEvidenceId: null })].at(-1);
    if (result?.kind !== "checked") throw Error(`unique-prefix-rejected:${JSON.stringify(result)}`);
    accepted.push(result.step); view = commitChecked(view, result.step).view;
  };
  for (const rule of assembly.problem.constraints) for (const event of assembly.modules.get(rule.id)!.propagate(view, rule))
    if (event.kind === "proposal") commit(event.proposal);
  for (const op of seed.prefix ?? []) {
    if (typeof op !== "object" || op.kind === "peer") continue;
    if (op.kind === "forcing" || op.kind === "forcing-placement") {
      commit(compileForcing(view, { ...op.expectedPattern, alias: "Digit forcing chains" } as ForcingPlan, op.expectedEffects[0]));
    } else {
      const id = op.kind === "locked" ? "c03@1" : op.reason.kind === "hidden" ? "c02@1" : "c01@1";
      const detector = getTechniques("classic-expanded@1").find(d => d.id === id)!;
      const workspace = new IndexWorkspace({ entryLimit: 1_000_000, byteLimit: uniqueLimits.workspaceBytes });
      let proposal: DeductionProposal | undefined;
      const cursor = detector.discover(view, { workspace, limits: uniqueLimits });
      try {
        for (const event of cursor) if (event.kind === "proposal" && (op.kind === "locked" ?
          event.proposal.effects.length === op.removed.length && event.proposal.effects.every(e => e.kind === "remove" && e.symbol === op.symbol && op.removed.includes(e.cell)) :
          event.proposal.effects.some(e => e.kind === "place" && e.cell === op.cell && e.symbol === op.symbol))) { proposal = event.proposal; break; }
      } finally { cursor.return(); }
      if (!proposal) throw Error(`unique-prefix-not-discovered:${seed.id}:${JSON.stringify(op)}`);
      if (op.kind === "single-placement") {
        if (view.state.domains[op.cell] !== 1 << (op.symbol - 1) || JSON.stringify([...proposal.effects].sort((a,b) => a.cell-b.cell)) !== JSON.stringify([...op.expectedEffects].sort((a,b) => a.cell-b.cell)))
          throw Error("unique-normalized-prefix-mismatch");
      }
      commit(proposal);
    }
  }
  if (JSON.stringify(view.state.values) !== JSON.stringify(seed.preState.values) || JSON.stringify(view.state.domains) !== JSON.stringify(seed.preState.domains))
    throw Error(`unique-prefix-state:${seed.id}`);
  const parent = acceptedUniqueParent(merged.count, context(), false);
  if (!parent) throw Error("unique-parent-rejected");
  const conditionalRun: RunKey = { ...run, requestId: `${seed.id}:conditional`, operation: "conditional", profile: "classic-conditional@1", parentEvidenceId: parent.evidenceId };
  const workspace = new IndexWorkspace({ entryLimit: 1_000_000, byteLimit: uniqueLimits.workspaceBytes });
  const operation = ConditionalOperation.begin(parent, conditionalRun, uniqueLimits, workspace);
  for (const event of operation.rebuildPrefix()) if (event.kind === "rejected") throw Error(`unique-rebound-prefix:${event.code}`);
  return { operation, workspace, parent, count: merged.count, context: context(), accepted };
}
