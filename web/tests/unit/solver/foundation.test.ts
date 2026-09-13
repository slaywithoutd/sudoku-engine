import { discoveryContext } from "../../solver/discovery-context";
import { expect, test } from "vitest";
import { normalizeClassic } from "../../../src/solver/problem";
import { AllDifferentRule } from "../../../src/solver/rules/all-different";
import { assemble } from "../../../src/solver/rules/assemble";
import { initialize } from "../../../src/solver/state/candidates";
import { commitChecked } from "../../../src/solver/state/candidates";
import { assertSound, discoverFixture, foundationFixtures, fixtureCertificate, checkFixtureMutation, fixtureCase, fixtureView, fixturePrefix } from "../../solver/acceptance";
import { replay } from "../../../src/solver/proof/replay";
import { makeSnapshot } from "../../../src/solver/snapshot";
import { canonicalProblem } from "../../../src/solver/problem";
import { checkProposal, verifyCertificate, isCheckedStep } from "../../../src/solver/proof/checker";
import { retainedProof, retainCheckedFacts } from "../../../src/solver/state/candidates";
import { getTechniques } from "../../../src/solver/techniques/registry";
import { SOLUTION } from "../../fixtures";

test.each(foundationFixtures.filter(f => f.expectation === "productive"))("independently discovers $id with its exact named geometry and effects", fixture => {
  const { view, proposal } = discoverFixture(fixture.id);
  expect(proposal.effects).toEqual(fixture.expectedEffects);
  assertSound(view, proposal);
  assertSound(view, fixtureCertificate(fixture.id));
});
const aliasFixtures=[...new Map(foundationFixtures.filter(f=>f.expectation==="productive").map(f=>[`${f.rowId}:${f.alias}`,f.id])).values()];
test.each(aliasFixtures)("rejects independently certified %s mutations", id => {
  for (const mutation of ["wrong-alias","missing-node","invented-effect","undischarged","missing-import","wrong-domain","outside-bound"] as const)
    expect(checkFixtureMutation(id,mutation)?.kind,mutation).toBe("rejected");
});
test.each(aliasFixtures)("replays the original-clue prefix and independently authored %s certificate", id => {
  const view=fixtureView(fixtureCase(id)), proposals=[...fixturePrefix(id),fixtureCertificate(id)];
  const limits={timeMs:20000,workUnits:1000000,exactNodes:1000000,stepNodes:4096,runNodes:65536,proofBytes:8000000,stepBytes:2000000,batchBytes:65536,inFlightBatches:2,workspaceBytes:64000000};
  const events=[...replay(makeSnapshot(view.assembly.problem,{kind:"manual"},id,0),proposals,view.assembly,limits)];
  expect(events.filter(e=>e.kind==="checked")).toHaveLength(proposals.length);
  expect(events.at(-1)?.kind).toBe("checked");
});
test.each(foundationFixtures.filter(f => f.expectation !== "productive"))("rejects independently authored $id without substituting another pattern", fixture => {
  const result = discoverFixture(fixture.id);
  expect(result.proposals).toEqual([]);
  expect(result.status).toBe(fixture.expectation);
});

test("covers every cell and all 27 houses × nine symbols through original-clue single prefixes", () => {
  const covers = new Set<string>(), descriptors = getTechniques("classic-expanded@1");
  for (let cell=0;cell<81;cell++) {
    const f = fixtureCase("C01-one-hole"), values = [...SOLUTION].map(Number), symbol = values[cell]; values[cell]=0;
    f.givens=values.join(""); f.preState={values,domains:[...SOLUTION].map(d => 2**(Number(d)-1))};
    const view=fixtureView(f);
    const naked=[...descriptors[0].discover(view, discoveryContext())].flatMap(e => e.kind === "proposal" ? [e.proposal] : []);
    for (const alias of ["Naked Single","Full House","Last Digit"]) {
      const proposal=naked.find(p => (p.pattern as {alias:string}).alias===alias)!;
      expect(proposal.effects).toEqual([{kind:"place",cell,symbol}]); assertSound(view,proposal);
    }
    const hidden=[...descriptors[1].discover(view, discoveryContext())].flatMap(e => e.kind === "proposal" ? [e.proposal] : []);
    expect(hidden).toHaveLength(3);
    for (const proposal of hidden) { covers.add((proposal.pattern as {cover:string}).cover); assertSound(view,proposal); }
  }
  expect(covers.size).toBe(243);
}, 30000);

