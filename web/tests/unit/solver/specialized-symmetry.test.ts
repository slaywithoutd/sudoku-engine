import { expect, test } from "vitest";
import fixtures from "../../solver/fixtures/C31.json";
import c29 from "../../solver/fixtures/C29.json";
import c32 from "../../solver/fixtures/C32.json";
import { independentSpecialized } from "../../solver/specialized-independent";
import { specializedState } from "../../solver/specialized-state";
import { discoveryContext } from "../../solver/discovery-context";
import { replay } from "../../../src/solver/proof/replay";
import { compileExocet } from "../../../src/solver/techniques/exocet";
import { checkProposal } from "../../../src/solver/proof/checker";
import { retainedProof } from "../../../src/solver/state/candidates";
import { oracle } from "../../solver/oracle";
const cell=(c:number)=>c%9*9+Math.floor(c/9);
function transposed(source:any) {
 const f=structuredClone(source),reorder=(a:number[])=>Array.from({length:81},(_,c)=>a[cell(c)]),house=(s:string)=>{const [k,n]=s.split(":");return `${k==="row"?"column":k==="column"?"row":"box"}:${k==="box"?Number(n)%3*3+Math.floor(Number(n)/3):n}`;};
 f.id+="-transpose";f.givens=reorder([...f.givens].map(Number)).join("");f.preState.values=reorder(f.preState.values);f.preState.domains=reorder(f.preState.domains);
 for(const p of f.expectedPattern.components??[f.expectedPattern]) {
  p.orientation="column";p.base=p.base.map(cell).sort((a:number,b:number)=>a-b);p.targets=p.targets.map(cell);p.companions=p.companions.map(cell);p.sCells=p.sCells.map(cell);p.crossLines=p.crossLines.map(house);
  for(const cv of p.covers){cv.houses=cv.houses.map(house);cv.occurrences=cv.occurrences.map(cell).sort((a:number,b:number)=>a-b);cv.assignedOccurrences=cv.assignedOccurrences.map(cell).sort((a:number,b:number)=>a-b);}
 }
 f.expectedEffects=f.expectedEffects.map((e:any)=>({...e,cell:cell(e.cell)}));return f;
}
test.each(fixtures)("$id transposes its complete Junior counts and Double join to the stack orientation",source=> {
 const f=transposed(source),{view,prefix}=specializedState(f),independent=independentSpecialized(f),limits={...discoveryContext().limits,timeMs:180000,workUnits:200000000};
 let completed=0;for(const e of replay({problem:view.assembly.problem} as any,[...prefix,independent],view.assembly,limits)){if(e.kind==="rejected")throw Error(e.code);if(e.kind==="checked")completed++;}
 expect(completed).toBe(prefix.length+1);
 const cursor=compileExocet(view,f.expectedPattern);let proposal;while(true){const n=cursor.next();if(n.done){proposal=n.value;break;}}expect(proposal).not.toBeNull();
 expect([...checkProposal(proposal!,{view,retained:retainedProof(view),limits,policy:"unconditional",uniqueEvidenceId:null})].at(-1)?.kind).toBe("checked");
 for(const e of proposal!.effects)expect(oracle({givens:[...f.givens].map(Number),domains:f.preState.domains,force:[e.cell,e.symbol],limit:1,maxNodes:100000})).toMatchObject({interrupted:false,exhausted:true,witnesses:[]});
},200000);
test.each([[c29[0],"Fireworks"],[fixtures[0],"Exocet"],[c32[2],"Thor's Hammer"],[c32[0],"Tridagon"],[c32[0],"Tridagon guardians"]] as const)("independently accepts the documented generic alias %s %s",(source,alias)=> {
 const f:any=structuredClone(source);f.id+="-"+alias;f.expectedPattern.alias=alias;const {view}=specializedState(f),proposal=independentSpecialized(f);
 const limits={...discoveryContext().limits,timeMs:180000,workUnits:200000000};expect([...checkProposal(proposal,{view,retained:retainedProof(view),limits,policy:"discharged",uniqueEvidenceId:null})].at(-1)?.kind).toBe("checked");
},200000);
