import type { Json } from "../problem";
import type { ReadView,Literal,Proposition } from "../state/types";
import type { DeductionProposal,Effect,ProofNode } from "../proof/types";
import type { Discovery,DiscoveryContext,TechniqueDescriptor } from "./types";
import { coverageEntries } from "./manifest";
import { buildImplications, type ImplicationIndex, type ImplicationEdge, type CoverEntry } from "../indexes/implications";
import { IndexInterrupted, type WorkspaceReservation } from "../indexes/workspace";
import { clause, literals } from "../proof/primitives";
import { pos,neg, type BentPattern } from "./pattern-contracts";

/** Borrowed graph recipes live only under this invocation's shared lease. */
export class PatternGraph {
  readonly weak=new Map<string,ImplicationEdge>();
  readonly scopes=new Map<string,number>();readonly covers=new Map<string,CoverEntry>();
  compilation:WorkspaceReservation|undefined;nextNode=0;
  constructor(readonly index:ImplicationIndex,readonly context:DiscoveryContext,readonly lease:WorkspaceReservation) {}
  key(a:Literal,b:Literal) {return [a,b].map(l=>`${l.cell}:${l.symbol}`).sort().join("/");}
  has(a:Literal,b:Literal) {return this.index.weak(a,b);}
  *prepare(view:ReadView):Generator<{kind:"work";units:number}> {
    for(const [id,fact] of view.facts) {
      this.context.workspace.checkpoint();yield {kind:"work",units:1};this.nextNode=Math.max(this.nextNode,id+1);
      if(fact.openAssumptions.length||fact.proposition.kind!=="all-different")continue;
      const cells=fact.proposition.cells;
      for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++) {
        this.context.workspace.checkpoint();yield {kind:"work",units:1};const key=`${cells[i]}:${cells[j]}`;
        if(!this.scopes.has(key)){this.lease.grow(1,256);this.scopes.set(key,id);}
      }
    }
    for(const cover of this.index.covers) {
      this.context.workspace.checkpoint();yield {kind:"work",units:1};
      const source=view.facts.get(cover.recipe.source)!.proposition;
      if(cover.recipe.kind!=="house-cover"||source.kind!=="cover")continue;
      const key=`${source.cells.join()}/${source.symbol}`;
      if(!this.covers.has(key)){this.lease.grow(1,512);this.covers.set(key,cover);}
    }
    for(const edge of this.index.edges) {
      this.context.workspace.checkpoint();yield {kind:"work",units:1};
      if(edge.kind!=="weak") continue;
      const key=this.key(...edge.literals);
      if(!this.weak.has(key)) {this.lease.grow(1,256);this.weak.set(key,edge);}
    }
  }
}
export interface PatternStrategy { patterns(view:ReadView,graph:PatternGraph):Generator<{kind:"work";units:number}|{kind:"candidate";pattern:Json;effects:Effect[]}>;
  compile(view:ReadView,graph:PatternGraph,pattern:Json,effects:Effect[]):Generator<{kind:"work";units:number},DeductionProposal> }
/** One strategy cursor, cooperative index work, explicit interruption, deterministic cleanup. */
export function descriptor(id:string,strategy:PatternStrategy,bounds:readonly[number,number,number,number,number]):TechniqueDescriptor {
  const row=coverageEntries.find(e=>e.id===id)!;
  return Object.freeze({id:row.version,aliases:row.aliases,tier:row.tier,requires:row.capabilities,assumptionPolicy:row.assumptionPolicy,
    bounds:Object.freeze({maxLength:bounds[0],maxBranchDepth:bounds[1],maxAlternatives:bounds[2],maxPatternCells:bounds[3],maxSetSize:bounds[4]}),
    watches:()=>[{kind:"all" as const}],eligible:()=>({kind:"yes" as const}),estimate:()=>({hit:1,gain:1,cost:row.tier+1}),
    *discover(view:ReadView,context:DiscoveryContext):Discovery {
      let index:ImplicationIndex|undefined,lease:WorkspaceReservation|undefined;
      try {
        for(const event of buildImplications(view,context.workspace)) {
          if(event.kind==="ready") index=event.value;
          else {yield event;if(event.kind==="interrupted") return;}
        }
        if(!index||!index.completeFor(view)) throw Error("incomplete-pattern-index");
        lease=context.workspace.reserve(0,65536);
        const graph=new PatternGraph(index,context,lease);yield* graph.prepare(view);
        for(const event of strategy.patterns(view,graph)) {
          context.workspace.checkpoint();
          if(event.kind==="work") {yield event;continue;}
          graph.compilation=context.workspace.reserve(0,65536);
          try {
          const compiler=strategy.compile(view,graph,event.pattern,event.effects);
          let proposal:DeductionProposal;
          try {while(true){context.workspace.checkpoint();const next=compiler.next();if(next.done){proposal=next.value;break;}yield next.value;}}
          finally {compiler.return(undefined as never);}
          if(proposal.proof.nodes.length>context.limits.stepNodes||JSON.stringify(proposal).length*2>context.limits.stepBytes) {
            yield {kind:"interrupted",reason:"proof-step-limit"};return;
          }
          yield {kind:"proposal",proposal};
          } finally {graph.compilation.dispose();graph.compilation=undefined;}
        }
        yield {kind:"exhausted"};
      } catch(error) {
        if(error instanceof IndexInterrupted) yield {kind:"interrupted",reason:error.reason};else throw error;
      } finally {lease?.dispose();index?.dispose();}
    }});
}

