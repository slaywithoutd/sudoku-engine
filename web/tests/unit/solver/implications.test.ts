import { discoveryContext } from "../../solver/discovery-context";
import { expect, test } from "vitest";
import { canonicalProblem, normalizeClassic } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { mockRuleRegistry } from "../../solver/mock-rules";
import { initialize, retainedProof, rebuildOwnedIndexes, commitChecked, retainCheckedFacts } from "../../../src/solver/state/candidates";
import { buildImplications } from "../../../src/solver/indexes/implications";
import { buildGroups } from "../../../src/solver/indexes/groups";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import type { IndexEvent } from "../../../src/solver/indexes/workspace";
import { checkProposal, verifyCertificate } from "../../../src/solver/proof/checker";
import { primitiveRegistry } from "../../../src/solver/proof/primitives";
import { CertificateSession } from "../../../src/solver/proof/certificates";
import { CertificateBuilder, proposedClause } from "../../../src/solver/proof/builder";
import { fixtureCase, fixtureView, fixtureCertificate } from "../../solver/acceptance";
import { getTechniques } from "../../../src/solver/techniques/registry";
import { buildAls } from "../../../src/solver/indexes/als";
import type { ProofNode, Proposition } from "../../../src/solver/proof/types";

const limits = { timeMs: 20000, workUnits: 1000000, exactNodes: 1000000, stepNodes: 4096,
  runNodes: 20000, proofBytes: 8000000, stepBytes: 2000000, batchBytes: 65536,
  inFlightBatches: 2, workspaceBytes: 16000000 };
function small() {
  const result = assemble(canonicalProblem({ schema: 1, cells: [0,1,2,3], symbols: [1,2,3], givens: [0,0,0,0],
    constraints: [ { id: "house", type: "all-different@1", cells: [0,1,2], parameters: {} },
      { id: "overlap", type: "all-different@1", cells: [0,1], parameters: {} },
      { id: "order", type: "order@1", cells: [2,3], parameters: {} } ] }), mockRuleRegistry);
  if (!result.ok) throw Error("fixture"); return initialize(result.value, "primary");
}
function ready<T>(events: Generator<IndexEvent<T>>): T {
  let result: T | undefined;
  for (const event of events) { if (event.kind === "ready") result = event.value;
    if (event.kind === "interrupted") throw Error(event.reason); }
  if (!result) throw Error("missing-ready"); return result;
}
const budget = () => new IndexWorkspace({ entryLimit: 100000, byteLimit: 256000000 });
const positive = (cell: number, symbol: number) => ({ cell, symbol, positive: true });

test("indexes exact covers and proved conflicts without promoting a three-support house to strong", () => {
  const view = small(), graph = ready(buildImplications(view, budget()));
  expect(graph.strong(positive(0,1), positive(1,1))).toBe(false);
  expect(graph.weak(positive(0,1), positive(1,1))).toBe(true);
  expect(graph.weak(positive(0,1), positive(0,2))).toBe(true);
  expect(graph.weak(positive(2,3), positive(3,1))).toBe(true);
  expect(graph.weak(positive(2,1), positive(3,3))).toBe(false);
  expect(graph.covers.filter(c => c.recipe.kind === "house-cover")).toHaveLength(3);
  expect(graph.edges.filter(e => e.kind === "weak" && e.literals[0].cell === 0 && e.literals[1].cell === 1 &&
    e.literals.every(l => l.symbol === 1))).toHaveLength(2); // both scope proofs survive
  for (const entry of [...graph.covers, ...graph.edges]) {
    expect(entry.state).toEqual(view.state.key);
    expect(entry.premises.length).toBeGreaterThan(0);
    expect(entry.watches).toEqual([{ kind: "all" }]);
    expect(Object.isFrozen(entry)).toBe(true);
  }
});

test("only exact two-literal cell and house covers create strong links", () => {
  const result = assemble(canonicalProblem({ schema: 1, cells: [0,1], symbols: [1,2], givens: [0,0],
    constraints: [{ id: "pair", type: "all-different@1", cells: [0,1], parameters: {} }] }), mockRuleRegistry);
  if (!result.ok) throw Error("fixture");
  const graph = ready(buildImplications(initialize(result.value,"primary"),budget()));
  expect(graph.strong(positive(0,1),positive(0,2))).toBe(true);
  expect(graph.strong(positive(0,1),positive(1,1))).toBe(true);
  expect(graph.strong(positive(0,1),positive(1,2))).toBe(false);
  expect(graph.strong({ ...positive(0,1), positive: false },positive(1,1))).toBe(false);
  for (const values of [[1,2],[2,1]]) for (const edge of graph.edges) if (edge.kind === "strong")
    expect(edge.literals.some(l => values[l.cell] === l.symbol)).toBe(true);
});

