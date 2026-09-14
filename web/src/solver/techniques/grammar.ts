import {matchingFacts} from "../state/source-index";
import type { DeductionProposal, Effect, ProofNode } from "../proof/types";
import type { ReadView } from "../state/types";
import { domainAssertion, requireProof, sameValue } from "../proof/primitives";
import { checkPatternProof } from "./pattern-contracts";
import { checkFishPattern } from "./fish-certificate";
import { checkChainPattern } from "./chains-grammar";
import { checkColoringPattern,checkColoringPatternSteps } from "./coloring-grammar";
import { checkAlsPattern } from "./als-grammar";
import { checkSetPattern } from "./set-grammar";
import { checkForcingPattern } from "./forcing-grammar";
import { checkKrakenPattern } from "./kraken-grammar";
import { checkNetPattern } from "./nets-grammar";
import { checkGeneralizedPattern } from "./generalized-grammar";
import { checkExocetPattern } from "./exocet-grammar";
import { checkTridagonPattern } from "./tridagon-grammar";
import { checkSkPattern } from "./sk-grammar";
import { checkFireworksPattern } from "./fireworks-grammar";
import { checkOrPattern } from "./or-grammar";
import { checkTemplatePattern } from "../proof/template-cover";
import { checkUniquePattern } from "./unique-grammar";

function fields(p: Record<string, unknown>, names: string[]): void {
  requireProof(sameValue(Object.keys(p).sort(), names.sort()), "invalid-technique-pattern");
}
function effectsKey(effects: readonly Effect[]): string {
  return JSON.stringify([...effects].sort((a,b) => a.cell-b.cell || a.symbol-b.symbol || a.kind.localeCompare(b.kind)));
}
function placement(view: ReadView, cell: number, symbol: number): Effect[] {
  const result: Effect[] = [{ kind: "place", cell, symbol }];
  const peers = new Set(view.assembly.allDifferent.filter(h => h.cells.includes(cell)).flatMap(h => h.cells));
  for (const peer of peers) if (peer !== cell && !view.state.values[peer] && (view.state.domains[peer] & (1 << (symbol-1))))
    result.push({ kind: "remove", cell: peer, symbol });
  return result;
}
function numbers(value: unknown): number[] {
  requireProof(Array.isArray(value) && value.every(Number.isSafeInteger) &&
    value.every((n,i) => !i || n > value[i-1]), "invalid-pattern-set");
  return value;
}
function geometry(cells: readonly number[]): "box" | "line" | null {
  if (cells.length !== 9) return null;
  if (new Set(cells.map(c => Math.floor(c/9))).size === 1 || new Set(cells.map(c => c%9)).size === 1) return "line";
  return new Set(cells.map(c => Math.floor(c/27)*3+Math.floor(c%9/3))).size === 1 ? "box" : null;
}

