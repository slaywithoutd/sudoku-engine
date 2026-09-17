import { uniqueSourceFacts } from "../state/source-index";
import type { ReadView, Literal } from "../state/types";
import type { DeductionProposal, Effect } from "../proof/types";
import type { WorkspaceReservation } from "../indexes/workspace";
import {
  uniqueAuthorityEvidenceId,
  uniqueAuthorityMatches,
  type UniqueAuthority,
} from "../conditional";
import { proposedClause } from "../proof/builder";
import { ForcingProof, opposite, type ForcingLink, type PathCertificate } from "./forcing-proof";
import { symbolMask } from "../state/read";
import { defined } from "../invariants";

export interface UniqueGeometry {
  readonly row: "U01" | "U02" | "U03" | "U04" | "U05";
  readonly kind:
    | "type1"
    | "type2"
    | "type3"
    | "type4"
    | "type5"
    | "type6"
    | "hidden"
    | "avoidable1"
    | "avoidable2"
    | "extended"
    | "loop"
    | "bug";
  readonly alias: string;
  readonly cells: readonly number[];
  readonly coreMasks: readonly number[];
  readonly permutation: readonly number[] | null;
  readonly guardians: readonly Literal[];
  readonly loopOrder: readonly number[];
  readonly auxiliaryCells: readonly number[];
  readonly subsetHouse: string | null;
  readonly strongSymbol: number | null;
  readonly strongHouses: readonly string[];
  readonly causalHouses: readonly string[];
}
export interface UniqueBranch {
  readonly assumption: Literal;
  readonly result: Literal | "false";
  readonly paths: readonly (readonly ForcingLink[])[];
}
export interface UniquePlan {
  readonly geometry: UniqueGeometry;
  readonly consequence:
    | { readonly kind: "cases"; readonly branches: readonly UniqueBranch[] }
    | { readonly kind: "denial"; readonly paths: readonly (readonly ForcingLink[])[] };
  readonly companion?: { readonly effect: Effect; readonly consequence: UniquePlan["consequence"] };
}
export interface UniqueCertificate {
  readonly trade: number;
  readonly branches: readonly {
    readonly assumption: number;
    readonly paths: readonly PathCertificate[];
    readonly result: number;
  }[];
  readonly root: number;
  readonly companion?: UniqueCertificate;
}

/** Shared-path composition within ONE assumption; siblings never share scoped nodes. */
function paths(
  proof: ForcingProof,
  assumption: number,
  recipes: readonly (readonly ForcingLink[])[],
): PathCertificate[] {
  const shared = new Map<string, { clause: number; root: number }>();
  return recipes.map((path) => {
    if (!path.length) return proof.path(assumption, path);
    const clauses: number[] = [],
      links: number[] = [];
    let prior = assumption;
    for (const edge of path) {
      const key = `${prior}:${JSON.stringify(edge)}`;
      let found = shared.get(key);
      if (!found) {
        const clause = proof.edge(edge),
          root = proof.add("resolution@1", [prior, clause], proposedClause([edge.to]));
        found = { clause, root };
        shared.set(key, found);
      }
      clauses.push(found.clause);
      links.push(found.root);
      prior = found.root;
    }
    return { clauses, links, end: prior };
  });
}

/** Untrusted syntax only. Authority is rechecked by primitive, named and commit gates. */
export function compileUnique(
  view: ReadView,
  plan: UniquePlan,
  effect: Effect,
  authority: UniqueAuthority,
  lease?: WorkspaceReservation,
): DeductionProposal {
  if (!uniqueAuthorityMatches(authority, view)) throw Error("missing-unique-authority");
  const proof = new ForcingProof(view, lease),
    geometry = plan.geometry;
  const selected = new Set(view.state.domainFacts);
  const originals = uniqueSourceFacts(view);
  if (originals.length > 1105) throw Error("proof-import-limit");
  for (const fact of originals) selected.add(fact.id);
  const ids = [...selected],
    groups: number[] = [];
  for (let n = 0; n < ids.length; n += 32) {
    const group = ids.slice(n, n + 32);
    groups.push(
      proof.add("conjunction@1", group, {
        kind: "and",
        terms: group.map((id) => defined(view.facts.get(id), "fact").proposition),
      }),
    );
  }
  const trade = proof.add("unique-transform@1", groups, proposedClause(geometry.guardians), {
    cells: geometry.cells,
    coreMasks: geometry.coreMasks,
    permutation: geometry.permutation,
    evidenceId: defined(uniqueAuthorityEvidenceId(authority), "uniqueAuthorityEvidenceId"),
  });
  const derive = (consequence: UniquePlan["consequence"], effect: Effect): UniqueCertificate => {
    proof.scope = [];
    const target: Literal = {
      cell: effect.cell,
      symbol: effect.symbol,
      positive: effect.kind === "place",
    };
    let root: number;
    const branches: { assumption: number; paths: PathCertificate[]; result: number }[] = [];
    if (consequence.kind === "denial") {
      const assumption = proof.add("assume@1", [], proposedClause([opposite(target)]));
      proof.scope = [assumption];
      const proofs = paths(proof, assumption, consequence.paths);
      const result = proof.add("contradiction@1", [trade, ...proofs.map((path) => path.end)], {
        kind: "false",
      });
      branches.push({ assumption, paths: proofs, result });
      proof.scope = [];
      root = proof.add("discharge@1", [assumption, result], proposedClause([target]));
    } else {
      for (const branch of consequence.branches) {
        proof.scope = [];
        const assumption = proof.add("assume@1", [], proposedClause([branch.assumption]));
        proof.scope = [assumption];
        const proofs = paths(proof, assumption, branch.paths);
        const result =
          branch.result === "false"
            ? proof.add(
                "contradiction@1",
                proofs.map((path) => path.end),
                { kind: "false" },
              )
            : proofs[0].end;
        branches.push({ assumption, paths: proofs, result });
      }
      proof.scope = [];
      const order = consequence.branches
        .map((branch, i) => ({ branch, proof: branches[i] }))
        .sort(
          (left, right) =>
            left.branch.assumption.cell - right.branch.assumption.cell ||
            left.branch.assumption.symbol - right.branch.assumption.symbol,
        );
      root = proof.add(
        "cases@1",
        [trade, ...order.flatMap(({ proof }) => [proof.assumption, proof.result])],
        proposedClause([target]),
      );
    }
    return { trade, branches, root };
  };
  const certificate = derive(plan.consequence, effect);
  if (plan.companion) {
    const companion = derive(plan.companion.consequence, plan.companion.effect),
      effects = [effect, plan.companion.effect],
      roots = [certificate.root, companion.root];
    for (const [i, item] of effects.entries())
      roots.push(
        proof.add("domain-restrict@1", [view.state.domainFacts[item.cell], roots[i]], {
          kind: "domain",
          cell: item.cell,
          mask: view.state.domains[item.cell] & ~symbolMask(item.symbol),
        }),
      );
    return proof.bundle(
      `${geometry.row.toLowerCase()}@1`,
      { ...plan, certificate: { ...certificate, companion } },
      effects,
      roots,
    );
  }
  return proof.finish(
    `${geometry.row.toLowerCase()}@1`,
    { ...plan, certificate },
    effect,
    certificate.root,
  );
}
