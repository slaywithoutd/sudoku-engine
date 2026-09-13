import type { Json } from "../problem";
import type { ReadView } from "../state/types";
import type { DeductionProposal,Effect,ProofNode,Proposition } from "../proof/types";
import type { Discovery,DiscoveryContext,TechniqueDescriptor } from "./types";
import { IndexInterrupted,type WorkspaceReservation } from "../indexes/workspace";
import { clause } from "../proof/primitives";
import { assertOwnedView } from "../state/candidates";
import { coverageEntries } from "./manifest";
import { fishHouse,fishNames,mixedFishForm,type FishComponent,type FishPattern } from "./fish-grammar";

type Work={kind:"work";units:number};
type Candidate={pattern:FishPattern;effects:readonly Effect[]};
const literal=(cell:number,symbol:number,positive:boolean):Proposition=>({kind:"literal",value:{cell,symbol,positive}});
function classicScopes(view:ReadView) {
 return view.assembly.allDifferent.filter(h=>{
  try {fishHouse(view,h.id);return true;}catch{return false;}
 });
}
function sourceKey(cells:readonly number[],symbol:number) {return cells.join()+"/"+symbol;}
/** Invocation-local recipe lookup; primitive checking authenticates every ID. */
class FishSources {
 readonly ids=new Map<string,number>();next=0;
 constructor(readonly view:ReadView,readonly lease:WorkspaceReservation) {}
 *prepare():Generator<Work> {
  for(const [id,f] of this.view.facts) {
   yield {kind:"work",units:1};this.next=Math.max(this.next,id+1);
   const p=f.proposition;if((p.kind!=="cover"&&p.kind!=="all-different")||f.openAssumptions.length)continue;
   const key=sourceKey(p.cells,p.kind==="cover"?p.symbol:0);
   if(!this.ids.has(key)){this.lease.grow(1,512);this.ids.set(key,id);}
  }
 }
 has(cells:readonly number[],symbol=0):boolean {return this.ids.has(sourceKey(cells,symbol));}
 source(id:string,symbol=0):number {
  const cells=this.view.assembly.allDifferent.find(h=>h.id===id)!.cells,value=this.ids.get(cells.join()+"/"+symbol);
  if(value===undefined)throw Error("fish-missing-source");return value;
 }
}

/** Compiler owns only its proposal lease. House/domain IDs remain borrowed facts.
 * For w=cover-base and equal house counts, sum(w*x)<=0. All negative w cells
 * need x=0; target w>0 then implies not-target. Overlaps retain multiplicity.
 */
