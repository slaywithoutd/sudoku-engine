import { describe, expect, test } from "vitest";
import { canonicalProblem } from "../../../src/solver/problem";
import type { ConstraintInstance } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import type { RuleModule } from "../../../src/solver/rules/types";
import { initialize, retainedProof } from "../../../src/solver/state/candidates";
import { verifyCertificate } from "../../../src/solver/proof/checker";
import { primitiveRegistry } from "../../../src/solver/proof/primitives";
import type {
  CheckContext,
  DeductionProposal,
  ProofNode,
  Proposition,
} from "../../../src/solver/proof/types";
import { mockRuleRegistry } from "../../solver/mock-rules";

const limits = {
  timeMs: 10000,
  workUnits: 100000,
  exactNodes: 100000,
  stepNodes: 4096,
  runNodes: 20000,
  proofBytes: 8000000,
  stepBytes: 2000000,
  batchBytes: 65536,
  inFlightBatches: 2,
  workspaceBytes: 16000000,
};

const sum = (id: string, cells: number[], total: number): ConstraintInstance => ({
  id,
  type: "sum@1",
  cells,
  parameters: { total },
});

/**
 * Non-applying certificate verification over a mock problem (D071). Sum facts
 * come from the test-only sum@1 module; a coefficient override lets a test
 * publish a signed equation the mock would not otherwise produce.
 */
function fixture(
  cellCount: number,
  givens: number[],
  constraints: ConstraintInstance[],
  coefficients?: Record<string, number[]>,
) {
  let registry: readonly RuleModule[] = mockRuleRegistry;
  if (coefficients) {
    const base = mockRuleRegistry.find(({ type }) => type === "sum@1")!;
    const patched: RuleModule = {
      ...base,
      capabilities(rule, context) {
        const capabilities = base.capabilities(rule, context);
        const override = coefficients[rule.id];
        return override
          ? {
              ...capabilities,
              sums: capabilities.sums.map((entry) => ({ ...entry, coefficients: override })),
            }
          : capabilities;
      },
      checkPrimitive(input, context) {
        if (input.rule === "sum@1" && input.conclusion.kind === "sum") {
          const id = (input.parameters as { constraintId: string }).constraintId;
          const override = coefficients[id];
          if (override) {
            const checked = base.checkPrimitive(
              {
                ...input,
                conclusion: {
                  ...input.conclusion,
                  coefficients: input.conclusion.cells.map(() => 1),
                },
              },
              context,
            );
            return { ...checked, conclusion: input.conclusion };
          }
        }
        return base.checkPrimitive(input, context);
      },
    };
    registry = mockRuleRegistry.map((rule) => (rule.type === "sum@1" ? patched : rule));
  }
  const result = assemble(
    canonicalProblem({
      schema: 1,
      cells: Array.from({ length: cellCount }, (_, cell) => cell),
      symbols: Array.from({ length: 9 }, (_, index) => index + 1),
      givens: Array.from({ length: cellCount }, (_, cell) => givens[cell] ?? 0),
      constraints,
    }),
    registry,
  );
  if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join("; "));
  const view = initialize(result.value, "primary");
  const context: CheckContext = {
    view,
    retained: retainedProof(view),
    limits,
    policy: "discharged",
    uniqueEvidenceId: null,
  };
  const nodes: ProofNode[] = [];
  const addScoped = (
    rule: string,
    premises: number[],
    conclusion: Proposition,
    scope: number[],
    parameters = {},
  ) => {
    const id = context.retained.size + nodes.length;
    nodes.push({ id, rule, premises, conclusion, scope, parameters });
    return id;
  };
  const add = (rule: string, premises: number[], conclusion: Proposition, parameters = {}) =>
    addScoped(rule, premises, conclusion, [], parameters);
  const proposal = (roots: number[]): DeductionProposal => ({
    technique: "rule-propagation@1",
    state: view.state.key,
    effects: [],
    pattern: { kind: "roots" },
    proof: {
      state: view.state.key,
      nodes: [...nodes],
      imports: [
        ...new Set(nodes.flatMap((node) => node.premises.filter((id) => context.retained.has(id)))),
      ],
      roots,
    },
  });
  /** Verify only the nodes built inside `build`; the proposal is discarded afterwards. */
  const check = (build: () => number) => {
    const start = nodes.length;
    const root = build();
    const result = [...verifyCertificate(proposal([root]), context)].at(-1)!;
    nodes.length = start;
    return result;
  };
  const sumFact = (ruleId: string) => {
    const fact = [...view.facts.values()].find(
      (entry) => entry.proposition.kind === "sum" && entry.rules.includes(ruleId),
    );
    if (!fact) throw new Error(`no sum fact for ${ruleId}`);
    return fact.id;
  };
  const domain = (cell: number) => view.state.domainFacts[cell];
  return { add, addScoped, check, sumFact, domain, view };
}

