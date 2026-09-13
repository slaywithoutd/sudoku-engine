import { describe, expect, test } from "vitest";
import { normalizeClassic } from "../../../src/solver/problem";
import type { ConstraintInstance } from "../../../src/solver/problem";
import { AllDifferentRule } from "../../../src/solver/rules/all-different";
import { assemble } from "../../../src/solver/rules/assemble";
import type { RuleModule } from "../../../src/solver/rules/types";
import { PUZZLE } from "../../fixtures";
import { makeMockProblem, mockRuleRegistry } from "../../solver/mock-rules";

function withUnknownRule(problem: ReturnType<typeof makeMockProblem>) {
  const constraints: ConstraintInstance[] = [
    ...problem.constraints,
    { id: "unknown:0", type: "unknown@1", cells: [0], parameters: {} },
  ];
  return makeMockProblem(constraints);
}

function classicProblem() {
  return normalizeClassic({
    kind: "classic",
    version: 1,
    width: 9,
    height: 9,
    givens: [...PUZZLE].map(Number),
  });
}

function expectedPeers(cell: number): number[] {
  const row = Math.floor(cell / 9);
  const column = cell % 9;
  const boxRow = Math.floor(row / 3);
  const boxColumn = Math.floor(column / 3);
  return Array.from({ length: 81 }, (_, candidate) => candidate).filter((candidate) => {
    if (candidate === cell) return false;
    const candidateRow = Math.floor(candidate / 9);
    const candidateColumn = candidate % 9;
    return (
      candidateRow === row ||
      candidateColumn === column ||
      (Math.floor(candidateRow / 3) === boxRow &&
        Math.floor(candidateColumn / 3) === boxColumn)
    );
  });
}

function expectFailure(result: ReturnType<typeof assemble>, code: string) {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issues.some((issue) => issue.code === code)).toBe(true);
}

