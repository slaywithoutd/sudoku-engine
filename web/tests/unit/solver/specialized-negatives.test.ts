import { expect, test } from "vitest";
import c29 from "../../solver/fixtures/C29.json";
import c30 from "../../solver/fixtures/C30.json";
import c31 from "../../solver/fixtures/C31.json";
import c32 from "../../solver/fixtures/C32.json";
import { independentSpecialized } from "../../solver/specialized-independent";
import { specializedState } from "../../solver/specialized-state";
import { discoveryContext } from "../../solver/discovery-context";
import { retainedProof } from "../../../src/solver/state/candidates";
import { verifyCertificate, checkProposal } from "../../../src/solver/proof/checker";
import { checkFireworksPattern } from "../../../src/solver/techniques/fireworks-grammar";
import { checkSkPattern } from "../../../src/solver/techniques/sk-grammar";
import { checkExocetPattern } from "../../../src/solver/techniques/exocet-grammar";
import { checkTridagonPattern } from "../../../src/solver/techniques/tridagon-grammar";
import { checkNetPattern } from "../../../src/solver/techniques/nets-grammar";
import { getTechniques } from "../../../src/solver/techniques/registry";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import coreSurvivor from "../../solver/fixtures/C32-negative.json";
import { independentDigits, independentPeer, independentProduct } from "../../solver/specialized-algebra";
import { compileTridagon } from "../../../src/solver/techniques/tridagon";
import { compileFireworks } from "../../../src/solver/techniques/fireworks";
import { compileSkLoop } from "../../../src/solver/techniques/sk-loops";
import { compileExocet } from "../../../src/solver/techniques/exocet";
import { specializedDescriptor } from "../../../src/solver/techniques/specialized-runtime";
import { oracle } from "../../solver/oracle";

const checks:any={C29:checkFireworksPattern,C30:checkSkPattern,C31:checkExocetPattern,C32:checkTridagonPattern};
const cases=[c29[1],c30[2],c31[3],c32[1]] as any[];
const cache=new Map<string,any>();
function subject(f:any) {
 if(!cache.has(f.id))cache.set(f.id,independentSpecialized(f));
 const proposal=structuredClone(cache.get(f.id)),{view}=specializedState(f);
 const nodes=new Map<number,any>([...retainedProof(view),...proposal.proof.nodes.map((n:any)=>[n.id,n] as const)]);
 const named=()=>checks[f.rowId](proposal,view,nodes);
 const context={view,retained:retainedProof(view),limits:{...discoveryContext().limits,timeMs:180000,workUnits:200000000},policy:"discharged" as const,uniqueEvidenceId:null};
 return {proposal,view,nodes,named,context,p:proposal.pattern};
}

test.each(cases)("$id rejects unsupported aliases and bound overflow independently of primitive validity",f=> {
 const b=subject(f);b.p.alias="unsupported wider special pattern";expect(()=>b.named()).toThrow();
 const a=subject(f);if(f.rowId==="C29")a.p.selected.push(80);if(f.rowId==="C30")a.p.linkMultiplicity=17;
 if(f.rowId==="C31")a.p.components.push(a.p.components[0]);if(f.rowId==="C32")a.p.guardians.push({cell:80,symbol:9});
 expect(()=>a.named()).toThrow();
});

test.each(cases)("$id rejects a valid supplied effect root mixed with a primitive-valid substituted root",f=> {
 const b=subject(f),original=b.proposal.proof.roots.find((id:number)=>b.nodes.get(id)!.conclusion.kind==="literal"||b.nodes.get(id)!.conclusion.kind==="clause")!,claim=b.nodes.get(original)!.conclusion;
 let id=Math.max(...b.nodes.keys())+1;
 const wrapper={id:id++,rule:"conjunction@1",scope:[],premises:[original],parameters:{},conclusion:{kind:"and",terms:[claim]}};
 const substitute={id:id++,rule:"conjunction@1",scope:[],premises:[wrapper.id],parameters:{index:0},conclusion:claim};
 b.proposal.proof.nodes.push(wrapper,substitute);b.proposal.proof.roots.push(substitute.id);b.nodes.set(wrapper.id,wrapper as any);b.nodes.set(substitute.id,substitute as any);
 expect([...verifyCertificate(b.proposal,b.context)].at(-1)?.kind).toBe("verified");
 expect(()=>b.named()).toThrow();
 expect([...checkProposal(b.proposal,b.context)].at(-1)?.kind).toBe("rejected");
},200000);

