import { describe, expect, test } from "vitest";
import { exactSteps, isWitness, type ExactEvent } from "../../../src/solver/exact";
import { canonicalProblem, normalizeClassic } from "../../../src/solver/problem";
import type { ConstraintInstance, EngineProblem } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { AllDifferentRule } from "../../../src/solver/rules/all-different";
import { productionRules } from "../../../src/solver/rules/registry";
import type { Assembly } from "../../../src/solver/rules/types";
import { symbolMask } from "../../../src/solver/state/read";
import { variantOracle } from "../../solver/oracle-variants";
import { generateSmall, rng, toEngineConstraints } from "../../solver/generate-small";
import { SOLUTION, PUZZLE } from "../../fixtures";

function assembled(problem: EngineProblem): Assembly {
  const result = assemble(problem, productionRules());
  if (!result.ok)
    throw new Error(result.issues.map((issue) => `${issue.code}: ${issue.message}`).join("; "));
  return result.value;
}

function engineProblem(seed: number, options: Parameters<typeof generateSmall>[1]) {
  const small = generateSmall(seed, options);
  const constraints = toEngineConstraints(small);
  const problem = canonicalProblem({
    schema: 1,
    cells: Array.from({ length: small.cellCount }, (_, cell) => cell),
    symbols: [...small.symbols],
    givens: [...small.givens],
    constraints: constraints.map((c) => ({
      ...c,
      cells: [...c.cells],
      parameters: { ...c.parameters },
    })),
  });
  return { small, problem };
}

function run(problem: EngineProblem, assembly: Assembly) {
  const events = [...exactSteps(problem, assembly)];
  const witnesses = events.filter(
    (event): event is Extract<ExactEvent, { kind: "witness" }> => event.kind === "witness",
  );
  const terminal = events.at(-1)!;
  return { events, witnesses, terminal, stats: terminal.stats };
}

