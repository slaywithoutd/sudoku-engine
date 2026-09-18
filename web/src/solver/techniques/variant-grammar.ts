import type { DeductionProposal, ProofNode } from "../proof/types";
import type { ReadView } from "../state/types";
import { domainAssertion, requireProof, sameValue } from "../proof/primitives";
import { sourceFacts } from "../state/source-index";
import { symbolMask } from "../state/read";
import { defined } from "../invariants";
import { boundsRemovals } from "../rules/linear-rule";
import { analyzeCage, boxVolume, K01_PROFILE, liveCages, withinProfile } from "./killer";

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

/**
 * Closed grammar for K01 (`k01@1`): one live cage within the profile, a
 * complete table over its all-different, sum and current domain facts built
 * from filter leaves and binary unions, and a single-literal projection per
 * removed candidate. The grammar recomputes the surviving rows and the leaf
 * counts itself; the table primitives then verify partition, completeness and
 * every projection independently.
 */
export function checkCageCombinations(
  proposal: DeductionProposal,
  view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
): void {
  const pattern = proposal.pattern as Record<string, unknown>;
  requireProof(
    sameValue(Object.keys(pattern).sort(), ["alias", "cage", "cells", "kind", "rows", "volume"]) &&
      pattern.kind === "cage-combinations" &&
      pattern.alias === "Killer combinations" &&
      typeof pattern.cage === "string",
    "invalid-cage-combinations-pattern",
  );
  const cage = liveCages(view).find((candidate) => candidate.constraintId === pattern.cage);
  requireProof(cage !== undefined, "unknown-cage");
  const analysis = analyzeCage(view, cage);
  requireProof(withinProfile(analysis), "cage-box-out-of-profile");
  requireProof(
    sameValue(pattern.cells, cage.cells) &&
      pattern.volume === analysis.volume &&
      pattern.rows === analysis.rows &&
      analysis.rows > 0,
    "invalid-cage-combinations-pattern",
  );
  requireProof(
    proposal.effects.length > 0 &&
      proposal.effects.every(
        (effect) =>
          effect.kind === "remove" &&
          analysis.removals.some(
            (removal) => removal.cell === effect.cell && removal.symbol === effect.symbol,
          ),
      ),
    "unsupported-cage-combinations-effect",
  );
  const premises = [
    cage.scope.root,
    cage.sum.root,
    ...cage.cells.map((cell) => view.state.domainFacts[cell]),
  ];
  const nodes = proposal.proof.nodes;
  const byId = new Map(nodes.map((node) => [node.id, node] as const));
  const effectRoots = new Set(proposal.proof.roots);
  let leaves = 0,
    unions = 0,
    projections = 0;
  const tops = new Set<number>();
  for (const node of nodes) {
    requireProof(node.scope.length === 0, "outside-technique-grammar");
    const proposition = node.conclusion;
    if (node.rule === "table-filter@1") {
      leaves += 1;
      const parameters = node.parameters as { cells?: unknown; box?: unknown };
      const box = parameters.box;
      requireProof(
        sameValue(node.premises, premises) &&
          sameValue(parameters, { cells: cage.cells, box }) &&
          Array.isArray(box) &&
          box.length === cage.cells.length &&
          box.every(
            (mask, index) =>
              Number.isSafeInteger(mask) && ((mask as number) & analysis.domains[index]) === mask,
          ) &&
          boxVolume(view.assembly.problem, box as number[]) <= K01_PROFILE.leafVolume &&
          proposition.kind === "table" &&
          sameValue(proposition, {
            kind: "table",
            cells: cage.cells,
            count: proposition.count,
            definition: node.id,
          }),
        "invalid-cage-combinations-leaf",
      );
      continue;
    }
    if (node.rule === "table-union@1") {
      unions += 1;
      requireProof(
        node.premises.length === 2 &&
          node.premises.every((id) => {
            const child = byId.get(id);
            return child?.rule === "table-filter@1" || child?.rule === "table-union@1";
          }) &&
          sameValue(node.parameters, {}) &&
          proposition.kind === "table" &&
          sameValue(proposition, {
            kind: "table",
            cells: cage.cells,
            count: proposition.count,
            definition: node.id,
          }),
        "invalid-cage-combinations-union",
      );
      continue;
    }
    if (node.rule === "table-project@1") {
      projections += 1;
      const table = node.premises.length === 1 ? byId.get(node.premises[0]) : undefined;
      requireProof(
        table !== undefined &&
          (table.rule === "table-filter@1" || table.rule === "table-union@1") &&
          table.conclusion.kind === "table" &&
          table.conclusion.count === analysis.rows &&
          sameValue(node.parameters, {}) &&
          proposition.kind === "literal" &&
          !proposition.value.positive &&
          proposal.effects.some(
            (effect) =>
              effect.cell === proposition.value.cell && effect.symbol === proposition.value.symbol,
          ) &&
          effectRoots.has(node.id),
        "outside-cage-combinations-grammar",
      );
      tops.add(table.id);
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
  // One complete table serves every projection; the union tree is binary.
  requireProof(
    tops.size === 1 &&
      leaves >= 1 &&
      unions === leaves - 1 &&
      projections === proposal.effects.length &&
      leaves <= Math.ceil(K01_PROFILE.maxInputBox / K01_PROFILE.leafVolume) * 9,
    "cage-combinations-shape",
  );
}
