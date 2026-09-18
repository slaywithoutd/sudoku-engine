import type { DeductionProposal, ProofNode } from "../proof/types";
import type { ReadView } from "../state/types";
import { domainAssertion, requireProof, sameValue } from "../proof/primitives";
import { sourceFacts } from "../state/source-index";
import { symbolMask } from "../state/read";
import { defined } from "../invariants";
import { boundsRemovals } from "../rules/linear-rule";

/**
 * Closed grammar for relation maintenance (`rule-relation@1`): one complete
 * two-cell table filtered from the rule's relation fact and both current
 * domain facts, one projection per removed candidate, and the ordinary domain
 * closure. The grammar recomputes the compatible tuples itself and never asks
 * discovery whether its table is right; the table primitives then recheck the
 * same rows independently.
 */
export function checkRelationMaintenance(
  proposal: DeductionProposal,
  view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
): void {
  const pattern = proposal.pattern as Record<string, unknown>;
  requireProof(
    sameValue(Object.keys(pattern).sort(), ["constraintId", "kind"]) &&
      pattern.kind === "relation" &&
      typeof pattern.constraintId === "string",
    "invalid-relation-maintenance-pattern",
  );
  const constraintId = pattern.constraintId as string;
  const relation = view.assembly.relations.find(
    (candidate) => candidate.id === `${constraintId}:relation`,
  );
  requireProof(
    relation !== undefined && relation.cells.length === 2,
    "unknown-relation-maintenance-rule",
  );
  const cells = relation.cells;
  requireProof(
    proposal.effects.length > 0 &&
      proposal.effects.every(
        (effect) =>
          effect.kind === "remove" &&
          cells.includes(effect.cell) &&
          view.state.values[effect.cell] === 0 &&
          (view.state.domains[effect.cell] & symbolMask(effect.symbol)) !== 0,
      ),
    "invalid-relation-maintenance-effect",
  );
  const fact = sourceFacts(view, "relation").find(
    (candidate) =>
      candidate.proposition.kind === "relation" &&
      sameValue(candidate.proposition.cells, cells) &&
      sameValue(candidate.rules, [constraintId]) &&
      !candidate.conditional &&
      candidate.openAssumptions.length === 0,
  );
  requireProof(
    fact !== undefined && fact.proposition.kind === "relation",
    "missing-relation-maintenance-source",
  );
  const domains = cells.map((cell) => view.state.domains[cell]);
  // Independent recomputation of the compatible tuples and of each cell's support.
  const supported = cells.map(() => 0);
  let count = 0;
  for (const tuple of fact.proposition.tuples)
    if (tuple.every((symbol, index) => domains[index] & symbolMask(symbol))) {
      count += 1;
      tuple.forEach((symbol, index) => {
        supported[index] |= symbolMask(symbol);
      });
    }
  for (const effect of proposal.effects)
    requireProof(
      (supported[cells.indexOf(effect.cell)] & symbolMask(effect.symbol)) === 0,
      "unsupported-relation-maintenance-effect",
    );

  const nodes = proposal.proof.nodes;
  const tables = nodes.filter((node) => node.rule === "table-filter@1");
  requireProof(tables.length === 1, "invalid-relation-maintenance-table");
  const [table] = tables;
  requireProof(
    table.scope.length === 0 &&
      sameValue(table.premises, [
        fact.root,
        ...cells.map((cell) => view.state.domainFacts[cell]),
      ]) &&
      sameValue(table.parameters, { cells, box: domains }) &&
      sameValue(table.conclusion, { kind: "table", cells, count, definition: table.id }),
    "invalid-relation-maintenance-table",
  );
  const signatures = new Set<string>();
  const effectRoots = new Set(proposal.proof.roots);
  for (const node of nodes) {
    requireProof(node.scope.length === 0, "outside-technique-grammar");
    const signature = JSON.stringify({
      rule: node.rule,
      premises: node.premises,
      conclusion: node.conclusion,
    });
    requireProof(!signatures.has(signature), "redundant-technique-work");
    signatures.add(signature);
    if (node === table) continue;
    const proposition = node.conclusion;
    if (node.rule === "table-project@1") {
      requireProof(
        sameValue(node.premises, [table.id]) &&
          sameValue(node.parameters, {}) &&
          proposition.kind === "literal" &&
          !proposition.value.positive &&
          proposal.effects.some(
            (effect) =>
              effect.cell === proposition.value.cell && effect.symbol === proposition.value.symbol,
          ) &&
          effectRoots.has(node.id),
        "outside-relation-maintenance-grammar",
      );
      continue;
    }
    requireProof(node.rule === "domain-restrict@1", "outside-technique-grammar");
    const premises = node.premises.map((id) => defined(available.get(id), "available"));
    const base = domainAssertion(premises[0]?.conclusion),
      conclusion = premises.at(1)?.conclusion;
    requireProof(
      proposition.kind === "domain" &&
        base !== undefined &&
        base.cell === proposition.cell &&
        conclusion?.kind === "literal" &&
        !conclusion.value.positive &&
        proposal.effects.some(
          (effect) =>
            effect.cell === conclusion.value.cell && effect.symbol === conclusion.value.symbol,
        ) &&
        proposition.mask !== base.mask,
      "outside-domain-closure",
    );
  }
  requireProof(nodes.length <= 1 + proposal.effects.length * 2, "technique-work-bound");
}

