import {expect,test} from "vitest";
import bounds from "../../solver/fixtures/unique-link-bound.json";
import caseBounds from "../../solver/fixtures/unique-case-link-bound.json";
import {uniqueHarness,uniqueLimits} from "../../solver/unique-harness";
import {independentUniquePlan,independentNamedUnique,independentUniqueTrade,type UniqueSeed} from "../../solver/unique-independent";
import {compileUnique} from "../../../src/solver/techniques/unique-compiler";
import {checkProposal,verifyCertificate} from "../../../src/solver/proof/checker";
import {retainedProof} from "../../../src/solver/state/candidates";
import {replayConditional} from "../../../src/solver/proof/replay";
import {oracle} from "../../solver/oracle";

for(const raw of [...bounds.fixtures,...caseBounds.fixtures])test(`${raw.id} exact distinct causal link bound`,()=>{
 const seed=raw as UniqueSeed;independentUniqueTrade(seed);
 const h=uniqueHarness(seed),view=h.operation.view,effect=seed.expectedEffects[0] as any;
 try {
  const plan=independentUniquePlan(seed,effect);
  let distinct=25;
  if("independentOppositeBranchRecipes" in raw) {
   const recipe=raw.independentOppositeBranchRecipes[0];distinct=recipe.distinctLinks;
   const literal=(a:(number|boolean)[])=>({cell:a[0] as number,symbol:a[1] as number,positive:a[2] as boolean});
   (plan as any).consequence={kind:"denial",paths:recipe.paths.map(path=>path.map(link=>({...link,from:literal(link.from),to:literal(link.to)})))};
  }
  const context={view,retained:retainedProof(view),policy:"unique-only" as const,uniqueAuthority:h.operation.authority,uniqueEvidenceId:h.parent.evidenceId,limits:uniqueLimits};
  for(const proposal of [independentNamedUnique(view,seed,h.parent.evidenceId,effect,plan),compileUnique(view,plan,effect,h.operation.authority)]) {
   const primitive=[...verifyCertificate(proposal,context)].at(-1);
   expect(primitive?.kind,JSON.stringify(primitive)).toBe("verified");
   const certificate=(proposal.pattern as any).certificate;
   expect(Math.max(...certificate.branches.map((b:any)=>new Set(b.paths.flatMap((p:any)=>p.links)).size))).toBe(distinct);
   expect(Math.max(...certificate.branches.flatMap((b:any)=>b.paths.map((p:any)=>p.links.length)))).toBeLessThan(24);
   const named=[...checkProposal(proposal,context)].at(-1);
   if(distinct===24)expect(named?.kind,JSON.stringify(named)).toBe("checked");
   else expect(named).toEqual({kind:"rejected",code:plan.consequence.kind==="denial"?"unique-denial-lineage":"unique-case-bound"});
  }
  const replay=[...replayConditional(h.operation,[compileUnique(view,plan,effect,h.operation.authority)])].at(-1);
  expect(replay?.kind).toBe(distinct===24?"checked":"rejected");
  const exact=oracle({givens:[...seed.givens].map(Number),limit:2,maxNodes:1_000_000});
  expect(exact.exhausted&&!exact.interrupted&&exact.witnesses.length===1).toBe(true);
  const opposite=oracle({givens:[...seed.givens].map(Number),limit:2,maxNodes:1_000_000,force:[effect.cell,effect.symbol]});
  expect(opposite.exhausted&&!opposite.interrupted&&opposite.witnesses.length===0).toBe(true);
 }finally{h.operation.dispose();}
 expect(h.workspace.usage).toEqual({entries:0,bytes:0});
},30000);
