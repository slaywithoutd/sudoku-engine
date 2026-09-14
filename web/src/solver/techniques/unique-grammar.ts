import type { ReadView, Literal } from "../state/types";
import type { DeductionProposal, ProofNode } from "../proof/types";
import { clause, requireProof, sameValue } from "../proof/primitives";
import { ForcingLineage, checkForcingRoots } from "./forcing-grammar";
import type { UniqueGeometry, UniquePlan, UniqueCertificate } from "./unique-compiler";

const symbols = (mask: number): number[] => Array.from({ length: 9 }, (_, i) => i + 1).filter(s => mask & (1 << (s - 1)));
const row = (c: number): number => Math.floor(c / 9), col = (c: number): number => c % 9;
const box = (c: number): number => Math.floor(c / 27) * 3 + Math.floor(c % 9 / 3);
const count = (values: readonly number[]): number => new Set(values).size;
const opposite = (a: Literal): Literal => ({ ...a, positive: !a.positive });
const aliases = { type1: "Unique Rectangle type 1", type2: "Unique Rectangle type 2", type3: "Unique Rectangle type 3",
  type4: "Unique Rectangle type 4", type5: "Unique Rectangle type 5", type6: "Unique Rectangle type 6", hidden: "Hidden Rectangle",
  avoidable1: "Avoidable Rectangle", avoidable2: "Avoidable Rectangle", extended: "Extended Rectangle", loop: "Unique Loops" } as const;

/** Coordinate annotation is checked against declared classic house capabilities. */
function scaffold(view: ReadView): void {
  requireProof(view.assembly.problem.cells.length === 81 && view.assembly.problem.symbols.length === 9, "unique-classic-geometry");
  for (const coordinate of [row, col, box]) for (let n = 0; n < 9; n++) {
    const cells = view.assembly.problem.cells.filter(c => coordinate(c) === n);
    requireProof(view.assembly.allDifferent.some(h => sameValue(h.cells, cells)), "unique-classic-capability");
  }
}

