import { describe, expect, test } from "vitest";
import { SOLUTION } from "../../fixtures";
import counts from "../../solver/fixtures/counts.json";
import { checkGrid } from "../../solver/grid-check";
import { oracle, type OracleInput } from "../../solver/oracle";

const valuesOf = (puzzle: string): number[] =>
  Array.from(puzzle, (character) => character.charCodeAt(0) - 48);

const replaceCells = (puzzle: string, replacements: [number, string][]): string => {
  const characters = Array.from(puzzle);
  for (const [cell, value] of replacements) characters[cell] = value;
  return characters.join("");
};

describe("independent count fixtures", () => {
  const constructed = {
    complete: SOLUTION,
    oneHole: replaceCells(SOLUTION, [[0, "0"]]),
    duplicate: replaceCells(SOLUTION, [[1, "5"]]),
    noPlace: "123456780" + "000000009" + "0".repeat(63),
    twoRectangle: replaceCells(SOLUTION, [
      [3, "0"],
      [4, "0"],
      [30, "0"],
      [31, "0"],
    ]),
    empty: "0".repeat(81),
  };

  test.each(Object.entries(counts.cases))(
    "%s has its independently established solution count",
    (name, fixture) => {
      expect(fixture.puzzle).toBe(constructed[name as keyof typeof constructed]);

      const givens = valuesOf(fixture.puzzle);
      const result = oracle({
        givens,
        limit: fixture.limit,
        maxNodes: fixture.maxNodes,
      });

      expect(result.witnesses).toHaveLength(fixture.expectedWitnesses);
      expect(result.exhausted).toBe(fixture.expectedExhausted);
      expect(result.interrupted).toBe(false);
      expect(result.witnesses.every((witness) => checkGrid(givens, witness))).toBe(true);
    },
  );

  test("exhaustively establishes the two completions of the rectangle fixture", () => {
    const rectangleHoles = valuesOf(constructed.twoRectangle);
    const two = oracle({
      givens: rectangleHoles,
      limit: 3,
      maxNodes: 1_000_000,
    });

    expect(two.exhausted).toBe(true);
    expect(two.witnesses).toHaveLength(2);
    expect(two.witnesses.every((witness) => checkGrid(rectangleHoles, witness))).toBe(true);
  });
});

describe("bounded exact-cover search", () => {
  test("reports node-budget interruption separately from root exhaustion", () => {
    const stopped = oracle({
      givens: Array(81).fill(0),
      limit: 2,
      maxNodes: 1,
    });
    expect(stopped).toMatchObject({
      witnesses: [],
      exhausted: false,
      interrupted: true,
      nodes: 1,
    });

    const zeroBudget = oracle({
      givens: Array(81).fill(0),
      limit: 1,
      maxNodes: 0,
    });
    expect(zeroBudget).toMatchObject({
      witnesses: [],
      exhausted: false,
      interrupted: true,
      nodes: 0,
    });

    const rootDeadDomains = Array(81).fill(511);
    rootDeadDomains[0] = 0;
    const exhausted = oracle({
      givens: Array(81).fill(0),
      domains: rootDeadDomains,
      limit: 1,
      maxNodes: 1,
    });
    expect(exhausted).toMatchObject({
      witnesses: [],
      exhausted: true,
      interrupted: false,
      nodes: 1,
    });
  });

  test("reports a witness cap as incomplete without calling it an interruption", () => {
    const result = oracle({
      givens: Array(81).fill(0),
      limit: 2,
      maxNodes: 1_000_000,
    });

    expect(result.witnesses).toHaveLength(2);
    expect(result.exhausted).toBe(false);
    expect(result.interrupted).toBe(false);
  });

  test("applies independently decoded domains, force, and forbid restrictions", () => {
    const oneHole = valuesOf(counts.cases.oneHole.puzzle);
    const domains = Array(81).fill(511);
    domains[0] = 2 ** (5 - 1);

    const allowed = oracle({
      givens: oneHole,
      domains,
      force: [0, 5],
      limit: 2,
      maxNodes: 1_000_000,
    });
    expect(allowed.exhausted).toBe(true);
    expect(allowed.witnesses).toHaveLength(1);

    for (const restriction of [
      { domains: domains.map((mask, cell) => (cell === 0 ? 1 : mask)) },
      { force: [0, 4] as [number, number] },
      { forbid: [0, 5] as [number, number] },
    ]) {
      const rejected = oracle({
        givens: oneHole,
        ...restriction,
        limit: 1,
        maxNodes: 1_000_000,
      });
      expect(rejected.witnesses).toEqual([]);
      expect(rejected.exhausted).toBe(true);
      expect(rejected.interrupted).toBe(false);
    }
  });

  const malformedInputs: [OracleInput, string][] = [
    [{ givens: Array(80).fill(0), limit: 1, maxNodes: 1 }, "givens"],
    [{ givens: [...Array(80).fill(0), 10], limit: 1, maxNodes: 1 }, "givens"],
    [
      {
        givens: Array(81).fill(0),
        domains: Array(80).fill(511),
        limit: 1,
        maxNodes: 1,
      },
      "domains",
    ],
    [
      {
        givens: Array(81).fill(0),
        domains: [...Array(80).fill(511), 512],
        limit: 1,
        maxNodes: 1,
      },
      "domains",
    ],
    [{ givens: Array(81).fill(0), force: [81, 1], limit: 1, maxNodes: 1 }, "force"],
    [{ givens: Array(81).fill(0), forbid: [0, 0], limit: 1, maxNodes: 1 }, "forbid"],
    [{ givens: Array(81).fill(0), limit: 0, maxNodes: 1 }, "limit"],
    [{ givens: Array(81).fill(0), limit: 1, maxNodes: -1 }, "maxNodes"],
    [
      {
        givens: Array.from({ length: 81 }, (_, cell) => (cell === 8 ? 1.5 : 0)),
        limit: 1,
        maxNodes: 1,
      },
      "givens",
    ],
    [
      {
        givens: Array(81).fill(0),
        domains: Array.from({ length: 81 }, (_, cell) => (cell === 8 ? Number.NaN : 511)),
        limit: 1,
        maxNodes: 1,
      },
      "domains",
    ],
    [
      {
        givens: Array(81).fill(0),
        force: [0.5, 1],
        limit: 1,
        maxNodes: 1,
      },
      "force",
    ],
    [
      {
        givens: Array(81).fill(0),
        forbid: [0, Number.NaN],
        limit: 1,
        maxNodes: 1,
      },
      "forbid",
    ],
  ];

  test.each(malformedInputs)("rejects malformed %s input", (input, field) => {
    expect(() => oracle(input)).toThrow(field);
  });

  test("rejects sparse given and domain arrays", () => {
    const sparseGivens = Array<number>(81);
    sparseGivens.fill(0);
    delete sparseGivens[8];
    expect(() => oracle({ givens: sparseGivens, limit: 1, maxNodes: 1 })).toThrow("givens");

    const sparseDomains = Array<number>(81);
    sparseDomains.fill(511);
    delete sparseDomains[8];
    expect(() =>
      oracle({
        givens: Array(81).fill(0),
        domains: sparseDomains,
        limit: 1,
        maxNodes: 1,
      }),
    ).toThrow("domains");
  });

  test("keeps witnesses and search state isolated across repeated calls", () => {
    const input: OracleInput = {
      givens: valuesOf(counts.cases.oneHole.puzzle),
      limit: 2,
      maxNodes: 1_000_000,
    };
    const first = oracle(input);
    first.witnesses[0][0] = 9;

    const second = oracle(input);
    expect(second.witnesses).toEqual([valuesOf(SOLUTION)]);
    expect(second.witnesses).not.toBe(first.witnesses);
  });
});

