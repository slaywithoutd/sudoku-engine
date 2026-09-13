import { describe, expect, test } from "vitest";
import { deriveQuality, mergeEvidence, type CountEvidence, type EvidenceContext, type QualityContext } from "../../../src/solver/evidence";
import { exactSteps, EXACT_METHOD } from "../../../src/solver/exact";
import { canonicalProblem } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { AllDifferentRule } from "../../../src/solver/rules/all-different";
import { makeSnapshot, type RunKey } from "../../../src/solver/snapshot";
import { initialize, commitChecked, retainCheckedFacts, retainedProof, isAcceptedPath } from "../../../src/solver/state/candidates";
import { rebuildIndexes } from "../../../src/solver/state/indexes";
import { checkProposal, verifyCertificate } from "../../../src/solver/proof/checker";
import type { CheckedStep, DeductionProposal, ProofNode } from "../../../src/solver/proof/types";
import type { ReadView } from "../../../src/solver/state/types";

const unknown: CountEvidence = { kind: "unknown", lowerBound: 0, witnesses: [] };
const limits = { timeMs: 10000, workUnits: 100000, exactNodes: 10000, stepNodes: 1000, runNodes: 10000,
  proofBytes: 1000000, stepBytes: 1000000, batchBytes: 65536, inFlightBatches: 2, workspaceBytes: 10000000 };
function fixture(givens = [1, 0]) {
  const problem = canonicalProblem({ schema: 1, cells: [0, 1], symbols: [1, 2], givens,
    constraints: [{ id: "a", type: "all-different@1", cells: [0, 1], parameters: {} }] });
  const result = assemble(problem, [new AllDifferentRule()]);
  if (!result.ok) throw new Error("assembly failed");
  const snapshot = makeSnapshot(problem, { kind: "manual" }, "snapshot", 0);
  const run: RunKey = { requestId: "request", snapshotId: snapshot.snapshotId, inputRevision: 0, problemKey: problem.key,
    operation: "primary", mode: "explain", engine: "engine@1", profile: "profile@1", scheduler: "scheduler@1", checker: "checker@1",
    exact: EXACT_METHOD, optionsKey: "options", parentEvidenceId: null };
  const initialView = initialize(result.value, "primary");
  const context: EvidenceContext = { snapshot, run, assembly: result.value, initialView, acceptedView: initialView,
    accepted: [], human: "not-started", activeExactRun: run, phase: "exact" };
  return context;
}
function exhaustion(context: EvidenceContext, witness: readonly number[] | null = [1, 2]): CountEvidence {
  const proof = { kind: "root-exhausted" as const, key: context.run, method: EXACT_METHOD,
    stats: { nodes: 1, backtracks: 0, maxDepth: 0 }, frontierEmpty: true as const };
  return witness ? { kind: "unique", witness, evidenceId: "evidence", proof, rootExhausted: true }
    : { kind: "zero", proof, evidenceId: "evidence" };
}
function checked(view: ReadView, nodes: ProofNode[], imports: number[], roots: number[], effects: DeductionProposal["effects"]): CheckedStep {
  const single = effects.some(e => e.kind === "place") || effects.length === 0;
  const proposal: DeductionProposal = { technique: single ? "c01@1" : "rule-propagation@1", state: view.state.key,
    pattern: single ? { kind: "single", alias: "Naked Single", house: null, cell: 1, symbol: 2 } : { kind: "propagation" }, effects,
    proof: { state: view.state.key, nodes, imports, roots } };
  const result = [...checkProposal(proposal, { view, retained: retainedProof(view), policy: "unconditional", uniqueEvidenceId: null, limits })].at(-1)!;
  if (result.kind !== "checked") throw new Error(JSON.stringify(result));
  return result.step;
}
function solved() {
  const context = fixture(), initial = context.initialView;
  let id = Math.max(...retainedProof(initial).keys()) + 1;
  const house = [...initial.facts.values()].find(f => f.proposition.kind === "all-different")!.id;
  const nodes: ProofNode[] = [
    { id: id++, rule: "weak-link@1", premises: [house], parameters: {}, scope: [], conclusion: { kind: "clause", alternatives: [
      { cell: 0, symbol: 1, positive: false }, { cell: 1, symbol: 1, positive: false }] } },
    { id: id++, rule: "resolution@1", premises: [id - 2, initial.state.domainFacts[0]], parameters: {}, scope: [],
      conclusion: { kind: "literal", value: { cell: 1, symbol: 1, positive: false } } },
    { id: id++, rule: "domain-restrict@1", premises: [1, id - 2], parameters: {}, scope: [], conclusion: { kind: "domain", cell: 1, mask: 2 } },
  ];
  const removal = checked(initial, nodes, [house, initial.state.domainFacts[0], 1], [nodes[1].id, nodes[2].id], [{ kind: "remove", cell: 1, symbol: 1 }]);
  const reduced = commitChecked(initial, removal).view;
  const cache = checked(reduced, [{ id: id++, rule: "cover-clause@1", premises: [reduced.state.domainFacts[1]], parameters: {}, scope: [],
    conclusion: { kind: "literal", value: { cell: 1, symbol: 2, positive: true } } }], [reduced.state.domainFacts[1]], [id - 1], []);
  const cached = retainCheckedFacts(reduced, cache);
  const placement = checked(cached, [], [id - 1, cached.state.domainFacts[1]], [id - 1, cached.state.domainFacts[1]], [{ kind: "place", cell: 1, symbol: 2 }]);
  return { ...context, human: "solved" as const, accepted: [removal, cache, placement], acceptedView: commitChecked(cached, placement).view };
}

