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
import { claimed, defined } from "../invariants";

const lit = (candidate: Candidate, positive = true): Literal => ({
  cell: candidate[0],
  symbol: candidate[1],
  positive,
});
const set = (value: Candidate | CandidateSet): CandidateSet =>
  typeof value[0] === "number" ? [value as Candidate] : (value as CandidateSet);
const key = (candidate: Candidate) => `${candidate[0]}:${candidate[1]}`;
const eq = (left: CandidateSet, right: CandidateSet) => sameValue(left, right);
const conflicts = (view: ReadView, left: Candidate, right: Candidate) =>
  left[0] === right[0]
    ? left[1] !== right[1]
    : left[1] === right[1] &&
      view.assembly.allDifferent.some(
        (house) => house.cells.includes(left[0]) && house.cells.includes(right[0]),
      );

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
    requireProof(
      !positiveOnly || values.every((literal) => literal.positive),
      "inserted-or-signed-source",
    );
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
      values = this.source(cover, true).map((literal) => [literal.cell, literal.symbol]);
    } else {
      const cellMatch = /^cell:(\d+)$/.exec(position.variable);
      if (cellMatch) {
        const cell = Number(cellMatch[1]);
        requireProof(
          this.view.assembly.problem.cells.includes(cell) && !this.view.state.values[cell],
          "generalized-cell",
        );
        values = this.view.assembly.problem.symbols
          .filter((symbol) => this.view.state.domains[cell] & symbolMask(symbol))
          .map((symbol) => [cell, symbol]);
        this.lineage.cell(cover, cell);
      } else {
        const match = /^(.*):symbol:(\d+)$/.exec(position.variable);
        const house = findHouse(this.view, match?.[1]);
        requireProof(match && house, "generalized-variable");
        const symbol = Number(match[2]);
        values = house.cells
          .filter((cell) => this.view.state.domains[cell] & symbolMask(symbol))
          .map((cell) => [cell, symbol]);
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
    exclusion: ExclusionProof | undefined,
    scope: readonly number[],
  ): void {
    requireProof(
      exclusion &&
        exclusion.weak.length === witness.length &&
        exclusion.reductions.length === witness.length,
      "generalized-all-members",
    );
    let previous = root;
    for (const [i, from] of witness.entries()) {
      requireProof(conflicts(this.view, from, value), "generalized-conflict");
      const weak = this.node(exclusion.weak[i]);
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
        exclusion.reductions[i],
        "resolution@1",
        [previous, weak.id],
        scope,
        clause([...witness.slice(i + 1).map((candidate) => lit(candidate)), lit(value, false)]),
      );
      previous = exclusion.reductions[i];
    }
    requireProof(exclusion.result === previous, "generalized-exclusion-result");
  }
  positions(
    plan: GeneralizedPlan,
    certificate: Omit<GeneralizedCertificate, "root">,
    scope: readonly number[],
  ): void {
    requireProof(
      ["bivalue", "z", "t", "whip", "braid", "g-whip", "inserted-or-whip"].includes(plan.grammar),
      "generalized-grammar",
    );
    requireProof(
      plan.positions.length >= 1 &&
        plan.positions.length <= 12 &&
        certificate.positions.length === plan.positions.length,
      "generalized-position-bound",
    );
    const prior: { values: CandidateSet; root: number }[] = [
      { values: [plan.target], root: certificate.assumption },
    ];
    const used = new Set([key(plan.target)]),
      variables = new Set<string>();
    let groups = 0,
      orCount = 0;
    for (const [i, position] of plan.positions.entries()) {
      const cert = certificate.positions[i],
        terminal = position.right === null,
        last = i === plan.positions.length - 1;
      requireProof(!terminal || last, "generalized-interior-terminal");
      const mayRevisit =
        plan.grammar === "g-whip" &&
        defined(prior.at(-1), "prior").values.length > 1 &&
        plan.positions[i - 1]?.variable !== position.variable;
      requireProof(
        mayRevisit || !variables.has(position.variable),
        "generalized-repeated-variable",
      );
      variables.add(position.variable);
      if (position.role === "or") {
        orCount++;
        requireProof(plan.grammar === "inserted-or-whip" && !terminal, "generalized-or-position");
      }
      this.variable(position, cert.cover, scope, plan.source);
      const right = terminal ? [] : set(defined(position.right, "right")),
        excluded = [
          { literal: position.left, conflictWith: position.leftConflict },
          ...position.excluded,
          ...(position.closingCandidate
            ? [
                {
                  literal: position.closingCandidate,
                  conflictWith: defined(position.closingConflict, "closingConflict"),
                },
              ]
            : []),
        ];
      if (position.closingCandidate)
        requireProof(
          terminal && plan.grammar === "t" && sameValue(position.closingConflict, plan.target),
          "t-terminal-closing-candidate",
        );
      requireProof(terminal || right.length > 0, "generalized-right-size");
      requireProof(
        right.length <= 3 && (!terminal || cert.reductions.length === 0),
        "generalized-right-bound",
      );
      if (right.length > 1) {
        groups++;
        const cells = right.map((candidate) => candidate[0]);
        const houses = this.view.assembly.allDifferent.filter(
          (house) => house.cells.length === 9 && cells.every((cell) => house.cells.includes(cell)),
        );
        requireProof(
          plan.grammar === "g-whip" &&
            new Set(right.map((candidate) => candidate[1])).size === 1 &&
            houses.some(
              (house) =>
                new Set(
                  house.cells.map((cell) => Math.floor(cell / 27) * 3 + Math.floor((cell % 9) / 3)),
                ).size === 1,
            ) &&
            houses.some(
              (house) =>
                new Set(house.cells.map((cell) => Math.floor(cell / 9))).size === 1 ||
                new Set(house.cells.map((cell) => cell % 9)).size === 1,
            ),
          "generalized-group-geometry",
        );
      }
      for (const candidate of [position.left, ...right]) {
        requireProof(!used.has(key(candidate)), "generalized-repeated-candidate");
        used.add(key(candidate));
      }
      const selected = [...right, ...excluded.map((conflict) => conflict.literal)];
      requireProof(
        new Set(selected.map(key)).size === selected.length &&
          sameValue(selected.map(key).sort(), position.alternatives.map(key).sort()) &&
          cert.exclusions.length === excluded.length,
        "generalized-complete-exclusions",
      );
      if (plan.grammar === "bivalue")
        requireProof(position.alternatives.length === 2, "bivalue-original-alternatives");
      let targetExtras = 0;
      for (const [j, conflict] of excluded.entries()) {
        const witness = set(conflict.conflictWith),
          index = prior.findIndex((row) => eq(row.values, witness));
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
                position.closingCandidate &&
                sameValue(conflict.literal, position.closingCandidate),
              "t-extra-policy",
            );
          }
        }
        this.exclusion(conflict.literal, witness, prior[index].root, cert.exclusions[j], scope);
      }
      if (plan.grammar === "t" && i === 0)
        requireProof(position.alternatives.length === 2, "t-first-bivalue");
      // Right means the sole surviving set; an already refuted right cannot be
      // carried into a longer named chain. Endpoint target closure is explicit.
      for (const candidate of right)
        for (const [j, previous] of prior.entries()) {
          if (last && j === 0) continue;
          requireProof(
            !previous.values.every((a) => conflicts(this.view, candidate, a)),
            "generalized-refuted-right",
          );
        }
      if (terminal) {
        const order = position.alternatives.map((candidate) =>
          excluded.findIndex((conflict) => sameValue(conflict.literal, candidate)),
        );
        this.exact(
          cert.result,
          "contradiction@1",
          [cert.cover, ...order.map((j) => cert.exclusions[j].result)],
          scope,
          { kind: "false" },
        );
      } else {
        let previous = cert.cover,
          remaining = [...position.alternatives];
        requireProof(cert.reductions.length === excluded.length, "generalized-reduction-count");
        for (const [j, conflict] of excluded.entries()) {
          remaining = remaining.filter((candidate) => !sameValue(candidate, conflict.literal));
          this.exact(
            cert.reductions[j],
            "resolution@1",
            [previous, cert.exclusions[j].result],
            scope,
            clause(remaining.map((candidate) => lit(candidate))),
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
    if (defined(plan.positions.at(-1), "position").right === null)
      requireProof(
        certificate.closing === null &&
          certificate.contradiction === defined(certificate.positions.at(-1), "position").result,
        "generalized-terminal-lineage",
      );
    else {
      requireProof(certificate.closing, "generalized-endpoint");
      const last = defined(prior.at(-1), "prior");
      this.exclusion(
        plan.consequence ?? plan.target,
        last.values,
        last.root,
        certificate.closing,
        scope,
      );
      if (plan.consequence)
        requireProof(
          certificate.contradiction === certificate.closing.result,
          "generalized-consequence-result",
        );
      else
        this.exact(
          certificate.contradiction,
          "contradiction@1",
          [certificate.assumption, certificate.closing.result],
          scope,
          {
            kind: "false",
          },
        );
    }
  }
}

export function checkGeneralizedPattern(
  proposal: DeductionProposal,
  view: ReadView,
  nodes: ReadonlyMap<number, ProofNode>,
): void {
  const pattern = proposal.pattern as unknown as GeneralizedPlan & {
      certificate?: GeneralizedCertificate;
    },
    lineage = new GeneralizedLineage(view, nodes),
    certificate = pattern.certificate;
  const profiles: Partial<Record<string, readonly string[]>> = {
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
    certificate &&
      profiles[proposal.technique]?.includes(pattern.grammar) &&
      pattern.alias === aliases[pattern.grammar],
    "generalized-alias",
  );
  requireProof(pattern.consequence === undefined, "generalized-standalone-consequence");
  if (pattern.mode === "cache")
    requireProof(
      proposal.technique !== "c28@1" &&
        proposal.effects.length === 0 &&
        sameValue(proposal.proof.roots, [certificate.root]),
      "generalized-cache-roots",
    );
  else
    requireProof(
      claimed(pattern).mode === undefined &&
        proposal.effects.length === 1 &&
        sameValue(proposal.effects[0], {
          kind: "remove",
          cell: pattern.target[0],
          symbol: pattern.target[1],
        }),
      "generalized-effect",
    );
  lineage.exact(certificate.assumption, "assume@1", [], [], clause([lit(pattern.target)]));
  lineage.positions(pattern, certificate, [certificate.assumption]);
  lineage.exact(
    certificate.root,
    "discharge@1",
    [certificate.assumption, certificate.contradiction],
    [],
    clause([lit(pattern.target, false)]),
  );
  checkForcingRoots(proposal, view, nodes, certificate.root);
}
