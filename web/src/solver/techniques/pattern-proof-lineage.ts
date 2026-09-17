import type { DeductionProposal, Effect, ProofNode } from "../proof/types";
import type { ReadView } from "../state/types";
import type { BentPattern, ShortPath, ShortPattern } from "./pattern-contracts";
import { clause, requireProof, sameValue } from "../proof/primitives";

interface LocalTable {
  readonly box: readonly number[];
  readonly sources: readonly number[];
}

/**
 * Inspects primitive-checked nodes without constructing facts or consulting a
 * detector. Memoized, iterative traversal binds a named local table to its exact
 * current domains and complete conflict premises. Auxiliary relation tables do
 * not satisfy this contract and are deliberately outside this traversal.
 */
class BentTableLineage {
  readonly #checked = new Map<number, LocalTable>();
  constructor(
    readonly view: ReadView,
    readonly pattern: BentPattern,
    readonly available: ReadonlyMap<number, ProofNode>,
  ) {}

  check(root: number): void {
    const pending = [{ id: root, expanded: false }],
      active = new Set<number>();
    while (pending.length) {
      const { id, expanded } = pending.pop()!;
      if (this.#checked.has(id)) continue;
      const node = this.available.get(id);
      requireProof(
        node?.conclusion.kind === "table" &&
          node.conclusion.definition === id &&
          sameValue(node.conclusion.cells, this.pattern.cells),
        "invalid-bent-table-lineage",
      );
      if (!expanded) {
        requireProof(!active.has(id), "cyclic-bent-table-lineage");
        active.add(id);
        pending.push({ id, expanded: true });
        if (node.rule === "table-union@1") {
          requireProof(node.premises.length === 2, "invalid-bent-table-lineage");
          for (const child of node.premises) pending.push({ id: child, expanded: false });
        } else requireProof(node.rule === "table-filter@1", "invalid-bent-table-lineage");
        continue;
      }
      active.delete(id);
      if (node.rule === "table-filter@1") this.#checked.set(id, this.checkLeaf(node));
      else {
        const a = this.#checked.get(node.premises[0])!,
          b = this.#checked.get(node.premises[1])!;
        requireProof(a && b && sameValue(a.sources, b.sources), "mismatched-bent-table-sources");
        const changed = a.box.map((mask, i) => (mask !== b.box[i] ? i : -1)).filter((i) => i >= 0);
        requireProof(
          changed.length === 1 && (a.box[changed[0]] & b.box[changed[0]]) === 0,
          "invalid-bent-table-partition",
        );
        this.#checked.set(id, { sources: a.sources, box: a.box.map((mask, i) => mask | b.box[i]) });
      }
    }
    const complete = this.#checked.get(root)!;
    requireProof(
      sameValue(
        complete.box,
        this.pattern.cells.map((c) => this.view.state.domains[c]),
      ),
      "incomplete-bent-table-partition",
    );
    const source = this.available.get(root)!.conclusion;
    requireProof(source.kind === "table" && source.count > 0, "empty-local-pattern");
  }

  private checkLeaf(node: ProofNode): LocalTable {
    const p = this.pattern,
      parameters = node.parameters as { cells: number[]; box: number[] };
    requireProof(
      sameValue(parameters.cells, p.cells) &&
        parameters.box.length === p.cells.length &&
        node.premises.length === p.cells.length + p.conflicts.length,
      "incomplete-bent-table-sources",
    );
    const currentDomains = p.cells.map((c) => this.view.state.domainFacts[c]);
    requireProof(
      currentDomains.every((id) => node.premises.includes(id)),
      "stale-bent-table-domains",
    );
    const conflicts = node.premises.filter((id) => !currentDomains.includes(id));
    const declared = new Set(p.conflicts.map((pair) => pair.join(":"))),
      found = new Set<string>();
    for (const id of conflicts) {
      const subset = this.available.get(id);
      requireProof(
        subset?.rule === "all-different-subset@1" &&
          subset.conclusion.kind === "all-different" &&
          subset.premises.length === 1 &&
          subset.scope.length === 0,
        "invalid-bent-table-conflict",
      );
      const key = subset.conclusion.cells.join(":"),
        source = this.view.facts.get(subset.premises[0]);
      requireProof(
        declared.has(key) &&
          !found.has(key) &&
          source?.openAssumptions.length === 0 &&
          source.proposition.kind === "all-different" &&
          subset.conclusion.cells.every(
            (c) =>
              source.proposition.kind === "all-different" && source.proposition.cells.includes(c),
          ),
        "invalid-bent-table-conflict",
      );
      found.add(key);
    }
    requireProof(found.size === declared.size, "incomplete-bent-table-conflicts");
    requireProof(
      parameters.box.every(
        (mask, i) =>
          Number.isSafeInteger(mask) &&
          mask >= 0 &&
          (mask & this.view.state.domains[p.cells[i]]) === mask,
      ),
      "invalid-bent-table-partition",
    );
    return { sources: node.premises, box: parameters.box };
  }
}

/** A complete table merely listed as an extra root cannot decorate another proof. */
export function requireBentEffectLineage(
  proposal: DeductionProposal,
  view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
  pattern: BentPattern,
): void {
  const expected = clause(
    pattern.occurrences[pattern.nonrestrictedSymbol].map((cell) => ({
      cell,
      symbol: pattern.nonrestrictedSymbol,
      positive: true,
    })),
  );
  const tables = new BentTableLineage(view, pattern, available),
    projections = new Set<number>();
  for (const node of proposal.proof.nodes)
    if (node.rule === "table-project@1" && sameValue(node.conclusion, expected)) {
      requireProof(node.premises.length === 1, "invalid-bent-projection");
      tables.check(node.premises[0]);
      projections.add(node.id);
    }
  requireProof(projections.size > 0, "missing-bent-table-projection");
  // The outer checker has already established topological order and exact node
  // identity. This one-bit memo avoids retaining quadratic ancestor sets.
  const fromProjection = new Set<number>();
  for (const node of proposal.proof.nodes)
    if (projections.has(node.id) || node.premises.some((id) => fromProjection.has(id)))
      fromProjection.add(node.id);
  for (const effect of proposal.effects) {
    const roots = proposal.proof.roots.filter((id) =>
      sameValue(available.get(id)?.conclusion, {
        kind: "literal",
        value: { cell: effect.cell, symbol: effect.symbol, positive: false },
      }),
    );
    requireProof(
      roots.length > 0 && roots.every((id) => fromProjection.has(id)),
      "missing-bent-effect-lineage",
    );
  }
}

const positive = (cell: number, symbol: number) => ({ cell, symbol, positive: true });
const negative = (cell: number, symbol: number) => ({ cell, symbol, positive: false });
const clauseKey = (terms: Parameters<typeof clause>[0]) => JSON.stringify(clause(terms));

/**
 * Two small clause grammars bind one ER component: first derive its endpoint OR
 * from only its two covers and middle conflicts, then eliminate a target using
 * that OR and only its outer target conflicts. Per-node bit masks record exact
 * required leaf participation without pooling leaves from the other component.
 */
class ShortComponentLineage {
  readonly #endpoints = new Set<number>();
  constructor(
    readonly proposal: DeductionProposal,
    readonly view: ReadView,
    readonly available: ReadonlyMap<number, ProofNode>,
    readonly path: ShortPath,
  ) {
    const [a, b, c, d] = path.vertices,
      symbol = path.symbol;
    const covers = [
      [...a, ...b],
      [...c, ...d],
    ].map((cells) => clauseKey(cells.map((cell) => positive(cell, symbol))));
    const middle = new Map<string, number>();
    for (const left of b)
      for (const right of c)
        middle.set(
          clauseKey([negative(left, symbol), negative(right, symbol)]),
          1 << (middle.size + 2),
        );
    const required = (1 << (middle.size + 2)) - 1,
      local = new Map<number, number>();
    const endpoint = clauseKey([...a, ...d].map((cell) => positive(cell, symbol)));
    for (const node of proposal.proof.nodes) {
      const key = JSON.stringify(node.conclusion);
      if (node.rule === "cover-clause@1") {
        const which = covers.findIndex((cover) => cover === key);
        if (which >= 0 && this.matchesCover(node, which)) local.set(node.id, 1 << which);
      } else if (node.rule === "weak-link@1" || node.rule === "table-project@1") {
        const mask = middle.get(key);
        if (mask !== undefined) local.set(node.id, mask);
      } else if (node.rule === "resolution@1" && node.premises.every((id) => local.has(id))) {
        local.set(
          node.id,
          node.premises.reduce((mask, id) => mask | local.get(id)!, 0),
        );
      }
      if (node.rule === "resolution@1" && key === endpoint && local.get(node.id) === required)
        this.#endpoints.add(node.id);
    }
  }

