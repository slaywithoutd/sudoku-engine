import type { ReadView, Literal } from "../state/types";
import type { DeductionProposal, Effect } from "../proof/types";
import type { WorkspaceReservation } from "../indexes/workspace";
import { clause } from "../proof/primitives";
import { boxOf, bitOf, candidates, choose, ClassicHouses, sortedCells, SpecializedProof, specializedDescriptor, specializedWork,
 type LocalRelation, type SpecializedWork, type SpecializedStrategy } from "./specialized-runtime";

export interface JuniorPlan {readonly orientation:"row"|"column";readonly base:readonly number[];readonly targets:readonly number[];
 readonly companions:readonly number[];readonly crossLines:readonly string[];readonly sCells:readonly number[];readonly baseSymbols:readonly number[];
 readonly covers:readonly {readonly symbol:number;readonly houses:readonly string[];readonly occurrences:readonly number[];readonly assignedOccurrences:readonly number[]}[]}
export type ExocetPlan=({readonly alias:string}&JuniorPlan)|{readonly alias:"Double Exocet";readonly components:readonly JuniorPlan[]};

/** Emits the actual weighted scopes and every nonzero incidence domain. */
function countClause(b:SpecializedProof,p:JuniorPlan,base:number,symbol:number,targets:readonly number[]):number {
 const capacityNames=[...p.covers.find(c=>c.symbol===symbol)!.houses,`${p.orientation}:${p.orientation==="row"?Math.floor(base/9):base%9}`,`box:${boxOf(base)}`];
 const covers=p.crossLines.map(name=>b.wire.fact({kind:"cover",symbol,cells:b.houses.house(name)}));
 const capacities=capacityNames.map(name=>b.wire.fact({kind:"all-different",cells:b.houses.house(name)}));
 const weightedCapacities=[...new Set(capacities)].map(premise=>({premise,coefficient:capacities.filter(id=>id===premise).length}));
 const coefficients=new Map<number,number>();
 for(const [names,sign]of [[p.crossLines,-1],[capacityNames,1]] as const)for(const name of names)for(const c of b.houses.house(name))coefficients.set(c,(coefficients.get(c)??0)+sign);
 const needed=sortedCells([...coefficients].filter(([,a])=>a!==0).map(([c])=>c).concat([base,...targets]));
 return b.add("cover-count-clause@1",[...covers,...weightedCapacities.map(c=>c.premise),...needed.map(c=>b.view.state.domainFacts[c])],
  clause([{cell:base,symbol,positive:false},...targets.map(cell=>({cell,symbol,positive:true}))]),
  {symbol,covers:covers.map(premise=>({premise,coefficient:1})),capacities:weightedCapacities});
}

export function* compileExocet(view:ReadView,p:ExocetPlan,lease?:WorkspaceReservation):Generator<SpecializedWork,DeductionProposal|null> {
 const b=new SpecializedProof(view,lease),plans="components" in p?p.components:[p],components:any[]=[];
 for(const plan of plans) {
  const cells=sortedCells([...plan.base,...plan.targets]),local=yield* b.local(cells,[plan.base]),counts:any[]=[];
  for(const symbol of plan.baseSymbols)for(const base of plan.base)if(candidates(view,base).includes(symbol)) {
   const cover=plan.covers.find(c=>c.symbol===symbol)!;
   const clauses=cover.houses.length===1?plan.targets.map(t=>[t]):[[...plan.targets]];
   for(const targets of clauses) {
    yield specializedWork;const forced=targets.find(t=>view.state.domains[t]===bitOf(symbol));
    const root=forced===undefined?countClause(b,plan,base,symbol,targets):b.project(local,clause([{cell:base,symbol,positive:false},...targets.map(cell=>({cell,symbol,positive:true}))]));
    counts.push({base,symbol,targets,kind:forced===undefined?"count":"domain",root});
   }
  }
  const identity=yield* b.local([plan.base[0]]),relation=yield* b.join(local,identity,counts.map(c=>c.root));
  if(!relation.rows.length)return null;components.push({local:local.id,identity:identity.id,counts,relation:relation.id,value:relation});
 }
 let table:LocalRelation=components[0].value;
 if(components.length===2)table=yield* b.joinPeers(table,components[1].value);
 if(!table.rows.length)return null;
 const effects:Effect[]=[],roots:number[]=[];
 for(const cell of table.cells)for(const symbol of candidates(view,cell)) {
  yield specializedWork;if(!view.state.values[cell]&&table.rows.every(row=>row[table.cells.indexOf(cell)]!==symbol)) {
   effects.push({kind:"remove",cell,symbol});roots.push(b.project(table,{kind:"literal",value:{cell,symbol,positive:false}}));
  }
 }
 if(!effects.length)return null;
 return b.finish("c31@1",{...p,certificate:{components:components.map(({value,...c})=>c),table:table.id}},effects,roots);
}

