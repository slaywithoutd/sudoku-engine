import type { DeductionProposal, ProofNode } from "../proof/types";
import type { ReadView } from "../state/types";
import { clause, requireProof, sameValue } from "../proof/primitives";
import { orderedNumbers, requireFields, SpecializedAdmission } from "./specialized-lineage";
import { defined } from "../invariants";

export function checkTridagonPattern(
  proposal: DeductionProposal,
  view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
): void {
  const pattern = proposal.pattern as any,
    left = new SpecializedAdmission(proposal, view, available);
  requireFields(pattern, ["alias", "boxes", "triples", "coreSymbols", "guardians", "certificate"]);
  requireProof(
    ["Tridagon", "Thor's Hammer", "Degenerate Tridagon", "Tridagon guardians"].includes(
      pattern.alias,
    ) &&
      orderedNumbers(pattern.boxes) &&
      pattern.boxes.length === 4 &&
      orderedNumbers(pattern.coreSymbols) &&
      pattern.coreSymbols.length === 3 &&
      pattern.coreSymbols.every((symbol: number) => view.assembly.problem.symbols.includes(symbol)),
    "invalid-tridagon-geometry",
  );
  const bands = [...new Set<number>(pattern.boxes.map((right: number) => Math.floor(right / 3)))],
    stacks = [...new Set<number>(pattern.boxes.map((right: number) => right % 3))];
  requireProof(
    bands.length === 2 &&
      stacks.length === 2 &&
      sameValue(
        pattern.boxes,
        bands.flatMap((right) => stacks.map((symbol) => right * 3 + symbol)),
      ) &&
      Array.isArray(pattern.triples) &&
      pattern.triples.length === 4,
    "invalid-tridagon-rectangle",
  );
  const all: number[] = [];
  for (let i = 0; i < 4; i++) {
    const triple = pattern.triples[i];
    requireProof(
      orderedNumbers(triple) &&
        triple.length === 3 &&
        triple.every((cell: number) => left.house("box", pattern.boxes[i]).includes(cell)),
      "invalid-tridagon-triple",
    );
    all.push(...triple);
  }
  requireProof(new Set(all).size === 12, "invalid-tridagon-triple");
  const guardians = all
    .flatMap((cell) =>
      left
        .symbols(cell)
        .filter((symbol) => !pattern.coreSymbols.includes(symbol))
        .map((symbol) => ({ cell, symbol })),
    )
    .sort((left, right) => left.cell - right.cell || left.symbol - right.symbol);
  requireProof(
    guardians.length >= 1 &&
      guardians.length <= 4 &&
      Array.isArray(pattern.guardians) &&
      sameValue(
        guardians,
        [...pattern.guardians].sort(
          (left, right) => left.cell - right.cell || left.symbol - right.symbol,
        ),
      ),
    "incomplete-tridagon-guardians",
  );
  const certificate = pattern.certificate;
  requireFields(certificate, ["permutations", "rejections", "locals", "joins", "table", "theorem"]);
  const permutations: number[][][] = pattern.triples.map((triple: number[]) => {
    const rows: number[][] = [];
    for (const x of pattern.coreSymbols)
      for (const y of pattern.coreSymbols)
        for (const zDigit of pattern.coreSymbols)
          if (
            x !== y &&
            x !== zDigit &&
            y !== zDigit &&
            [x, y, zDigit].every((symbol, i) => left.symbols(triple[i]).includes(symbol))
          )
            rows.push([x, y, zDigit]);
    return rows;
  });
  requireProof(
    permutations.every((rows) => rows.length >= 1 && rows.length <= 6) &&
      sameValue(permutations, certificate.permutations),
    "incomplete-tridagon-permutations",
  );
  requireProof(
    pattern.alias !== "Degenerate Tridagon" || permutations.some((rows) => rows.length < 6),
    "invalid-degenerate-tridagon-alias",
  );
  const total = permutations.reduce((n, value) => n * value.length, 1);
  requireProof(
    Array.isArray(certificate.rejections) && certificate.rejections.length === total,
    "incomplete-tridagon-core-rejections",
  );
  let index = 0;
  for (const weight of permutations[0])
    for (const x of permutations[1])
      for (const y of permutations[2])
        for (const zDigit of permutations[3]) {
          const values = [...weight, ...x, ...y, ...zDigit],
            pair = certificate.rejections[index++];
          requireProof(
            Array.isArray(pair) &&
              pair.length === 2 &&
              all.includes(pair[0]) &&
              all.includes(pair[1]) &&
              left.peer(pair[0], pair[1]) &&
              values[all.indexOf(pair[0])] === values[all.indexOf(pair[1])],
            "surviving-tridagon-core-permutation",
          );
        }
  requireProof(
    Array.isArray(certificate.locals) &&
      certificate.locals.length === 4 &&
      Array.isArray(certificate.joins) &&
      certificate.joins.length === 3,
    "incomplete-tridagon-tables",
  );
  certificate.locals.forEach((id: number, i: number) =>
    left.local(id, pattern.triples[i], [pattern.triples[i]]),
  );
  let table = certificate.locals[0];
  for (let i = 0; i < 3; i++) {
    left.joinPeers(certificate.joins[i], table, certificate.locals[i + 1]);
    table = certificate.joins[i];
  }
  requireProof(certificate.table === table, "substituted-tridagon-table");
  const result = left.node(table).conclusion;
  requireProof(result.kind === "table" && result.count > 0, "empty-tridagon-relation");
  const theorem = left.node(certificate.theorem, "table-project@1"),
    claim = clause(guardians.map((group) => ({ ...group, positive: true })));
  requireProof(
    sameValue(theorem.premises, [table]) && sameValue(theorem.conclusion, claim),
    "substituted-tridagon-guardian-proof",
  );
  if (guardians.length > 1)
    requireProof(
      proposal.effects.length === 0 && sameValue(proposal.proof.roots, [certificate.theorem]),
      "invalid-tridagon-clause-publication",
    );
  else {
    const guardian = guardians[0],
      placed = proposal.effects.filter((effect) => effect.kind === "place");
    requireProof(sameValue(placed, [{ kind: "place", ...guardian }]), "invalid-tridagon-placement");
    for (const effect of proposal.effects) {
      const roots = proposal.proof.roots.filter((id) =>
        sameValue(available.get(id)?.conclusion, {
          kind: "literal",
          value: { cell: effect.cell, symbol: effect.symbol, positive: effect.kind === "place" },
        }),
      );
      requireProof(roots.length > 0, "missing-tridagon-effect-root");
      for (const id of roots)
        if (effect.kind === "place")
          requireProof(id === certificate.theorem, "substituted-tridagon-placement-root");
        else {
          const root = left.node(id, "resolution@1");
          requireProof(
            root.premises.includes(certificate.theorem) &&
              root.premises.length === 2 &&
              effect.symbol === guardian.symbol &&
              left.peer(effect.cell, guardian.cell),
            "substituted-tridagon-peer-root",
          );
          const weak = left.node(
            defined(
              root.premises.find((premise) => premise !== certificate.theorem),
              "premis",
            ),
            "weak-link@1",
          );
          requireProof(
            sameValue(
              weak.conclusion,
              clause([
                { ...guardian, positive: false },
                { cell: effect.cell, symbol: effect.symbol, positive: false },
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