test("groups enumerate every <=3-member subset and preserve scope occurrences without invented covers", () => {
  const groups = ready(buildGroups(small(), budget()));
  expect(groups.entries).toHaveLength((7+3)*3);
  const pair = groups.entries.filter(g => g.symbol === 1 && g.cells.join() === "0,1");
  expect(pair).toHaveLength(2);
  expect(pair.every(g => g.members.length === 2 && g.recipe.kind === "group-members")).toBe(true);
  expect(groups.entries.every(g => g.cells.length <= 3 && g.premises.length > 0)).toBe(true);
});

test("state matching is metadata; authority requires the original published premise identities", () => {
  const view = small(), graph = ready(buildImplications(view, budget()));
  expect(graph.accepts(view.state.key)).toBe(true);
  expect(graph.accepts({ ...view.state.key, branch: "sibling" })).toBe(false);
  expect(graph.accepts({ ...view.state.key, revision: 1 })).toBe(false);
  expect(graph.acceptsView(rebuildOwnedIndexes(view))).toBe(true);
  expect(graph.acceptsView(small())).toBe(false);
  let read = false;
  const fake = new Proxy(view, { get() { read = true; throw Error("untrusted-read"); } });
  expect(graph.acceptsView(fake)).toBe(false);
  expect(() => buildImplications(fake, budget()).next()).toThrow("inauthentic-candidate-view");
  expect(() => buildGroups(fake, budget()).next()).toThrow("inauthentic-candidate-view");
  expect(read).toBe(false);
});

test("workspace reservations are shared and partial/cancelled/abandoned builds never publish ready", () => {
  const view = small(), shared = budget(), graph = ready(buildImplications(view, shared));
  const used = shared.usage;
  expect(used.entries).toBeGreaterThan(0);
  const partial = buildGroups(view, shared); partial.next(); partial.next(); partial.return(undefined);
  expect(shared.usage).toEqual(used);
  graph.dispose(); graph.dispose();
  expect(shared.usage).toEqual({ entries: 0, bytes: 0 });
  expect(graph.accepts(view.state.key)).toBe(false);
  expect(() => graph.weak(positive(0,1), positive(1,1))).toThrow("disposed-index");
  const capped = new IndexWorkspace({ entryLimit: 1, byteLimit: 1000000 });
  const events = [...buildImplications(view, capped)];
  expect(events.at(-1)).toEqual({ kind: "interrupted", reason: "workspace-entry-limit" });
  expect(events.some(e => e.kind === "ready")).toBe(false);
  expect(capped.usage).toEqual({ entries: 0, bytes: 0 });
  const byteCap = new IndexWorkspace({ entryLimit: 1000, byteLimit: 1 });
  expect([...buildGroups(view, byteCap)]).toEqual([{ kind: "interrupted", reason: "workspace-byte-limit" }]);
  let cancelled = false;
  const cancelBudget = new IndexWorkspace({ entryLimit: 1000, byteLimit: 10000000, cancelled: () => cancelled });
  const generator = buildImplications(view, cancelBudget); generator.next(); cancelled = true;
  expect([...generator].at(-1)).toEqual({ kind: "interrupted", reason: "cancelled" });
  expect(cancelBudget.usage).toEqual({ entries: 0, bytes: 0 });
});

