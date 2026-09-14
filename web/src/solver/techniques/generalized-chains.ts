import type { ReadView } from "../state/types";
import type { DeductionProposal } from "../proof/types";
import type { WorkspaceReservation } from "../indexes/workspace";
import { proposedClause } from "../proof/builder";
import { ForcingProof } from "./forcing-proof";
import {
  candidateLiteral,
  members,
  type Candidate,
  type CandidateSet,
} from "./csp-variables";

export type GeneralizedGrammar =
  | "bivalue"
  | "z"
  | "t"
  | "whip"
  | "braid"
  | "g-whip"
  | "inserted-or-whip";
export interface GeneralizedPosition {
  readonly variable: string;
  readonly alternatives: CandidateSet;
  readonly left: Candidate;
  readonly leftConflict: Candidate | CandidateSet;
  readonly excluded: readonly {
    readonly literal: Candidate;
    readonly conflictWith: Candidate | CandidateSet;
  }[];
  readonly right: Candidate | CandidateSet | null;
  readonly role?: "or";
  readonly closingCandidate?: Candidate;
  readonly closingConflict?: Candidate;
}
export interface GeneralizedPlan {
  /** Complete theorem retention, never candidate progress or a cover-only issuer. */
  readonly mode?: "cache";
  /** OR branch only: the last right refutes this shared candidate directly. */
  readonly consequence?: Candidate;
  readonly grammar: GeneralizedGrammar;
  readonly target: Candidate;
  readonly positions: readonly GeneralizedPosition[];
  readonly source?: number;
  readonly alias?: string;
}
export interface ExclusionProof {
  readonly weak: readonly number[];
  readonly reductions: readonly number[];
  readonly result: number;
}
export interface PositionProof {
  readonly cover: number;
  readonly exclusions: readonly ExclusionProof[];
  readonly reductions: readonly number[];
  readonly result: number;
}
export interface GeneralizedCertificate {
  readonly assumption: number;
  readonly positions: readonly PositionProof[];
  readonly closing: ExclusionProof | null;
  readonly contradiction: number;
  readonly root: number;
}
export const generalizedAliases = {
  bivalue: "Bivalue chains",
  z: "z-chains",
  t: "t-whips",
  whip: "Whips",
  braid: "Braids",
  "g-whip": "g-whips",
  "inserted-or-whip": "OR-k whips",
} as const;

/** Untrusted ordered syntax compiler. Group truth is an OR clause: resolving
 * every member conflict derives a negative literal without assuming exclusivity.
 */