describe("accepted-path authority and quality", () => {
  test("primitive certificates never supply accepted logical-path quality", () => {
    const c=solved(), view=c.initialView;
    const proposal:DeductionProposal={technique:"unregistered@1",state:view.state.key,pattern:{kind:"roots"},effects:[],
      proof:{state:view.state.key,nodes:[],imports:[0],roots:[0]}};
    const result=[...verifyCertificate(proposal,{view,retained:retainedProof(view),policy:"unconditional",uniqueEvidenceId:null,limits})].at(-1);
    expect(result?.kind).toBe("verified"); if(result?.kind!=="verified")return;
    const count=mergeEvidence(unknown,exhaustion(c),c).count;
    expect(deriveQuality(c.snapshot,"solved",[result.certificate as never],count,false,c)).toBe("inconsistent");
  });
  test("authenticates exact committed prefix including unchanged-revision cache and cold indexes", () => {
    const c = solved();
    expect(isAcceptedPath(c.initialView, c.acceptedView, c.accepted)).toBe(true);
    expect(isAcceptedPath(c.initialView, rebuildIndexes(c.acceptedView), c.accepted)).toBe(true);
    expect(isAcceptedPath(c.initialView, c.acceptedView, [c.accepted[0], c.accepted[2]])).toBe(false);
    expect(isAcceptedPath(initialize(c.assembly, "primary"), c.acceptedView, c.accepted)).toBe(false);
    expect(isAcceptedPath(c.initialView, c.initialView, c.accepted)).toBe(false);
  });
  test("requires accepted unconditional completion plus authenticated independent uniqueness", () => {
    const c = solved(), raw = exhaustion(c);
    expect(deriveQuality(c.snapshot, "solved", c.accepted, raw, false, c)).toBe("not-established");
    const merged = mergeEvidence(unknown, raw, c);
    expect(merged.diagnostics).toEqual([]);
    expect(deriveQuality(c.snapshot, "solved", c.accepted, merged.count, false, c)).toBe("perfect-verified");
    expect(deriveQuality(c.snapshot, "solved", c.accepted, merged.count, true, c)).toBe("not-established");
    expect(deriveQuality(c.snapshot, "solved", [], merged.count, false, c)).toBe("inconsistent");
  });
  test("never grants Perfect to a conditional operation containing only unconditional steps", () => {
    const c = solved(), count = mergeEvidence(unknown, exhaustion(c), c).count;
    const conditional = { ...c, run: { ...c.run, operation: "conditional" as const, parentEvidenceId: "evidence" } };
    expect(deriveQuality(c.snapshot, "solved", c.accepted, count, false, conditional)).toBe("not-established");
    expect(deriveQuality(c.snapshot, "solved", c.accepted, count, false, undefined as unknown as QualityContext)).toBe("not-established");
  });
  test("fully valid original input is not-applicable", () => {
    const c = fixture([1, 2]);
    expect(deriveQuality(c.snapshot, "solved", [], unknown, false, c)).toBe("not-applicable");
  });
  test("rejects replacement complete-rule semantics even when the problem key matches", () => {
    const c = solved(), count = mergeEvidence(unknown, exhaustion(c), c).count;
    const replacement = { ...c, assembly: { ...c.assembly, modules: new Map([["a", new AllDifferentRule()]]) } };
    expect(deriveQuality(c.snapshot, "solved", c.accepted, count, false, replacement)).toBe("not-established");
  });
  test("rejects missing original complete-rule semantics", () => {
    const c = solved(), count = mergeEvidence(unknown, exhaustion(c), c).count;
    expect(deriveQuality(c.snapshot, "solved", c.accepted, count, false, { ...c,
      assembly: { ...c.assembly, modules: new Map() } })).toBe("not-established");
  });
});