test("interleaved builders share one cap, abandoned generators release only their own leases", () => {
  const view = small(), reference = budget(), graph = ready(buildImplications(view, reference));
  const cap = reference.usage.entries;
  const shared = new IndexWorkspace({ entryLimit: cap, byteLimit: 256000000 });
  const a = buildImplications(view, shared), b = buildGroups(view, shared);
  a.next(); b.next();
  let doneA = false, doneB = false, complete = 0, interrupted = 0;
  for (let turn = 0; turn < 10000 && (!doneA || !doneB); turn++) {
    for (const [name, generator] of [["a",a],["b",b]] as const) {
      if (name === "a" ? doneA : doneB) continue;
      const event = generator.next();
      if (event.done) { if (name === "a") doneA = true; else doneB = true; }
      else if (event.value.kind === "ready") { complete++; event.value.value.dispose(); }
      else if (event.value.kind === "interrupted") interrupted++;
      expect(shared.usage.entries).toBeLessThanOrEqual(cap);
    }
  }
  expect(complete+interrupted).toBe(2);
  expect(shared.usage).toEqual({ entries: 0, bytes: 0 });
  graph.dispose();
  const external = shared.reserve(cap, 1000);
  expect([...buildGroups(view, shared)].at(-1)).toEqual({ kind: "interrupted", reason: "workspace-entry-limit" });
  expect(shared.usage).toEqual({ entries: cap, bytes: 1000 });
  external.dispose();
});

test("every indexed mixed-rule cover and edge agrees with an independently enumerated assignment oracle", () => {
  const view = small(), graph = ready(buildImplications(view, budget()));
  // Independent four-variable oracle uses direct arithmetic, never capability/peer discovery.
  const solutions: number[][] = [];
  for (let a=1;a<=3;a++) for (let b=1;b<=3;b++) for (let c=1;c<=3;c++) for (let d=1;d<=3;d++)
    if (a !== b && a !== c && b !== c && c < d) solutions.push([a,b,c,d]);
  expect(solutions.length).toBeGreaterThan(0);
  for (const values of solutions) {
    for (const cover of graph.covers) expect(cover.literals.some(l => values[l.cell] === l.symbol)).toBe(true);
    for (const edge of graph.edges) {
      const truths = edge.literals.filter(l => values[l.cell] === l.symbol).length;
      expect(edge.kind === "weak" ? truths <= 1 : truths >= 1).toBe(true);
    }
  }
  // Exact local-source completeness, independent of incidental implications from other rules.
  for (let a=1;a<=3;a++) for (let b=1;b<=3;b++)
    expect(graph.edges.some(e => e.recipe.kind === "relation-conflict" &&
      e.literals[0].cell === 2 && e.literals[0].symbol === a && e.literals[1].cell === 3 && e.literals[1].symbol === b))
      .toBe(a >= b);
});

test("ordinary index recipes expand as checkable certificates without minting candidate authority", () => {
  const view = small(), graph = ready(buildImplications(view, budget()));
  const builder = new CertificateBuilder(view), roots: number[] = [];
  for (const cover of graph.covers) {
    let source = cover.recipe.source;
    if (cover.recipe.kind === "house-cover") {
      const original = view.facts.get(source)!.proposition;
      if (original.kind !== "cover") throw Error("fixture");
      source = builder.add("support@1", cover.premises, { kind: "cover", symbol: original.symbol,
        cells: cover.literals.map(l => l.cell) });
    }
    roots.push(builder.add("cover-clause@1", [source], proposedClause(cover.literals)));
  }
  for (const edge of graph.edges) if (edge.kind === "weak" && edge.recipe.kind !== "relation-conflict")
    roots.push(builder.add("weak-link@1", edge.premises, proposedClause(edge.literals.map(l => ({ ...l, positive: false })))));
  const proposed = builder.finish("untrusted-index-test@1", {});
  const proposal = { ...proposed, proof: { ...proposed.proof, roots } };
  const terminal = [...verifyCertificate(proposal, { view, retained: retainedProof(view), limits,
    policy: "unconditional", uniqueEvidenceId: null })].at(-1);
  expect(terminal?.kind).toBe("verified");
  if (terminal?.kind !== "verified") throw Error("certificate");
  expect(() => retainCheckedFacts(view, terminal.certificate as never)).toThrow("inauthentic-checked-step");
});

