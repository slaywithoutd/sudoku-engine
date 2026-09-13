import type { Json } from "../../../src/solver/problem";
import { createHash } from "node:crypto";
import { oracle } from "../../solver/oracle";
import { expect,test } from "vitest";
import { shortFixtures,findShort,independentShortCertificate } from "../../solver/short-pattern-acceptance";
import { fixtureView,assertSound } from "../../solver/acceptance";
import { originalCluePrefix } from "../../solver/acceptance";
import { allShortFixtures } from "../../solver/short-pattern-acceptance";
import { checkProposal } from "../../../src/solver/proof/checker";
import { retainedProof } from "../../../src/solver/state/candidates";
import { initialize,commitChecked } from "../../../src/solver/state/candidates";
import { canonicalProblem } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { mockRuleRegistry } from "../../solver/mock-rules";
import { getTechniques } from "../../../src/solver/techniques/registry";
import { discoveryContext } from "../../solver/discovery-context";
import { replay } from "../../../src/solver/proof/replay";
import { checkPatternProof,validateShortPattern,validateWingPattern,validateBentPattern,validateRemotePattern } from "../../../src/solver/techniques/pattern-contracts";
import type { ProofNode } from "../../../src/solver/proof/types";
test.each(shortFixtures.filter(f=>["C11","C12"].includes(f.rowId)))("$id has independent named evidence and productive discovery", f=>{
  const view=fixtureView(f);expect(()=>assertSound(view,independentShortCertificate(f))).not.toThrow();
  const found=findShort(f);expect(found.proposal.effects).toEqual(expect.arrayContaining(f.expectedEffects));
  expect(()=>assertSound(view,found.proposal)).not.toThrow();
},30000);
test.each(allShortFixtures.filter(f=>f.expectation!=="productive"))("$id independently rejects invalid named geometry",f=>{
  const view=fixtureView(f);
  const validators={C10:validateShortPattern,C11:validateWingPattern,C12:validateBentPattern,C13:validateRemotePattern};
  expect(()=>validators[f.rowId as keyof typeof validators](view,f.expectedPattern as never,f.expectedEffects)).toThrow();
});
test.each(shortFixtures)("$id enforces its named alias and exact tuple/path boundary",f=>{
  const view=fixtureView(f),validators={C10:validateShortPattern,C11:validateWingPattern,C12:validateBentPattern,C13:validateRemotePattern};
  const validate=(p:Json)=>validators[f.rowId as keyof typeof validators](view,p as never,f.expectedEffects);
  expect(()=>validate(f.expectedPattern)).not.toThrow();
  const p=structuredClone(f.expectedPattern) as Record<string,any>;
  expect(()=>validate({...p,alias:"invented alias"})).toThrow();
  if(f.rowId==="C10")p.paths.push(structuredClone(p.paths[0]));
  if(f.rowId==="C11") {if(p.alias==="W-Wing")p.endpoints.push(p.endpoints[0]);else p.wings.push(p.pivot);}
  if(f.rowId==="C12")while(p.cells.length<7)p.cells.push(80);
  if(f.rowId==="C13") {p.cells.push(p.cells[0]);p.inferenceLinks=2*p.cells.length-1;}
  expect(()=>validate(p)).toThrow();
});
test.each(shortFixtures)("$id rejects primitive mutations and replays the original clue prefix",f=>{
  const view=fixtureView(f),proposal=independentShortCertificate(f),limits=discoveryContext().limits;
  const check=(p:typeof proposal)=>[...checkProposal(p,{view,retained:retainedProof(view),limits,policy:"discharged",uniqueEvidenceId:null})].at(-1);
  const badRule={...proposal,proof:{...proposal.proof,nodes:proposal.proof.nodes.map((n,i)=>i?n:{...n,rule:"invented@1"})}};
  expect(check(badRule)?.kind).toBe("rejected");
  const badPremise={...proposal,proof:{...proposal.proof,nodes:proposal.proof.nodes.map((n,i)=>i?n:{...n,premises:[]})}};
  expect(check(badPremise)?.kind).toBe("rejected");
  const badPattern={...proposal,pattern:{...proposal.pattern as object,unexplained:true}};
  expect(check(badPattern)?.kind).toBe("rejected");
  const snapshot={snapshotId:"independent-prefix",inputRevision:0,problem:view.assembly.problem,source:{kind:"manual" as const}};
  const events=[...replay(snapshot,[...originalCluePrefix(f),proposal],view.assembly,limits)];
  expect(events.at(-1)?.kind).toBe("checked");
  expect(events.filter(e=>e.kind==="checked")).toHaveLength(originalCluePrefix(f).length+1);
},30000);
test("all original clue prestates independently recompute every domain without using production indexes",()=>{
  for(const f of shortFixtures) for(let cell=0;cell<81;cell++) {
    const given=Number(f.givens[cell]);let mask=0;
    for(let s=1;s<=9;s++)if(given?given===s:![...f.givens].some((digit,peer)=>Number(digit)===s&&peer!==cell&&
      (Math.floor(peer/9)===Math.floor(cell/9)||peer%9===cell%9||Math.floor(peer/27)*3+Math.floor(peer%9/3)===Math.floor(cell/27)*3+Math.floor(cell%9/3))))mask+=2**(s-1);
    expect(f.preState.domains[cell],`${f.id}:${cell}`).toBe(mask);expect(f.preState.values[cell]).toBe(given);
  }
});
test("durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently",()=>{
  let counterfactuals=0;
  for(const f of shortFixtures) {
    const input={givens:[...f.givens].map(Number),domains:f.preState.domains,limit:1 as const,maxNodes:500000};
    const record=(f as unknown as {oracleRecord:{inputHash:string}}).oracleRecord;
    expect(createHash("sha256").update(JSON.stringify(input)).digest("hex"),f.id).toBe(record.inputHash);
    expect(oracle(input)).toMatchObject({interrupted:false,witnesses:expect.any(Array)});
    expect(oracle(input).witnesses).toHaveLength(1);
    for(const e of f.expectedEffects) {
      const force=oracle({...input,force:[e.cell,e.symbol]});expect(force,f.id).toMatchObject({interrupted:false,exhausted:true,witnesses:[]});
      const forbid=oracle({...input,forbid:[e.cell,e.symbol]});expect(forbid.interrupted).toBe(false);expect(forbid.witnesses).toHaveLength(1);counterfactuals++;
    }
  }
  expect(counterfactuals).toBe(41);
});
test("named XY-Wing consumes a relation conflict through unconditional domain filters and clause projection",()=>{
  const result=assemble(canonicalProblem({schema:1,cells:[0,1,2,3,4,5,6],symbols:[1,2,3],givens:[0,0,0,0,3,2,1],constraints:[
    ...[[0,4],[1,5],[2,6],[0,2],[1,3],[2,3]].map((cells,i)=>({id:`scope:${i}`,type:"all-different@1",cells,parameters:{}})),
    {id:"relation",type:"order@1",cells:[0,1],parameters:{}}]}),mockRuleRegistry);
  if(!result.ok)throw Error("fixture");let view=initialize(result.value,"primary");
  for(const rule of view.assembly.problem.constraints)for(const event of view.assembly.modules.get(rule.id)!.propagate(view,rule))
    if(event.kind==="proposal")view=commitChecked(view,assertSound(view,event.proposal)).view;
  const descriptor=getTechniques("classic-expanded@1").find(d=>d.id==="c11@1")!,context=discoveryContext();
  const event=[...descriptor.discover(view,context)].find(e=>e.kind==="proposal"&&
    JSON.stringify(e.proposal.pattern)===JSON.stringify({alias:"XY-Wing",pivot:0,wings:[1,2],x:1,y:2,z:3}));
  expect(event?.kind).toBe("proposal");if(event?.kind!=="proposal")throw Error("no-wing");
  expect(event.proposal.proof.nodes.some(n=>n.rule==="table-project@1")).toBe(true);
  expect(event.proposal.proof.nodes.some(n=>n.rule==="assume@1")).toBe(false);
  const terminal=[...checkProposal(event.proposal,{view,retained:retainedProof(view),limits:context.limits,policy:"unconditional",uniqueEvidenceId:null})].at(-1);
  expect(terminal?.kind).toBe("checked");
  expect(assertSound(view,event.proposal).consequences.some(c=>c.rules.includes("relation"))).toBe(true);
  expect(context.workspace.usage).toEqual({entries:0,bytes:0});
});

