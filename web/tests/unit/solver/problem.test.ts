import { describe, expect, test } from "vitest";
import type { ClassicDefinition } from "../../../src/domain/model";
import {
  canonicalJson,
  canonicalProblem,
  normalizeClassic,
} from "../../../src/solver/problem";
import type { ConstraintInstance, Json } from "../../../src/solver/problem";
import { makeSnapshot } from "../../../src/solver/snapshot";
import { PUZZLE } from "../../fixtures";
import { makeMockProblem } from "../../solver/mock-rules";

const definition = (): ClassicDefinition => ({
  kind: "classic",
  version: 1,
  width: 9,
  height: 9,
  givens: [...PUZZLE].map((value) => Number(value)) as ClassicDefinition["givens"],
});

function reverseRuleOrder(problem: ReturnType<typeof makeMockProblem>) {
  return { ...problem, constraints: [...problem.constraints].reverse() };
}

describe("canonical JSON", () => {
  test("sorts object keys recursively while retaining array order", () => {
    expect(canonicalJson({ z: [{ b: 2, a: 1 }], a: [3, 1, 2] })).toBe(
      '{"a":[3,1,2],"z":[{"a":1,"b":2}]}',
    );
  });

  test.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    undefined,
    1n,
    new Date(0),
    Object.assign([1, 2], { extra: true }),
  ])("rejects non-JSON input %#", (value) => {
    expect(() => canonicalJson(value as Json)).toThrow();
  });

  test("rejects sparse and cyclic containers", () => {
    const sparse = [1, , 3];
    const cyclic: Record<string, Json> = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(sparse as Json)).toThrow();
    expect(() => canonicalJson(cyclic)).toThrow();
  });

  test("rejects array properties that JSON serialization would silently ignore", () => {
    const hidden = [1, 2];
    Object.defineProperty(hidden, "secret", { value: 3 });
    const symbolProperty = [1, 2];
    Object.defineProperty(symbolProperty, Symbol("secret"), { value: 3 });
    expect(() => canonicalJson(hidden as Json)).toThrow();
    expect(() => canonicalJson(symbolProperty as Json)).toThrow();
  });
});

describe("classic normalization", () => {
  test("expands a classic definition into 27 stable all-different constraints", () => {
    const problem = normalizeClassic(definition());
    expect(problem.constraints).toHaveLength(27);
    expect(problem.constraints.map((constraint) => constraint.id)).toEqual([
      "box:0",
      "box:1",
      "box:2",
      "box:3",
      "box:4",
      "box:5",
      "box:6",
      "box:7",
      "box:8",
      "column:0",
      "column:1",
      "column:2",
      "column:3",
      "column:4",
      "column:5",
      "column:6",
      "column:7",
      "column:8",
      "row:0",
      "row:1",
      "row:2",
      "row:3",
      "row:4",
      "row:5",
      "row:6",
      "row:7",
      "row:8",
    ]);
    expect(problem.constraints.find(({ id }) => id === "row:1")?.cells).toEqual([
      9, 10, 11, 12, 13, 14, 15, 16, 17,
    ]);
    expect(problem.constraints.find(({ id }) => id === "column:1")?.cells).toEqual([
      1, 10, 19, 28, 37, 46, 55, 64, 73,
    ]);
    expect(problem.constraints.find(({ id }) => id === "box:4")?.cells).toEqual([
      30, 31, 32, 39, 40, 41, 48, 49, 50,
    ]);
  });

  test("deep-copies input and exposes frozen semantic data", () => {
    const input = definition();
    const problem = normalizeClassic(input);
    input.givens[0] = 9;
    expect(problem.givens[0]).toBe(5);
    expect(Object.isFrozen(problem)).toBe(true);
    expect(Object.isFrozen(problem.givens)).toBe(true);
    expect(() => (problem.givens as number[]).push(1)).toThrow();
  });

  test.each([
    { ...definition(), width: 8 },
    { ...definition(), extra: true },
    { ...definition(), givens: Array(80).fill(0) },
    { ...definition(), givens: Array(81).fill(10) },
    { ...definition(), givens: Object.assign(Array(81).fill(0), { 5: undefined }) },
  ])("rejects malformed classic definitions %#", (input) => {
    expect(() => normalizeClassic(input)).toThrow();
  });
});

describe("problem identity and snapshots", () => {
  test("constraint registration order does not change the semantic key", () => {
    const problem = makeMockProblem();
    expect(canonicalProblem(reverseRuleOrder(problem)).key).toBe(problem.key);
  });

  test("retains ordered rule cells and isolates nested parameter objects", () => {
    const parameters = { weights: [2, 1], nested: { z: 3, a: 4 } };
    const constraint: ConstraintInstance = {
      id: "ordered:0",
      type: "order@1",
      cells: [7, 2],
      parameters,
    };
    const problem = makeMockProblem([constraint]);
    parameters.weights[0] = 99;
    parameters.nested.a = 88;
    expect(problem.constraints[0].cells).toEqual([7, 2]);
    expect(problem.constraints[0].parameters).toEqual({
      nested: { a: 4, z: 3 },
      weights: [2, 1],
    });
  });

  test("rejects duplicate IDs, unknown fields, and forged keys", () => {
    const problem = makeMockProblem();
    expect(() =>
      canonicalProblem({
        ...problem,
        constraints: [problem.constraints[0], problem.constraints[0]],
        key: undefined,
      }),
    ).toThrow();
    expect(() => canonicalProblem({ ...problem, surprise: true })).toThrow();
    expect(() => canonicalProblem({ ...problem, key: `${problem.key}forged` })).toThrow();
  });

  test("snapshot copies the problem and discriminated source metadata", () => {
    const mutable = JSON.parse(JSON.stringify(normalizeClassic(definition())));
    const source = {
      kind: "puzzle" as const,
      id: "puzzle-1",
      name: "Original",
      libraryRevision: 4,
      unsaved: false,
    };
    const snapshot = makeSnapshot(mutable, source, "snapshot-1", 7);
    mutable.givens[0] = 9;
    source.name = "Changed";
    expect(snapshot.problem.givens[0]).toBe(5);
    expect(snapshot.source).toEqual({
      kind: "puzzle",
      id: "puzzle-1",
      name: "Original",
      libraryRevision: 4,
      unsaved: false,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  test("rejects malformed snapshot metadata", () => {
    const problem = normalizeClassic(definition());
    expect(() => makeSnapshot(problem, { kind: "manual" }, "", 0)).toThrow();
    expect(() => makeSnapshot(problem, { kind: "paste" }, "snapshot-1", -1)).toThrow();
    expect(() =>
      makeSnapshot(
        problem,
        { kind: "manual", extra: true } as never,
        "snapshot-1",
        0,
      ),
    ).toThrow();
  });
});