/** Separate Junior/Double searches in each orientation prevent an expensive
 * compiler (or a long geometry cursor) from blocking the other forms. Double
 * owns its own bounded-by-workspace catalogue of prior Junior geometries. */
export class ExocetSearch implements SpecializedStrategy {
 constructor(private readonly form:"junior"|"double"|"all"="all",private readonly orientation?:"row"|"column"){}
 subfamilies():readonly SpecializedStrategy[] {
  return this.form==="all"?[new ExocetSearch("junior","row"),new ExocetSearch("double","row"),new ExocetSearch("junior","column"),new ExocetSearch("double","column")]:[this];
 }
 *plans(view:ReadView,lease?:WorkspaceReservation) {
  const h=new ClassicHouses(view),prior:JuniorPlan[]=[];
  for(const orientation of this.orientation?[this.orientation]:["row","column"] as const) {
   const at=(r:number,c:number)=>orientation==="row"?r*9+c:c*9+r;
   for(let band=0;band<3;band++)for(let line=band*3;line<band*3+3;line++)for(let stack=0;stack<3;stack++)for(const selected of choose([0,1,2],2)) {
    yield specializedWork;const base=selected.map(i=>at(line,stack*3+i)).sort((a,b)=>a-b),baseSymbols=sortedCells(base.flatMap(c=>candidates(view,c)));
    if(base.some(c=>view.state.values[c])||baseSymbols.length<3||baseSymbols.length>4)continue;
    const otherRows=[band*3,band*3+1,band*3+2].filter(r=>r!==line),otherStacks=[0,1,2].filter(s=>s!==stack),unused=stack*3+[0,1,2].find(i=>!selected.includes(i))!;
    for(const order of [otherRows,[...otherRows].reverse()])for(let left=0;left<3;left++)for(let right=0;right<3;right++) {
     yield specializedWork;const columns=[otherStacks[0]*3+left,otherStacks[1]*3+right],targets=columns.map((c,i)=>at(order[i],c)),companions=columns.map((c,i)=>at(order[1-i],c));
     if(targets.some(c=>view.state.values[c])||companions.some(c=>baseSymbols.some(s=>candidates(view,c).includes(s))))continue;
     const crossLines=[unused,...columns].map(c=>`${orientation==="row"?"column":"row"}:${c}`),sCells=sortedCells([unused,...columns].flatMap(c=>Array.from({length:9},(_,r)=>r).filter(r=>Math.floor(r/3)!==band).map(r=>at(r,c))));
     const scopes=[...h.rows,...h.columns,...h.boxes].filter((v):v is readonly number[]=>!!v),covers:JuniorPlan["covers"][number][]=[];
     for(const symbol of baseSymbols) {
      const occurrences=sCells.filter(c=>candidates(view,c).includes(symbol)),assignedOccurrences=sCells.filter(c=>view.state.values[c]===symbol);let chosen:(readonly number[])[]|undefined;
      for(const scope of scopes){yield specializedWork;if(occurrences.every(c=>scope.includes(c))){chosen=[scope];break;}}
      if(!chosen)for(const pair of choose(scopes,2)){yield specializedWork;if(occurrences.every(c=>pair.some(s=>s.includes(c)))){chosen=pair;break;}}
      if(!chosen)break;covers.push({symbol,houses:chosen.map(s=>h.id(s)),occurrences,assignedOccurrences});
     }
     if(covers.length!==baseSymbols.length)continue;
     const plan:JuniorPlan={orientation,base,targets,companions,crossLines,sCells,baseSymbols,covers};
     if(this.form!=="double")yield {kind:"plan" as const,plan:{alias:"Junior Exocet",...plan}};
     if(this.form==="junior")continue;
     for(const previous of prior) {
      yield specializedWork;if(previous.orientation!==orientation||Math.floor((orientation==="row"?Math.floor(previous.base[0]/9):previous.base[0]%9)/3)!==band||new Set([...previous.targets,...targets]).size!==4||new Set([...previous.baseSymbols,...baseSymbols]).size>4)continue;
      yield {kind:"plan" as const,plan:{alias:"Double Exocet",components:[previous,plan]}};
     }
     lease?.grow(1,8192);prior.push(plan);
    }
   }
  }
 }
 compile(view:ReadView,p:ExocetPlan,lease?:WorkspaceReservation){return compileExocet(view,p,lease);}
}
export const exocetTechniques=Object.freeze([specializedDescriptor("C31",new ExocetSearch(),[0,0,9,81,4])]);