test.each(["Locked Candidates","direct forms"])("independently checks the %s alias without automatically placing a direct consequence", alias => {
  const f=fixtureCase("C03-point-row"), view=fixtureView(f);
  const events=[...getTechniques("classic-expanded@1")[2].discover(view, discoveryContext())];
  const proposal=events.flatMap(e => e.kind === "proposal" ? [e.proposal] : []).find(p =>
    JSON.stringify(p.pattern) === JSON.stringify({...f.expectedPattern as object,alias}))!;
  expect(proposal.effects).toEqual(f.expectedEffects); expect(proposal.effects.every(e=>e.kind==="remove")).toBe(true); assertSound(view,proposal);
});

test("small all-different scopes cannot produce Hidden Single covers", () => {
  const result=assemble(canonicalProblem({schema:1,cells:[0,1,2],symbols:[1,2,3,4,5,6,7,8,9],givens:[1,2,0],
    constraints:[{id:"small-cage",type:"all-different@1",cells:[0,1,2],parameters:{}}]}),[new AllDifferentRule()]);
  if(!result.ok)throw Error("fixture");
  const view=initialize(result.value,"primary");
  expect(view.assembly.covers).toEqual([]);
  expect([...getTechniques("classic-expanded@1")[1].discover(view, discoveryContext())].filter(e=>e.kind==="proposal")).toEqual([]);
});
test.each(["record", "getter", "proxy"])("a forged candidate view (%s) cannot promote a naked single to a false Full House", kind => {
  const result=assemble(canonicalProblem({schema:1,cells:[0,1,2,3],symbols:[1,2],givens:[1,0,0,2],
    constraints:[0,1,2].map(i=>({id:`edge:${i}`,type:"all-different@1",cells:[i,i+1],parameters:{}}))}),[new AllDifferentRule()]);
  if(!result.ok)throw Error("fixture");
  let view=initialize(result.value,"primary");
  for(const rule of view.assembly.problem.constraints) for(const e of [...view.assembly.modules.get(rule.id)!.propagate(view,rule)])
    if(e.kind==="proposal") view=commitChecked(view,assertSound(view,e.proposal)).view;
  const event=[...getTechniques("classic-expanded@1")[0].discover(view, discoveryContext())].find(e=>e.kind==="proposal" &&
    (e.proposal.pattern as {cell:number;alias:string}).cell===1 && (e.proposal.pattern as {alias:string}).alias==="Naked Single");
  if(event?.kind!=="proposal")throw Error("single");
  const forged={...event.proposal,pattern:{kind:"single",alias:"Full House",cell:1,symbol:2,house:"edge:1"}};
  const spoof=() => {
    const altered={...view.state,values:[1,0,1,2]};
    let reads=0;
    const state=()=>++reads===1?view.state:altered;
    if(kind==="getter") return {...view,get state(){return state();}};
    if(kind==="proxy") return new Proxy({...view},{get(target,key,receiver){return key==="state"?state():Reflect.get(target,key,receiver);}});
    return {...view,state:altered};
  };
  const limits={timeMs:20000,workUnits:1000000,exactNodes:1000000,stepNodes:4096,runNodes:65536,proofBytes:8000000,stepBytes:2000000,batchBytes:65536,inFlightBatches:2,workspaceBytes:64000000};
  const checked=[...checkProposal(forged,{view:spoof(),retained:retainedProof(view),policy:"unconditional",uniqueEvidenceId:null,limits})].at(-1);
  expect(checked?.kind).toBe("rejected");
  const cache={...forged,effects:[],proof:{...forged.proof,nodes:forged.proof.nodes.slice(0,1),roots:[forged.proof.nodes[0].id]}};
  expect([...checkProposal(cache,{view:spoof(),retained:retainedProof(view),policy:"unconditional",uniqueEvidenceId:null,limits})].at(-1))
    .toMatchObject({kind:"rejected",code:"inauthentic-candidate-view"});
});

