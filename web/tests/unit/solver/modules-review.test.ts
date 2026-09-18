import { describe, expect, test } from "vitest";
import { canonicalProblem, normalizeClassic } from "../../../src/solver/problem";
import type { ConstraintInstance, EngineProblem } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { productionRules } from "../../../src/solver/rules/registry";
import { OrderRule } from "../../../src/solver/rules/order";
import { initialize, retainedProof, commitChecked } from "../../../src/solver/state/candidates";
import { checkProposal } from "../../../src/solver/proof/checker";
import { replay } from "../../../src/solver/proof/replay";
import { makeSnapshot } from "../../../src/solver/snapshot";
import type {
  CheckContext,
  DeductionProposal,
  PrimitiveInput,
} from "../../../src/solver/proof/types";
import type { ReadView } from "../../../src/solver/state/types";
import { discoveryContext } from "../../solver/discovery-context";

const limits = discoveryContext().limits;

function problem(
  cellCount: number,
  symbolCount: number,
  givens: number[],
  constraints: ConstraintInstance[],
): EngineProblem {
  return canonicalProblem({
    schema: 1,
    cells: Array.from({ length: cellCount }, (_, cell) => cell),
    symbols: Array.from({ length: symbolCount }, (_, index) => index + 1),
    givens: Array.from({ length: cellCount }, (_, cell) => givens[cell] ?? 0),
    constraints,
  });
}

function view(input: EngineProblem): ReadView {
  const result = assemble(input, productionRules());
  if (!result.ok)
    throw new Error(result.issues.map((issue) => `${issue.code}: ${issue.message}`).join("; "));
  return initialize(result.value, "primary");
}

function context(current: ReadView): CheckContext {
  return {
    view: current,
    retained: retainedProof(current),
    limits,
    policy: "unconditional",
    uniqueEvidenceId: null,
  };
}

/** The rule root node id of a constraint in the initialized view. */
function ruleRoot(current: ReadView, id: string): number {
  const fact = [...current.facts.values()].find(
    (entry) => entry.proposition.kind === "rule" && entry.proposition.constraintId === id,
  );
  if (!fact) throw new Error(`no rule root ${id}`);
  return fact.root;
}

describe("module capability derivations reject what the rule does not say (M1-M4)", () => {
  const capability = (
    current: ReadView,
    rule: string,
    primitive: string,
    conclusion: PrimitiveInput["conclusion"],
  ): PrimitiveInput => ({
    rule: primitive,
    premises: [ruleRoot(current, rule)],
    parameters: { constraintId: rule },
    conclusion,
  });
  const check = (current: ReadView, rule: string, input: PrimitiveInput) =>
    current.assembly.modules.get(rule)!.checkPrimitive(input, context(current));

  test("cage@1 (M1): wrong total, unsorted cells, covers", () => {
    const current = view(
      problem(9, 9, [], [{ id: "k", type: "cage@1", cells: [2, 0, 1], parameters: { total: 6 } }]),
    );
    const good = capability(current, "k", "sum@1", {
      kind: "sum",
      cells: [0, 1, 2],
      coefficients: [1, 1, 1],
      total: 6,
    });
    expect(check(current, "k", good).rules).toEqual(["k"]);
    expect(() =>
      check(current, "k", { ...good, conclusion: { ...good.conclusion, total: 7 } as never }),
    ).toThrow("invalid-sum-equation");
    expect(() =>
      check(current, "k", {
        ...good,
        conclusion: { kind: "sum", cells: [2, 0, 1], coefficients: [1, 1, 1], total: 6 },
      }),
    ).toThrow("invalid-sum-equation");
    expect(() =>
      check(
        current,
        "k",
        capability(current, "k", "cover@1", { kind: "cover", symbol: 1, cells: [0, 1, 2] }),
      ),
    ).toThrow("missing-rule-premise");
    expect(() =>
      check(
        current,
        "k",
        capability(current, "k", "all-different@1", { kind: "all-different", cells: [0, 1] }),
      ),
    ).toThrow("invalid-all-different-scope");
  });

  test("arrow@1 (M2): swapped sign, wrong total", () => {
    const current = view(
      problem(9, 9, [], [{ id: "a", type: "arrow@1", cells: [5, 3, 4], parameters: {} }]),
    );
    const good = capability(current, "a", "sum@1", {
      kind: "sum",
      cells: [3, 4, 5],
      coefficients: [1, 1, -1],
      total: 0,
    });
    expect(check(current, "a", good).rules).toEqual(["a"]);
    expect(() =>
      check(current, "a", {
        ...good,
        conclusion: { kind: "sum", cells: [3, 4, 5], coefficients: [-1, -1, 1], total: 0 },
      }),
    ).toThrow("invalid-sum-equation");
    expect(() =>
      check(current, "a", {
        ...good,
        conclusion: { kind: "sum", cells: [3, 4, 5], coefficients: [1, 1, -1], total: 1 },
      }),
    ).toThrow("invalid-sum-equation");
  });

  test("order@1 (M3): swapped orientation and a foreign alphabet", () => {
    const current = view(
      problem(4, 3, [], [{ id: "o", type: "order@1", cells: [2, 0], parameters: {} }]),
    );
    const forward = [
      [1, 2],
      [1, 3],
      [2, 3],
    ];
    const backward = [
      [2, 1],
      [3, 1],
      [3, 2],
    ];
    const good = capability(current, "o", "relation@1", {
      kind: "relation",
      cells: [0, 2],
      tuples: backward,
    });
    expect(check(current, "o", good).rules).toEqual(["o"]);
    expect(() =>
      check(current, "o", {
        ...good,
        conclusion: { kind: "relation", cells: [0, 2], tuples: forward },
      }),
    ).toThrow("invalid-relation-tuples");
    expect(() =>
      check(current, "o", {
        ...good,
        conclusion: { kind: "relation", cells: [2, 0], tuples: backward },
      }),
    ).toThrow("invalid-relation-tuples");
    // The tuple cache is keyed on the alphabet too: the same instance over 1..4 yields 6 pairs.
    const rule = current.assembly.problem.constraints[0];
    const order = new OrderRule();
    expect(order.tuples(rule, current.assembly.problem)).toHaveLength(3);
    expect(order.tuples(rule, { ...current.assembly.problem, symbols: [1, 2, 3, 4] })).toHaveLength(
      6,
    );
    expect(order.tuples(rule, current.assembly.problem)).toHaveLength(3);
  });

  test("all-different@1 (M4): a house sum needs a full house and the right total", () => {
    const current = view(
      problem(
        9,
        9,
        [],
        [
          {
            id: "house",
            type: "all-different@1",
            cells: [0, 1, 2, 3, 4, 5, 6, 7, 8],
            parameters: {},
          },
          { id: "small", type: "all-different@1", cells: [0, 1, 2], parameters: {} },
        ],
      ),
    );
    const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const good = capability(current, "house", "sum@1", {
      kind: "sum",
      cells,
      coefficients: cells.map(() => 1),
      total: 45,
    });
    expect(check(current, "house", good).rules).toEqual(["house"]);
    expect(() =>
      check(current, "house", { ...good, conclusion: { ...good.conclusion, total: 44 } as never }),
    ).toThrow("invalid-house-sum");
    expect(() =>
      check(
        current,
        "small",
        capability(current, "small", "sum@1", {
          kind: "sum",
          cells: [0, 1, 2],
          coefficients: [1, 1, 1],
          total: 6,
        }),
      ),
    ).toThrow("invalid-house-sum");
  });
});

