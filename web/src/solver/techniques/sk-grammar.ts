import type { DeductionProposal, ProofNode } from "../proof/types";
import type { ReadView } from "../state/types";
import { clause, requireProof, sameValue } from "../proof/primitives";
import {
  cellBox,
  orderedNumbers,
  requireFields,
  SpecializedAdmission,
} from "./specialized-lineage";

export function checkSkPattern(
  proposal: DeductionProposal,
  view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
): void {
  const pattern = proposal.pattern as any,
    left = new SpecializedAdmission(proposal, view, available);
  requireFields(pattern, [
    "alias",
    "corners",
    "groups",
    "links",
    "linkMultiplicity",
    "certificate",
  ]);
  requireProof(
    pattern.alias === "SK Loops" && Array.isArray(pattern.corners) && pattern.corners.length === 4,
    "invalid-sk-alias",
  );
  const [x, y, zDigit, weight] = pattern.corners,
    rs = [Math.floor(x / 9), Math.floor(zDigit / 9)],
    cs = [x % 9, y % 9];
  requireProof(
    rs[0] < rs[1] &&
      cs[0] < cs[1] &&
      Math.floor(rs[0] / 3) !== Math.floor(rs[1] / 3) &&
      Math.floor(cs[0] / 3) !== Math.floor(cs[1] / 3) &&
      sameValue(pattern.corners, [
        rs[0] * 9 + cs[0],
        rs[0] * 9 + cs[1],
        rs[1] * 9 + cs[1],
        rs[1] * 9 + cs[0],
      ]),
    "invalid-sk-rectangle",
  );
  const horizontal = (other: number) =>
    left
      .house("row", Math.floor(other / 9))
      .filter((cell) => cellBox(cell) === cellBox(other) && cell !== other);
  const vertical = (other: number) =>
    left
      .house("column", other % 9)
      .filter((cell) => cellBox(cell) === cellBox(other) && cell !== other);
  const groups = [
    horizontal(x),
    horizontal(y),
    vertical(y),
    vertical(zDigit),
    horizontal(zDigit),
    horizontal(weight),
    vertical(weight),
    vertical(x),
  ];
  const houses = [
    left.house("row", rs[0]),
    left.house("box", cellBox(y)),
    left.house("column", cs[1]),
    left.house("box", cellBox(zDigit)),
    left.house("row", rs[1]),
    left.house("box", cellBox(weight)),
    left.house("column", cs[0]),
    left.house("box", cellBox(x)),
  ];
  requireProof(
    sameValue(pattern.groups, groups) &&
      new Set(groups.flat()).size === 16 &&
      Array.isArray(pattern.links) &&
      pattern.links.length === 8,
    "invalid-sk-groups",
  );
  let multiplicity = 0;
  for (const [i, link] of pattern.links.entries()) {
    requireFields(link, ["house", "symbols"]);
    const [kind, n] = link.house.split(":");
    requireProof(
      ["row", "column", "box"].includes(kind) &&
        sameValue(left.house(kind, Number(n)), houses[i]) &&
        orderedNumbers(link.symbols) &&
        link.symbols.length >= 1 &&
        link.symbols.length <= 3 &&
        link.symbols.every((symbol: number) => view.assembly.problem.symbols.includes(symbol)),
      "invalid-sk-link",
    );
    multiplicity += link.symbols.length;
  }
  requireProof(
    multiplicity === pattern.linkMultiplicity && multiplicity <= 16,
    "sk-multiplicity-bound",
  );
  groups.forEach((group, i) =>
    requireProof(
      group.every((cell) =>
        left
          .symbols(cell)
          .every(
            (symbol) =>
              pattern.links[i].symbols.includes(symbol) ||
              pattern.links[(i + 7) % 8].symbols.includes(symbol),
          ),
      ),
      "incomplete-sk-domain-links",
    ),
  );
  const certificate = pattern.certificate;
  requireFields(certificate, ["locals", "joins", "table", "routes"]);
  requireProof(
    certificate.locals.length === 8 && certificate.joins.length === 7,
    "incomplete-sk-ring",
  );
  certificate.locals.forEach((id: number, i: number) => left.local(id, groups[i], [groups[i]]));
  let ring = certificate.locals[0];
  for (let i = 0; i < 7; i++) {
    left.joinPeers(certificate.joins[i], ring, certificate.locals[i + 1]);
    ring = certificate.joins[i];
  }
  const proposition = left.node(ring).conclusion;
  requireProof(proposition.kind === "table" && proposition.count > 0, "empty-sk-ring");
  requireProof(certificate.table === ring, "substituted-sk-ring-closure");
  requireProof(
    Array.isArray(certificate.routes) && certificate.routes.length === proposal.effects.length,
    "incomplete-sk-effects",
  );
  const accepted = new Set<number>();
  for (const route of certificate.routes) {
    requireFields(route, ["link", "symbol", "cell", "cover", "weak", "root"]);
    const i = route.link;
    requireProof(
      Number.isInteger(i) &&
        i >= 0 &&
        i < 8 &&
        pattern.links[i].symbols.includes(route.symbol) &&
        houses[i].includes(route.cell) &&
        !groups.flat().includes(route.cell),
      "outside-sk-effect",
    );
    const cells = [...groups[i], ...groups[(i + 1) % 8]].sort((x, y) => x - y),
      cover = left.node(route.cover, "table-project@1");
    requireProof(
      sameValue(cover.premises, [certificate.table]) &&
        sameValue(
          cover.conclusion,
          clause(cells.map((cell) => ({ cell, symbol: route.symbol, positive: true }))),
        ) &&
        route.weak.length === 4,
      "invalid-sk-effect-cover",
    );
    const allowed = new Set<number>([route.cover]);
    for (const [j, id] of route.weak.entries()) {
      const n = left.node(id, "weak-link@1"),
        source = view.facts.get(n.premises[0]);
      requireProof(
        n.premises.length === 1 &&
          source &&
          !source.openAssumptions.length &&
          sameValue(source.proposition, { kind: "all-different", cells: houses[i] }) &&
          sameValue(
            n.conclusion,
            clause([
              { cell: cells[j], symbol: route.symbol, positive: false },
              { cell: route.cell, symbol: route.symbol, positive: false },
            ]),
          ),
        "invalid-sk-peer-effect",
      );
      allowed.add(id);
    }
    for (const n of proposal.proof.nodes)
      if (n.rule === "resolution@1" && n.premises.every((id) => allowed.has(id))) allowed.add(n.id);
    requireProof(
      allowed.has(route.root) &&
        sameValue(left.node(route.root).conclusion, {
          kind: "literal",
          value: { cell: route.cell, symbol: route.symbol, positive: false },
        }),
      "substituted-sk-effect",
    );
    accepted.add(route.root);
  }
  for (const effect of proposal.effects) {
    requireProof(effect.kind === "remove", "invalid-sk-effect");
    const roots = proposal.proof.roots.filter((id) =>
      sameValue(available.get(id)?.conclusion, {
        kind: "literal",
        value: { cell: effect.cell, symbol: effect.symbol, positive: false },
      }),
    );
    requireProof(
      roots.length > 0 && roots.every((id) => accepted.has(id)),
      "substituted-sk-effect-root",
    );
  }
}
