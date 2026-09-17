import { matchingFacts } from "../state/source-index";
import type { ReadView } from "../state/types";
import type { DeductionProposal, ProofNode } from "../proof/types";
import { requireProof, sameValue } from "../proof/primitives";
import { validateFishGeometry } from "./fish-grammar";
import { ForcingLineage, checkForcingRoots } from "./forcing-grammar";
import type { KrakenPlan } from "./kraken";
import type { PathCertificate } from "./forcing-proof";
import { houseCells } from "../state/read";

/** Fish geometry and chain grammar independently meet at each exact fin root. */
export function checkKrakenPattern(
  proposal: DeductionProposal,
  view: ReadView,
  nodes: ReadonlyMap<number, ProofNode>,
): void {
  const pattern = proposal.pattern as unknown as KrakenPlan & {
    alias: string;
    certificate: {
      assumption: number;
      fins: { fin: number; path: PathCertificate; domain: number }[];
      count: number;
      contradiction: number;
      root: number;
    };
  };
  const certificate = pattern.certificate as (typeof pattern)["certificate"] | undefined;
  requireProof(
    pattern.alias === "Kraken Fish" &&
      pattern.fish.size <= 4 &&
      ["Finned fish", "Sashimi fish", "Franken fish", "Mutant fish"].includes(pattern.fish.alias) &&
      pattern.fish.fins.length > 0,
    "kraken-profile",
  );
  const geometry = validateFishGeometry(view, pattern.fish),
    lineage = new ForcingLineage(view, nodes),
    zDigit = pattern.fish.symbol;
  requireProof(
    sameValue(geometry.coefficients, pattern.incidence) &&
      pattern.target.symbol === zDigit &&
      geometry.effects.some((effect) => effect.cell === pattern.target.cell) &&
      sameValue(proposal.effects, [{ kind: "remove", ...pattern.target }]),
    "kraken-target",
  );
  requireProof(
    certificate &&
      sameValue(
        certificate.fins.map((fin) => fin.fin),
        pattern.fish.fins,
      ) &&
      sameValue(
        pattern.finBranches.map((branch) => branch.fin),
        pattern.fish.fins,
      ),
    "kraken-incomplete-fins",
  );
  const node = lineage.node(certificate.assumption),
    scope = [node.id];
  requireProof(
    node.rule === "assume@1" &&
      node.scope.length === 0 &&
      sameValue(node.conclusion, { kind: "literal", value: { ...pattern.target, positive: true } }),
    "kraken-assumption",
  );
  for (const [i, fin] of pattern.finBranches.entries()) {
    requireProof(
      sameValue(fin.assumption, { ...pattern.target, positive: true }) && fin.path.length >= 1,
      "kraken-fin-assumption",
    );
    lineage.path(node.id, fin.path, certificate.fins[i].path, scope);
    requireProof(
      sameValue(lineage.node(certificate.fins[i].path.end).conclusion, {
        kind: "literal",
        value: { cell: fin.fin, symbol: zDigit, positive: false },
      }),
      "kraken-fin-result",
    );
    const d = lineage.node(certificate.fins[i].domain);
    requireProof(
      d.rule === "domain-restrict@1" &&
        sameValue(d.scope, scope) &&
        sameValue(d.premises, [view.state.domainFacts[fin.fin], certificate.fins[i].path.end]),
      "kraken-fin-domain",
    );
  }
  const source = (house: string, symbol?: number) => {
    const cells = houseCells(view, house);
    const fact = matchingFacts(
      view,
      symbol === undefined ? { kind: "all-different", cells } : { kind: "cover", cells, symbol },
    ).find((fact) => !fact.openAssumptions.length);
    requireProof(fact, "kraken-source");
    return fact.id;
  };
  const covers = pattern.fish.bases.map((house) => ({
      premise: source(house, zDigit),
      coefficient: 1,
    })),
    capacities = pattern.fish.covers.map((house) => ({ premise: source(house), coefficient: 1 }));
  const count = lineage.node(certificate.count),
    expected = [
      ...covers.map((value) => value.premise),
      ...capacities.map((value) => value.premise),
      ...geometry.coefficients.flatMap((weight, cell) =>
        weight < 0 && !pattern.fish.fins.includes(cell) ? [view.state.domainFacts[cell]] : [],
      ),
      ...certificate.fins.map((fin) => fin.domain),
    ];
  requireProof(
    count.rule === "cover-count@1" &&
      sameValue(count.scope, scope) &&
      sameValue(count.parameters, { symbol: zDigit, covers, capacities }) &&
      sameValue(count.premises, expected),
    "kraken-count-lineage",
  );
  const contradiction = lineage.node(certificate.contradiction),
    root = lineage.node(certificate.root);
  requireProof(
    contradiction.rule === "contradiction@1" &&
      sameValue(contradiction.scope, scope) &&
      sameValue(contradiction.premises, [node.id, count.id]) &&
      root.rule === "discharge@1" &&
      root.scope.length === 0 &&
      sameValue(root.premises, [node.id, contradiction.id]),
    "kraken-discharge",
  );
  checkForcingRoots(proposal, view, nodes, root.id);
}