describe("capability assembly", () => {
  test("rejects unsupported rules instead of silently dropping them", () => {
    expectFailure(assemble(withUnknownRule(makeMockProblem()), mockRuleRegistry), "unsupported-rule");
  });

  test("builds complete classic covers and all 81 peer sets independently", () => {
    const result = assemble(classicProblem(), [new AllDifferentRule()]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.allDifferent).toHaveLength(27);
    expect(result.value.covers).toHaveLength(243);
    expect(result.value.relations).toHaveLength(0);
    expect(result.value.peers).toHaveLength(81);
    result.value.peers.forEach((peers, cell) => {
      expect(peers).toHaveLength(20);
      expect(peers).toEqual(expectedPeers(cell));
    });
  });

  test("does not claim symbol covers for a smaller all-different scope", () => {
    const result = assemble(makeMockProblem(), mockRuleRegistry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.covers).toHaveLength(0);
    expect(result.value.allDifferent).toEqual([
      expect.objectContaining({ id: "cage:0", cells: [0, 1, 2] }),
    ]);
  });

  test("preserves ordered relation cells while normalizing set-valued scopes", () => {
    const result = assemble(makeMockProblem(), mockRuleRegistry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.problem.constraints.find(({ id }) => id === "cage:0")?.cells).toEqual([
      0, 1, 2,
    ]);
    expect(result.value.relations[0].cells).toEqual([1, 0]);
  });

  test("is deterministic across registry permutations", () => {
    const problem = makeMockProblem();
    const forward = assemble(problem, mockRuleRegistry);
    const reverse = assemble(problem, [...mockRuleRegistry].reverse());
    expect(forward.ok).toBe(true);
    expect(reverse.ok).toBe(true);
    if (!forward.ok || !reverse.ok) return;
    expect(reverse.value.supportSignature).toBe(forward.value.supportSignature);
    expect(reverse.value.allDifferent).toEqual(forward.value.allDifferent);
    expect(reverse.value.covers).toEqual(forward.value.covers);
    expect(reverse.value.relations).toEqual(forward.value.relations);
  });

  test("retains real complete-assignment semantics for every registered rule", () => {
    const result = assemble(makeMockProblem(), mockRuleRegistry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sum = result.value.modules.get("sum:0")!;
    const order = result.value.modules.get("order:0")!;
    const cage = result.value.modules.get("cage:0")!;
    const assignment = { values: [4, 6, 5, 0, 0, 0, 0, 0, 0] };
    expect(sum.checkComplete(result.value.problem.constraints[2], assignment)).toBe(true);
    expect(order.checkComplete(result.value.problem.constraints[1], assignment)).toBe(false);
    expect(cage.checkComplete(result.value.problem.constraints[0], assignment)).toBe(true);
    expect(cage.checkComplete(result.value.problem.constraints[0], { values: [4, 4, 5] })).toBe(
      false,
    );
  });

  test("reports unsupported propagation as an explicit exhausted generator event", () => {
    const result = assemble(makeMockProblem(), mockRuleRegistry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rule = result.value.problem.constraints[0];
    expect([...result.value.modules.get(rule.id)!.propagate({}, rule)]).toEqual([
      { kind: "exhausted" },
    ]);
  });

  test("rejects malformed rule parameters and duplicate registry types", () => {
    const malformed = makeMockProblem([
      { id: "sum:0", type: "sum@1", cells: [0, 1], parameters: { total: 0 } },
    ]);
    expectFailure(assemble(malformed, mockRuleRegistry), "invalid-parameters");
    expectFailure(
      assemble(makeMockProblem(), [...mockRuleRegistry, new AllDifferentRule()]),
      "duplicate-rule-type",
    );
  });

  test("rejects engine inputs whose canonical key is absent or forged", () => {
    const problem = makeMockProblem();
    const { key: _key, ...withoutKey } = problem;
    expectFailure(assemble(withoutKey as never, mockRuleRegistry), "missing-key");
    expectFailure(
      assemble({ ...problem, key: `${problem.key}:forged` }, mockRuleRegistry),
      "forged-key",
    );
  });

  test("rejects duplicate capability IDs, foreign premises, and malformed primitives", () => {
    const base = mockRuleRegistry.find(({ type }) => type === "order@1")!;
    const badCapabilities: RuleModule = {
      ...base,
      capabilities(rule, context) {
        const premise = context.roots.get(rule.id)!;
        return {
          allDifferent: [],
          covers: [
            { id: "duplicate", symbol: 1, cells: [0], premise },
            { id: "duplicate", symbol: 2, cells: [0], premise },
          ],
          relations: [],
          primitiveIds: ["missing-version"],
        };
      },
    };
    expectFailure(
      assemble(makeMockProblem(), mockRuleRegistry.map((rule) => (rule.type === "order@1" ? badCapabilities : rule))),
      "invalid-capability",
    );

    const foreignPremise: RuleModule = {
      ...base,
      capabilities(rule) {
        return {
          allDifferent: [{ id: "foreign", cells: rule.cells, premise: 999_999 }],
          covers: [],
          relations: [],
          primitiveIds: [],
        };
      },
    };
    expectFailure(
      assemble(makeMockProblem(), mockRuleRegistry.map((rule) => (rule.type === "order@1" ? foreignPremise : rule))),
      "invalid-capability",
    );

    const sparseTuple = Array(2) as number[];
    sparseTuple[0] = 1;
    const sparseCapabilities: RuleModule = {
      ...base,
      capabilities(rule, context) {
        return {
          allDifferent: [],
          covers: [],
          relations: [
            {
              id: "sparse-relation",
              cells: rule.cells,
              tuples: [sparseTuple],
              premise: context.roots.get(rule.id)!,
            },
          ],
          primitiveIds: Object.assign(Array(1), {}) as string[],
        };
      },
    };
    expectFailure(
      assemble(makeMockProblem(), mockRuleRegistry.map((rule) => (rule.type === "order@1" ? sparseCapabilities : rule))),
      "invalid-capability",
    );
  });

  test("rejects a well-formed primitive version without a registered checker", () => {
    const base = mockRuleRegistry.find(({ type }) => type === "order@1")!;
    const unknownPrimitive: RuleModule = {
      ...base,
      capabilities() {
        return {
          allDifferent: [],
          covers: [],
          relations: [],
          primitiveIds: ["unregistered@1"],
        };
      },
    };
    expectFailure(
      assemble(
        makeMockProblem(),
        mockRuleRegistry.map((rule) =>
          rule.type === "order@1" ? unknownPrimitive : rule,
        ),
      ),
      "unsupported-primitive",
    );
  });

  test("exposes immutable capability data and a map without mutation methods", () => {
    const result = assemble(makeMockProblem(), mockRuleRegistry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.isFrozen(result.value.allDifferent)).toBe(true);
    expect(Object.isFrozen(result.value.allDifferent[0].cells)).toBe(true);
    expect("set" in result.value.modules).toBe(false);
    expect(() => (result.value.modules as Map<string, RuleModule>).set("x", mockRuleRegistry[0])).toThrow();
    expect(() => (result.value.peers[0] as number[]).push(80)).toThrow();
  });
});