  private matchesCover(node: ProofNode, which: number): boolean {
    const support = this.available.get(node.premises[0]);
    if (node.premises.length !== 1 || support?.rule !== "support@1") return false;
    const scope = this.view.assembly.allDifferent.find(
      (h) => h.id === this.path.strongHouses[which],
    )!.cells;
    const source = this.view.facts.get(support.premises[0]);
    return (
      source?.openAssumptions.length === 0 &&
      source.proposition.kind === "cover" &&
      source.proposition.symbol === this.path.symbol &&
      sameValue(source.proposition.cells, scope) &&
      sameValue(
        support.premises.slice(1),
        scope.map((c) => this.view.state.domainFacts[c]),
      )
    );
  }

  rootsFor(effect: Effect): readonly number[] {
    if (effect.symbol !== this.path.symbol || !this.#endpoints.size) return [];
    const outer = [...this.path.vertices[0], ...this.path.vertices[3]],
      conflicts = new Map<string, number>();
    if (outer.includes(effect.cell)) return [];
    for (const cell of outer)
      conflicts.set(
        clauseKey([negative(cell, effect.symbol), negative(effect.cell, effect.symbol)]),
        1 << (conflicts.size + 1),
      );
    const required = (1 << (conflicts.size + 1)) - 1,
      local = new Map<number, number>();
    for (const node of this.proposal.proof.nodes) {
      if (this.#endpoints.has(node.id)) local.set(node.id, 1);
      else if (node.rule === "weak-link@1" || node.rule === "table-project@1") {
        const mask = conflicts.get(JSON.stringify(node.conclusion));
        if (mask !== undefined) local.set(node.id, mask);
      } else if (node.rule === "resolution@1" && node.premises.every((id) => local.has(id)))
        local.set(
          node.id,
          node.premises.reduce((mask, id) => mask | local.get(id)!, 0),
        );
    }
    return this.proposal.proof.roots.filter(
      (id) =>
        local.get(id) === required &&
        sameValue(this.available.get(id)?.conclusion, {
          kind: "literal",
          value: negative(effect.cell, effect.symbol),
        }),
    );
  }
}

/** Distinct components need distinct roots; every supplied effect root must be component-local. */
export function requireDualRootLineage(
  proposal: DeductionProposal,
  view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
  pattern: ShortPattern,
): void {
  const components = pattern.paths.map(
    (path) => new ShortComponentLineage(proposal, view, available, path),
  );
  const roots = components.map(() => new Set<number>());
  for (const effect of proposal.effects) {
    const accepted = new Set<number>();
    components.forEach((component, index) => {
      const found = component.rootsFor(effect);
      found.forEach((id) => {
        roots[index].add(id);
        accepted.add(id);
      });
    });
    const supplied = proposal.proof.roots.filter((id) =>
      sameValue(available.get(id)?.conclusion, {
        kind: "literal",
        value: negative(effect.cell, effect.symbol),
      }),
    );
    requireProof(
      supplied.length > 0 && supplied.every((id) => accepted.has(id)),
      "missing-dual-effect-lineage",
    );
  }
  requireProof(
    roots.length === 2 && [...roots[0]].some((a) => [...roots[1]].some((b) => a !== b)),
    "missing-dual-component-root",
  );
}