describe("independent complete-grid checker", () => {
  const permuteRows = (values: number[]): number[] => {
    const order = [1, 2, 0, 4, 5, 3, 7, 8, 6];
    return order.flatMap((row) => values.slice(row * 9, row * 9 + 9));
  };
  const permuteColumns = (values: number[]): number[] => {
    const order = [1, 2, 0, 4, 5, 3, 7, 8, 6];
    return values.map((_, cell) => values[Math.floor(cell / 9) * 9 + order[cell % 9]]);
  };
  const permuteDigits = (values: number[]): number[] => values.map((value) => (value % 9) + 1);
  const permuteBoxes = (values: number[]): number[] => {
    const bandOrder = [3, 4, 5, 6, 7, 8, 0, 1, 2];
    const stackOrder = [3, 4, 5, 6, 7, 8, 0, 1, 2];
    return bandOrder.flatMap((row) => stackOrder.map((column) => values[row * 9 + column]));
  };

  test("accepts independent row, column, box, and digit permutations", () => {
    const base = valuesOf(SOLUTION);
    for (const transformed of [
      permuteRows(base),
      permuteColumns(base),
      permuteBoxes(base),
      permuteDigits(base),
    ]) {
      expect(checkGrid(Array(81).fill(0), transformed)).toBe(true);
      const result = oracle({
        givens: transformed,
        limit: 2,
        maxNodes: 1_000_000,
      });
      expect(result.exhausted).toBe(true);
      expect(result.witnesses).toEqual([transformed]);
    }
  });

  test("rejects bad givens and row, column, box, range, and shape mutations", () => {
    const complete = valuesOf(SOLUTION);
    const mutations = [
      complete.map((value, cell) => (cell === 1 ? complete[0] : value)),
      complete.map((value, cell) => (cell === 27 ? complete[0] : value)),
      complete.map((value, cell) => (cell === 10 ? complete[0] : value)),
      complete.map((value, cell) => (cell === 0 ? 0 : value)),
      complete.slice(0, 80),
    ];
    for (const mutation of mutations) expect(checkGrid(Array(81).fill(0), mutation)).toBe(false);

    const wrongGiven = Array(81).fill(0);
    wrongGiven[0] = 4;
    expect(checkGrid(wrongGiven, complete)).toBe(false);
    expect(checkGrid(Array(80).fill(0), complete)).toBe(false);
  });
});
