import type { DeductionProposal, ProofNode } from "../proof/types";
import type { ReadView } from "../state/types";
import { clause, requireProof, sameValue } from "../proof/primitives";
import {
  cellBox,
  orderedNumbers,
  requireFields,
  SpecializedAdmission,
} from "./specialized-lineage";
import { symbolMask } from "../state/read";
import { defined } from "../invariants";

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
  geometry(pattern: any): void {
    requireFields(pattern, juniorKeys);
    requireProof(
      ["row", "column"].includes(pattern.orientation) &&
        orderedNumbers(pattern.base) &&
        pattern.base.length === 2 &&
        Array.isArray(pattern.targets) &&
        pattern.targets.length === 2 &&
        new Set([...pattern.base, ...pattern.targets]).size === 4,
      "invalid-junior-geometry",
    );
    const row = (cell: number) => (pattern.orientation === "row" ? Math.floor(cell / 9) : cell % 9),
      col = (cell: number) => (pattern.orientation === "row" ? cell % 9 : Math.floor(cell / 9)),
      at = (rowIndex: number, cell: number) =>
        pattern.orientation === "row" ? rowIndex * 9 + cell : cell * 9 + rowIndex;
    const line = row(pattern.base[0]),
      band = Math.floor(line / 3),
      stack = Math.floor(col(pattern.base[0]) / 3);
    requireProof(
      pattern.base.every(
        (cell: number) =>
          row(cell) === line &&
          Math.floor(col(cell) / 3) === stack &&
          !this.view.state.values[cell],
      ) &&
        pattern.targets.every(
          (cell: number) =>
            Math.floor(row(cell) / 3) === band &&
            row(cell) !== line &&
            Math.floor(col(cell) / 3) !== stack &&
            !this.view.state.values[cell],
        ) &&
        !this.peer(pattern.targets[0], pattern.targets[1]),
      "invalid-junior-targets",
    );
    const otherRows = [band * 3, band * 3 + 1, band * 3 + 2].filter(
        (otherRow) => otherRow !== line,
      ),
      unused = defined(
        [stack * 3, stack * 3 + 1, stack * 3 + 2].find(
          (cell) => !pattern.base.includes(at(line, cell)),
        ),
        "find",
      );
    const companions = pattern.targets.map((cell: number) =>
        at(
          defined(
            otherRows.find((otherRow) => otherRow !== row(cell)),
            "otherRow",
          ),
          col(cell),
        ),
      ),
      cross = [unused, ...pattern.targets.map(col)];
    requireProof(
      new Set(pattern.targets.map(row)).size === 2 &&
        new Set(pattern.targets.map((cell: number) => Math.floor(col(cell) / 3))).size === 2 &&
        sameValue(companions, pattern.companions) &&
        sameValue(
          cross.map(
            (crossLine) => `${pattern.orientation === "row" ? "column" : "row"}:${crossLine}`,
          ),
          pattern.crossLines,
        ),
      "incomplete-junior-cross-lines",
    );
    const symbols = [
      ...new Set<number>(pattern.base.flatMap((cell: number) => this.symbols(cell))),
    ].sort((left, right) => left - right);
    requireProof(
      symbols.length >= 3 &&
        symbols.length <= 4 &&
        sameValue(symbols, pattern.baseSymbols) &&
        companions.every((cell: number) =>
          symbols.every((symbol) => !this.symbols(cell).includes(symbol)),
        ),
      "invalid-junior-companions",
    );
    const scells = Array.from({ length: 81 }, (_, cell) => cell).filter(
      (cell) => Math.floor(row(cell) / 3) !== band && cross.includes(col(cell)),
    );
    requireProof(
      Array.isArray(pattern.sCells) &&
        sameValue(
          scells,
          [...pattern.sCells].sort((left, right) => left - right),
        ) &&
        pattern.covers.length === symbols.length,
      "incomplete-junior-s-cells",
    );
    for (const [i, symbol] of symbols.entries()) {
      const cv = pattern.covers[i];
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
      const occurrences = scells.filter((cell) => this.symbols(cell).includes(symbol));
      requireProof(
        sameValue(cv.occurrences, occurrences) &&
          sameValue(
            cv.assignedOccurrences,
            scells.filter((cell) => this.view.state.values[cell] === symbol),
          ) &&
          occurrences.every((cell) =>
            houses.some((house: readonly number[]) => house.includes(cell)),
          ),
        "incomplete-junior-s-occurrences",
      );
    }
  }
  component(pattern: any, claim: any): void {
    requireFields(claim, ["local", "identity", "counts", "relation"]);
    const cells = [...pattern.base, ...pattern.targets].sort((left, right) => left - right);
    this.local(claim.local, cells, [pattern.base]);
    this.local(claim.identity, [pattern.base[0]], []);
    const expected: any[] = [];
    for (const symbol of pattern.baseSymbols)
      for (const base of pattern.base)
        if (this.symbols(base).includes(symbol)) {
          const cv = pattern.covers.find((value: any) => value.symbol === symbol),
            choices =
              cv.houses.length === 1
                ? pattern.targets.map((target: number) => [target])
                : [pattern.targets];
          for (const targets of choices) expected.push({ base, symbol, targets });
        }
    requireProof(
      Array.isArray(claim.counts) && claim.counts.length === expected.length,
      "incomplete-junior-counts",
    );
    for (const [i, item] of claim.counts.entries()) {
      requireFields(item, ["base", "symbol", "targets", "kind", "root"]);
      const expectation = expected[i];
      requireProof(
        sameValue({ base: item.base, symbol: item.symbol, targets: item.targets }, expectation),
        "incomplete-junior-counts",
      );
      const conclusion = clause([
        { cell: expectation.base, symbol: expectation.symbol, positive: false },
        ...expectation.targets.map((cell: number) => ({
          cell,
          symbol: expectation.symbol,
          positive: true,
        })),
      ]);
      const node = this.node(item.root);
      requireProof(sameValue(node.conclusion, conclusion), "invalid-junior-count-conclusion");
      if (item.kind === "domain") {
        requireProof(
          node.rule === "table-project@1" &&
            sameValue(node.premises, [claim.local]) &&
            expectation.targets.some(
              (target: number) => this.domain(target) === symbolMask(expectation.symbol),
            ),
          "substituted-junior-domain-count",
        );
        continue;
      }
      requireProof(
        item.kind === "count" && node.rule === "cover-count-clause@1",
        "substituted-junior-count",
      );
      const cv = pattern.covers.find((value: any) => value.symbol === expectation.symbol),
        capacityNames = [
          ...cv.houses,
          `${pattern.orientation}:${pattern.orientation === "row" ? Math.floor(expectation.base / 9) : expectation.base % 9}`,
          `box:${cellBox(expectation.base)}`,
        ];
      const source = (id: number, kind: string, cells: readonly number[]) => {
        const fact = this.view.facts.get(id);
        requireProof(
          fact &&
            !fact.openAssumptions.length &&
            sameValue(
              fact.proposition,
              kind === "cover" ? { kind, cells, symbol: expectation.symbol } : { kind, cells },
            ),
          "unproved-junior-count-scope",
        );
      };
      const parameters = node.parameters as any;
      requireFields(parameters, ["symbol", "covers", "capacities"]);
      const uniqueCapacities = [...new Set(capacityNames)];
      requireProof(
        parameters.symbol === expectation.symbol &&
          parameters.covers.length === 3 &&
          parameters.capacities.length === uniqueCapacities.length,
        "incomplete-junior-weighted-count",
      );
      const coefficients = new Map<number, number>(),
        sources: number[] = [];
      for (const [names, weights, kind, sign] of [
        [pattern.crossLines, parameters.covers, "cover", -1],
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
            .concat([expectation.base, ...expectation.targets]),
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
      claim.relation,
      claim.local,
      claim.identity,
      claim.counts.map((value: any) => value.root),
    );
    const relation = this.node(claim.relation).conclusion;
    requireProof(relation.kind === "table" && relation.count > 0, "empty-junior-relation");
  }
}
export function checkExocetPattern(
  proposal: DeductionProposal,
  view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
): void {
  const pattern = proposal.pattern as any,
    left = new ExocetAdmission(proposal, view, available);
  let plans: any[];
  if (pattern.alias === "Double Exocet") {
    requireFields(pattern, ["alias", "components", "certificate"]);
    requireProof(
      Array.isArray(pattern.components) && pattern.components.length === 2,
      "invalid-double-components",
    );
    plans = pattern.components;
  } else {
    requireProof(["Exocet", "Junior Exocet"].includes(pattern.alias), "unsupported-exocet-alias");
    requireFields(pattern, ["alias", "certificate", ...juniorKeys]);
    const { alias, certificate, ...plan } = pattern;
    plans = [plan];
  }
  plans.forEach((plan) => left.geometry(plan));
  requireFields(pattern.certificate, ["components", "table"]);
  requireProof(
    pattern.certificate.components.length === plans.length,
    "incomplete-exocet-components",
  );
  plans.forEach((plan, i) => left.component(plan, pattern.certificate.components[i]));
  if (plans.length === 2) {
    const [x, y] = plans,
      band = (cell: any) =>
        Math.floor(
          (cell.orientation === "row" ? Math.floor(cell.base[0] / 9) : cell.base[0] % 9) / 3,
        );
    requireProof(
      x.orientation === y.orientation &&
        band(x) === band(y) &&
        new Set([...x.base, ...y.base]).size <= 4 &&
        new Set([...x.targets, ...y.targets]).size === 4 &&
        new Set([...x.baseSymbols, ...y.baseSymbols]).size <= 4,
      "invalid-double-join-geometry",
    );
    left.joinPeers(
      pattern.certificate.table,
      pattern.certificate.components[0].relation,
      pattern.certificate.components[1].relation,
    );
  } else
    requireProof(
      pattern.certificate.table === pattern.certificate.components[0].relation,
      "substituted-junior-table",
    );
  left.directEffects(pattern.certificate.table);
}
