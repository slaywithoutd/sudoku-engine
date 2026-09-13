import type { DeductionProposal, ProofNode } from "../proof/types";
import type { ReadView, Literal, Proposition } from "../state/types";
import { clause, requireProof, sameValue } from "../proof/primitives";
import type { ForcingPlan, ForcingCertificate } from "./forcing";
import type { ForcingLink, PathCertificate } from "./forcing-proof";

const literal = (v: Literal): Proposition => ({kind:"literal",value:v});
const complement = (v: Literal): Literal => ({...v,positive:!v.positive});
const candidates = (view:ReadView,c:number):Literal[] => view.assembly.problem.symbols.filter(s=>view.state.domains[c] & (1<<(s-1))).map(symbol=>({cell:c,symbol,positive:true}));

/** Independent path recognizer: geometry + exact current source lineage. */
export class ForcingLineage {
  constructor(readonly view: ReadView, readonly nodes: ReadonlyMap<number, ProofNode>) {}
  node(id: number): ProofNode { const n=this.nodes.get(id); requireProof(n,"forcing-missing-node"); return n; }
  cell(id:number,cell:number):void {
    const n=this.node(id); requireProof(n.rule==="cover-clause@1" && sameValue(n.premises,[this.view.state.domainFacts[cell]]) &&
      sameValue(n.conclusion,clause(candidates(this.view,cell))),"forcing-cell-cover");
  }
  house(id:number,house:string,symbol:number):void {
    const n=this.node(id), h=this.view.assembly.allDifferent.find(h=>h.id===house);
    requireProof(h && n.rule==="cover-clause@1" && n.premises.length===1,"forcing-house-cover");
    const support=this.node(n.premises[0]), source=this.view.facts.get(support.premises[0]);
    requireProof(support.rule==="support@1" && source && sameValue(source.proposition,{kind:"cover",cells:h.cells,symbol}) &&
      sameValue(support.premises.slice(1),h.cells.map(c=>this.view.state.domainFacts[c])) &&
      sameValue(n.conclusion,clause(h.cells.filter(c=>this.view.state.domains[c]&(1<<(symbol-1))).map(cell=>({cell,symbol,positive:true})))),"forcing-house-cover");
  }
  edge(id:number,link:ForcingLink):void {
    const n=this.node(id), r=link.reason;
    requireProof(sameValue(n.conclusion,clause([complement(link.from),link.to])),"forcing-edge-clause");
    if(r.kind==="cell-cover") { requireProof(!link.from.positive&&link.to.positive,"forcing-edge-sign"); this.cell(id,r.cell!); }
    else if(r.kind==="house-cover") { requireProof(!link.from.positive&&link.to.positive,"forcing-edge-sign"); this.house(id,r.house!,r.symbol!); }
    else {
      requireProof(link.from.positive&&!link.to.positive && n.rule==="weak-link@1"&&n.premises.length===1,"forcing-weak-edge");
      if(r.kind==="cell-conflict") requireProof(n.premises[0]===this.view.state.domainFacts[r.cell!] && link.from.cell===r.cell && link.to.cell===r.cell,"forcing-cell-conflict");
      else {
        requireProof(r.kind==="scope-conflict","forcing-edge-kind");
        const h=this.view.assembly.allDifferent.find(h=>h.id===r.house),f=this.view.facts.get(n.premises[0]);
        requireProof(h&&f&&sameValue(f.proposition,{kind:"all-different",cells:h.cells})&&link.from.symbol===r.symbol&&link.to.symbol===r.symbol,"forcing-scope-conflict");
      }
    }
  }
  path(assumption:number,path:readonly ForcingLink[],proof:PathCertificate,scope:readonly number[],nishio=false):void {
    requireProof(path.length<=24&&proof.links.length===path.length&&proof.clauses.length===path.length,"forcing-link-bound");
    let prior=assumption; const initial=this.node(assumption).conclusion; requireProof(initial.kind==="literal","forcing-assumption"); let value=initial.value;
    for(const [i,link] of path.entries()) {
      requireProof(sameValue(link.from,value),"forcing-disconnected-path");
      if(nishio) requireProof(link.from.symbol===initial.value.symbol&&link.to.symbol===initial.value.symbol&&["scope-conflict","house-cover"].includes(link.reason.kind),"nishio-mixed-digit");
      this.edge(proof.clauses[i],link);
      const node=this.node(proof.links[i]); requireProof(node.rule==="resolution@1"&&sameValue(node.scope,scope)&&sameValue(this.node(proof.clauses[i]).scope,scope)&&
        sameValue(node.premises,[prior,proof.clauses[i]])&&sameValue(node.conclusion,literal(link.to)),"forcing-path-lineage");
      prior=node.id; value=link.to;
    }
    if (!path.length) {
      const end=this.node(proof.end), projection=this.node(end.premises[0]);
      requireProof(end.rule==="conjunction@1"&&sameValue(end.parameters,{index:0})&&end.premises.length===1&&sameValue(end.scope,scope)&&
        projection.rule==="conjunction@1"&&sameValue(projection.premises,[assumption])&&sameValue(projection.scope,scope),"forcing-initial-path");
    } else requireProof(proof.end===prior,"forcing-path-end");
  }
}

