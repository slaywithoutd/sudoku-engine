import type { ReadView, Literal } from "../state/types";
import type { DeductionProposal, ProofNode } from "../proof/types";
import { clause, requireProof, sameValue } from "../proof/primitives";
import { ForcingLineage, checkForcingRoots } from "./forcing-grammar";
import type { Candidate, CandidateSet } from "./csp-variables";
import type {
  GeneralizedPlan,
  GeneralizedCertificate,
  GeneralizedPosition,
  ExclusionProof,
} from "./generalized-chains";
import { findHouse, symbolMask } from "../state/read";

const lit = (v: Candidate, positive = true): Literal => ({
  cell: v[0],
  symbol: v[1],
  positive,
});
const set = (v: Candidate | CandidateSet): CandidateSet =>
  typeof v[0] === "number" ? [v as Candidate] : (v as CandidateSet);
const key = (v: Candidate) => `${v[0]}:${v[1]}`;
const eq = (a: CandidateSet, b: CandidateSet) => sameValue(a, b);
const conflicts = (view: ReadView, a: Candidate, b: Candidate) =>
  a[0] === b[0]
    ? a[1] !== b[1]
    : a[1] === b[1] &&
      view.assembly.allDifferent.some((h) => h.cells.includes(a[0]) && h.cells.includes(b[0]));

/** Independent complete-variable reconstruction and ordered DAG recognizer.
 * No detector, compiler or production variable-builder is imported at runtime.
 */
