import { describe, expect, test } from "vitest";
import { exactSteps, isWitness, exactInitializationReservation } from "../../../src/solver/exact";
import type { EngineProblem } from "../../../src/solver/problem";
import { normalizeClassic, canonicalProblem } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { AllDifferentRule } from "../../../src/solver/rules/all-different";
import { oracle } from "../../solver/oracle";
import counts from "../../solver/fixtures/counts.json";

function classic(puzzle: string) {
  const problem = normalizeClassic({
    kind: "classic",
    version: 1,
    width: 9,
    height: 9,
    givens: [...puzzle].map(Number),
  });
  const result = assemble(problem, [new AllDifferentRule()]);
  if (!result.ok) throw new Error("assembly failed");
  return { problem, assembly: result.value };
}

describe("original-problem exact enumeration", () => {
  test.each(Object.entries(counts.cases))(
    "independently matches seed count %s",
    (_name, fixture) => {
      const { problem, assembly } = classic(fixture.puzzle);
      const events = [...exactSteps(problem, assembly)];
      const witnesses = events.filter((event) => event.kind === "witness");
      const independent = oracle({ givens: [...problem.givens], limit: 2, maxNodes: 1_000_000 });
      expect(witnesses).toHaveLength(independent.witnesses.length);
      expect(events.at(-1)?.kind).toBe(witnesses.length === 2 ? "cap-reached" : "exhausted");
      for (const event of witnesses) expect(isWitness(problem, assembly, event.values)).toBe(true);
    },
  );
  test("closing after one witness does not emit exhaustion", () => {
    const { problem, assembly } = classic(counts.cases.oneHole.puzzle);
    const iterator = exactSteps(problem, assembly);
    const events = [];
    for (const event of iterator) {
      events.push(event);
      if (event.kind === "witness") break;
    }
    expect(events.filter((event) => event.kind === "witness")).toHaveLength(1);
    expect(events.some((event) => event.kind === "exhausted")).toBe(false);
    expect(iterator.next().done).toBe(true);
  });
  test("ignores fabricated human capability metadata and retains both original completions", () => {
    const { problem, assembly } = classic(counts.cases.twoRectangle.puzzle);
    const misleading = {
      ...assembly,
      peers: problem.cells.map(() => problem.cells),
      covers: [],
      allDifferent: [],
      relations: [],
    };
    expect(
      [...exactSteps(problem, misleading)].filter((event) => event.kind === "witness"),
    ).toHaveLength(2);
  });
  test("rejects mismatched semantic identity and malformed witnesses", () => {
    const first = classic(counts.cases.oneHole.puzzle),
      other = classic(counts.cases.empty.puzzle);
    expect(() => [...exactSteps(first.problem, other.assembly)]).toThrow();
    for (const values of [null, [], Array(81).fill(10), Array(81).fill(0), Array(81).fill(5)])
      expect(isWitness(first.problem, first.assembly, values)).toBe(false);
    expect(
      isWitness(first.problem, other.assembly, [...counts.cases.complete.puzzle].map(Number)),
    ).toBe(false);
  });
  test("deterministically orders decisions and yields bounded accounting", () => {
    const { problem, assembly } = classic(counts.cases.empty.puzzle);
    const events = [...exactSteps(problem, assembly)];
    expect([...exactSteps(problem, assembly)]).toEqual(events);
    expect(events[0]).toMatchObject({
      kind: "work",
      units: exactInitializationReservation(problem, assembly).workUnits,
      stats: { nodes: 0 },
    });
    expect(events[1]).toMatchObject({ kind: "work", units: 1, stats: { nodes: 1 } });
    const witnesses = events.filter((event) => event.kind === "witness");
    expect(witnesses[0].decisions[0]).toEqual({ cell: 0, symbol: 1, positive: true });
    expect(witnesses[0].values).not.toEqual(witnesses[1].values);
    for (const event of events.slice(1)) if (event.kind === "work") expect(event.units).toBe(1);
  });
  test("checks additional complete-rule semantics without discovery", () => {
    const problem = canonicalProblem({
      schema: 1,
      cells: [0, 1],
      symbols: [1, 2, 3],
      givens: [0, 0],
      constraints: [{ id: "only", type: "complete-only@1", cells: [0, 1], parameters: {} }],
    });
    const module = {
      type: "complete-only@1",
      normalize: (rule: (typeof problem.constraints)[number]) => rule,
      validate: () => [],
      checkComplete: (_rule: unknown, assignment: { values: readonly number[] }) =>
        assignment.values[0] === 3 && assignment.values[1] === 2,
      capabilities: () => ({ allDifferent: [], covers: [], relations: [], primitiveIds: [] }),
      *propagate(): Generator<never> {
        throw new Error("discovery called");
      },
      checkPrimitive: () => {
        throw new Error("proof called");
      },
    };
    const result = assemble(problem, [module]);
    if (!result.ok) throw new Error(JSON.stringify(result));
    const events = [...exactSteps(problem, result.value)];
    expect(events.filter((event) => event.kind === "witness").map((event) => event.values)).toEqual(
      [[3, 2]],
    );
    expect(events.at(-1)?.kind).toBe("exhausted");
  });
  test("differentially matches deterministic seeded clue removals", () => {
    let seed = 20260912;
    for (let trial = 0; trial < 20; trial++) {
      const chars = [...counts.cases.complete.puzzle];
      for (let removal = 0; removal < 10 + trial * 3; removal++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        chars[seed % 81] = "0";
      }
      const { problem, assembly } = classic(chars.join(""));
      const actual = [...exactSteps(problem, assembly)].filter((event) => event.kind === "witness");
      const expected = oracle({ givens: [...problem.givens], limit: 2, maxNodes: 1_000_000 });
      expect(expected.interrupted).toBe(false);
      expect(actual).toHaveLength(expected.witnesses.length);
      for (const event of actual) expect(isWitness(problem, assembly, event.values)).toBe(true);
    }
  });
  test("bounds dimensions/scopes and refuses accessors before canonical traversal", () => {
    const { problem, assembly } = classic(counts.cases.oneHole.puzzle);
    let touched = false;
    const oversized = Array(82).fill(0);
    Object.defineProperty(oversized, 0, {
      get: () => {
        touched = true;
        throw new Error("read");
      },
    });
    expect(() => exactSteps({ ...problem, cells: oversized }, assembly)).toThrow(
      "exact-cell-limit",
    );
    expect(touched).toBe(false);
    const scope = { ...problem, constraints: [{ ...problem.constraints[0], cells: oversized }] };
    expect(() => exactSteps(scope, assembly)).toThrow("exact-scope-limit");
    expect(touched).toBe(false);
    const accessor = { ...problem };
    Object.defineProperty(accessor, "givens", {
      get: () => {
        touched = true;
        throw new Error("read");
      },
      enumerable: true,
    });
    expect(() => exactSteps(accessor, assembly)).toThrow("exact-invalid-data");
    expect(touched).toBe(false);
  });
  test("isolates original values before generator consumption and accounts finite setup", () => {
    const { problem, assembly } = classic(counts.cases.oneHole.puzzle);
    const mutable = structuredClone(problem) as EngineProblem;
    const reservation = exactInitializationReservation(mutable, assembly);
    expect(reservation.workUnits).toBeGreaterThan(0);
    expect(reservation.workspaceBytes).toBeGreaterThan(0);
    const iterator = exactSteps(mutable, assembly);
    (mutable.givens as number[])[0] = 9;
    const events = [...iterator];
    expect(events.filter((event) => event.kind === "witness")).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "work",
      units: reservation.workUnits,
      stats: { nodes: 0 },
    });
  });
});
