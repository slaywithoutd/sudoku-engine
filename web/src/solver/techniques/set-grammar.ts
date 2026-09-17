import type { ReadView, Literal } from "../state/types";
import type { DeductionProposal, ProofNode } from "../proof/types";
import { clause, literals, requireProof, sameValue } from "../proof/primitives";
import { ChainSources, projectedSource } from "./chains-grammar";
import type { SetPattern, SdcPattern, AlignedPattern, CountPattern } from "./set-contracts";
import { findHouse, symbolMask } from "../state/read";
import { claimed, defined } from "../invariants";

const fields = (value: object | null | undefined, names: string[]) =>
  requireProof(value && sameValue(Object.keys(value).sort(), names.sort()), "invalid-set-fields");
const ordered = (xs: number[]) =>
  Array.isArray(xs) && xs.every((x, i) => Number.isSafeInteger(x) && (!i || x > xs[i - 1]));
const positive = (cell: number, symbol: number): Literal => ({ cell, symbol, positive: true });
const sorted = (xs: number[]) => [...xs].sort((left, right) => left - right);

/** Independent named admission: validates complete source rectangles, exact
 * allocation geometry, each tuple rejection and every supplied effect root.
 * Primitive table replay owns the cooperative matching enumeration. */
class SetAdmission {
  readonly sources: ChainSources;
  constructor(
    readonly proposal: DeductionProposal,
    readonly view: ReadView,
    readonly available: ReadonlyMap<number, ProofNode>,
    readonly charge: (units: number) => void = () => {},
  ) {
    this.sources = new ChainSources(view, available);
  }
  symbols(cells: number[]): number[] {
    const union = cells.reduce((mask, cell) => mask | this.view.state.domains[cell], 0);
    return this.view.assembly.problem.symbols.filter((symbol) => union & symbolMask(symbol));
  }
  cells(cells: number[], min: number, max: number): void {
    requireProof(
      ordered(cells) &&
        cells.length >= min &&
        cells.length <= max &&
        cells.every(
          (cell) =>
            this.view.assembly.problem.cells.includes(cell) &&
            !this.view.state.values[cell] &&
            this.view.state.domains[cell] > 0,
        ),
      "set-cell-bound",
    );
  }
  table(root: number, cells: number[], scopes: { cells: number[]; house: string }[]): void {
    const visit = (id: number): number[] => {
      const node = this.available.get(id);
      requireProof(
        node &&
          node.scope.length === 0 &&
          node.conclusion.kind === "table" &&
          node.conclusion.definition === id &&
          sameValue(node.conclusion.cells, cells),
        "invalid-set-table",
      );
      if (node.rule === "table-union@1") {
        requireProof(node.premises.length === 2, "invalid-set-partition");
        const left = visit(node.premises[0]),
          right = visit(node.premises[1]),
          changed = left.flatMap((mask, i) => (mask === right[i] ? [] : [i]));
        requireProof(
          changed.length === 1 && (left[changed[0]] & right[changed[0]]) === 0,
          "invalid-set-partition",
        );
        return left.map((mask, i) => mask | right[i]);
      }
      const parameters = node.parameters as { cells: number[]; box: number[] };
      requireProof(
        node.rule === "table-filter@1" &&
          sameValue(parameters.cells, cells) &&
          Array.isArray(parameters.box) &&
          parameters.box.length === cells.length &&
          sameValue(
            node.premises.slice(0, cells.length),
            cells.map((cell) => this.view.state.domainFacts[cell]),
          ) &&
          node.premises.length === cells.length + scopes.length,
        "incomplete-set-table-sources",
      );
      scopes.forEach((scope, i) => {
        const subset = this.available.get(node.premises[cells.length + i]),
          source = subset && this.view.facts.get(subset.premises[0]);
        const house = findHouse(this.view, scope.house);
        requireProof(
          subset?.rule === "all-different-subset@1" &&
            subset.premises.length === 1 &&
            subset.scope.length === 0 &&
            sameValue(subset.conclusion, { kind: "all-different", cells: scope.cells }) &&
            source?.openAssumptions.length === 0 &&
            source.proposition.kind === "all-different" &&
            house &&
            sameValue(source.proposition.cells, house.cells),
          "invalid-set-table-scope",
        );
      });
      return parameters.box;
    };
    const domains = visit(root),
      result = defined(this.available.get(root), "available").conclusion;
    requireProof(
      sameValue(
        domains,
        cells.map((cell) => this.view.state.domains[cell]),
      ) &&
        result.kind === "table" &&
        result.count > 0,
      "incomplete-or-empty-set-table",
    );
  }
  /** Conjunctions carry only the selected proposition, never evidence from an
   * unrelated conjunct. Every resolution premise must have an admitted origin. */
  lineage(root: number, seeds: number[]): void {
    const good = new Set<number>(seeds);
    for (const node of this.proposal.proof.nodes) {
      if (good.has(projectedSource(node.id, this.available))) good.add(node.id);
      else if (
        node.rule === "resolution@1" &&
        !node.scope.length &&
        node.premises.every((id) => good.has(id))
      )
        good.add(node.id);
    }
    requireProof(good.has(root), "unproved-set-effect-lineage");
  }
  effectRoots(i: number, declared: number, seeds: number[]): void {
    const effect = this.proposal.effects[i],
      claim = clause([{ cell: effect.cell, symbol: effect.symbol, positive: false }]);
    const roots = this.proposal.proof.roots.filter((id) =>
      sameValue(this.available.get(id)?.conclusion, claim),
    );
    requireProof(roots.includes(declared), "missing-set-effect-root");
    roots.forEach((root) => this.lineage(root, seeds));
  }
  sdc(pattern: SdcPattern): void {
    fields(pattern, [
      "kind",
      "alias",
      "line",
      "box",
      "intersection",
      "lineSide",
      "boxSide",
      "domains",
      "table",
      "routes",
    ]);
    requireProof(
      this.proposal.technique === "c20@1" &&
        ["Sue de Coq", "Two-sector disjoint subsets"].includes(pattern.alias),
      "invalid-sdc-family",
    );
    this.cells(pattern.intersection, 2, 3);
    this.cells(pattern.lineSide, 1, 4);
    this.cells(pattern.boxSide, 1, 4);
    const line = findHouse(this.view, pattern.line),
      box = findHouse(this.view, pattern.box);
    requireProof(
      line &&
        box &&
        line.cells.length === 9 &&
        box.cells.length === 9 &&
        (new Set(line.cells.map((cell) => Math.floor(cell / 9))).size === 1 ||
          new Set(line.cells.map((cell) => cell % 9)).size === 1) &&
        new Set(box.cells.map((cell) => Math.floor(cell / 27) * 3 + Math.floor((cell % 9) / 3)))
          .size === 1 &&
        line.cells.filter((cell) => box.cells.includes(cell)).length === 3 &&
        pattern.intersection.every(
          (cell) => line.cells.includes(cell) && box.cells.includes(cell),
        ) &&
        pattern.lineSide.every((cell) => line.cells.includes(cell)) &&
        pattern.boxSide.every((cell) => box.cells.includes(cell)),
      "invalid-sdc-geometry",
    );
    const cells = sorted([...pattern.intersection, ...pattern.lineSide, ...pattern.boxSide]);
    requireProof(
      new Set(cells).size === cells.length &&
        cells.length <= 11 &&
        sameValue(
          pattern.domains,
          cells.map((cell) => this.view.state.domains[cell]),
        ),
      "overlapping-sdc-cells",
    );
    const value = this.symbols(pattern.intersection),
      left = this.symbols(pattern.lineSide),
      right = this.symbols(pattern.boxSide);
    requireProof(
      value.length >= pattern.intersection.length + 2 &&
        left.length === pattern.lineSide.length + 1 &&
        right.length === pattern.boxSide.length + 1 &&
        new Set([...value, ...left, ...right]).size <= 9 &&
        !value.some((symbol) => left.includes(symbol) && right.includes(symbol)) &&
        pattern.lineSide.length + pattern.boxSide.length ===
          value.length -
            pattern.intersection.length +
            left.filter((symbol) => !value.includes(symbol)).length +
            right.filter((symbol) => !value.includes(symbol)).length,
      "invalid-sdc-allocation",
    );
    this.table(pattern.table, cells, [
      { cells: sorted([...pattern.intersection, ...pattern.lineSide]), house: pattern.line },
      { cells: sorted([...pattern.intersection, ...pattern.boxSide]), house: pattern.box },
    ]);
    requireProof(
      Array.isArray(pattern.routes) && pattern.routes.length === this.proposal.effects.length,
      "missing-sdc-routes",
    );
    pattern.routes.forEach((route, i) => {
      fields(route, ["sector", "occurrences", "projection", "visibility", "root"]);
      const sector = claimed(route).sector;
      requireProof(sector === "line" || sector === "box", "invalid-sdc-sector");
      const effect = this.proposal.effects[i],
        side = route.sector === "line" ? pattern.lineSide : pattern.boxSide;
      const own = route.sector === "line" ? left : right,
        other = route.sector === "line" ? right : left,
        house = route.sector === "line" ? line : box;
      const local = sorted([...pattern.intersection, ...side]),
        occurrences = local.filter(
          (cell) => this.view.state.domains[cell] & symbolMask(effect.symbol),
        );
      requireProof(
        house.cells.includes(effect.cell) &&
          !local.includes(effect.cell) &&
          (own.includes(effect.symbol) ||
            (value.includes(effect.symbol) && !other.includes(effect.symbol))) &&
          occurrences.length > 0 &&
          sameValue(route.occurrences, occurrences),
        "invalid-sdc-effect",
      );
      const projection = this.available.get(route.projection);
      requireProof(
        projection?.rule === "table-project@1" &&
          sameValue(projection.premises, [pattern.table]) &&
          sameValue(
            projection.conclusion,
            clause(occurrences.map((cell) => positive(cell, effect.symbol))),
          ),
        "missing-sdc-allocation-projection",
      );
      requireProof(route.visibility.length === occurrences.length, "incomplete-sdc-visibility");
      occurrences.forEach((cell, j) =>
        this.sources.weak(
          route.visibility[j],
          positive(cell, effect.symbol),
          positive(effect.cell, effect.symbol),
        ),
      );
      this.effectRoots(i, route.root, [route.projection, ...route.visibility]);
    });
  }
  aligned(pattern: AlignedPattern): void {
    fields(pattern, [
      "kind",
      "alias",
      "selected",
      "domains",
      "auxiliaries",
      "reasons",
      "rejections",
      "roots",
    ]);
    this.cells(pattern.selected, 2, 4);
    requireProof(
      this.proposal.technique === "c21@1" &&
        pattern.alias ===
          [
            "",
            "",
            "Aligned Pair Exclusion",
            "Aligned Triple Exclusion",
            "Generalized Aligned Exclusion",
          ][pattern.selected.length] &&
        sameValue(
          pattern.domains,
          pattern.selected.map((cell) => this.view.state.domains[cell]),
        ) &&
        Array.isArray(pattern.auxiliaries),
      "invalid-aligned-family",
    );
    requireProof(
      new Set(pattern.auxiliaries.map((set) => set.cells.join())).size ===
        pattern.auxiliaries.length,
      "repeated-aligned-auxiliary",
    );
    pattern.auxiliaries.forEach((set) => {
      fields(set, ["cells", "house", "symbols", "domains", "table"]);
      this.cells(set.cells, 1, 5);
      requireProof(
        !set.cells.some((cell) => pattern.selected.includes(cell)) &&
          sameValue(set.symbols, this.symbols(set.cells)) &&
          set.symbols.length === set.cells.length + 1 &&
          sameValue(
            set.domains,
            set.cells.map((cell) => this.view.state.domains[cell]),
          ),
        "invalid-aligned-auxiliary",
      );
      this.table(set.table, set.cells, [set]);
    });
    const alternatives = pattern.domains.map((mask) =>
        this.view.assembly.problem.symbols.filter((symbol) => mask & symbolMask(symbol)),
      ),
      volume = alternatives.reduce((n, xs) => n * xs.length, 1);
    requireProof(
      volume <= 6561 &&
        pattern.reasons.length === volume &&
        pattern.rejections.length === volume &&
        pattern.roots.length === this.proposal.effects.length,
      "incomplete-aligned-enumeration",
    );
    // At most four selected coordinates: 9^4 = 6561, independent of table
    // representation caps. Prepay tuple decoding/capture, even on rejection.
    this.charge(volume * 8);
    const pairs = pattern.selected.flatMap((left, i) =>
        pattern.selected.slice(i + 1).map((right) => [left, right]),
      ),
      admitted: number[] = [],
      survivors: number[][] = [];
    for (let index = 0; index < volume; index++) {
      let n = index;
      const tuple = alternatives.map(() => 0);
      for (let j = tuple.length - 1; j >= 0; j--) {
        tuple[j] = alternatives[j][n % alternatives[j].length];
        n = Math.floor(n / alternatives[j].length);
      }
      const reason = pattern.reasons[index],
        root = pattern.rejections[index],
        node = this.available.get(root);
      requireProof(
        Number.isSafeInteger(reason) && Number.isSafeInteger(root),
        "invalid-aligned-rejection",
      );
      if (!reason) {
        requireProof(root === -1, "invalid-aligned-survivor");
        survivors.push(tuple);
        continue;
      }
      if (reason < 0) {
        const pair = pairs[-reason - 1];
        requireProof(pair, "invalid-aligned-direct-conflict");
        this.sources.weak(
          root,
          positive(pair[0], tuple[pattern.selected.indexOf(pair[0])]),
          positive(pair[1], tuple[pattern.selected.indexOf(pair[1])]),
        );
      } else {
        const set = pattern.auxiliaries[reason - 1];
        requireProof(set, "missing-aligned-matching");
        // Reconstruct the actual conflict premises of this rejection. A closed
        // relation can forbid different symbols too; house visibility alone is
        // not the full permitted source language. The complete ALS table proves
        // at least one blocked literal, hence an empty matching after these
        // explicitly proved conflicts (additional blockers are unnecessary).
        const pending = [root],
          visited = new Set<number>(),
          leaves: ProofNode[] = [];
        while (pending.length) {
          const id = projectedSource(defined(pending.pop(), "pending"), this.available);
          if (visited.has(id)) continue;
          visited.add(id);
          const n = this.available.get(id);
          requireProof(n && !n.scope.length, "invalid-aligned-rejection-source");
          if (n.rule === "resolution@1") pending.push(...n.premises);
          else leaves.push(n);
        }
        const projections = leaves.filter(
          (n) => n.rule === "table-project@1" && sameValue(n.premises, [set.table]),
        );
        requireProof(projections.length === 1, "missing-empty-matching-proof");
        const projection = projections[0],
          blocked = literals(projection.conclusion);
        requireProof(
          blocked.length > 0 &&
            blocked.every(
              (literal) =>
                literal.positive &&
                set.cells.includes(literal.cell) &&
                this.view.state.domains[literal.cell] & symbolMask(literal.symbol),
            ),
          "invalid-aligned-blocked-candidates",
        );
        const sources = [projection.id];
        blocked.forEach((literal) => {
          const candidates = pattern.selected.map((cell, j) => positive(cell, tuple[j]));
          const weak = leaves.find((x) => {
            this.charge(1);
            return (
              ["weak-link@1", "table-project@1"].includes(x.rule) &&
              candidates.some((c) =>
                sameValue(
                  x.conclusion,
                  clause([
                    { ...literal, positive: false },
                    { ...c, positive: false },
                  ]),
                ),
              )
            );
          });
          requireProof(weak, "incomplete-aligned-visibility");
          sources.push(weak.id);
        });
        this.lineage(root, sources);
        requireProof(
          node &&
            literals(node.conclusion).length > 0 &&
            literals(node.conclusion).every(
              (literal) =>
                !literal.positive &&
                pattern.selected.includes(literal.cell) &&
                tuple[pattern.selected.indexOf(literal.cell)] === literal.symbol,
            ),
          "invalid-aligned-rejection-clause",
        );
      }
      admitted.push(root);
    }
    requireProof(survivors.length > 0, "empty-aligned-enumeration");
    for (const cell of pattern.selected) {
      const cover = this.proposal.proof.nodes.find(
        (n) =>
          n.rule === "cover-clause@1" &&
          sameValue(n.premises, [this.view.state.domainFacts[cell]]) &&
          sameValue(
            n.conclusion,
            clause(
              this.view.assembly.problem.symbols
                .filter((symbol) => this.view.state.domains[cell] & symbolMask(symbol))
                .map((symbol) => positive(cell, symbol)),
            ),
          ),
      );
      if (cover) admitted.push(cover.id);
    }
    this.proposal.effects.forEach((effect, i) => {
      requireProof(
        pattern.selected.includes(effect.cell) &&
          survivors.every(
            (tuple) => tuple[pattern.selected.indexOf(effect.cell)] !== effect.symbol,
          ),
        "retained-aligned-candidate",
      );
      this.effectRoots(i, pattern.roots[i], admitted);
    });
  }
  count(pattern: CountPattern): void {
    fields(pattern, [
      "kind",
      "alias",
      "cells",
      "domains",
      "symbols",
      "scopes",
      "target",
      "capacities",
      "assumption",
      "contradiction",
      "root",
    ]);
    requireProof(
      ordered(pattern.cells) &&
        pattern.cells.length >= 1 &&
        pattern.cells.length <= 12 &&
        pattern.cells.every(
          (cell) =>
            this.view.assembly.problem.cells.includes(cell) && this.view.state.domains[cell] > 0,
        ),
      "count-cell-bound",
    );
    const cells = sorted([...new Set([...pattern.cells, pattern.target.cell])]);
    requireProof(
      this.proposal.technique === "c21@1" &&
        claimed(pattern).alias === "Subset counting" &&
        this.proposal.effects.length === 1 &&
        sameValue(this.proposal.effects[0], { kind: "remove", ...pattern.target }) &&
        sameValue(
          pattern.domains,
          cells.map((cell) => this.view.state.domains[cell]),
        ) &&
        sameValue(pattern.symbols, this.symbols(pattern.cells)) &&
        pattern.scopes.length >= 1 &&
        pattern.scopes.length <= 4 &&
        new Set(pattern.scopes.map((scope) => scope.house)).size === pattern.scopes.length,
      "invalid-subset-count-pattern",
    );
    pattern.scopes.forEach((scope) => {
      fields(scope, ["house", "cells", "root"]);
      const house = findHouse(this.view, scope.house),
        node = this.available.get(scope.root),
        fact = node && this.view.facts.get(node.premises[0]);
      requireProof(
        house &&
          sameValue(
            scope.cells,
            house.cells.filter((cell) => cells.includes(cell)),
          ) &&
          scope.cells.length >= 2 &&
          node?.rule === "all-different-subset@1" &&
          node.premises.length === 1 &&
          !node.scope.length &&
          sameValue(node.conclusion, { kind: "all-different", cells: scope.cells }) &&
          fact?.openAssumptions.length === 0 &&
          fact.proposition.kind === "all-different" &&
          sameValue(fact.proposition.cells, house.cells),
        "invalid-count-incidence",
      );
    });
    const contradiction = this.available.get(pattern.contradiction),
      assumption = this.available.get(pattern.assumption);
    requireProof(
      assumption?.rule === "assume@1" &&
        !assumption.scope.length &&
        sameValue(assumption.conclusion, {
          kind: "literal",
          value: { ...pattern.target, positive: true },
        }) &&
        contradiction?.rule === "subset-count@1" &&
        sameValue(contradiction.scope, [pattern.assumption]) &&
        sameValue(contradiction.premises, [
          pattern.assumption,
          ...cells.map((cell) => this.view.state.domainFacts[cell]),
          ...pattern.scopes.map((scope) => scope.root),
        ]) &&
        sameValue(contradiction.parameters, {
          cells: pattern.cells,
          symbols: pattern.symbols,
          capacities: pattern.capacities,
          target: pattern.target,
        }),
      "missing-count-capacity-proof",
    );
    const claim = clause([{ ...pattern.target, positive: false }]);
    const roots = this.proposal.proof.roots.filter((id) =>
      sameValue(this.available.get(id)?.conclusion, claim),
    );
    requireProof(roots.includes(pattern.root), "missing-count-root");
    for (const id of roots) {
      const root = this.available.get(projectedSource(id, this.available));
      requireProof(
        root?.rule === "discharge@1" &&
          !root.scope.length &&
          sameValue(root.premises, [pattern.assumption, pattern.contradiction]),
        "unproved-count-effect-lineage",
      );
    }
  }
}