test("seeded checked changes invalidate all indexes and match full cold reconstruction", () => {
  let view = fixtureView(fixtureCase("C04-naked-4"));
  let seed = 7331;
  for (let turn = 0; turn < 3; turn++) {
    const shared = budget(), before = ready(buildImplications(view, shared));
    const proposals = getTechniques("classic-expanded@1").slice(0,5).flatMap(detector =>
      [...detector.discover(view, discoveryContext())].flatMap(event => event.kind === "proposal" ? [event.proposal] : []));
    expect(proposals.length).toBeGreaterThan(0);
    seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
    const proposal = proposals[seed % proposals.length];
    const checked = [...checkProposal(proposal, { view, retained: retainedProof(view), limits,
      policy: "unconditional", uniqueEvidenceId: null })].at(-1);
    if (checked?.kind !== "checked") throw Error(`checked-change:${JSON.stringify(checked)}`);
    view = commitChecked(view, checked.step).view;
    expect(before.accepts(view.state.key)).toBe(false);
    expect(before.acceptsView(view)).toBe(false);
    before.dispose();
    const cold = rebuildOwnedIndexes(view);
    for (const build of [buildImplications, buildGroups, buildAls]) {
      const a = ready(build(view, shared) as Generator<IndexEvent<{ entries: readonly unknown[]; dispose(): void }>>);
      const b = ready(build(cold, shared) as Generator<IndexEvent<{ entries: readonly unknown[]; dispose(): void }>>);
      expect(a.entries).toEqual(b.entries);
      a.dispose(); b.dispose();
    }
    expect(shared.usage).toEqual({ entries: 0, bytes: 0 });
  }
});

test("subset strategy propagates open assumptions, conditionality and exact rule provenance unchanged", () => {
  const view = classic(), source = [...view.facts.values()].find(f => f.proposition.kind === "all-different")!;
  const inherited = { conclusion: source.proposition, rules: ["source-rule"], conditional: true, openAssumptions: [12,18] };
  const result = primitiveRegistry.check({ rule: "all-different-subset@1", premises: [source.id], parameters: {},
    conclusion: { kind: "all-different", cells: [0,1] } }, { view, retained: retainedProof(view), limits,
    policy: "unique-only", uniqueEvidenceId: null, premiseInferences: new Map([[source.id,inherited]]) });
  expect(result).toEqual({ ...inherited, conclusion: { kind: "all-different", cells: [0,1] } });
});

test("cover and edge queries borrow charged immutable partitions without allocating copies", () => {
  const graph = ready(buildImplications(small(), budget()));
  expect(graph.covers).toBe(graph.covers);
  expect(graph.edges).toBe(graph.edges);
  expect(Object.isFrozen(graph.covers)).toBe(true);
  expect(Object.isFrozen(graph.edges)).toBe(true);
});

test("a named hidden-single cache contributes its derived cover while old identical premises remain reusable", () => {
  const view = fixtureView(fixtureCase("C02-row")), full = fixtureCertificate("C02-row");
  const nodes = full.proof.nodes.slice(0,2);
  const cache = { ...full, effects: [], proof: { ...full.proof, nodes, roots: [nodes[1].id],
    imports: [...new Set(nodes.flatMap(n => n.premises).filter(id => view.facts.has(id)))].sort((a,b) => a-b) } };
  const event = [...checkProposal(cache, { view, retained: retainedProof(view), limits,
    policy: "unconditional", uniqueEvidenceId: null })].at(-1);
  expect(event?.kind).toBe("checked");
  if (event?.kind !== "checked") throw Error("cache");
  const before = ready(buildImplications(view, budget())), next = retainCheckedFacts(view,event.step);
  expect(before.acceptsView(next)).toBe(false); // extension validation needs run accounting
  let charged = 0;
  expect(before.acceptsView(next,units => { charged += units; })).toBe(true);
  expect(charged).toBeGreaterThan(0);
  expect(() => before.acceptsView(next,() => { throw Error("run-work-limit"); })).toThrow("run-work-limit");
  expect(before.completeFor(view)).toBe(true);
  expect(before.completeFor(next)).toBe(false);
  expect(before.covers.some(c => c.recipe.source === nodes[0].id)).toBe(false);
  const after = ready(buildImplications(next, budget()));
  expect(after.completeFor(next)).toBe(true);
  const cover = after.covers.find(c => c.recipe.source === nodes[0].id);
  expect(cover).toBeDefined();
  expect(cover?.premiseFacts[0]).toBe(next.facts.get(nodes[0].id));
  expect(cover?.conditional).toBe(false);
  expect(after.covers.length).toBe(before.covers.length+1);
});
function classic() {
  const result = assemble(normalizeClassic({ kind: "classic", version: 1, width: 9, height: 9,
    givens: Array(81).fill(0) }), mockRuleRegistry);
  if (!result.ok) throw Error("fixture");
  return initialize(result.value, "primary");
}

