import { describe, expect, test } from "vitest";
import { canonicalProblem } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { AllDifferentRule } from "../../../src/solver/rules/all-different";
import { initialize, commitChecked, retainedProof, diagnose } from "../../../src/solver/state/candidates";
import { rebuildIndexes } from "../../../src/solver/state/indexes";
import { checkProposal } from "../../../src/solver/proof/checker";
import type { CheckContext, CheckedStep, DeductionProposal, Effect, ProofNode, Proposition } from "../../../src/solver/proof/types";
import type { ReadView } from "../../../src/solver/state/types";

const limits = { timeMs: 10000, workUnits: 10000, exactNodes: 10000, stepNodes: 1000,
  runNodes: 10000, proofBytes: 1000000, stepBytes: 1000000, batchBytes: 65536,
  inFlightBatches: 2, workspaceBytes: 10000000 };
function fixture(givens = [1, 0, 0, 0]) {
  const result = assemble(canonicalProblem({ schema: 1, cells: [0, 1, 2, 3], symbols: [1, 2], givens,
    constraints: [{ id: "a", type: "all-different@1", cells: [0, 1], parameters: {} },
      { id: "b", type: "all-different@1", cells: [1, 2], parameters: {} }] }), [new AllDifferentRule()]);
  if (!result.ok) throw new Error("invalid fixture");
  return initialize(result.value, "primary");
}
function context(view: ReadView): CheckContext {
  return { view, retained: retainedProof(view), policy: "unconditional", uniqueEvidenceId: null, limits };
}
function builder(view: ReadView) {
  const nodes: ProofNode[] = [], roots: number[] = [], imports = new Set<number>();
  let id = Math.max(...retainedProof(view).keys()) + 1;
  const add = (rule: string, premises: number[], conclusion: Proposition) => {
    for (const premise of premises) if (retainedProof(view).has(premise)) imports.add(premise);
    const node = { id: id++, rule, premises, conclusion, parameters: {}, scope: [] };
    nodes.push(node); return node.id;
  };
  const literal = (cell: number, symbol: number, positive: boolean): Proposition => ({ kind: "literal", value: { cell, symbol, positive } });
  const remove = (source: number, sourceCell: number, cell: number, symbol: number, scope: number[]) => {
    const rule = [...view.facts.values()].find(f => f.proposition.kind === "all-different" && JSON.stringify(f.proposition.cells) === JSON.stringify(scope))!;
    const weak = add("weak-link@1", [rule.root], { kind: "clause", alternatives: [
      { cell: sourceCell, symbol, positive: false }, { cell, symbol, positive: false }].sort((a, b) => a.cell - b.cell) });
    const negative = add("resolution@1", [weak, source], literal(cell, symbol, false)); roots.push(negative);
    roots.push(add("domain-restrict@1", [view.state.domainFacts[cell], negative],
      { kind: "domain", cell, mask: view.state.domains[cell] & ~(1 << (symbol - 1)) }));
  };
  return { add, roots, remove, proposal: (effects: Effect[]): DeductionProposal => ({
    technique: "rule-propagation@1", state: view.state.key, effects, pattern: { kind: "propagation" },
    proof: { state: view.state.key, nodes, imports: [...imports], roots },
  }) };
}
function firstRemoval(view: ReadView) {
  const b = builder(view); b.remove(view.state.domainFacts[0], 0, 1, 1, [0, 1]);
  return b.proposal([{ kind: "remove", cell: 1, symbol: 1 }]);
}
function check(view: ReadView, proposal: DeductionProposal): CheckedStep {
  const event = [...checkProposal(proposal, context(view))].at(-1)!;
  expect(event.kind, JSON.stringify(event)).toBe("checked");
  if (event.kind !== "checked") throw new Error("proof rejected");
  return event.step;
}

