import type { ReadView } from "../state/types";
import type { DeductionProposal, ProofNode } from "../proof/types";
import { domainAssertion, requireProof, sameValue } from "../proof/primitives";
import { checkForcingRoots } from "./forcing-grammar";
import type { NetBranchCertificate } from "./nets";

/** Bounded net grammar: basic domain/cover/Hall reasoning and scalar resolution.
 * No relation tables, exact primitives, recursive solver calls or caller-issued facts.
 */
export function checkNetPattern(
  proposal: DeductionProposal,
  view: ReadView,
  nodes: ReadonlyMap<number, ProofNode>,
): void {
  const p = proposal.pattern as unknown as {
    kind: string;
    mode: string;
    alias: string;
    branch: NetBranchCertificate;
    root: number;
  };
  requireProof(
    p.kind === "net" &&
      ["static", "dynamic", "nested"].includes(p.mode) &&
      p.alias ===
        (p.mode === "nested"
          ? "Nested forcing"
          : p.mode === "dynamic"
            ? "Dynamic forcing nets"
            : "Static forcing nets"),
    "net-profile",
  );
  const allowed = new Set([
    "assume@1",
    "domain-restrict@1",
    "support@1",
    "cover-clause@1",
    "weak-link@1",
    "resolution@1",
    "hall@1",
    "contradiction@1",
    "cases@1",
    "discharge@1",
  ]);
  const branches = new Set<number>();
  let fanIn = false,
    dynamic = false,
    maxDepth = 0;
  const taint = new Map<number, boolean>();
  const depends = (id: number): boolean => {
    if (view.facts.has(id)) return view.facts.get(id)!.openAssumptions.length > 0;
    const cached = taint.get(id);
    if (cached !== undefined) return cached;
    const n = nodes.get(id)!;
    const value = n.rule === "assume@1" || n.premises.some(depends);
    taint.set(id, value);
    return value;
  };
  const check = (c: NetBranchCertificate, parent: readonly number[]) => {
    requireProof(parent.length < 2, "net-depth-out-of-profile");
    const a = nodes.get(c.assumption),
      r = nodes.get(c.result),
      scope = [...parent, c.assumption];
    requireProof(
      a?.rule === "assume@1" &&
        sameValue(a.scope, parent) &&
        r &&
        sameValue(r.scope, scope) &&
        r.conclusion.kind === "false" &&
        !branches.has(a.id),
      "net-branch-lineage",
    );
    branches.add(a.id);
    maxDepth = Math.max(maxDepth, scope.length);
    const local = proposal.proof.nodes.filter(
      (n) =>
        sameValue(n.scope, scope) &&
        ["resolution@1", "hall@1", "cover-clause@1", "contradiction@1", "cases@1"].includes(n.rule),
    );
    requireProof(local.length <= 128, "net-node-out-of-profile");
    if (c.children.length) {
      requireProof(
        c.children.length >= 2 &&
          c.children.length <= 9 &&
          r.rule === "cases@1" &&
          sameValue(r.premises, [c.cover, ...c.children.flatMap((v) => [v.assumption, v.result])]),
        "net-incomplete-cases",
      );
      const cover = nodes.get(c.cover!);
      requireProof(
        cover?.rule === "cover-clause@1" &&
          sameValue(cover.scope, scope) &&
          cover.premises.length === 1 &&
          domainAssertion(nodes.get(cover.premises[0])!.conclusion),
        "net-cell-alternatives",
      );
      for (const child of c.children) check(child, scope);
    } else
      requireProof(c.cover === null && r.rule === "contradiction@1", "net-terminal-contradiction");
  };
  check(p.branch, []);
  for (const node of proposal.proof.nodes) {
    requireProof(
      allowed.has(node.rule) &&
        node.scope.length <= 2 &&
        node.scope.every((id) => branches.has(id)),
      "net-primitive-out-of-profile",
    );
    if (node.rule === "assume@1") requireProof(branches.has(node.id), "net-unrelated-assumption");
    if (node.rule === "hall@1") {
      requireProof(node.premises.length >= 3 && node.premises.length <= 5, "net-subset-bound");
      const s = nodes.get(node.premises[0])!.conclusion;
      requireProof(
        s.kind === "all-different" &&
          view.assembly.allDifferent.some((h) => sameValue(h.cells, s.cells)),
        "net-subset-scope",
      );
      fanIn = true;
    }
    if (node.rule === "resolution@1") {
      const sources = node.premises.map((id) => nodes.get(id)!);
      if (sources.every((n) => depends(n.id) && n.rule !== "assume@1")) fanIn = true;
      for (const s of sources)
        if (
          s.rule === "cover-clause@1" &&
          s.conclusion.kind === "clause" &&
          s.conclusion.alternatives.length === 2
        ) {
          const domain = nodes.get(s.premises[0]);
          const d = domain && domainAssertion(domain.conclusion);
          if (
            d &&
            domain!.scope.length &&
            view.assembly.problem.symbols.filter(
              (symbol) => view.state.domains[d.cell] & (1 << (symbol - 1)),
            ).length > 2
          )
            dynamic = true;
          if (domain?.rule === "support@1") {
            const base = nodes.get(domain.premises[0])!.conclusion;
            if (
              base.kind === "cover" &&
              base.cells.filter((cell) => view.state.domains[cell] & (1 << (base.symbol - 1)))
                .length > 2 &&
              domain.premises.slice(1).some((id) => nodes.get(id)!.scope.length > 0)
            )
              dynamic = true;
          }
          if (p.mode === "static")
            requireProof(
              domain?.rule === "support@1"
                ? domain.premises.slice(1).every((id) => view.state.domainFacts.includes(id))
                : !!d && s.premises[0] === view.state.domainFacts[d.cell],
              "static-rebuilt-link",
            );
        }
    }
  }
  requireProof(fanIn, "net-missing-convergence");
  requireProof(p.mode === "nested" ? maxDepth === 2 : maxDepth === 1, "net-nesting-label");
  if (p.mode === "dynamic") requireProof(dynamic, "net-missing-dynamic-link");
  const root = nodes.get(p.root);
  requireProof(
    root?.rule === "discharge@1" &&
      root.scope.length === 0 &&
      sameValue(root.premises, [p.branch.assumption, p.branch.result]),
    "net-root-lineage",
  );
  checkForcingRoots(proposal, view, nodes, p.root);
}
