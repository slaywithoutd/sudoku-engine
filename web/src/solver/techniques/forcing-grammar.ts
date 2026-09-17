import type { DeductionProposal, ProofNode } from "../proof/types";
import type { ReadView, Literal, Proposition } from "../state/types";
import { clause, requireProof, sameValue } from "../proof/primitives";
import type { ForcingPlan, ForcingCertificate } from "./forcing";
import type { ForcingLink, PathCertificate } from "./forcing-proof";
import { findHouse, symbolMask } from "../state/read";
import { claimed, defined } from "../invariants";

const literal = (v: Literal): Proposition => ({ kind: "literal", value: v });
const complement = (v: Literal): Literal => ({ ...v, positive: !v.positive });
const candidates = (view: ReadView, cell: number): Literal[] =>
  view.assembly.problem.symbols
    .filter((symbol) => view.state.domains[cell] & symbolMask(symbol))
    .map((symbol) => ({ cell: cell, symbol, positive: true }));

/** Independent path recognizer: geometry + exact current source lineage. */
export class ForcingLineage {
  constructor(
    readonly view: ReadView,
    readonly nodes: ReadonlyMap<number, ProofNode>,
  ) {}
  node(id: number): ProofNode {
    const n = this.nodes.get(id);
    requireProof(n, "forcing-missing-node");
    return n;
  }
  cell(id: number, cell: number): void {
    const n = this.node(id);
    requireProof(
      n.rule === "cover-clause@1" &&
        sameValue(n.premises, [this.view.state.domainFacts[cell]]) &&
        sameValue(n.conclusion, clause(candidates(this.view, cell))),
      "forcing-cell-cover",
    );
  }
  house(id: number, house: string, symbol: number): void {
    const n = this.node(id),
      h = findHouse(this.view, house);
    requireProof(
      h && n.rule === "cover-clause@1" && n.premises.length === 1,
      "forcing-house-cover",
    );
    const support = this.node(n.premises[0]),
      source = this.view.facts.get(support.premises[0]);
    requireProof(
      support.rule === "support@1" &&
        source &&
        sameValue(source.proposition, { kind: "cover", cells: h.cells, symbol }) &&
        sameValue(
          support.premises.slice(1),
          h.cells.map((cell) => this.view.state.domainFacts[cell]),
        ) &&
        sameValue(
          n.conclusion,
          clause(
            h.cells
              .filter((cell) => this.view.state.domains[cell] & symbolMask(symbol))
              .map((cell) => ({ cell, symbol, positive: true })),
          ),
        ),
      "forcing-house-cover",
    );
  }
  edge(id: number, link: ForcingLink): void {
    const n = this.node(id),
      reason = link.reason;
    requireProof(
      sameValue(n.conclusion, clause([complement(link.from), link.to])),
      "forcing-edge-clause",
    );
    if (reason.kind === "cell-cover") {
      requireProof(!link.from.positive && link.to.positive, "forcing-edge-sign");
      this.cell(id, defined(reason.cell, "cell"));
    } else if (reason.kind === "house-cover") {
      requireProof(!link.from.positive && link.to.positive, "forcing-edge-sign");
      this.house(id, defined(reason.house, "house"), defined(reason.symbol, "symbol"));
    } else {
      requireProof(
        link.from.positive &&
          !link.to.positive &&
          n.rule === "weak-link@1" &&
          n.premises.length === 1,
        "forcing-weak-edge",
      );
      if (reason.kind === "cell-conflict")
        requireProof(
          n.premises[0] === this.view.state.domainFacts[defined(reason.cell, "cell")] &&
            link.from.cell === reason.cell &&
            link.to.cell === reason.cell,
          "forcing-cell-conflict",
        );
      else {
        requireProof(claimed(reason).kind === "scope-conflict", "forcing-edge-kind");
        const house = findHouse(this.view, reason.house),
          fact = this.view.facts.get(n.premises[0]);
        requireProof(
          house &&
            fact &&
            sameValue(fact.proposition, { kind: "all-different", cells: house.cells }) &&
            link.from.symbol === reason.symbol &&
            link.to.symbol === reason.symbol,
          "forcing-scope-conflict",
        );
      }
    }
  }
  path(
    assumption: number,
    path: readonly ForcingLink[],
    proof: PathCertificate,
    scope: readonly number[],
    nishio = false,
  ): void {
    requireProof(
      path.length <= 24 &&
        proof.links.length === path.length &&
        proof.clauses.length === path.length,
      "forcing-link-bound",
    );
    let prior = assumption;
    const initial = this.node(assumption).conclusion;
    requireProof(initial.kind === "literal", "forcing-assumption");
    let value = initial.value;
    for (const [i, link] of path.entries()) {
      requireProof(sameValue(link.from, value), "forcing-disconnected-path");
      if (nishio)
        requireProof(
          link.from.symbol === initial.value.symbol &&
            link.to.symbol === initial.value.symbol &&
            ["scope-conflict", "house-cover"].includes(link.reason.kind),
          "nishio-mixed-digit",
        );
      this.edge(proof.clauses[i], link);
      const node = this.node(proof.links[i]);
      requireProof(
        node.rule === "resolution@1" &&
          sameValue(node.scope, scope) &&
          sameValue(this.node(proof.clauses[i]).scope, scope) &&
          sameValue(node.premises, [prior, proof.clauses[i]]) &&
          sameValue(node.conclusion, literal(link.to)),
        "forcing-path-lineage",
      );
      prior = node.id;
      value = link.to;
    }
    if (!path.length) {
      const end = this.node(proof.end),
        projection = this.node(end.premises[0]);
      requireProof(
        end.rule === "conjunction@1" &&
          sameValue(end.parameters, { index: 0 }) &&
          end.premises.length === 1 &&
          sameValue(end.scope, scope) &&
          projection.rule === "conjunction@1" &&
          sameValue(projection.premises, [assumption]) &&
          sameValue(projection.scope, scope),
        "forcing-initial-path",
      );
    } else requireProof(proof.end === prior, "forcing-path-end");
  }
}