describe("shared candidate ownership", () => {
  test("initializes only clue intersections with authentic singleton evidence", () => {
    const view = fixture();
    expect(view.state.domains).toEqual([1, 3, 3, 3]);
    expect(view.supports("a:symbol:1")).toEqual([0, 1]);
    expect(view.facts.get(view.state.domainFacts[0])?.proposition).toEqual({ kind: "literal", value: { cell: 0, symbol: 1, positive: true } });
    expect(() => (view.state.domains as number[]).push(7)).toThrow();
    expect(() => (view.supports("a:symbol:1") as number[]).pop()).toThrow();
  });
  test("commits a checked removal without automatically placing an exposed single", () => {
    const before = fixture(), step = check(before, firstRemoval(before));
    const next = commitChecked(before, step);
    expect(before.state.domains).toEqual([1, 3, 3, 3]);
    expect(next.view.state.domains).toEqual([1, 2, 3, 3]);
    expect(next.view.state.values).toEqual([1, 0, 0, 0]);
    expect(next.view.state.key.revision).toBe(1);
    expect(next.view.facts.get(next.view.state.domainFacts[1])?.proposition).toEqual({ kind: "domain", cell: 1, mask: 2 });
    expect(next.changes).toMatchObject({ cells: [1], constraintIds: ["a", "b"],
      coverIds: ["a:symbol:1", "a:symbol:2", "b:symbol:1", "b:symbol:2"], graphChanged: true });
    expect(next.view.supports("a:symbol:1")).toEqual([0]);
    expect(next.view.state).toEqual(rebuildIndexes(next.view).state);
    expect(retainedProof(next.view).get(step.proposal.proof.nodes[0].id)).toBe(step.proposal.proof.nodes[0]);
  });
  test("places atomically with proved peer removal and retains the checked dependency chain", () => {
    const initial = fixture(), before = commitChecked(initial, check(initial, firstRemoval(initial))).view;
    const b = builder(before);
    const positive = b.add("cover-clause@1", [before.state.domainFacts[1]], { kind: "literal", value: { cell: 1, symbol: 2, positive: true } });
    b.roots.push(positive, before.state.domainFacts[1]);
    b.remove(positive, 1, 2, 2, [1, 2]);
    const proposal = b.proposal([{ kind: "place", cell: 1, symbol: 2 }, { kind: "remove", cell: 2, symbol: 2 }]);
    const result = commitChecked(before, check(before, proposal));
    expect(result.view.state.values).toEqual([1, 2, 0, 0]);
    expect(result.view.state.domains).toEqual([1, 2, 1, 3]);
    expect(result.changes.placed).toEqual([{ cell: 1, symbol: 2, positive: true }]);
    expect(result.view.supports("b:symbol:2")).toEqual([1]);
    expect(result.view.facts.get(result.view.state.domainFacts[2])?.rules).toEqual(["a", "b"]);
    for (const cover of before.assembly.covers) expect(result.view.supports(cover.id)).toEqual(rebuildIndexes(result.view).supports(cover.id));
    expect(() => commitChecked(result.view, check(before, proposal))).toThrow("stale");
  });
  test("rejects forged steps and checked proof-only certificates", () => {
    const view = fixture();
    expect(() => commitChecked(view, {} as CheckedStep)).toThrow("inauthentic");
    const proposal: DeductionProposal = { technique: "rule-propagation@1", state: view.state.key, effects: [], pattern: { kind: "roots" },
      proof: { state: view.state.key, nodes: [], imports: [0], roots: [0] } };
    expect(() => commitChecked(view, check(view, proposal))).toThrow("unproductive");
  });
  test.each(["missing-domain", "invented-mask", "extra-effect", "given-overwrite", "wrong-branch"])("fails closed for %s without publishing changes", kind => {
    const view = fixture(), original = firstRemoval(view);
    let proposal = structuredClone(original);
    if (kind === "missing-domain") proposal = { ...proposal, proof: { ...proposal.proof, nodes: proposal.proof.nodes.slice(0, -1), roots: proposal.proof.roots.slice(0, -1), imports: proposal.proof.imports.filter(id => id !== 1) } };
    if (kind === "invented-mask") (proposal.proof.nodes.at(-1)!.conclusion as { mask: number }).mask = 0;
    if (kind === "extra-effect") proposal = { ...proposal, effects: [...proposal.effects, { kind: "remove", cell: 3, symbol: 1 }] };
    if (kind === "given-overwrite") proposal = { ...proposal, effects: [{ kind: "place", cell: 0, symbol: 2 }] };
    if (kind === "wrong-branch") proposal = { ...proposal, state: { ...proposal.state, branch: "other" } };
    expect([...checkProposal(proposal, context(view))].at(-1)?.kind).toBe("rejected");
    expect(view.state.domains).toEqual([1, 3, 3, 3]);
  });
  test("reports duplicate givens as diagnostics without count evidence", () => {
    expect(diagnose(fixture([1, 1, 0, 0]))).toContainEqual({ kind: "duplicate-values", constraintId: "a", symbol: 1, cells: [0, 1] });
  });
  test("rejects placement certificates which omit a currently live peer candidate", () => {
    const initial = fixture(), view = commitChecked(initial, check(initial, firstRemoval(initial))).view;
    const b = builder(view);
    b.roots.push(b.add("cover-clause@1", [view.state.domainFacts[1]],
      { kind: "literal", value: { cell: 1, symbol: 2, positive: true } }), view.state.domainFacts[1]);
    expect([...checkProposal(b.proposal([{ kind: "place", cell: 1, symbol: 2 }]), context(view))].at(-1))
      .toEqual({ kind: "rejected", code: "missing-peer-effect" });
  });
  test("refuses same-ID imports from a separately authentic initialization", () => {
    const before = fixture(), unrelated = fixture();
    const step = check(before, firstRemoval(before));
    expect(() => commitChecked(unrelated, step)).toThrow("substituted-step-import");
    expect(unrelated.state.key.revision).toBe(0);
  });
  test.each(["weak-link", "resolution", "cover-clause"])("rejects a forged elementary %s conclusion", kind => {
    const view = fixture();
    let proposal = structuredClone(firstRemoval(view));
    if (kind === "weak-link") (proposal.proof.nodes[0].conclusion as unknown as { alternatives: { symbol: number }[] }).alternatives[1].symbol = 2;
    if (kind === "resolution") (proposal.proof.nodes[1].conclusion as { value: { positive: boolean } }).value.positive = true;
    if (kind === "cover-clause") {
      const b = builder(view);
      b.roots.push(b.add("cover-clause@1", [1], { kind: "literal", value: { cell: 1, symbol: 2, positive: true } }));
      proposal = b.proposal([{ kind: "place", cell: 1, symbol: 2 }]);
    }
    expect([...checkProposal(proposal, context(view))].at(-1)?.kind).toBe("rejected");
  });
  test("reconstructs peers from checked capabilities instead of trusting external metadata", () => {
    const view = fixture();
    const input = { ...view.assembly, peers: Array(4).fill([]) as number[][] };
    const next = initialize(input, "primary");
    expect(next.assembly.peers).toEqual([[1], [0, 2], [1], []]);
  });
  test("reports proved empty domains and missing covers without minting exact evidence", () => {
    const initial = fixture([1, 0, 2, 0]);
    const before = commitChecked(initial, check(initial, firstRemoval(initial))).view;
    const b = builder(before); b.remove(before.state.domainFacts[2], 2, 1, 2, [1, 2]);
    const next = commitChecked(before, check(before, b.proposal([{ kind: "remove", cell: 1, symbol: 2 }]))).view;
    expect(next.state.domains).toEqual([1, 0, 2, 3]);
    expect(diagnose(next)).toEqual([{ kind: "empty-domain", cell: 1 },
      { kind: "missing-cover", coverId: "a:symbol:2" }, { kind: "missing-cover", coverId: "b:symbol:1" }]);
  });
  test("rejects no-op removals and commits to a different branch", () => {
    const initial = fixture(), step = check(initial, firstRemoval(initial));
    const next = commitChecked(initial, step).view;
    expect([...checkProposal(firstRemoval(next), context(next))].at(-1)).toEqual({ kind: "rejected", code: "given-overwrite-or-unproductive-effect" });
    const branch = initialize(initial.assembly, "conditional");
    expect(() => commitChecked(branch, step)).toThrow("stale-step-state");
  });
  test("honors a configured proof-node allowance above the 4096-node default", () => {
    const view = fixture(), b = builder(view);
    let previous = 0;
    for (let index = 0; index < 4097; index++) previous = b.add("domain-restrict@1", [previous, view.state.domainFacts[0]],
      { kind: "domain", cell: 0, mask: 1 });
    b.roots.push(previous);
    const proposal = { ...b.proposal([]), pattern: { kind: "roots" } };
    const configured = { ...context(view), limits: { ...limits, stepNodes: 8192, stepBytes: 2 * 1024 * 1024,
      proofBytes: 4 * 1024 * 1024, workUnits: 20000 } };
    expect([...checkProposal(proposal, configured)].at(-1)?.kind).toBe("checked");
    expect([...checkProposal(proposal, { ...configured, limits: { ...configured.limits, stepNodes: 4096 } })].at(-1))
      .toEqual({ kind: "rejected", code: "proof-step-node-limit" });
    expect([...checkProposal(proposal, { ...configured, limits: { ...configured.limits, stepNodes: 16385 } })].at(-1))
      .toEqual({ kind: "rejected", code: "invalid-proof-limit" });
  });
  test.each([1, 7, 29, 113])("matches a cold rescan after every seeded monotone edit (%i)", seed => {
    const result = assemble(canonicalProblem({ schema: 1, cells: [0, 1, 2, 3, 4, 5, 6, 7, 8], symbols: [1, 2],
      givens: [1, 0, 0, 0, 0, 0, 0, 0, 1], constraints: Array.from({ length: 8 }, (_, cell) =>
        ({ id: `edge:${cell}`, type: "all-different@1", cells: [cell, cell + 1], parameters: {} })) }), [new AllDifferentRule()]);
    if (!result.ok) throw new Error("invalid chain fixture");
    let view = initialize(result.value, "primary"), random = seed;
    const previous: ReadView[] = [];
    for (let iteration = 0; iteration < 20; iteration++) {
      const options: { kind: "place" | "remove"; cell: number; symbol: number; source?: number; scope?: number[] }[] = [];
      for (const cell of view.assembly.problem.cells) if (view.state.values[cell] === 0) {
        if (view.state.domains[cell] === 1 || view.state.domains[cell] === 2)
          options.push({ kind: "place", cell, symbol: view.state.domains[cell] });
        for (const scope of view.assembly.allDifferent.filter(scope => scope.cells.includes(cell))) {
          const source = scope.cells.find(peer => peer !== cell && view.state.values[peer] !== 0);
          if (source !== undefined && (view.state.domains[cell] & (1 << (view.state.values[source] - 1))) !== 0)
            options.push({ kind: "remove", cell, symbol: view.state.values[source], source, scope: [...scope.cells] });
        }
      }
      if (options.length === 0) break;
      random = (random * 1664525 + 1013904223) >>> 0;
      const option = options[random % options.length], b = builder(view), effects: Effect[] = [
        { kind: option.kind, cell: option.cell, symbol: option.symbol }];
      const sourceCell = option.kind === "place" ? option.cell : option.source!;
      const sourceFact = view.facts.get(view.state.domainFacts[sourceCell])!;
      const positive = sourceFact.proposition.kind === "literal" ? sourceFact.root :
        b.add("cover-clause@1", [sourceFact.root], { kind: "literal", value: { cell: sourceCell, symbol: option.symbol, positive: true } });
      if (option.kind === "remove") b.remove(positive, sourceCell, option.cell, option.symbol, option.scope!);
      else {
        b.roots.push(positive, sourceFact.root);
        for (const scope of view.assembly.allDifferent.filter(scope => scope.cells.includes(sourceCell))) {
          const peer = scope.cells.find(cell => cell !== sourceCell)!;
          if ((view.state.domains[peer] & (1 << (option.symbol - 1))) !== 0) {
            b.remove(positive, sourceCell, peer, option.symbol, [...scope.cells]);
            effects.push({ kind: "remove", cell: peer, symbol: option.symbol });
          }
        }
      }
      previous.push(view);
      view = commitChecked(view, check(view, b.proposal(effects))).view;
      const cold = rebuildIndexes(view);
      expect(cold.state).toEqual(view.state);
      for (const cover of view.assembly.covers) {
        expect(view.supports(cover.id)).toEqual(cold.supports(cover.id));
        // Independent exhaustive scan checks the shared cold/incremental logic.
        expect(view.supports(cover.id)).toEqual(cover.cells.filter(cell =>
          view.state.domains[cell] === 3 || view.state.domains[cell] === cover.symbol));
      }
      expect(diagnose(view)).toEqual([]);
    }
    expect(view.state.values).toEqual([1, 2, 1, 2, 1, 2, 1, 2, 1]);
    expect(previous[0].state.domains).toEqual([1, 3, 3, 3, 3, 3, 3, 3, 1]);
  });
});
