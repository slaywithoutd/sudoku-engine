import type { ReadView } from "../state/types";
import type { DeductionProposal, ProofNode } from "../proof/types";
import { clause, requireProof, sameValue } from "../proof/primitives";
import { symbolMask } from "../state/read";

export const requireFields = (pattern: object | null | undefined, keys: string[]) =>
  requireProof(
    pattern && sameValue(Object.keys(pattern).sort(), keys.sort()),
    "invalid-specialized-fields",
  );
export const orderedNumbers = (pattern: unknown): pattern is number[] =>
  Array.isArray(pattern) &&
  pattern.every((x, i) => Number.isSafeInteger(x) && (!i || x > pattern[i - 1]));
export const cellBox = (cell: number) => Math.floor(cell / 27) * 3 + Math.floor((cell % 9) / 3);
/** Independent named-proof inspection. This does not call a detector, builder,
 * production tuple iterator, or primitive semantic implementation. */
export class SpecializedAdmission {
  constructor(
    readonly proposal: DeductionProposal,
    readonly view: ReadView,
    readonly available: ReadonlyMap<number, ProofNode>,
  ) {}
  node(id: number, rule?: string): ProofNode {
    const n = this.available.get(id);
    requireProof(
      n && (!rule || n.rule === rule) && !n.scope.length,
      `missing-specialized-node:${id}:${rule}:${n?.rule}`,
    );
    return n;
  }
  house(kind: "row" | "column" | "box", i: number): readonly number[] {
    requireProof(Number.isInteger(i) && i >= 0 && i < 9, "invalid-specialized-house");
    const cells = Array.from({ length: 81 }, (_, cell) => cell).filter(
      (cell) =>
        (kind === "row" ? Math.floor(cell / 9) : kind === "column" ? cell % 9 : cellBox(cell)) ===
        i,
    );
    requireProof(
      this.view.assembly.allDifferent.some((house) => sameValue(house.cells, cells)),
      "missing-specialized-house",
    );
    return cells;
  }
  domain(cell: number): number {
    requireProof(this.view.assembly.problem.cells.includes(cell), "specialized-cell-bound");
    return this.view.state.domains[cell];
  }
  symbols(cell: number): number[] {
    return this.view.assembly.problem.symbols.filter(
      (symbol) => this.domain(cell) & symbolMask(symbol),
    );
  }
  peer(left: number, right: number): boolean {
    return (
      left !== right &&
      this.view.assembly.allDifferent.some(
        (house) => house.cells.includes(left) && house.cells.includes(right),
      )
    );
  }
  scope(id: number, cells: readonly number[]): void {
    const n = this.node(id, "all-different-subset@1");
    requireProof(
      n.premises.length === 1 &&
        sameValue(n.conclusion, {
          kind: "all-different",
          cells: [...cells].sort((left, right) => left - right),
        }),
      "invalid-specialized-conflict",
    );
    const fact = this.view.facts.get(n.premises[0]);
    requireProof(
      fact &&
        !fact.openAssumptions.length &&
        fact.proposition.kind === "all-different" &&
        cells.every(
          (cell) =>
            fact.proposition.kind === "all-different" && fact.proposition.cells.includes(cell),
        ),
      "unproved-specialized-conflict",
    );
  }
  support(root: number, cells: readonly number[], symbol: number): void {
    const n = this.node(root, "cover-clause@1"),
      support = this.node(n.premises[0], "support@1");
    requireProof(
      n.premises.length === 1 &&
        sameValue(
          support.premises.slice(1),
          cells.map((cell) => this.view.state.domainFacts[cell]),
        ) &&
        sameValue(
          n.conclusion,
          clause(
            cells
              .filter((cell) => this.domain(cell) & symbolMask(symbol))
              .map((cell) => ({ cell, symbol, positive: true })),
          ),
        ),
      "incomplete-specialized-cover",
    );
    const source = this.view.facts.get(support.premises[0]);
    requireProof(
      source &&
        !source.openAssumptions.length &&
        sameValue(source.proposition, { kind: "cover", cells, symbol }),
      "unproved-specialized-cover",
    );
  }
  local(
    id: number,
    cells: readonly number[],
    scopes: readonly (readonly number[])[],
    domainIds = cells.map((cell) => this.view.state.domainFacts[cell]),
    masks = cells.map((cell) => this.domain(cell)),
  ): void {
    const leaves: number[][] = [];
    const walk = (id: number): number[] => {
      const n = this.node(id),
        pattern = n.parameters as { cells: number[]; box: number[] };
      requireProof(
        n.conclusion.kind === "table" &&
          n.conclusion.definition === id &&
          sameValue(n.conclusion.cells, cells),
        "invalid-specialized-table",
      );
      if (n.rule === "table-union@1") {
        requireProof(n.premises.length === 2, "invalid-specialized-partition");
        const left = walk(n.premises[0]),
          right = walk(n.premises[1]),
          diff = left.flatMap((x, i) => (x === right[i] ? [] : [i]));
        requireProof(
          diff.length === 1 && !(left[diff[0]] & right[diff[0]]),
          "invalid-specialized-partition",
        );
        return left.map((x, i) => x | right[i]);
      }
      requireProof(
        n.rule === "table-filter@1" &&
          sameValue(pattern.cells, cells) &&
          Array.isArray(pattern.box) &&
          pattern.box.length === cells.length &&
          n.premises.length === cells.length + scopes.length &&
          sameValue(n.premises.slice(0, cells.length), domainIds),
        "incomplete-specialized-local-sources",
      );
      scopes.forEach((group, i) => this.scope(n.premises[cells.length + i], group));
      leaves.push([...n.premises]);
      return pattern.box;
    };
    requireProof(
      sameValue(walk(id), masks) && leaves.every((leaf) => sameValue(leaf, leaves[0])),
      "incomplete-specialized-local-domain",
    );
  }
  /** Exact singleton-cover restrictions, with every original domain retained. */
  restrictedLocal(
    id: number,
    cells: readonly number[],
    scopes: readonly (readonly number[])[],
    roots: readonly number[],
  ): void {
    let leaf = this.node(id);
    while (leaf.rule === "table-union@1") leaf = this.node(leaf.premises[0]);
    const sources = leaf.premises.slice(0, cells.length),
      masks = cells.map((cell, i) => {
        const required = [...new Set(roots)].filter((root) => {
          const proposition = this.node(root).conclusion;
          return (
            proposition.kind === "literal" &&
            proposition.value.positive &&
            proposition.value.cell === cell
          );
        });
        let source = sources[i];
        for (const root of [...required].reverse()) {
          const n = this.node(source, "domain-restrict@1");
          requireProof(
            n.premises.length === 2 && n.premises[1] === root,
            "substituted-specialized-domain",
          );
          source = n.premises[0];
        }
        requireProof(
          source === this.view.state.domainFacts[cell],
          "substituted-specialized-domain",
        );
        return required.reduce((mask, root) => {
          const proposition = this.node(root).conclusion;
          requireProof(proposition.kind === "literal", "invalid-specialized-domain");
          return mask & symbolMask(proposition.value.symbol);
        }, this.domain(cell));
      });
    this.local(id, cells, scopes, sources, masks);
  }
  join(id: number, left: number, right: number, filters: readonly number[]): void {
    const n = this.node(id, "table-join-filter@1");
    requireProof(
      sameValue(n.premises, [left, right, ...filters]) &&
        n.conclusion.kind === "table" &&
        n.conclusion.definition === id,
      "invalid-specialized-join",
    );
  }
  joinPeers(id: number, left: number, right: number, extra: readonly number[] = []): void {
    const proposition = this.node(left).conclusion,
      claim = this.node(right).conclusion,
      n = this.node(id, "table-join-filter@1");
    requireProof(
      proposition.kind === "table" && claim.kind === "table",
      "invalid-specialized-join",
    );
    const pairs: number[][] = [];
    for (const x of proposition.cells)
      for (const y of claim.cells)
        if (
          x !== y &&
          this.peer(x, y) &&
          !proposition.cells.includes(y) &&
          !claim.cells.includes(x)
        )
          pairs.push([x, y]);
    requireProof(
      n.premises.length === 2 + pairs.length + extra.length &&
        sameValue(n.premises.slice(0, 2), [left, right]) &&
        sameValue(n.premises.slice(2 + pairs.length), extra),
      "incomplete-specialized-join-conflicts",
    );
    pairs.forEach((pair, i) => this.scope(n.premises[2 + i], pair));
  }
  directEffects(table: number): void {
    requireProof(this.proposal.effects.length > 0, "unproductive-specialized-step");
    for (const effect of this.proposal.effects) {
      requireProof(effect.kind === "remove", "invalid-specialized-effect");
      const claim = {
        kind: "literal",
        value: { cell: effect.cell, symbol: effect.symbol, positive: false },
      };
      const roots = this.proposal.proof.roots.filter((id) =>
        sameValue(this.available.get(id)?.conclusion, claim),
      );
      requireProof(roots.length > 0, "missing-specialized-effect-root");
      for (const id of roots)
        requireProof(
          this.node(id).rule === "table-project@1" && sameValue(this.node(id).premises, [table]),
          "substituted-specialized-effect-root",
        );
    }
  }
}