describe("exact enumeration with module forward checking (T06)", () => {
  test("classic puzzles keep their statistics: no module offers a hook, only houses prune", () => {
    // Golden values pinned on this branch; classic problems register no prune
    // hook, so the loop is the same singles-plus-peers search as before.
    const problem = normalizeClassic({
      kind: "classic",
      version: 1,
      width: 9,
      height: 9,
      givens: [...PUZZLE].map(Number),
    });
    const classicOnly = assemble(problem, [new AllDifferentRule()]);
    if (!classicOnly.ok) throw new Error("assembly");
    const baseline = run(problem, classicOnly.value);
    const production = run(problem, assembled(problem));
    expect(production.stats).toEqual(baseline.stats);
    expect(production.witnesses.map((w) => w.values.join(""))).toEqual(
      baseline.witnesses.map((w) => w.values.join("")),
    );
    expect(baseline.witnesses).toHaveLength(1);
    expect(baseline.terminal.kind).toBe("exhausted");
    expect(baseline.witnesses[0].values.join("")).toBe(SOLUTION);
  });

  test("generated mixed problems count the same as the independent oracle (capped at two)", () => {
    let multiple = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const { small, problem } = engineProblem(seed, {
        cages: 2,
        arrows: 2,
        orders: 2,
        dots: 2,
        negativeDots: seed % 3 === 0,
        givens: seed % 2 === 0 ? 3 : 0,
      });
      const assembly = assembled(problem);
      const { witnesses, terminal } = run(problem, assembly);
      const independent = variantOracle({
        cellCount: small.cellCount,
        symbols: small.symbols,
        givens: small.givens,
        constraints: small.constraints,
        limit: 3,
        maxNodes: 1000000,
      });
      expect(independent.exhausted || independent.witnesses.length >= 3).toBe(true);
      const expected = Math.min(independent.witnesses.length, 2);
      expect(witnesses).toHaveLength(expected);
      expect(terminal.kind).toBe(expected === 2 ? "cap-reached" : "exhausted");
      for (const witness of witnesses)
        expect(isWitness(problem, assembly, witness.values)).toBe(true);
      if (expected === 2) multiple += 1;
    }
    expect(multiple).toBeGreaterThanOrEqual(5);
  });

  test("prune never removes a value some completion of the partial assignment uses", () => {
    const random = rng(99);
    let checks = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const { small, problem } = engineProblem(seed, {
        cages: 3,
        arrows: 2,
        orders: 2,
        dots: 3,
        negativeDots: true,
      });
      const assembly = assembled(problem);
      const witnesses = variantOracle({
        cellCount: small.cellCount,
        symbols: small.symbols,
        givens: small.givens,
        constraints: small.constraints,
        limit: 20,
        maxNodes: 1000000,
      }).witnesses;
      const full = (1 << problem.symbols.length) - 1;
      for (const witness of witnesses)
        for (let trial = 0; trial < 5; trial += 1) {
          // Place a random subset of the witness; every open cell keeps the full mask.
          const values = witness.map((value) => (random() < 0.4 ? value : 0));
          const masks = values.map((value) => (value === 0 ? full : symbolMask(value)));
          for (const rule of problem.constraints) {
            const module = assembly.modules.get(rule.id)!;
            if (!module.prune) continue;
            const next = module.prune(rule, problem, values, masks);
            expect(next).not.toBeNull();
            for (const cell of rule.cells)
              expect((next![cell] & symbolMask(witness[cell])) !== 0).toBe(true);
            checks += 1;
          }
        }
    }
    expect(checks).toBeGreaterThan(500);
  });

  test("a 9x9 killer with no givens reaches a count within the node budget", () => {
    // Cages read off the known solution; distinctness inside each cage holds by construction.
    const solution = [...SOLUTION].map(Number);
    const random = rng(7);
    const used = new Set<number>();
    const cages: { id: string; type: string; cells: number[]; parameters: { total: number } }[] =
      [];
    const neighbours = (cell: number) => {
      const r = Math.floor(cell / 9),
        c = cell % 9;
      const result: number[] = [];
      if (c + 1 < 9) result.push(cell + 1);
      if (r + 1 < 9) result.push(cell + 9);
      if (c > 0) result.push(cell - 1);
      if (r > 0) result.push(cell - 9);
      return result;
    };
    for (let start = 0; start < 81; start += 1) {
      if (used.has(start)) continue;
      const cells = [start];
      used.add(start);
      const size = 2 + Math.floor(random() * 3);
      while (cells.length < size) {
        const frontier = cells
          .flatMap(neighbours)
          .filter((cell) => !used.has(cell) && !cells.some((c) => solution[c] === solution[cell]));
        if (frontier.length === 0) break;
        const next = frontier[Math.floor(random() * frontier.length)];
        cells.push(next);
        used.add(next);
      }
      if (cells.length === 1) {
        // Merge a lone cell into any neighbouring cage that can still take it.
        const host = cages.find(
          (cage) =>
            cage.cells.some((cell) => neighbours(start).includes(cell)) &&
            !cage.cells.some((cell) => solution[cell] === solution[start]) &&
            cage.cells.length < 5,
        );
        if (host) {
          host.cells = [...host.cells, start].sort((a, b) => a - b);
          host.parameters = { total: host.cells.reduce((t, cell) => t + solution[cell], 0) };
          continue;
        }
      }
      cages.push({
        id: `cage:${cages.length}`,
        type: "cage@1",
        cells: [...cells].sort((a, b) => a - b),
        parameters: { total: cells.reduce((t, cell) => t + solution[cell], 0) },
      });
    }
    expect(cages.every((cage) => cage.cells.length >= 2)).toBe(true);
    const classic = normalizeClassic({
      kind: "classic",
      version: 1,
      width: 9,
      height: 9,
      givens: Array(81).fill(0),
    });
    const problem = canonicalProblem({
      schema: 1,
      cells: classic.cells,
      symbols: classic.symbols,
      givens: classic.givens,
      constraints: [...classic.constraints, ...(cages as ConstraintInstance[])],
    });
    const assembly = assembled(problem);
    const { witnesses, terminal, stats } = run(problem, assembly);
    // Random cages rarely make the grid unique: the count reaches its cap or
    // exhausts, every witness is valid, and the search stays far below the budget.
    expect(witnesses.length).toBeGreaterThanOrEqual(1);
    for (const witness of witnesses)
      expect(isWitness(problem, assembly, witness.values)).toBe(true);
    expect(["exhausted", "cap-reached"]).toContain(terminal.kind);
    expect(stats.nodes).toBeLessThan(500000);
  });
});
