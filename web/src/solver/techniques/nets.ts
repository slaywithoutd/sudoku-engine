import type { ReadView } from "../state/types";
import type { DeductionProposal } from "../proof/types";
import { proposedClause } from "../proof/builder";
import { ForcingProof, bit, type ForcingLink } from "./forcing-proof";
import { houseWithCells } from "../state/read";
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
    readonly b: ForcingProof,
    parent?: NetDomains,
  ) {
    this.masks = [...(parent?.masks ?? b.view.state.domains)];
    this.roots = [...(parent?.roots ?? b.view.state.domainFacts)];
  }
  restrict(cell: number, symbol: number, positive: boolean, root: number): void {
    const mask = positive ? this.masks[cell] & bit(symbol) : this.masks[cell] & ~bit(symbol);
    this.roots[cell] = this.b.add("domain-restrict@1", [this.roots[cell], root], {
      kind: "domain",
      cell,
      mask,
    });
    this.masks[cell] = mask;
  }
  cover(house: string, symbol: number): number {
    const cells = this.b.house(house),
      supports = cells.filter((c) => this.masks[c] & bit(symbol));
    const support = this.b.add(
      "support@1",
      [this.b.fact({ kind: "cover", cells, symbol }), ...cells.map((c) => this.roots[c])],
      { kind: "cover", cells: supports, symbol },
    );
    return this.b.add(
      "cover-clause@1",
      [support],
      proposedClause(supports.map((cell) => ({ cell, symbol, positive: true }))),
    );
  }
  apply(step: NetOperation): void {
    const b = this.b;
    let source: number | undefined, symbol: number | undefined;
    if (step.kind === "singleton-peer") {
      symbol = Math.log2(step.mask) + 1;
      source = b.add(
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
          const cell = reason.cell!;
          clause = b.add(
            "cover-clause@1",
            [this.roots[cell]],
            proposedClause(
              b.view.assembly.problem.symbols
                .filter((s) => this.masks[cell] & bit(s))
                .map((symbol) => ({ cell, symbol, positive: true })),
            ),
          );
        } else if (reason.kind === "house-cover")
          clause = this.cover(reason.house!, reason.symbol!);
        else
          clause = b.add(
            "weak-link@1",
            [
              reason.kind === "cell-conflict"
                ? this.roots[reason.cell!]
                : b.fact({ kind: "all-different", cells: b.house(reason.house!) }),
            ],
            proposedClause([{ ...link.from, positive: !link.from.positive }, link.to]),
          );
        source = b.add("resolution@1", [source, clause], proposedClause([link.to]));
      }
    }
    for (const [cell, mask] of step.effects) {
      if (step.kind === "hidden-single") {
        this.restrict(cell, symbol!, true, source!);
        continue;
      }
      const removed = this.masks[cell] & ~mask;
      for (const digit of b.view.assembly.problem.symbols)
        if (removed & bit(digit)) {
          let root: number;
          if (step.kind === "singleton-peer") {
            const house = houseWithCells(b.view, step.cell, cell);
            const weak = b.add(
              "weak-link@1",
              [b.fact({ kind: "all-different", cells: house.cells })],
              proposedClause([
                { cell: step.cell, symbol: digit, positive: false },
                { cell, symbol: digit, positive: false },
              ]),
            );
            root = b.add(
              "resolution@1",
              [source!, weak],
              proposedClause([{ cell, symbol: digit, positive: false }]),
            );
          } else if (step.kind === "locked") {
            root = source!;
            for (const [i, c] of step.supports.entries()) {
              const weak = b.add(
                "weak-link@1",
                [b.fact({ kind: "all-different", cells: b.house(step.otherHouse) })],
                proposedClause([
                  { cell: c, symbol: digit, positive: false },
                  { cell, symbol: digit, positive: false },
                ]),
              );
              root = b.add(
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
            root = b.add(
              "hall@1",
              [
                b.fact({ kind: "all-different", cells: b.house(step.house) }),
                ...step.cells.map((c) => this.roots[c]),
              ],
              proposedClause([{ cell, symbol: digit, positive: false }]),
            );
          else root = source!;
          this.restrict(cell, digit, false, root);
        }
    }
  }
}

/** Compile finite basic steps, then optional complete second-level cell cases. */
export function compileNet(view: ReadView, plan: NetPlan): DeductionProposal {
  const b = new ForcingProof(view),
    outer = new NetDomains(b),
    value = { ...plan.outer.assumption, positive: true };
  const assumption = b.add("assume@1", [], proposedClause([value]));
  b.scope = [assumption];
  outer.restrict(value.cell, value.symbol, true, assumption);
  for (const step of plan.outer.steps) outer.apply(step);
  let result: number,
    cover: number | null = null;
  const children: NetBranchCertificate[] = [];
  if (plan.branches) {
    const cell = plan.innerCell!,
      alternatives = plan.innerAlternatives!;
    cover = b.add(
      "cover-clause@1",
      [outer.roots[cell]],
      proposedClause(alternatives.map((symbol) => ({ cell, symbol, positive: true }))),
    );
    for (const branch of plan.branches) {
      b.scope = [assumption];
      const a = b.add("assume@1", [], proposedClause([{ ...branch.assumption, positive: true }]));
      b.scope = [assumption, a];
      const domains = new NetDomains(b, outer);
      domains.restrict(branch.assumption.cell, branch.assumption.symbol, true, a);
      for (const step of branch.steps) domains.apply(step);
      const result = b.add("contradiction@1", [domains.roots[branch.contradiction!.cell]], {
        kind: "false",
      });
      children.push({ assumption: a, result, children: [], cover: null });
    }
    b.scope = [assumption];
    result = b.add("cases@1", [cover, ...children.flatMap((c) => [c.assumption, c.result])], {
      kind: "false",
    });
  } else
    result = b.add("contradiction@1", [outer.roots[plan.outer.contradiction!.cell]], {
      kind: "false",
    });
  b.scope = [];
  const root = b.add(
    "discharge@1",
    [assumption, result],
    proposedClause([{ ...value, positive: false }]),
  );
  const mode = plan.mode ?? (plan.branches ? "nested" : "static");
  return b.finish(
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