export function checkSetPattern(
  proposal: DeductionProposal,
  view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
  charge?: (units: number) => void,
): void {
  requireProof(
    proposal.effects.length > 0 && proposal.effects.every((effect) => effect.kind === "remove"),
    "unproductive-set-pattern",
  );
  const pattern = proposal.pattern as unknown as SetPattern,
    admission = new SetAdmission(proposal, view, available, charge);
  if (pattern.kind === "sdc") admission.sdc(pattern);
  else if (pattern.kind === "aligned") admission.aligned(pattern);
  else if (claimed(pattern).kind === "count") admission.count(pattern);
  else requireProof(false, "invalid-set-family");
  requireProof(
    proposal.proof.nodes.every(
      (n) =>
        (n.scope.length === 0 ||
          (pattern.kind === "count" &&
            n.id === pattern.contradiction &&
            sameValue(n.scope, [pattern.assumption]))) &&
        [
          "all-different-subset@1",
          "table-filter@1",
          "table-union@1",
          "table-join@1",
          "table-project@1",
          "cover-clause@1",
          "weak-link@1",
          "resolution@1",
          "conjunction@1",
          "domain-restrict@1",
          ...(pattern.kind === "count" ? ["subset-count@1", "assume@1", "discharge@1"] : []),
        ].includes(n.rule),
    ),
    "outside-set-grammar",
  );
}