class FishCompiler {
 readonly nodes:ProofNode[]=[];readonly imports=new Set<number>();readonly roots:number[]=[];next:number;
 constructor(readonly view:ReadView,readonly lease:WorkspaceReservation,readonly sources:FishSources) {this.next=sources.next;}
 add(rule:string,premises:number[],conclusion:Proposition,parameters:Json={},scope:number[]=[]):number {
  this.lease.grow(1,4096+premises.length*32);const id=this.next++;
  premises.filter(id=>this.view.facts.has(id)).forEach(id=>this.imports.add(id));
  this.nodes.push({id,rule,premises,conclusion,parameters,scope});return id;
 }
 source(house:string,symbol?:number):number {
  return this.sources.source(house,symbol);
 }
 *compile(technique:string,candidate:Candidate):Generator<Work,DeductionProposal> {
  const parts="components" in candidate.pattern?candidate.pattern.components:[candidate.pattern];
  const effectRoots=new Map<number,number>();
  for(const p of parts) {
   const symbol=p.symbol,b=Array(81).fill(0) as number[],u=Array(81).fill(0) as number[];
   for(const id of p.bases)for(const cell of this.view.assembly.allDifferent.find(h=>h.id===id)!.cells)b[cell]++;
   for(const id of p.covers)for(const cell of this.view.assembly.allDifferent.find(h=>h.id===id)!.cells)u[cell]++;
   const requirement={coefficients:u.map((v,c)=>v-b[c]),effects:candidate.effects.filter(e=>u[e.cell]>b[e.cell]&&p.fins.every(fin=>fin!==e.cell&&this.view.assembly.peers[e.cell].includes(fin))&&(p.alias!=="Cannibalistic fish"||b[e.cell]>0))};
   const covers=p.bases.map(id=>({premise:this.source(id,symbol),coefficient:1})),capacities=p.covers.map(id=>({premise:this.source(id),coefficient:1}));
   for(const effect of requirement.effects) {
    yield {kind:"work",units:1};
    const assumption=p.fins.length?this.add("assume@1",[],literal(effect.cell,symbol,true)):undefined,scope=assumption===undefined?[]:[assumption];
    const domains=new Map<number,number>();
    for(let c=0;c<81;c++)if(requirement.coefficients[c]<0)domains.set(c,this.view.state.domainFacts[c]);
    for(const fin of p.fins) {
     yield {kind:"work",units:1};
     const house=this.view.assembly.allDifferent.find(h=>h.cells.includes(fin)&&h.cells.includes(effect.cell))!;
     const weak=this.add("weak-link@1",[this.source(house.id)],clause([{cell:fin,symbol,positive:false},{cell:effect.cell,symbol,positive:false}]),{},scope);
     const negative=this.add("resolution@1",[assumption!,weak],literal(fin,symbol,false),{},scope);
     domains.set(fin,this.add("domain-restrict@1",[this.view.state.domainFacts[fin],negative],{kind:"domain",cell:fin,mask:this.view.state.domains[fin]&~(1<<(symbol-1))},{},scope));
    }
    let root=this.add("cover-count@1",[...covers.map(e=>e.premise),...capacities.map(e=>e.premise),...domains.values()],literal(effect.cell,symbol,false),{symbol,covers,capacities},scope);
    if(assumption!==undefined) {
     const conflict=this.add("contradiction@1",[assumption,root],{kind:"false"},{},scope);
     root=this.add("discharge@1",[assumption,conflict],literal(effect.cell,symbol,false));
    }
    this.roots.push(root);effectRoots.set(effect.cell,root);
   }
  }
  for(const e of candidate.effects) {
   yield {kind:"work",units:1};
   this.roots.push(this.add("domain-restrict@1",[this.view.state.domainFacts[e.cell],effectRoots.get(e.cell)!],{kind:"domain",cell:e.cell,mask:this.view.state.domains[e.cell]&~(1<<(e.symbol-1))}));
  }
  return {technique,state:this.view.state.key,pattern:candidate.pattern as unknown as Json,effects:candidate.effects,
   proof:{state:this.view.state.key,nodes:this.nodes,imports:[...this.imports].sort((a,b)=>a-b),roots:this.roots}};
 }
}

function* combinations<T>(items:readonly T[],size:number,start=0,prefix:T[]=[]):Generator<T[]> {
 if(!size){yield prefix;return;}
 for(let i=start;i<=items.length-size;i++)yield* combinations(items,size-1,i+1,[...prefix,items[i]]);
}
interface House {id:string;cells:readonly number[];support:readonly number[]}
/** Owns deterministic service and closure for a finite set of family cursors. */
export class FishCursorSet<T> {
 constructor(readonly cursors:readonly Generator<T,void,void>[]) {}
 *events():Generator<T,void,void> {
  const active=new Set(this.cursors);
  try {while(active.size)for(const cursor of active) {
   const next=cursor.next();if(next.done)active.delete(cursor);else yield next.value;
  }}
  finally {for(const cursor of this.cursors)cursor.return();}
 }
}
/** Exhaustive finite combinations, ordered to examine unresolved houses first.
 * Solved/redundant houses are deferred, never dropped: density/size names can
 * remain valid even when a smaller fish proves the same removal.
 */
