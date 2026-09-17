import { expect, test } from "vitest";
import { canonicalProblem } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { AllDifferentRule } from "../../../src/solver/rules/all-different";
import { initialize, retainedProof } from "../../../src/solver/state/candidates";
import { verifyCertificate, ProofChecker } from "../../../src/solver/proof/checker";
import { PrimitiveRegistry } from "../../../src/solver/proof/primitives";
import { assertCertificateSound as assertSound } from "../../solver/acceptance";
import type { CheckContext, DeductionProposal, ProofNode, Proposition } from "../../../src/solver/proof/types";

const limits = { timeMs: 10000, workUnits: 100000, exactNodes: 100000, stepNodes: 4096,
  runNodes: 20000, proofBytes: 8000000, stepBytes: 2000000, batchBytes: 65536,
  inFlightBatches: 2, workspaceBytes: 16000000 };
function fixture(givens = [1,0], symbols = [1,2], scopes = [[0,1]]) {
  const result = assemble(canonicalProblem({ schema: 1, cells: givens.map((_,cell) => cell), symbols, givens,
    constraints: scopes.map((cells,index) => ({ id: `row:${index}`, type: "all-different@1", cells, parameters: {} })) }), [new AllDifferentRule()]);
  if (!result.ok) throw Error("fixture");
  const view = initialize(result.value, "primary");
  const context: CheckContext = { view, retained: retainedProof(view), limits, policy: "discharged", uniqueEvidenceId: null };
  const nodes: ProofNode[] = [], imports = new Set<number>();
  const add = (rule: string, premises: number[], conclusion: Proposition, scope: number[] = [], parameters = {}) => {
    premises.filter(id => context.retained.has(id)).forEach(id => imports.add(id));
    const id = context.retained.size + nodes.length;
    nodes.push({ id, rule, premises, conclusion, scope, parameters }); return id;
  };
  const proposal = (roots: number[]): DeductionProposal => ({ technique: "rule-propagation@1", state: view.state.key,
    effects: [], pattern: { kind: "roots" }, proof: { state: view.state.key, nodes, imports: [...imports], roots } });
  const check = (roots: number[]) => [...verifyCertificate(proposal(roots), context)].at(-1)!;
  return { add, check, nodes, context, proposal };
}
const lit = (cell: number, symbol: number, positive = true): Proposition => ({ kind: "literal", value: { cell, symbol, positive } });

test("a caller-supplied primitive registry cannot mint checked authority", () => {
  const b = fixture(), root = b.add("invented@1", [], lit(1, 2));
  class ForgedRegistry extends PrimitiveRegistry {
    override check(input: ProofNode) { return { conclusion: input.conclusion, openAssumptions: [], conditional: false, rules: [] }; }
  }
  const Constructor = ProofChecker as unknown as new (registry: PrimitiveRegistry) => ProofChecker;
  expect([...new Constructor(new ForgedRegistry()).checkProposal(b.proposal([root]), b.context)].at(-1)?.kind).toBe("rejected");
});

test("discharges only the contradicted assumption and derives row provenance", () => {
  const b = fixture();
  const a = b.add("assume@1", [], lit(1, 1));
  const weak = b.add("weak-link@1", [4], { kind: "clause", alternatives: [
    { cell: 0, symbol: 1, positive: false }, { cell: 1, symbol: 1, positive: false }] });
  const neg = b.add("resolution@1", [weak, 2], lit(1, 1, false));
  const contradiction = b.add("contradiction@1", [a, neg], { kind: "false" }, [a]);
  const root = b.add("discharge@1", [a, contradiction], lit(1, 1, false));
  expect(b.check([root])).toMatchObject({ kind: "verified", certificate: { consequences: [{ openAssumptions: [], conditional: false, rules: ["row:0"] }] } });
  b.nodes[0] = { ...b.nodes[0], conclusion: { ...lit(1,1), ignored: true } as unknown as Proposition };
  expect(b.check([root])).toMatchObject({ kind: "rejected", code: "invalid-assumption" });
});

test("cases requires every exhaustive alternative with its own branch", () => {
  const b = fixture();
  const clause = b.add("cover-clause@1", [1], { kind: "clause", alternatives: [
    { cell: 1, symbol: 1, positive: true }, { cell: 1, symbol: 2, positive: true }] });
  const a = b.add("assume@1", [], lit(1, 1));
  const first = b.add("conjunction@1", [2, a], { kind: "and", terms: [lit(0, 1), lit(1, 1)] }, [a]);
  const firstResult = b.add("conjunction@1", [first], lit(0, 1), [a], { index: 0 });
  const c = b.add("assume@1", [], lit(1, 2));
  const second = b.add("conjunction@1", [2, c], { kind: "and", terms: [lit(0, 1), lit(1, 2)] }, [c]);
  const secondResult = b.add("conjunction@1", [second], lit(0, 1), [c], { index: 0 });
  const root = b.add("cases@1", [clause, a, firstResult, c, secondResult], lit(0, 1));
  expect(b.check([root]).kind).toBe("verified");
  b.nodes[b.nodes.length - 1] = { ...b.nodes.at(-1)!, premises: [clause, a, firstResult] };
  expect(b.check([root]).kind).toBe("rejected");
});