const not = (cell: number, symbol: number): Proposition => ({
  kind: "literal",
  value: { cell, symbol, positive: false },
});
const FALSE: Proposition = { kind: "false" };

describe("linear-sum@1 (lemma LS)", () => {
  test("is registered and eliminates a candidate the minima of the others exclude", () => {
    expect(primitiveRegistry.has("linear-sum@1")).toBe(true);
    expect(primitiveRegistry.has("linear-combine@1")).toBe(true);
    const b = fixture(3, [], [sum("s", [0, 1, 2], 6)]);
    const premises = [b.sumFact("s"), b.domain(0), b.domain(1), b.domain(2)];
    // 9 + 1 + 1 > 6: cell 0 cannot be 9.
    expect(b.check(() => b.add("linear-sum@1", premises, not(0, 9)))).toMatchObject({
      kind: "verified",
      certificate: { consequences: [{ openAssumptions: [], conditional: false, rules: ["s"] }] },
    });
    // 4 + 1 + 1 = 6 reaches the total: cell 0 may still be 4.
    expect(b.check(() => b.add("linear-sum@1", premises, not(0, 4)))).toMatchObject({
      kind: "rejected",
      code: "linear-sum-not-excluded",
    });
    // 3 <= 6 <= 27: no contradiction from full domains.
    expect(b.check(() => b.add("linear-sum@1", premises, FALSE))).toMatchObject({
      kind: "rejected",
      code: "linear-sum-not-contradictory",
    });
  });

  test("uses a placed cell's given literal as its singleton domain and honors a negative coefficient", () => {
    // cell0 - cell1 = 3 with cell1 given 3 (a positive literal, not a domain node): cell0 must be 6.
    const b = fixture(2, [0, 3], [sum("eq", [0, 1], 3)], { eq: [1, -1] });
    const premises = [b.sumFact("eq"), b.domain(0), b.domain(1)];
    const eqFact = b.view.facts.get(b.sumFact("eq"))!;
    expect(eqFact.proposition).toEqual({
      kind: "sum",
      cells: [0, 1],
      coefficients: [1, -1],
      total: 3,
    });
    expect(b.check(() => b.add("linear-sum@1", premises, not(0, 5)))).toMatchObject({
      kind: "verified",
    });
    expect(b.check(() => b.add("linear-sum@1", premises, not(0, 7)))).toMatchObject({
      kind: "verified",
    });
    expect(b.check(() => b.add("linear-sum@1", premises, not(0, 6)))).toMatchObject({
      kind: "rejected",
      code: "linear-sum-not-excluded",
    });
  });

  test("concludes false when every maximum falls short of the total", () => {
    const b = fixture(2, [], [sum("big", [0, 1], 19)]);
    expect(
      b.check(() => b.add("linear-sum@1", [b.sumFact("big"), b.domain(0), b.domain(1)], FALSE)),
    ).toMatchObject({ kind: "verified" });
  });

  test("rejects missing, foreign or extra domain premises, foreign targets and malformed claims", () => {
    const b = fixture(4, [], [sum("s", [0, 1, 2], 6)]);
    const s = b.sumFact("s");
    expect(
      b.check(() => b.add("linear-sum@1", [s, b.domain(0), b.domain(1)], not(0, 9))),
    ).toMatchObject({
      kind: "rejected",
      code: "incomplete-domain-evidence",
    });
    expect(
      b.check(() => b.add("linear-sum@1", [s, b.domain(0), b.domain(1), b.domain(3)], not(0, 9))),
    ).toMatchObject({ kind: "rejected", code: "incomplete-domain-evidence" });
    expect(
      b.check(() =>
        b.add("linear-sum@1", [s, b.domain(0), b.domain(1), b.domain(2), b.domain(3)], not(0, 9)),
      ),
    ).toMatchObject({ kind: "rejected", code: "incomplete-domain-evidence" });
    expect(
      b.check(() => b.add("linear-sum@1", [s, b.domain(0), b.domain(1), b.domain(2)], not(3, 9))),
    ).toMatchObject({ kind: "rejected", code: "target-outside-sum" });
    expect(
      b.check(() => b.add("linear-sum@1", [b.domain(0), s, b.domain(1), b.domain(2)], not(0, 9))),
    ).toMatchObject({ kind: "rejected", code: "expected-sum" });
    expect(
      b.check(() =>
        b.add("linear-sum@1", [s, b.domain(0), b.domain(1), b.domain(2)], not(0, 9), { extra: 1 }),
      ),
    ).toMatchObject({ kind: "rejected", code: "invalid-inference-parameters" });
    const premises = [s, b.domain(0), b.domain(1), b.domain(2)];
    expect(
      b.check(() =>
        b.add("linear-sum@1", premises, {
          kind: "literal",
          value: { cell: 0, symbol: 9, positive: true },
        }),
      ),
    ).toMatchObject({ kind: "rejected", code: "expected-negative-literal" });
    expect(
      b.check(() =>
        b.add("linear-sum@1", premises, { ...not(0, 9), extra: 1 } as unknown as Proposition),
      ),
    ).toMatchObject({ kind: "rejected", code: "expected-negative-literal" });
    expect(
      b.check(() =>
        b.add("linear-sum@1", premises, { kind: "false", extra: 1 } as unknown as Proposition),
      ),
    ).toMatchObject({ kind: "rejected", code: "invalid-inference-conclusion" });
  });

  test("rejects a target already absent from its domain and inherits an assumption into a discharge", () => {
    // cell1 given 3: 3 is the only symbol in cell1's singleton domain.
    const b = fixture(3, [0, 3, 0], [sum("s", [0, 1, 2], 6)]);
    const premises = [b.sumFact("s"), b.domain(0), b.domain(1), b.domain(2)];
    expect(b.check(() => b.add("linear-sum@1", premises, not(1, 5)))).toMatchObject({
      kind: "rejected",
      code: "target-already-absent",
    });
    // Assume cell0 = 9: 9 + 3 + 1 > 6 is a contradiction under that assumption alone,
    // and discharging it yields the unconditional negative literal.
    expect(
      b.check(() => {
        const a = b.addScoped(
          "assume@1",
          [],
          { kind: "literal", value: { cell: 0, symbol: 9, positive: true } },
          [],
        );
        const contradiction = b.addScoped(
          "linear-sum@1",
          [b.sumFact("s"), a, b.domain(1), b.domain(2)],
          FALSE,
          [a],
        );
        return b.add("discharge@1", [a, contradiction], not(0, 9));
      }),
    ).toMatchObject({
      kind: "verified",
      certificate: { consequences: [{ openAssumptions: [], conditional: false, rules: ["s"] }] },
    });
  });
});