export class GeneralizedLineage {
  readonly lineage: ForcingLineage;
  constructor(
    readonly view: ReadView,
    readonly nodes: ReadonlyMap<number, ProofNode>,
  ) {
    this.lineage = new ForcingLineage(view, nodes);
  }
  node(id: number): ProofNode {
    return this.lineage.node(id);
  }
  exact(
    id: number,
    rule: string,
    premises: readonly number[],
    scope: readonly number[],
    conclusion?: ProofNode["conclusion"],
  ): void {
    const n = this.node(id);
    requireProof(
      n.rule === rule &&
        sameValue(n.premises, premises) &&
        sameValue(n.scope, scope) &&
        sameValue(n.parameters, {}) &&
        (!conclusion || sameValue(n.conclusion, conclusion)),
      "generalized-lineage",
    );
  }
  source(id: number, positiveOnly: boolean): readonly Literal[] {
    const fact = this.view.facts.get(id);
    requireProof(
      fact &&
        !fact.openAssumptions.length &&
        fact.proposition.kind === "clause" &&
        fact.proposition.alternatives.length >= 2 &&
        fact.proposition.alternatives.length <= 4,
      "generalized-or-source",
    );
    const values = fact.proposition.alternatives;
    requireProof(!positiveOnly || values.every((v) => v.positive), "inserted-or-signed-source");
    requireProof(
      this.nodes.get(id)?.conclusion === fact.proposition ||
        sameValue(this.nodes.get(id)?.conclusion, fact.proposition),
      "generalized-or-source-identity",
    );
    return values;
  }
  variable(
    position: GeneralizedPosition,
    cover: number,
    _scope: readonly number[],
    source?: number,
  ): void {
    let values: Candidate[];
    if (position.role === "or") {
      requireProof(cover === source, "inserted-or-source-id");
      values = this.source(cover, true).map((v) => [v.cell, v.symbol]);
    } else {
      const cell = /^cell:(\d+)$/.exec(position.variable);
      if (cell) {
        const c = Number(cell[1]);
        requireProof(
          this.view.assembly.problem.cells.includes(c) && !this.view.state.values[c],
          "generalized-cell",
        );
        values = this.view.assembly.problem.symbols
          .filter((s) => this.view.state.domains[c] & symbolMask(s))
          .map((s) => [c, s]);
        this.lineage.cell(cover, c);
      } else {
        const match = /^(.*):symbol:(\d+)$/.exec(position.variable);
        const house = findHouse(this.view, match?.[1]);
        requireProof(match && house, "generalized-variable");
        const symbol = Number(match[2]);
        values = house.cells
          .filter((c) => this.view.state.domains[c] & symbolMask(symbol))
          .map((c) => [c, symbol]);
        this.lineage.house(cover, house.id, symbol);
      }
      requireProof(this.node(cover).scope.length === 0, "generalized-cover-scope");
    }
    requireProof(eq(values, position.alternatives), "generalized-complete-alternatives");
  }
  exclusion(
    value: Candidate,
    witness: CandidateSet,
    root: number,
    c: ExclusionProof,
    scope: readonly number[],
  ): void {
    requireProof(
      c && c.weak.length === witness.length && c.reductions.length === witness.length,
      "generalized-all-members",
    );
    let previous = root;
    for (const [i, from] of witness.entries()) {
      requireProof(conflicts(this.view, from, value), "generalized-conflict");
      const weak = this.node(c.weak[i]);
      requireProof(
        weak.rule === "weak-link@1" &&
          weak.premises.length === 1 &&
          weak.scope.length === 0 &&
          sameValue(weak.parameters, {}) &&
          sameValue(weak.conclusion, clause([lit(from, false), lit(value, false)])),
        "generalized-weak-lineage",
      );
      if (from[0] === value[0])
        requireProof(
          weak.premises[0] === this.view.state.domainFacts[from[0]],
          "generalized-cell-source",
        );
      else {
        const fact = this.view.facts.get(weak.premises[0]);
        requireProof(
          fact &&
            !fact.openAssumptions.length &&
            fact.proposition.kind === "all-different" &&
            fact.proposition.cells.includes(from[0]) &&
            fact.proposition.cells.includes(value[0]),
          "generalized-house-source",
        );
      }
      this.exact(
        c.reductions[i],
        "resolution@1",
        [previous, weak.id],
        scope,
        clause([...witness.slice(i + 1).map((v) => lit(v)), lit(value, false)]),
      );
      previous = c.reductions[i];
    }
    requireProof(c.result === previous, "generalized-exclusion-result");
  }
  positions(
    plan: GeneralizedPlan,
    c: Omit<GeneralizedCertificate, "root">,
    scope: readonly number[],
  ): void {
    requireProof(
      ["bivalue", "z", "t", "whip", "braid", "g-whip", "inserted-or-whip"].includes(plan.grammar),
      "generalized-grammar",
    );
    requireProof(
      plan.positions.length >= 1 &&
        plan.positions.length <= 12 &&
        c.positions.length === plan.positions.length,
      "generalized-position-bound",
    );
    const prior: { values: CandidateSet; root: number }[] = [
      { values: [plan.target], root: c.assumption },
    ];
    const used = new Set([key(plan.target)]),
      variables = new Set<string>();
    let groups = 0,
      orCount = 0;
    for (const [i, p] of plan.positions.entries()) {
      const cert = c.positions[i],
        terminal = p.right === null,
        last = i === plan.positions.length - 1;
      requireProof(!terminal || last, "generalized-interior-terminal");
      const mayRevisit =
        plan.grammar === "g-whip" &&
        prior.at(-1)!.values.length > 1 &&
        plan.positions[i - 1]?.variable !== p.variable;
      requireProof(mayRevisit || !variables.has(p.variable), "generalized-repeated-variable");
      variables.add(p.variable);
      if (p.role === "or") {
        orCount++;
        requireProof(plan.grammar === "inserted-or-whip" && !terminal, "generalized-or-position");
      }
      this.variable(p, cert.cover, scope, plan.source);
      const right = terminal ? [] : set(p.right!),
        excluded = [
          { literal: p.left, conflictWith: p.leftConflict },
          ...p.excluded,
          ...(p.closingCandidate
            ? [
                {
                  literal: p.closingCandidate,
                  conflictWith: p.closingConflict!,
                },
              ]
            : []),
        ];
      if (p.closingCandidate)
        requireProof(
          terminal && plan.grammar === "t" && sameValue(p.closingConflict, plan.target),
          "t-terminal-closing-candidate",
        );
      requireProof(terminal || right.length > 0, "generalized-right-size");
      requireProof(
        right.length <= 3 && (!terminal || cert.reductions.length === 0),
        "generalized-right-bound",
      );
      if (right.length > 1) {
        groups++;
        const cells = right.map((v) => v[0]);
        const houses = this.view.assembly.allDifferent.filter(
          (h) => h.cells.length === 9 && cells.every((c) => h.cells.includes(c)),
        );
        requireProof(
          plan.grammar === "g-whip" &&
            new Set(right.map((v) => v[1])).size === 1 &&
            houses.some(
              (h) =>
                new Set(h.cells.map((c) => Math.floor(c / 27) * 3 + Math.floor((c % 9) / 3)))
                  .size === 1,
            ) &&
            houses.some(
              (h) =>
                new Set(h.cells.map((c) => Math.floor(c / 9))).size === 1 ||
                new Set(h.cells.map((c) => c % 9)).size === 1,
            ),
          "generalized-group-geometry",
        );
      }
      for (const v of [p.left, ...right]) {
        requireProof(!used.has(key(v)), "generalized-repeated-candidate");
        used.add(key(v));
      }
      const selected = [...right, ...excluded.map((e) => e.literal)];
      requireProof(
        new Set(selected.map(key)).size === selected.length &&
          sameValue(selected.map(key).sort(), p.alternatives.map(key).sort()) &&
          cert.exclusions.length === excluded.length,
        "generalized-complete-exclusions",
      );
      if (plan.grammar === "bivalue")
        requireProof(p.alternatives.length === 2, "bivalue-original-alternatives");
      let targetExtras = 0;
      for (const [j, e] of excluded.entries()) {
        const witness = set(e.conflictWith),
          index = prior.findIndex((r) => eq(r.values, witness));
        requireProof(index >= 0, "generalized-forward-dependency");
        if (j === 0)
          requireProof(
            plan.grammar === "braid" || index === prior.length - 1,
            "generalized-continuity",
          );
        else {
          if (plan.grammar === "bivalue")
            requireProof(terminal && index === 0, "bivalue-terminal-target");
          if (plan.grammar === "z") requireProof(index === 0, "z-extra-policy");
          if (plan.grammar === "t" && index === 0) {
            targetExtras++;
            requireProof(
              terminal &&
                targetExtras <= 1 &&
                p.closingCandidate &&
                sameValue(e.literal, p.closingCandidate),
              "t-extra-policy",
            );
          }
        }
        this.exclusion(e.literal, witness, prior[index].root, cert.exclusions[j], scope);
      }
      if (plan.grammar === "t" && i === 0)
        requireProof(p.alternatives.length === 2, "t-first-bivalue");
      // Right means the sole surviving set; an already refuted right cannot be
      // carried into a longer named chain. Endpoint target closure is explicit.
      for (const v of right)
        for (const [j, previous] of prior.entries()) {
          if (last && j === 0) continue;
          requireProof(
            !previous.values.every((a) => conflicts(this.view, v, a)),
            "generalized-refuted-right",
          );
        }
      if (terminal) {
        const order = p.alternatives.map((v) => excluded.findIndex((e) => sameValue(e.literal, v)));
        this.exact(
          cert.result,
          "contradiction@1",
          [cert.cover, ...order.map((j) => cert.exclusions[j].result)],
          scope,
          { kind: "false" },
        );
      } else {
        let previous = cert.cover,
          remaining = [...p.alternatives];
        requireProof(cert.reductions.length === excluded.length, "generalized-reduction-count");
        for (const [j, e] of excluded.entries()) {
          remaining = remaining.filter((v) => !sameValue(v, e.literal));
          this.exact(
            cert.reductions[j],
            "resolution@1",
            [previous, cert.exclusions[j].result],
            scope,
            clause(remaining.map((v) => lit(v))),
          );
          previous = cert.reductions[j];
        }
        requireProof(cert.result === previous, "generalized-right-lineage");
        prior.push({ values: right, root: cert.result });
      }
    }
    requireProof(groups <= 4, "generalized-group-count");
    requireProof(orCount === (plan.grammar === "inserted-or-whip" ? 1 : 0), "generalized-or-count");
    if (plan.grammar === "g-whip") requireProof(groups > 0, "generalized-missing-group");
    if (plan.positions.at(-1)!.right === null)
      requireProof(
        c.closing === null && c.contradiction === c.positions.at(-1)!.result,
        "generalized-terminal-lineage",
      );
    else {
      requireProof(c.closing, "generalized-endpoint");
      const last = prior.at(-1)!;
      this.exclusion(plan.consequence ?? plan.target, last.values, last.root, c.closing, scope);
      if (plan.consequence)
        requireProof(c.contradiction === c.closing.result, "generalized-consequence-result");
      else
        this.exact(c.contradiction, "contradiction@1", [c.assumption, c.closing.result], scope, {
          kind: "false",
        });
    }
  }
}

