import { expect, test } from "vitest";
import { getTechniques } from "../../../src/solver/techniques/registry";
import { fixtureView } from "../../solver/acceptance";
import type { TechniqueFixture } from "../../solver/acceptance";
import c10 from "../../solver/fixtures/C10.json";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import { shortFixtures,findShort,independentShortCertificate,FixtureProof } from "../../solver/short-pattern-acceptance";
import { assertSound } from "../../solver/acceptance";
import { discoveryContext } from "../../solver/discovery-context";
import { verifyCertificate,checkProposal } from "../../../src/solver/proof/checker";
import { retainedProof } from "../../../src/solver/state/candidates";
import type { ShortPattern } from "../../../src/solver/techniques/pattern-contracts";

const limits = { timeMs:20000,workUnits:1000000,exactNodes:1000000,stepNodes:4096,runNodes:65536,
  proofBytes:8000000,stepBytes:2000000,batchBytes:65536,inFlightBatches:2,workspaceBytes:64000000 };
test.each(["c10@1","c11@1","c12@1","c13@1"])("%s is callable and reports a shared workspace interruption honestly", id => {
  const view=fixtureView(c10[0] as unknown as TechniqueFixture), descriptor=getTechniques("classic-expanded@1").find(d=>d.id===id)!;
  expect(descriptor.eligible(view)).toEqual({kind:"yes"});
  const workspace=new IndexWorkspace({entryLimit:1,byteLimit:1});
  const events=[...descriptor.discover(view,{workspace,limits})];
  expect(events.at(-1)).toEqual({kind:"interrupted",reason:"workspace-byte-limit"});
  expect(events.some(e=>e.kind==="exhausted")).toBe(false);
  expect(workspace.usage).toEqual({entries:0,bytes:0});
});
test.each(shortFixtures.filter(f=>["C10","C13"].includes(f.rowId)))("$id has independently compiled evidence and named discovery",f=>{
  const view=fixtureView(f);expect(()=>assertSound(view,independentShortCertificate(f))).not.toThrow();
  const found=findShort(f);expect(found.proposal.effects).toEqual(expect.arrayContaining(f.expectedEffects));
  expect(()=>assertSound(view,found.proposal)).not.toThrow();
},30000);
test.each(["C10","C11","C12","C13"])("%s closes shared graph and proposal leases on return, cancellation, and proof cap",rowId=>{
  const f=shortFixtures.find(f=>f.rowId===rowId)!,view=fixtureView(f),detector=getTechniques("classic-expanded@1").find(d=>d.id===rowId.toLowerCase()+"@1")!;
  const context=discoveryContext(),external=context.workspace.reserve(7,1000),before=context.workspace.usage;
  const cursor=detector.discover(view,context);let found=false;
  for(const event of cursor)if(event.kind==="proposal"){found=true;expect(context.workspace.usage.entries).toBeGreaterThan(before.entries);break;}
  expect(found).toBe(true);expect(context.workspace.usage).toEqual(before);external.dispose();
  let cancelled=false;const workspace=new IndexWorkspace({entryLimit:1000000,byteLimit:256000000,cancelled:()=>cancelled});
  const cancel=detector.discover(view,{...context,workspace});cancel.next();cancelled=true;
  expect([...cancel].at(-1)).toEqual({kind:"interrupted",reason:"cancelled"});expect(workspace.usage).toEqual({entries:0,bytes:0});
  const capped=discoveryContext();capped.limits.stepNodes=1;
  const events=[...detector.discover(view,capped)];expect(events.at(-1)).toEqual({kind:"interrupted",reason:"proof-step-limit"});
  expect(events.some(e=>e.kind==="exhausted"||e.kind==="proposal")).toBe(false);expect(capped.workspace.usage).toEqual({entries:0,bytes:0});
  // Cancellation after a yielded proof retains no compiler or borrowed-index memory.
  cancelled=false;const afterProposal=detector.discover(view,{...context,workspace});
  while(true){const next=afterProposal.next();if(next.done)throw Error("no-proposal");if(next.value.kind==="proposal")break;}
  cancelled=true;expect([...afterProposal].at(-1)).toEqual({kind:"interrupted",reason:"cancelled"});
  expect(workspace.usage).toEqual({entries:0,bytes:0});
});
test("remote pair boundary counts every internal cell edge and has a 12-cell descriptor",()=>{
  const descriptor=getTechniques("classic-expanded@1").find(d=>d.id==="c13@1")!;
  expect(descriptor.bounds).toMatchObject({maxLength:24,maxPatternCells:12});
  for(const length of [4,6,8,10,12]) {
    const f=shortFixtures.find(f=>f.id===`C13-length-${length}`)!;
    expect(f.expectedPattern).toMatchObject({inferenceLinks:2*length-1});
    const proof=independentShortCertificate(f);
    expect(new Set(proof.proof.nodes.filter(n=>n.rule==="cover-clause@1").map(n=>n.premises[0])).size).toBe(length);
  }
});

