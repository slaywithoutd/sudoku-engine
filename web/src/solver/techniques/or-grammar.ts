import type { ReadView } from "../state/types";
import type { DeductionProposal, ProofNode } from "../proof/types";
import { clause, requireProof, sameValue } from "../proof/primitives";
import {
  GeneralizedLineage,
  checkGeneralizedPattern,
} from "./generalized-grammar";
import { checkForcingRoots } from "./forcing-grammar";
import type { OrForcingPlan, OrForcingCertificate } from "./or-forcing";

/** C28 has two mandatory proof structures; neither may borrow the other's label. */
export function checkOrPattern(
  proposal: DeductionProposal,
  view: ReadView,
  nodes: ReadonlyMap<number, ProofNode>,
): void {
  if (
    (proposal.pattern as { grammar?: string }).grammar === "inserted-or-whip"
  ) {
    checkGeneralizedPattern(proposal, view, nodes);
    return;
  }
  const p = proposal.pattern as unknown as OrForcingPlan & {
      certificate: OrForcingCertificate;
    },
    l = new GeneralizedLineage(view, nodes),
    c = p.certificate;
  requireProof(
    p.kind === "or-forcing" && p.alias === "OR-k forcing" && c,
    "or-forcing-alias",
  );
  const alternatives = l.source(p.source, false),
    sort = (
      a: { cell: number; symbol: number; positive: boolean },
      b: typeof a,
    ) =>
      a.cell - b.cell ||
      a.symbol - b.symbol ||
      Number(a.positive) - Number(b.positive);
  requireProof(
    sameValue([...p.alternatives].sort(sort), alternatives) &&
      p.branches.length === alternatives.length &&
      c.branches.length === alternatives.length,
    "or-complete-cases",
  );
  const seen = new Set<string>();
  for (const [i, branch] of p.branches.entries()) {
    const proof = c.branches[i],
      scope = [proof.assumption],
      key = JSON.stringify(branch.assumption);
    requireProof(
      !seen.has(key) &&
        alternatives.some((a) => sameValue(a, branch.assumption)),
      "or-case-identity",
    );
    seen.add(key);
    l.exact(proof.assumption, "assume@1", [], [], clause([branch.assumption]));
    if (branch.generalized) {
      requireProof(
        branch.assumption.positive &&
          proof.generalized &&
          proof.paths.length === 0 &&
          (!branch.paths || branch.paths.length === 0) &&
          branch.generalized.grammar !== "inserted-or-whip" &&
          branch.generalized.mode === undefined &&
          sameValue(branch.generalized.target, [
            branch.assumption.cell,
            branch.assumption.symbol,
          ]),
        "or-generalized-branch",
      );
      if (branch.generalized.consequence)
        requireProof(
          branch.result !== "false" &&
            !branch.result.positive &&
            sameValue(branch.generalized.consequence, [
              branch.result.cell,
              branch.result.symbol,
            ]) &&
            branch.generalized.positions.at(-1)?.right !== null,
          "or-generalized-consequence",
        );
      else
        requireProof(branch.result === "false", "or-generalized-contradiction");
      requireProof(
        proof.generalized.assumption === proof.assumption,
        "or-generalized-assumption",
      );
      l.positions(branch.generalized, proof.generalized, scope);
      requireProof(
        proof.result === proof.generalized.contradiction &&
          sameValue(
            l.node(proof.result).conclusion,
            branch.result === "false"
              ? { kind: "false" }
              : clause([branch.result]),
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
        l.lineage.path(proof.assumption, path, proof.paths[j], scope),
      );
      if (branch.result === "false")
        l.exact(
          proof.result,
          "contradiction@1",
          proof.paths.map((p) => p.end),
          scope,
          { kind: "false" },
        );
      else
        requireProof(
          proof.result === proof.paths[0].end &&
            sameValue(l.node(proof.result).conclusion, clause([branch.result])),
          "or-branch-result",
        );
    }
  }
  const ordered = p.branches
    .map((b, i) => ({ a: b.assumption, c: c.branches[i] }))
    .sort((a, b) => sort(a.a, b.a));
  const effect = proposal.effects[0];
  requireProof(
    effect && (effect.kind === "place" || proposal.effects.length === 1),
    "or-effects",
  );
  l.exact(
    c.root,
    "cases@1",
    [p.source, ...ordered.flatMap(({ c }) => [c.assumption, c.result])],
    [],
    clause([
      {
        cell: effect.cell,
        symbol: effect.symbol,
        positive: effect.kind === "place",
      },
    ]),
  );
  checkForcingRoots(proposal, view, nodes, c.root);
}
