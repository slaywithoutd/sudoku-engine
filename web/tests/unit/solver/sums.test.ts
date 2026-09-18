import { describe, expect, test } from "vitest";
import { assemble } from "../../../src/solver/rules/assemble";
import { initialize } from "../../../src/solver/state/candidates";
import { symbolValue } from "../../../src/solver/problem";
import { M2_ROOT_LIMITS } from "../../../src/solver/limits";
import {
  assertM2RootAssemblyBounds,
  primitiveRegistry,
} from "../../../src/solver/proof/primitives";
import { replay, initializationReservation } from "../../../src/solver/proof/replay";
import { makeSnapshot } from "../../../src/solver/snapshot";
import { CandidateIndexes } from "../../../src/solver/state/indexes";
import { invalidate } from "../../../src/solver/state/events";
import type { ChangeSet } from "../../../src/solver/state/events";
import type { LinearSum, RuleModule } from "../../../src/solver/rules/types";
import { makeMockProblem, mockRuleRegistry } from "../../solver/mock-rules";

const limits = {
  timeMs: 10000,
  workUnits: 1000000,
  exactNodes: 10000,
  stepNodes: 4096,
  runNodes: 65536,
  proofBytes: 8000000,
  stepBytes: 1000000,
  batchBytes: 65536,
  inFlightBatches: 2,
  workspaceBytes: 64000000,
};

/** Replace the mock sum's published capability so the assembler's validation is exercised. */
function withSums(overrides: (sum: LinearSum) => Partial<LinearSum> | LinearSum[]) {
  const base = mockRuleRegistry.find(({ type }) => type === "sum@1")!;
  const patched: RuleModule = {
    ...base,
    capabilities(rule, context) {
      const capabilities = base.capabilities(rule, context);
      const [sum] = capabilities.sums;
      const result = overrides(sum);
      return { ...capabilities, sums: Array.isArray(result) ? result : [{ ...sum, ...result }] };
    },
  };
  return mockRuleRegistry.map((rule) => (rule.type === "sum@1" ? patched : rule));
}

function expectRejected(registry: readonly RuleModule[], code: string) {
  const result = assemble(makeMockProblem(), registry);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issues.map((issue) => issue.code)).toContain(code);
}

