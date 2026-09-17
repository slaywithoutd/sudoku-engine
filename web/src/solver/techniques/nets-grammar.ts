import type { ReadView } from "../state/types";
import type { DeductionProposal, ProofNode } from "../proof/types";
import { domainAssertion, requireProof, sameValue } from "../proof/primitives";
import { checkForcingRoots } from "./forcing-grammar";
import type { NetBranchCertificate } from "./nets";
import { symbolMask } from "../state/read";
import { defined } from "../invariants";

/** Bounded net grammar: basic domain/cover/Hall reasoning and scalar resolution.
 * No relation tables, exact primitives, recursive solver calls or caller-issued facts.
 */
export function checkNetPattern(
  proposal: DeductionProposal,
  view: ReadView,
  nodes: ReadonlyMap<number, ProofNode>,
): void {
  const pattern = proposal.pattern as unknown as {
    kind: string;
    mode: string;
    alias: string;
    branch: NetBranchCertificate;
    root: number;
  };
  requireProof(
    pattern.kind === "net" &&
      ["static", "dynamic", "nested"].includes(pattern.mode) &&
      pattern.alias ===
        (pattern.mode === "nested"
          ? "Nested forcing"
          : pattern.mode === "dynamic"
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
    if (view.facts.has(id)) return defined(view.facts.get(id), "fact").openAssumptions.length > 0;
    const cached = taint.get(id);
    if (cached !== undefined) return cached;
    const n = defined(nodes.get(id), "node");
    const value = n.rule === "assume@1" || n.premises.some(depends);
    taint.set(id, value);
    return value;
  };
  const check = (branch: NetBranchCertificate, parent: readonly number[]) => {
    requireProof(parent.length < 2, "net-depth-out-of-profile");
    const left = nodes.get(branch.assumption),
      node = nodes.get(branch.result),
      scope = [...parent, branch.assumption];
    requireProof(
      left?.rule === "assume@1" &&
        sameValue(left.scope, parent) &&
        node &&
        sameValue(node.scope, scope) &&
        node.conclusion.kind === "false" &&
        !branches.has(left.id),
      "net-branch-lineage",
    );
    branches.add(left.id);
    maxDepth = Math.max(maxDepth, scope.length);
    const local = proposal.proof.nodes.filter(
      (n) =>
        sameValue(n.scope, scope) &&
        ["resolution@1", "hall@1", "cover-clause@1", "contradiction@1", "cases@1"].includes(n.rule),
    );
    requireProof(local.length <= 128, "net-node-out-of-profile");
    if (branch.children.length) {
      requireProof(
        branch.children.length >= 2 &&
          branch.children.length <= 9 &&
          node.rule === "cases@1" &&
          sameValue(node.premises, [
            branch.cover,
            ...branch.children.flatMap((value) => [value.assumption, value.result]),
          ]),
        "net-incomplete-cases",
      );
      const cover = nodes.get(defined(branch.cover, "cover"));
      requireProof(
        cover?.rule === "cover-clause@1" &&
          sameValue(cover.scope, scope) &&
          cover.premises.length === 1 &&
          domainAssertion(defined(nodes.get(cover.premises[0]), "node").conclusion),
        "net-cell-alternatives",
      );
      for (const child of branch.children) check(child, scope);
    } else
      requireProof(
        branch.cover === null && node.rule === "contradiction@1",
        "net-terminal-contradiction",
      );
  };
  check(pattern.branch, []);
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
      const proposition = defined(nodes.get(node.premises[0]), "node").conclusion;
      requireProof(
        proposition.kind === "all-different" &&
          view.assembly.allDifferent.some((house) => sameValue(house.cells, proposition.cells)),
        "net-subset-scope",
      );
      fanIn = true;
    }
    if (node.rule === "resolution@1") {
      const sources = node.premises.map((id) => defined(nodes.get(id), "node"));
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
            defined(domain, "domain").scope.length &&
            view.assembly.problem.symbols.filter(
              (symbol) => view.state.domains[d.cell] & symbolMask(symbol),
            ).length > 2
          )
            dynamic = true;
          if (domain?.rule === "support@1") {
            const base = defined(nodes.get(domain.premises[0]), "node").conclusion;
            if (
              base.kind === "cover" &&
              base.cells.filter((cell) => view.state.domains[cell] & symbolMask(base.symbol))
                .length > 2 &&
              domain.premises.slice(1).some((id) => defined(nodes.get(id), "node").scope.length > 0)
            )
              dynamic = true;
          }
          if (pattern.mode === "static")
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
  requireProof(pattern.mode === "nested" ? maxDepth === 2 : maxDepth === 1, "net-nesting-label");
  if (pattern.mode === "dynamic") requireProof(dynamic, "net-missing-dynamic-link");
  const root = nodes.get(pattern.root);
  requireProof(
    root?.rule === "discharge@1" &&
      root.scope.length === 0 &&
      sameValue(root.premises, [pattern.branch.assumption, pattern.branch.result]),
    "net-root-lineage",
  );
  checkForcingRoots(proposal, view, nodes, pattern.root);
}
