import { describe, expect, test } from "vitest";
import { canonicalProblem, normalizeClassic } from "../../../src/solver/problem";
import { AllDifferentRule } from "../../../src/solver/rules/all-different";
import { assemble } from "../../../src/solver/rules/assemble";
import { createRoots, rootNode } from "../../../src/solver/state/facts";
import { verifyCertificate, isCheckedCertificate, checkProposal } from "../../../src/solver/proof/checker";
import { primitiveRegistry } from "../../../src/solver/proof/primitives";
import type { CheckContext, DeductionProposal, ProofNode } from "../../../src/solver/proof/types";

function fixture() {
  const problem = normalizeClassic({ kind: "classic", version: 1, width: 9, height: 9,
    givens: [5, ...Array<number>(80).fill(0)] });
  const result = assemble(problem, [new AllDifferentRule()]);
  if (!result.ok) throw new Error("fixture assembly failed");
  const assembly = result.value;
  const facts = createRoots(assembly);
  const state = { key: { problemKey: problem.key, branch: "primary", revision: 0 },
    values: problem.givens, domains: Array<number>(81).fill(511),
    domainFacts: Array.from({ length: 81 }, (_, i) => i) };
  const context: CheckContext = { view: { assembly, facts, state, supports: () => [] },
    retained: new Map([...facts.values()].map(fact => [fact.root, rootNode(fact)])),
    policy: "unconditional", uniqueEvidenceId: null,
    limits: { timeMs: 10000, workUnits: 10000, exactNodes: 10000, stepNodes: 1000,
      runNodes: 10000, proofBytes: 1000000, stepBytes: 1000000, batchBytes: 65536,
      inFlightBatches: 2, workspaceBytes: 10000000 } };
  const node: ProofNode = { id: facts.size, rule: "given@1", premises: [], parameters: {},
    conclusion: { kind: "literal", value: { cell: 0, symbol: 5, positive: true } }, scope: [] };
  const proposal: DeductionProposal = { technique: "rule-propagation@1", state: state.key,
    effects: [], pattern: { kind: "roots" }, proof: { state: state.key, nodes: [node], imports: [], roots: [node.id] } };
  return { problem, assembly, facts, context, node, proposal };
}
function terminal(proposal: DeductionProposal, context: CheckContext) {
  const events = [...verifyCertificate(proposal, context)];
  expect(events.filter(event => event.kind !== "work")).toHaveLength(1);
  return events.at(-1)!;
}

function smallAssembly(cellCount: number, symbolCount: number, ruleCount = 0) {
  const problem = canonicalProblem({
    schema: 1,
    cells: Array.from({ length: cellCount }, (_, index) => index),
    symbols: Array.from({ length: symbolCount }, (_, index) => index + 1),
    givens: Array<number>(cellCount).fill(0),
    constraints: Array.from({ length: ruleCount }, (_, index) => ({
      id: `rule:${index}`, type: "all-different@1", cells: [0, 1], parameters: {},
    })),
  });
  const result = assemble(problem, [new AllDifferentRule()]);
  if (!result.ok) throw new Error("small fixture assembly failed");
  return result.value;
}

