import type { ReadView, Literal } from "../state/types";
import type { DeductionProposal } from "../proof/types";
import { proposedClause } from "../proof/builder";
import { ForcingProof, bit, type ForcingLink } from "./forcing-proof";
import type { FishComponent } from "./fish-grammar";
export { krakenTechniques } from "./kraken-runtime";

export interface KrakenPlan {
  readonly fish: FishComponent;
  readonly target: { readonly cell: number; readonly symbol: number };
  readonly finBranches: readonly {
    readonly fin: number;
    readonly assumption: Literal;
    readonly path: readonly ForcingLink[];
  }[];
  readonly incidence: readonly number[];
}
/** Expand every fin path, then the same checked incidence primitive as T10. */
export function compileKraken(view: ReadView, plan: KrakenPlan): DeductionProposal {
  const proof = new ForcingProof(view),
    component = plan.fish,
    zDigit = component.symbol,
    target = plan.target;
  const assumption = proof.add("assume@1", [], proposedClause([{ ...target, positive: true }]));
  proof.scope = [assumption];
  const fins = plan.finBranches.map((fin) => {
    const path = proof.path(assumption, fin.path);
    const domain = proof.add("domain-restrict@1", [view.state.domainFacts[fin.fin], path.end], {
      kind: "domain",
      cell: fin.fin,
      mask: view.state.domains[fin.fin] & ~bit(zDigit),
    });
    return { fin: fin.fin, path, domain };
  });
  const covers = component.bases.map((house) => ({
    premise: proof.fact({ kind: "cover", cells: proof.house(house), symbol: zDigit }),
    coefficient: 1,
  }));
  const capacities = component.covers.map((house) => ({
    premise: proof.fact({ kind: "all-different", cells: proof.house(house) }),
    coefficient: 1,
  }));
  const domains = plan.incidence.flatMap((weight, cell) =>
    weight < 0 && !component.fins.includes(cell) ? [view.state.domainFacts[cell]] : [],
  );
  const count = proof.add(
    "cover-count@1",
    [
      ...covers.map((term) => term.premise),
      ...capacities.map((term) => term.premise),
      ...domains,
      ...fins.map((fin) => fin.domain),
    ],
    proposedClause([{ ...target, positive: false }]),
    { symbol: zDigit, covers, capacities },
  );
  const contradiction = proof.add("contradiction@1", [assumption, count], { kind: "false" });
  proof.scope = [];
  const root = proof.add(
    "discharge@1",
    [assumption, contradiction],
    proposedClause([{ ...target, positive: false }]),
  );
  return proof.finish(
    "c24@1",
    {
      ...plan,
      alias: "Kraken Fish",
      certificate: { assumption, fins, count, contradiction, root },
    },
    { kind: "remove", ...target },
    root,
  );
}
