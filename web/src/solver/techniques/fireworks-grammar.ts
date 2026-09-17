import type { DeductionProposal, ProofNode } from "../proof/types";
import type { ReadView } from "../state/types";
import { clause, literals, requireProof, sameValue } from "../proof/primitives";
import {
  cellBox,
  orderedNumbers,
  requireFields,
  SpecializedAdmission,
} from "./specialized-lineage";
import { defined } from "../invariants";

/** The checker reconstructs both source covers, every crossing exclusion, each
 * component relation and every effect root without importing FireworksSearch. */
export function checkFireworksPattern(
  proposal: DeductionProposal,
  view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
): void {
  const pattern = proposal.pattern as any,
    admission = new SpecializedAdmission(proposal, view, available);
  requireFields(pattern, ["alias", "components", "selected", "certificate"]);
  requireProof(
    Array.isArray(pattern.components) &&
      (pattern.components.length === 1 || pattern.components.length === 2) &&
      orderedNumbers(pattern.selected) &&
      pattern.selected.length === pattern.components.length + 2,
    "fireworks-geometry-bound",
  );
  requireProof(
    pattern.components.length === 1
      ? ["Fireworks", "Triple Fireworks"].includes(pattern.alias)
      : pattern.alias === "Quadruple Fireworks",
    "invalid-fireworks-alias",
  );
  requireFields(pattern.certificate, ["components", "table"]);
  requireProof(
    pattern.certificate.components.length === pattern.components.length,
    "incomplete-fireworks-components",
  );
  const selected = [
    ...new Set<number>(
      pattern.components.flatMap((component: any) => [
        component.intersection,
        component.rowWing,
        component.columnWing,
      ]),
    ),
  ].sort((x, y) => x - y);
  requireProof(sameValue(selected, pattern.selected), "fireworks-geometry-bound");
  for (const [i, part] of pattern.components.entries()) {
    requireFields(part, ["intersection", "rowWing", "columnWing", "symbols"]);
    const x = part.intersection,
      y = part.rowWing,
      zDigit = part.columnWing,
      row = admission.house("row", Math.floor(x / 9)),
      column = admission.house("column", x % 9),
      box = admission.house("box", cellBox(x));
    requireProof(
      row.includes(y) &&
        column.includes(zDigit) &&
        !box.includes(y) &&
        !box.includes(zDigit) &&
        new Set([x, y, zDigit]).size === 3 &&
        [x, y, zDigit].every((other) => !view.state.values[other]) &&
        orderedNumbers(part.symbols) &&
        part.symbols.length === (pattern.components.length === 1 ? 3 : 2) &&
        part.symbols.every((symbol: number) => admission.symbols(x).includes(symbol)),
      "invalid-fireworks-geometry",
    );
    const component = pattern.certificate.components[i];
    requireFields(component, ["covers", "local", "identity", "relation"]);
    requireProof(
      Array.isArray(component.covers) && component.covers.length === part.symbols.length,
      "incomplete-fireworks-symbols",
    );
    for (const [j, symbol] of part.symbols.entries()) {
      requireProof(
        row.every(
          (other) =>
            box.includes(other) || other === y || !admission.symbols(other).includes(symbol),
        ) &&
          column.every(
            (other) =>
              box.includes(other) || other === zDigit || !admission.symbols(other).includes(symbol),
          ),
        "incomplete-fireworks-outside-support",
      );
      const proof = component.covers[j];
      requireFields(proof, ["symbol", "row", "column", "routes"]);
      requireProof(proof.symbol === symbol, "incomplete-fireworks-symbols");
      admission.support(proof.row, row, symbol);
      admission.support(proof.column, column, symbol);
      requireProof(
        Array.isArray(proof.routes) && proof.routes.length === 2,
        "incomplete-fireworks-routes",
      );
      for (const [index, route] of proof.routes.entries()) {
        requireFields(route, ["weak", "steps", "root"]);
        const line = index ? column : row,
          cross = index ? row : column,
          wing = index ? zDigit : y,
          crossWing = index ? y : zDigit;
        const expectedPairs = line
          .filter(
            (other) => other !== x && other !== wing && admission.symbols(other).includes(symbol),
          )
          .flatMap((left) =>
            cross
              .filter((other) => other !== crossWing && admission.symbols(other).includes(symbol))
              .map((right) => [left, right]),
          );
        requireProof(
          Array.isArray(route.weak) && route.weak.length === expectedPairs.length,
          "incomplete-fireworks-conflicts",
        );
        expectedPairs.forEach(([left, right], k) => {
          const n = admission.node(route.weak[k], "weak-link@1"),
            source = view.facts.get(n.premises[0]);
          requireProof(
            n.premises.length === 1 &&
              source &&
              !source.openAssumptions.length &&
              sameValue(source.proposition, { kind: "all-different", cells: box }) &&
              sameValue(
                n.conclusion,
                clause([
                  { cell: left, symbol, positive: false },
                  { cell: right, symbol, positive: false },
                ]),
              ),
            "invalid-fireworks-conflict",
          );
        });
        const allowed = new Set<number>([proof.row, proof.column, ...route.weak]);
        requireProof(Array.isArray(route.steps), "incomplete-fireworks-derivation");
        for (const id of route.steps) {
          const n = admission.node(id, "resolution@1");
          requireProof(
            n.premises.every((premise) => allowed.has(premise)),
            "substituted-fireworks-cover",
          );
          allowed.add(id);
        }
        requireProof(
          allowed.has(route.root) &&
            literals(admission.node(route.root).conclusion).length >= 1 &&
            literals(admission.node(route.root).conclusion).every(
              (literal) =>
                literal.positive &&
                literal.symbol === symbol &&
                [x, y, zDigit].includes(literal.cell),
            ),
          "substituted-fireworks-cover",
        );
        const seen = new Set<number>(),
          pending = [route.root];
        while (pending.length) {
          const id = defined(pending.pop(), "pending");
          if (seen.has(id)) continue;
          seen.add(id);
          if (allowed.has(id)) pending.push(...admission.node(id).premises);
        }
        const required = expectedPairs.length
          ? [proof.row, proof.column, ...route.weak, ...route.steps]
          : [index ? proof.column : proof.row];
        requireProof(
          required.every((id) => seen.has(id)),
          "incomplete-fireworks-cover-lineage",
        );
      }
    }
    const cells = [x, y, zDigit].sort((x, y) => x - y),
      roots: number[] = component.covers.flatMap((value: any) =>
        value.routes.map((route: any) => route.root),
      );
    admission.restrictedLocal(
      component.local,
      cells,
      [
        [x, y],
        [x, zDigit],
      ],
      roots,
    );
    admission.local(component.identity, [x], []);
    admission.join(
      component.relation,
      component.local,
      component.identity,
      roots.filter((id) => admission.node(id).conclusion.kind === "clause"),
    );
  }
  if (pattern.components.length === 2) {
    const [first, second] = pattern.components;
    requireProof(
      first.rowWing === second.columnWing &&
        first.columnWing === second.rowWing &&
        first.intersection !== second.intersection &&
        first.symbols.every((symbol: number) => !second.symbols.includes(symbol)),
      "noncanonical-fireworks-quad",
    );
    admission.joinPeers(
      pattern.certificate.table,
      pattern.certificate.components[0].relation,
      pattern.certificate.components[1].relation,
    );
  } else
    requireProof(
      pattern.certificate.table === pattern.certificate.components[0].relation,
      "substituted-fireworks-table",
    );
  const table = admission.node(pattern.certificate.table).conclusion;
  requireProof(table.kind === "table" && table.count > 0, "empty-fireworks-relation");
  requireProof(
    proposal.effects.every((effect) => pattern.selected.includes(effect.cell)),
    "outside-fireworks-effect",
  );
  admission.directEffects(pattern.certificate.table);
}
