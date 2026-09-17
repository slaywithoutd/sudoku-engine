import { matchingFacts } from "../state/source-index";
import type { ReadView } from "../state/types";
import type { DeductionProposal, ProofNode } from "../proof/types";
import { requireProof, sameValue } from "../proof/primitives";
import { validateFishGeometry } from "./fish-grammar";
import { ForcingLineage, checkForcingRoots } from "./forcing-grammar";
import type { KrakenPlan } from "./kraken";
import type { PathCertificate } from "./forcing-proof";

/** Fish geometry and chain grammar independently meet at each exact fin root. */
export function checkKrakenPattern(
  proposal: DeductionProposal,
  view: ReadView,
  nodes: ReadonlyMap<number, ProofNode>,
): void {
  const p = proposal.pattern as unknown as KrakenPlan & {
    alias: string;
    certificate: {
      assumption: number;
      fins: { fin: number; path: PathCertificate; domain: number }[];
      count: number;
      contradiction: number;
      root: number;
    };
  };
  requireProof(
    p.alias === "Kraken Fish" &&
      p.fish.size <= 4 &&
      ["Finned fish", "Sashimi fish", "Franken fish", "Mutant fish"].includes(p.fish.alias) &&
      p.fish.fins.length > 0,
    "kraken-profile",
  );
  const geometry = validateFishGeometry(view, p.fish),
    c = p.certificate,
    l = new ForcingLineage(view, nodes),
    z = p.fish.symbol;
  requireProof(
    sameValue(geometry.coefficients, p.incidence) &&
      p.target.symbol === z &&
      geometry.effects.some((e) => e.cell === p.target.cell) &&
      sameValue(proposal.effects, [{ kind: "remove", ...p.target }]),
    "kraken-target",
  );
  requireProof(
    c &&
      sameValue(
        c.fins.map((f) => f.fin),
        p.fish.fins,
      ) &&
      sameValue(
        p.finBranches.map((f) => f.fin),
        p.fish.fins,
      ),
    "kraken-incomplete-fins",
  );
  const a = l.node(c.assumption),
    scope = [a.id];
  requireProof(
    a.rule === "assume@1" &&
      a.scope.length === 0 &&
      sameValue(a.conclusion, { kind: "literal", value: { ...p.target, positive: true } }),
    "kraken-assumption",
  );
  for (const [i, fin] of p.finBranches.entries()) {
    requireProof(
      sameValue(fin.assumption, { ...p.target, positive: true }) && fin.path.length >= 1,
      "kraken-fin-assumption",
    );
    l.path(a.id, fin.path, c.fins[i].path, scope);
    requireProof(
      sameValue(l.node(c.fins[i].path.end).conclusion, {
        kind: "literal",
        value: { cell: fin.fin, symbol: z, positive: false },
      }),
      "kraken-fin-result",
    );
    const d = l.node(c.fins[i].domain);
    requireProof(
      d.rule === "domain-restrict@1" &&
        sameValue(d.scope, scope) &&
        sameValue(d.premises, [view.state.domainFacts[fin.fin], c.fins[i].path.end]),
      "kraken-fin-domain",
    );
  }
  const source = (h: string, symbol?: number) => {
    const cells = view.assembly.allDifferent.find((s) => s.id === h)!.cells;
    const f = matchingFacts(
      view,
      symbol === undefined ? { kind: "all-different", cells } : { kind: "cover", cells, symbol },
    ).find((f) => !f.openAssumptions.length);
    requireProof(f, "kraken-source");
    return f.id;
  };
  const covers = p.fish.bases.map((h) => ({ premise: source(h, z), coefficient: 1 })),
    capacities = p.fish.covers.map((h) => ({ premise: source(h), coefficient: 1 }));
  const count = l.node(c.count),
    expected = [
      ...covers.map((v) => v.premise),
      ...capacities.map((v) => v.premise),
      ...geometry.coefficients.flatMap((w, cell) =>
        w < 0 && !p.fish.fins.includes(cell) ? [view.state.domainFacts[cell]] : [],
      ),
      ...c.fins.map((f) => f.domain),
    ];
  requireProof(
    count.rule === "cover-count@1" &&
      sameValue(count.scope, scope) &&
      sameValue(count.parameters, { symbol: z, covers, capacities }) &&
      sameValue(count.premises, expected),
    "kraken-count-lineage",
  );
  const contradiction = l.node(c.contradiction),
    root = l.node(c.root);
  requireProof(
    contradiction.rule === "contradiction@1" &&
      sameValue(contradiction.scope, scope) &&
      sameValue(contradiction.premises, [a.id, count.id]) &&
      root.rule === "discharge@1" &&
      root.scope.length === 0 &&
      sameValue(root.premises, [a.id, contradiction.id]),
    "kraken-discharge",
  );
  checkForcingRoots(proposal, view, nodes, root.id);
}
