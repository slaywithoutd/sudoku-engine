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
import { independentExocet } from "../../solver/specialized-algebra";
import { transposed } from "../../solver/specialized-transpose";
test.each(fixtures)("$id transposes its complete Junior counts and Double join to the stack orientation",source=> {
 const f=transposed(source),{view,prefix}=specializedState(f),independent=independentSpecialized(f),limits={...discoveryContext().limits,timeMs:180000,workUnits:200000000};
 const local=independentExocet(f);expect(local.rows.length).toBeGreaterThan(0);
 for(const e of f.expectedEffects)expect(local.rows.every(row=>row[local.cells.indexOf(e.cell)]!==e.symbol)).toBe(true);
 for(const mutation of ["companion","cross-line","cover"]){const broken=structuredClone(f),p=broken.expectedPattern.components?.[0]??broken.expectedPattern;
  if(mutation==="companion")p.companions[0]=p.base[0];if(mutation==="cross-line")p.crossLines.pop();if(mutation==="cover")p.covers.pop();expect(()=>independentExocet(broken)).toThrow();}
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