export class GeneralizedProof {
  readonly builder: ForcingProof;
  constructor(
    readonly view: ReadView,
    builder = new ForcingProof(view),
  ) {
    this.builder = builder;
  }
  cover(position: GeneralizedPosition, source?: number): number {
    if (position.role === "or") {
      if (source === undefined) throw Error("missing-proved-or-source");
      return source;
    }
    const cell = /^cell:(\d+)$/.exec(position.variable),
      house = /^(.*):symbol:(\d+)$/.exec(position.variable);
    if (!cell && !house) throw Error("missing-csp-variable");
    const scope = this.builder.scope;
    this.builder.scope = [];
    try {
      return cell
        ? this.builder.cover(Number(cell[1]))
        : this.builder.houseCover(house![1], Number(house![2]));
    } finally {
      this.builder.scope = scope;
    }
  }
  exclude(
    value: Candidate,
    witness: CandidateSet,
    root: number,
  ): ExclusionProof {
    const b = this.builder,
      weak: number[] = [],
      reductions: number[] = [];
    let result = root;
    for (const [i, from] of witness.entries()) {
      const house = this.view.assembly.allDifferent.find(
        (h) => h.cells.includes(from[0]) && h.cells.includes(value[0]),
      );
      const scope = b.scope;
      b.scope = [];
      let edge: number;
      try {
        edge = b.edge({
          from: candidateLiteral(from),
          to: candidateLiteral(value, false),
          reason:
            from[0] === value[0]
              ? { kind: "cell-conflict", cell: from[0] }
              : { kind: "scope-conflict", house: house?.id, symbol: from[1] },
        });
      } finally {
        b.scope = scope;
      }
      weak.push(edge);
      result = b.add(
        "resolution@1",
        [result, edge],
        proposedClause([
          ...witness.slice(i + 1).map((v) => candidateLiteral(v)),
          candidateLiteral(value, false),
        ]),
      );
      reductions.push(result);
    }
    return { weak, reductions, result };
  }
  /** Compile one lexical target assumption, or an existing OR case assumption. */
  positions(
    plan: GeneralizedPlan,
    assumption: number,
  ): Omit<GeneralizedCertificate, "root"> {
    const b = this.builder,
      prior: { values: CandidateSet; root: number }[] = [
        { values: [plan.target], root: assumption },
      ],
      positions: PositionProof[] = [];
    const witnessRoot = (values: CandidateSet) => {
      const found = prior.find(
        (p) => JSON.stringify(p.values) === JSON.stringify(values),
      );
      if (!found) throw Error("missing-earlier-right");
      return found.root;
    };
    for (const position of plan.positions) {
      const cover = this.cover(position, plan.source);
      const rejected = [
        { literal: position.left, conflictWith: position.leftConflict },
        ...position.excluded,
        ...(position.closingCandidate
          ? [
              {
                literal: position.closingCandidate,
                conflictWith: position.closingConflict!,
              },
            ]
          : []),
      ];
      const exclusions = rejected.map((e) =>
        this.exclude(
          e.literal,
          members(e.conflictWith),
          witnessRoot(members(e.conflictWith)),
        ),
      );
      let result = cover;
      const reductions: number[] = [];
      if (position.right === null) {
        const order = position.alternatives.map((v) =>
          rejected.findIndex(
            (e) => JSON.stringify(e.literal) === JSON.stringify(v),
          ),
        );
        result = b.add(
          "contradiction@1",
          [cover, ...order.map((i) => exclusions[i].result)],
          { kind: "false" },
        );
      } else {
        let remaining = [...position.alternatives];
        for (const [i, excluded] of [
          { literal: position.left },
          ...position.excluded,
        ].entries()) {
          remaining = remaining.filter(
            (v) => JSON.stringify(v) !== JSON.stringify(excluded.literal),
          );
          result = b.add(
            "resolution@1",
            [result, exclusions[i].result],
            proposedClause(remaining.map((v) => candidateLiteral(v))),
          );
          reductions.push(result);
        }
        prior.push({ values: members(position.right), root: result });
      }
      positions.push({ cover, exclusions, reductions, result });
    }
    let contradiction = positions.at(-1)!.result,
      closing: ExclusionProof | null = null;
    if (plan.positions.at(-1)!.right !== null) {
      const last = prior.at(-1)!;
      closing = this.exclude(
        plan.consequence ?? plan.target,
        last.values,
        last.root,
      );
      contradiction = plan.consequence
        ? closing.result
        : b.add("contradiction@1", [assumption, closing.result], {
            kind: "false",
          });
    }
    return { assumption, positions, closing, contradiction };
  }
}

/** Pure proof assembly; admission and resource limits belong to the caller. */
export function compileGeneralized(
  view: ReadView,
  plan: GeneralizedPlan,
  lease?: WorkspaceReservation,
): DeductionProposal {
  const compiler = new GeneralizedProof(view, new ForcingProof(view, lease)),
    b = compiler.builder;
  const assumption = b.add(
    "assume@1",
    [],
    proposedClause([candidateLiteral(plan.target)]),
  );
  b.scope = [assumption];
  const certificate = compiler.positions(plan, assumption);
  b.scope = [];
  const root = b.add(
    "discharge@1",
    [assumption, certificate.contradiction],
    proposedClause([candidateLiteral(plan.target, false)]),
  );
  const row =
    plan.grammar === "inserted-or-whip"
      ? "c28@1"
      : ["bivalue", "z"].includes(plan.grammar)
        ? "c25@1"
        : ["t", "whip"].includes(plan.grammar)
          ? "c26@1"
          : "c27@1";
  if (plan.mode === "cache")
    return b.bundle(
      row,
      {
        ...plan,
        alias: plan.alias ?? generalizedAliases[plan.grammar],
        certificate: { ...certificate, root },
      },
      [],
      [root],
    );
  return b.finish(
    row,
    {
      ...plan,
      alias: plan.alias ?? generalizedAliases[plan.grammar],
      certificate: { ...certificate, root },
    },
    { kind: "remove", cell: plan.target[0], symbol: plan.target[1] },
    root,
  );
}
