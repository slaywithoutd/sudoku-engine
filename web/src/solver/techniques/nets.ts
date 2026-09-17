import type { ReadView } from "../state/types";
import type { DeductionProposal } from "../proof/types";
import { proposedClause } from "../proof/builder";
import { ForcingProof, bit, type ForcingLink } from "./forcing-proof";
import { houseWithCells } from "../state/read";
import { defined } from "../invariants";
export { netTechniques } from "./nets-runtime";

export type NetOperation =
  | {
      kind: "singleton-peer";
      cell: number;
      mask: number;
      effects: readonly (readonly [number, number])[];
    }
  | {
      kind: "hidden-single";
      house: string;
      bit: number;
      supports: readonly number[];
      effects: readonly (readonly [number, number])[];
    }
  | {
      kind: "locked";
      house: string;
      otherHouse: string;
      bit: number;
      supports: readonly number[];
      effects: readonly (readonly [number, number])[];
    }
  | {
      kind: "naked-subset";
      house: string;
      cells: readonly number[];
      mask: number;
      effects: readonly (readonly [number, number])[];
    }
  | {
      kind: "graph";
      start: number;
      path: readonly ForcingLink[];
      effects: readonly (readonly [number, number])[];
    };
export interface NetBranchPlan {
  assumption: { cell: number; symbol: number };
  steps: readonly NetOperation[];
  contradiction: { kind: "empty-domain"; cell: number } | null;
  localInferences?: number;
}
export interface NetPlan {
  mode?: "static" | "dynamic" | "nested";
  outer: NetBranchPlan;
  innerCell?: number;
  innerAlternatives?: readonly number[];
  branches?: readonly NetBranchPlan[];
}
export interface NetBranchCertificate {
  assumption: number;
  result: number;
  children: readonly NetBranchCertificate[];
  cover: number | null;
}
/** Mutable compiler scratch only; every mask change has a corresponding DAG node. */
class NetDomains {
  readonly masks: number[];
  readonly roots: number[];
  constructor(
    readonly proof: ForcingProof,
    parent?: NetDomains,
  ) {
    this.masks = [...(parent?.masks ?? proof.view.state.domains)];
    this.roots = [...(parent?.roots ?? proof.view.state.domainFacts)];
  }
  restrict(cell: number, symbol: number, positive: boolean, root: number): void {
    const mask = positive ? this.masks[cell] & bit(symbol) : this.masks[cell] & ~bit(symbol);
    this.roots[cell] = this.proof.add("domain-restrict@1", [this.roots[cell], root], {
      kind: "domain",
      cell,
      mask,
    });
    this.masks[cell] = mask;
  }
  cover(house: string, symbol: number): number {
    const cells = this.proof.house(house),
      supports = cells.filter((cell) => this.masks[cell] & bit(symbol));
    const support = this.proof.add(
      "support@1",
      [this.proof.fact({ kind: "cover", cells, symbol }), ...cells.map((cell) => this.roots[cell])],
      { kind: "cover", cells: supports, symbol },
    );
    return this.proof.add(
      "cover-clause@1",
      [support],
      proposedClause(supports.map((cell) => ({ cell, symbol, positive: true }))),
    );
  }
  apply(step: NetOperation): void {
    const proof = this.proof;
    let source: number | undefined, symbol: number | undefined;
    if (step.kind === "singleton-peer") {
      symbol = Math.log2(step.mask) + 1;
      source = proof.add(
        "cover-clause@1",
        [this.roots[step.cell]],
        proposedClause([{ cell: step.cell, symbol, positive: true }]),
      );
    } else if (step.kind === "hidden-single" || step.kind === "locked") {
      symbol = Math.log2(step.bit) + 1;
      source = this.cover(step.house, symbol);
    } else if (step.kind === "graph") {
      source = step.start;
      for (const link of step.path) {
        const reason = link.reason;
        let clause: number;
        if (reason.kind === "cell-cover") {
          const cell = defined(reason.cell, "cell");
          clause = proof.add(
            "cover-clause@1",
            [this.roots[cell]],
            proposedClause(
              proof.view.assembly.problem.symbols
                .filter((digit) => this.masks[cell] & bit(digit))
                .map((symbol) => ({ cell, symbol, positive: true })),
            ),
          );
        } else if (reason.kind === "house-cover")
          clause = this.cover(defined(reason.house, "house"), defined(reason.symbol, "symbol"));
        else
          clause = proof.add(
            "weak-link@1",
            [
              reason.kind === "cell-conflict"
                ? this.roots[defined(reason.cell, "cell")]
                : proof.fact({
                    kind: "all-different",
                    cells: proof.house(defined(reason.house, "house")),
                  }),
            ],
            proposedClause([{ ...link.from, positive: !link.from.positive }, link.to]),
          );
        source = proof.add("resolution@1", [source, clause], proposedClause([link.to]));
      }
    }
    for (const [cell, mask] of step.effects) {
      if (step.kind === "hidden-single") {
        this.restrict(cell, defined(symbol, "symbol"), true, defined(source, "source"));
        continue;
      }
      const removed = this.masks[cell] & ~mask;
      for (const digit of proof.view.assembly.problem.symbols)
        if (removed & bit(digit)) {
          let root: number;
          if (step.kind === "singleton-peer") {
            const house = houseWithCells(proof.view, step.cell, cell);
            const weak = proof.add(
              "weak-link@1",
              [proof.fact({ kind: "all-different", cells: house.cells })],
              proposedClause([
                { cell: step.cell, symbol: digit, positive: false },
                { cell, symbol: digit, positive: false },
              ]),
            );
            root = proof.add(
              "resolution@1",
              [defined(source, "source"), weak],
              proposedClause([{ cell, symbol: digit, positive: false }]),
            );
          } else if (step.kind === "locked") {
            root = defined(source, "source");
            for (const [i, other] of step.supports.entries()) {
              const weak = proof.add(
                "weak-link@1",
                [proof.fact({ kind: "all-different", cells: proof.house(step.otherHouse) })],
                proposedClause([
                  { cell: other, symbol: digit, positive: false },
                  { cell, symbol: digit, positive: false },
                ]),
              );
              root = proof.add(
                "resolution@1",
                [root, weak],
                proposedClause([
                  ...step.supports
                    .slice(i + 1)
                    .map((cell) => ({ cell, symbol: digit, positive: true })),
                  { cell, symbol: digit, positive: false },
                ]),
              );
            }
          } else if (step.kind === "naked-subset")
            root = proof.add(
              "hall@1",
              [
                proof.fact({ kind: "all-different", cells: proof.house(step.house) }),
                ...step.cells.map((other) => this.roots[other]),
              ],
              proposedClause([{ cell, symbol: digit, positive: false }]),
            );
          else root = defined(source, "source");
          this.restrict(cell, digit, false, root);
        }
    }
  }
}

