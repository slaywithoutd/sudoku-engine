import { matchingFacts } from "../state/source-index";
import type { DeductionProposal, ProofNode, Proposition } from "../proof/types";
import type { ReadView } from "../state/types";
import { clause, requireProof, sameValue } from "../proof/primitives";
import {
  fishHouse,
  validateFishPattern,
  type FishPattern,
  type FishRequirement,
} from "./fish-grammar";

const literal = (cell: number, symbol: number, positive: boolean): Proposition => ({
  kind: "literal",
  value: { cell, symbol, positive },
});
/** Exact named component lineage. Primitive-valid replacement proofs cannot
 * establish a named fish: each root must contain this component's full count,
 * current absences, and every directly proved fin-false branch. No pooled DAG.
 * The ordinary checker runs primitives first and remains the sole authority.
 */
class FishComponentLineage {
  constructor(
    readonly view: ReadView,
    readonly nodes: ReadonlyMap<number, ProofNode>,
    readonly requirement: FishRequirement,
  ) {}
  source(id: string, symbol?: number): number {
    const cells = fishHouse(this.view, id),
      fact = matchingFacts(
        this.view,
        symbol === undefined ? { kind: "all-different", cells } : { kind: "cover", cells, symbol },
      ).find((f) => !f.openAssumptions.length);
    requireProof(fact, "fish-unproved-house");
    return fact.id;
  }
  matches(rootId: number, target: number): boolean {
    const p = this.requirement.pattern,
      z = p.symbol,
      root = this.nodes.get(rootId);
    if (!root || !sameValue(root.conclusion, literal(target, z, false)) || root.scope.length)
      return false;
    let count = root,
      assumption: ProofNode | undefined;
    if (p.fins.length) {
      if (root.rule !== "discharge@1" || root.premises.length !== 2) return false;
      assumption = this.nodes.get(root.premises[0]);
      const contradiction = this.nodes.get(root.premises[1]);
      if (
        assumption?.rule !== "assume@1" ||
        assumption.scope.length ||
        !sameValue(assumption.conclusion, literal(target, z, true)) ||
        contradiction?.rule !== "contradiction@1" ||
        !sameValue(contradiction.premises[0], assumption.id) ||
        contradiction.premises.length !== 2
      )
        return false;
      count = this.nodes.get(contradiction.premises[1])!;
    }
    const scope = assumption ? [assumption.id] : [];
    if (
      count?.rule !== "cover-count@1" ||
      !sameValue(count.scope, scope) ||
      !sameValue(count.conclusion, literal(target, z, false))
    )
      return false;
    const covers = p.bases.map((id) => ({ premise: this.source(id, z), coefficient: 1 })),
      capacities = p.covers.map((id) => ({ premise: this.source(id), coefficient: 1 }));
    if (!sameValue(count.parameters, { symbol: z, covers, capacities })) return false;
    const expected = [...covers.map((e) => e.premise), ...capacities.map((e) => e.premise)];
    for (let cell = 0; cell < 81; cell++)
      if (this.requirement.coefficients[cell] < 0 && !p.fins.includes(cell))
        expected.push(this.view.state.domainFacts[cell]);
    for (const fin of p.fins) {
      const candidates = count.premises
        .map((id) => this.nodes.get(id))
        .filter(
          (n) =>
            n?.rule === "domain-restrict@1" &&
            sameValue(n.scope, scope) &&
            sameValue(n.conclusion, {
              kind: "domain",
              cell: fin,
              mask: this.view.state.domains[fin] & ~(1 << (z - 1)),
            }),
        );
      const restricted = candidates.find((n) => {
        if (n!.premises[0] !== this.view.state.domainFacts[fin] || n!.premises.length !== 2)
          return false;
        const resolved = this.nodes.get(n!.premises[1]);
        if (
          resolved?.rule !== "resolution@1" ||
          resolved.premises.length !== 2 ||
          resolved.premises[0] !== assumption?.id ||
          !sameValue(resolved.scope, scope) ||
          !sameValue(resolved.conclusion, literal(fin, z, false))
        )
          return false;
        const weak = this.nodes.get(resolved.premises[1]),
          source = weak && this.view.facts.get(weak.premises[0]);
        return (
          weak?.rule === "weak-link@1" &&
          weak.premises.length === 1 &&
          sameValue(weak.scope, scope) &&
          source?.proposition.kind === "all-different" &&
          source.proposition.cells.includes(fin) &&
          source.proposition.cells.includes(target) &&
          sameValue(
            weak.conclusion,
            clause([
              { cell: fin, symbol: z, positive: false },
              { cell: target, symbol: z, positive: false },
            ]),
          )
        );
      });
      if (!restricted) return false;
      expected.push(restricted.id);
    }
    return sameValue(
      [...count.premises].sort((a, b) => a - b),
      expected.sort((a, b) => a - b),
    );
  }
}
/** Structural named admission only; called after normal primitive verification.
 * Every negative root belongs to a component; each component proves all of its
 * effects with separate roots, even where Siamese effect sets overlap.
 */
export function checkFishPattern(
  proposal: DeductionProposal,
  view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
): void {
  const requirements = validateFishPattern(
    view,
    proposal.pattern as unknown as FishPattern,
    proposal.technique,
    proposal.effects,
  );
  const accepted = new Set<number>(),
    perComponent: Set<number>[] = [];
  for (const requirement of requirements) {
    const lineage = new FishComponentLineage(view, available, requirement),
      local = new Set<number>();
    for (const effect of requirement.effects) {
      const matching = proposal.proof.roots.filter((id) => lineage.matches(id, effect.cell));
      requireProof(matching.length > 0, "fish-missing-component-root");
      matching.forEach((id) => {
        accepted.add(id);
        local.add(id);
      });
    }
    perComponent.push(local);
  }
  if (perComponent.length === 2)
    requireProof(
      [...perComponent[0]].every((id) => !perComponent[1].has(id)),
      "fish-shared-component-root",
    );
  for (const id of proposal.proof.roots) {
    const node = available.get(id)!;
    if (node.conclusion.kind === "literal" && !node.conclusion.value.positive)
      requireProof(accepted.has(id), "fish-unrelated-effect-root");
    else
      requireProof(
        node.rule === "domain-restrict@1" &&
          node.scope.length === 0 &&
          node.premises.length === 2 &&
          accepted.has(node.premises[1]) &&
          node.conclusion.kind === "domain" &&
          node.premises[0] === view.state.domainFacts[node.conclusion.cell],
        "fish-unrelated-domain-root",
      );
  }
}
