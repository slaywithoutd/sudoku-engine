import type { ReadView, Literal } from "../state/types";
import type { DeductionProposal, Effect } from "../proof/types";
import type { WorkspaceReservation } from "../indexes/workspace";
import { proposedClause } from "../proof/builder";
import {
  ForcingProof,
  type ForcingLink,
  type PathCertificate,
} from "./forcing-proof";
import {
  GeneralizedProof,
  type GeneralizedPlan,
  type GeneralizedCertificate,
} from "./generalized-chains";

export interface OrBranch {
  readonly assumption: Literal;
  readonly result: Literal | "false";
  readonly paths?: readonly (readonly ForcingLink[])[];
  /** Under an OR alternative, a generalized contradiction refutes that case.
   * The target is exactly the case literal; no second assumption is introduced.
   */
  readonly generalized?: GeneralizedPlan;
}
export interface OrForcingPlan {
  readonly kind: "or-forcing";
  readonly source: number;
  readonly alternatives: readonly Literal[];
  readonly branches: readonly OrBranch[];
  readonly alias?: string;
}
export interface OrBranchCertificate {
  readonly assumption: number;
  readonly result: number;
  readonly paths: readonly PathCertificate[];
  readonly generalized: Omit<GeneralizedCertificate, "root"> | null;
}
export interface OrForcingCertificate {
  readonly branches: readonly OrBranchCertificate[];
  readonly root: number;
}

/** Complete signed OR case assembly. The source is an imported checked fact,
 * never a caller list or automatically XOR cover. Independent admission checks
 * every case, same effect and exact source identity at the owned revision.
 */
export function compileOrForcing(
  view: ReadView,
  plan: OrForcingPlan,
  effect: Effect,
  lease?: WorkspaceReservation,
): DeductionProposal {
  const b = new ForcingProof(view, lease),
    branches: OrBranchCertificate[] = [];
  for (const branch of plan.branches) {
    b.scope = [];
    const assumption = b.add(
      "assume@1",
      [],
      proposedClause([branch.assumption]),
    );
    b.scope = [assumption];
    let result: number,
      generalized: OrBranchCertificate["generalized"] = null;
    const paths = (branch.paths ?? []).map((path) => b.path(assumption, path));
    if (branch.generalized) {
      generalized = new GeneralizedProof(view, b).positions(
        branch.generalized,
        assumption,
      );
      result = generalized.contradiction;
    } else
      result =
        branch.result === "false"
          ? b.add(
              "contradiction@1",
              paths.map((p) => p.end),
              { kind: "false" },
            )
          : paths[0].end;
    branches.push({ assumption, result, paths, generalized });
  }
  b.scope = [];
  const ordered = plan.branches
    .map((branch, i) => ({ branch, c: branches[i] }))
    .sort(
      (a, b) =>
        a.branch.assumption.cell - b.branch.assumption.cell ||
        a.branch.assumption.symbol - b.branch.assumption.symbol ||
        Number(a.branch.assumption.positive) -
          Number(b.branch.assumption.positive),
    );
  const root = b.add(
    "cases@1",
    [plan.source, ...ordered.flatMap(({ c }) => [c.assumption, c.result])],
    proposedClause([
      {
        cell: effect.cell,
        symbol: effect.symbol,
        positive: effect.kind === "place",
      },
    ]),
  );
  return b.finish(
    "c28@1",
    {
      ...plan,
      alias: plan.alias ?? "OR-k forcing",
      certificate: { branches, root } satisfies OrForcingCertificate,
    },
    effect,
    root,
  );
}
