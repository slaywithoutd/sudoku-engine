import {preparedSources,sourceFacts} from "../state/source-index";
import type { ReadView, Literal } from "../state/types";
import type { DeductionProposal, ProofNode } from "../proof/types";
import { clause, requireProof, sameValue } from "../proof/primitives";
import type { ColoringPattern, ColorEdge } from "./coloring";
import { ChainSources, projectedSource } from "./chains-grammar";

const key = (l: Literal) => `${l.cell}:${l.symbol}`;
const identity = (e: ColorEdge) => JSON.stringify({ ends: [...e.ends].sort((a, b) => a.cell - b.cell || a.symbol - b.symbol), source: e.source });
const fields = (p: object, names: string[]) => requireProof(sameValue(Object.keys(p).sort(), names.sort()), "invalid-coloring-fields");

/** Independent complete-component reconstruction; at-least-one alone never supplies XOR. */
export function checkColoringPattern(proposal: DeductionProposal, view: ReadView, available: ReadonlyMap<number, ProofNode>): void {
  for(const _ of checkColoringPatternSteps(proposal,view,available)){/* Compatibility caller owns synchronous work. */}
}
export function* checkColoringPatternSteps(proposal: DeductionProposal, view: ReadView, available: ReadonlyMap<number, ProofNode>): Generator<number,void,void> {
  const p = proposal.pattern as unknown as ColoringPattern, medusa = proposal.technique === "c15@1";
  requireProof(proposal.effects.length > 0, "unproductive-coloring-pattern");
  fields(p, ["kind", "alias", "form", "components", "branches"]);
  requireProof(p.kind === "coloring" && ["trap", "cell-wrap", "house-wrap", "multi"].includes(p.form) &&
    (medusa ? p.alias === "3D Medusa" && p.form !== "multi" : ["Simple coloring", "Color trap", "Color wrap", "Multi-coloring"].includes(p.alias)), "invalid-coloring-alias");
  requireProof(Array.isArray(p.components) && p.components.length === (p.form === "multi" ? 2 : 1) &&
    Array.isArray(p.branches) && p.branches.length === 1 << p.components.length, "incomplete-color-alternatives");
  if (p.alias === "Color trap") requireProof(p.form === "trap", "invalid-coloring-alias");
  if (p.alias === "Color wrap") requireProof(p.form === "cell-wrap" || p.form === "house-wrap", "invalid-coloring-alias");
  if (p.alias === "Multi-coloring") requireProof(p.form === "multi", "invalid-coloring-alias");
  if (p.alias === "Simple coloring") requireProof(p.form !== "multi", "invalid-coloring-alias");
  const sources = new ChainSources(view, available), allKeys = new Set<string>(), edgeRoots = new Set<number>();
  for (const component of p.components) {
    fields(component, ["colors", "edges"]);
    requireProof(Array.isArray(component.colors) && component.colors.length === 2 && component.colors.every(xs => Array.isArray(xs) && xs.length > 0) &&
      Array.isArray(component.edges) && component.edges.length > 0, "invalid-color-component");
    const members = component.colors.flat(), colors = new Map<string, number>();
    requireProof(members.length <= (medusa ? 729 : 81) && (medusa || new Set(members.map(l => l.symbol)).size === 1), "color-component-out-of-profile");
    component.colors.forEach((xs, color) => xs.forEach(l => {
      fields(l, ["cell", "symbol", "positive"]);
      requireProof(l.positive && view.assembly.problem.cells.includes(l.cell) && view.assembly.problem.symbols.includes(l.symbol) &&
        !view.state.values[l.cell] && !!(view.state.domains[l.cell] & (1 << (l.symbol - 1))) && !allKeys.has(key(l)), "invalid-color-members");
      allKeys.add(key(l)); colors.set(key(l), color);
    }));
    const adjacency = new Map<string, string[]>(), found = new Set<string>();
    for (const edge of component.edges) {
      fields(edge, ["ends", "source", "roots"]);
      requireProof(Array.isArray(edge.ends) && edge.ends.length === 2 && edge.ends.every(l => colors.has(key(l))) &&
        colors.get(key(edge.ends[0])) !== colors.get(key(edge.ends[1])) && edge.source.kind !== "als" &&
        (medusa || edge.source.kind === "house" || edge.source.kind === "proved-cover") && Array.isArray(edge.roots) && edge.roots.length === 2, "invalid-color-xor");
      const signature = identity(edge); requireProof(!found.has(signature), "duplicate-color-edge"); found.add(signature);
      sources.strong(edge.source, edge.ends, edge.roots[0]); sources.weak(edge.roots[1], ...edge.ends);
      edge.roots.forEach(id => edgeRoots.add(id));
      for (const [a, b] of [edge.ends, [...edge.ends].reverse()]) { const xs = adjacency.get(key(a)) ?? []; xs.push(key(b)); adjacency.set(key(a), xs); }
    }
    const reached = new Set<string>(), pending = [key(members[0])];
    while (pending.length) { const at = pending.pop()!; if (reached.has(at)) continue; reached.add(at); pending.push(...(adjacency.get(at) ?? [])); }
    requireProof(reached.size === members.length, "disconnected-color-component");
    // Reconstruct every eligible XOR edge touching this component from closed current facts.
    const expected = new Set<string>();
    const include = (edge: ColorEdge) => {
      if (!edge.ends.some(l => colors.has(key(l)))) return;
      requireProof(edge.ends.every(l => colors.has(key(l))), "incomplete-color-component"); expected.add(identity(edge));
    };
    if (medusa) for (const cell of view.assembly.problem.cells) {
      if (view.state.values[cell]) continue;
      const symbols = view.assembly.problem.symbols.filter(s => view.state.domains[cell] & (1 << (s - 1)));
      if (symbols.length === 2) include({ ends: symbols.map(symbol => ({ cell, symbol, positive: true })) as [Literal, Literal], source: { kind: "cell", cell }, roots: [] });
    }
    for (const fact of sourceFacts(view,"cover")) {
      yield 1;
      if (fact.openAssumptions.length || fact.proposition.kind !== "cover") continue;
      const cover = fact.proposition;
      const house = view.assembly.allDifferent.find(h => h.cells.length === 9 && sameValue(h.cells, cover.cells)) ??
        view.assembly.allDifferent.find(h => h.cells.length === 9 && cover.cells.every(c => h.cells.includes(c))); if (!house) continue;
      const cells = cover.cells.filter(c => view.state.domains[c] & (1 << (cover.symbol - 1)));
      if (cells.length !== 2 || cells.some(c => view.state.values[c])) continue;
      // The house's checked all-different source supplies the at-most-one side.
      const prepared=preparedSources(view,"complete");
      if(prepared?!prepared.scopePair(cells[0],cells[1]):!sourceFacts(view,"all-different").some(f=>!f.openAssumptions.length&&f.proposition.kind==="all-different"&&cells.every(c=>f.proposition.kind==="all-different"&&f.proposition.cells.includes(c))))continue;
      include({ ends: cells.map(cell => ({ cell, symbol: cover.symbol, positive: true })) as [Literal, Literal],
        source: sameValue(house.cells, cover.cells) ? { kind: "house", house: house.id, symbol: cover.symbol } :
          { kind: "proved-cover", source: fact.id, house: house.id, symbol: cover.symbol }, roots: [] });
    }
    requireProof(sameValue([...found].sort(), [...expected].sort()), "incomplete-color-edges");
  }
  if (!medusa) requireProof(new Set(p.components.flatMap(c => c.colors.flat().map(l => l.symbol))).size === 1, "mixed-symbol-coloring");
  let invalid = 0;
  p.branches.forEach((branch, index) => {
    fields(branch, ["colors", "conflict", "witnesses", "roots", "proofs"]);
    requireProof(Array.isArray(branch.proofs) && branch.proofs.length === proposal.effects.length, "missing-color-branch-proofs");
    const expected = p.components.map((_, i) => (index >> (p.components.length - i - 1)) & 1);
    requireProof(sameValue(branch.colors, expected), "incomplete-color-branches");
    const assigned = new Set(p.components.flatMap((c, i) => c.colors[branch.colors[i]]).map(key));
    if (branch.conflict !== null) {
      requireProof(Array.isArray(branch.conflict) && branch.conflict.length === 2 && branch.conflict.every(l => assigned.has(key(l))) &&
        branch.roots.length === 1 && branch.witnesses.length === 0, "unjustified-color-conflict");
      sources.weak(branch.roots[0], ...branch.conflict); invalid++;
      if (p.form === "cell-wrap") requireProof(branch.conflict[0].cell === branch.conflict[1].cell, "invalid-cell-wrap");
      if (p.form === "house-wrap") requireProof(branch.conflict[0].cell !== branch.conflict[1].cell && branch.conflict[0].symbol === branch.conflict[1].symbol, "invalid-house-wrap");
    } else {
      requireProof(branch.witnesses.length === proposal.effects.length && branch.roots.length === proposal.effects.length, "incomplete-color-effects");
      proposal.effects.forEach((effect, i) => {
        const witness = branch.witnesses[i]; requireProof(assigned.has(key(witness)), "uncolored-effect-witness");
        sources.weak(branch.roots[i], witness, { cell: effect.cell, symbol: effect.symbol, positive: true });
      });
    }
  });
  requireProof(invalid < p.branches.length && (p.form === "trap" ? invalid === 0 : p.form === "multi" || invalid === 1), "invalid-color-alternatives");
  proposal.effects.forEach((effect, i) => {
    requireProof(effect.kind === "remove", "invalid-color-effect");
    const roots = proposal.proof.roots.filter(id => sameValue(available.get(id)?.conclusion,
      clause([{ cell: effect.cell, symbol: effect.symbol, positive: false }])));
    requireProof(roots.length > 0, "missing-color-effect-root");
    const checkCases = (id: number, depth: number, assumptions: number[], colors: number[]): void => {
      if (depth === p.components.length) {
        const branch = p.branches.find(b => sameValue(b.colors, colors))!, proof = branch.proofs[i];
        fields(proof, ["assumptions", "root"]);
        requireProof(proof.root === id && sameValue(proof.assumptions, assumptions), "substituted-color-branch-root");
        const valid = new Set(assumptions), allowed = new Set(edgeRoots);
        (branch.conflict ? branch.roots : [branch.roots[i]]).forEach(root => allowed.add(root));
        for (const node of proposal.proof.nodes) {
          if (allowed.has(projectedSource(node.id, available))) valid.add(node.id);
          else if (node.rule === "resolution@1" && node.premises.every(premise => valid.has(premise)) && sameValue(node.scope, assumptions)) valid.add(node.id);
          // Ancestor-scope propagation is a valid input to either of its two children.
          else if (node.rule === "resolution@1" && node.premises.every(premise => valid.has(premise)) &&
            node.scope.every((ancestor, at) => assumptions[at] === ancestor)) valid.add(node.id);
        }
        requireProof(valid.has(id) && sameValue(available.get(id)?.conclusion, branch.conflict ? { kind: "false" } :
          clause([{ cell: effect.cell, symbol: effect.symbol, positive: false }])), "unrelated-color-branch-root");
        return;
      }
      const node = available.get(id), component = p.components[depth], edge = component.edges[0];
      requireProof(node?.rule === "cases@1" && node.premises.length === 5 && sameValue(node.scope, assumptions) &&
        projectedSource(node.premises[0], available) === edge.roots[0], "missing-color-case-tree");
      const alternatives = [...edge.ends].sort((a, b) => a.cell - b.cell || a.symbol - b.symbol);
      alternatives.forEach((representative, choice) => {
        const assumptionId = node.premises[1 + choice * 2], assumption = available.get(assumptionId);
        requireProof(assumption?.rule === "assume@1" && sameValue(assumption.conclusion, clause([representative])) &&
          sameValue(assumption.scope, assumptions), "invalid-color-case-assumption");
        const color = component.colors.findIndex(xs => xs.some(l => key(l) === key(representative)));
        checkCases(node.premises[2 + choice * 2], depth + 1, [...assumptions, assumptionId], [...colors, color]);
      });
    };
    roots.forEach(id => checkCases(id, 0, [], []));
  });
  requireProof(proposal.proof.nodes.every(n => n.scope.length <= p.components.length &&
    ["support@1", "cover-clause@1", "weak-link@1", "resolution@1", "domain-restrict@1", "conjunction@1", "assume@1", "cases@1",
      "table-filter@1", "table-join@1", "table-project@1"].includes(n.rule)), "outside-coloring-grammar");
}
