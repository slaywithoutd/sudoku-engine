import type { WorkspaceReservation } from "../indexes/workspace";
import type { Json } from "../problem";
import type { DeductionProposal, Effect, ProofNode } from "../proof/types";
import type { Limits } from "../proof/types";
import type { ReadView, Literal, Proposition } from "../state/types";
import { sameValue } from "../proof/primitives";
import { proposedClause } from "../proof/builder";

export const signedKey = (v: Literal): string => `${v.cell}:${v.symbol}:${Number(v.positive)}`;
export const opposite = (v: Literal): Literal => ({ ...v, positive: !v.positive });
export const bit = (s: number): number => 1 << (s - 1);
export const symbols = (view: ReadView, c: number): number[] => view.assembly.problem.symbols.filter(s => view.state.domains[c] & bit(s));
export interface ForcingReason { kind: "cell-cover" | "cell-conflict" | "house-cover" | "scope-conflict"; cell?: number; house?: string; symbol?: number; origin?: "parent" }
export interface ForcingLink { from: Literal; to: Literal; reason: ForcingReason }
export interface PathCertificate { readonly clauses: readonly number[]; readonly links: readonly number[]; readonly end: number }

/** Full wire caps still apply after bounded semantic inference expansion. */
export function forcingProofFits(proposal:DeductionProposal,limits:Limits):boolean {
  if(proposal.proof.nodes.length>limits.stepNodes)return false;
  const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).length;
  return bytes(proposal)<=limits.stepBytes&&bytes({...proposal,proof:{...proposal.proof,nodes:[]}})<=32768;
}

/** One allocator owns the entire final DAG. Siblings share only ancestor IDs. */
export class ForcingProof {
  readonly nodes: ProofNode[] = [];
  scope: readonly number[] = [];
  #next: number;
  constructor(readonly view: ReadView, readonly lease?: WorkspaceReservation) {
    // One finite, constant-scratch prefix scan avoids argument-count limits.
    // This synchronous constructor scan is not a scheduler work quantum;
    // T19/T20 must account initialization latency in the invoking operation.
    let maximum=0;for(const id of view.facts.keys())if(id>maximum)maximum=id;
    this.#next=maximum+1;
  }
  /** Read-only next allocation, for self-referencing table conclusions. */
  get nextId():number {return this.#next;}
  add(rule: string, premises: readonly number[], conclusion: Proposition, parameters: Json = {}): number {
    this.lease?.grow(1,4096 + premises.length * 32);
    const id = this.#next++; this.nodes.push({ id, rule, premises: [...premises], conclusion, parameters, scope: [...this.scope] }); return id;
  }
  fact(p: Proposition): number {
    const fact = [...this.view.facts.values()].find(f => !f.openAssumptions.length && sameValue(f.proposition, p));
    if (!fact) throw Error("missing-forcing-premise"); return fact.id;
  }
  house(id: string): readonly number[] {
    const h = this.view.assembly.allDifferent.find(h => h.id === id); if (!h) throw Error("missing-forcing-house"); return h.cells;
  }
  cover(cell: number, source = this.view): number { return this.add("cover-clause@1", [source.state.domainFacts[cell]], proposedClause(symbols(source, cell).map(symbol => ({cell, symbol, positive: true})))); }
  houseCover(house: string, symbol: number, source = this.view): number {
    const cells = this.house(house), supports = cells.filter(c => source.state.domains[c] & bit(symbol));
    const root = this.add("support@1", [this.fact({ kind: "cover", cells, symbol }), ...cells.map(c => source.state.domainFacts[c])], { kind: "cover", cells: supports, symbol });
    return this.add("cover-clause@1", [root], proposedClause(supports.map(cell => ({cell, symbol, positive: true}))));
  }
  edge(link: ForcingLink, view = this.view): number {
    const r = link.reason;
    if (r.kind === "cell-cover") return this.cover(r.cell!, view);
    if (r.kind === "house-cover") return this.houseCover(r.house!, r.symbol!, view);
    const source = r.kind === "cell-conflict" ? view.state.domainFacts[r.cell!] : this.fact({ kind: "all-different", cells: this.house(r.house!) });
    return this.add("weak-link@1", [source], proposedClause([opposite(link.from), link.to]));
  }
  path(assumption: number, path: readonly ForcingLink[], frozen = this.view): PathCertificate {
    let root = assumption;
    if (!path.length) { const proposition = this.nodes.find(n=>n.id===assumption)!.conclusion;
      const conjunction=this.add("conjunction@1",[assumption],{kind:"and",terms:[proposition]});
      root=this.add("conjunction@1",[conjunction],proposition,{index:0}); }
    const clauses: number[] = [], links: number[] = [];
    for (const link of path) { const clause = this.edge(link, link.reason.origin === "parent" ? frozen : this.view); clauses.push(clause); root = this.add("resolution@1", [root, clause], proposedClause([link.to])); links.push(root); }
    return { clauses, links, end: root };
  }
  finish(technique: string, pattern: unknown, effect: Effect, root: number): DeductionProposal {
    const effects:Effect[]=[effect],roots=[root];
    if(effect.kind==="place")for(const cell of this.view.assembly.problem.cells) {
      if(cell===effect.cell||this.view.state.values[cell]||!(this.view.state.domains[cell]&bit(effect.symbol)))continue;
      const house=this.view.assembly.allDifferent.find(h=>h.cells.includes(cell)&&h.cells.includes(effect.cell));if(!house)continue;
      const weak=this.add("weak-link@1",[this.fact({kind:"all-different",cells:house.cells})],proposedClause([{cell:effect.cell,symbol:effect.symbol,positive:false},{cell,symbol:effect.symbol,positive:false}]));
      roots.push(this.add("resolution@1",[root,weak],proposedClause([{cell,symbol:effect.symbol,positive:false}])));effects.push({kind:"remove",cell,symbol:effect.symbol});
    }
    for(const [i,e]of effects.entries()) {const mask=e.kind==="place"?bit(e.symbol):this.view.state.domains[e.cell]&~bit(e.symbol);
      roots.push(this.add("domain-restrict@1",[this.view.state.domainFacts[e.cell],roots[i]],{kind:"domain",cell:e.cell,mask}));}
    return this.bundle(technique,pattern,effects,roots);
  }

  bundle(technique: string, pattern: unknown, effects: readonly Effect[], roots: readonly number[]): DeductionProposal {
    const all = new Map(this.nodes.map(n => [n.id,n])), reachable = new Set<number>(), stack = [...roots];
    while (stack.length) { const id = stack.pop()!; if (reachable.has(id)) continue; reachable.add(id); const n = all.get(id); if (n) stack.push(...n.premises, ...n.scope); }
    return { technique, state: this.view.state.key, effects, pattern: pattern as Json, proof: { state: this.view.state.key,
      imports: [...reachable].filter(id => this.view.facts.has(id)).sort((a,b) => a-b), nodes: this.nodes.filter(n => reachable.has(n.id)), roots } };
  }
}
