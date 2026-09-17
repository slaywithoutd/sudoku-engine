import { expect, test } from "vitest";
import { getTechniques } from "../../../src/solver/techniques/registry";
import { fixtureView, type TechniqueFixture } from "../../solver/acceptance";
import fixtures from "../../solver/fixtures/C32.json";

test("C32 exposes an eligible specialized descriptor on authentic original-clue geometry", () => {
  const f = fixtures[0] as unknown as TechniqueFixture;
  const view = fixtureView(f);
  const descriptor = getTechniques("classic-expanded@1").find(d => d.id === "c32@1")!;
  expect(descriptor.eligible(view)).toEqual({ kind: "yes" });
});
import { compileTridagon, type TridagonPlan } from "../../../src/solver/techniques/tridagon";
import { checkProposal } from "../../../src/solver/proof/checker";
import { retainedProof } from "../../../src/solver/state/candidates";
import { discoveryContext } from "../../solver/discovery-context";

test.each(fixtures)("$id has complete core rejections and an authentic guardian theorem",f=> {
 const view=fixtureView(f as unknown as TechniqueFixture),cursor=compileTridagon(view,f.expectedPattern as TridagonPlan);let proposal;
 while(true){const n=cursor.next();if(n.done){proposal=n.value;break;}}
 expect(proposal).not.toBeNull();expect(proposal!.effects).toEqual(expect.arrayContaining(f.expectedEffects));
 const limits={...discoveryContext().limits,timeMs:120000,workUnits:100000000};let terminal;
 for(const e of checkProposal(proposal!,{view,retained:retainedProof(view),limits,policy:"discharged",uniqueEvidenceId:null}))if(e.kind!=="work")terminal=e;
 expect(terminal?.kind,JSON.stringify(terminal)).toBe("checked");
},150000);
import { discoverSpecialized } from "../../solver/specialized-acceptance";
test("C32 discovers an authentic multi-guardian OR publication",()=> {
 const f=fixtures.find(f=>f.id==="C32-guardian-2")!;
 expect(discoverSpecialized(f as unknown as TechniqueFixture,p=>p.guardians.length>1).proposal.effects).toEqual([]);
},200000);