test("quad and Double reject reused independent component certificates",()=> {
 for(const f of [c29[1],c31[3]]){const b=subject(f);b.p.certificate.components[1]=b.p.certificate.components[0];expect(()=>b.named()).toThrow();}
});
test("Fireworks requires both complete directional covers and every outside support",()=> {
 const b=subject(c29[1]);b.p.certificate.components[0].covers[0].routes.pop();expect(()=>b.named()).toThrow();
 const a=subject(c29[0]);a.p.components[0].rowWing=4;expect(()=>a.named()).toThrow();
});
test("SK rejects a seven-group nonclosing ring and an incomplete local tuple source",()=> {
 const b=subject(c30[2]);b.p.certificate.table=b.p.certificate.joins[5];expect(()=>b.named()).toThrow();
 const a=subject(c30[2]),leaf=a.nodes.get(a.p.certificate.locals[0])!;leaf.parameters.box[0]=1;expect(()=>a.named()).toThrow();
});
test("Junior includes assigned S occurrences and complete companion evidence",()=> {
 const b=subject(c31[0]),cv=b.p.covers.find((c:any)=>c.assignedOccurrences.length);expect(cv).toBeDefined();
 cv.occurrences=cv.occurrences.filter((c:number)=>!cv.assignedOccurrences.includes(c));cv.assignedOccurrences=[];
 expect(()=>b.named()).toThrow("incomplete-junior-s-occurrences");
 const a=subject(c31[1]);a.p.companions[0]=a.p.targets[0];expect(()=>a.named()).toThrow();
});
test("Tridagon rejects omitted permutations, a fake parity rejection, and an incomplete guardian OR",()=> {
 const b=subject(c32[1]);b.p.certificate.permutations[0].pop();expect(()=>b.named()).toThrow();
 const a=subject(c32[1]);a.p.certificate.rejections[0]=[a.p.triples[0][0],a.p.triples[0][0]];expect(()=>a.named()).toThrow();
 const d=subject(c32[1]);d.p.guardians.pop();expect(()=>d.named()).toThrow();
});
test("C32-surviving-core-negative: a real complete core witness defeats the visual four-box pattern",()=> {
 const f=coreSurvivor,{view}=specializedState(f as any),p:any=structuredClone(f.expectedPattern),all=p.triples.flat(),witness=f.survivingCore.flat();
 expect(all.every((c:number,i:number)=>all.every((d:number,j:number)=>!independentPeer(c,d)||witness[i]!==witness[j]))).toBe(true);
 const permutations=p.triples.map((t:number[])=>[...independentProduct(t.map(c=>independentDigits(f.preState.domains[c]).filter(s=>p.coreSymbols.includes(s))))].filter(r=>new Set(r).size===3));
 const combinations=[...independentProduct(permutations.map((v:number[][])=>v.map((_,i)=>i)))];
 p.certificate={permutations,rejections:combinations.map(()=>[all[0],all[1]]),locals:[],joins:[],table:0,theorem:0};
 expect(()=>checkTridagonPattern({pattern:p} as any,view,retainedProof(view))).toThrow("surviving-tridagon-core-permutation");
 const cursor=compileTridagon(view,f.expectedPattern);let answer;while(true){const n=cursor.next();if(n.done){answer=n.value;break;}}expect(answer).toBeNull();
 const domains=[...f.preState.domains];for(const g of p.guardians)domains[g.cell]&=~(1<<(g.symbol-1));
 expect(oracle({givens:[...f.givens].map(Number),domains,limit:1,maxNodes:100000})).toMatchObject({interrupted:false,witnesses:[expect.any(Array)]});
});

