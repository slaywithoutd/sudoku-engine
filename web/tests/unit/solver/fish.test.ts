import { expect,test } from "vitest";
import { allFishFixtures,fishFixture,fishFixtures,independentFish } from "../../solver/fish-acceptance";
import { fixtureView } from "../../solver/acceptance";
import { retainedProof } from "../../../src/solver/state/candidates";
import { checkProposal,verifyCertificate } from "../../../src/solver/proof/checker";
import { discoveryContext } from "../../solver/discovery-context";
import { getTechniques } from "../../../src/solver/techniques/registry";
import type { DeductionProposal,ProofNode } from "../../../src/solver/proof/types";
import { validateFishPattern } from "../../../src/solver/techniques/fish-grammar";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import { domainAssertion } from "../../../src/solver/proof/primitives";
import { canonicalProblem } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { AllDifferentRule } from "../../../src/solver/rules/all-different";
import { FishCursorSet } from "../../../src/solver/techniques/fish";
import { initialize,commitChecked } from "../../../src/solver/state/candidates";

test.each([5,6,7])("D076 original basic size %s fits fixed 64-arity with only negative evidence",size=>{
 const f=fishFixture(`C06-size-${size}-row`),view=fixtureView(f),proposal=independentFish(f);
 expect(proposal.proof.nodes.find(n=>n.rule==="cover-count@1")!.premises.length).toBe(({5:30,6:30,7:28} as Record<number,number>)[size]);
 expect([...verifyCertificate(proposal,{view,retained:retainedProof(view),policy:"unconditional",uniqueEvidenceId:null,limits:discoveryContext().limits})].at(-1)).toMatchObject({kind:"verified"});
});
test("fish descriptor is implemented",()=>{
 const view=fixtureView(fishFixture("C06-size-2-row"));
 expect(getTechniques("classic-expanded@1").find(t=>t.id==="c06@1")!.eligible(view)).toEqual({kind:"yes"});
});
test("discovers the original named X-Wing with owned resource cleanup",()=>{
 const f=fishFixture("C06-size-2-row"),view=fixtureView(f),context=discoveryContext();let found=false;
 for(const event of getTechniques("classic-expanded@1").find(t=>t.id==="c06@1")!.discover(view,context))
  if(event.kind==="proposal"&&JSON.stringify(event.proposal.pattern)===JSON.stringify(f.expectedPattern)) {found=true;break;}
 expect(found).toBe(true);expect(context.workspace.usage).toEqual({entries:0,bytes:0});
});
test.each(fishFixtures)("$id requires the independently authored named certificate",f=>{
 const view=fixtureView(f),proposal=independentFish(f),context={view,retained:retainedProof(view),policy:f.rowId==="C06"?"unconditional" as const:"discharged" as const,uniqueEvidenceId:null,limits:discoveryContext().limits};
 expect([...verifyCertificate(proposal,context)].at(-1)).toMatchObject({kind:"verified"});
 expect([...checkProposal(proposal,context)].at(-1)).toMatchObject({kind:"checked"});
 expect(Math.max(...proposal.proof.nodes.map(n=>n.premises.length))).toBeLessThanOrEqual(64);
});
test.each(allFishFixtures.filter(f=>f.expectation!=="productive"))("$id independently rejects the documented negative/profile shape",f=>{
 expect(()=>validateFishPattern(fixtureView(f),f.expectedPattern as never,f.rowId.toLowerCase()+"@1",f.expectedEffects)).toThrow();
});
function verify(f:ReturnType<typeof fishFixture>,proposal:DeductionProposal,named=false) {
 const view=fixtureView(f),context={view,retained:retainedProof(view),policy:"discharged" as const,uniqueEvidenceId:null,limits:discoveryContext().limits};
 return [...(named?checkProposal(proposal,context):verifyCertificate(proposal,context))].at(-1);
}
function replaceCount(f:ReturnType<typeof fishFixture>,mutate:(node:ProofNode,view:ReturnType<typeof fixtureView>)=>ProofNode):DeductionProposal {
 const view=fixtureView(f),p=independentFish(f),nodes=p.proof.nodes.map(n=>n.rule==="cover-count@1"?mutate(n,view):n);
 const retained=retainedProof(view),imports=[...new Set(nodes.flatMap(n=>n.premises).filter(id=>retained.has(id)))].sort((a,b)=>a-b);
 return {...p,proof:{...p.proof,nodes,imports}};
}
test("D076 rejects missing negative evidence and an authenticated domain still containing the tested bit",()=>{
 const f=fishFixture("C06-size-7-row");
 expect(verify(f,replaceCount(f,n=>({...n,premises:n.premises.slice(0,-1)})))).toMatchObject({kind:"rejected",code:"uncovered-count-incidence"});
 const present=replaceCount(f,(n,view)=>{
  const cell=domainAssertion(view.facts.get(n.premises.at(-1)!)!.proposition)!.cell;
  const full=[...retainedProof(view).values()].find(f=>f.conclusion.kind==="domain"&&f.conclusion.cell===cell&&f.conclusion.mask===511)!;
  return {...n,premises:[...n.premises.slice(0,-1),full.id]};
 });
 expect(verify(f,present)).toMatchObject({kind:"rejected",code:"uncovered-count-incidence"});
});
test("D076 validates optional nonnegative domains and rejects duplicate, foreign and non-domain extras",()=>{
 const f=fishFixture("C06-size-2-row");
 const compatible=replaceCount(f,(n,v)=>({...n,premises:[...n.premises,v.state.domainFacts[14]]}));
 expect(verify(f,compatible)).toMatchObject({kind:"verified"});
 for(const extra of ["duplicate-cell","outside","non-domain"] as const) {
  const bad=replaceCount(f,(n,v)=>{
   const original=domainAssertion(v.facts.get(n.premises.at(-1)!)!.proposition)!;
   const id=extra==="duplicate-cell"?[...retainedProof(v).values()].find(f=>f.conclusion.kind==="domain"&&f.conclusion.cell===original.cell&&f.conclusion.mask===511)!.id:
    extra==="outside"?v.state.domainFacts[80]:[...v.facts.values()].find(f=>f.proposition.kind==="rule")!.id;
   return {...n,premises:[...n.premises,id]};
  });
  expect(verify(f,bad),extra).toMatchObject({kind:"rejected",code:"invalid-count-domain-evidence"});
 }
});
test.each(fishFixtures)("$id rejects changed incidence, aliases, fins, size and complete-source premises",f=>{
 const view=fixtureView(f),proposal=independentFish(f),p=f.expectedPattern as any;
 const validate=(pattern:any)=>validateFishPattern(view,pattern,f.rowId.toLowerCase()+"@1",f.expectedEffects);
 expect(()=>validate({...p,alias:"invented fish"})).toThrow();
 if(p.components) {
  expect(()=>validate({...p,components:[p.components[0]]})).toThrow();
  expect(()=>validate({...p,components:[p.components[0],p.components[0]]})).toThrow();
 } else {
  expect(()=>validate({...p,size:["C06","C07"].includes(f.rowId)?8:5})).toThrow();
  expect(()=>validate({...p,fins:[...p.fins,80]})).toThrow();
  expect(()=>validate({...p,bases:[p.bases[0],p.bases[0],...p.bases.slice(2)]})).toThrow();
  if(p.incidence) {const incidence=[...p.incidence];incidence[incidence.findIndex(v=>v!==0)]=0;expect(()=>validate({...p,incidence})).toThrow();}
 }
 const count=proposal.proof.nodes.find(n=>n.rule==="cover-count@1")!;
 expect(verify(f,{...proposal,proof:{...proposal.proof,nodes:proposal.proof.nodes.map(n=>n===count?{...n,premises:n.premises.slice(1)}:n)}},true)?.kind).toBe("rejected");
});
test.each(["cancel","work","bytes","entries","proof"])("discovery reports %s interruption and releases every lease",mode=>{
 const view=fixtureView(fishFixture("C06-size-2-row")),context=discoveryContext();
 const options={entryLimit:mode==="entries"?0:1000000,byteLimit:mode==="bytes"?0:256000000,cancelled:()=>mode==="cancel"};
 const workspace=new IndexWorkspace(options);
 if(mode==="work")context.limits.workUnits=0;if(mode==="proof")context.limits.stepNodes=0;
 const events=[...getTechniques("classic-expanded@1").find(d=>d.id==="c06@1")!.discover(view,{...context,workspace})];
 expect(events.at(-1)?.kind).toBe("interrupted");expect(events.some(e=>e.kind==="exhausted")).toBe(false);
 expect(workspace.usage).toEqual({entries:0,bytes:0});
});
/** A different valid two-cell proof, assembled without any fish source/count. */
function singleSubstitute(f:ReturnType<typeof fishFixture>,target:number,source:number):DeductionProposal {
 const view=fixtureView(f),prefix=retainedProof(view),nodes:ProofNode[]=[];let next=Math.max(...prefix.keys())+1;
 const add=(rule:string,premises:number[],conclusion:ProofNode["conclusion"])=>{const id=next++;nodes.push({id,rule,premises,conclusion,parameters:{},scope:[]});return id;};
 const positive=add("cover-clause@1",[view.state.domainFacts[source]],{kind:"literal",value:{cell:source,symbol:1,positive:true}});
 const scope=[...view.facts.values()].find(f=>f.proposition.kind==="all-different"&&f.proposition.cells.includes(source)&&f.proposition.cells.includes(target))!.id;
 const weak=add("weak-link@1",[scope],{kind:"clause",alternatives:[source,target].sort((a,b)=>a-b).map(cell=>({cell,symbol:1,positive:false}))});
 const root=add("resolution@1",[positive,weak],{kind:"literal",value:{cell:target,symbol:1,positive:false}});
 const domain=add("domain-restrict@1",[view.state.domainFacts[target],root],{kind:"domain",cell:target,mask:view.state.domains[target]&~1});
 return {technique:f.rowId.toLowerCase()+"@1",pattern:f.expectedPattern,effects:[{kind:"remove",cell:target,symbol:1}],state:view.state.key,
  proof:{state:view.state.key,nodes,imports:[...new Set(nodes.flatMap(n=>n.premises).filter(id=>prefix.has(id)))].sort((a,b)=>a-b),roots:[root,domain]}};
}
function decorate(a:DeductionProposal,b:DeductionProposal):DeductionProposal {
 const offset=Math.max(...a.proof.nodes.map(n=>n.id))+1-Math.min(...b.proof.nodes.map(n=>n.id)),own=new Set(b.proof.nodes.map(n=>n.id));
 const id=(id:number)=>own.has(id)?id+offset:id;
 const negatives=b.proof.roots.filter(root=>b.proof.nodes.find(n=>n.id===root)?.conclusion.kind==="literal");
 const keep=b.proof.nodes.filter(n=>!b.proof.roots.includes(n.id)||n.conclusion.kind!=="domain");
 return {...a,proof:{...a.proof,nodes:[...a.proof.nodes,...keep.map(n=>({...n,id:id(n.id),premises:n.premises.map(id),scope:n.scope.map(id)}))],
  imports:[...new Set([...a.proof.imports,...b.proof.imports])].sort((a,b)=>a-b),roots:[...a.proof.roots,...negatives.map(id)]}};
}
test("a primitive-valid two-cell proof cannot substitute for the named Swordfish count",()=>{
 const f=fishFixture("C06-size-3-row"),substitute=singleSubstitute(f,11,56);
 expect(verify(f,substitute)).toMatchObject({kind:"verified"});
 expect(verify(f,substitute,true)).toMatchObject({kind:"rejected",code:"fish-missing-component-root"});
});
test.each([false,true])("Siamese rejects primitive-valid substitute roots even with genuine components: %s",genuine=>{
 const f=fishFixture("C09-siamese-4"),substitute=singleSubstitute(f,24,78),original=independentFish(f);
 let proposal=genuine?decorate(original,substitute):substitute;
 if(!genuine)proposal={...proposal,effects:substitute.effects};
 expect(verify(f,proposal)).toMatchObject({kind:"verified"});
 expect(verify(f,proposal,true)?.kind).toBe("rejected");
});
test("Siamese second component cannot be replaced with a repeated valid first component",()=>{
 const f=fishFixture("C09-siamese-4"),p=f.expectedPattern as any;
 // The first component proves the full union; repeating it still fails the
 // mandatory second independently named component (whose effects are smaller).
 const clone={...f,expectedPattern:{...p,components:[p.components[0],p.components[0]]}};
 const certificate={...independentFish(clone),pattern:f.expectedPattern};
 expect(verify(f,certificate)).toMatchObject({kind:"verified"});
 expect(verify(f,certificate,true)).toMatchObject({kind:"rejected",code:"fish-missing-component-root"});
});
test.each([false,true])("Siamese rejects primitive-valid pooled count roots with genuine decoration=%s",genuine=>{
 const f=fishFixture("C09-siamese-4"),pooled=independentFish(f,true);
 expect(verify(f,pooled)).toMatchObject({kind:"verified"});
 const proposal=genuine?decorate(independentFish(f),pooled):pooled;
 expect(verify(f,proposal)).toMatchObject({kind:"verified"});
 expect(verify(f,proposal,true)).toMatchObject({kind:"rejected"});
});
test("two active fish cursors share one workspace allowance and early return releases it",()=>{
 const view=fixtureView(fishFixture("C06-size-2-row")),context=discoveryContext(),workspace=new IndexWorkspace({entryLimit:10000,byteLimit:500000});
 const [basic,finned]=getTechniques("classic-expanded@1").filter(d=>["c06@1","c07@1"].includes(d.id));
 const first=basic.discover(view,{...context,workspace});expect(first.next().value).toMatchObject({kind:"work"});
 const second=finned.discover(view,{...context,workspace});expect(second.next().value).toEqual({kind:"interrupted",reason:"workspace-byte-limit"});
 second.return();expect(workspace.usage.bytes).toBeGreaterThan(0);first.return();expect(workspace.usage).toEqual({entries:0,bytes:0});
});
test.each(["c06@1","c07@1","c08@1","c09@1"])("%s closes size cursors when cancelled mid-enumeration",id=>{
 const view=fixtureView(fishFixture("C08-mutant-4")),context=discoveryContext();let cancelled=false,work=0;
 const workspace=new IndexWorkspace({entryLimit:1000000,byteLimit:256000000,cancelled:()=>cancelled});
 const cursor=getTechniques("classic-expanded@1").find(d=>d.id===id)!.discover(view,{...context,workspace});
 let terminal;
 for(const event of cursor) {if(event.kind==="work"&&++work>10000)cancelled=true;terminal=event;}
 expect(terminal).toEqual({kind:"interrupted",reason:"cancelled"});expect(workspace.usage).toEqual({entries:0,bytes:0});
});
function partialFishView(seedId:string,ids:string[]) {
 const seed=fishFixture(seedId);
 const result=assemble(canonicalProblem({schema:1,cells:Array.from({length:81},(_,i)=>i),symbols:[1,2,3,4,5,6,7,8,9],givens:[...seed.givens].map(Number),
  constraints:ids.map(id=>({id,type:"all-different@1",cells:Array.from({length:81},(_,c)=>c).filter(c=>id.startsWith("row")?Math.floor(c/9)===Number(id.slice(-1)):id.startsWith("column")?c%9===Number(id.slice(-1)):Math.floor(c/27)*3+Math.floor(c%9/3)===Number(id.slice(-1))),parameters:{}}))}),[new AllDifferentRule()]);
 if(!result.ok)throw Error("partial-classic");let view=initialize(result.value,"primary");const context=discoveryContext();
 for(const rule of view.assembly.problem.constraints)for(const event of view.assembly.modules.get(rule.id)!.propagate(view,rule))if(event.kind==="proposal") {
  const checked=[...checkProposal(event.proposal,{view,retained:retainedProof(view),limits:context.limits,policy:"unconditional",uniqueEvidenceId:null})].at(-1);
  if(checked?.kind!=="checked")throw Error("partial-prefix");view=commitChecked(view,checked.step).view;
 }
 return {view,context};
}
test("Siamese discovery includes a pair crossing deferred shared-house partitions",()=>{
 const {view,context}=partialFishView("C06-size-2-row",["row:0","row:2","row:3","column:0","column:5","column:7"]);
 let found=false;
 for(const event of getTechniques("classic-expanded@1").find(t=>t.id==="c09@1")!.discover(view,context))if(event.kind==="proposal") {
  const p=event.proposal.pattern as any;
  if(p.alias!=="Siamese fish"||p.size!==3||p.symbol!==1)continue;
  const shared=p.components.map((c:any)=>c.bases.some((id:string)=>c.covers.includes(id)));
  if(shared[0]===shared[1])continue;
  expect([...checkProposal(event.proposal,{view,retained:retainedProof(view),limits:context.limits,policy:"discharged",uniqueEvidenceId:null})].at(-1)?.kind).toBe("checked");found=true;break;
 }
 expect(found).toBe(true);expect(context.workspace.usage).toEqual({entries:0,bytes:0});
},30000);
test("C09 gives ordinary and paired subfamilies deterministic service in a bounded prefix",()=>{
 const {view,context}=partialFishView("C09-cannibal-3",["row:0","row:4","row:5","box:4","box:5","column:3","column:7","column:8"]);
 context.limits.workUnits=25000;let ordinary=false,paired=false,work=0;
 for(const event of getTechniques("classic-expanded@1").find(d=>d.id==="c09@1")!.discover(view,context)) {if(event.kind==="work")work+=event.units;if(event.kind==="proposal") {
  const p=event.proposal.pattern as any;
  if(p.alias==="Cannibalistic fish"&&p.size===3&&p.symbol===1&&p.fins.length===1&&event.proposal.effects.some(e=>e.cell===52))ordinary=true;
  if(p.alias==="Siamese fish"&&p.symbol===1)paired=true;
  if(ordinary&&paired)break;
 }}
 expect(work).toBeLessThanOrEqual(25000);
 expect({ordinary,paired}).toEqual({ordinary:true,paired:true});expect(context.workspace.usage).toEqual({entries:0,bytes:0});
});
test("fair fish cursor service reaches ordinary work before a long Siamese stream and closes both",()=>{
 const closed:number[]=[];
 function* stream(id:number,length:number) {try {for(let i=0;i<length;i++)yield id;}finally {closed.push(id);}}
 const cursor=new FishCursorSet([stream(0,10000),stream(1,1)]).events();
 expect(cursor.next().value).toBe(0);expect(cursor.next().value).toBe(1);
 cursor.return();expect(closed.sort()).toEqual([0,1]);
});
test.each(["nonclassic","wrong-geometry","no-covers"])("authentic %s assemblies are explicitly excluded, never exhausted or dereferenced",kind=>{
 class CapacityOnly extends AllDifferentRule {
  override capabilities(...args:Parameters<AllDifferentRule["capabilities"]>) {return {...super.capabilities(...args),covers:[]};}
 }
 const scopes=kind==="no-covers"?[{id:"row:0",cells:[0,1,2,3,4,5,6,7,8]},{id:"row:1",cells:[9,10,11,12,13,14,15,16,17]}]:
  [{id:kind==="nonclassic"?"arbitrary":"row:0",cells:kind==="nonclassic"?[0,1,2,3,4,5,6,7,8]:[1,2,3,4,5,6,7,8,9]}];
 const result=assemble(canonicalProblem({schema:1,cells:Array.from({length:81},(_,i)=>i),symbols:[1,2,3,4,5,6,7,8,9],givens:Array(81).fill(0),
  constraints:scopes.map(h=>({...h,type:"all-different@1",parameters:{}}))}),[kind==="no-covers"?new CapacityOnly():new AllDifferentRule()]);
 if(!result.ok)throw Error("source-fixture");const view=initialize(result.value,"primary"),context=discoveryContext();
 for(const descriptor of getTechniques("classic-expanded@1").filter(d=>["c06@1","c07@1","c08@1","c09@1"].includes(d.id))) {
  expect(descriptor.eligible(view)).toEqual({kind:"excluded",reason:"missing-classic-capability",dependencies:[{kind:"all"}]});
  expect([...descriptor.discover(view,context)]).toEqual([{kind:"excluded",reason:"missing-classic-capability",dependencies:[{kind:"all"}]}]);
 }
 expect(context.workspace.usage).toEqual({entries:0,bytes:0});
});
test("open hypothetical source shapes do not establish eligibility; forged views remain errors",()=>{
 const {view,context}=partialFishView("C06-size-2-row",["row:0","row:3","column:5","column:7"]);
 const descriptor=getTechniques("classic-expanded@1").find(d=>d.id==="c06@1")!;
 expect(descriptor.eligible(view)).toEqual({kind:"yes"});
 // Eligibility is read-only prerequisite inspection, not admission authority.
 // Simulate an all-open source projection, then separately enforce owned-view
 // admission before the detector can dereference or import these fake facts.
 const projected={...view,facts:new Map([...view.facts].map(([id,f])=>[id,f.proposition.kind==="cover"?{...f,openAssumptions:[99999]}:f]))};
 expect(descriptor.eligible(projected).kind).toBe("excluded");
 expect(()=>descriptor.discover(projected,context).next()).toThrow();expect(context.workspace.usage).toEqual({entries:0,bytes:0});
});
test("a zero-incidence endo-fin still requires its named fin-false branch",()=>{
 const f=fishFixture("C09-endo-2"),p=f.expectedPattern as any;
 f.expectedPattern={...p,covers:["box:1","row:1"],incidence:[0,0,0,0,1,1,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,-1,0,0,0,0,0,0,0,0,-1,0,0,0,0,0,0,0,0,-1,0,0,0,0,0,0,0,0,-1,0,0,0,0,0,0,0,0,-1,0,0,0,0,0,0,0,0,-1,0,0,0,0,0]};
 f.expectedEffects=[4,5,13,14,22,23].map(cell=>({kind:"remove",cell,symbol:1}));
 const original=independentFish(f);expect(verify(f,original,true)?.kind).toBe("checked");
 const nodes=original.proof.nodes.map(n=>n.rule==="cover-count@1"?{...n,premises:n.premises.filter(id=>{
  const source=original.proof.nodes.find(n=>n.id===id)?.conclusion;return !(source?.kind==="domain"&&source.cell===12);
 })}:n);
 const own=new Map(nodes.map(n=>[n.id,n])),used=new Set<number>(),pending=[...original.proof.roots];
 while(pending.length) {const id=pending.pop()!;if(used.has(id))continue;used.add(id);const node=own.get(id);if(node)pending.push(...node.premises,...node.scope);}
 const substitute={...original,proof:{...original.proof,nodes:nodes.filter(n=>used.has(n.id)),imports:original.proof.imports.filter(id=>used.has(id))}};
 expect(verify(f,substitute)).toMatchObject({kind:"verified"});
 expect(verify(f,substitute,true)).toMatchObject({kind:"rejected",code:"fish-missing-component-root"});
});
