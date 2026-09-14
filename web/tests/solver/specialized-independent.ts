import type { DeductionProposal, Effect, Proposition } from "../../src/solver/proof/types";
import { FixtureProof } from "./short-pattern-acceptance";
import { specializedState } from "./specialized-state";
import { independentDigits, independentPeer, independentProduct } from "./specialized-algebra";

type Relation={id:number;cells:number[];rows:number[][]};
const cellsOf=(id:string)=>{const [kind,i]=id.split(":");return Array.from({length:81},(_,c)=>c).filter(c=>(kind==="row"?Math.floor(c/9):kind==="column"?c%9:Math.floor(c/27)*3+Math.floor(c%9/3))===Number(i));};
const box=(c:number)=>Math.floor(c/27)*3+Math.floor(c%9/3);
const sorted=(xs:readonly number[])=>[...new Set(xs)].sort((a,b)=>a-b);
const positive=(cell:number,symbol:number)=>({cell,symbol,positive:true});

/** Test-only independent assembly from explicit source fixtures. This class
 * uses the older test wire algebra; it imports no specialized production code,
 * detector, recognizer, table iterator or weighted-count helper. */
class IndependentSpecializedProof extends FixtureProof {
 fact(kind:"cover"|"all-different",cells:number[],symbol?:number):number {
  const p=kind==="cover"?{kind,cells,symbol}:{kind,cells};
  const found=[...this.view.facts.values()].find(f=>f.proposition.kind===kind&&JSON.stringify(f.proposition.cells)===JSON.stringify(cells)&&(f.proposition.kind!=="cover"||f.proposition.symbol===symbol));
  if(!found)throw Error("independent-source");return found.id;
 }
 subset(cells:number[]):number {
  const selected=sorted(cells),scope=[...this.view.facts.values()].find(f=>f.proposition.kind==="all-different"&&selected.every(c=>f.proposition.kind==="all-different"&&f.proposition.cells.includes(c)))!;
  return this.add("all-different-subset@1",[scope.id],{kind:"all-different",cells:selected});
 }
 localRows(cells:number[],groups:number[][]=[],domains=new Map<number,{id:number;mask:number}>()):Relation {
  cells=sorted(cells);const premises=[...cells.map(c=>domains.get(c)?.id??this.view.state.domainFacts[c]),...groups.map(g=>this.subset(g))];
  const partition=(masks:number[]):Relation=> {
   const alternatives=masks.map(independentDigits);
   if(alternatives.reduce((n,a)=>n*a.length,1)>256) {
    const i=alternatives.findIndex(a=>a.length>1),a=[...masks],b=[...masks];a[i]=2**(alternatives[i][0]-1);b[i]-=a[i];
    const left=partition(a),right=partition(b),rows=[...left.rows,...right.rows];
    return {id:this.add("table-union@1",[left.id,right.id],{kind:"table",cells,count:rows.length,definition:this.next}),cells,rows};
   }
   const rows=[...independentProduct(alternatives)].filter(row=>groups.every(g=>new Set(g.map(c=>row[cells.indexOf(c)])).size===g.length));
   return {id:this.add("table-filter@1",premises,{kind:"table",cells,count:rows.length,definition:this.next},{cells,box:masks}),cells,rows};
  };
  return partition(cells.map(c=>domains.get(c)?.mask??this.view.state.domains[c]));
 }
 joinRows(a:Relation,b:Relation,filters:number[]=[],peers=false):Relation {
  const cells=sorted([...a.cells,...b.cells]),extra:number[]=[];
  if(peers)for(const x of a.cells)for(const y of b.cells)if(x!==y&&independentPeer(x,y)&&!a.cells.includes(y)&&!b.cells.includes(x))extra.push(this.subset([x,y]));
  const ids=[...extra,...filters],constraints=ids.map(id=>this.nodes.find(n=>n.id===id)!.conclusion),rows:number[][]=[];
  for(const left of a.rows)for(const right of b.rows) {
   if(a.cells.some((c,i)=>b.cells.includes(c)&&left[i]!==right[b.cells.indexOf(c)]))continue;
   const row=cells.map(c=>a.cells.includes(c)?left[a.cells.indexOf(c)]:right[b.cells.indexOf(c)]);
   if(constraints.every(p=>p.kind==="all-different"?new Set(p.cells.map(c=>row[cells.indexOf(c)])).size===p.cells.length:p.kind==="clause"&&p.alternatives.some(l=>(row[cells.indexOf(l.cell)]===l.symbol)===l.positive)))rows.push(row);
  }
  return {id:this.add("table-join-filter@1",[a.id,b.id,...ids],{kind:"table",cells,count:rows.length,definition:this.next}),cells,rows};
 }
 project(t:Relation,claim:Proposition):number{return this.add("table-project@1",[t.id],claim);}
 done(row:string,pattern:any,effects:Effect[],roots:number[]):DeductionProposal {
  const domains=new Map<number,{mask:number;id:number}>();
  effects.forEach((e,i)=>{const previous=domains.get(e.cell)??{mask:this.view.state.domains[e.cell],id:this.view.state.domainFacts[e.cell]},mask=e.kind==="place"?2**(e.symbol-1):previous.mask-2**(e.symbol-1);domains.set(e.cell,{mask,id:this.add("domain-restrict@1",[previous.id,roots[i]],{kind:"domain",cell:e.cell,mask})});});
  roots=[...roots,...[...domains.values()].map(d=>d.id)];const reachable=new Set<number>(),pending=[...roots];
  while(pending.length){const id=pending.pop()!;if(reachable.has(id))continue;reachable.add(id);const node=this.nodes.find(n=>n.id===id);if(node)pending.push(...node.premises);}
  return {technique:row.toLowerCase()+"@1",state:this.view.state.key,pattern,effects,proof:{state:this.view.state.key,nodes:this.nodes.filter(n=>reachable.has(n.id)),imports:[...reachable].filter(id=>this.view.facts.has(id)).sort((a,b)=>a-b),roots}};
 }
}