/** Closed grammar, with no detector/registry/builder imports or caller extensions. */
export function checkTechniqueGrammar(proposal: DeductionProposal, view: ReadView,
  available: ReadonlyMap<number, ProofNode>,charge?:(units:number)=>void): void {
  requireProof(proposal.pattern && typeof proposal.pattern === "object" && !Array.isArray(proposal.pattern), "invalid-technique-pattern");
  const p = proposal.pattern as Record<string, unknown>, nodes = proposal.proof.nodes, domains = view.state.domains;
  if (["u01@1","u02@1","u03@1","u04@1","u05@1"].includes(proposal.technique)) { checkUniquePattern(proposal,view,available); return; }
  for (const cell of view.assembly.problem.cells) {
    const fact = view.facts.get(view.state.domainFacts[cell]);
    requireProof(fact && sameValue(domainAssertion(fact.proposition), { cell, mask: domains[cell] }), "unproved-current-domain");
  }
  if (proposal.technique === "c33@1") {checkTemplatePattern(proposal,view,available);return;}
  if (proposal.technique === "c31@1") {checkExocetPattern(proposal,view,available);return;}
  if (proposal.technique === "c32@1") {checkTridagonPattern(proposal,view,available);return;}
  if (proposal.technique === "c30@1") {checkSkPattern(proposal,view,available);return;}
  if (proposal.technique === "c29@1") {checkFireworksPattern(proposal,view,available);return;}
  if (["c25@1","c26@1","c27@1"].includes(proposal.technique)) { checkGeneralizedPattern(proposal,view,available); return; }
  if (proposal.technique === "c28@1") { checkOrPattern(proposal,view,available); return; }
  if (proposal.technique === "c22@1") { checkForcingPattern(proposal,view,available); return; }
  if (proposal.technique === "c24@1") { checkKrakenPattern(proposal,view,available); return; }
  if (proposal.technique === "c23@1") { checkNetPattern(proposal,view,available); return; }
  if (["c20@1", "c21@1"].includes(proposal.technique)) {
    checkSetPattern(proposal, view, available,charge); return;
  }
  if (["c18@1", "c19@1"].includes(proposal.technique)) {
    checkAlsPattern(proposal, view, available); return;
  }
  if (["c10@1","c11@1","c12@1","c13@1"].includes(proposal.technique)) {
    checkPatternProof(proposal,view,available); return;
  }
  if (["c16@1", "c17@1"].includes(proposal.technique)) {
    checkChainPattern(proposal, view, available); return;
  }
  if (["c14@1", "c15@1"].includes(proposal.technique)) {
    checkColoringPattern(proposal, view, available); return;
  }
  if (["c06@1","c07@1","c08@1","c09@1"].includes(proposal.technique)) {
    checkFishPattern(proposal,view,available); return;
  }
  let sourceCells: readonly number[] = [], symbol = 0, coverCells: readonly number[] | null = null;
  const allowedHall: { house: readonly number[]; cells: readonly number[] }[] = [];
  if (proposal.technique === "rule-propagation@1") {
    fields(p, ["kind"]);
    requireProof(p.kind === "propagation" && proposal.effects.length > 0 && proposal.effects.every(e => e.kind === "remove"), "invalid-maintenance-grammar");
    sourceCells = view.assembly.problem.cells.filter(c => view.state.values[c] !== 0);
    for (const e of proposal.effects) requireProof(view.assembly.allDifferent.some(h => h.cells.includes(e.cell) &&
      h.cells.some(c => c !== e.cell && view.state.values[c] === e.symbol)), "invalid-maintenance-effect");
  } else if (proposal.technique === "c01@1" || proposal.technique === "c02@1") {
    const cell = Number(p.cell); symbol = Number(p.symbol); sourceCells = [cell];
    requireProof(view.assembly.problem.cells.includes(cell) && view.assembly.problem.symbols.includes(symbol) &&
      !view.state.values[cell], "invalid-single");
    if (proposal.technique === "c01@1") {
      fields(p, ["kind", "alias", "cell", "symbol", "house"]);
      requireProof(p.kind === "single" && domains[cell] === (1 << (symbol-1)), "invalid-single");
      if (p.alias === "Naked Single") requireProof(p.house === null, "invalid-single-alias");
      else {
        requireProof(p.alias === "Full House" || p.alias === "Last Digit", "unknown-alias");
        const house = view.assembly.allDifferent.find(h => h.id === p.house);
        requireProof(house && house.cells.length === view.assembly.problem.symbols.length &&
          house.cells.filter(c => !view.state.values[c]).length === 1 && house.cells.includes(cell), "invalid-single-alias");
      }
    } else {
      fields(p, ["kind", "alias", "cover", "cell", "symbol"]);
      const cover = view.assembly.covers.find(c => c.id === p.cover);
      requireProof(p.kind === "hidden-single" && p.alias === "Hidden Single" && cover?.symbol === symbol &&
        sameValue(cover.cells.filter(c => (domains[c] & (1 << (symbol-1))) !== 0), [cell]), "invalid-hidden-single");
      coverCells = cover.cells;
    }
    if (proposal.effects.length) requireProof(effectsKey(proposal.effects) === effectsKey(placement(view, cell, symbol)), "invalid-single-effects");
    else {
      requireProof(nodes.length > 0 && nodes.length <= 2 && proposal.proof.roots.length === 1 &&
        sameValue(available.get(proposal.proof.roots[0])?.conclusion, { kind: "literal", value: { cell, symbol, positive: true } }) &&
        matchingFacts(view,{ kind: "literal", value: { cell, symbol, positive: true } }).length===0, "invalid-single-cache");
    }
  } else if (proposal.technique === "c03@1") {
    fields(p, ["kind", "alias", "cover", "group", "symbol", "cells"]);
    const cover = view.assembly.covers.find(c => c.id === p.cover), group = view.assembly.allDifferent.find(h => h.id === p.group);
    sourceCells = numbers(p.cells); symbol = Number(p.symbol);
    requireProof(p.kind === "intersection" && cover?.symbol === symbol && group && sourceCells.length >= 2 && sourceCells.length <= 3,
      "invalid-intersection");
    coverCells = cover.cells;
    const intersection = cover.cells.filter(c => group.cells.includes(c));
    requireProof(intersection.length > 0 && intersection.length < cover.cells.length && intersection.length < group.cells.length &&
      sourceCells.every(c => intersection.includes(c)) && sameValue(sourceCells, cover.cells.filter(c => domains[c] & (1 << (symbol-1)))), "invalid-intersection-support");
    requireProof(["Locked Candidates", "direct forms", "pointing", "claiming"].includes(String(p.alias)), "unknown-alias");
    if (p.alias === "pointing") requireProof(geometry(cover.cells) === "box" && geometry(group.cells) === "line", "invalid-intersection-alias");
    if (p.alias === "claiming") requireProof(geometry(cover.cells) === "line" && geometry(group.cells) === "box", "invalid-intersection-alias");
    const expected = group.cells.filter(c => !cover.cells.includes(c) && !view.state.values[c] && (domains[c] & (1 << (symbol-1))))
      .map(cell => ({ kind: "remove" as const, cell, symbol }));
    requireProof(expected.length > 0 && effectsKey(expected) === effectsKey(proposal.effects), "invalid-intersection-effects");
  } else if (proposal.technique === "c04@1" || proposal.technique === "c05@1") {
    const cells = numbers(p.cells), digits = numbers(p.symbols), size = cells.length;
    const locked = proposal.technique === "c05@1";
    requireProof(size >= 2 && size <= (locked ? 3 : 4) && digits.length === size &&
      cells.every(c => view.assembly.problem.cells.includes(c) && !view.state.values[c] && domains[c] > 0) &&
      digits.every(d => view.assembly.problem.symbols.includes(d)), "subset-out-of-profile");
    const mask = digits.reduce((m,d) => m | (1 << (d-1)), 0);
    const houseIds = locked ? p.houses : [p.house];
    requireProof(Array.isArray(houseIds) && houseIds.length === (locked ? 2 : 1) && new Set(houseIds).size === houseIds.length, "invalid-subset-houses");
    const houses = houseIds.map(id => view.assembly.allDifferent.find(h => h.id === id));
    requireProof(houses.every(h => h && cells.every(c => h.cells.includes(c))), "invalid-subset-houses");
    const names: Record<number,string> = { 2: "Pair", 3: "Triple", 4: "Quad" };
    if (locked) {
      fields(p, ["kind", "alias", "houses", "cells", "symbols"]);
      requireProof(p.kind === "locked-subset" && p.alias === `Locked ${names[size]}` &&
        houses.some(h => geometry(h!.cells) === "box") && houses.some(h => geometry(h!.cells) === "line"), "invalid-locked-subset");
    } else {
      fields(p, ["kind", "alias", "form", "house", "cells", "symbols", "complement"]);
      requireProof(p.kind === "subset" && (p.form === "naked" || p.form === "hidden"), "invalid-subset");
      if (p.complement === null) requireProof(p.alias === `${p.form === "naked" ? "Naked" : "Hidden"} ${names[size]}`, "invalid-subset-alias");
      else requireProof(houses[0]!.cells.length === 9 && p.complement === 9-size &&
        p.alias === ({ 5: "complementary quintuple", 6: "complementary sextuple", 7: "complementary septuple" } as Record<number,string>)[9-size], "invalid-complement-alias");
    }
    const expected: Effect[] = [];
    for (const house of houses) {
      const hidden = !locked && p.form === "hidden";
      if (hidden) requireProof(house!.cells.length === view.assembly.problem.symbols.length && digits.every(d =>
        view.assembly.covers.some(c => c.symbol === d && sameValue(c.cells, house!.cells)) &&
        house!.cells.some(c => domains[c] & (1 << (d-1)))) && sameValue(house!.cells.filter(c => domains[c] & mask), cells), "invalid-hidden-subset");
      else requireProof(cells.reduce((m,c) => m | domains[c], 0) === mask, "invalid-naked-subset");
      const selected = hidden ? house!.cells.filter(c => !cells.includes(c)) : cells;
      allowedHall.push({ house: house!.cells, cells: selected });
      const union = selected.reduce((m,c) => m | domains[c], 0);
      requireProof(view.assembly.problem.symbols.filter(d => union & (1 << (d-1))).length === selected.length, "invalid-subset-hall");
      const targets = hidden ? cells : house!.cells.filter(c => !cells.includes(c) && !view.state.values[c]);
      const local = targets.flatMap(cell => view.assembly.problem.symbols.filter(d => domains[cell] & union & (1 << (d-1)))
        .map(symbol => ({ kind: "remove" as const, cell, symbol })));
      requireProof(local.length > 0, "unproductive-subset"); expected.push(...local);
    }
    const unique = [...new Map(expected.map(e => [`${e.cell}:${e.symbol}`,e])).values()];
    requireProof(effectsKey(unique) === effectsKey(proposal.effects), "invalid-subset-effects");
  } else requireProof(false, "unknown-technique");

  const permitted = new Set(["weak-link@1", "resolution@1", "domain-restrict@1"]);
  permitted.add("cover-clause@1");
  if (coverCells) permitted.add("support@1");
  if (allowedHall.length) permitted.add("hall@1");
  const signatures = new Set<string>();
  for (const node of nodes) {
    requireProof(permitted.has(node.rule) && node.scope.length === 0, "outside-technique-grammar");
    const signature = JSON.stringify({ rule: node.rule, premises: node.premises, conclusion: node.conclusion });
    requireProof(!signatures.has(signature), "redundant-technique-work"); signatures.add(signature);
    const premises = node.premises.map(id => available.get(id)!);
    const c = node.conclusion;
    if (node.rule === "domain-restrict@1") {
      requireProof(c.kind === "domain" && proposal.effects.some(e => e.cell === c.cell), "outside-domain-closure");
      const base = domainAssertion(premises[0]?.conclusion), effect = premises[1]?.conclusion;
      requireProof(base && base.cell === c.cell && effect?.kind === "literal" && proposal.effects.some(e =>
        e.cell === effect.value.cell && e.symbol === effect.value.symbol && (e.kind === "place") === effect.value.positive) &&
        (c.mask !== base.mask || effect.value.positive), "outside-domain-closure");
    } else if (node.rule === "weak-link@1") {
      requireProof(c.kind === "clause" && c.alternatives.length === 2, "outside-peer-grammar");
      requireProof(c.alternatives.some(a => sourceCells.includes(a.cell) && c.alternatives.some(b => b.cell !== a.cell &&
        b.symbol === a.symbol && proposal.effects.some(e => e.kind === "remove" && e.cell === b.cell && e.symbol === b.symbol)) &&
        (proposal.technique !== "rule-propagation@1" || view.state.values[a.cell] === a.symbol)), "outside-peer-grammar");
    } else if (node.rule === "resolution@1") {
      const terms = c.kind === "literal" ? [c.value] : c.kind === "clause" && proposal.technique === "c03@1" ? c.alternatives : [];
      requireProof(terms.length > 0 && terms.every(v => v.positive ? sourceCells.includes(v.cell) && v.symbol === symbol :
        proposal.effects.some(e => e.kind === "remove" && e.cell === v.cell && e.symbol === v.symbol)) &&
        terms.filter(v => !v.positive).length === 1, "outside-resolution-grammar");
    } else if (node.rule === "cover-clause@1") {
      const terms = c.kind === "literal" ? [c.value] : c.kind === "clause" ? c.alternatives : [];
      requireProof(proposal.technique === "rule-propagation@1" ? terms.length === 1 && terms[0].positive &&
        view.state.values[terms[0].cell] === terms[0].symbol && node.premises[0] === view.state.domainFacts[terms[0].cell] :
        terms.length === sourceCells.length && terms.every(v => v.positive && sourceCells.includes(v.cell) && v.symbol === symbol), "outside-single-grammar");
      requireProof(premises[0]?.rule === "support@1" || (terms.length === 1 && node.premises[0] === view.state.domainFacts[terms[0].cell]), "outside-single-grammar");
    } else if (node.rule === "support@1") {
      requireProof(coverCells && sameValue(premises[0]?.conclusion, { kind: "cover", symbol, cells: coverCells }) &&
        sameValue(node.premises.slice(1), coverCells.map(cell => view.state.domainFacts[cell])), "outside-support-grammar");
    } else if (node.rule === "hall@1") {
      requireProof(allowedHall.some(h => sameValue(premises[0]?.conclusion, { kind: "all-different", cells: h.house }) &&
        sameValue(node.premises.slice(1), h.cells.map(cell => view.state.domainFacts[cell]))), "outside-hall-grammar");
    }
  }
  requireProof(nodes.length <= proposal.effects.length * 8 + 4, "technique-work-bound");
}

/** Scheduled checker uses cooperative complete-source coloring reconstruction. */
export function* checkTechniqueGrammarSteps(proposal:DeductionProposal,view:ReadView,available:ReadonlyMap<number,ProofNode>,charge?:(units:number)=>void):Generator<number,void,void>{
  if(proposal.technique==="c14@1"||proposal.technique==="c15@1"){
    for(const cell of view.assembly.problem.cells){yield 1;const fact=view.facts.get(view.state.domainFacts[cell]);
      requireProof(fact&&sameValue(domainAssertion(fact.proposition),{cell,mask:view.state.domains[cell]}),"unproved-current-domain");}
    yield* checkColoringPatternSteps(proposal,view,available);return;
  }
  checkTechniqueGrammar(proposal,view,available,charge);
}
