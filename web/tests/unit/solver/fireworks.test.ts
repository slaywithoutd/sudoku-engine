import { expect, test } from "vitest";
import { getTechniques } from "../../../src/solver/techniques/registry";
import { fixtureView, type TechniqueFixture } from "../../solver/acceptance";
import fixtures from "../../solver/fixtures/C29.json";

test("C29 exposes an eligible specialized descriptor on authentic original-clue geometry", () => {
  const f = fixtures[0] as unknown as TechniqueFixture;
  const view = fixtureView(f);
  const descriptor = getTechniques("classic-expanded@1").find(d => d.id === "c29@1")!;
  expect(descriptor.eligible(view)).toEqual({ kind: "yes" });
});
import { compileFireworks, type FireworksPlan } from "../../../src/solver/techniques/fireworks";
import { checkProposal } from "../../../src/solver/proof/checker";
import { retainedProof } from "../../../src/solver/state/candidates";
import { discoveryContext } from "../../solver/discovery-context";
import type { DeductionProposal } from "../../../src/solver/proof/types";

function compile(f:any):DeductionProposal {
  const cursor=compileFireworks(fixtureView(f),f.expectedPattern as FireworksPlan);
  while(true){const n=cursor.next();if(n.done){expect(n.value).not.toBeNull();return n.value!;}}
}
test.each(fixtures)("$id compiles its complete original-clue certificate and every removal is checked",f=> {
  const view=fixtureView(f as unknown as TechniqueFixture),proposal=compile(f);
  expect(proposal.effects).toEqual(expect.arrayContaining(f.expectedEffects));
  const checked=[...checkProposal(proposal,{view,retained:retainedProof(view),limits:discoveryContext().limits,policy:"unconditional",uniqueEvidenceId:null})].at(-1); expect(checked?.kind,JSON.stringify(checked)).toBe("checked");
});

import { discoverSpecialized } from "../../solver/specialized-acceptance";
test.each(fixtures)("$id is reached by actual Fireworks discovery",f=> {
 const result=discoverSpecialized(f as unknown as TechniqueFixture,p=>p.components.length===f.expectedPattern.components.length);
 expect(result.proposal.effects.length).toBeGreaterThan(0);
},200000);