/** Compile finite basic steps, then optional complete second-level cell cases. */
export function compileNet(view: ReadView, plan: NetPlan): DeductionProposal {
  const proof = new ForcingProof(view),
    outer = new NetDomains(proof),
    value = { ...plan.outer.assumption, positive: true };
  const assumption = proof.add("assume@1", [], proposedClause([value]));
  proof.scope = [assumption];
  outer.restrict(value.cell, value.symbol, true, assumption);
  for (const step of plan.outer.steps) outer.apply(step);
  let result: number,
    cover: number | null = null;
  const children: NetBranchCertificate[] = [];
  if (plan.branches) {
    const cell = defined(plan.innerCell, "innerCell"),
      alternatives = defined(plan.innerAlternatives, "innerAlternatives");
    cover = proof.add(
      "cover-clause@1",
      [outer.roots[cell]],
      proposedClause(alternatives.map((symbol) => ({ cell, symbol, positive: true }))),
    );
    for (const branch of plan.branches) {
      proof.scope = [assumption];
      const left = proof.add(
        "assume@1",
        [],
        proposedClause([{ ...branch.assumption, positive: true }]),
      );
      proof.scope = [assumption, left];
      const domains = new NetDomains(proof, outer);
      domains.restrict(branch.assumption.cell, branch.assumption.symbol, true, left);
      for (const step of branch.steps) domains.apply(step);
      const result = proof.add(
        "contradiction@1",
        [domains.roots[defined(branch.contradiction, "contradiction").cell]],
        {
          kind: "false",
        },
      );
      children.push({ assumption: left, result, children: [], cover: null });
    }
    proof.scope = [assumption];
    result = proof.add(
      "cases@1",
      [cover, ...children.flatMap((child) => [child.assumption, child.result])],
      {
        kind: "false",
      },
    );
  } else
    result = proof.add(
      "contradiction@1",
      [outer.roots[defined(plan.outer.contradiction, "contradiction").cell]],
      {
        kind: "false",
      },
    );
  proof.scope = [];
  const root = proof.add(
    "discharge@1",
    [assumption, result],
    proposedClause([{ ...value, positive: false }]),
  );
  const mode = plan.mode ?? (plan.branches ? "nested" : "static");
  return proof.finish(
    "c23@1",
    {
      kind: "net",
      mode,
      alias:
        mode === "nested"
          ? "Nested forcing"
          : mode === "dynamic"
            ? "Dynamic forcing nets"
            : "Static forcing nets",
      branch: { assumption, result, children, cover },
      root,
    },
    { kind: "remove", cell: value.cell, symbol: value.symbol },
    root,
  );
}
