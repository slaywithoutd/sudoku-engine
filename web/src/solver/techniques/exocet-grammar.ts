import type { DeductionProposal, ProofNode } from "../proof/types";
import type { ReadView } from "../state/types";
import { clause, requireProof, sameValue } from "../proof/primitives";
import {
  cellBox,
  orderedNumbers,
  requireFields,
  SpecializedAdmission,
} from "./specialized-lineage";

const juniorKeys = [
  "orientation",
  "base",
  "targets",
  "companions",
  "crossLines",
  "sCells",
  "baseSymbols",
  "covers",
];
/** Reconstructs complete Junior geometry and each count inequality directly
 * from the declared classic rules. The two components of a Double retain their
 * separate counts; the final every-root gate accepts only their actual join. */
class ExocetAdmission extends SpecializedAdmission {
  geometry(p: any): void {
    requireFields(p, juniorKeys);
    requireProof(
      ["row", "column"].includes(p.orientation) &&
        orderedNumbers(p.base) &&
        p.base.length === 2 &&
        Array.isArray(p.targets) &&
        p.targets.length === 2 &&
        new Set([...p.base, ...p.targets]).size === 4,
      "invalid-junior-geometry",
    );
    const row = (c: number) => (p.orientation === "row" ? Math.floor(c / 9) : c % 9),
      col = (c: number) => (p.orientation === "row" ? c % 9 : Math.floor(c / 9)),
      at = (r: number, c: number) => (p.orientation === "row" ? r * 9 + c : c * 9 + r);
    const line = row(p.base[0]),
      band = Math.floor(line / 3),
      stack = Math.floor(col(p.base[0]) / 3);
    requireProof(
      p.base.every(
        (c: number) =>
          row(c) === line && Math.floor(col(c) / 3) === stack && !this.view.state.values[c],
      ) &&
        p.targets.every(
          (c: number) =>
            Math.floor(row(c) / 3) === band &&
            row(c) !== line &&
            Math.floor(col(c) / 3) !== stack &&
            !this.view.state.values[c],
        ) &&
        !this.peer(p.targets[0], p.targets[1]),
      "invalid-junior-targets",
    );
    const otherRows = [band * 3, band * 3 + 1, band * 3 + 2].filter((r) => r !== line),
      unused = [stack * 3, stack * 3 + 1, stack * 3 + 2].find(
        (c) => !p.base.includes(at(line, c)),
      )!;
    const companions = p.targets.map((c: number) =>
        at(
          otherRows.find((r) => r !== row(c))!,
          col(c),
        ),
      ),
      cross = [unused, ...p.targets.map(col)];
    requireProof(
      new Set(p.targets.map(row)).size === 2 &&
        new Set(p.targets.map((c: number) => Math.floor(col(c) / 3))).size === 2 &&
        sameValue(companions, p.companions) &&
        sameValue(
          cross.map((c) => `${p.orientation === "row" ? "column" : "row"}:${c}`),
          p.crossLines,
        ),
      "incomplete-junior-cross-lines",
    );
    const symbols = [...new Set<number>(p.base.flatMap((c: number) => this.symbols(c)))].sort(
      (a, b) => a - b,
    );
    requireProof(
      symbols.length >= 3 &&
        symbols.length <= 4 &&
        sameValue(symbols, p.baseSymbols) &&
        companions.every((c: number) => symbols.every((s) => !this.symbols(c).includes(s))),
      "invalid-junior-companions",
    );
    const scells = Array.from({ length: 81 }, (_, c) => c).filter(
      (c) => Math.floor(row(c) / 3) !== band && cross.includes(col(c)),
    );
    requireProof(
      Array.isArray(p.sCells) &&
        sameValue(
          scells,
          [...p.sCells].sort((a, b) => a - b),
        ) &&
        p.covers.length === symbols.length,
      "incomplete-junior-s-cells",
    );
    for (const [i, symbol] of symbols.entries()) {
      const cv = p.covers[i];
      requireFields(cv, ["symbol", "houses", "occurrences", "assignedOccurrences"]);
      requireProof(
        cv.symbol === symbol &&
          Array.isArray(cv.houses) &&
          cv.houses.length >= 1 &&
          cv.houses.length <= 2 &&
          new Set(cv.houses).size === cv.houses.length,
        "invalid-junior-s-cover",
      );
      const houses = cv.houses.map((id: string) => {
        const [kind, n] = id.split(":");
        requireProof(["row", "column", "box"].includes(kind), "invalid-junior-s-cover");
        return this.house(kind as "row" | "column" | "box", Number(n));
      });
      const occurrences = scells.filter((c) => this.symbols(c).includes(symbol));
      requireProof(
        sameValue(cv.occurrences, occurrences) &&
          sameValue(
            cv.assignedOccurrences,
            scells.filter((c) => this.view.state.values[c] === symbol),
          ) &&
          occurrences.every((c) => houses.some((h: readonly number[]) => h.includes(c))),
        "incomplete-junior-s-occurrences",
      );
    }
  }
  component(p: any, c: any): void {
    requireFields(c, ["local", "identity", "counts", "relation"]);
    const cells = [...p.base, ...p.targets].sort((a, b) => a - b);
    this.local(c.local, cells, [p.base]);
    this.local(c.identity, [p.base[0]], []);
    const expected: any[] = [];
    for (const symbol of p.baseSymbols)
      for (const base of p.base)
        if (this.symbols(base).includes(symbol)) {
          const cv = p.covers.find((v: any) => v.symbol === symbol),
            choices = cv.houses.length === 1 ? p.targets.map((t: number) => [t]) : [p.targets];
          for (const targets of choices) expected.push({ base, symbol, targets });
        }
    requireProof(
      Array.isArray(c.counts) && c.counts.length === expected.length,
      "incomplete-junior-counts",
    );
    for (const [i, item] of c.counts.entries()) {
      requireFields(item, ["base", "symbol", "targets", "kind", "root"]);
      const e = expected[i];
      requireProof(
        sameValue({ base: item.base, symbol: item.symbol, targets: item.targets }, e),
        "incomplete-junior-counts",
      );
      const conclusion = clause([
        { cell: e.base, symbol: e.symbol, positive: false },
        ...e.targets.map((cell: number) => ({ cell, symbol: e.symbol, positive: true })),
      ]);
      const node = this.node(item.root);
      requireProof(sameValue(node.conclusion, conclusion), "invalid-junior-count-conclusion");
      if (item.kind === "domain") {
        requireProof(
          node.rule === "table-project@1" &&
            sameValue(node.premises, [c.local]) &&
            e.targets.some((t: number) => this.domain(t) === 1 << (e.symbol - 1)),
          "substituted-junior-domain-count",
        );
        continue;
      }
      requireProof(
        item.kind === "count" && node.rule === "cover-count-clause@1",
        "substituted-junior-count",
      );
      const cv = p.covers.find((v: any) => v.symbol === e.symbol),
        capacityNames = [
          ...cv.houses,
          `${p.orientation}:${p.orientation === "row" ? Math.floor(e.base / 9) : e.base % 9}`,
          `box:${cellBox(e.base)}`,
        ];
      const source = (id: number, kind: string, cells: readonly number[]) => {
        const fact = this.view.facts.get(id);
        requireProof(
          fact &&
            !fact.openAssumptions.length &&
            sameValue(
              fact.proposition,
              kind === "cover" ? { kind, cells, symbol: e.symbol } : { kind, cells },
            ),
          "unproved-junior-count-scope",
        );
      };
      const parameters = node.parameters as any;
      requireFields(parameters, ["symbol", "covers", "capacities"]);
      const uniqueCapacities = [...new Set(capacityNames)];
      requireProof(
        parameters.symbol === e.symbol &&
          parameters.covers.length === 3 &&
          parameters.capacities.length === uniqueCapacities.length,
        "incomplete-junior-weighted-count",
      );
      const coefficients = new Map<number, number>(),
        sources: number[] = [];
      for (const [names, weights, kind, sign] of [
        [p.crossLines, parameters.covers, "cover", -1],
        [uniqueCapacities, parameters.capacities, "all-different", 1],
      ] as const)
        for (let j = 0; j < names.length; j++) {
          const [type, n] = names[j].split(":"),
            cells = this.house(type as "row" | "column" | "box", Number(n)),
            entry = weights[j];
          const weight = sign === -1 ? 1 : capacityNames.filter((name) => name === names[j]).length;
          requireFields(entry, ["premise", "coefficient"]);
          requireProof(entry.coefficient === weight, "invalid-junior-count-weight");
          source(entry.premise, kind, cells);
          sources.push(entry.premise);
          for (const cell of cells)
            coefficients.set(cell, (coefficients.get(cell) ?? 0) + sign * weight);
        }
      const domains = [
        ...new Set(
          [...coefficients]
            .filter(([, n]) => n !== 0)
            .map(([cell]) => cell)
            .concat([e.base, ...e.targets]),
        ),
      ].sort((x, y) => x - y);
      requireProof(
        sameValue(node.premises, [
          ...sources,
          ...domains.map((cell) => this.view.state.domainFacts[cell]),
        ]),
        "incomplete-junior-count-domains",
      );
    }
    this.join(
      c.relation,
      c.local,
      c.identity,
      c.counts.map((v: any) => v.root),
    );
    const relation = this.node(c.relation).conclusion;
    requireProof(relation.kind === "table" && relation.count > 0, "empty-junior-relation");
  }
}
export function checkExocetPattern(
  proposal: DeductionProposal,
  view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
): void {
  const p = proposal.pattern as any,
    a = new ExocetAdmission(proposal, view, available);
  let plans: any[];
  if (p.alias === "Double Exocet") {
    requireFields(p, ["alias", "components", "certificate"]);
    requireProof(
      Array.isArray(p.components) && p.components.length === 2,
      "invalid-double-components",
    );
    plans = p.components;
  } else {
    requireProof(["Exocet", "Junior Exocet"].includes(p.alias), "unsupported-exocet-alias");
    requireFields(p, ["alias", "certificate", ...juniorKeys]);
    const { alias, certificate, ...plan } = p;
    plans = [plan];
  }
  plans.forEach((plan) => a.geometry(plan));
  requireFields(p.certificate, ["components", "table"]);
  requireProof(p.certificate.components.length === plans.length, "incomplete-exocet-components");
  plans.forEach((plan, i) => a.component(plan, p.certificate.components[i]));
  if (plans.length === 2) {
    const [x, y] = plans,
      band = (q: any) =>
        Math.floor((q.orientation === "row" ? Math.floor(q.base[0] / 9) : q.base[0] % 9) / 3);
    requireProof(
      x.orientation === y.orientation &&
        band(x) === band(y) &&
        new Set([...x.base, ...y.base]).size <= 4 &&
        new Set([...x.targets, ...y.targets]).size === 4 &&
        new Set([...x.baseSymbols, ...y.baseSymbols]).size <= 4,
      "invalid-double-join-geometry",
    );
    a.joinPeers(
      p.certificate.table,
      p.certificate.components[0].relation,
      p.certificate.components[1].relation,
    );
  } else
    requireProof(
      p.certificate.table === p.certificate.components[0].relation,
      "substituted-junior-table",
    );
  a.directEffects(p.certificate.table);
}