/**
 * Closed grammar for sum maintenance (`rule-sum@1`): every effect root is one
 * linear-sum@1 node over the rule's sum fact and the current domain facts of
 * all its cells, concluding the removed candidate; then ordinary domain
 * closure. The grammar recomputes lemma LS's bounds itself before the
 * primitive rechecks the arithmetic.
 */
export function checkSumMaintenance(
  proposal: DeductionProposal,
  view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
): void {
  const pattern = proposal.pattern as Record<string, unknown>;
  requireProof(
    sameValue(Object.keys(pattern).sort(), ["constraintId", "kind"]) &&
      pattern.kind === "sum" &&
      typeof pattern.constraintId === "string",
    "invalid-sum-maintenance-pattern",
  );
  const constraintId = pattern.constraintId as string;
  const sum = view.assembly.sums.find((candidate) => candidate.id === `${constraintId}:sum`);
  requireProof(sum !== undefined, "unknown-sum-maintenance-rule");
  const fact = sourceFacts(view, "sum").find(
    (candidate) =>
      candidate.proposition.kind === "sum" &&
      sameValue(candidate.proposition, {
        kind: "sum",
        cells: sum.cells,
        coefficients: sum.coefficients,
        total: sum.total,
      }) &&
      sameValue(candidate.rules, [constraintId]) &&
      !candidate.conditional &&
      candidate.openAssumptions.length === 0,
  );
  requireProof(fact !== undefined, "missing-sum-maintenance-source");
  const open = sum.cells.map((cell) => view.state.values[cell] === 0);
  const expected = boundsRemovals(
    view.assembly.problem,
    sum,
    sum.cells.map((cell) => view.state.domains[cell]),
    open,
  );
  requireProof(
    proposal.effects.length > 0 &&
      proposal.effects.every(
        (effect) =>
          effect.kind === "remove" &&
          expected.some(
            (removal) => removal.cell === effect.cell && removal.symbol === effect.symbol,
          ),
      ),
    "unsupported-sum-maintenance-effect",
  );
  const premises = [fact.root, ...sum.cells.map((cell) => view.state.domainFacts[cell])];
  const effectRoots = new Set(proposal.proof.roots);
  const signatures = new Set<string>();
  for (const node of proposal.proof.nodes) {
    requireProof(node.scope.length === 0, "outside-technique-grammar");
    const signature = JSON.stringify({
      rule: node.rule,
      premises: node.premises,
      conclusion: node.conclusion,
    });
    requireProof(!signatures.has(signature), "redundant-technique-work");
    signatures.add(signature);
    const proposition = node.conclusion;
    if (node.rule === "linear-sum@1") {
      requireProof(
        sameValue(node.premises, premises) &&
          sameValue(node.parameters, {}) &&
          proposition.kind === "literal" &&
          !proposition.value.positive &&
          proposal.effects.some(
            (effect) =>
              effect.cell === proposition.value.cell && effect.symbol === proposition.value.symbol,
          ) &&
          effectRoots.has(node.id),
        "outside-sum-maintenance-grammar",
      );
      continue;
    }
    requireProof(node.rule === "domain-restrict@1", "outside-technique-grammar");
    const nodePremises = node.premises.map((id) => defined(available.get(id), "available"));
    const base = domainAssertion(nodePremises[0]?.conclusion),
      conclusion = nodePremises.at(1)?.conclusion;
    requireProof(
      proposition.kind === "domain" &&
        base !== undefined &&
        base.cell === proposition.cell &&
        conclusion?.kind === "literal" &&
        !conclusion.value.positive &&
        proposal.effects.some(
          (effect) =>
            effect.cell === conclusion.value.cell && effect.symbol === conclusion.value.symbol,
        ) &&
        proposition.mask !== base.mask,
      "outside-domain-closure",
    );
  }
  requireProof(proposal.proof.nodes.length <= proposal.effects.length * 2, "technique-work-bound");
}
