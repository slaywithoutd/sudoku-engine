import type { ReadView } from "../state/types";
import type { DeductionProposal, ProofNode } from "../proof/types";
import { clause, requireProof, sameValue } from "../proof/primitives";
import { GeneralizedLineage, checkGeneralizedPattern } from "./generalized-grammar";
import { checkForcingRoots } from "./forcing-grammar";
import type { OrForcingPlan, OrForcingCertificate } from "./or-forcing";
import { claimed } from "../invariants";

/** C28 has two mandatory proof structures; neither may borrow the other's label. */
export function checkOrPattern(
  proposal: DeductionProposal,
  view: ReadView,
  nodes: ReadonlyMap<number, ProofNode>,
): void {
  if ((proposal.pattern as { grammar?: string }).grammar === "inserted-or-whip") {
    checkGeneralizedPattern(proposal, view, nodes);
    return;
  }
  const pattern = proposal.pattern as unknown as OrForcingPlan & {
      certificate?: OrForcingCertificate;
    },
    lineage = new GeneralizedLineage(view, nodes),
    certificate = pattern.certificate;
  requireProof(
    claimed(pattern).kind === "or-forcing" &&
      claimed(pattern).alias === "OR-k forcing" &&
      certificate,
    "or-forcing-alias",
  );
  const alternatives = lineage.source(pattern.source, false),
    sort = (left: { cell: number; symbol: number; positive: boolean }, right: typeof left) =>
      left.cell - right.cell ||
      left.symbol - right.symbol ||
      Number(left.positive) - Number(right.positive);
  requireProof(
    sameValue([...pattern.alternatives].sort(sort), alternatives) &&
      pattern.branches.length === alternatives.length &&
      certificate.branches.length === alternatives.length,
    "or-complete-cases",
  );
  const seen = new Set<string>();
  for (const [i, branch] of pattern.branches.entries()) {
    const proof = certificate.branches[i],
      scope = [proof.assumption],
      key = JSON.stringify(branch.assumption);
    requireProof(
      !seen.has(key) && alternatives.some((a) => sameValue(a, branch.assumption)),
      "or-case-identity",
    );
    seen.add(key);
    lineage.exact(proof.assumption, "assume@1", [], [], clause([branch.assumption]));
    if (branch.generalized) {
      requireProof(
        branch.assumption.positive &&
          proof.generalized &&
          proof.paths.length === 0 &&
          (!branch.paths || branch.paths.length === 0) &&
          branch.generalized.grammar !== "inserted-or-whip" &&
          branch.generalized.mode === undefined &&
          sameValue(branch.generalized.target, [branch.assumption.cell, branch.assumption.symbol]),
        "or-generalized-branch",
      );
      if (branch.generalized.consequence)
        requireProof(
          branch.result !== "false" &&
            !branch.result.positive &&
            sameValue(branch.generalized.consequence, [branch.result.cell, branch.result.symbol]) &&
            branch.generalized.positions.at(-1)?.right !== null,
          "or-generalized-consequence",
        );
      else requireProof(branch.result === "false", "or-generalized-contradiction");
      requireProof(proof.generalized.assumption === proof.assumption, "or-generalized-assumption");
      lineage.positions(branch.generalized, proof.generalized, scope);
      requireProof(
        proof.result === proof.generalized.contradiction &&
          sameValue(
            lineage.node(proof.result).conclusion,
            branch.result === "false" ? { kind: "false" } : clause([branch.result]),
          ),
        "or-generalized-result",
      );
    } else {
      requireProof(
        proof.generalized === null &&
          branch.paths &&
          branch.paths.length === (branch.result === "false" ? 2 : 1) &&
          proof.paths.length === branch.paths.length &&
          branch.paths.reduce((n, path) => n + path.length, 0) <= 24,
        "or-static-bound",
      );
      branch.paths.forEach((path, j) =>
        lineage.lineage.path(proof.assumption, path, proof.paths[j], scope),
      );
      if (branch.result === "false")
        lineage.exact(
          proof.result,
          "contradiction@1",
          proof.paths.map((certificate) => certificate.end),
          scope,
          { kind: "false" },
        );
      else
        requireProof(
          proof.result === proof.paths[0].end &&
            sameValue(lineage.node(proof.result).conclusion, clause([branch.result])),
          "or-branch-result",
        );
    }
  }
  const ordered = pattern.branches
    .map((right, i) => ({ a: right.assumption, c: certificate.branches[i] }))
    .sort((left, right) => sort(left.a, right.a));
  const effect = proposal.effects.at(0);
  requireProof(effect && (effect.kind === "place" || proposal.effects.length === 1), "or-effects");
  lineage.exact(
    certificate.root,
    "cases@1",
    [pattern.source, ...ordered.flatMap(({ c: branch }) => [branch.assumption, branch.result])],
    [],
    clause([
      {
        cell: effect.cell,
        symbol: effect.symbol,
        positive: effect.kind === "place",
      },
    ]),
  );
  checkForcingRoots(proposal, view, nodes, certificate.root);
}
