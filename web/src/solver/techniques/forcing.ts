import type { ReadView, Literal } from "../state/types";
import type { Effect, DeductionProposal } from "../proof/types";
import { proposedClause } from "../proof/builder";
import {
  ForcingProof,
  opposite,
  symbols,
  type ForcingLink,
  type PathCertificate,
} from "./forcing-proof";
import { forcingDescriptor, discoverForcing } from "./forcing-runtime";
import { defined } from "../invariants";

export interface ForcingPlan {
  /** D088: retain the complete negative theorem without candidate progress. */
  readonly mode?: "cache";
  readonly cacheTarget?: Literal;
  readonly kind: "digit" | "cell" | "unit" | "nishio";
  readonly alias: string;
  readonly cover: {
    readonly cell?: number;
    readonly house?: string;
    readonly symbol?: number;
    readonly candidate?: Literal;
  };
  readonly alternatives: readonly Literal[];
  readonly branches: readonly {
    readonly assumption: Literal;
    readonly result: Literal | "false";
    readonly paths: readonly (readonly ForcingLink[])[];
  }[];
}
export interface ForcingCertificate {
  readonly cover: number | null;
  readonly branches: readonly {
    readonly assumption: number;
    readonly result: number;
    readonly paths: readonly PathCertificate[];
  }[];
  readonly root: number;
}
/** Syntax compilation only. Independent grammar binds every path to its cases. */
export function compileForcing(
  view: ReadView,
  plan: ForcingPlan,
  effect: Effect,
): DeductionProposal {
  const proof = new ForcingProof(view);
  let cover: number | null = null;
  if (plan.kind === "cell") cover = proof.cover(defined(plan.cover.cell, "cell"));
  else if (plan.kind === "unit")
    cover = proof.houseCover(
      defined(plan.cover.house, "house"),
      defined(plan.cover.symbol, "symbol"),
    );
  else if (plan.kind === "digit") {
    const candidate = defined(plan.cover.candidate, "candidate");
    cover = proof.cover(candidate.cell);
    const others = symbols(view, candidate.cell).filter((symbol) => symbol !== candidate.symbol);
    for (const [i, symbol] of others.entries()) {
      const weak = proof.edge({
        from: { ...candidate, symbol },
        to: opposite(candidate),
        reason: { kind: "cell-conflict", cell: candidate.cell },
      });
      cover = proof.add(
        "resolution@1",
        [cover, weak],
        proposedClause([
          candidate,
          opposite(candidate),
          ...others.slice(i + 1).map((symbol) => ({ ...candidate, symbol })),
        ]),
      );
    }
  }
  const cases = plan.branches.map((branch) => {
    proof.scope = [];
    const assumption = proof.add("assume@1", [], proposedClause([branch.assumption]));
    proof.scope = [assumption];
    const paths = branch.paths.map((path) => proof.path(assumption, path));
    const result =
      branch.result === "false"
        ? proof.add(
            "contradiction@1",
            paths.map((certificate) => certificate.end),
            { kind: "false" },
          )
        : paths[0].end;
    return { assumption, paths, result };
  });
  proof.scope = [];
  let root: number;
  if (plan.kind === "nishio")
    root = proof.add(
      "discharge@1",
      [cases[0].assumption, cases[0].result],
      proposedClause([{ cell: effect.cell, symbol: effect.symbol, positive: false }]),
    );
  else {
    // CasesStrategy consumes the canonical signed-clause order (negative first).
    const ordered = cases
      .map((branch, i) => ({ c: branch, a: plan.branches[i].assumption }))
      .sort(
        (left, right) =>
          left.a.cell - right.a.cell ||
          left.a.symbol - right.a.symbol ||
          Number(left.a.positive) - Number(right.a.positive),
      );
    root = proof.add(
      "cases@1",
      [
        defined(cover, "cover"),
        ...ordered.flatMap(({ c: branch }) => [branch.assumption, branch.result]),
      ],
      proposedClause([
        { cell: effect.cell, symbol: effect.symbol, positive: effect.kind === "place" },
      ]),
    );
  }
  if (plan.mode === "cache") {
    if (effect.kind !== "remove") throw Error("forcing-cache-negative-only");
    return proof.bundle(
      "c22@1",
      {
        ...plan,
        cacheTarget: { cell: effect.cell, symbol: effect.symbol, positive: false },
        certificate: { cover, branches: cases, root } satisfies ForcingCertificate,
      },
      [],
      [root],
    );
  }
  return proof.finish(
    "c22@1",
    { ...plan, certificate: { cover, branches: cases, root } satisfies ForcingCertificate },
    effect,
    root,
  );
}
export type { ForcingLink } from "./forcing-proof";
export const forcingTechniques = Object.freeze([forcingDescriptor("C22", discoverForcing)]);