test("rejects a sibling assumption even when its literal matches a desired conclusion", () => {
  const b = fixture(), a = b.add("assume@1", [], lit(1, 1)), sibling = b.add("assume@1", [], lit(1, 2));
  const root = b.add("conjunction@1", [a, sibling], { kind: "and", terms: [lit(1, 1), lit(1, 2)] }, [a]);
  expect(b.check([root]).kind).toBe("rejected");
});

test("support rebuilds every cell from checked domain facts, ignoring the view cache", () => {
  const b = fixture();
  const root = b.add("support@1", [5, 2, 1], { kind: "cover", symbol: 1, cells: [0, 1] });
  expect(b.check([root]).kind).toBe("verified");
  b.nodes[0] = { ...b.nodes[0], premises: [5, 2], conclusion: { kind: "cover", symbol: 1, cells: [0] } };
  expect(b.check([root]).kind).toBe("rejected");
});

test("Hall singleton removes its digit from the rest of its all-different scope", () => {
  const b = fixture(), root = b.add("hall@1", [4, 2], lit(1, 1, false));
  expect(b.check([root]).kind).toBe("verified");
  b.nodes[0] = { ...b.nodes[0], conclusion: lit(0, 1, false) };
  expect(b.check([root]).kind).toBe("rejected");
});

test("incidence counts account for a twice-weighted overlap instead of assuming disjoint covers", () => {
  const b = fixture();
  const cover = b.add("support@1", [5, 2, 1], { kind: "cover", symbol: 1, cells: [0, 1] });
  const root = b.add("cover-count@1", [cover, 4, 2, 1], { kind: "false" }, [],
    { symbol: 1, covers: [{ premise: cover, coefficient: 2 }], capacities: [{ premise: 4, coefficient: 1 }] });
  expect(b.check([root]).kind).toBe("rejected");
});

test("cover-count derives a supported elimination across overlapping scopes", () => {
  const b = fixture([0,0,2,0], [1,2,3], [[0,1,2],[0,1,3]]), view = b.context.view;
  const cover = [...view.facts.values()].find(f => f.proposition.kind === "cover" && f.proposition.symbol === 1 && f.rules[0] === "row:0")!;
  const capacity = [...view.facts.values()].find(f => f.proposition.kind === "all-different" && f.rules[0] === "row:1")!;
  const root = b.add("cover-count@1", [cover.root,capacity.root,...view.state.domainFacts], lit(3,1,false), [],
    { symbol: 1, covers: [{ premise: cover.root, coefficient: 1 }], capacities: [{ premise: capacity.root, coefficient: 1 }] });
  const domain = b.add("domain-restrict@1", [3,root], { kind: "domain", cell: 3, mask: 6 });
  const proposal = { ...b.proposal([root,domain]), effects: [{ kind: "remove", cell: 3, symbol: 1 } as const], pattern: { kind: "propagation" } };
  expect(assertSound(view, proposal).consequences[0].rules).toEqual(["row:0", "row:1"]);
  b.nodes[0] = { ...b.nodes[0], conclusion: { ...lit(3,1,false), invented: true } as unknown as Proposition };
  expect(b.check([root,domain])).toMatchObject({ kind: "rejected", code: "invalid-count-conclusion" });
});

test("nested discharge preserves the inherited assumption rather than manufacturing a closed fact", () => {
  const b = fixture(), a = b.add("assume@1", [], lit(1,1));
  const inner = b.add("assume@1", [], lit(0,1,false), [a]);
  const contradiction = b.add("contradiction@1", [inner,2], { kind: "false" }, [a,inner]);
  const root = b.add("discharge@1", [inner,contradiction], lit(0,1), [a]);
  expect(b.check([root])).toMatchObject({ kind: "rejected", code: "open-proof-root" });
});

test.each(["forward", "unsupported", "uniqueness", "false-strong-link"])("rejects malformed graph mutation: %s", mutation => {
  const b = fixture();
  let root: number;
  if (mutation === "forward") root = b.add("conjunction@1", [999], { kind: "and", terms: [lit(0,1)] });
  else if (mutation === "unsupported") root = b.add("solution-axiom@1", [], lit(1,2));
  else if (mutation === "uniqueness") root = b.add("unique-transform@1", [], lit(1,2), [], { evidenceId: "invented" });
  else root = b.add("cover-clause@1", [4], { kind: "clause", alternatives: [
    { cell: 0, symbol: 1, positive: true }, { cell: 1, symbol: 1, positive: true }] });
  expect(b.check([root]).kind).toBe("rejected");
});

test("same-cell weak exclusion is independent of an all-different house", () => {
  const b = fixture(), root = b.add("weak-link@1", [1], { kind: "clause", alternatives: [
    { cell: 1, symbol: 1, positive: false }, { cell: 1, symbol: 2, positive: false }] });
  expect(b.check([root]).kind).toBe("verified");
});

test.each(["wrapped-symbol", "extra-fields"])("Hall rejects a malformed literal: %s", mutation => {
  const b = fixture();
  const conclusion = mutation === "wrapped-symbol" ? lit(1,33,false) : { ...lit(1,1,false), invented: true } as unknown as Proposition;
  const root = b.add("hall@1", [4,2], conclusion);
  expect(b.check([root]).kind).toBe("rejected");
});
