import { expect, test } from "vitest";
import { getTechniques } from "../../../src/solver/techniques/registry";
import { fixtureView } from "../../solver/acceptance";
import type { TechniqueFixture } from "../../solver/acceptance";
import c10 from "../../solver/fixtures/C10.json";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import { shortFixtures,findShort,independentShortCertificate } from "../../solver/short-pattern-acceptance";
import { assertSound } from "../../solver/acceptance";
import { discoveryContext } from "../../solver/discovery-context";

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