/** Named semantics are independent of production geometry enumeration and compilation. */
export function checkUniqueGeometry(g: UniqueGeometry, view: ReadView, effect: DeductionProposal["effects"][number]): void {
  // Reject unknown forms before alias lookup: two absent values must never
  // compare equal and let a rectangle skip every named-form restriction.
  requireProof(g && (g.kind === "bug" || Object.hasOwn(aliases, g.kind)), "unique-named-kind");
  requireProof(sameValue(Object.keys(g).sort(), [
    "row", "kind", "alias", "cells", "coreMasks", "permutation", "guardians",
    "loopOrder", "auxiliaryCells", "subsetHouse", "strongSymbol", "strongHouses", "causalHouses",
  ].sort()), "unique-geometry-fields");
  scaffold(view);
  const p = view.assembly.problem, cells = g.cells, domains = view.state.domains;
  requireProof(Array.isArray(cells) && cells.length >= 4 && cells.length <= 81 && cells.every((c,i) => p.cells.includes(c) &&
    (!i || c > cells[i-1])) && cells.every(c => !p.givens[c]) && g.coreMasks.length === cells.length, "unique-named-cells");
  const guardians = cells.flatMap((cell,i) => symbols(domains[cell] & ~g.coreMasks[i]).map(symbol => ({ cell, symbol, positive: true })));
  requireProof(sameValue(g.guardians, guardians) && guardians.length > 0 && guardians.length <= 64, "unique-named-guardians");
  if (g.kind === "bug") {
    requireProof((g.row === "U04" && ["BUG", "BUG+1"].includes(g.alias) && guardians.length === 1) ||
      (g.row === "U05" && ["Generalized BUG", "BUG+n"].includes(g.alias) && guardians.length >= 2 && guardians.length <= 4), "unique-bug-bound");
    requireProof(g.permutation === null && sameValue(cells, p.cells.filter(c => !view.state.values[c])) &&
      cells.every((c,i) => symbols(g.coreMasks[i]).length === 2 && (domains[c] & g.coreMasks[i]) === g.coreMasks[i]), "unique-bug-entire-residual");
    if (g.row === "U04") requireProof(effect.kind === "place" && effect.cell === guardians[0].cell && effect.symbol === guardians[0].symbol, "unique-bug-plus1-effect");
    return;
  }
  requireProof(g.alias === aliases[g.kind], "unique-named-alias");
  requireProof(g.coreMasks.every(mask => mask === g.coreMasks[0]), "unique-common-core");
  const core = symbols(g.coreMasks[0]), roofs = cells.filter(c => guardians.some(a => a.cell === c));
  if (g.kind === "loop") {
    requireProof(g.row === "U03" && cells.length <= 12 && cells.length % 2 === 0 && core.length === 2 && guardians.length <= 4 && g.permutation === null,
      "unique-loop-bound");
    requireProof(g.loopOrder.length === cells.length && new Set(g.loopOrder).size === cells.length && g.loopOrder.every(c => cells.includes(c)), "unique-loop-order");
    for (let i = 0; i < cells.length; i++) requireProof(view.assembly.allDifferent.some(h => h.cells.includes(g.loopOrder[i]) && h.cells.includes(g.loopOrder[(i+1)%cells.length])), "unique-loop-edge");
    for (const h of view.assembly.allDifferent) {
      const selected = h.cells.filter(c => cells.includes(c));
      requireProof(selected.length === 0 || selected.length === 2 && g.loopOrder.indexOf(selected[0]) % 2 !== g.loopOrder.indexOf(selected[1]) % 2, "unique-loop-alternation");
    }
    requireProof(cells.every(c => !view.state.values[c] && (domains[c] & g.coreMasks[0]) === g.coreMasks[0]), "unique-loop-core");
    return;
  }
  if (g.kind === "extended") {
    requireProof(g.row === "U02" && cells.length === 6 && core.length === 3 && count(cells.map(box)) === 3 &&
      (count(cells.map(row)) === 2 && count(cells.map(col)) === 3 || count(cells.map(row)) === 3 && count(cells.map(col)) === 2) &&
      g.permutation?.length === 6 && guardians.length <= 36 && cells.every(c => !view.state.values[c] && (domains[c] & g.coreMasks[0]) === g.coreMasks[0]), "unique-extended-geometry");
    return;
  }
  requireProof(cells.length === 4 && count(cells.map(row)) === 2 && count(cells.map(col)) === 2 && count(cells.map(box)) === 2 &&
    core.length === 2 && g.permutation === null, "unique-rectangle-geometry");
  const avoidable = g.kind === "avoidable1" || g.kind === "avoidable2";
  requireProof(g.row === (g.kind.startsWith("type") ? "U01" : "U02"), "unique-row-kind");
  if (avoidable) {
    const derived = cells.filter(c => view.state.values[c]);
    requireProof(derived.length === (g.kind === "avoidable1" ? 3 : 2) && derived.every(c => core.includes(view.state.values[c])) &&
      roofs.length === 4-derived.length, "unique-avoidable-derived");
  } else requireProof(cells.every(c => !view.state.values[c] && (domains[c] & g.coreMasks[0]) === g.coreMasks[0]), "unique-rectangle-core");
  const peers = (a: number,b: number) => a !== b && view.assembly.allDifferent.some(h => h.cells.includes(a) && h.cells.includes(b));
  const adjacent = roofs.length === 2 && (row(roofs[0]) === row(roofs[1]) || col(roofs[0]) === col(roofs[1]));
  if (g.kind === "type1" || g.kind === "avoidable1") requireProof(roofs.length === 1 && effect.kind === "remove" &&
    effect.cell === roofs[0] && core.includes(effect.symbol), "unique-type1-effect");
  if (["type2", "type5", "avoidable2"].includes(g.kind)) {
    requireProof(count(guardians.map(a => a.symbol)) === 1 && effect.kind === "remove" && effect.symbol === guardians[0].symbol &&
      !cells.includes(effect.cell) && roofs.every(c => peers(c, effect.cell)), "unique-common-extra-effect");
    if (g.kind === "type2") requireProof(adjacent, "unique-type2-roofs");
    if (g.kind === "type5") requireProof(roofs.length === 3 || roofs.length === 2 && !adjacent, "unique-type5-roofs");
  }
  if (g.kind === "type3") {
    const extra = [...new Set(guardians.map(a => a.symbol))].sort((a,b) => a-b), h = view.assembly.allDifferent.find(h => h.id === g.subsetHouse);
    requireProof(adjacent && extra.length >= 2 && extra.length <= 4 && h && roofs.every(c => h.cells.includes(c)) &&
      g.auxiliaryCells.length === extra.length-1 && new Set(g.auxiliaryCells).size === g.auxiliaryCells.length &&
      g.auxiliaryCells.every(c => h.cells.includes(c) && !cells.includes(c) && !view.state.values[c] && symbols(domains[c]).every(s => extra.includes(s))) &&
      effect.kind === "remove" && h.cells.includes(effect.cell) && !cells.includes(effect.cell) && !g.auxiliaryCells.includes(effect.cell) && extra.includes(effect.symbol), "unique-virtual-subset");
  }
  if (["type4", "type6", "hidden"].includes(g.kind)) {
    requireProof(core.includes(g.strongSymbol!) && g.strongHouses.length === (g.kind === "type4" ? 1 : g.kind === "type6" ? 4 : 2) &&
      new Set(g.strongHouses).size === g.strongHouses.length, "unique-strong-house-count");
    const houses = g.strongHouses.map(id => view.assembly.allDifferent.find(h => h.id === id));
    requireProof(houses.every(h => h && h.cells.filter(c => domains[c] & (1 << (g.strongSymbol!-1))).length === 2 &&
      h.cells.filter(c => domains[c] & (1 << (g.strongSymbol!-1))).every(c => cells.includes(c))), "unique-strong-supports");
    if (g.kind === "type4") requireProof(adjacent && roofs.every(c => houses[0]!.cells.includes(c)) && effect.kind === "remove" && roofs.includes(effect.cell) &&
      core.includes(effect.symbol) && effect.symbol !== g.strongSymbol, "unique-type4-effect");
    if (g.kind === "type6") {
      const causal=g.causalHouses.map(id=>view.assembly.allDifferent.find(h=>h.id===id));
      requireProof(roofs.length===2&&!adjacent&&effect.kind==="remove"&&roofs.includes(effect.cell)&&effect.symbol===g.strongSymbol&&
        houses.filter(h=>count(h!.cells.map(row))===1).length===2&&houses.filter(h=>count(h!.cells.map(col))===1).length===2&&
        g.causalHouses.length===2&&new Set(g.causalHouses).size===2&&g.causalHouses.every(id=>g.strongHouses.includes(id))&&
        (causal.every(h=>count(h!.cells.map(row))===1)||causal.every(h=>count(h!.cells.map(col))===1)),"unique-type6-effect");
    }
    if (g.kind === "hidden") requireProof(effect.kind === "remove" && cells.includes(effect.cell) &&
      cells.some(c=>row(c)!==row(effect.cell)&&col(c)!==col(effect.cell)&&domains[c]===g.coreMasks[0]) &&
      core.includes(effect.symbol) && effect.symbol !== g.strongSymbol && houses.every(h => h!.cells.includes(effect.cell)) &&
      houses.some(h => count(h!.cells.map(row)) === 1) && houses.some(h => count(h!.cells.map(col)) === 1), "unique-hidden-effect");
  }
}