test("both Dual Empty Rectangle roots and every C12 table boundary remain necessary",()=>{
  const dual=shortFixtures.find(f=>f.id==="C10-dual-er")!,view=fixtureView(dual),proposal=independentShortCertificate(dual),limits=discoveryContext().limits;
  const check=(p:typeof proposal)=>[...checkProposal(p,{view,retained:retainedProof(view),limits,policy:"discharged",uniqueEvidenceId:null})].at(-1);
  const pattern=proposal.pattern as {alias:string;paths:Json[]};
  for(const index of [0,1])expect(check({...proposal,pattern:{...pattern,paths:pattern.paths.filter((_,i)=>i!==index)}})?.kind).toBe("rejected");
  for(const node of proposal.proof.nodes.filter(n=>n.rule==="support@1"))
    expect(check({...proposal,proof:{...proposal.proof,nodes:proposal.proof.nodes.map(n=>n.id===node.id?{...n,premises:n.premises.slice(0,-1)}:n)}})?.kind).toBe("rejected");
  for(const f of shortFixtures.filter(f=>f.rowId==="C12")) {
    const localView=fixtureView(f),p=independentShortCertificate(f),base={view:localView,retained:retainedProof(localView),limits,policy:"discharged" as const,uniqueEvidenceId:null};
    for(const filter of p.proof.nodes.filter(n=>n.rule==="table-filter@1")) {
      const params=filter.parameters as {cells:number[];box:number[]};
      const foreign={...p,proof:{...p.proof,nodes:p.proof.nodes.map(n=>n.id===filter.id?{...n,parameters:{...params,cells:[80,...params.cells.slice(1)]}}:n)}};
      expect([...checkProposal(foreign,base)].at(-1)?.kind).toBe("rejected");
      const partial={...p,proof:{...p.proof,nodes:p.proof.nodes.map(n=>n.id===filter.id?{...n,premises:n.premises.slice(1)}:n)}};
      expect([...checkProposal(partial,base)].at(-1)?.kind).toBe("rejected");
    }
  }
});
test("named C12 requires nonempty survivors and cannot invent an unrestricted symbol by omitting a conflict",()=>{
  const f=shortFixtures.find(f=>f.id==="C12-n4")!,view=fixtureView(f),p=f.expectedPattern as Record<string,any>;
  const table:ProofNode={id:9999,rule:"table-filter@1",premises:[],parameters:{},scope:[],conclusion:{kind:"table",cells:p.cells,count:0,definition:9999}};
  const projection:ProofNode={id:10000,rule:"table-project@1",premises:[9999],parameters:{},scope:[],conclusion:{kind:"clause",
    alternatives:p.occurrences[p.nonrestrictedSymbol].map((cell:number)=>({cell,symbol:p.nonrestrictedSymbol,positive:true}))}};
  expect(()=>checkPatternProof({technique:"c12@1",pattern:f.expectedPattern,effects:f.expectedEffects,state:view.state.key,
    proof:{state:view.state.key,nodes:[projection],imports:[],roots:[10000]}},view,new Map([[9999,table],[10000,projection]]))).toThrow("empty-local-pattern");
  const omitted={...p,conflicts:p.conflicts.slice(1)};
  expect(()=>validateBentPattern(view,omitted as never,f.expectedEffects)).toThrow();
});
