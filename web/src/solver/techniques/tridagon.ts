import type { ReadView } from "../state/types";
import type { DeductionProposal } from "../proof/types";
import type { WorkspaceReservation } from "../indexes/workspace";
import { clause } from "../proof/primitives";
import { bitOf, candidates, choose, ClassicHouses, product, SpecializedProof, specializedDescriptor, specializedWork,
 type LocalRelation, type SpecializedWork, type SpecializedStrategy } from "./specialized-runtime";

export interface TridagonPlan {readonly alias:string;readonly boxes:readonly number[];readonly triples:readonly (readonly number[])[];
 readonly coreSymbols:readonly number[];readonly guardians:readonly {readonly cell:number;readonly symbol:number}[]}
/** Four complete local permutations, with a concrete actual conflict for every
 * Cartesian combination; the positive guardians remain an OR, never an XOR. */
export function* compileTridagon(view:ReadView,p:TridagonPlan,lease?:WorkspaceReservation):Generator<SpecializedWork,DeductionProposal|null> {
 const b=new SpecializedProof(view,lease),permutations:number[][][]=[],rejections:number[][]=[];
 for(const group of p.triples) {
  const rows:number[][]=[];for(const row of product(group.map(c=>p.coreSymbols.filter(s=>view.state.domains[c]&bitOf(s))))) {
   yield specializedWork;if(new Set(row).size===3)rows.push(row);
  }
  if(!rows.length)return null;permutations.push(rows);
 }
 const all=p.triples.flat(),indexes=permutations.map(rows=>rows.map((_,i)=>i));
 for(const selected of product(indexes)) {
  yield specializedWork;const assignment=selected.flatMap((j,i)=>permutations[i][j]);let conflict:number[]|undefined;
  for(let i=0;i<12&&!conflict;i++)for(let j=i+1;j<12;j++)if(assignment[i]===assignment[j]&&b.houses.peer(all[i],all[j])){conflict=[all[i],all[j]];break;}
  if(!conflict)return null;rejections.push(conflict);lease?.grow(0,32);
 }
 const locals:LocalRelation[]=[];for(const triple of p.triples)locals.push(yield* b.local(triple,[triple]));
 let table=locals[0];const joins:number[]=[];
 for(const next of locals.slice(1)){table=yield* b.joinPeers(table,next);joins.push(table.id);}
 if(!table.rows.length)return null;
 const conclusion=clause(p.guardians.map(g=>({...g,positive:true}))),theorem=b.project(table,conclusion);
 const pattern={...p,certificate:{permutations,rejections,locals:locals.map(t=>t.id),joins,table:table.id,theorem}};
 if(p.guardians.length===1)return b.wire.finish("c32@1",pattern,{kind:"place",...p.guardians[0]},theorem);
 return b.wire.bundle("c32@1",pattern,[],[theorem]);
}
/** Canonical box rectangles and core symbol triples; actual current domains
 * bound guardian enumeration before expensive four-component joins. */
export class TridagonSearch implements SpecializedStrategy {
 *plans(view:ReadView) {
  const h=new ClassicHouses(view);
  for(const core of choose(view.assembly.problem.symbols,3))for(const bands of choose([0,1,2],2))for(const stacks of choose([0,1,2],2)) {
   yield specializedWork;const boxes=bands.flatMap(b=>stacks.map(s=>b*3+s)),options:{cells:number[];guardians:{cell:number;symbol:number}[]}[][]=[];
   for(const box of boxes) {
    const choices=[];
    for(const group of choose((h.boxes[box]??[]).filter(c=>candidates(view,c).some(s=>core.includes(s))),3)) {
     yield specializedWork;const guardians=group.flatMap(cell=>candidates(view,cell).filter(s=>!core.includes(s)).map(symbol=>({cell,symbol})));
     let possible=false;for(const row of product(group.map(c=>core.filter(s=>candidates(view,c).includes(s)))))if(new Set(row).size===3){possible=true;break;}
     if(guardians.length>4||!possible)continue;
     choices.push({cells:group,guardians});
    }
    options.push(choices);
   }
   if(options.some(c=>!c.length))continue;
   for(const selected of product(options.map(v=>v.map((_,i)=>i)))) {
    yield specializedWork;const groups=selected.map((j,i)=>options[i][j]),guardians=groups.flatMap(g=>g.guardians).sort((a,b)=>a.cell-b.cell||a.symbol-b.symbol);
    if(guardians.length<1||guardians.length>4)continue;
    const triples=groups.map(g=>g.cells),sparse=triples.some(t=>t.some(c=>core.some(s=>!candidates(view,c).includes(s))));
    yield {kind:"plan" as const,plan:{alias:sparse?"Degenerate Tridagon":guardians.length===1?"Tridagon":"Tridagon guardians",boxes,triples,coreSymbols:core,guardians}};
   }
  }
 }
 compile(view:ReadView,p:TridagonPlan,lease?:WorkspaceReservation){return compileTridagon(view,p,lease);}
}
export const tridagonTechniques=Object.freeze([specializedDescriptor("C32",new TridagonSearch(),[0,1,6,12,4])]);
