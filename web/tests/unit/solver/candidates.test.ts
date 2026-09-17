import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import { describe, expect, test } from "vitest";
import { canonicalProblem } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { AllDifferentRule } from "../../../src/solver/rules/all-different";
import { initialize, commitChecked, retainedProof, diagnose, retainCheckedFacts, forkView, HypotheticalSession, disposeFork } from "../../../src/solver/state/candidates";
import { rebuildIndexes } from "../../../src/solver/state/indexes";
import { checkProposal, verifyCertificate, verifyBranch } from "../../../src/solver/proof/checker";
import { NakedSingles } from "../../../src/solver/techniques/singles";
import { buildImplications, type ImplicationIndex } from "../../../src/solver/indexes/implications";
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
    technique: effects.some(e => e.kind === "place") ? "c01@1" : "rule-propagation@1", state: view.state.key, effects,
    pattern: effects.some(e => e.kind === "place") ? { kind: "single", alias: "Naked Single", house: null,
      cell: effects.find(e => e.kind === "place")!.cell, symbol: effects.find(e => e.kind === "place")!.symbol } : { kind: "propagation" },
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
  test("a shortened branch prefix cannot overwrite a published domain fact", () => {
    const assembly = assemble(canonicalProblem({
      schema: 1, cells: [0, 1], symbols: [1, 2], givens: [0, 0],
      constraints: [{ id: "a", type: "all-different@1", cells: [0, 1], parameters: {} }],
    }), [new AllDifferentRule()]);
    if (!assembly.ok) throw Error("invalid collision fixture");
    const parent = initialize(assembly.value, "primary");
    const workspace = new IndexWorkspace({ entryLimit: 10000, byteLimit: 10000000 });
    const session = new HypotheticalSession(parent, "collision", workspace);
    try {
      const assumed = [...session.assume({ cell: 0, symbol: 1, positive: true }, limits)].at(-1);
      if (assumed?.kind !== "branch-checked") throw Error("assumption rejected");
      const before = session.view;
      const priorFacts = before.facts;
      const priorPrefix = retainedProof(before);
      const priorDomains = before.state.domains;
      const priorDomainFacts = before.state.domainFacts;
      const priorUsage = workspace.usage;
      const assumption = assumed.certificate.proposal.proof.nodes[0].id;
      const collision = before.state.domainFacts[0];
      expect(assumption).toBe(6);
      expect(collision).toBe(7);

      // Keep every original root and the exact assumption, but hide domain7.
      // The old checker then treated7 as a fresh ID for this valid weak clause.
      const shortened = new Map(priorPrefix);
      shortened.delete(collision);
      const proposal: DeductionProposal = {
        technique: "branch-graph@1", state: before.state.key, effects: [], pattern: {},
        proof: {
          state: before.state.key, imports: [before.state.domainFacts[1], assumption], roots: [collision],
          nodes: [{ id: collision, rule: "weak-link@1", premises: [before.state.domainFacts[1]],
            scope: [assumption], parameters: {}, conclusion: { kind: "clause", alternatives: [
              { cell: 1, symbol: 1, positive: false }, { cell: 1, symbol: 2, positive: false },
            ] } }],
        },
      };
      const result = [...verifyBranch(proposal, {
        view: before, retained: shortened, policy: "discharged", uniqueEvidenceId: null, limits,
      })].at(-1);
      if (result?.kind === "branch-checked") {
        expect(() => session.publish(result.certificate)).toThrow("reused-proof-node");
      }
      expect(session.view).toBe(before);
      expect(session.view.facts).toBe(priorFacts);
      expect(retainedProof(session.view)).toBe(priorPrefix);
      expect(session.view.state.domains).toBe(priorDomains);
      expect(session.view.state.domainFacts).toBe(priorDomainFacts);
      expect(session.view.facts.get(collision)).toBe(priorFacts.get(collision));
      expect(session.view.facts.get(collision)?.proposition).toEqual({ kind: "domain", cell: 0, mask: 1 });
      expect(workspace.usage).toEqual(priorUsage);
      expect(result).toEqual({ kind: "rejected", code: "branch-prefix-mismatch" });

      // A copied complete prefix still admits a genuinely fresh node normally.
      const freshId = collision + 1;
      const fresh = { ...proposal, proof: { ...proposal.proof, roots: [freshId],
        nodes: proposal.proof.nodes.map(node => ({ ...node, id: freshId })) } };
      const valid = [...verifyBranch(fresh, {
        view: before, retained: new Map(priorPrefix), policy: "discharged", uniqueEvidenceId: null, limits,
      })].at(-1);
      expect(valid?.kind).toBe("branch-checked");
      if (valid?.kind !== "branch-checked") throw Error("complete prefix rejected");
      session.publish(valid.certificate);
      expect(session.view.facts.get(collision)).toBe(priorFacts.get(collision));
      expect(session.view.state.domainFacts).toEqual(priorDomainFacts);
    } finally {
      session.dispose();
    }
    expect(workspace.usage).toEqual({ entries: 0, bytes: 0 });
  });
  test("every borrowed branch cold rebuild reserves storage before allocation",()=>{
    const parent=fixture(),workspace=new IndexWorkspace({entryLimit:10000,byteLimit:100000}),view=forkView(parent,"cold",workspace),usage=workspace.usage;
    expect(()=>rebuildIndexes(view)).toThrow("workspace-byte-limit");expect(workspace.usage).toEqual(usage);
    disposeFork(view);expect(()=>rebuildIndexes(view)).toThrow("inauthentic-candidate-view");expect(workspace.usage).toEqual({entries:0,bytes:0});
  });
  test("branch creation reserves before allocation and ordinary admission rejects even assumption-free forks",()=>{
    const parent=fixture(),small=new IndexWorkspace({entryLimit:1,byteLimit:10});
    expect(()=>forkView(parent,"x",small)).toThrow("workspace-byte-limit");expect(small.usage).toEqual({entries:0,bytes:0});
    const workspace=new IndexWorkspace({entryLimit:10000,byteLimit:10000000}),view=forkView(parent,"x",workspace),p=firstRemoval(parent);
    try {
      expect([...checkProposal(p,{...context(parent),view})].at(-1)).toMatchObject({kind:"rejected",code:"hypothetical-primary-admission"});
      expect([...verifyCertificate(p,{...context(parent),view})].at(-1)).toMatchObject({kind:"rejected",code:"hypothetical-primary-admission"});
      expect(()=>commitChecked(view,check(parent,p))).toThrow("hypothetical-primary-admission");
      let reads=0;const proxy=new Proxy(view,{get(t,k){reads++;return Reflect.get(t,k);}});
      expect([...verifyBranch(p,{...context(parent),view:proxy})].at(-1)).toMatchObject({kind:"rejected",code:"inauthentic-candidate-view"});expect(reads).toBe(0);
    }finally{disposeFork(view);}expect(workspace.usage).toEqual({entries:0,bytes:0});
  });
  test("checked branch domains create fresh local links and reject exact sibling-node substitution",()=>{
    const assembly=assemble(canonicalProblem({schema:1,cells:[0,1,2],symbols:[1,2,3],givens:[0,0,0],constraints:[{id:"a",type:"all-different@1",cells:[0,1,2],parameters:{}}]}),[new AllDifferentRule()]);
    if(!assembly.ok)throw Error("fixture");const parent=initialize(assembly.value,"primary"),workspace=new IndexWorkspace({entryLimit:100000,byteLimit:10000000});
    const a=new HypotheticalSession(parent,"same",workspace),b=new HypotheticalSession(parent,"same",workspace);
    let index:ImplicationIndex|undefined;
    try {
      expect([...a.assume({cell:0,symbol:1,positive:true},limits)].at(-1)?.kind).toBe("branch-checked");
      expect([...b.assume({cell:0,symbol:2,positive:true},limits)].at(-1)?.kind).toBe("branch-checked");
      const proposal=[...new NakedSingles().discover(a.view)].find(e=>e.kind==="proposal");if(proposal?.kind!=="proposal")throw Error("single");
      const result=[...a.check(proposal.proposal,limits)].at(-1);expect(result?.kind).toBe("branch-checked");if(result?.kind!=="branch-checked")throw Error("single rejected");a.publish(result.certificate);
      expect(a.view.state.domains).toEqual([1,6,6]);expect(parent.state.domains).toEqual([7,7,7]);expect(b.view.state.domains).toEqual([2,7,7]);
      for(const event of buildImplications(a.view,workspace))if(event.kind==="ready")index=event.value;
      const edge=index!.edges.find(e=>e.kind==="strong"&&e.recipe.kind==="cell-cover"&&e.literals[0].cell===1)!;
      expect(edge.premiseFacts[0]).toBe(a.view.facts.get(a.view.state.domainFacts[1]));expect(edge.premiseFacts[0].openAssumptions.length).toBe(1);
      expect(index!.acceptsView(b.view)).toBe(false);expect(index!.acceptsView(parent)).toBe(false);
      const fakeRetained=new Map(retainedProof(a.view));for(const [id,node]of retainedProof(b.view))if(node.rule==="assume@1")fakeRetained.set(id,node);
      expect([...verifyBranch(proposal.proposal,{view:a.view,retained:fakeRetained,policy:"discharged",uniqueEvidenceId:null,limits})].at(-1)).toMatchObject({kind:"rejected",code:"branch-prefix-mismatch"});
    }finally{index?.dispose();a.dispose();b.dispose();}expect(workspace.usage).toEqual({entries:0,bytes:0});
  });
  test("abandoning assumption verification cannot publish hypothetical facts",()=>{
    const parent=fixture([0,0,0,0]),workspace=new IndexWorkspace({entryLimit:10000,byteLimit:10000000}),session=new HypotheticalSession(parent,"x",workspace),before=session.view;
    const cursor=session.assume({cell:0,symbol:1,positive:true},limits);expect(cursor.next().value?.kind).toBe("work");cursor.return(undefined);
    expect(session.view).toBe(before);session.dispose();expect(workspace.usage).toEqual({entries:0,bytes:0});
  });
  test("disposed branch publications cannot reuse released resource authority",()=>{
    const parent=fixture([0,0,0,0]),workspace=new IndexWorkspace({entryLimit:10000,byteLimit:10000000}),session=new HypotheticalSession(parent,"x",workspace);
    const e=[...session.assume({cell:0,symbol:1,positive:true},limits)].at(-1);if(e?.kind!=="branch-checked")throw Error("assume");
    const view=session.view,retained=retainedProof(view);session.dispose();
    expect([...verifyBranch(e.certificate.proposal,{view,retained,policy:"discharged",uniqueEvidenceId:null,limits})].at(-1)).toMatchObject({kind:"rejected",code:"inauthentic-candidate-view"});
    expect(()=>[...buildImplications(view,workspace)]).toThrow("inauthentic-candidate-view");expect(()=>session.publish(e.certificate)).toThrow("disposed-hypothetical-session");
    expect(workspace.usage).toEqual({entries:0,bytes:0});
  });
  test("checked empty-domain evidence never publishes an inconsistent branch",()=>{
    const parent=fixture(),workspace=new IndexWorkspace({entryLimit:10000,byteLimit:10000000}),session=new HypotheticalSession(parent,"contradiction",workspace);
    try {
      expect([...session.assume({cell:1,symbol:1,positive:true},limits)].at(-1)?.kind).toBe("branch-checked");const before=session.view;
      const b=builder(before);b.remove(before.state.domainFacts[0],0,1,1,[0,1]);const p={...b.proposal([{kind:"remove",cell:1,symbol:1}]),technique:"branch-graph@1",pattern:{}};
      const result=[...session.check(p,limits)].at(-1);expect(result?.kind).toBe("branch-checked");if(result?.kind!=="branch-checked")throw Error("contradiction");
      expect(()=>session.publish(result.certificate)).toThrow("contradictory-branch-publication");expect(session.view).toBe(before);expect(before.state.domains.every(m=>m>0)).toBe(true);
    }finally{session.dispose();}expect(workspace.usage).toEqual({entries:0,bytes:0});
  });
  test("forks exact immutable prefixes with distinct branch identity and isolated domains", () => {
    const parent = fixture(), w = new IndexWorkspace({ entryLimit: 10000, byteLimit: 10000000 }), a = forkView(parent, "same", w), b = forkView(parent, "same", w);
    expect(a.state.key.branch).not.toBe(b.state.key.branch);
    expect(a.state.domains).toEqual(parent.state.domains);
    expect(a.state.domains).not.toBe(parent.state.domains);
    for (const [id, fact] of parent.facts) expect(a.facts.get(id)).toBe(fact);
    for (const [id, node] of retainedProof(parent)) expect(retainedProof(a).get(id)).toBe(node);
    let reads = 0;
    expect(() => forkView(new Proxy(parent, { get(t, k) { reads++; return Reflect.get(t,k); } }), "x", w)).toThrow("inauthentic-candidate-view");
    expect(reads).toBe(0);
    disposeFork(a); disposeFork(b); expect(w.usage).toEqual({entries:0,bytes:0});
  });
  test("hypothetical assumptions publish only in their confined session", () => {
    const parent = fixture([0,0,0,0]), w = new IndexWorkspace({ entryLimit: 10000, byteLimit: 10000000 }), a = new HypotheticalSession(parent, "a", w), b = new HypotheticalSession(parent, "a", w);
    const terminal = [...a.assume({ cell: 0, symbol: 1, positive: true }, limits)].at(-1);
    expect(terminal?.kind).toBe("branch-checked");
    expect(a.view.state.domains).toEqual([1,3,3,3]);
    expect(parent.state.domains).toEqual([3,3,3,3]);
    expect(b.view.state.domains).toEqual([3,3,3,3]);
    if (terminal?.kind !== "branch-checked") throw Error("assumption rejected");
    expect(() => commitChecked(parent, terminal.certificate as unknown as CheckedStep)).toThrow("inauthentic-checked-step");
    expect(() => b.publish(terminal.certificate)).toThrow("foreign-branch-certificate");
    a.dispose(); b.dispose(); expect(w.usage).toEqual({entries:0,bytes:0}); expect(() => a.view).toThrow("disposed-hypothetical-session");
  });
  test("initializes only clue intersections with authentic singleton evidence", () => {
    const view = fixture();
    expect(view.state.domains).toEqual([1, 3, 3, 3]);
    expect(view.supports("a:symbol:1")).toEqual([0, 1]);
    expect(view.facts.get(view.state.domainFacts[0])?.proposition).toEqual({ kind: "literal", value: { cell: 0, symbol: 1, positive: true } });
    expect(() => (view.state.domains as number[]).push(7)).toThrow();
    expect(() => (view.supports("a:symbol:1") as number[]).pop()).toThrow();
  });
  test.each(["getter", "proxy"])("rejects %s view lookalikes at every ownership boundary without reading their properties", kind => {
    const view=fixture(), step=check(view,firstRemoval(view));
    let reads=0;
    const fake=kind==="getter" ? {...view,get state(){reads++;return view.state;}} :
      new Proxy({...view},{get(target,key,receiver){reads++;return Reflect.get(target,key,receiver);}});
    expect(()=>retainedProof(fake)).toThrow("inauthentic-candidate-view");
    expect(()=>commitChecked(fake,step)).toThrow("inauthentic-candidate-view");
    expect(()=>retainCheckedFacts(fake,step)).toThrow("inauthentic-candidate-view");
    expect(()=>rebuildIndexes(fake)).toThrow("inauthentic-candidate-view");
    expect(reads).toBe(0);
    const cold=rebuildIndexes(view);
    expect(cold).not.toBe(view);
    expect(cold.state).toBe(view.state);
    expect(cold.facts).toBe(view.facts);
    expect(retainedProof(cold)).toBe(retainedProof(view));
    expect(commitChecked(cold,step).view.state.domains).toEqual([1,2,3,3]);
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
    const certificate = [...verifyCertificate(proposal, context(view))].at(-1);
    expect(certificate?.kind).toBe("verified");
    if (certificate?.kind === "verified") expect(() => commitChecked(view, certificate.certificate as never)).toThrow("inauthentic");
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
    expect([...verifyCertificate(proposal, configured)].at(-1)?.kind).toBe("verified");
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
