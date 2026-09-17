import type { ReadView } from "../state/types";
import type { DeductionProposal, ProofNode } from "../proof/types";
import { clause, requireProof, sameValue } from "../proof/primitives";

export const requireFields=(p:object,keys:string[])=>requireProof(p&&sameValue(Object.keys(p).sort(),keys.sort()),"invalid-specialized-fields");
export const orderedNumbers=(p:unknown):p is number[]=>Array.isArray(p)&&p.every((x,i)=>Number.isSafeInteger(x)&&(!i||x>p[i-1]));
export const cellBox=(c:number)=>Math.floor(c/27)*3+Math.floor(c%9/3);
/** Independent named-proof inspection. This does not call a detector, builder,
 * production tuple iterator, or primitive semantic implementation. */
export class SpecializedAdmission {
  constructor(readonly proposal:DeductionProposal,readonly view:ReadView,readonly available:ReadonlyMap<number,ProofNode>){}
  node(id:number,rule?:string):ProofNode {
    const n=this.available.get(id);requireProof(n&&(!rule||n.rule===rule)&&!n.scope.length,`missing-specialized-node:${id}:${rule}:${n?.rule}`);return n;
  }
  house(kind:"row"|"column"|"box",i:number):readonly number[] {
    requireProof(Number.isInteger(i)&&i>=0&&i<9,"invalid-specialized-house");
    const cells=Array.from({length:81},(_,c)=>c).filter(c=>(kind==="row"?Math.floor(c/9):kind==="column"?c%9:cellBox(c))===i);
    requireProof(this.view.assembly.allDifferent.some(h=>sameValue(h.cells,cells)),"missing-specialized-house");return cells;
  }
  domain(c:number):number {requireProof(this.view.assembly.problem.cells.includes(c),"specialized-cell-bound");return this.view.state.domains[c];}
  symbols(c:number):number[]{return this.view.assembly.problem.symbols.filter(s=>this.domain(c)&(1<<(s-1)));}
  peer(a:number,b:number):boolean{return a!==b&&this.view.assembly.allDifferent.some(h=>h.cells.includes(a)&&h.cells.includes(b));}
  scope(id:number,cells:readonly number[]):void {
    const n=this.node(id,"all-different-subset@1");
    requireProof(n.premises.length===1&&sameValue(n.conclusion,{kind:"all-different",cells:[...cells].sort((a,b)=>a-b)}),"invalid-specialized-conflict");
    const fact=this.view.facts.get(n.premises[0]);
    requireProof(fact&&!fact.openAssumptions.length&&fact.proposition.kind==="all-different"&&cells.every(c=>fact.proposition.kind==="all-different"&&fact.proposition.cells.includes(c)),"unproved-specialized-conflict");
  }
  support(root:number,cells:readonly number[],symbol:number):void {
    const n=this.node(root,"cover-clause@1"),support=this.node(n.premises[0],"support@1");
    requireProof(n.premises.length===1&&sameValue(support.premises.slice(1),cells.map(c=>this.view.state.domainFacts[c]))&&
      sameValue(n.conclusion,clause(cells.filter(c=>this.domain(c)&(1<<(symbol-1))).map(cell=>({cell,symbol,positive:true})))),"incomplete-specialized-cover");
    const source=this.view.facts.get(support.premises[0]);
    requireProof(source&&!source.openAssumptions.length&&sameValue(source.proposition,{kind:"cover",cells,symbol}),"unproved-specialized-cover");
  }
  local(id:number,cells:readonly number[],scopes:readonly (readonly number[])[],domainIds=cells.map(c=>this.view.state.domainFacts[c]),masks=cells.map(c=>this.domain(c))):void {
    const leaves:number[][]=[];
    const walk=(id:number):number[]=> {
      const n=this.node(id),p=n.parameters as {cells:number[];box:number[]};
      requireProof(n.conclusion.kind==="table"&&n.conclusion.definition===id&&sameValue(n.conclusion.cells,cells),"invalid-specialized-table");
      if(n.rule==="table-union@1") {
        requireProof(n.premises.length===2,"invalid-specialized-partition");
        const a=walk(n.premises[0]),b=walk(n.premises[1]),diff=a.flatMap((x,i)=>x===b[i]?[]:[i]);
        requireProof(diff.length===1&&!(a[diff[0]]&b[diff[0]]),"invalid-specialized-partition");return a.map((x,i)=>x|b[i]);
      }
      requireProof(n.rule==="table-filter@1"&&sameValue(p.cells,cells)&&Array.isArray(p.box)&&p.box.length===cells.length&&
        n.premises.length===cells.length+scopes.length&&sameValue(n.premises.slice(0,cells.length),domainIds),"incomplete-specialized-local-sources");
      scopes.forEach((g,i)=>this.scope(n.premises[cells.length+i],g));leaves.push([...n.premises]);return p.box;
    };
    requireProof(sameValue(walk(id),masks)&&leaves.every(s=>sameValue(s,leaves[0])),"incomplete-specialized-local-domain");
  }
  /** Exact singleton-cover restrictions, with every original domain retained. */
  restrictedLocal(id:number,cells:readonly number[],scopes:readonly (readonly number[])[],roots:readonly number[]):void {
    let leaf=this.node(id);while(leaf.rule==="table-union@1")leaf=this.node(leaf.premises[0]);
    const sources=leaf.premises.slice(0,cells.length),masks=cells.map((cell,i)=> {
      const required=[...new Set(roots)].filter(root=>{const c=this.node(root).conclusion;return c.kind==="literal"&&c.value.positive&&c.value.cell===cell;});
      let source=sources[i];
      for(const root of [...required].reverse()) {
        const n=this.node(source,"domain-restrict@1");requireProof(n.premises.length===2&&n.premises[1]===root,"substituted-specialized-domain");source=n.premises[0];
      }
      requireProof(source===this.view.state.domainFacts[cell],"substituted-specialized-domain");
      return required.reduce((mask,root)=>{const c=this.node(root).conclusion;requireProof(c.kind==="literal","invalid-specialized-domain");return mask&(1<<(c.value.symbol-1));},this.domain(cell));
    });
    this.local(id,cells,scopes,sources,masks);
  }
  join(id:number,left:number,right:number,filters:readonly number[]):void {
    const n=this.node(id,"table-join-filter@1");
    requireProof(sameValue(n.premises,[left,right,...filters])&&n.conclusion.kind==="table"&&n.conclusion.definition===id,"invalid-specialized-join");
  }
  joinPeers(id:number,left:number,right:number,extra:readonly number[]=[]):void {
    const a=this.node(left).conclusion,b=this.node(right).conclusion,n=this.node(id,"table-join-filter@1");
    requireProof(a.kind==="table"&&b.kind==="table","invalid-specialized-join");
    const pairs:number[][]=[];
    for(const x of a.cells)for(const y of b.cells)if(x!==y&&this.peer(x,y)&&!a.cells.includes(y)&&!b.cells.includes(x))pairs.push([x,y]);
    requireProof(n.premises.length===2+pairs.length+extra.length&&sameValue(n.premises.slice(0,2),[left,right])&&sameValue(n.premises.slice(2+pairs.length),extra),"incomplete-specialized-join-conflicts");
    pairs.forEach((p,i)=>this.scope(n.premises[2+i],p));
  }
  directEffects(table:number):void {
    requireProof(this.proposal.effects.length>0,"unproductive-specialized-step");
    for(const e of this.proposal.effects) {
      requireProof(e.kind==="remove","invalid-specialized-effect");
      const claim={kind:"literal",value:{cell:e.cell,symbol:e.symbol,positive:false}};
      const roots=this.proposal.proof.roots.filter(id=>sameValue(this.available.get(id)?.conclusion,claim));
      requireProof(roots.length>0,"missing-specialized-effect-root");
      for(const id of roots)requireProof(this.node(id).rule==="table-project@1"&&sameValue(this.node(id).premises,[table]),"substituted-specialized-effect-root");
    }
  }
}