test("complete local relation joins project an unconditional conflict only after the third domain filter", () => {
  const result=assemble(canonicalProblem({schema:1,cells:[0,1,2],symbols:[1,2,3],givens:[0,0,1],
    constraints:[{id:"triple",type:"all-different@1",cells:[0,1,2],parameters:{}}]}),mockRuleRegistry);
  if(!result.ok) throw Error("fixture");
  const view=initialize(result.value,"primary"), retained=retainedProof(view);
  const nodes:ProofNode[]=[], imports=new Set<number>();
  let next=Math.max(...retained.keys())+1;
  const add=(rule:string,premises:number[],conclusion:Proposition,parameters={},scope:number[]=[])=>{
    premises.filter(id=>retained.has(id)).forEach(id=>imports.add(id)); const id=next++;
    nodes.push({id,rule,premises,conclusion,parameters,scope});return id;
  };
  const table=(rule:string,premises:number[],cells:number[],count:number,parameters={})=>
    add(rule,premises,{kind:"table",cells,count,definition:next},parameters);
  const originalDomains=[0,1,2];
  const scope=[...view.facts.values()].find(f=>f.proposition.kind==="all-different")!.id;
  const all=table("table-filter@1",[...originalDomains,scope],[0,1,2],6,{cells:[0,1,2],box:[7,7,7]});
  const tuples=[[1,2,3],[1,3,2],[2,1,3],[2,3,1],[3,1,2],[3,2,1]];
  const relation=add("table-project@1",[all],{kind:"relation",cells:[0,1,2],tuples});
  const filter=table("table-filter@1",[view.state.domainFacts[2]],[2],1,{cells:[2],box:[1]});
  const joined=table("table-join@1",[relation,filter],[0,1,2],2);
  const conclusion=proposedClause([{cell:0,symbol:1,positive:false},{cell:1,symbol:2,positive:false}]);
  const root=add("table-project@1",[joined],conclusion);
  const check=()=>[...verifyCertificate({technique:"independent-relation-algebra@1",pattern:{},effects:[],state:view.state.key,
    proof:{state:view.state.key,nodes,imports:[...imports].sort((a,b)=>a-b),roots:[root]}},
    {view,retained,limits,policy:"unconditional",uniqueEvidenceId:null})].at(-1);
  expect(check()).toMatchObject({kind:"verified",certificate:{consequences:[{conditional:false,openAssumptions:[],rules:["triple"]}]}});
  // Independently expand the original T08 assumption/filter/join/projection recipe
  // in a non-applying session, discharging the contradiction before retaining it.
  const session=new CertificateSession({view,retained,limits,policy:"discharged",uniqueEvidenceId:null});
  const baseProposal={technique:"independent-relation-algebra@1",pattern:{},effects:[],state:view.state.key,
    proof:{state:view.state.key,nodes:[...nodes],imports:[...imports].sort((a,b)=>a-b),roots:[root]}};
  const base=[...session.verify(baseProposal)].at(-1);if(base?.kind!=="verified")throw Error("session-base");session.retain(base.certificate);
  const scoped:ProofNode[]=[];let scopedNext=next;
  const local=(rule:string,premises:number[],conclusion:Proposition,scope:number[]=[],parameters={})=>{
    const id=scopedNext++;scoped.push({id,rule,premises,conclusion,scope,parameters});return id;
  };
  const assumption=local("assume@1",[],{kind:"literal",value:positive(0,1)});
  const restricted=local("domain-restrict@1",[view.state.domainFacts[0],assumption],{kind:"domain",cell:0,mask:1},[assumption]);
  const restrictedTable=local("table-filter@1",[restricted],{kind:"table",cells:[0],count:1,definition:scopedNext},[assumption],{cells:[0],box:[1]});
  const empty=local("table-join@1",[joined,restrictedTable],{kind:"table",cells:[0,1,2],count:0,definition:scopedNext},[assumption]);
  const negative=local("table-project@1",[empty],{kind:"literal",value:{cell:2,symbol:1,positive:false}},[assumption]);
  const falseRoot=local("contradiction@1",[view.state.domainFacts[2],negative],{kind:"false"},[assumption]);
  const discharged=local("discharge@1",[assumption,falseRoot],{kind:"literal",value:{cell:0,symbol:1,positive:false}});
  const algebra={...baseProposal,proof:{state:view.state.key,nodes:scoped,roots:[discharged],imports:
    [...new Set(scoped.flatMap(n=>n.premises).filter(id=>session.context.retained.has(id)))].sort((a,b)=>a-b)}};
  const expanded=[...session.verify(algebra)].at(-1);
  expect(expanded).toMatchObject({kind:"verified",certificate:{consequences:[{openAssumptions:[],conditional:false,rules:["triple"]}]}});
  expect(retainedProof(view).size).toBe(retained.size);
  const original=nodes.at(-1)!;
  nodes[nodes.length-1]={...original,premises:[relation]};
  expect(check()?.kind).toBe("rejected");
  nodes[nodes.length-1]={...original,conclusion:proposedClause([{cell:0,symbol:2,positive:false},{cell:1,symbol:3,positive:false}])};
  expect(check()?.kind).toBe("rejected");
  nodes[nodes.length-1]={...original,conclusion:proposedClause([{cell:0,symbol:1,positive:false},{cell:8,symbol:2,positive:false}])};
  expect(check()?.kind).toBe("rejected");
  nodes[nodes.length-1]={...original,premises:[filter]};
  expect(check()?.kind).toBe("rejected");
});