describe("original proof authority", () => {
  test.each([[1, 10, 0], [82, 9, 0], [2, 2, 257]])("bounds original root allocation for %i cells, %i symbols and %i rules", (cells, symbols, rules) => {
    expect(() => createRoots(smallAssembly(cells, symbols, rules))).toThrow();
  });
  test.each([[1, 10, 0], [82, 9, 0], [2, 2, 257]])("applies matching primitive bounds for %i cells, %i symbols and %i rules", (cells, symbols, rules) => {
    const { context } = fixture();
    const assembly = smallAssembly(cells, symbols, rules);
    expect(() => primitiveRegistry.check({ rule: "domain-axiom@1", premises: [], parameters: {},
      conclusion: { kind: "domain", cell: 0, mask: 2 ** symbols - 1 } },
    { ...context, view: { ...context.view, assembly } })).toThrow();
  });
  test("retains smaller nine-bit mock problems", () => {
    const roots = createRoots(smallAssembly(6, 3));
    expect(roots.size).toBe(6);
    expect(roots.get(5)?.proposition).toEqual({ kind: "domain", cell: 5, mask: 7 });
  });
  test.each(["allDifferent", "covers"] as const)("bounds %s before canonical problem traversal", kind => {
    const { assembly } = fixture();
    const oversized = { ...assembly, [kind]: Array(kind === "covers" ? 2305 : 257),
      problem: { ...assembly.problem, key: "forged-key-must-not-be-traversed-first" } };
    expect(() => createRoots(oversized)).toThrow("root-capability-limit");
  });
  test.each(["sparse-scope", "nested-parameters"])("preflights malformed %s before canonical traversal", kind => {
    const { assembly } = fixture();
    const changedRule = { ...assembly.problem.constraints[0],
      ...(kind === "sparse-scope" ? { cells: Array<number>(2) } : { parameters: { nested: { payload: true } } }),
    };
    const changed = { ...assembly, problem: { ...assembly.problem,
      constraints: [changedRule, ...assembly.problem.constraints.slice(1)], key: "forged-key-must-not-be-traversed-first" } };
    expect(() => createRoots(changed)).toThrow(kind === "sparse-scope" ? "invalid-root-array" : "invalid-root-parameters");
  });
  test("rejects accessor rule parameters without evaluating unbounded external code", () => {
    const { assembly } = fixture();
    let reads = 0;
    const changedRule = { ...assembly.problem.constraints[0] };
    Object.defineProperty(changedRule, "parameters", { enumerable: true, get: () => { reads++; return {}; } });
    expect(() => createRoots({ ...assembly, problem: { ...assembly.problem,
      constraints: [changedRule, ...assembly.problem.constraints.slice(1)] } })).toThrow();
    expect(reads).toBe(0);
  });
  test("binds original capability dependencies to their factory prefix too", () => {
    const { assembly, context, proposal } = fixture();
    const separate = createRoots(assembly);
    const retained = new Map(context.retained);
    retained.set(82, rootNode(separate.get(82)!));
    const result = terminal({ ...proposal, proof: { ...proposal.proof, nodes: [], imports: [109], roots: [109] } },
      { ...context, retained });
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") expect(result.code).toBe("substituted-retained-dependency");
  });
  test.each(["ascending", "descending", "dependent-first"])("binds retained dependencies to the proved objects with %s map order", order => {
    const { context, proposal, node } = fixture();
    const rule: ProofNode = { ...node, rule: "rule-instance@1", conclusion: { kind: "rule", constraintId: "box:0" } };
    const scope: ProofNode = { ...node, id: node.id + 1, rule: "all-different@1", premises: [rule.id],
      parameters: { constraintId: "box:0" }, conclusion: { kind: "all-different", cells: [0, 1, 2, 9, 10, 11, 18, 19, 20] } };
    const original = terminal({ ...proposal, proof: { ...proposal.proof, nodes: [rule, scope], roots: [scope.id] } }, context);
    const alternative = terminal(proposal, context);
    expect(original.kind).toBe("verified");
    expect(alternative.kind).toBe("verified");
    if (original.kind !== "verified" || alternative.kind !== "verified") return;
    const [provedRule, provedScope] = original.certificate.proposal.proof.nodes;
    const provedGiven = alternative.certificate.proposal.proof.nodes[0];
    const retained = (dependency: ProofNode) => {
      const entries: [number, ProofNode][] = [...context.retained, [provedRule.id, dependency], [provedScope.id, provedScope]];
      if (order === "descending") entries.reverse();
      if (order === "dependent-first") entries.unshift(entries.pop()!);
      return new Map(entries);
    };
    const imported = { ...proposal, proof: { ...proposal.proof, nodes: [], imports: [provedScope.id], roots: [provedScope.id] } };
    expect(terminal(imported, { ...context, retained: retained(provedRule) }).kind).toBe("verified");
    expect(terminal(imported, { ...context, retained: retained(provedGiven) })).toEqual({
      kind: "rejected", code: "substituted-retained-dependency",
    });
  });
  test("materializes full original domains, exact clues and capability dependencies in canonical order", () => {
    const { facts } = fixture();
    expect(facts.get(0)?.proposition).toEqual({ kind: "domain", cell: 0, mask: 511 });
    expect(facts.get(81)?.proposition).toEqual({ kind: "literal", value: { cell: 0, symbol: 5, positive: true } });
    expect(facts.get(82)?.proposition).toEqual({ kind: "rule", constraintId: "box:0" });
    expect([...facts.values()].filter(f => f.proposition.kind === "cover")).toHaveLength(243);
    expect((facts as unknown as { set?: unknown }).set).toBeUndefined();
    expect(Object.isFrozen(facts.get(0)?.proposition)).toBe(true);
  });
  test.each([
    ["fabricated clue", { kind: "literal", value: { cell: 0, symbol: 4, positive: true } }, "given@1"],
    ["narrowed original domain", { kind: "domain", cell: 2, mask: 1 }, "domain-axiom@1"],
    ["unknown primitive", { kind: "domain", cell: 2, mask: 511 }, "domain-axiom@2"],
  ])("rejects %s", (_, conclusion, rule) => {
    const { proposal, context, node } = fixture();
    expect(terminal({ ...proposal, proof: { ...proposal.proof, nodes: [{ ...node, conclusion, rule } as ProofNode] } }, context).kind).toBe("rejected");
  });
  test("authenticates copied immutable checked values without authenticating lookalikes", () => {
    const { proposal, context } = fixture();
    const event = terminal(proposal, context);
    expect(event.kind).toBe("verified");
    if (event.kind !== "verified") return;
    expect(isCheckedCertificate(event.certificate)).toBe(true);
    expect(isCheckedCertificate({ ...event.certificate })).toBe(false);
    expect(isCheckedCertificate(JSON.parse(JSON.stringify(event.certificate)))).toBe(false);
    (proposal.effects as unknown[]).push({ kind: "place", cell: 1, symbol: 9 });
    expect(event.certificate.proposal.effects).toEqual([]);
    expect(Object.isFrozen(event.certificate.proposal.proof.nodes[0].conclusion)).toBe(true);
    expect("afterRevision" in event.certificate).toBe(false);
  });
  test("reconstructs declared cover semantics and derives rule provenance from the rule premise", () => {
    const { context, proposal, node } = fixture();
    const cover: ProofNode = { ...node, rule: "cover@1", premises: [82],
      parameters: { constraintId: "box:0" },
      conclusion: { kind: "cover", symbol: 5, cells: [0, 1, 2, 9, 10, 11, 18, 19, 20] } };
    const good = { ...proposal, proof: { ...proposal.proof, nodes: [cover], imports: [82] } };
    const result = terminal(good, context);
    expect(result.kind).toBe("verified");
    if (result.kind === "verified") {
      expect(result.certificate.consequences[0].rules).toEqual(["box:0"]);
      expect(result.certificate.consequences[0].openAssumptions).toEqual([]);
      expect(result.certificate.consequences[0].conditional).toBe(false);
    }
    const altered: ProofNode = { ...cover, conclusion: { kind: "cover", symbol: 5, cells: [0] } };
    expect(terminal({ ...good, proof: { ...good.proof, nodes: [altered] } }, context).kind).toBe("rejected");
  });
  test("checks original domains even when candidate state claims a narrower mask", () => {
    const { context, proposal, node } = fixture();
    const domain: ProofNode = { ...node, rule: "domain-axiom@1", conclusion: { kind: "domain", cell: 2, mask: 511 } };
    const changed = { ...context, view: { ...context.view, state: { ...context.view.state, domains: Array<number>(81).fill(1) } } };
    expect(terminal({ ...proposal, proof: { ...proposal.proof, nodes: [domain] } }, changed).kind).toBe("verified");
  });
  test("rejects authentic root imports from a sibling branch", () => {
    const { context, proposal, assembly } = fixture();
    const sibling = createRoots(assembly, "sibling");
    const retained = new Map([...sibling.values()].map(fact => [fact.root, rootNode(fact)]));
    expect(terminal(proposal, { ...context, retained }).kind).toBe("rejected");
  });
  test.each(["arity", "bytes", "sparse", "accessor"])("rejects malformed or oversized node %s before acceptance", kind => {
    const { context, proposal, node } = fixture();
    let altered = node;
    if (kind === "arity") altered = { ...node, premises: Array.from({ length: 65 }, (_, i) => i) };
    if (kind === "bytes") altered = { ...node, parameters: { data: "x".repeat(16 * 1024) } };
    if (kind === "sparse") altered = { ...node, premises: Array<number>(1) };
    if (kind === "accessor") {
      altered = { ...node };
      Object.defineProperty(altered, "parameters", { get: () => { throw new Error("must not execute"); }, enumerable: true });
    }
    expect(terminal({ ...proposal, proof: { ...proposal.proof, nodes: [altered] } }, context).kind).toBe("rejected");
  });
  test("rejects capability scope forgery even when capability metadata is internally consistent", () => {
    const { assembly } = fixture();
    const altered = { ...assembly, covers: assembly.covers.map((cover, index) => index ? cover : { ...cover, cells: [0] }) };
    expect(() => createRoots(altered)).toThrow();
  });
  test("allocates capability facts canonically even when input capability iteration order changes", () => {
    const { assembly, facts } = fixture();
    const reordered = createRoots({ ...assembly, allDifferent: [...assembly.allDifferent].reverse(), covers: [...assembly.covers].reverse() });
    expect(reordered.size).toBe(facts.size);
    for (const [id, fact] of facts) expect(rootNode(reordered.get(id)!)).toEqual(rootNode(fact));
  });
  test("rejects duplicated capability identities", () => {
    const { assembly } = fixture();
    expect(() => createRoots({ ...assembly, covers: [...assembly.covers, assembly.covers[0]] })).toThrow();
  });
  test.each(["forward", "cycle", "missing", "duplicate", "dangling-root", "unlisted-import", "forged-import", "sibling-scope", "unknown-technique", "effect", "parameters", "stale"])("rejects %s at the DAG boundary", (kind) => {
    const { proposal, context, node } = fixture();
    let changed = proposal;
    let ctx = context;
    if (kind === "forward" || kind === "cycle" || kind === "missing")
      changed = { ...proposal, proof: { ...proposal.proof, nodes: [{ ...node, premises: [kind === "cycle" ? node.id : node.id + 1] }] } };
    if (kind === "duplicate") changed = { ...proposal, proof: { ...proposal.proof, nodes: [node, node] } };
    if (kind === "dangling-root") changed = { ...proposal, proof: { ...proposal.proof, roots: [99999] } };
    if (kind === "unlisted-import") changed = { ...proposal, proof: { ...proposal.proof, nodes: [{ ...node, premises: [81] }] } };
    if (kind === "forged-import") {
      ctx = { ...context, retained: new Map([[81, { ...node, id: 81 }]]) };
      changed = { ...proposal, proof: { ...proposal.proof, nodes: [], roots: [81], imports: [81] } };
    }
    if (kind === "sibling-scope") changed = { ...proposal, proof: { ...proposal.proof, nodes: [{ ...node, scope: [81] }] } };
    if (kind === "unknown-technique") changed = { ...proposal, technique: "magic-solve@1" };
    if (kind === "effect") changed = { ...proposal, effects: [{ kind: "place", cell: 0, symbol: 5 }] };
    if (kind === "parameters") changed = { ...proposal, proof: { ...proposal.proof, nodes: [{ ...node, parameters: { solution: [5] } }] } };
    if (kind === "stale") changed = { ...proposal, state: { ...proposal.state, revision: 1 } };
    expect(kind === "unknown-technique" ? [...checkProposal(changed, ctx)].at(-1)?.kind : terminal(changed, ctx).kind).toBe("rejected");
  });
  test.each(["stepNodes", "runNodes", "stepBytes", "proofBytes", "workUnits"] as const)("charges %s including retained initialization", limit => {
    const { context, proposal } = fixture();
    expect(terminal(proposal, { ...context, limits: { ...context.limits, [limit]: limit === "stepNodes" ? 0 : 1 } }).kind).toBe("rejected");
  });
  test("checks imported original facts and emits bounded work events", () => {
    const { context, proposal } = fixture();
    const events = [...verifyCertificate({ ...proposal, proof: { ...proposal.proof, nodes: [], imports: [81], roots: [81] } }, context)];
    expect(events.at(-1)?.kind).toBe("verified");
    expect(events.some(event => event.kind === "work" && event.units > 0)).toBe(true);
    const result = events.at(-1)!;
    if (result.kind === "verified") expect(Object.isFrozen(result.certificate.consequences[0])).toBe(true);
  });
  test("cannot evade root allocation and initialization budgets by omitting the retained original roots", () => {
    const { context, proposal } = fixture();
    expect(terminal(proposal, { ...context, retained: new Map() }).kind).toBe("rejected");
  });
  test("yields after each bounded node before traversing the next node payload", () => {
    const { context, proposal, node } = fixture();
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const next = { ...node, id: node.id + 1, parameters: cycle } as ProofNode;
    const events = [...verifyCertificate({ ...proposal, proof: { ...proposal.proof,
      nodes: [node, next], roots: [node.id, next.id] } }, context)];
    expect(events.at(-1)?.kind).toBe("rejected");
    expect(events.filter(event => event.kind === "work").length).toBeGreaterThan(context.retained.size);
  });
  test("charges UTF-8 bytes of object keys against the individual node cap", () => {
    const { context, proposal, node } = fixture();
    const oversized: ProofNode = { ...node, parameters: { ["😀".repeat(4100)]: true } };
    expect(terminal({ ...proposal, proof: { ...proposal.proof, nodes: [oversized] } }, context)).toEqual({ kind: "rejected", code: "proof-byte-limit" });
  });
});