class FishSearch {
 constructor(readonly view:ReadView,readonly family:string,readonly context:DiscoveryContext,readonly sources:FishSources) {}
 *ordered(houses:readonly House[],n:number):Generator<House[]> {
  const preferred=houses.filter(h=>h.support.every(c=>!this.view.state.values[c])),other=houses.filter(h=>!preferred.includes(h));
  for(let count=0;count<=n;count++)for(const a of combinations(preferred,n-count))for(const b of combinations(other,count))yield [...a,...b].sort((a,b)=>a.id.localeCompare(b.id));
 }
 /** Enumerate house sets, never candidate assignments. Every admissible count
  * must cover each base occurrence not visible to its target, and the target
  * needs capacity greater than its base multiplicity. Branch on a still-unmet
  * house incidence (at most three classic houses); sibling exclusions make
  * each set unique for that target. A per-base set removes cross-target copies.
  */
 *coverSets(houses:readonly House[],n:number,current:readonly number[],base:readonly number[],peers:readonly Set<number>[],lease:WorkspaceReservation):Generator<Work|House[]> {
  const seen=new Set<string>();
  for(let target=0;target<current.length;target++) {
   yield {kind:"work",units:1};
   if(this.view.state.values[current[target]]||base.some((v,i)=>v>1&&!peers[target].has(current[i])))continue;
   const required=current.flatMap((cell,i)=>i===target?[{cell,count:base[i]+1}]:base[i]&&!peers[target].has(cell)?[{cell,count:base[i]}]:[]);
   const options=required.map(r=>houses.map((h,i)=>h.cells.includes(r.cell)?i:-1).filter(i=>i>=0));
   const visit=function*(chosen:number[],excluded:Set<number>):Generator<Work|House[]> {
    yield {kind:"work",units:1};
    let pivot=-1,best:number[]=[];
    for(let r=0;r<required.length;r++) {
     const deficit=required[r].count-options[r].filter(i=>chosen.includes(i)).length;
     if(deficit<=0)continue;
     const remaining=options[r].filter(i=>!chosen.includes(i)&&!excluded.has(i));
     if(remaining.length<deficit||chosen.length+deficit>n)return;
     if(pivot<0||remaining.length<best.length){pivot=r;best=remaining;}
    }
    if(pivot<0) {
     const available=houses.map((_,i)=>i).filter(i=>!chosen.includes(i)&&!excluded.has(i));
     for(const extra of combinations(available,n-chosen.length)) {
      const selected=[...chosen,...extra].sort((a,b)=>a-b),key=selected.join();
      yield {kind:"work",units:1};if(seen.has(key))continue;
      lease.grow(1,256);seen.add(key);yield selected.map(i=>houses[i]);
     }
     return;
    }
    const skip=new Set(excluded);
    for(const option of best) {yield* visit([...chosen,option],skip);skip.add(option);}
   };
   yield* visit([],new Set());
  }
 }
 *patterns():Generator<Work|Candidate> {
  const max=["C06","C07"].includes(this.family)?7:4;
  // Distinct-effect Siamese explanations precede equal-effect presentations.
  // The latter remain in a complete second pass, with all repeated work paid.
  const simple=["C06","C07"].includes(this.family);
  for(const sharedHouses of simple?[false]:[false,true])for(const equalEffects of this.family==="C09"?[false,true]:[false]) {
   const modes=this.family==="C09"?(equalEffects?[true]:[false,true]):[false];
   const cursors=Array.from({length:max-1},(_,i)=>(simple?[false]:[false,true]).flatMap(overlap=>modes.map(paired=>this.sizePatterns(i+2,equalEffects,sharedHouses,overlap,paired)))).flat();
   yield* new FishCursorSet(cursors).events();
  }
 }
 /** A fair cursor per supported size avoids claiming later sizes exhausted
  * merely because smaller Siamese pairs consume the operation's allowance. */
 *sizePatterns(n:number,equalEffects:boolean,sharedHouses:boolean,overlap:boolean,paired:boolean):Generator<Work|Candidate> {
  const scratch=this.context.workspace.reserve(0,131072);
  try {
  const simple=this.family==="C06"||this.family==="C07";
  // Across all sizes/symbols, first examine houses without an already placed
  // symbol. The second pass includes every remaining combination exactly once.
  for(const deferred of [false,true])for(const symbol of this.view.assembly.problem.symbols) {
   const bit=1<<(symbol-1),current=this.view.assembly.problem.cells.filter(c=>this.view.state.domains[c]&bit);
   if(current.every(c=>this.view.state.values[c]))continue;
   // At most 27*9 cells and 81*81 peer flags; paid by the invocation lease.
   const houses=classicScopes(this.view).filter(h=>this.sources.has(h.cells)).map(h=>({id:h.id,cells:h.cells,support:h.cells.filter(c=>this.view.state.domains[c]&bit)})).sort((a,b)=>a.id.localeCompare(b.id));
   const peers=current.map(c=>new Set(current.filter(d=>c!==d&&this.view.assembly.allDifferent.some(h=>h.cells.includes(c)&&h.cells.includes(d)))));
   for(const orientation of simple?["row","column"]:["mixed"]) {
    const available=deferred?houses:houses.filter(h=>h.support.every(c=>!this.view.state.values[c]));
    const basePool=available.filter(h=>this.sources.has(h.cells,symbol)&&(!simple||h.id.startsWith(orientation+":")));
    const coverPool=simple?available.filter(h=>h.id.startsWith((orientation==="row"?"column":"row")+":")):available;
    for(const bases of this.ordered(basePool,n)) {
     yield {kind:"work",units:1};
     const b=current.map(c=>bases.reduce((v,h)=>v+Number(h.cells.includes(c)),0));
     if(!simple&&b.some(v=>v>1)!==overlap)continue;
     // Siamese pairs retain only the current base set and release on each step.
     const pairLease=this.context.workspace.reserve(0,1024),parts:{pattern:FishComponent;effects:readonly Effect[];shared:boolean;deferred:boolean}[]=[];
     try {
      const coverCursor=simple?this.ordered(coverPool,n):this.coverSets(coverPool,n,current,b,peers,pairLease);
      for(const coverEvent of coverCursor) {
       if(!Array.isArray(coverEvent)){yield coverEvent;continue;}
       const covers=coverEvent;
       yield {kind:"work",units:1};
       const selectedShared=bases.some(b=>covers.some(c=>b.id===c.id)),selectedDeferred=[...bases,...covers].some(h=>h.support.some(c=>this.view.state.values[c]));
       // Later Siamese passes must retain earlier components too, so pairs
       // crossing an ordering partition are neither lost nor duplicated.
       if(!simple&&(this.family==="C09"?!sharedHouses&&selectedShared:selectedShared!==sharedHouses))continue;
       if(deferred&&!selectedDeferred&&this.family!=="C09")continue;
       const u=current.map(c=>covers.reduce((v,h)=>v+Number(h.cells.includes(c)),0));
       const finIndexes=b.flatMap((v,i)=>v>1||(v>0&&u[i]===0)?[i]:[]);
       if(finIndexes.length>(this.family==="C06"?0:4))continue;
       const fins=finIndexes.map(i=>current[i]);
       if(this.family==="C07"&&(!fins.length||new Set(fins.map(c=>Math.floor(c/27)*3+Math.floor(c%9/3))).size!==1))continue;
       let effects=current.flatMap((cell,i)=>u[i]>b[i]&&!this.view.state.values[cell]&&finIndexes.every(j=>peers[i].has(current[j]))?[{kind:"remove" as const,cell,symbol}]:[]);
       if(!effects.length)continue;
       const baseIds=bases.map(h=>h.id),coverIds=covers.map(h=>h.id);
       const form=simple?(this.family==="C06"?"basic":bases.some(h=>h.support.filter(c=>!fins.includes(c)).length<2)?"sashimi":"finned"):mixedFishForm(baseIds,coverIds);
       const alias=simple?(form==="basic"?fishNames[n]:form==="finned"?"Finned fish":"Sashimi fish"):(form==="franken"?"Franken fish":"Mutant fish");
       const incidence=simple?{}:{incidence:Array.from({length:81},(_,c)=>covers.reduce((v,h)=>v+Number(h.cells.includes(c)),0)-bases.reduce((v,h)=>v+Number(h.cells.includes(c)),0))};
       const pattern:FishComponent={alias,form,size:n,symbol,bases:baseIds,covers:coverIds,fins,...incidence};
       if(this.family!=="C09") {yield {pattern,effects};continue;}
       const ownPass=selectedShared===sharedHouses&&(!deferred||selectedDeferred);
       if(ownPass&&!paired&&finIndexes.some(i=>b[i]>1))yield {pattern:{...pattern,alias:"Endo-fin fish"},effects};
       const cannibal=effects.filter(e=>b[current.indexOf(e.cell)]>0);
       if(ownPass&&!paired&&cannibal.length)yield {pattern:{...pattern,alias:"Cannibalistic fish"},effects:cannibal};
       if(!paired)continue;
       for(const previous of parts) {
        yield {kind:"work",units:1};
        if((previous.shared||selectedShared)!==sharedHouses||deferred&&!previous.deferred&&!selectedDeferred)continue;
        if(new Set([...previous.pattern.fins,...fins]).size>4)continue;
        if((previous.effects.length===effects.length&&previous.effects.every((e,i)=>e.cell===effects[i].cell))!==equalEffects)continue;
        const union=[...new Map([...previous.effects,...effects].map(e=>[e.cell,e])).values()].sort((a,b)=>a.cell-b.cell);
        yield {pattern:{alias:"Siamese fish",size:n,symbol,components:[previous.pattern,pattern]},effects:union};
       }
       pairLease.grow(1,8192);parts.push({pattern,effects,shared:selectedShared,deferred:selectedDeferred});
      }
     } finally {pairLease.dispose();}
    }
   }
  }
  } finally {scratch.dispose();}
 }
}

