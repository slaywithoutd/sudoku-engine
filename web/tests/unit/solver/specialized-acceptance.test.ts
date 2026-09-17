import { expect, test } from "vitest";
import c29 from "../../solver/fixtures/C29.json";
import c30 from "../../solver/fixtures/C30.json";
import c31 from "../../solver/fixtures/C31.json";
import c32 from "../../solver/fixtures/C32.json";
import singletonFirework from "../../solver/fixtures/C29-singleton.json";
import { specializedState } from "../../solver/specialized-state";
import { independentFireworks, independentRing, independentExocet, independentCore, independentProduct, independentDigits, independentPeer } from "../../solver/specialized-algebra";
import { oracle } from "../../solver/oracle";
import { checkProposal } from "../../../src/solver/proof/checker";
import { retainedProof } from "../../../src/solver/state/candidates";
import { replay } from "../../../src/solver/proof/replay";
import { compileFireworks } from "../../../src/solver/techniques/fireworks";
import { compileSkLoop } from "../../../src/solver/techniques/sk-loops";
import { compileExocet } from "../../../src/solver/techniques/exocet";
import { compileTridagon } from "../../../src/solver/techniques/tridagon";
import { discoveryContext } from "../../solver/discovery-context";
import type { DeductionProposal } from "../../../src/solver/proof/types";
import type { SolverSnapshot } from "../../../src/solver/snapshot";

const fixtures=[...c29,...c30,...c31,...c32,singletonFirework] as any[];
const compilers:any={C29:compileFireworks,C30:compileSkLoop,C31:compileExocet,C32:compileTridagon};
const limits={...discoveryContext().limits,timeMs:180000,workUnits:200000000};
function compile(f:any):DeductionProposal {
 const {view}=specializedState(f),cursor=compilers[f.rowId](view,f.expectedPattern);while(true){const n=cursor.next();if(n.done){if(!n.value)throw Error(`unproductive:${f.id}`);return n.value;}}
}

test.each(fixtures)("$id has a complete independent finite enumeration",f=> {
 if(f.rowId==="C29"&&f.id!=="C29-singleton-cover")expect(independentFireworks(f)).toEqual(f.independentLocalEnumeration.survivors);
 if(f.id==="C29-singleton-cover") {
  const selected=f.expectedPattern.selected,rows=[...independentProduct(selected.map((c:number)=>independentDigits(f.preState.domains[c])))].filter(row=>
   selected.every((c:number,i:number)=>selected.every((d:number,j:number)=>!independentPeer(c,d)||row[i]!==row[j]))&&
   f.independentLocalEnumeration.directionalClauses.every(([symbol,cells]:[number,number[]])=>cells.some(c=>row[selected.indexOf(c)]===symbol)));
  expect(rows.length).toBe(f.independentLocalEnumeration.survivors);
  for(const e of f.expectedEffects)expect(rows.every(row=>row[selected.indexOf(e.cell)]!==e.symbol)).toBe(true);
 }
 if(f.rowId==="C30") {const r=independentRing(f);expect(r.survivors).toBe(f.independentLocalEnumeration.ringSurvivors);expect(r.local).toEqual(f.independentLocalEnumeration.groupTupleCounts);}
 if(f.rowId==="C31") {
  const relation=independentExocet(f);expect(relation.rows.length).toBeGreaterThan(0);
  for(const e of f.expectedEffects)expect(relation.rows.every(row=>row[relation.cells.indexOf(e.cell)]!==e.symbol)).toBe(true);
  if(f.expectedPattern.components) {
   expect(relation.rows.length).toBe(f.independentLocalEnumeration.jointSurvivors);
   for(const e of f.expectedEffects) {
    expect(relation.rows.every(row=>row[relation.cells.indexOf(e.cell)]!==e.symbol)).toBe(true);
    for(const p of f.expectedPattern.components){const single=independentExocet(f,[p]);expect(single.rows.some(row=>single.cells.every((c,i)=>c===e.cell?row[i]===e.symbol:!(row[i]===e.symbol&&(Math.floor(c/9)===Math.floor(e.cell/9)||c%9===e.cell%9||Math.floor(c/27)===Math.floor(e.cell/27)&&Math.floor(c%9/3)===Math.floor(e.cell%9/3)))))).toBe(true);}
   }
  }
 }
 if(f.rowId==="C32") {const r=independentCore(f);expect(r.survivors).toBe(0);expect(r.combinations).toBe(f.independentLocalEnumeration.coreCombinations);expect(r.guardians).toEqual(f.expectedPattern.guardians);}
},180000);

test.each(fixtures)("$id admits all returned effects, independently force/forbids them, and replays original clues",f=> {
 const {view,prefix}=specializedState(f),proposal=compile(f);let result;
 for(const e of checkProposal(proposal,{view,retained:retainedProof(view),limits,policy:"discharged",uniqueEvidenceId:null}))if(e.kind!=="work")result=e;
 expect(result?.kind,JSON.stringify(result)).toBe("checked");expect(proposal.effects).toEqual(expect.arrayContaining(f.expectedEffects));
 const input={givens:[...f.givens].map(Number),domains:f.preState.domains,limit:1,maxNodes:1000000};
 expect(oracle(input)).toMatchObject({interrupted:false,witnesses:[expect.any(Array)]});
 for(const effect of proposal.effects) {
  const counter=effect.kind==="remove"?{force:[effect.cell,effect.symbol] as [number,number]}:{forbid:[effect.cell,effect.symbol] as [number,number]};
  const allowed=effect.kind==="remove"?{forbid:[effect.cell,effect.symbol] as [number,number]}:{force:[effect.cell,effect.symbol] as [number,number]};
  expect(oracle({...input,...counter}),`${f.id}:${JSON.stringify(effect)}`).toMatchObject({interrupted:false,exhausted:true,witnesses:[]});
  expect(oracle({...input,...allowed})).toMatchObject({interrupted:false,witnesses:[expect.any(Array)]});
 }
 if(!proposal.effects.length) {
  const domains=[...f.preState.domains];for(const g of f.expectedPattern.guardians)domains[g.cell]&=~(1<<(g.symbol-1));
  expect(oracle({...input,domains})).toMatchObject({interrupted:false,exhausted:true,witnesses:[]});
 }
 let replayed=0;for(const e of replay({problem:view.assembly.problem} as SolverSnapshot,[...prefix,proposal],view.assembly,limits)) {
  if(e.kind==="rejected")throw Error(`replay:${f.id}:${e.code}`);if(e.kind==="checked")replayed++;
 }
 expect(replayed).toBe(prefix.length+1);
},200000);
import { independentSpecialized } from "../../solver/specialized-independent";
test.each(fixtures)("$id independently assembles and replays its full named certificate",f=> {
 const {view,prefix}=specializedState(f),proposal=independentSpecialized(f);let replayed=0;
 for(const e of replay({problem:view.assembly.problem} as SolverSnapshot,[...prefix,proposal],view.assembly,limits)) {
  if(e.kind==="rejected")throw Error(`independent-replay:${f.id}:${e.code}`);if(e.kind==="checked")replayed++;
 }
 expect(replayed).toBe(prefix.length+1);
},200000);
