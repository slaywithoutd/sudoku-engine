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
  b: ForcingProof,
  assumption: number,
  recipes: readonly (readonly ForcingLink[])[],
): PathCertificate[] {
  const shared = new Map<string, { clause: number; root: number }>();
  return recipes.map((path) => {
    if (!path.length) return b.path(assumption, path);
    const clauses: number[] = [],
      links: number[] = [];
    let prior = assumption;
    for (const edge of path) {
      const key = `${prior}:${JSON.stringify(edge)}`;
      let found = shared.get(key);
      if (!found) {
        const clause = b.edge(edge),
          root = b.add("resolution@1", [prior, clause], proposedClause([edge.to]));
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
  const b = new ForcingProof(view, lease),
    g = plan.geometry;
  const selected = new Set(view.state.domainFacts);
  const originals = uniqueSourceFacts(view);
  if (originals.length > 1105) throw Error("proof-import-limit");
  for (const fact of originals) selected.add(fact.id);
  const ids = [...selected],
    groups: number[] = [];
  for (let n = 0; n < ids.length; n += 32) {
    const group = ids.slice(n, n + 32);
    groups.push(
      b.add("conjunction@1", group, {
        kind: "and",
        terms: group.map((id) => view.facts.get(id)!.proposition),
      }),
    );
  }
  const trade = b.add("unique-transform@1", groups, proposedClause(g.guardians), {
    cells: g.cells,
    coreMasks: g.coreMasks,
    permutation: g.permutation,
    evidenceId: uniqueAuthorityEvidenceId(authority)!,
  });
  const derive = (consequence: UniquePlan["consequence"], effect: Effect): UniqueCertificate => {
    b.scope = [];
    const target: Literal = {
      cell: effect.cell,
      symbol: effect.symbol,
      positive: effect.kind === "place",
    };
    let root: number;
    const branches: { assumption: number; paths: PathCertificate[]; result: number }[] = [];
    if (consequence.kind === "denial") {
      const assumption = b.add("assume@1", [], proposedClause([opposite(target)]));
      b.scope = [assumption];
      const proofs = paths(b, assumption, consequence.paths);
      const result = b.add("contradiction@1", [trade, ...proofs.map((p) => p.end)], {
        kind: "false",
      });
      branches.push({ assumption, paths: proofs, result });
      b.scope = [];
      root = b.add("discharge@1", [assumption, result], proposedClause([target]));
    } else {
      for (const branch of consequence.branches) {
        b.scope = [];
        const assumption = b.add("assume@1", [], proposedClause([branch.assumption]));
        b.scope = [assumption];
        const proofs = paths(b, assumption, branch.paths);
        const result =
          branch.result === "false"
            ? b.add(
                "contradiction@1",
                proofs.map((p) => p.end),
                { kind: "false" },
              )
            : proofs[0].end;
        branches.push({ assumption, paths: proofs, result });
      }
      b.scope = [];
      const order = consequence.branches
        .map((branch, i) => ({ branch, proof: branches[i] }))
        .sort(
          (a, b) =>
            a.branch.assumption.cell - b.branch.assumption.cell ||
            a.branch.assumption.symbol - b.branch.assumption.symbol,
        );
      root = b.add(
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
    for (const [i, e] of effects.entries())
      roots.push(
        b.add("domain-restrict@1", [view.state.domainFacts[e.cell], roots[i]], {
          kind: "domain",
          cell: e.cell,
          mask: view.state.domains[e.cell] & ~symbolMask(e.symbol),
        }),
      );
    return b.bundle(
      `${g.row.toLowerCase()}@1`,
      { ...plan, certificate: { ...certificate, companion } },
      effects,
      roots,
    );
  }
  return b.finish(`${g.row.toLowerCase()}@1`, { ...plan, certificate }, effect, certificate.root);
}
