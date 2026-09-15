import { expect,test } from "vitest";
import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import { fishFixtures,independentFish,findFish } from "../../solver/fish-acceptance";
import { fixtureView,assertSound,originalCluePrefix } from "../../solver/acceptance";
import { oracle } from "../../solver/oracle";
import { replay } from "../../../src/solver/proof/replay";
import { discoveryContext } from "../../solver/discovery-context";

test.each(fishFixtures)("$id actual discovery proves the required named bound class",f=>{
 const found=findFish(f);expect(found.proposal.effects.some(e=>f.expectedEffects.some(w=>e.cell===w.cell&&e.symbol===w.symbol))).toBe(true);
 expect(()=>assertSound(found.view,found.proposal)).not.toThrow();
 expect(found.usage).toEqual({entries:0,bytes:0});
 const snapshot={snapshotId:"fish-discovered",inputRevision:0,problem:found.view.assembly.problem,source:{kind:"manual" as const}};
 expect([...replay(snapshot,[...originalCluePrefix(f),found.proposal],found.view.assembly,discoveryContext().limits)].at(-1)?.kind).toBe("checked");
 // Optional explicit test-run artifact, never an input to discovery/admission.
 if(process.env.FISH_DISCOVERY_RECORD)appendFileSync(process.env.FISH_DISCOVERY_RECORD,JSON.stringify({id:f.id,
  origin:"Post-implementation production observation; not independent seed expectation",pattern:found.proposal.pattern,effects:found.proposal.effects,
  work:found.work,proposals:found.proposals,command:"npm test -- tests/unit/solver/fish-complex.test.ts -t 'actual discovery'"})+"\n");
},120000);
test("all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals",()=>{
 let counterfactuals=0;
 for(const f of fishFixtures) {
  const input={givens:[...f.givens].map(Number),domains:f.preState.domains,limit:1 as const,maxNodes:500000};
  expect(createHash("sha256").update(JSON.stringify(input)).digest("hex"),f.id).toBe((f as any).oracleRecord.inputHash);
  const positive=oracle(input);expect(positive.interrupted).toBe(false);expect(positive.witnesses).toHaveLength(1);
  for(const e of f.expectedEffects) {
   expect(oracle({...input,force:[e.cell,e.symbol]}),f.id).toMatchObject({interrupted:false,exhausted:true,witnesses:[]});
   const forbid=oracle({...input,forbid:[e.cell,e.symbol]});expect(forbid.interrupted).toBe(false);expect(forbid.witnesses).toHaveLength(1);counterfactuals++;
  }
 }
 expect(fishFixtures).toHaveLength(63);expect(counterfactuals).toBe(98);
});
test.each(fishFixtures)("$id replays its independent certificate from original clues",f=>{
 const view=fixtureView(f),proposal=independentFish(f),limits=discoveryContext().limits;
 const snapshot={snapshotId:"fish-original",inputRevision:0,problem:view.assembly.problem,source:{kind:"manual" as const}};
 expect([...replay(snapshot,[...originalCluePrefix(f),proposal],view.assembly,limits)].at(-1)?.kind).toBe("checked");
},30000);