export function checkGeneralizedPattern(
  proposal: DeductionProposal,
  view: ReadView,
  nodes: ReadonlyMap<number, ProofNode>,
): void {
  const p = proposal.pattern as unknown as GeneralizedPlan & {
      certificate: GeneralizedCertificate;
    },
    l = new GeneralizedLineage(view, nodes),
    c = p.certificate;
  const profiles: Record<string, readonly string[]> = {
    "c25@1": ["bivalue", "z"],
    "c26@1": ["t", "whip"],
    "c27@1": ["braid", "g-whip"],
    "c28@1": ["inserted-or-whip"],
  };
  const aliases: Record<string, string> = {
    bivalue: "Bivalue chains",
    z: "z-chains",
    t: "t-whips",
    whip: "Whips",
    braid: "Braids",
    "g-whip": "g-whips",
    "inserted-or-whip": "OR-k whips",
  };
  requireProof(
    c && profiles[proposal.technique]?.includes(p.grammar) && p.alias === aliases[p.grammar],
    "generalized-alias",
  );
  requireProof(p.consequence === undefined, "generalized-standalone-consequence");
  if (p.mode === "cache")
    requireProof(
      proposal.technique !== "c28@1" &&
        proposal.effects.length === 0 &&
        sameValue(proposal.proof.roots, [c.root]),
      "generalized-cache-roots",
    );
  else
    requireProof(
      p.mode === undefined &&
        proposal.effects.length === 1 &&
        sameValue(proposal.effects[0], {
          kind: "remove",
          cell: p.target[0],
          symbol: p.target[1],
        }),
      "generalized-effect",
    );
  l.exact(c.assumption, "assume@1", [], [], clause([lit(p.target)]));
  l.positions(p, c, [c.assumption]);
  l.exact(
    c.root,
    "discharge@1",
    [c.assumption, c.contradiction],
    [],
    clause([lit(p.target, false)]),
  );
  checkForcingRoots(proposal, view, nodes, c.root);
}
