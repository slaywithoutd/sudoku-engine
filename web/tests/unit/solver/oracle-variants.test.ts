import { describe, expect, test } from "vitest";
import {
  bruteForce,
  satisfied,
  variantOracle,
  type VariantConstraint,
  type VariantOracleInput,
} from "../../solver/oracle-variants";
import { generateSmall, rng, toEngineConstraints } from "../../solver/generate-small";

/** Tiny random instances where unpruned enumeration is cheap (4^6 = 4,096 grids). */
function tinyInstance(seed: number, kind: VariantConstraint["kind"]): VariantOracleInput {
  const random = rng(seed);
  const cellCount = 6;
  const symbols = [1, 2, 3, 4];
  const pick = () => Math.floor(random() * cellCount);
  const pair = (): [number, number] => {
    const a = pick();
    let b = pick();
    while (b === a) b = pick();
    return [a, b];
  };
  const constraints: VariantConstraint[] = [];
  const count = 1 + Math.floor(random() * 3);
  for (let index = 0; index < count; index += 1) {
    switch (kind) {
      case "all-different": {
        const cells = [...new Set([pick(), pick(), pick()])];
        if (cells.length >= 2) constraints.push({ kind, cells });
        break;
      }
      case "sum": {
        const cells = [...new Set([pick(), pick(), pick()])];
        const signed = random() < 0.3;
        constraints.push({
          kind,
          cells,
          coefficients: signed ? cells.map((_, i) => (i === 0 ? -1 : 1)) : undefined,
          total: signed ? Math.floor(random() * 5) : 3 + Math.floor(random() * 8),
        });
        break;
      }
      case "order":
        constraints.push({ kind, cells: pair() });
        break;
      case "difference":
        constraints.push({
          kind,
          cells: pair(),
          relation: (["consecutive", "ratio", "neither"] as const)[Math.floor(random() * 3)],
        });
        break;
    }
  }
  // One classic-style scope keeps counts small; mixed kinds share it.
  constraints.push({ kind: "all-different", cells: [0, 1, 2] });
  const givens = Array.from({ length: cellCount }, () =>
    random() < 0.2 ? 1 + Math.floor(random() * symbols.length) : 0,
  );
  return { cellCount, symbols, givens, constraints, limit: 10000, maxNodes: 1000000 };
}

describe("variant oracle (T03)", () => {
  test.each(["all-different", "sum", "order", "difference"] as const)(
    "agrees with unpruned brute force on 200 tiny %s instances, including force/forbid",
    (kind) => {
      let nonzero = 0;
      for (let seed = 1; seed <= 200; seed += 1) {
        const input = tinyInstance(seed * 7919 + kind.length, kind);
        const result = variantOracle(input);
        expect(result.exhausted).toBe(true);
        expect(result.witnesses.length).toBe(bruteForce(input));
        if (result.witnesses.length > 0) nonzero += 1;
        for (const witness of result.witnesses)
          expect(input.constraints.every((c) => satisfied(c, witness))).toBe(true);
        const restricted = { ...input, force: [1, 2] as const, forbid: [0, 3] as const };
        const restrictedResult = variantOracle(restricted);
        expect(restrictedResult.exhausted).toBe(true);
        expect(restrictedResult.witnesses.length).toBe(bruteForce(restricted));
      }
      // Over-pruning is only observable on satisfiable instances; keep enough of them.
      expect(nonzero).toBeGreaterThanOrEqual(50);
    },
  );

  test("respects the witness limit and reports interruption honestly", () => {
    const input: VariantOracleInput = {
      cellCount: 4,
      symbols: [1, 2, 3],
      givens: [0, 0, 0, 0],
      constraints: [],
      limit: 5,
      maxNodes: 100000,
    };
    const limited = variantOracle(input);
    expect(limited.witnesses.length).toBe(5);
    expect(limited.exhausted).toBe(false);
    expect(limited.interrupted).toBe(false);
    const interrupted = variantOracle({ ...input, limit: 1000, maxNodes: 3 });
    expect(interrupted.interrupted).toBe(true);
    expect(interrupted.exhausted).toBe(false);
    expect(variantOracle({ ...input, limit: 1000 }).witnesses.length).toBe(81);
  });

  test("rejects malformed input before searching", () => {
    const base: VariantOracleInput = {
      cellCount: 2,
      symbols: [1, 2],
      givens: [0, 0],
      constraints: [],
      limit: 1,
      maxNodes: 10,
    };
    expect(() => variantOracle({ ...base, givens: [3, 0] })).toThrow(RangeError);
    expect(() =>
      variantOracle({ ...base, constraints: [{ kind: "order", cells: [0, 0] }] }),
    ).toThrow(RangeError);
    expect(() =>
      variantOracle({ ...base, constraints: [{ kind: "sum", cells: [0, 1], total: 1.5 }] }),
    ).toThrow(RangeError);
    expect(() => variantOracle({ ...base, force: [5, 1] })).toThrow(RangeError);
  });
});