class FishTechnique implements TechniqueDescriptor {
 readonly id:string;readonly aliases:readonly string[];readonly tier:number;readonly requires:readonly string[];
 readonly assumptionPolicy:"unconditional"|"discharged";readonly bounds;
 constructor(readonly family:string) {
  const row=coverageEntries.find(r=>r.id===family)!;this.id=row.version;this.aliases=row.aliases;this.tier=row.tier;this.requires=row.capabilities;
  this.assumptionPolicy=family==="C06"?"unconditional":"discharged";
  this.bounds=Object.freeze({maxLength:0,maxBranchDepth:family==="C06"?0:1,maxAlternatives:family==="C06"?9:2,maxPatternCells:81,maxSetSize:["C06","C07"].includes(family)?7:4});
 }
 watches() {return [{kind:"all" as const}];}
 eligible(view:ReadView) {
  const facts=new Set<string>();
  for(const f of view.facts.values())if(!f.openAssumptions.length&&(f.proposition.kind==="cover"||f.proposition.kind==="all-different"))
   facts.add(sourceKey(f.proposition.cells,f.proposition.kind==="cover"?f.proposition.symbol:0));
  const houses=classicScopes(view).filter(h=>facts.has(sourceKey(h.cells,0))),simple=["C06","C07"].includes(this.family);
  const possible=view.assembly.problem.symbols.some(symbol=>{
   const bases=houses.filter(h=>facts.has(sourceKey(h.cells,symbol)));
   return simple?["row","column"].some(orientation=>bases.filter(h=>h.id.startsWith(orientation+":" )).length>=2&&
    houses.filter(h=>h.id.startsWith((orientation==="row"?"column":"row")+":" )).length>=2):bases.length>=2&&houses.length>=2;
  });
  return possible?{kind:"yes" as const}:{kind:"excluded" as const,reason:"missing-classic-capability",dependencies:this.watches()};
 }
 estimate() {return {hit:1,gain:1,cost:this.tier+1};}
 *discover(view:ReadView,context:DiscoveryContext):Discovery {
  assertOwnedView(view);
  const eligibility=this.eligible(view);if(eligibility.kind==="excluded"){yield eligibility;return;}
  let lease:WorkspaceReservation|undefined,work=0;
  try {
   lease=context.workspace.reserve(0,262144);
   const sources=new FishSources(view,lease);
   for(const event of sources.prepare()) {
    context.workspace.checkpoint();work+=event.units;if(work>context.limits.workUnits){yield {kind:"interrupted",reason:"work-limit"};return;}yield event;
   }
   const search=new FishSearch(view,this.family,context,sources);
   for(const event of search.patterns()) {
    context.workspace.checkpoint();
    if("kind" in event) {
     work+=event.units;if(work>context.limits.workUnits){yield {kind:"interrupted",reason:"work-limit"};return;}
     yield event;continue;
    }
    const compilation=context.workspace.reserve(0,65536);
    try {
     const compiler=new FishCompiler(view,compilation,sources).compile(this.id,event);let proposal:DeductionProposal;
     try {while(true) {
      context.workspace.checkpoint();const next=compiler.next();if(next.done){proposal=next.value;break;}
      work+=next.value.units;if(work>context.limits.workUnits){yield {kind:"interrupted",reason:"work-limit"};return;}yield next.value;
     }} finally {compiler.return(undefined as never);}
     if(proposal.proof.nodes.length>context.limits.stepNodes||JSON.stringify(proposal).length*2>context.limits.stepBytes){yield {kind:"interrupted",reason:"proof-step-limit"};return;}
     yield {kind:"proposal",proposal};
    } finally {compilation.dispose();}
   }
   yield {kind:"exhausted"};
  } catch(error) {if(error instanceof IndexInterrupted)yield {kind:"interrupted",reason:error.reason};else throw error;}
  finally {lease?.dispose();}
 }
}
export const fishTechniques:readonly TechniqueDescriptor[]=Object.freeze(["C06","C07","C08","C09"].map(id=>Object.freeze(new FishTechnique(id))));