test.each(cases)("$id discovery releases all owned workspace on cancellation, work, byte, and cursor interruption",f=> {
 const {view}=specializedState(f),descriptor=getTechniques("classic-expanded@1").find(d=>d.id===f.rowId.toLowerCase()+"@1")!;
 for(const mode of ["cancelled","work","bytes","close"]){let cancelled=false;
  const base=discoveryContext(),context={...base,limits:{...base.limits,workUnits:mode==="work"?1:base.limits.workUnits},workspace:new IndexWorkspace({entryLimit:1000000,byteLimit:mode==="bytes"?1:256000000,cancelled:()=>cancelled})};
  const cursor=descriptor.discover(view,context),first=cursor.next();
  if(mode==="cancelled")cancelled=true;
  if(mode==="close")cursor.return();else {const events=[first.value,...cursor];expect(events.at(-1)).toMatchObject({kind:"interrupted"});}
  expect(context.workspace.usage).toEqual({entries:0,bytes:0});
 }
});
test.each(cases)("$id proof admission rejects step and byte truncation without changing its original prestate",f=> {
 const b=subject(f),before=[...b.view.state.domains];
 for(const limits of [{...b.context.limits,stepNodes:1},{...b.context.limits,stepBytes:1},{...b.context.limits,workspaceBytes:1},{...b.context.limits,workUnits:1}])
  expect([...checkProposal(b.proposal,{...b.context,limits})].at(-1)?.kind).toBe("rejected");
 expect([...b.view.state.domains]).toEqual(before);
});
test.each(cases)("$id compilation releases the live row/node lease at mid-build byte, work, cancellation, and time boundaries",f=> {
 const compilers:any={C29:compileFireworks,C30:compileSkLoop,C31:compileExocet,C32:compileTridagon},{view}=specializedState(f);
 const descriptor=specializedDescriptor(f.rowId,{*plans(){yield {kind:"plan",plan:f.expectedPattern};},compile:compilers[f.rowId]},[0,0,9,81,4]);
 for(const mode of ["bytes","work","cancelled","time"]) {
  let cancelled=false;const base=discoveryContext(),context={...base,limits:{...base.limits,workUnits:mode==="work"?50:10000000,timeMs:mode==="time"?0:20000},workspace:new IndexWorkspace({entryLimit:1000000,byteLimit:mode==="bytes"?2070000:256000000,cancelled:()=>cancelled})};
  const cursor=descriptor.discover(view,context);let ending;
  for(const e of cursor){if(e.kind==="work"&&mode==="cancelled")cancelled=true;ending=e;}
  expect(ending).toMatchObject({kind:"interrupted"});expect(context.workspace.usage).toEqual({entries:0,bytes:0});
 }
});

test.each(["table-join-filter@1","cover-count-clause@1"])("T14 explicitly excludes %s from its local named grammar",rule=> {
 const {view}=specializedState(c29[0] as any),base=Math.max(...view.facts.keys())+1;
 const assumption={id:base,scope:[],rule:"assume@1",premises:[],parameters:{},conclusion:{kind:"literal",value:{cell:0,symbol:1,positive:true}}};
 const result={id:base+1,scope:[base],rule:"contradiction@1",premises:[base],parameters:{},conclusion:{kind:"false"}};
 const unsupported={id:base+2,scope:[],rule,premises:[],parameters:{},conclusion:{kind:"false"}};
 const proposal:any={pattern:{kind:"net",mode:"static",alias:"Static forcing nets",branch:{assumption:base,result:base+1,children:[],cover:null}},proof:{nodes:[assumption,result,unsupported]}};
 expect(()=>checkNetPattern(proposal,view,new Map(proposal.proof.nodes.map((n:any)=>[n.id,n])))).toThrow("net-primitive-out-of-profile");
});