describe("small generator (T03)", () => {
  test("is deterministic per seed and every instance is satisfied by its own grid", () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const options = {
        cages: 3,
        orders: 2,
        dots: 2,
        arrows: 1,
        negativeDots: seed % 2 === 0,
        givens: 4,
      };
      const a = generateSmall(seed, options);
      const b = generateSmall(seed, options);
      expect(b).toEqual(a);
      expect(a.constraints.every((c) => satisfied(c, a.solution))).toBe(true);
      expect(a.givens.every((given, cell) => given === 0 || given === a.solution[cell])).toBe(true);
      expect(new Set(a.constraints.map((c) => JSON.stringify(c))).size).toBe(a.constraints.length);
    }
    expect(generateSmall(1, { cages: 2 })).not.toEqual(generateSmall(2, { cages: 2 }));
  });

  test("generated 4x4 problems count the same under the oracle and brute force", () => {
    let multiple = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const problem = generateSmall(seed, { cages: 2, orders: 1, dots: 1, arrows: 2, givens: 7 });
      const input: VariantOracleInput = { ...problem, limit: 10000, maxNodes: 1000000 };
      const result = variantOracle(input);
      expect(result.exhausted).toBe(true);
      expect(result.witnesses.length).toBeGreaterThanOrEqual(1);
      expect(result.witnesses.length).toBe(bruteForce(input));
      if (result.witnesses.length > 1) multiple += 1;
    }
    expect(multiple).toBeGreaterThanOrEqual(5);
  });

  test("6x6 problems with 2x3 boxes are valid and countable", () => {
    const problem = generateSmall(11, { width: 6, cages: 4, givens: 20 });
    expect(problem.cellCount).toBe(36);
    expect(problem.constraints.every((c) => satisfied(c, problem.solution))).toBe(true);
    const result = variantOracle({ ...problem, limit: 100, maxNodes: 1000000 });
    expect(result.exhausted).toBe(true);
    expect(result.witnesses.length).toBeGreaterThanOrEqual(1);
  });

  test("maps constraints onto production module shapes with stable ids", () => {
    // Arrows are rare on 4x4 grids; pick the first seed whose instance has one so
    // the arrow@1 mapping is actually exercised.
    let seed = 1;
    let problem = generateSmall(seed, {
      cages: 2,
      orders: 1,
      dots: 1,
      arrows: 3,
      negativeDots: true,
    });
    while (!problem.constraints.some((c) => c.kind === "sum" && c.coefficients)) {
      seed += 1;
      problem = generateSmall(seed, {
        cages: 2,
        orders: 1,
        dots: 1,
        arrows: 3,
        negativeDots: true,
      });
      if (seed > 500) throw new Error("no seed produced an arrow");
    }
    const constraints = toEngineConstraints(problem);
    const types = new Set(constraints.map((c) => c.type));
    expect(types.has("all-different@1")).toBe(true);
    expect(types.has("arrow@1")).toBe(true);
    expect(types.has("cage@1")).toBe(true);
    for (const constraint of constraints) {
      expect(constraint.id).toMatch(/^[a-z-]+:\d+$/);
      expect(["all-different@1", "cage@1", "arrow@1", "order@1", "difference@1"]).toContain(
        constraint.type,
      );
      if (constraint.type === "cage@1") expect(typeof constraint.parameters.total).toBe("number");
      if (constraint.type === "difference@1")
        expect(["consecutive", "ratio", "neither"]).toContain(constraint.parameters.kind);
      if (constraint.type === "arrow@1") {
        // Circle first, then the arm (spec §3.4 instance shape).
        expect(constraint.cells.length).toBeGreaterThanOrEqual(3);
        const [circle, ...arm] = constraint.cells;
        expect(arm.reduce((t, cell) => t + problem.solution[cell], 0)).toBe(
          problem.solution[circle],
        );
      }
    }
    // Cage scopes are published by cage@1, so no all-different@1 duplicates a cage's cells.
    const cages = constraints.filter((c) => c.type === "cage@1").map((c) => c.cells.join(","));
    expect(
      constraints.filter((c) => c.type === "all-different@1" && cages.includes(c.cells.join(","))),
    ).toHaveLength(0);
    expect(new Set(constraints.map((c) => c.id)).size).toBe(constraints.length);
  });
});