/** Every supplied effect root must be the complete cases/discharge certificate. */
export function checkForcingPattern(proposal:DeductionProposal,view:ReadView,nodes:ReadonlyMap<number,ProofNode>):void {
  const p=proposal.pattern as unknown as ForcingPlan & {certificate:ForcingCertificate}, c=p.certificate, l=new ForcingLineage(view,nodes);
  requireProof(c && ["digit","cell","unit","nishio"].includes(p.kind) && p.alias===({digit:"Digit forcing chains",cell:"Cell forcing chains",unit:"Unit forcing chains",nishio:"Nishio"})[p.kind],"forcing-alias");
  requireProof(proposal.effects.length>=1 && (proposal.effects[0].kind==="place" || proposal.effects.length===1),"forcing-effects");
  let alternatives:Literal[];
  if(p.kind==="cell") { alternatives=candidates(view,p.cover.cell!); l.cell(c.cover!,p.cover.cell!); }
  else if(p.kind==="unit") {
    const h=view.assembly.allDifferent.find(h=>h.id===p.cover.house); requireProof(h,"forcing-unit");
    alternatives=h.cells.filter(cell=>view.state.domains[cell]&(1<<(p.cover.symbol!-1))).map(cell=>({cell,symbol:p.cover.symbol!,positive:true}));
    l.house(c.cover!,p.cover.house!,p.cover.symbol!);
  } else {
    const a=p.cover.candidate; requireProof(a&&a.positive&&candidates(view,a.cell).some(v=>sameValue(a,v)),"forcing-candidate");
    alternatives=p.kind==="nishio"?[a]:[a,complement(a)];
    if(p.kind==="nishio") requireProof(c.cover===null,"nishio-cover");
    else {
      let node=l.node(c.cover!); requireProof(sameValue(node.conclusion,clause(alternatives)),"forcing-candidate-cover");
      const remaining=candidates(view,a.cell).filter(v=>v.symbol!==a.symbol);
      for(const value of [...remaining].reverse()) {
        requireProof(node.rule==="resolution@1"&&node.premises.length===2&&node.scope.length===0,"forcing-case-cover-lineage");
        l.edge(node.premises[1],{from:value,to:complement(a),reason:{kind:"cell-conflict",cell:a.cell}});node=l.node(node.premises[0]);
      }
      l.cell(node.id,a.cell);
    }
  }
  const sort=(a:Literal,b:Literal)=>a.cell-b.cell||a.symbol-b.symbol||Number(a.positive)-Number(b.positive);
  requireProof(alternatives.length>=(p.kind==="nishio"?1:2)&&alternatives.length<=9&&sameValue([...p.alternatives].sort(sort),[...alternatives].sort(sort))&&
    p.branches.length===alternatives.length&&c.branches.length===alternatives.length,"forcing-incomplete-cases");
  const seen=new Set<string>();
  for(const [i,b] of p.branches.entries()) {
    const certificate=c.branches[i],a=l.node(certificate.assumption),result=l.node(certificate.result),scope=[a.id],key=JSON.stringify(b.assumption);
    requireProof(!seen.has(key)&&alternatives.some(v=>sameValue(v,b.assumption))&&a.rule==="assume@1"&&a.scope.length===0&&sameValue(a.conclusion,literal(b.assumption)),"forcing-case-assumption");seen.add(key);
    requireProof(b.paths.length===(b.result==="false"?2:1)&&certificate.paths.length===b.paths.length&&b.paths.reduce((n,path)=>n+path.length,0)<=24,"forcing-branch-bound");
    b.paths.forEach((path,j)=>l.path(a.id,path,certificate.paths[j],scope,p.kind==="nishio"));
    if(b.result==="false") requireProof(result.rule==="contradiction@1"&&sameValue(result.scope,scope)&&sameValue(result.premises,certificate.paths.map(p=>p.end)),"forcing-contradiction-lineage");
    else requireProof(result.id===certificate.paths[0].end&&sameValue(result.conclusion,literal(b.result)),"forcing-result-lineage");
  }
  const root=l.node(c.root),effect=proposal.effects[0];
  requireProof(root.scope.length===0&&sameValue(root.conclusion,literal({cell:effect.cell,symbol:effect.symbol,positive:effect.kind==="place"})),"forcing-root");
  if(p.kind==="nishio") requireProof(root.rule==="discharge@1"&&sameValue(root.premises,[c.branches[0].assumption,c.branches[0].result])&&p.branches[0].result==="false","nishio-discharge");
  else {
    const ordered=p.branches.map((b,i)=>({a:b.assumption,c:c.branches[i]})).sort((a,b)=>sort(a.a,b.a));
    requireProof(root.rule==="cases@1"&&sameValue(root.premises,[c.cover,...ordered.flatMap(({c})=>[c.assumption,c.result])]),"forcing-cases-lineage");
  }
  checkForcingRoots(proposal,view,nodes,c.root);
}
export function checkForcingRoots(proposal:DeductionProposal,view:ReadView,nodes:ReadonlyMap<number,ProofNode>,root:number):void {
  requireProof(proposal.proof.roots.includes(root),"forcing-missing-root");
  const primary=nodes.get(root)!.conclusion,accepted=new Set([root]);
  if(primary.kind==="literal"&&primary.value.positive)for(const id of proposal.proof.roots) {
    const n=nodes.get(id)!;if(id===root||n.conclusion.kind!=="literal")continue;
    const weak=n.premises.length===2&&n.premises[0]===root?nodes.get(n.premises[1]):undefined;
    requireProof(n.rule==="resolution@1"&&n.scope.length===0&&!n.conclusion.value.positive&&weak?.rule==="weak-link@1"&&weak.scope.length===0&&weak.premises.length===1&&view.facts.has(weak.premises[0]),"forcing-unrelated-peer-root");accepted.add(id);
  }
  for(const id of proposal.proof.roots) if(!accepted.has(id)) {
    const n=nodes.get(id)!;requireProof(n.rule==="domain-restrict@1"&&n.scope.length===0&&n.conclusion.kind==="domain"&&n.premises[0]===view.state.domainFacts[n.conclusion.cell]&&n.premises.length===2&&accepted.has(n.premises[1]),"forcing-unrelated-root");
  }
}