describe("maintenance bundles replay from original clues", () => {
  test("rule-relation@1 and rule-sum@1 bundles replay without discovery", () => {
    const start = view(
      problem(
        4,
        5,
        [0, 0, 0, 0],
        [
          { id: "t0", type: "order@1", cells: [0, 1], parameters: {} },
          { id: "t1", type: "order@1", cells: [1, 2], parameters: {} },
          { id: "k", type: "cage@1", cells: [2, 3], parameters: { total: 4 } },
        ],
      ),
    );
    let current = start;
    const bundles: DeductionProposal[] = [];
    let progress = true;
    while (progress) {
      progress = false;
      for (const rule of current.assembly.problem.constraints)
        for (const event of current.assembly.modules.get(rule.id)!.propagate(current, rule)) {
          if (event.kind !== "proposal") continue;
          const checked = [...checkProposal(event.proposal, context(current))].at(-1);
          if (checked?.kind !== "checked") throw new Error("rejected");
          bundles.push(event.proposal);
          current = commitChecked(current, checked.step).view;
          progress = true;
        }
    }
    expect(bundles.map((b) => b.technique)).toContain("rule-relation@1");
    expect(bundles.map((b) => b.technique)).toContain("rule-sum@1");
    const snapshot = makeSnapshot(start.assembly.problem, { kind: "manual" }, "variants", 0);
    expect([...replay(snapshot, bundles, start.assembly, limits)].at(-1)?.kind).toBe("checked");
    const altered = structuredClone(bundles);
    (altered[0].effects[0] as { symbol: number }).symbol =
      altered[0].effects[0].symbol === 1 ? 2 : 1;
    expect([...replay(snapshot, altered, start.assembly, limits)].at(-1)?.kind).toBe("rejected");
  });
});

describe("rule count near the cap", () => {
  test("a 9x9 negative-kropki grid (27 houses + 144 pair instances) assembles and initializes", () => {
    const classic = normalizeClassic({
      kind: "classic",
      version: 1,
      width: 9,
      height: 9,
      givens: Array(81).fill(0),
    });
    const pairs: ConstraintInstance[] = [];
    for (let cell = 0; cell < 81; cell += 1) {
      if (cell % 9 < 8)
        pairs.push({
          id: `dot:${cell}-${cell + 1}`,
          type: "difference@1",
          cells: [cell, cell + 1],
          parameters: { kind: "neither" },
        });
      if (cell < 72)
        pairs.push({
          id: `dot:${cell}-${cell + 9}`,
          type: "difference@1",
          cells: [cell, cell + 9],
          parameters: { kind: "neither" },
        });
    }
    expect(pairs).toHaveLength(144);
    const problem = canonicalProblem({
      schema: 1,
      cells: classic.cells,
      symbols: classic.symbols,
      givens: classic.givens,
      constraints: [...classic.constraints, ...pairs],
    });
    expect(problem.constraints).toHaveLength(171);
    const current = view(problem);
    expect(current.assembly.relations).toHaveLength(144);
    expect(current.assembly.sums).toHaveLength(27);
  });
});