describe("monotone independently checked count evidence", () => {
  test("one witness and a closed generator remain unknown; two prove at least two", () => {
    const c = fixture([0, 0]); let count: CountEvidence = unknown;
    const iterator = exactSteps(c.snapshot.problem, c.assembly);
    for (const event of iterator) if (event.kind === "witness") {
      count = mergeEvidence(count, { kind: "unknown", witnesses: [event.values], lowerBound: 1 }, c).count; break;
    }
    expect(count).toMatchObject({ kind: "unknown", lowerBound: 1 });
    const merged = mergeEvidence(count, { kind: "unknown", lowerBound: 1, witnesses: [[2, 1]] }, c);
    expect(merged.count).toMatchObject({ kind: "multiple", lowerBound: 2, witnesses: [[1, 2], [2, 1]] });
    expect(mergeEvidence(merged.count, unknown, c).count).toEqual(merged.count);
  });
  test.each(["request", "snapshot", "revision", "options", "method", "stats", "conditional", "inactive", "phase"])("rejects %s exhaustion while preserving its valid witness", mutation => {
    const c = fixture(), incoming = structuredClone(exhaustion(c));
    if (incoming.kind !== "unique") throw new Error("fixture");
    const proof = incoming.proof;
    if (mutation === "request") proof.key.requestId = "stale";
    if (mutation === "snapshot") proof.key.snapshotId = "stale";
    if (mutation === "revision") proof.key.inputRevision++;
    if (mutation === "options") proof.key.optionsKey = "different";
    if (mutation === "method") (proof as { method: string }).method = "other@1";
    if (mutation === "stats") (proof.stats as { nodes: number }).nodes = Infinity;
    if (mutation === "conditional") proof.key.operation = "conditional";
    const context = mutation === "inactive" ? { ...c, activeExactRun: null } : mutation === "phase" ? { ...c, phase: "human" as const } : c;
    const result = mergeEvidence(unknown, incoming, context);
    expect(result.count).toMatchObject({ kind: "unknown", lowerBound: 1, witnesses: [[1, 2]] });
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
  test("retains accepted exhaustion after terminalization without authorizing fresh exhaustion", () => {
    const c = fixture(), count = mergeEvidence(unknown, exhaustion(c), c).count;
    expect(count.kind).toBe("unique");
    const terminal = { ...c, activeExactRun: null, phase: "terminal" as const };
    expect(mergeEvidence(count, unknown, terminal).count).toEqual(count);
    expect(mergeEvidence(unknown, structuredClone(count), terminal).count.kind).toBe("unknown");
  });
  test("duplicate-givens zero is checked directly against the original declared rule", () => {
    const c = fixture([1, 1]);
    const incoming: CountEvidence = { kind: "zero", evidenceId: "duplicate", proof: { kind: "duplicate-givens", constraintId: "a", symbol: 1, cells: [0, 1] } };
    expect(mergeEvidence(unknown, incoming, { ...c, phase: "human", activeExactRun: null }).count.kind).toBe("zero");
    expect(mergeEvidence(unknown, incoming, fixture()).count.kind).toBe("unknown");
  });
  test("a second valid witness discards incompatible uniqueness and invalidates a conflicting path", () => {
    const c = fixture([0, 0]);
    const first = mergeEvidence(unknown, exhaustion(c, [1, 2]), c).count;
    const result = mergeEvidence(first, { kind: "unknown", witnesses: [[2, 1]], lowerBound: 1 }, c);
    expect(result.count.kind).toBe("multiple");
    expect(result.diagnostics).toContain("incompatible-exhaustion");
    const forged = { ...c.acceptedView, state: { ...c.acceptedView.state, values: [1, 2], domains: [1, 2] } };
    const conflicting = mergeEvidence(first, result.count, { ...c, acceptedView: forged, human: "solved" });
    expect(conflicting.count.kind).toBe("multiple");
    expect(conflicting.human).toBe("invalidated");
  });
  test("rejects forged completion and preserves witnesses from malformed exhaustion", () => {
    const c = fixture();
    const malformed = { kind: "unique", witness: [1, 2], evidenceId: "x", rootExhausted: true, proof: null } as unknown as CountEvidence;
    expect(mergeEvidence(unknown, malformed, c).count).toMatchObject({ kind: "unknown", lowerBound: 1 });
    expect(mergeEvidence(unknown, { kind: "multiple", witnesses: [[1, 2], [1, 2]], lowerBound: 2 }, c).count.kind).toBe("unknown");
  });
  test("rejects unknown proof fields and invalid statistics without losing existence", () => {
    const c = fixture();
    for (const change of [{ extra: true }, { frontierEmpty: false }, { stats: { nodes: -1, backtracks: 0, maxDepth: 0 } },
      { stats: { nodes: 1, backtracks: 2, maxDepth: 0 } }, { stats: { nodes: 1, backtracks: 0, maxDepth: 1 } }]) {
      const claim = exhaustion(c);
      const mutated = { ...claim, proof: { ...(claim as Extract<CountEvidence, { kind: "unique" }>).proof, ...change } } as CountEvidence;
      expect(mergeEvidence(unknown, mutated, c).count).toMatchObject({ kind: "unknown", lowerBound: 1 });
    }
  });
  test("empty exhaustive search authorizes zero; witness contradiction discards that claim", () => {
    const c = fixture();
    const zero = mergeEvidence(unknown, exhaustion(c, null), c).count;
    expect(zero.kind).toBe("zero");
    const result = mergeEvidence(zero, { kind: "unknown", lowerBound: 1, witnesses: [[1, 2]] }, c);
    expect(result.count).toMatchObject({ kind: "unknown", lowerBound: 1 });
    expect(result.diagnostics).toContain("incompatible-exhaustion");
  });
  test("an authentic complete logical board supplies existence despite a conflicting zero claim", () => {
    const c = solved();
    const result = mergeEvidence(unknown, exhaustion(c, null), c);
    expect(result.count).toMatchObject({ kind: "unknown", lowerBound: 1, witnesses: [[1, 2]] });
    expect(result.diagnostics).toContain("incompatible-exhaustion");
    expect(mergeEvidence(unknown, unknown, c).count).toMatchObject({ kind: "unknown", lowerBound: 1 });
  });
  test("independently valid existence invalidates a claimed human contradiction", () => {
    const c = fixture();
    const result = mergeEvidence(unknown, { kind: "unknown", witnesses: [[1, 2]], lowerBound: 1 }, { ...c, human: "contradiction" });
    expect(result.human).toBe("invalidated");
    expect(result.count).toMatchObject({ kind: "unknown", lowerBound: 1 });
    expect(result.diagnostics).toContain("incompatible-human-path");
  });
});