/** Every supplied effect root must be the complete cases/discharge certificate. */
export function checkForcingPattern(
  proposal: DeductionProposal,
  view: ReadView,
  nodes: ReadonlyMap<number, ProofNode>,
): void {
  const pattern = proposal.pattern as unknown as ForcingPlan & { certificate?: ForcingCertificate },
    cert = pattern.certificate,
    l = new ForcingLineage(view, nodes);
  requireProof(
    cert &&
      ["digit", "cell", "unit", "nishio"].includes(pattern.kind) &&
      pattern.alias ===
        {
          digit: "Digit forcing chains",
          cell: "Cell forcing chains",
          unit: "Unit forcing chains",
          nishio: "Nishio",
        }[pattern.kind],
    "forcing-alias",
  );
  if (pattern.mode === "cache")
    requireProof(
      pattern.cacheTarget &&
        !pattern.cacheTarget.positive &&
        proposal.effects.length === 0 &&
        sameValue(proposal.proof.roots, [cert.root]),
      "forcing-cache-roots",
    );
  else
    requireProof(
      claimed(pattern).mode === undefined &&
        pattern.cacheTarget === undefined &&
        proposal.effects.length >= 1 &&
        (proposal.effects[0].kind === "place" || proposal.effects.length === 1),
      "forcing-effects",
    );
  let alternatives: Literal[];
  if (pattern.kind === "cell") {
    alternatives = candidates(view, defined(pattern.cover.cell, "cell"));
    l.cell(defined(cert.cover, "cover"), defined(pattern.cover.cell, "cell"));
  } else if (pattern.kind === "unit") {
    const house = findHouse(view, pattern.cover.house);
    requireProof(house, "forcing-unit");
    alternatives = house.cells
      .filter(
        (cell) => view.state.domains[cell] & symbolMask(defined(pattern.cover.symbol, "symbol")),
      )
      .map((cell) => ({ cell, symbol: defined(pattern.cover.symbol, "symbol"), positive: true }));
    l.house(
      defined(cert.cover, "cover"),
      defined(pattern.cover.house, "house"),
      defined(pattern.cover.symbol, "symbol"),
    );
  } else {
    const left = pattern.cover.candidate;
    requireProof(
      left && left.positive && candidates(view, left.cell).some((v) => sameValue(left, v)),
      "forcing-candidate",
    );
    alternatives = pattern.kind === "nishio" ? [left] : [left, complement(left)];
    if (pattern.kind === "nishio") requireProof(cert.cover === null, "nishio-cover");
    else {
      let node = l.node(defined(cert.cover, "cover"));
      requireProof(sameValue(node.conclusion, clause(alternatives)), "forcing-candidate-cover");
      const remaining = candidates(view, left.cell).filter((v) => v.symbol !== left.symbol);
      for (const value of [...remaining].reverse()) {
        requireProof(
          node.rule === "resolution@1" && node.premises.length === 2 && node.scope.length === 0,
          "forcing-case-cover-lineage",
        );
        l.edge(node.premises[1], {
          from: value,
          to: complement(left),
          reason: { kind: "cell-conflict", cell: left.cell },
        });
        node = l.node(node.premises[0]);
      }
      l.cell(node.id, left.cell);
    }
  }
  const sort = (left: Literal, right: Literal) =>
    left.cell - right.cell ||
    left.symbol - right.symbol ||
    Number(left.positive) - Number(right.positive);
  requireProof(
    alternatives.length >= (pattern.kind === "nishio" ? 1 : 2) &&
      alternatives.length <= 9 &&
      sameValue([...pattern.alternatives].sort(sort), [...alternatives].sort(sort)) &&
      pattern.branches.length === alternatives.length &&
      cert.branches.length === alternatives.length,
    "forcing-incomplete-cases",
  );
  const seen = new Set<string>();
  for (const [i, right] of pattern.branches.entries()) {
    const certificate = cert.branches[i],
      node = l.node(certificate.assumption),
      result = l.node(certificate.result),
      scope = [node.id],
      key = JSON.stringify(right.assumption);
    requireProof(
      !seen.has(key) &&
        alternatives.some((v) => sameValue(v, right.assumption)) &&
        node.rule === "assume@1" &&
        node.scope.length === 0 &&
        sameValue(node.conclusion, literal(right.assumption)),
      "forcing-case-assumption",
    );
    seen.add(key);
    requireProof(
      right.paths.length === (right.result === "false" ? 2 : 1) &&
        certificate.paths.length === right.paths.length &&
        right.paths.reduce((n, path) => n + path.length, 0) <= 24,
      "forcing-branch-bound",
    );
    right.paths.forEach((path, j) =>
      l.path(node.id, path, certificate.paths[j], scope, pattern.kind === "nishio"),
    );
    if (right.result === "false")
      requireProof(
        result.rule === "contradiction@1" &&
          sameValue(result.scope, scope) &&
          sameValue(
            result.premises,
            certificate.paths.map((p) => p.end),
          ),
        "forcing-contradiction-lineage",
      );
    else
      requireProof(
        result.id === certificate.paths[0].end &&
          sameValue(result.conclusion, literal(right.result)),
        "forcing-result-lineage",
      );
  }
  const root = l.node(cert.root),
    effect =
      pattern.mode === "cache"
        ? {
            kind: "remove",
            cell: defined(pattern.cacheTarget, "cacheTarget").cell,
            symbol: defined(pattern.cacheTarget, "cacheTarget").symbol,
          }
        : proposal.effects[0];
  requireProof(
    root.scope.length === 0 &&
      sameValue(
        root.conclusion,
        literal({ cell: effect.cell, symbol: effect.symbol, positive: effect.kind === "place" }),
      ),
    "forcing-root",
  );
  if (pattern.kind === "nishio")
    requireProof(
      root.rule === "discharge@1" &&
        sameValue(root.premises, [cert.branches[0].assumption, cert.branches[0].result]) &&
        pattern.branches[0].result === "false",
      "nishio-discharge",
    );
  else {
    const ordered = pattern.branches
      .map((right, i) => ({ a: right.assumption, c: cert.branches[i] }))
      .sort((left, right) => sort(left.a, right.a));
    requireProof(
      root.rule === "cases@1" &&
        sameValue(root.premises, [
          cert.cover,
          ...ordered.flatMap(({ c: branch }) => [branch.assumption, branch.result]),
        ]),
      "forcing-cases-lineage",
    );
  }
  checkForcingRoots(proposal, view, nodes, cert.root);
}
export function checkForcingRoots(
  proposal: DeductionProposal,
  view: ReadView,
  nodes: ReadonlyMap<number, ProofNode>,
  root: number,
): void {
  requireProof(proposal.proof.roots.includes(root), "forcing-missing-root");
  const primary = defined(nodes.get(root), "node").conclusion,
    accepted = new Set([root]);
  if (primary.kind === "literal" && primary.value.positive)
    for (const id of proposal.proof.roots) {
      const n = defined(nodes.get(id), "node");
      if (id === root || n.conclusion.kind !== "literal") continue;
      const weak =
        n.premises.length === 2 && n.premises[0] === root ? nodes.get(n.premises[1]) : undefined;
      requireProof(
        n.rule === "resolution@1" &&
          n.scope.length === 0 &&
          !n.conclusion.value.positive &&
          weak?.rule === "weak-link@1" &&
          weak.scope.length === 0 &&
          weak.premises.length === 1 &&
          view.facts.has(weak.premises[0]),
        "forcing-unrelated-peer-root",
      );
      accepted.add(id);
    }
  for (const id of proposal.proof.roots)
    if (!accepted.has(id)) {
      const n = defined(nodes.get(id), "node");
      requireProof(
        n.rule === "domain-restrict@1" &&
          n.scope.length === 0 &&
          n.conclusion.kind === "domain" &&
          n.premises[0] === view.state.domainFacts[n.conclusion.cell] &&
          n.premises.length === 2 &&
          accepted.has(n.premises[1]),
        "forcing-unrelated-root",
      );
    }
}