/** Exact trade/case ancestry for every root; valid unrelated roots cannot decorate the name. */
export function checkUniquePattern(proposal: DeductionProposal, view: ReadView, available: ReadonlyMap<number, ProofNode>): void {
  const p=proposal.pattern as unknown as UniquePlan & {certificate:UniqueCertificate};
  if(p.geometry?.kind!=="type6") {
    requireProof(!p.companion&&!p.certificate?.companion,"unique-unexpected-companion");
    checkUniqueOne(proposal,view,available);return;
  }
  requireProof(p.companion&&p.certificate?.companion&&proposal.effects.length===2,"unique-type6-atomic-effects");
  const roofs=p.geometry.cells.filter(c=>p.geometry.guardians.some(a=>a.cell===c));
  requireProof(new Set(proposal.effects.map(e=>e.cell)).size===2&&proposal.effects.every(e=>e.kind==="remove"&&roofs.includes(e.cell)&&e.symbol===p.geometry.strongSymbol)&&
    sameValue(proposal.effects[1],p.companion.effect),"unique-type6-atomic-effects");
  const roots=new Set<number>();
  for(const [i,effect]of proposal.effects.entries()) {
    const certificate=i?p.certificate.companion:p.certificate,consequence=i?p.companion.consequence:p.consequence;
    const domainRoots=proposal.proof.roots.filter(id=>{const q=available.get(id)?.conclusion;return q?.kind==="domain"&&q.cell===effect.cell;});
    const selected=[certificate!.root,...domainRoots];selected.forEach(id=>roots.add(id));
    checkUniqueOne({...proposal,effects:[effect],pattern:{geometry:p.geometry,consequence,certificate} as any,proof:{...proposal.proof,roots:selected}},view,available);
  }
  requireProof(roots.size===proposal.proof.roots.length&&proposal.proof.roots.every(id=>roots.has(id)),"unique-type6-extraneous-root");
}

