import type { ReadView, Literal } from "../state/types";
import type { DeductionProposal, ProofNode } from "../proof/types";
import { clause, literals, requireProof, sameValue } from "../proof/primitives";
import { ChainSources, projectedSource } from "./chains-grammar";
import type { SetPattern, SdcPattern, AlignedPattern, CountPattern } from "./set-contracts";
import { findHouse, symbolMask } from "../state/read";

const fields = (v: object, names: string[]) =>
  requireProof(v && sameValue(Object.keys(v).sort(), names.sort()), "invalid-set-fields");
const ordered = (xs: number[]) =>
  Array.isArray(xs) && xs.every((x, i) => Number.isSafeInteger(x) && (!i || x > xs[i - 1]));
const positive = (cell: number, symbol: number): Literal => ({ cell, symbol, positive: true });
const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);

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
    const union = cells.reduce((m, c) => m | this.view.state.domains[c], 0);
    return this.view.assembly.problem.symbols.filter((s) => union & symbolMask(s));
  }
  cells(cells: number[], min: number, max: number): void {
    requireProof(
      ordered(cells) &&
        cells.length >= min &&
        cells.length <= max &&
        cells.every(
          (c) =>
            this.view.assembly.problem.cells.includes(c) &&
            !this.view.state.values[c] &&
            this.view.state.domains[c] > 0,
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
        const a = visit(node.premises[0]),
          b = visit(node.premises[1]),
          changed = a.flatMap((m, i) => (m === b[i] ? [] : [i]));
        requireProof(
          changed.length === 1 && (a[changed[0]] & b[changed[0]]) === 0,
          "invalid-set-partition",
        );
        return a.map((m, i) => m | b[i]);
      }
      const parameters = node.parameters as { cells: number[]; box: number[] };
      requireProof(
        node.rule === "table-filter@1" &&
          sameValue(parameters.cells, cells) &&
          Array.isArray(parameters.box) &&
          parameters.box.length === cells.length &&
          sameValue(
            node.premises.slice(0, cells.length),
            cells.map((c) => this.view.state.domainFacts[c]),
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
      result = this.available.get(root)!.conclusion;
    requireProof(
      sameValue(
        domains,
        cells.map((c) => this.view.state.domains[c]),
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
    const e = this.proposal.effects[i],
      claim = clause([{ cell: e.cell, symbol: e.symbol, positive: false }]);
    const roots = this.proposal.proof.roots.filter((id) =>
      sameValue(this.available.get(id)?.conclusion, claim),
    );
    requireProof(roots.includes(declared), "missing-set-effect-root");
    roots.forEach((root) => this.lineage(root, seeds));
  }
  sdc(p: SdcPattern): void {
    fields(p, [
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
        ["Sue de Coq", "Two-sector disjoint subsets"].includes(p.alias),
      "invalid-sdc-family",
    );
    this.cells(p.intersection, 2, 3);
    this.cells(p.lineSide, 1, 4);
    this.cells(p.boxSide, 1, 4);
    const line = findHouse(this.view, p.line),
      box = findHouse(this.view, p.box);
    requireProof(
      line &&
        box &&
        line.cells.length === 9 &&
        box.cells.length === 9 &&
        (new Set(line.cells.map((c) => Math.floor(c / 9))).size === 1 ||
          new Set(line.cells.map((c) => c % 9)).size === 1) &&
        new Set(box.cells.map((c) => Math.floor(c / 27) * 3 + Math.floor((c % 9) / 3))).size ===
          1 &&
        line.cells.filter((c) => box.cells.includes(c)).length === 3 &&
        p.intersection.every((c) => line.cells.includes(c) && box.cells.includes(c)) &&
        p.lineSide.every((c) => line.cells.includes(c)) &&
        p.boxSide.every((c) => box.cells.includes(c)),
      "invalid-sdc-geometry",
    );
    const cells = sorted([...p.intersection, ...p.lineSide, ...p.boxSide]);
    requireProof(
      new Set(cells).size === cells.length &&
        cells.length <= 11 &&
        sameValue(
          p.domains,
          cells.map((c) => this.view.state.domains[c]),
        ),
      "overlapping-sdc-cells",
    );
    const v = this.symbols(p.intersection),
      a = this.symbols(p.lineSide),
      b = this.symbols(p.boxSide);
    requireProof(
      v.length >= p.intersection.length + 2 &&
        a.length === p.lineSide.length + 1 &&
        b.length === p.boxSide.length + 1 &&
        new Set([...v, ...a, ...b]).size <= 9 &&
        !v.some((s) => a.includes(s) && b.includes(s)) &&
        p.lineSide.length + p.boxSide.length ===
          v.length -
            p.intersection.length +
            a.filter((s) => !v.includes(s)).length +
            b.filter((s) => !v.includes(s)).length,
      "invalid-sdc-allocation",
    );
    this.table(p.table, cells, [
      { cells: sorted([...p.intersection, ...p.lineSide]), house: p.line },
      { cells: sorted([...p.intersection, ...p.boxSide]), house: p.box },
    ]);
    requireProof(
      Array.isArray(p.routes) && p.routes.length === this.proposal.effects.length,
      "missing-sdc-routes",
    );
    p.routes.forEach((route, i) => {
      fields(route, ["sector", "occurrences", "projection", "visibility", "root"]);
      requireProof(route.sector === "line" || route.sector === "box", "invalid-sdc-sector");
      const e = this.proposal.effects[i],
        side = route.sector === "line" ? p.lineSide : p.boxSide;
      const own = route.sector === "line" ? a : b,
        other = route.sector === "line" ? b : a,
        house = route.sector === "line" ? line : box;
      const local = sorted([...p.intersection, ...side]),
        occurrences = local.filter((c) => this.view.state.domains[c] & symbolMask(e.symbol));
      requireProof(
        house.cells.includes(e.cell) &&
          !local.includes(e.cell) &&
          (own.includes(e.symbol) || (v.includes(e.symbol) && !other.includes(e.symbol))) &&
          occurrences.length > 0 &&
          sameValue(route.occurrences, occurrences),
        "invalid-sdc-effect",
      );
      const projection = this.available.get(route.projection);
      requireProof(
        projection?.rule === "table-project@1" &&
          sameValue(projection.premises, [p.table]) &&
          sameValue(projection.conclusion, clause(occurrences.map((c) => positive(c, e.symbol)))),
        "missing-sdc-allocation-projection",
      );
      requireProof(route.visibility.length === occurrences.length, "incomplete-sdc-visibility");
      occurrences.forEach((c, j) =>
        this.sources.weak(route.visibility[j], positive(c, e.symbol), positive(e.cell, e.symbol)),
      );
      this.effectRoots(i, route.root, [route.projection, ...route.visibility]);
    });
  }
  aligned(p: AlignedPattern): void {
    fields(p, [
      "kind",
      "alias",
      "selected",
      "domains",
      "auxiliaries",
      "reasons",
      "rejections",
      "roots",
    ]);
    this.cells(p.selected, 2, 4);
    requireProof(
      this.proposal.technique === "c21@1" &&
        p.alias ===
          [
            "",
            "",
            "Aligned Pair Exclusion",
            "Aligned Triple Exclusion",
            "Generalized Aligned Exclusion",
          ][p.selected.length] &&
        sameValue(
          p.domains,
          p.selected.map((c) => this.view.state.domains[c]),
        ) &&
        Array.isArray(p.auxiliaries),
      "invalid-aligned-family",
    );
    requireProof(
      new Set(p.auxiliaries.map((a) => a.cells.join())).size === p.auxiliaries.length,
      "repeated-aligned-auxiliary",
    );
    p.auxiliaries.forEach((a) => {
      fields(a, ["cells", "house", "symbols", "domains", "table"]);
      this.cells(a.cells, 1, 5);
      requireProof(
        !a.cells.some((c) => p.selected.includes(c)) &&
          sameValue(a.symbols, this.symbols(a.cells)) &&
          a.symbols.length === a.cells.length + 1 &&
          sameValue(
            a.domains,
            a.cells.map((c) => this.view.state.domains[c]),
          ),
        "invalid-aligned-auxiliary",
      );
      this.table(a.table, a.cells, [a]);
    });
    const alternatives = p.domains.map((mask) =>
        this.view.assembly.problem.symbols.filter((s) => mask & symbolMask(s)),
      ),
      volume = alternatives.reduce((n, xs) => n * xs.length, 1);
    requireProof(
      volume <= 6561 &&
        p.reasons.length === volume &&
        p.rejections.length === volume &&
        p.roots.length === this.proposal.effects.length,
      "incomplete-aligned-enumeration",
    );
    // At most four selected coordinates: 9^4 = 6561, independent of table
    // representation caps. Prepay tuple decoding/capture, even on rejection.
    this.charge(volume * 8);
    const pairs = p.selected.flatMap((a, i) => p.selected.slice(i + 1).map((b) => [a, b])),
      admitted: number[] = [],
      survivors: number[][] = [];
    for (let index = 0; index < volume; index++) {
      let n = index;
      const tuple = alternatives.map(() => 0);
      for (let j = tuple.length - 1; j >= 0; j--) {
        tuple[j] = alternatives[j][n % alternatives[j].length];
        n = Math.floor(n / alternatives[j].length);
      }
      const reason = p.reasons[index],
        root = p.rejections[index],
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
          positive(pair[0], tuple[p.selected.indexOf(pair[0])]),
          positive(pair[1], tuple[p.selected.indexOf(pair[1])]),
        );
      } else {
        const a = p.auxiliaries[reason - 1];
        requireProof(a, "missing-aligned-matching");
        // Reconstruct the actual conflict premises of this rejection. A closed
        // relation can forbid different symbols too; house visibility alone is
        // not the full permitted source language. The complete ALS table proves
        // at least one blocked literal, hence an empty matching after these
        // explicitly proved conflicts (additional blockers are unnecessary).
        const pending = [root],
          visited = new Set<number>(),
          leaves: ProofNode[] = [];
        while (pending.length) {
          const id = projectedSource(pending.pop()!, this.available);
          if (visited.has(id)) continue;
          visited.add(id);
          const n = this.available.get(id);
          requireProof(n && !n.scope.length, "invalid-aligned-rejection-source");
          if (n.rule === "resolution@1") pending.push(...n.premises);
          else leaves.push(n);
        }
        const projections = leaves.filter(
          (n) => n.rule === "table-project@1" && sameValue(n.premises, [a.table]),
        );
        requireProof(projections.length === 1, "missing-empty-matching-proof");
        const projection = projections[0],
          blocked = literals(projection.conclusion);
        requireProof(
          blocked.length > 0 &&
            blocked.every(
              (l) =>
                l.positive &&
                a.cells.includes(l.cell) &&
                this.view.state.domains[l.cell] & symbolMask(l.symbol),
            ),
          "invalid-aligned-blocked-candidates",
        );
        const sources = [projection.id];
        blocked.forEach((l) => {
          const candidates = p.selected.map((c, j) => positive(c, tuple[j]));
          const weak = leaves.find((x) => {
            this.charge(1);
            return (
              ["weak-link@1", "table-project@1"].includes(x.rule) &&
              candidates.some((c) =>
                sameValue(
                  x.conclusion,
                  clause([
                    { ...l, positive: false },
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
              (l) =>
                !l.positive &&
                p.selected.includes(l.cell) &&
                tuple[p.selected.indexOf(l.cell)] === l.symbol,
            ),
          "invalid-aligned-rejection-clause",
        );
      }
      admitted.push(root);
    }
    requireProof(survivors.length > 0, "empty-aligned-enumeration");
    for (const cell of p.selected) {
      const cover = this.proposal.proof.nodes.find(
        (n) =>
          n.rule === "cover-clause@1" &&
          sameValue(n.premises, [this.view.state.domainFacts[cell]]) &&
          sameValue(
            n.conclusion,
            clause(
              this.view.assembly.problem.symbols
                .filter((s) => this.view.state.domains[cell] & symbolMask(s))
                .map((s) => positive(cell, s)),
            ),
          ),
      );
      if (cover) admitted.push(cover.id);
    }
    this.proposal.effects.forEach((e, i) => {
      requireProof(
        p.selected.includes(e.cell) &&
          survivors.every((tuple) => tuple[p.selected.indexOf(e.cell)] !== e.symbol),
        "retained-aligned-candidate",
      );
      this.effectRoots(i, p.roots[i], admitted);
    });
  }
  count(p: CountPattern): void {
    fields(p, [
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
      ordered(p.cells) &&
        p.cells.length >= 1 &&
        p.cells.length <= 12 &&
        p.cells.every(
          (c) => this.view.assembly.problem.cells.includes(c) && this.view.state.domains[c] > 0,
        ),
      "count-cell-bound",
    );
    const cells = sorted([...new Set([...p.cells, p.target.cell])]);
    requireProof(
      this.proposal.technique === "c21@1" &&
        p.alias === "Subset counting" &&
        this.proposal.effects.length === 1 &&
        sameValue(this.proposal.effects[0], { kind: "remove", ...p.target }) &&
        sameValue(
          p.domains,
          cells.map((c) => this.view.state.domains[c]),
        ) &&
        sameValue(p.symbols, this.symbols(p.cells)) &&
        p.scopes.length >= 1 &&
        p.scopes.length <= 4 &&
        new Set(p.scopes.map((s) => s.house)).size === p.scopes.length,
      "invalid-subset-count-pattern",
    );
    p.scopes.forEach((scope) => {
      fields(scope, ["house", "cells", "root"]);
      const house = findHouse(this.view, scope.house),
        node = this.available.get(scope.root),
        fact = node && this.view.facts.get(node.premises[0]);
      requireProof(
        house &&
          sameValue(
            scope.cells,
            house.cells.filter((c) => cells.includes(c)),
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
    const contradiction = this.available.get(p.contradiction),
      assumption = this.available.get(p.assumption);
    requireProof(
      assumption?.rule === "assume@1" &&
        !assumption.scope.length &&
        sameValue(assumption.conclusion, {
          kind: "literal",
          value: { ...p.target, positive: true },
        }) &&
        contradiction?.rule === "subset-count@1" &&
        sameValue(contradiction.scope, [p.assumption]) &&
        sameValue(contradiction.premises, [
          p.assumption,
          ...cells.map((c) => this.view.state.domainFacts[c]),
          ...p.scopes.map((s) => s.root),
        ]) &&
        sameValue(contradiction.parameters, {
          cells: p.cells,
          symbols: p.symbols,
          capacities: p.capacities,
          target: p.target,
        }),
      "missing-count-capacity-proof",
    );
    const claim = clause([{ ...p.target, positive: false }]);
    const roots = this.proposal.proof.roots.filter((id) =>
      sameValue(this.available.get(id)?.conclusion, claim),
    );
    requireProof(roots.includes(p.root), "missing-count-root");
    for (const id of roots) {
      const root = this.available.get(projectedSource(id, this.available));
      requireProof(
        root?.rule === "discharge@1" &&
          !root.scope.length &&
          sameValue(root.premises, [p.assumption, p.contradiction]),
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
    proposal.effects.length > 0 && proposal.effects.every((e) => e.kind === "remove"),
    "unproductive-set-pattern",
  );
  const p = proposal.pattern as unknown as SetPattern,
    admission = new SetAdmission(proposal, view, available, charge);
  if (p.kind === "sdc") admission.sdc(p);
  else if (p.kind === "aligned") admission.aligned(p);
  else if (p.kind === "count") admission.count(p);
  else requireProof(false, "invalid-set-family");
  requireProof(
    proposal.proof.nodes.every(
      (n) =>
        (n.scope.length === 0 ||
          (p.kind === "count" && n.id === p.contradiction && sameValue(n.scope, [p.assumption]))) &&
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
          ...(p.kind === "count" ? ["subset-count@1", "assume@1", "discharge@1"] : []),
        ].includes(n.rule),
    ),
    "outside-set-grammar",
  );
}