test("Dual ER rejects one derivation presented with two empty intersections",()=>{
  const source=shortFixtures.find(f=>f.id==="C10-turbot")!,path={symbol:1,vertices:[[46],[29],[32],[50]],strongHouses:["box:3","column:5"]};
  const f={...source,expectedPattern:{alias:"Dual Empty Rectangle",paths:[{...path,emptyIntersection:47},{...path,emptyIntersection:28}]},
    expectedEffects:[{kind:"remove" as const,cell:49,symbol:1}]};
  const view=fixtureView(f),proposal=independentShortCertificate(f),context={view,retained:retainedProof(view),limits:discoveryContext().limits,policy:"unconditional" as const,uniqueEvidenceId:null};
  expect(proposal.proof.roots.filter(id=>proposal.proof.nodes.find(n=>n.id===id)?.conclusion.kind==="literal")).toHaveLength(1);
  expect([...verifyCertificate(proposal,context)].at(-1)?.kind).toBe("verified");
  expect([...checkProposal(proposal,context)].at(-1)?.kind).toBe("rejected");
});

test("C10 discovery never pairs presentation-only ER duplicates into Dual ER",()=>{
  const view=fixtureView(shortFixtures.find(f=>f.id==="C10-turbot")!),descriptor=getTechniques("classic-expanded@1").find(d=>d.id==="c10@1")!;
  const context=discoveryContext();let duals=0,exhausted=false;
  for(const event of descriptor.discover(view,context)) {
    if(event.kind==="exhausted")exhausted=true;
    if(event.kind!=="proposal")continue;
    const p=event.proposal.pattern as unknown as ShortPattern;if(p.alias!=="Dual Empty Rectangle")continue;duals++;
    const identities=p.paths.map(path=>JSON.stringify({symbol:path.symbol,vertices:path.vertices,strongHouses:path.strongHouses}));
    expect(identities[0]).not.toBe(identities[1]);
  }
  expect(duals).toBeGreaterThan(0);expect(exhausted).toBe(true);expect(context.workspace.usage).toEqual({entries:0,bytes:0});
},30000);

test.each([false,true])("Dual ER requires two component roots even when their endpoint clauses coincide: both=%s",both=>{
  const source=shortFixtures.find(f=>f.id==="C10-turbot")!;
  // Independently selected from the original given-peer domains and row/column/box coordinates.
  const paths=[{symbol:4,vertices:[[46],[36],[39],[66]],strongHouses:["box:3","column:3"],emptyIntersection:37},
    {symbol:4,vertices:[[66],[77],[50],[46]],strongHouses:["box:7","row:5"],emptyIntersection:68}];
  const f={...source,expectedPattern:{alias:"Dual Empty Rectangle",paths},expectedEffects:[{kind:"remove" as const,cell:64,symbol:4}]};
  const view=fixtureView(f),b=new FixtureProof(view),roots:number[]=[];
  for(const path of paths.slice(0,both?2:1)) {
    const endpoint=b.shortEndpoint(path),target={cell:64,symbol:4,positive:true};
    const conflicts=[...path.vertices[0],...path.vertices[3]].map(cell=>b.weak({cell,symbol:4,positive:true},target));
    roots.push(b.eliminate([endpoint,...conflicts],target));
  }
  const proposal=b.finish(f,roots),context={view,retained:retainedProof(view),limits:discoveryContext().limits,policy:"unconditional" as const,uniqueEvidenceId:null};
  expect([...verifyCertificate(proposal,context)].at(-1)?.kind).toBe("verified");
  expect([...checkProposal(proposal,context)].at(-1)?.kind).toBe(both?"checked":"rejected");
});

test.each([false,true])("Dual ER rejects a primitive-valid pooled cross-component derivation even with genuine roots: %s",genuine=>{
  const f=shortFixtures.find(f=>f.id==="C10-dual-er")!,view=fixtureView(f),b=new FixtureProof(view);
  const pos=(cell:number)=>({cell,symbol:2,positive:true});
  const roots:number[]=[];
  if(genuine) {
    const paths=(f.expectedPattern as unknown as ShortPattern).paths;
    f.expectedEffects.forEach((effect,index)=>{
      const path=paths[1-index],endpoint=b.shortEndpoint(path),target=pos(effect.cell);
      roots.push(b.eliminate([endpoint,...[...path.vertices[0],...path.vertices[3]].map(cell=>b.weak(pos(cell),target))],target));
    });
  }
  const box=b.house("box:2",2),column=b.house("column:3",2),row=b.house("row:8",2);
  const not7=b.resolve(column,b.weak(pos(3),pos(7)),3,2),not8=b.resolve(column,b.weak(pos(3),pos(8)),3,2);
  const not24=b.resolve(row,b.weak(pos(78),pos(24)),78,2);
  const first=b.resolve(box,not7,7,2),second=b.resolve(first,not8,8,2),positive75=b.resolve(second,not24,24,2);
  roots.push(...f.expectedEffects.map(e=>b.resolve(positive75,b.weak(pos(75),pos(e.cell)),75,2)));
  const proposal=b.finish(f,roots),context={view,retained:retainedProof(view),limits:discoveryContext().limits,policy:"unconditional" as const,uniqueEvidenceId:null};
  expect([...verifyCertificate(proposal,context)].at(-1)?.kind).toBe("verified");
  if(genuine) {
    expect(proposal.proof.nodes).toHaveLength(31);
    expect(proposal.proof.roots.filter(id=>proposal.proof.nodes.find(n=>n.id===id)?.conclusion.kind==="literal")).toHaveLength(4);
  }
  expect(proposal.proof.nodes.filter(n=>n.rule==="support@1")).toHaveLength(3);
  expect([...checkProposal(proposal,context)].at(-1)?.kind).toBe("rejected");
});