describe("linear-combine@1 (lemma LC)", () => {
  const houses = [
    sum("h1", [0, 1, 2, 3, 4, 5, 6, 7, 8], 45),
    sum("h2", [9, 10, 11, 12, 13, 14, 15, 16, 17], 45),
  ];
  const cages = [
    sum("c1", [0, 1], 5),
    sum("c2", [2, 3], 7),
    sum("c3", [4, 5, 9], 10),
    sum("c4", [6, 10], 8),
    sum("c5", [11, 12], 9),
    sum("c6", [13, 14, 15], 12),
    sum("c7", [7, 16], 9),
  ];
  const residual: Proposition = {
    kind: "sum",
    cells: [7, 8, 16, 17],
    coefficients: [1, 1, 1, 1],
    total: 39,
  };

  test("cancels two houses against six cages in one node and rejects a seventh", () => {
    const b = fixture(18, [], [...houses, ...cages]);
    const ids = (names: string[]) => names.map((name) => b.sumFact(name));
    const six = ids(["h1", "h2", "c1", "c2", "c3", "c4", "c5", "c6"]);
    const multipliers = [1, 1, -1, -1, -1, -1, -1, -1];
    expect(b.check(() => b.add("linear-combine@1", six, residual, { multipliers }))).toMatchObject({
      kind: "verified",
      certificate: {
        consequences: [
          { rules: ["c1", "c2", "c3", "c4", "c5", "c6", "h1", "h2"], conditional: false },
        ],
      },
    });
    expect(
      b.check(() => b.add("linear-combine@1", six, { ...residual, total: 40 }, { multipliers })),
    ).toMatchObject({ kind: "rejected", code: "invalid-linear-combination" });
    expect(
      b.check(() =>
        b.add("linear-combine@1", six, residual, { multipliers: [1, 1, -1, -1, -1, -1, -1, 2] }),
      ),
    ).toMatchObject({ kind: "rejected", code: "invalid-linear-combine-multipliers" });
    expect(
      b.check(() =>
        b.add("linear-combine@1", six, residual, { multipliers: [1, 1, -1, -1, -1, -1, -1] }),
      ),
    ).toMatchObject({ kind: "rejected", code: "invalid-linear-combine-multipliers" });
    expect(
      b.check(() =>
        b.add("linear-combine@1", [b.sumFact("h1"), b.domain(0)], residual, {
          multipliers: [1, 1],
        }),
      ),
    ).toMatchObject({ kind: "rejected", code: "expected-sum" });
    // Two houses added without cancellation leave 18 cells: outside the 16-cell profile.
    expect(
      b.check(() =>
        b.add(
          "linear-combine@1",
          [b.sumFact("h1"), b.sumFact("h2")],
          {
            kind: "sum",
            cells: Array.from({ length: 18 }, (_, cell) => cell),
            coefficients: Array.from({ length: 18 }, () => 1),
            total: 90,
          },
          { multipliers: [1, 1] },
        ),
      ),
    ).toMatchObject({ kind: "rejected", code: "linear-combine-out-of-profile" });
    const seven = ids(["h1", "h2", "c1", "c2", "c3", "c4", "c5", "c6", "c7"]);
    expect(
      b.check(() =>
        b.add(
          "linear-combine@1",
          seven,
          { kind: "sum", cells: [8, 17], coefficients: [1, 1], total: 30 },
          { multipliers: [1, 1, -1, -1, -1, -1, -1, -1, -1] },
        ),
      ),
    ).toMatchObject({ kind: "rejected", code: "linear-combine-premise-count" });
  });

  test("nests: a combined cage pair feeds a later combination, then linear-sum closes the residual", () => {
    const b = fixture(18, [], [...houses, ...cages]);
    expect(
      b.check(() => {
        const pair = b.add(
          "linear-combine@1",
          [b.sumFact("c1"), b.sumFact("c2")],
          { kind: "sum", cells: [0, 1, 2, 3], coefficients: [1, 1, 1, 1], total: 12 },
          { multipliers: [1, 1] },
        );
        return b.add(
          "linear-combine@1",
          [b.sumFact("h1"), pair],
          { kind: "sum", cells: [4, 5, 6, 7, 8], coefficients: [1, 1, 1, 1, 1], total: 33 },
          { multipliers: [1, -1] },
        );
      }),
    ).toMatchObject({ kind: "verified" });
    // Residual of the six-cage cancellation: four cells summing to 39 exceed 4 * 9.
    const six = ["h1", "h2", "c1", "c2", "c3", "c4", "c5", "c6"].map((name) => b.sumFact(name));
    expect(
      b.check(() => {
        const combined = b.add("linear-combine@1", six, residual, {
          multipliers: [1, 1, -1, -1, -1, -1, -1, -1],
        });
        return b.add(
          "linear-sum@1",
          [combined, b.domain(7), b.domain(8), b.domain(16), b.domain(17)],
          FALSE,
        );
      }),
    ).toMatchObject({ kind: "verified" });
  });

  test("a fully cancelled combination is false only when its totals disagree", () => {
    const b = fixture(2, [], [sum("a", [0, 1], 5), sum("b", [0, 1], 6), sum("c", [0, 1], 5)]);
    expect(
      b.check(() =>
        b.add("linear-combine@1", [b.sumFact("a"), b.sumFact("c")], FALSE, {
          multipliers: [1, -1],
        }),
      ),
    ).toMatchObject({ kind: "rejected", code: "linear-combine-trivial" });
    expect(
      b.check(() =>
        b.add("linear-combine@1", [b.sumFact("a"), b.sumFact("b")], FALSE, {
          multipliers: [1, -1],
        }),
      ),
    ).toMatchObject({ kind: "verified" });
    expect(
      b.check(() =>
        b.add("linear-combine@1", [b.sumFact("a"), b.sumFact("a")], FALSE, {
          multipliers: [1, -1],
        }),
      ),
    ).toMatchObject({ kind: "rejected" }); // duplicate premise ids fail node-id validation first
  });
});