/** Untrusted local syntax compiler. It borrows source IDs, preserving exact taint. */
export class PatternBuilder {
  readonly nodes:ProofNode[]=[];readonly imports=new Set<number>();readonly roots:number[]=[];
  readonly values=new Map<number,Proposition>();readonly memo=new Map<string,number>();
  next:number;
  constructor(readonly view:ReadView,readonly graph:PatternGraph) {this.next=graph.nextNode;}
  add(rule:string,premises:number[],conclusion:Proposition,parameters:Json={}):number {
    const key=JSON.stringify([rule,premises,conclusion,parameters]),old=this.memo.get(key);if(old!==undefined)return old;
    this.graph.compilation!.grow(1,2048+JSON.stringify(conclusion).length*4+premises.length*16);
    const id=this.next++;premises.filter(id=>this.view.facts.has(id)).forEach(id=>this.imports.add(id));
    this.nodes.push({id,rule,premises,conclusion,parameters,scope:[]});this.values.set(id,conclusion);this.memo.set(key,id);return id;
  }
  cell(cell:number):number {return this.add("cover-clause@1",[this.view.state.domainFacts[cell]],clause(
    this.view.assembly.problem.symbols.filter(s=>this.view.state.domains[cell]&(1<<(s-1))).map(s=>pos(cell,s))));}
  house(id:string,symbol:number):number {
    const h=this.view.assembly.allDifferent.find(h=>h.id===id)!;
    const cover=this.graph.covers.get(`${h.cells.join()}/${symbol}`);
    if(!cover)throw Error("missing-pattern-cover");
    const source=this.add("support@1",[...cover.premises],{kind:"cover",symbol,cells:cover.literals.map(l=>l.cell)});
    return this.add("cover-clause@1",[source],clause(cover.literals));
  }
  *weak(a:Literal,b:Literal):Generator<{kind:"work";units:number},number> {
    yield {kind:"work",units:1};const edge=this.graph.weak.get(this.graph.key(a,b));if(!edge)throw Error("missing-pattern-edge");
    const conclusion=clause([neg(a.cell,a.symbol),neg(b.cell,b.symbol)]);
    if(edge.recipe.kind!=="relation-conflict") return this.add("weak-link@1",[...edge.premises],conclusion);
    const cache=`relation:${edge.recipe.source}`;let source=this.memo.get(cache);
    if(source===undefined) {
      const relation=this.view.facts.get(edge.recipe.source)!.proposition;
      if(relation.kind!=="relation")throw Error("missing-relation");
      source=edge.recipe.source;let rows=relation.tuples;
      for(const cell of relation.cells) {
        yield {kind:"work",units:1};const mask=this.view.state.domains[cell],digits=this.view.assembly.problem.symbols.filter(s=>mask&(1<<(s-1)));
        const filter=this.add("table-filter@1",[this.view.state.domainFacts[cell]],{kind:"table",cells:[cell],count:digits.length,definition:this.next},{cells:[cell],box:[mask]});
        const remaining:number[][]=[];
        for(const tuple of rows) {yield {kind:"work",units:1};if(mask&(1<<(tuple[relation.cells.indexOf(cell)]-1)))remaining.push([...tuple]);}
        rows=remaining;
        source=this.add("table-join@1",[source,filter],{kind:"table",cells:[...relation.cells].sort((a,b)=>a-b),count:rows.length,definition:this.next});
      }
      this.memo.set(cache,source);
    }
    return this.add("table-project@1",[source],conclusion);
  }
  resolve(a:number,b:number,pivot:Literal):number {
    const left=literals(this.values.get(a)!),right=literals(this.values.get(b)!);
    return this.add("resolution@1",[a,b],clause([...left.filter(l=>!(l.cell===pivot.cell&&l.symbol===pivot.symbol&&l.positive===pivot.positive)),
      ...right.filter(l=>!(l.cell===pivot.cell&&l.symbol===pivot.symbol&&l.positive!==pivot.positive))]));
  }
  *eliminate(root:number,target:Effect):Generator<{kind:"work";units:number},number> {
    for(const occurrence of [...literals(this.values.get(root)!)]) {
      const weak=yield* this.weak(occurrence,pos(target.cell,target.symbol));root=this.resolve(root,weak,occurrence);
    }
    this.roots.push(root);return root;
  }
  *path(vertices:Literal[][],strong:number[]):Generator<{kind:"work";units:number},number> {
    let root=strong[0];
    for(let offset=2;offset<vertices.length;offset+=2) {
      const exclusions:number[]=[];
      for(const next of vertices[offset]) {
        let excluded=root;
        for(const previous of vertices[offset-1]) {yield {kind:"work",units:1};const weak=yield* this.weak(previous,next);excluded=this.resolve(excluded,weak,previous);}
        exclusions.push(excluded);
      }
      root=strong[offset/2];
      for(let i=0;i<vertices[offset].length;i++)root=this.resolve(root,exclusions[i],vertices[offset][i]);
    }
    return root;
  }
  finish(technique:string,pattern:Json,effects:Effect[],effectRoots:number[]):DeductionProposal {
    const domains=new Map<number,{id:number;mask:number}>();
    effects.forEach((e,i)=>{const prior=domains.get(e.cell)??{id:this.view.state.domainFacts[e.cell],mask:this.view.state.domains[e.cell]};
      const mask=prior.mask&~(1<<(e.symbol-1)),id=this.add("domain-restrict@1",[prior.id,effectRoots[i]],{kind:"domain",cell:e.cell,mask});domains.set(e.cell,{id,mask});});
    return {technique,pattern,effects,state:this.view.state.key,proof:{state:this.view.state.key,nodes:this.nodes,
      imports:[...this.imports].sort((a,b)=>a-b),roots:[...new Set([...effectRoots,...this.roots,...[...domains.values()].map(d=>d.id)])]}};
  }
  /** Complete partition tree; no leaf exceeds 256 assignment combinations. */
  *bentTable(p:BentPattern):Generator<{kind:"work";units:number},number> {
    const scopes:number[]=[];
    for(const pair of p.conflicts) {
      yield {kind:"work",units:1};const source=this.graph.scopes.get(pair.join(":"));
      if(source===undefined)throw Error("missing-local-all-different");
      scopes.push(this.add("all-different-subset@1",[source],{kind:"all-different",cells:pair}));
    }
    const sources=[...p.cells.map(c=>this.view.state.domainFacts[c]),...scopes];
    const build=function*(this:PatternBuilder,masks:number[]):Generator<{kind:"work";units:number},{id:number;count:number}> {
      const values=masks.map(mask=>this.view.assembly.problem.symbols.filter(s=>mask&(1<<(s-1))));
      const volume=values.reduce((n,v)=>n*v.length,1);yield {kind:"work",units:1};
      if(volume>256) {
        const split=values.findIndex(v=>v.length>1),a=[...masks],b=[...masks];a[split]=1<<(values[split][0]-1);b[split]&=~a[split];
        const left=yield* build.call(this,a),right=yield* build.call(this,b),count=left.count+right.count;
        return {id:this.add("table-union@1",[left.id,right.id],{kind:"table",cells:p.cells,count,definition:this.next}),count};
      }
      let count=0;const cursor=values.map(()=>0);let done=values.some(v=>v.length===0);
      while(!done) {
        yield {kind:"work",units:1};const tuple=values.map((v,i)=>v[cursor[i]]);
        if(p.conflicts.every(([a,b])=>tuple[p.cells.indexOf(a)]!==tuple[p.cells.indexOf(b)]))count++;
        for(let i=cursor.length-1;i>=0;i--) {if(++cursor[i]<values[i].length)break;cursor[i]=0;if(i===0)done=true;}
      }
      return {id:this.add("table-filter@1",sources,{kind:"table",cells:p.cells,count,definition:this.next},{cells:p.cells,box:masks}),count};
    };
    const result=yield* build.call(this,p.cells.map(c=>this.view.state.domains[c]));
    return this.add("table-project@1",[result.id],clause(p.occurrences[p.nonrestrictedSymbol].map(c=>pos(c,p.nonrestrictedSymbol))));
  }
}