describe("sum vocabulary (T01)", () => {
  test("symbolValue is the identity over the problem symbols and rejects strangers", () => {
    const problem = makeMockProblem();
    expect(problem.symbols.map((symbol) => symbolValue(problem, symbol))).toEqual(problem.symbols);
    expect(() => symbolValue(problem, 0)).toThrow();
    expect(() => symbolValue(problem, problem.symbols.length + 1)).toThrow();
  });

  test("assembles the mock sum as a sorted frozen capability with its rule premise", () => {
    const result = assemble(makeMockProblem(), mockRuleRegistry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sums).toHaveLength(1);
    const [sum] = result.value.sums;
    expect(sum).toEqual({
      id: "sum:0:sum",
      cells: [0, 1],
      coefficients: [1, 1],
      total: 10,
      premise: sum.premise,
    });
    expect(Object.isFrozen(sum)).toBe(true);
    expect(Object.isFrozen(sum.cells) && Object.isFrozen(sum.coefficients)).toBe(true);
    const relation = result.value.relations.find((entry) => entry.id === "sum:0:relation");
    expect(relation?.premise).toBe(sum.premise);
  });

  test("rejects malformed sums: arity, zero/oversized/fractional coefficients, total, premise, cells, id", () => {
    expectRejected(
      withSums(() => ({ coefficients: [1] })),
      "invalid-capability",
    );
    expectRejected(
      withSums(() => ({ coefficients: [1, 0] })),
      "invalid-capability",
    );
    expectRejected(
      withSums(() => ({ coefficients: [1, M2_ROOT_LIMITS.sumCoefficient + 1] })),
      "invalid-capability",
    );
    expectRejected(
      withSums(() => ({ coefficients: [1, 1.5] })),
      "invalid-capability",
    );
    expectRejected(
      withSums(() => ({ total: 2.5 })),
      "invalid-capability",
    );
    expectRejected(
      withSums(() => ({ premise: 12345 })),
      "invalid-capability",
    );
    expectRejected(
      withSums(() => ({ cells: [0, 0], coefficients: [1, 1] })),
      "invalid-capability",
    );
    expectRejected(
      withSums((sum) => [sum, { ...sum }]),
      "invalid-capability",
    );
    // One linear form per rule, named `${rule.id}:sum` (the convention facts.addCapabilities checks).
    expectRejected(
      withSums((sum) => [sum, { ...sum, id: "second" }]),
      "invalid-capability",
    );
    expectRejected(
      withSums(() => ({ id: "sum:0:other" })),
      "invalid-capability",
    );
    expectRejected(
      withSums(() => ({ total: M2_ROOT_LIMITS.sumTotal + 1 })),
      "invalid-capability",
    );
  });

  test("root bounds reject oversized or malformed sums that bypass the assembler", () => {
    const result = assemble(makeMockProblem(), mockRuleRegistry);
    if (!result.ok) throw new Error("assembly");
    const [sum] = result.value.sums;
    const forged = (patch: Partial<typeof sum>) => ({
      ...result.value,
      sums: Object.freeze([Object.freeze({ ...sum, ...patch })]),
    });
    expect(() => assertM2RootAssemblyBounds(result.value)).not.toThrow();
    const wide = Array.from({ length: M2_ROOT_LIMITS.sumCells + 1 }, (_, index) => index);
    expect(() =>
      assertM2RootAssemblyBounds(forged({ cells: wide, coefficients: wide.map(() => 1) })),
    ).toThrow();
    expect(() => assertM2RootAssemblyBounds(forged({ coefficients: [1, 0] }))).toThrow(
      "invalid-root-sum",
    );
    expect(() =>
      assertM2RootAssemblyBounds(forged({ total: M2_ROOT_LIMITS.sumTotal + 1 })),
    ).toThrow("invalid-root-sum");
    const many = {
      ...result.value,
      sums: Object.freeze(
        Array.from({ length: M2_ROOT_LIMITS.sums + 1 }, (_, index) =>
          Object.freeze({ ...sum, id: `s${index}` }),
        ),
      ),
    };
    expect(() => assertM2RootAssemblyBounds(many)).toThrow("root-sum-limit");
  });

  test("accepts a negative coefficient and a nine-cell sum within the bounds", () => {
    const negative = assemble(
      makeMockProblem(),
      withSums(() => ({ coefficients: [1, -M2_ROOT_LIMITS.sumCoefficient], total: 0 })),
    );
    expect(negative.ok).toBe(true);
    const problem = makeMockProblem();
    const wide = assemble(
      problem,
      withSums(() => ({
        cells: [...problem.cells],
        coefficients: problem.cells.map(() => 1),
        total: 45,
      })),
    );
    expect(wide.ok).toBe(true);
    expect(M2_ROOT_LIMITS.sumCells).toBe(16);
    expect(M2_ROOT_LIMITS.nodes).toBe(
      M2_ROOT_LIMITS.cells * 2 +
        M2_ROOT_LIMITS.rules +
        M2_ROOT_LIMITS.allDifferent +
        M2_ROOT_LIMITS.covers +
        M2_ROOT_LIMITS.sums,
    );
  });

  test("publishes a checked sum fact beside the relation fact and registers sum@1", () => {
    expect(primitiveRegistry.has("sum@1")).toBe(true);
    const result = assemble(makeMockProblem(), mockRuleRegistry);
    if (!result.ok) throw new Error("assembly");
    const view = initialize(result.value, "primary");
    const sums = [...view.facts.values()].filter((fact) => fact.proposition.kind === "sum");
    expect(sums).toHaveLength(1);
    expect(sums[0].proposition).toEqual({
      kind: "sum",
      cells: [0, 1],
      coefficients: [1, 1],
      total: 10,
    });
    expect(sums[0].rules).toEqual(["sum:0"]);
    expect(sums[0].conditional).toBe(false);
    expect(sums[0].openAssumptions).toEqual([]);
  });

  test("replay reserves and rebuilds the sum root from the original rules", () => {
    const result = assemble(makeMockProblem(), mockRuleRegistry);
    if (!result.ok) throw new Error("assembly");
    const events = [...initializationReservation(result.value)];
    const generator = initializationReservation(result.value);
    let step = generator.next();
    while (!step.done) step = generator.next();
    expect(events.length).toBeGreaterThan(0);
    expect(step.value.nodes).toBe(
      result.value.problem.cells.length +
        result.value.problem.constraints.length +
        result.value.allDifferent.length +
        result.value.covers.length +
        result.value.relations.length +
        result.value.sums.length,
    );
    const snapshot = makeSnapshot(result.value.problem, { kind: "manual" }, "sums", 0);
    const last = [...replay(snapshot, [], result.value, limits)].at(-1);
    expect(last?.kind).not.toBe("rejected");
  });

  test("sum incidence reaches ChangeSet watches", () => {
    const result = assemble(makeMockProblem(), mockRuleRegistry);
    if (!result.ok) throw new Error("assembly");
    const view = initialize(result.value, "primary");
    const indexes = new CandidateIndexes(result.value, view.state);
    expect(indexes.affected([0]).sums).toEqual(["sum:0:sum"]);
    expect(indexes.affected([5]).sums).toEqual([]);
    const changes: ChangeSet = {
      before: view.state.key,
      after: { ...view.state.key, revision: view.state.key.revision + 1 },
      removed: [],
      placed: [],
      cells: [0],
      coverIds: [],
      relationIds: [],
      sumIds: ["sum:0:sum"],
      constraintIds: [],
      graphChanged: false,
    };
    const ledger = invalidate(changes, [
      {
        technique: "k@1",
        scopeKey: "",
        state: view.state.key,
        status: "exhausted",
        dependencies: [{ kind: "sum", id: "sum:0:sum" }],
        work: 0,
      },
      {
        technique: "l@1",
        scopeKey: "",
        state: view.state.key,
        status: "exhausted",
        dependencies: [{ kind: "sum", id: "other" }],
        work: 0,
      },
    ]);
    expect(ledger.map((entry) => entry.status)).toEqual(["pending", "exhausted"]);
  });
});
