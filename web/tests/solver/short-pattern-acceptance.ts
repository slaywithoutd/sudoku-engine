import type { Json } from "../../src/solver/problem";
import type { DeductionProposal,Effect,ProofNode,Proposition } from "../../src/solver/proof/types";
import type { ReadView } from "../../src/solver/state/types";
import { fixtureView,type TechniqueFixture } from "./acceptance";
import { discoveryContext } from "./discovery-context";
import { getTechniques } from "../../src/solver/techniques/registry";
import c10 from "./fixtures/C10.json";
import c11 from "./fixtures/C11.json";
import c12 from "./fixtures/C12.json";
import c13 from "./fixtures/C13.json";

export const allShortFixtures=[...c10,...c11,...c12,...c13] as unknown as TechniqueFixture[];
export const shortFixtures=allShortFixtures.filter(f=>f.expectation!=="reject"&&f.expectation!=="out-of-profile");
export function shortFixture(id:string) {const f=shortFixtures.find(f=>f.id===id);if(!f)throw Error(`fixture:${id}`);return structuredClone(f);}
export function patternKey(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(patternKey).join(",")}]`;
  if(value&&typeof value==="object")return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}:${patternKey(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function findShort(f:TechniqueFixture,maxWork=2000000) {
  const view=fixtureView(f),context=discoveryContext(),detector=getTechniques("classic-expanded@1").find(d=>d.id===f.rowId.toLowerCase()+"@1")!;
  let work=0,proposals=0;
  for(const event of detector.discover(view,context)) {
    if(event.kind==="work") {work+=event.units;if(work>maxWork)throw Error(`fixture-work:${f.id}:${proposals}`);}
    if(event.kind==="proposal") {proposals++;if(patternKey(event.proposal.pattern)===patternKey(f.expectedPattern))return {view,proposal:event.proposal,work,proposals};}
    if(event.kind==="interrupted")throw Error(`fixture-interrupted:${f.id}:${event.reason}:${work}:${proposals}`);
  }
  throw Error(`fixture-not-found:${f.id}:${work}:${proposals}`);
}

type Term={cell:number;symbol:number;positive:boolean};
/** Independently written test certificate algebra, never production builders or validators.
 * Original seed geometry and effects supply every premise. Resolution eliminates
 * local variables; pruning keeps only nodes used by the independently selected roots.
 */
export class FixtureProof {
  readonly nodes:ProofNode[]=[];readonly memo=new Map<string,number>();next:number;
  constructor(readonly view:ReadView) {this.next=Math.max(...view.facts.keys())+1;}
  add(rule:string,premises:number[],conclusion:Proposition,parameters:Json={}) {
    const key=JSON.stringify([rule,premises,conclusion,parameters]);const prior=this.memo.get(key);if(prior!==undefined)return prior;
    const id=this.next++;this.nodes.push({id,rule,premises,conclusion,parameters,scope:[]});this.memo.set(key,id);return id;
  }
  clause(terms:Term[]):Proposition {
    const sorted=terms.sort((a,b)=>a.cell-b.cell||a.symbol-b.symbol||Number(a.positive)-Number(b.positive));
    const distinct=sorted.filter((l,i)=>!i||JSON.stringify(l)!==JSON.stringify(sorted[i-1]));
    return distinct.length===0?{kind:"false"}:distinct.length===1?{kind:"literal",value:distinct[0]}:{kind:"clause",alternatives:distinct};
  }
  terms(id:number):Term[] {const p=this.nodes.find(n=>n.id===id)!.conclusion;return p.kind==="literal"?[p.value]:p.kind==="clause"?[...p.alternatives]:[];}
  scope(a:number,b:number) {const fact=[...this.view.facts.values()].find(f=>f.proposition.kind==="all-different"&&f.proposition.cells.includes(a)&&f.proposition.cells.includes(b));if(!fact)throw Error("independent-no-peer");return fact.id;}
  weak(a:Term,b:Term) {return this.add("weak-link@1",[a.cell===b.cell?this.view.state.domainFacts[a.cell]:this.scope(a.cell,b.cell)],this.clause([{...a,positive:false},{...b,positive:false}]));}
  cell(cell:number) {const choices=Array.from({length:9},(_,i)=>i+1).filter(s=>Math.floor(this.view.state.domains[cell]/2**(s-1))%2);
    return this.add("cover-clause@1",[this.view.state.domainFacts[cell]],this.clause(choices.map(symbol=>({cell,symbol,positive:true}))));}
  house(id:string,symbol:number) {const scope=this.view.assembly.allDifferent.find(h=>h.id===id)!.cells;
    const source=[...this.view.facts.values()].find(f=>f.proposition.kind==="cover"&&f.proposition.symbol===symbol&&JSON.stringify(f.proposition.cells)===JSON.stringify(scope))!;
    const cells=scope.filter(c=>Math.floor(this.view.state.domains[c]/2**(symbol-1))%2);
    const support=this.add("support@1",[source.id,...scope.map(c=>this.view.state.domainFacts[c])],{kind:"cover",symbol,cells});
    return this.add("cover-clause@1",[support],this.clause(cells.map(cell=>({cell,symbol,positive:true}))));
  }
  resolve(a:number,b:number,cell:number,symbol:number) {
    return this.add("resolution@1",[a,b],this.clause([...this.terms(a),...this.terms(b)].filter(l=>l.cell!==cell||l.symbol!==symbol)));
  }
  shortEndpoint(path:{symbol:number;vertices:number[][];strongHouses:string[]}) {
    const first=this.house(path.strongHouses[0],path.symbol);let end=this.house(path.strongHouses[1],path.symbol);
    for(const y of path.vertices[2]) {
      let notY=first;
      for(const x of path.vertices[1])notY=this.resolve(notY,this.weak({cell:x,symbol:path.symbol,positive:true},
        {cell:y,symbol:path.symbol,positive:true}),x,path.symbol);
      end=this.resolve(end,notY,y,path.symbol);
    }
    return end;
  }
  eliminate(ids:number[],target:Term):number {
    let clauses=ids.map(id=>({id,terms:this.terms(id)}));
    const variables=[...new Set(clauses.flatMap(c=>c.terms.map(l=>`${l.cell}:${l.symbol}`)))].filter(k=>k!==`${target.cell}:${target.symbol}`);
    for(const key of variables) {
      const plus=clauses.filter(c=>c.terms.some(l=>`${l.cell}:${l.symbol}`===key&&l.positive));
      const minus=clauses.filter(c=>c.terms.some(l=>`${l.cell}:${l.symbol}`===key&&!l.positive));
      clauses=clauses.filter(c=>!c.terms.some(l=>`${l.cell}:${l.symbol}`===key));
      for(const a of plus)for(const b of minus) {
        const terms=[...a.terms,...b.terms].filter(l=>`${l.cell}:${l.symbol}`!==key);
        if(terms.some(l=>terms.some(m=>l.cell===m.cell&&l.symbol===m.symbol&&l.positive!==m.positive)))continue;
        const conclusion=this.clause(terms);
        const normalized=conclusion.kind==="literal"?[conclusion.value]:conclusion.kind==="clause"?[...conclusion.alternatives]:[];
        if(clauses.some(c=>JSON.stringify(c.terms)===JSON.stringify(normalized)))continue;
        clauses.push({id:this.add("resolution@1",[a.id,b.id],conclusion),terms:normalized});
      }
    }
    const result=clauses.find(c=>c.terms.length===1&&JSON.stringify(c.terms[0])===JSON.stringify({...target,positive:false}));
    if(!result)throw Error("independent-resolution-failed");return result.id;
  }
  table(p:Record<string,any>) {
    const sources=p.cells.map((c:number)=>this.view.state.domainFacts[c]) as number[];
    for(const pair of p.conflicts as number[][])sources.push(this.add("all-different-subset@1",[this.scope(pair[0],pair[1])],{kind:"all-different",cells:pair}));
    const recurse=(masks:number[]):{id:number;count:number}=>{
      const choices=masks.map(mask=>Array.from({length:9},(_,i)=>i+1).filter(s=>Math.floor(mask/2**(s-1))%2));
      if(choices.reduce((n,c)=>n*c.length,1)>256) {
        const at=choices.findIndex(c=>c.length>1),left=[...masks],right=[...masks];left[at]=2**(choices[at][0]-1);right[at]-=left[at];
        const a=recurse(left),b=recurse(right),count=a.count+b.count;
        return {id:this.add("table-union@1",[a.id,b.id],{kind:"table",cells:p.cells,count,definition:this.next}),count};
      }
      let count=0;const visit=(tuple:number[])=>{if(tuple.length===p.cells.length) {if(p.conflicts.every(([a,b]:number[])=>tuple[p.cells.indexOf(a)]!==tuple[p.cells.indexOf(b)]))count++;return;}
        for(const symbol of choices[tuple.length])visit([...tuple,symbol]);};visit([]);
      return {id:this.add("table-filter@1",sources,{kind:"table",cells:p.cells,count,definition:this.next},{cells:p.cells,box:masks}),count};
    };
    const table=recurse(p.cells.map((c:number)=>this.view.state.domains[c]));
    if(!table.count)throw Error("independent-empty-local-table");
    return this.add("table-project@1",[table.id],this.clause(p.occurrences[p.nonrestrictedSymbol].map((cell:number)=>({cell,symbol:p.nonrestrictedSymbol,positive:true}))));
  }
  finish(f:TechniqueFixture,roots:number[]) {
    const masks=new Map<number,{mask:number;id:number}>();f.expectedEffects.forEach((e,i)=>{const prev=masks.get(e.cell)??{mask:this.view.state.domains[e.cell],id:this.view.state.domainFacts[e.cell]};
      const mask=prev.mask-2**(e.symbol-1),id=this.add("domain-restrict@1",[prev.id,roots[i]],{kind:"domain",cell:e.cell,mask});masks.set(e.cell,{mask,id});});
    roots.push(...[...masks.values()].map(v=>v.id));
    const needed=new Set<number>(),pending=[...roots];while(pending.length){const id=pending.pop()!;if(needed.has(id))continue;needed.add(id);const n=this.nodes.find(n=>n.id===id);if(n)pending.push(...n.premises);}
    return {technique:f.rowId.toLowerCase()+"@1",pattern:f.expectedPattern,effects:f.expectedEffects,state:this.view.state.key,
      proof:{state:this.view.state.key,nodes:this.nodes.filter(n=>needed.has(n.id)),imports:[...needed].filter(id=>this.view.facts.has(id)).sort((a,b)=>a-b),roots}};
  }
}
const positive=(cell:number,symbol:number):Term=>({cell,symbol,positive:true});
export function independentShortCertificate(f:TechniqueFixture):DeductionProposal {
  const view=fixtureView(f),b=new FixtureProof(view),p=f.expectedPattern as Record<string,any>,roots:number[]=[];
  const sees=(a:number,c:number)=>Math.floor(a/9)===Math.floor(c/9)||a%9===c%9||Math.floor(a/27)*3+Math.floor(a%9/3)===Math.floor(c/27)*3+Math.floor(c%9/3);
  for(const e of f.expectedEffects) {
    const clauses:number[]=[],target=positive(e.cell,e.symbol);let occurrences:number[]=[];
    if(f.rowId==="C10") {
      const path=p.paths.find((path:any)=>[...path.vertices[0],...path.vertices[3]].every((c:number)=>c!==e.cell&&sees(c,e.cell)));
      const [a,c,d,z]=path.vertices as number[][];clauses.push(...path.strongHouses.map((h:string)=>b.house(h,path.symbol)));
      const first=clauses[0],last=clauses[1];clauses.length=0;
      let end=last;
      for(const y of d) {
        let notY=first;
        for(const x of c) {
          const weak=b.weak(positive(x,e.symbol),positive(y,e.symbol));
          notY=b.add("resolution@1",[notY,weak],b.clause([...b.terms(notY).filter(l=>l.cell!==x),{cell:y,symbol:e.symbol,positive:false}]));
        }
        end=b.add("resolution@1",[end,notY],b.clause([...b.terms(end).filter(l=>l.cell!==y),...b.terms(notY).filter(l=>l.cell!==y)]));
      }
      clauses.push(end);occurrences=[...a,...z];
    } else if(f.rowId==="C11"&&p.alias!=="W-Wing") {
      clauses.push(...[p.pivot,...p.wings].map(c=>b.cell(c)));
      clauses.push(b.weak(positive(p.pivot,p.x),positive(p.wings[0],p.x)),b.weak(positive(p.pivot,p.y),positive(p.wings[1],p.y)));
      occurrences=[...p.wings,...(p.alias==="XYZ-Wing"?[p.pivot]:[])];
    } else if(f.rowId==="C11") {
      clauses.push(...p.endpoints.map((c:number)=>b.cell(c)),b.house(p.cover,p.bridgeSymbol));
      clauses.push(b.weak(positive(p.endpoints[0],p.bridgeSymbol),positive(p.bridge[0],p.bridgeSymbol)),
        b.weak(positive(p.endpoints[1],p.bridgeSymbol),positive(p.bridge[1],p.bridgeSymbol)));occurrences=p.endpoints;
    } else if(f.rowId==="C13") {
      clauses.push(...p.cells.map((c:number)=>b.cell(c)));
      for(let i=1;i<p.cells.length;i++)for(const symbol of p.symbols)clauses.push(b.weak(positive(p.cells[i-1],symbol),positive(p.cells[i],symbol)));
      occurrences=[p.cells[0],p.cells.at(-1)];
    } else {clauses.push(b.table(p));occurrences=p.occurrences[p.nonrestrictedSymbol];}
    clauses.push(...occurrences.map(c=>b.weak(positive(c,e.symbol),target)));roots.push(b.eliminate(clauses,target));
  }
  return b.finish(f,roots);
}