test("clause projection rejects a satisfying but incomplete table partition",()=>{
  const view=small(),builder=new CertificateBuilder(view),first=Math.max(...view.facts.keys())+1;
  const table=builder.add("table-filter@1",[view.state.domainFacts[0]],{kind:"table",cells:[0],count:2,definition:first},{cells:[0],box:[3]});
  const root=builder.add("table-project@1",[table],proposedClause([positive(0,1),positive(0,2)]));
  const p=builder.finish("independent-partial-table@1",{}),proposal={...p,proof:{...p.proof,roots:[root]}};
  expect([...verifyCertificate(proposal,{view,retained:retainedProof(view),limits,policy:"unconditional",uniqueEvidenceId:null})].at(-1))
    .toMatchObject({kind:"rejected",code:"incomplete-table"});
});

test("all-different subset permits a complete local table and inherits the exact rule", () => {
  const view = classic(), retained = retainedProof(view);
  const scope = [...view.facts.values()].find(f => f.proposition.kind === "all-different" &&
    f.proposition.cells.includes(0) && f.proposition.cells.includes(1))!;
  const id = retained.size;
  const nodes: ProofNode[] = [
    { id, rule: "all-different-subset@1", premises: [scope.id], parameters: {}, scope: [],
      conclusion: { kind: "all-different", cells: [0,1] } },
    { id: id+1, rule: "table-filter@1", premises: [0,1,id], parameters: { cells: [0,1], box: [511,511] }, scope: [],
      conclusion: { kind: "table", cells: [0,1], count: 72, definition: id+1 } },
  ];
  const proposal = { technique: "untrusted-test@1", state: view.state.key, effects: [], pattern: {},
    proof: { state: view.state.key, nodes, imports: [0,1,scope.id], roots: [id,id+1] } };
  const result = [...verifyCertificate(proposal, { view, retained, limits, policy: "unconditional", uniqueEvidenceId: null })].at(-1);
  expect(result).toMatchObject({ kind: "verified", certificate: { consequences: [
    { rules: scope.rules, openAssumptions: [], conditional: false }, { rules: scope.rules }] } });
});

test.each<Proposition>([
  { kind: "all-different", cells: [0,80] }, { kind: "all-different", cells: [0,0] },
  { kind: "all-different", cells: [1,0] }, { kind: "all-different", cells: [] },
  { kind: "cover", cells: [0,1], symbol: 1 },
])("all-different subset rejects invalid scope or invented existence: %j", conclusion => {
  const view = classic(), retained = retainedProof(view);
  const source = [...view.facts.values()].find(f => f.proposition.kind === "all-different" &&
    f.proposition.cells.includes(0) && f.proposition.cells.includes(1))!;
  const node = { id: retained.size, rule: "all-different-subset@1", premises: [source.id], conclusion, parameters: {}, scope: [] };
  const proposal = { technique: "untrusted-test@1", state: view.state.key, effects: [], pattern: {},
    proof: { state: view.state.key, nodes: [node], imports: [source.id], roots: [node.id] } };
  expect([...verifyCertificate(proposal, { view, retained, limits, policy: "unconditional", uniqueEvidenceId: null })].at(-1))
    .toMatchObject({ kind: "rejected", code: "invalid-all-different-subset" });
});