test("C01 cache retains one bounded fact without revision churn and rejects duplicate work", () => {
  const view=fixtureView(fixtureCase("C01-one-hole")), full=fixtureCertificate("C01-one-hole");
  const proposal={...full,effects:[],proof:{...full.proof,nodes:full.proof.nodes.slice(0,1),roots:[full.proof.nodes[0].id]}};
  const limits={timeMs:20000,workUnits:1000000,exactNodes:1000000,stepNodes:4096,runNodes:65536,proofBytes:8000000,stepBytes:2000000,batchBytes:65536,inFlightBatches:2,workspaceBytes:64000000};
  const context={view,retained:retainedProof(view),policy:"unconditional" as const,uniqueEvidenceId:null,limits};
  const event=[...checkProposal(proposal,context)].at(-1); expect(event?.kind).toBe("checked");
  if(event?.kind!=="checked")return;
  const next=retainCheckedFacts(view,event.step);
  expect(next.state.key.revision).toBe(view.state.key.revision); expect(next.state.domains).toEqual(view.state.domains);
  expect(retainedProof(next).size).toBe(retainedProof(view).size+1);
  expect(()=>commitChecked(view,event.step)).toThrow("unproductive");
  const repeated={...proposal,proof:{...proposal.proof,nodes:proposal.proof.nodes.map(n=>({...n,id:n.id+1})),roots:proposal.proof.roots.map(n=>n+1)}};
  expect([...checkProposal(repeated,{...context,view:next,retained:retainedProof(next)})].at(-1)).toMatchObject({kind:"rejected",code:"invalid-single-cache"});
  const generic={...proposal,technique:"rule-propagation@1",pattern:{kind:"roots"}};
  const certificate=[...verifyCertificate(generic,context)].at(-1);
  expect(certificate?.kind).toBe("verified");
  if(certificate?.kind==="verified") expect(isCheckedStep(certificate.certificate)).toBe(false);
  expect([...checkProposal(generic,{...context,admission:"certificate"} as typeof context)].at(-1)?.kind).toBe("rejected");
});

test("mandatory all-different maintenance proposes checked peer exclusions before named discovery", () => {
  const givens = Array(81).fill(0); givens[0] = 1;
  const assembly = assemble(normalizeClassic({ kind: "classic", version: 1, width: 9, height: 9, givens }), [new AllDifferentRule()]);
  if (!assembly.ok) throw Error("invalid fixture");
  const view = initialize(assembly.value, "primary");
  const rule = view.assembly.problem.constraints.find(r => r.id === "row:0")!;
  const events = [...view.assembly.modules.get(rule.id)!.propagate(view, rule)];
  expect(events.some(event => String(event.kind) === "proposal")).toBe(true);
});

test("C01 independently checks the one-hole placement after checked maintenance", () => {
  const givens = [...SOLUTION].map(Number); givens[0] = 0;
  const assembly = assemble(normalizeClassic({ kind: "classic", version: 1, width: 9, height: 9, givens }), [new AllDifferentRule()]);
  if (!assembly.ok) throw Error("invalid fixture");
  let view = initialize(assembly.value, "primary");
  for (const rule of view.assembly.problem.constraints) {
    while (true) {
      const event = [...view.assembly.modules.get(rule.id)!.propagate(view, rule)].find(e => e.kind === "proposal");
      if (!event || event.kind !== "proposal") break;
      view = commitChecked(view, assertSound(view, event.proposal)).view;
    }
  }
  const technique = getTechniques("classic-expanded@1").find(t => t.id === "c01@1")!;
  const event = [...technique.discover(view, discoveryContext())].find(e => e.kind === "proposal");
  expect(event?.kind).toBe("proposal");
  if (event?.kind !== "proposal") return;
  expect(event.proposal.effects).toEqual([{ kind: "place", cell: 0, symbol: 5 }]);
  assertSound(view, event.proposal);
});