export function independentSpecialized(f:any):DeductionProposal {
 const {view}=specializedState(f),b=new IndependentSpecializedProof(view),p=structuredClone(f.expectedPattern),roots:number[]=[],effects:Effect[]=structuredClone(f.expectedEffects);let table:Relation,certificate:any;
 if(f.rowId==="C29") {
  const components:any[]=[],relations:Relation[]=[];
  for(const part of p.components) {
   const [x,y,z]=[part.intersection,part.rowWing,part.columnWing],line=`row:${Math.floor(x/9)}`,cross=`column:${x%9}`,records:any[]=[];
   for(const symbol of part.symbols) {
    const row=b.house(line,symbol),column=b.house(cross,symbol),routes:any[]=[];
    for(const [lineName,crossName,wing,crossWing,start,other]of [[line,cross,y,z,row,column],[cross,line,z,y,column,row]] as const) {
     let result=start;const weak:number[]=[],steps:number[]=[];
     for(const c of cellsOf(lineName).filter(c=>c!==x&&c!==wing&&independentDigits(view.state.domains[c]).includes(symbol))) {
      let arm=other;
      for(const q of cellsOf(crossName).filter(q=>q!==crossWing&&independentDigits(view.state.domains[q]).includes(symbol))) {
       const id=b.add("weak-link@1",[b.fact("all-different",cellsOf(`box:${box(x)}`))],b.clause([{cell:c,symbol,positive:false},{cell:q,symbol,positive:false}]));
       weak.push(id);arm=b.resolve(arm,id,q,symbol);steps.push(arm);
      }
      result=b.resolve(result,arm,c,symbol);steps.push(result);
     }
     routes.push({weak,steps,root:result});
    }
    records.push({symbol,row,column,routes});
   }
   const roots:number[]=records.flatMap(c=>c.routes.map((r:any)=>r.root)),domains=new Map<number,{id:number;mask:number}>();
   for(const root of new Set(roots)) {
    const p=b.nodes.find(n=>n.id===root)!.conclusion;if(p.kind!=="literal")continue;
    const cell=p.value.cell,prior=domains.get(cell)??{id:view.state.domainFacts[cell],mask:view.state.domains[cell]},mask=prior.mask&2**(p.value.symbol-1);
    domains.set(cell,{id:b.add("domain-restrict@1",[prior.id,root],{kind:"domain",cell,mask}),mask});
   }
   const local=b.localRows([x,y,z],[[x,y],[x,z]],domains),identity=b.localRows([x]),relation=b.joinRows(local,identity,roots.filter(root=>b.nodes.find(n=>n.id===root)!.conclusion.kind==="clause"));
   components.push({covers:records,local:local.id,identity:identity.id,relation:relation.id});relations.push(relation);
  }
  table=relations.length===1?relations[0]:b.joinRows(relations[0],relations[1],[],true);certificate={components,table:table.id};
 } else if(f.rowId==="C31") {
  const components:any[]=[],relations:Relation[]=[];
  for(const plan of p.components??[p]) {
   const local=b.localRows([...plan.base,...plan.targets],[plan.base]),identity=b.localRows([plan.base[0]]),counts:any[]=[];
   for(const symbol of plan.baseSymbols)for(const base of plan.base)if(independentDigits(view.state.domains[base]).includes(symbol)) {
    const covered=plan.covers.find((c:any)=>c.symbol===symbol),clauses=covered.houses.length===1?plan.targets.map((c:number)=>[c]):[plan.targets];
    for(const targets of clauses) {
     const claim=b.clause([{cell:base,symbol,positive:false},...targets.map((c:number)=>positive(c,symbol))]);let root:number,kind:string;
     if(targets.some((c:number)=>view.state.domains[c]===2**(symbol-1))){root=b.project(local,claim);kind="domain";}
     else {
      const upper=[...covered.houses,`${plan.orientation}:${plan.orientation==="row"?Math.floor(base/9):base%9}`,`box:${box(base)}`],lower=plan.crossLines;
      const coefficients=Array(81).fill(0);lower.forEach((h:string)=>cellsOf(h).forEach(c=>coefficients[c]--));upper.forEach((h:string)=>cellsOf(h).forEach(c=>coefficients[c]++));
      const covers=lower.map((h:string)=>({premise:b.fact("cover",cellsOf(h),symbol),coefficient:1})),capacities=upper.map((h:string)=>({premise:b.fact("all-different",cellsOf(h)),coefficient:1}));
      const domains=sorted(coefficients.flatMap((n:number,c:number)=>n?[c]:[]).concat([base,...targets]));
      root=b.add("cover-count-clause@1",[...covers.map((c:any)=>c.premise),...capacities.map((c:any)=>c.premise),...domains.map(c=>view.state.domainFacts[c])],claim,{symbol,covers,capacities});kind="count";
     }
     counts.push({base,symbol,targets,kind,root});
    }
   }
   const relation=b.joinRows(local,identity,counts.map(c=>c.root));relations.push(relation);components.push({local:local.id,identity:identity.id,counts,relation:relation.id});
  }
  table=relations.length===1?relations[0]:b.joinRows(relations[0],relations[1],[],true);certificate={components,table:table.id};
 } else if(f.rowId==="C30") {
  const locals=p.groups.map((g:number[])=>b.localRows(g,[g])),joins:number[]=[];let ring:Relation=locals[0];
  locals.slice(1).forEach((next:Relation)=>{ring=b.joinRows(ring,next,[],true);joins.push(ring.id);});
  table=ring;const routes:any[]=[];
  for(const e of effects) {
   const link=p.links.findIndex((l:any,i:number)=>l.symbols.includes(e.symbol)&&cellsOf(l.house).includes(e.cell)&&!p.groups.flat().includes(e.cell)),cells=sorted([...p.groups[link],...p.groups[(link+1)%8]]),weak:number[]=[];
   const cover=b.project(table,b.clause(cells.map(c=>positive(c,e.symbol))));let root=cover;
   for(const c of cells){const edge=b.add("weak-link@1",[b.fact("all-different",cellsOf(p.links[link].house))],b.clause([{cell:c,symbol:e.symbol,positive:false},{cell:e.cell,symbol:e.symbol,positive:false}]));weak.push(edge);root=b.resolve(root,edge,c,e.symbol);}
   roots.push(root);routes.push({link,symbol:e.symbol,cell:e.cell,cover,weak,root});
  }
  certificate={locals:locals.map((l:Relation)=>l.id),joins,table:table.id,routes};
 } else {
  const permutations:number[][][]=p.triples.map((t:number[])=>[...independentProduct(t.map(c=>independentDigits(view.state.domains[c]).filter(s=>p.coreSymbols.includes(s))))].filter(row=>new Set(row).size===3)),rejections:number[][]=[],all:number[]=p.triples.flat();
  for(const indices of independentProduct(permutations.map(v=>v.map((_,i)=>i)))) {
   const row=indices.flatMap((j,i)=>permutations[i][j]);let pair:number[]|undefined;
   for(let i=0;i<12&&!pair;i++)for(let j=i+1;j<12;j++)if(independentPeer(all[i],all[j])&&row[i]===row[j]){pair=[all[i],all[j]];break;}
   if(!pair)throw Error("independent-surviving-core");rejections.push(pair);
  }
  const locals:Relation[]=p.triples.map((t:number[])=>b.localRows(t,[t])),joins:number[]=[];table=locals[0];
  locals.slice(1).forEach(next=>{table=b.joinRows(table,next,[],true);joins.push(table.id);});
  const theorem=b.project(table,b.clause(p.guardians.map((g:any)=>positive(g.cell,g.symbol))));certificate={permutations,rejections,locals:locals.map(l=>l.id),joins,table:table.id,theorem};roots.push(theorem);
  if(p.guardians.length===1) {
   const g=p.guardians[0];for(let c=0;c<81;c++)if(independentPeer(c,g.cell)&&!view.state.values[c]&&independentDigits(view.state.domains[c]).includes(g.symbol)) {
    const edge=b.weak(positive(g.cell,g.symbol),positive(c,g.symbol));roots.push(b.resolve(theorem,edge,g.cell,g.symbol));effects.push({kind:"remove",cell:c,symbol:g.symbol});
   }
  }
 }
 if(f.rowId==="C29"||f.rowId==="C31")for(const e of effects)roots.push(b.project(table!,{kind:"literal",value:{cell:e.cell,symbol:e.symbol,positive:false}}));
 return b.done(f.rowId,{...p,certificate},effects,roots);
}
