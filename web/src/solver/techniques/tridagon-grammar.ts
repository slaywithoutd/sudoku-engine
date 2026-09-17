import type { DeductionProposal, ProofNode } from "../proof/types";
import type { ReadView } from "../state/types";
import { clause, requireProof, sameValue } from "../proof/primitives";
import { orderedNumbers, requireFields, SpecializedAdmission } from "./specialized-lineage";

export function checkTridagonPattern(
  proposal: DeductionProposal,
  view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
): void {
  const p = proposal.pattern as any,
    a = new SpecializedAdmission(proposal, view, available);
  requireFields(p, ["alias", "boxes", "triples", "coreSymbols", "guardians", "certificate"]);
  requireProof(
    ["Tridagon", "Thor's Hammer", "Degenerate Tridagon", "Tridagon guardians"].includes(p.alias) &&
      orderedNumbers(p.boxes) &&
      p.boxes.length === 4 &&
      orderedNumbers(p.coreSymbols) &&
      p.coreSymbols.length === 3 &&
      p.coreSymbols.every((s: number) => view.assembly.problem.symbols.includes(s)),
    "invalid-tridagon-geometry",
  );
  const bands = [...new Set<number>(p.boxes.map((b: number) => Math.floor(b / 3)))],
    stacks = [...new Set<number>(p.boxes.map((b: number) => b % 3))];
  requireProof(
    bands.length === 2 &&
      stacks.length === 2 &&
      sameValue(
        p.boxes,
        bands.flatMap((b) => stacks.map((s) => b * 3 + s)),
      ) &&
      Array.isArray(p.triples) &&
      p.triples.length === 4,
    "invalid-tridagon-rectangle",
  );
  const all: number[] = [];
  for (let i = 0; i < 4; i++) {
    const t = p.triples[i];
    requireProof(
      orderedNumbers(t) &&
        t.length === 3 &&
        t.every((c: number) => a.house("box", p.boxes[i]).includes(c)),
      "invalid-tridagon-triple",
    );
    all.push(...t);
  }
  requireProof(new Set(all).size === 12, "invalid-tridagon-triple");
  const guardians = all
    .flatMap((cell) =>
      a
        .symbols(cell)
        .filter((s) => !p.coreSymbols.includes(s))
        .map((symbol) => ({ cell, symbol })),
    )
    .sort((a, b) => a.cell - b.cell || a.symbol - b.symbol);
  requireProof(
    guardians.length >= 1 &&
      guardians.length <= 4 &&
      Array.isArray(p.guardians) &&
      sameValue(
        guardians,
        [...p.guardians].sort((a, b) => a.cell - b.cell || a.symbol - b.symbol),
      ),
    "incomplete-tridagon-guardians",
  );
  const c = p.certificate;
  requireFields(c, ["permutations", "rejections", "locals", "joins", "table", "theorem"]);
  const permutations: number[][][] = p.triples.map((triple: number[]) => {
    const rows: number[][] = [];
    for (const x of p.coreSymbols)
      for (const y of p.coreSymbols)
        for (const z of p.coreSymbols)
          if (
            x !== y &&
            x !== z &&
            y !== z &&
            [x, y, z].every((s, i) => a.symbols(triple[i]).includes(s))
          )
            rows.push([x, y, z]);
    return rows;
  });
  requireProof(
    permutations.every((rows) => rows.length >= 1 && rows.length <= 6) &&
      sameValue(permutations, c.permutations),
    "incomplete-tridagon-permutations",
  );
  requireProof(
    p.alias !== "Degenerate Tridagon" || permutations.some((rows) => rows.length < 6),
    "invalid-degenerate-tridagon-alias",
  );
  const total = permutations.reduce((n, v) => n * v.length, 1);
  requireProof(
    Array.isArray(c.rejections) && c.rejections.length === total,
    "incomplete-tridagon-core-rejections",
  );
  let index = 0;
  for (const w of permutations[0])
    for (const x of permutations[1])
      for (const y of permutations[2])
        for (const z of permutations[3]) {
          const values = [...w, ...x, ...y, ...z],
            pair = c.rejections[index++];
          requireProof(
            Array.isArray(pair) &&
              pair.length === 2 &&
              all.includes(pair[0]) &&
              all.includes(pair[1]) &&
              a.peer(pair[0], pair[1]) &&
              values[all.indexOf(pair[0])] === values[all.indexOf(pair[1])],
            "surviving-tridagon-core-permutation",
          );
        }
  requireProof(
    Array.isArray(c.locals) &&
      c.locals.length === 4 &&
      Array.isArray(c.joins) &&
      c.joins.length === 3,
    "incomplete-tridagon-tables",
  );
  c.locals.forEach((id: number, i: number) => a.local(id, p.triples[i], [p.triples[i]]));
  let table = c.locals[0];
  for (let i = 0; i < 3; i++) {
    a.joinPeers(c.joins[i], table, c.locals[i + 1]);
    table = c.joins[i];
  }
  requireProof(c.table === table, "substituted-tridagon-table");
  const result = a.node(table).conclusion;
  requireProof(result.kind === "table" && result.count > 0, "empty-tridagon-relation");
  const theorem = a.node(c.theorem, "table-project@1"),
    claim = clause(guardians.map((g) => ({ ...g, positive: true })));
  requireProof(
    sameValue(theorem.premises, [table]) && sameValue(theorem.conclusion, claim),
    "substituted-tridagon-guardian-proof",
  );
  if (guardians.length > 1)
    requireProof(
      proposal.effects.length === 0 && sameValue(proposal.proof.roots, [c.theorem]),
      "invalid-tridagon-clause-publication",
    );
  else {
    const guardian = guardians[0],
      placed = proposal.effects.filter((e) => e.kind === "place");
    requireProof(sameValue(placed, [{ kind: "place", ...guardian }]), "invalid-tridagon-placement");
    for (const e of proposal.effects) {
      const roots = proposal.proof.roots.filter((id) =>
        sameValue(available.get(id)?.conclusion, {
          kind: "literal",
          value: { cell: e.cell, symbol: e.symbol, positive: e.kind === "place" },
        }),
      );
      requireProof(roots.length > 0, "missing-tridagon-effect-root");
      for (const id of roots)
        if (e.kind === "place")
          requireProof(id === c.theorem, "substituted-tridagon-placement-root");
        else {
          const root = a.node(id, "resolution@1");
          requireProof(
            root.premises.includes(c.theorem) &&
              root.premises.length === 2 &&
              e.symbol === guardian.symbol &&
              a.peer(e.cell, guardian.cell),
            "substituted-tridagon-peer-root",
          );
          const weak = a.node(
            root.premises.find((q) => q !== c.theorem)!,
            "weak-link@1",
          );
          requireProof(
            sameValue(
              weak.conclusion,
              clause([
                { ...guardian, positive: false },
                { cell: e.cell, symbol: e.symbol, positive: false },
              ]),
            ) &&
              weak.premises.length === 1 &&
              view.facts.get(weak.premises[0])?.proposition.kind === "all-different",
            "invalid-tridagon-peer-root",
          );
        }
    }
  }
}