function checkUniqueOne(proposal: DeductionProposal, view: ReadView, available: ReadonlyMap<number, ProofNode>): void {
  const p = proposal.pattern as unknown as UniquePlan & { certificate: UniqueCertificate }, c = p.certificate;
  requireProof(p.geometry && p.consequence && c && proposal.technique === `${p.geometry.row.toLowerCase()}@1` && proposal.effects.length > 0, "unique-pattern");
  checkUniqueGeometry(p.geometry, view, proposal.effects[0]);
  const l = new ForcingLineage(view, available), trade = l.node(c.trade), g = p.geometry;
  requireProof(trade.rule === "unique-transform@1" && !trade.scope.length && sameValue(trade.conclusion, clause(g.guardians)) &&
    sameValue((trade.parameters as any).cells, g.cells) && sameValue((trade.parameters as any).coreMasks, g.coreMasks) &&
    sameValue((trade.parameters as any).permutation, g.permutation), "unique-trade-lineage");
  const expected = new Set(view.state.domainFacts);
  for (const fact of view.facts.values()) if (fact.proposition.kind === "rule" || fact.proposition.kind === "literal" && fact.proposition.value.positive &&
    view.assembly.problem.givens[fact.proposition.value.cell] === fact.proposition.value.symbol) expected.add(fact.id);
  const leaves = new Set<number>();
  const source = (id: number, depth = 0): void => {
    requireProof(depth <= 3, "unique-source-depth");
    if (view.facts.has(id)) { requireProof(expected.has(id), "unique-source-substitution"); leaves.add(id); return; }
    const node = l.node(id); requireProof(node.rule === "conjunction@1" && !node.scope.length && sameValue(node.parameters, {}), "unique-source-conjunction");
    node.premises.forEach(id => source(id, depth+1));
  };
  trade.premises.forEach(id => source(id)); requireProof(leaves.size === expected.size && [...expected].every(id => leaves.has(id)), "unique-source-incomplete");
  const effect = proposal.effects[0], target = { cell: effect.cell, symbol: effect.symbol, positive: effect.kind === "place" };
  const root = l.node(c.root);
  requireProof(!root.scope.length && sameValue(root.conclusion, clause([target])), "unique-root");
  if (p.consequence.kind === "denial") {
    requireProof(c.branches.length === 1 && p.consequence.paths.length === g.guardians.length, "unique-denial-complete");
    const b = c.branches[0], a = l.node(b.assumption), result = l.node(b.result);
    requireProof(a.rule === "assume@1" && !a.scope.length && sameValue(a.conclusion, clause([opposite(target)])) && b.paths.length === g.guardians.length, "unique-denial-assumption");
    p.consequence.paths.forEach((path,i) => {
      l.path(a.id, path, b.paths[i], [a.id]);
      requireProof(sameValue(l.node(b.paths[i].end).conclusion, clause([opposite(g.guardians[i])])), "unique-denial-alternative");
    });
    requireProof(new Set(b.paths.flatMap(p => p.links)).size <= 24 && result.rule === "contradiction@1" &&
      sameValue(result.premises, [trade.id, ...b.paths.map(p => p.end)]) && root.rule === "discharge@1" && sameValue(root.premises, [a.id,result.id]), "unique-denial-lineage");
  } else {
    requireProof(p.consequence.kind === "cases" && p.consequence.branches.length === g.guardians.length && c.branches.length === g.guardians.length, "unique-incomplete-cases");
    const seen = new Set<string>();
    for (const [i,b] of p.consequence.branches.entries()) {
      const certificate = c.branches[i], a = l.node(certificate.assumption), result = l.node(certificate.result), key = JSON.stringify(b.assumption);
      requireProof(!seen.has(key) && g.guardians.some(v => sameValue(v,b.assumption)) && a.rule === "assume@1" && !a.scope.length && sameValue(a.conclusion,clause([b.assumption])), "unique-case-assumption"); seen.add(key);
      requireProof(b.paths.length === (b.result === "false" ? 2 : 1) && certificate.paths.length === b.paths.length &&
        new Set(certificate.paths.flatMap(p => p.links)).size <= 24, "unique-case-bound");
      b.paths.forEach((path,j) => l.path(a.id,path,certificate.paths[j],[a.id]));
      if (b.result === "false") requireProof(result.rule === "contradiction@1" && sameValue(result.premises,certificate.paths.map(p => p.end)), "unique-case-contradiction");
      else requireProof(result.id === certificate.paths[0].end && sameValue(b.result,target), "unique-case-target");
    }
    const order = p.consequence.branches.map((b,i) => ({ b,c:c.branches[i] })).sort((a,b) => a.b.assumption.cell-b.b.assumption.cell || a.b.assumption.symbol-b.b.assumption.symbol);
    requireProof(root.rule === "cases@1" && sameValue(root.premises,[trade.id,...order.flatMap(({c}) => [c.assumption,c.result])]), "unique-cases-lineage");
  }
  // Claimed strong houses and virtual auxiliaries must participate in this root's actual derivation.
  const ancestors = new Set<number>(), stack = [c.root];
  while (stack.length) { const id = stack.pop()!; if (ancestors.has(id)) continue; ancestors.add(id); if (!view.facts.has(id)) stack.push(...l.node(id).premises); }
  const neededHouses=g.kind==="type6"?g.causalHouses.filter(id=>!view.assembly.allDifferent.find(h=>h.id===id)!.cells.includes(effect.cell)):g.strongHouses;
  if(g.kind==="type6")requireProof(neededHouses.length===1,"unique-type6-opposite-house");
  for (const id of neededHouses) requireProof([...ancestors].some(n => {
    const node = available.get(n), support = node?.rule === "cover-clause@1" ? available.get(node.premises[0]) : undefined;
    return support?.rule === "support@1" && support.conclusion.kind === "cover" && support.conclusion.symbol === g.strongSymbol &&
      sameValue(view.facts.get(support.premises[0])?.proposition, { kind: "cover", cells: view.assembly.allDifferent.find(h => h.id === id)!.cells, symbol: g.strongSymbol });
  }), "unique-unused-strong-house");
  if (g.kind === "type3") for (const cell of g.auxiliaryCells) requireProof([...ancestors].some(id => {
    const n = available.get(id); return n?.rule === "cover-clause@1" && sameValue(n.premises,[view.state.domainFacts[cell]]);
  }), "unique-unused-auxiliary");
  checkForcingRoots(proposal,view,available,c.root);
}
