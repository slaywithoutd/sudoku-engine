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
  const p = proposal.pattern as any,
    a = new SpecializedAdmission(proposal, view, available);
  requireFields(p, ["alias", "corners", "groups", "links", "linkMultiplicity", "certificate"]);
  requireProof(
    p.alias === "SK Loops" && Array.isArray(p.corners) && p.corners.length === 4,
    "invalid-sk-alias",
  );
  const [x, y, z, w] = p.corners,
    rs = [Math.floor(x / 9), Math.floor(z / 9)],
    cs = [x % 9, y % 9];
  requireProof(
    rs[0] < rs[1] &&
      cs[0] < cs[1] &&
      Math.floor(rs[0] / 3) !== Math.floor(rs[1] / 3) &&
      Math.floor(cs[0] / 3) !== Math.floor(cs[1] / 3) &&
      sameValue(p.corners, [
        rs[0] * 9 + cs[0],
        rs[0] * 9 + cs[1],
        rs[1] * 9 + cs[1],
        rs[1] * 9 + cs[0],
      ]),
    "invalid-sk-rectangle",
  );
  const horizontal = (q: number) =>
    a.house("row", Math.floor(q / 9)).filter((c) => cellBox(c) === cellBox(q) && c !== q);
  const vertical = (q: number) =>
    a.house("column", q % 9).filter((c) => cellBox(c) === cellBox(q) && c !== q);
  const groups = [
    horizontal(x),
    horizontal(y),
    vertical(y),
    vertical(z),
    horizontal(z),
    horizontal(w),
    vertical(w),
    vertical(x),
  ];
  const houses = [
    a.house("row", rs[0]),
    a.house("box", cellBox(y)),
    a.house("column", cs[1]),
    a.house("box", cellBox(z)),
    a.house("row", rs[1]),
    a.house("box", cellBox(w)),
    a.house("column", cs[0]),
    a.house("box", cellBox(x)),
  ];
  requireProof(
    sameValue(p.groups, groups) &&
      new Set(groups.flat()).size === 16 &&
      Array.isArray(p.links) &&
      p.links.length === 8,
    "invalid-sk-groups",
  );
  let multiplicity = 0;
  for (const [i, link] of p.links.entries()) {
    requireFields(link, ["house", "symbols"]);
    const [kind, n] = link.house.split(":");
    requireProof(
      ["row", "column", "box"].includes(kind) &&
        sameValue(a.house(kind, Number(n)), houses[i]) &&
        orderedNumbers(link.symbols) &&
        link.symbols.length >= 1 &&
        link.symbols.length <= 3 &&
        link.symbols.every((s: number) => view.assembly.problem.symbols.includes(s)),
      "invalid-sk-link",
    );
    multiplicity += link.symbols.length;
  }
  requireProof(multiplicity === p.linkMultiplicity && multiplicity <= 16, "sk-multiplicity-bound");
  groups.forEach((g, i) =>
    requireProof(
      g.every((cell) =>
        a
          .symbols(cell)
          .every((s) => p.links[i].symbols.includes(s) || p.links[(i + 7) % 8].symbols.includes(s)),
      ),
      "incomplete-sk-domain-links",
    ),
  );
  const c = p.certificate;
  requireFields(c, ["locals", "joins", "table", "routes"]);
  requireProof(c.locals.length === 8 && c.joins.length === 7, "incomplete-sk-ring");
  c.locals.forEach((id: number, i: number) => a.local(id, groups[i], [groups[i]]));
  let ring = c.locals[0];
  for (let i = 0; i < 7; i++) {
    a.joinPeers(c.joins[i], ring, c.locals[i + 1]);
    ring = c.joins[i];
  }
  const r = a.node(ring).conclusion;
  requireProof(r.kind === "table" && r.count > 0, "empty-sk-ring");
  requireProof(c.table === ring, "substituted-sk-ring-closure");
  requireProof(
    Array.isArray(c.routes) && c.routes.length === proposal.effects.length,
    "incomplete-sk-effects",
  );
  const accepted = new Set<number>();
  for (const route of c.routes) {
    requireFields(route, ["link", "symbol", "cell", "cover", "weak", "root"]);
    const i = route.link;
    requireProof(
      Number.isInteger(i) &&
        i >= 0 &&
        i < 8 &&
        p.links[i].symbols.includes(route.symbol) &&
        houses[i].includes(route.cell) &&
        !groups.flat().includes(route.cell),
      "outside-sk-effect",
    );
    const cells = [...groups[i], ...groups[(i + 1) % 8]].sort((x, y) => x - y),
      cover = a.node(route.cover, "table-project@1");
    requireProof(
      sameValue(cover.premises, [c.table]) &&
        sameValue(
          cover.conclusion,
          clause(cells.map((cell) => ({ cell, symbol: route.symbol, positive: true }))),
        ) &&
        route.weak.length === 4,
      "invalid-sk-effect-cover",
    );
    const allowed = new Set<number>([route.cover]);
    for (const [j, id] of route.weak.entries()) {
      const n = a.node(id, "weak-link@1"),
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
        sameValue(a.node(route.root).conclusion, {
          kind: "literal",
          value: { cell: route.cell, symbol: route.symbol, positive: false },
        }),
      "substituted-sk-effect",
    );
    accepted.add(route.root);
  }
  for (const e of proposal.effects) {
    requireProof(e.kind === "remove", "invalid-sk-effect");
    const roots = proposal.proof.roots.filter((id) =>
      sameValue(available.get(id)?.conclusion, {
        kind: "literal",
        value: { cell: e.cell, symbol: e.symbol, positive: false },
      }),
    );
    requireProof(
      roots.length > 0 && roots.every((id) => accepted.has(id)),
      "substituted-sk-effect-root",
    );
  }
}
