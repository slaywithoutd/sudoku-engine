import type { DeductionProposal, ProofNode } from "../proof/types";
import type { ReadView } from "../state/types";
import { clause, literals, requireProof, sameValue } from "../proof/primitives";
import {
  cellBox,
  orderedNumbers,
  requireFields,
  SpecializedAdmission,
} from "./specialized-lineage";

/** The checker reconstructs both source covers, every crossing exclusion, each
 * component relation and every effect root without importing FireworksSearch. */
export function checkFireworksPattern(
  proposal: DeductionProposal,
  view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
): void {
  const p = proposal.pattern as any,
    a = new SpecializedAdmission(proposal, view, available);
  requireFields(p, ["alias", "components", "selected", "certificate"]);
  requireProof(
    Array.isArray(p.components) &&
      (p.components.length === 1 || p.components.length === 2) &&
      orderedNumbers(p.selected) &&
      p.selected.length === p.components.length + 2,
    "fireworks-geometry-bound",
  );
  requireProof(
    p.components.length === 1
      ? ["Fireworks", "Triple Fireworks"].includes(p.alias)
      : p.alias === "Quadruple Fireworks",
    "invalid-fireworks-alias",
  );
  requireFields(p.certificate, ["components", "table"]);
  requireProof(
    p.certificate.components.length === p.components.length,
    "incomplete-fireworks-components",
  );
  const selected = [
    ...new Set<number>(p.components.flatMap((c: any) => [c.intersection, c.rowWing, c.columnWing])),
  ].sort((x, y) => x - y);
  requireProof(sameValue(selected, p.selected), "fireworks-geometry-bound");
  for (const [i, c] of p.components.entries()) {
    requireFields(c, ["intersection", "rowWing", "columnWing", "symbols"]);
    const x = c.intersection,
      y = c.rowWing,
      z = c.columnWing,
      row = a.house("row", Math.floor(x / 9)),
      column = a.house("column", x % 9),
      box = a.house("box", cellBox(x));
    requireProof(
      row.includes(y) &&
        column.includes(z) &&
        !box.includes(y) &&
        !box.includes(z) &&
        new Set([x, y, z]).size === 3 &&
        [x, y, z].every((q) => !view.state.values[q]) &&
        orderedNumbers(c.symbols) &&
        c.symbols.length === (p.components.length === 1 ? 3 : 2) &&
        c.symbols.every((s: number) => a.symbols(x).includes(s)),
      "invalid-fireworks-geometry",
    );
    const component = p.certificate.components[i];
    requireFields(component, ["covers", "local", "identity", "relation"]);
    requireProof(
      Array.isArray(component.covers) && component.covers.length === c.symbols.length,
      "incomplete-fireworks-symbols",
    );
    for (const [j, symbol] of c.symbols.entries()) {
      requireProof(
        row.every((q) => box.includes(q) || q === y || !a.symbols(q).includes(symbol)) &&
          column.every((q) => box.includes(q) || q === z || !a.symbols(q).includes(symbol)),
        "incomplete-fireworks-outside-support",
      );
      const proof = component.covers[j];
      requireFields(proof, ["symbol", "row", "column", "routes"]);
      requireProof(proof.symbol === symbol, "incomplete-fireworks-symbols");
      a.support(proof.row, row, symbol);
      a.support(proof.column, column, symbol);
      requireProof(
        Array.isArray(proof.routes) && proof.routes.length === 2,
        "incomplete-fireworks-routes",
      );
      for (const [index, route] of proof.routes.entries()) {
        requireFields(route, ["weak", "steps", "root"]);
        const line = index ? column : row,
          cross = index ? row : column,
          wing = index ? z : y,
          crossWing = index ? y : z;
        const expectedPairs = line
          .filter((q) => q !== x && q !== wing && a.symbols(q).includes(symbol))
          .flatMap((left) =>
            cross
              .filter((q) => q !== crossWing && a.symbols(q).includes(symbol))
              .map((right) => [left, right]),
          );
        requireProof(
          Array.isArray(route.weak) && route.weak.length === expectedPairs.length,
          "incomplete-fireworks-conflicts",
        );
        expectedPairs.forEach(([left, right], k) => {
          const n = a.node(route.weak[k], "weak-link@1"),
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
          const n = a.node(id, "resolution@1");
          requireProof(
            n.premises.every((q) => allowed.has(q)),
            "substituted-fireworks-cover",
          );
          allowed.add(id);
        }
        requireProof(
          allowed.has(route.root) &&
            literals(a.node(route.root).conclusion).length >= 1 &&
            literals(a.node(route.root).conclusion).every(
              (l) => l.positive && l.symbol === symbol && [x, y, z].includes(l.cell),
            ),
          "substituted-fireworks-cover",
        );
        const seen = new Set<number>(),
          pending = [route.root];
        while (pending.length) {
          const id = pending.pop()!;
          if (seen.has(id)) continue;
          seen.add(id);
          if (allowed.has(id)) pending.push(...a.node(id).premises);
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
    const cells = [x, y, z].sort((x, y) => x - y),
      roots: number[] = component.covers.flatMap((v: any) => v.routes.map((r: any) => r.root));
    a.restrictedLocal(
      component.local,
      cells,
      [
        [x, y],
        [x, z],
      ],
      roots,
    );
    a.local(component.identity, [x], []);
    a.join(
      component.relation,
      component.local,
      component.identity,
      roots.filter((id) => a.node(id).conclusion.kind === "clause"),
    );
  }
  if (p.components.length === 2) {
    const [c, d] = p.components;
    requireProof(
      c.rowWing === d.columnWing &&
        c.columnWing === d.rowWing &&
        c.intersection !== d.intersection &&
        c.symbols.every((s: number) => !d.symbols.includes(s)),
      "noncanonical-fireworks-quad",
    );
    a.joinPeers(
      p.certificate.table,
      p.certificate.components[0].relation,
      p.certificate.components[1].relation,
    );
  } else
    requireProof(
      p.certificate.table === p.certificate.components[0].relation,
      "substituted-fireworks-table",
    );
  const table = a.node(p.certificate.table).conclusion;
  requireProof(table.kind === "table" && table.count > 0, "empty-fireworks-relation");
  requireProof(
    proposal.effects.every((e) => p.selected.includes(e.cell)),
    "outside-fireworks-effect",
  );
  a.directEffects(p.certificate.table);
}
