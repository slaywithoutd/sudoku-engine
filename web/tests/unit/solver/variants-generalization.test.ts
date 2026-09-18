import { describe, expect, test } from "vitest";
import { canonicalProblem } from "../../../src/solver/problem";
import type { ConstraintInstance, EngineProblem } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { productionRules } from "../../../src/solver/rules/registry";
import { initialize, retainedProof, commitChecked } from "../../../src/solver/state/candidates";
import { checkProposal } from "../../../src/solver/proof/checker";
import type { CheckContext, DeductionProposal } from "../../../src/solver/proof/types";
import type { ReadView } from "../../../src/solver/state/types";
import { symbolMask } from "../../../src/solver/state/read";
import { buildImplications } from "../../../src/solver/indexes/implications";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import type { IndexEvent } from "../../../src/solver/indexes/workspace";
import { getTechniques } from "../../../src/solver/techniques/registry";
import { discoveryContext } from "../../solver/discovery-context";
import { variantOracle, type VariantConstraint } from "../../solver/oracle-variants";

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

/** Rule maintenance to a fixed point through the real admission path. */
function maintained(start: ReadView): ReadView {
  let current = start;
  let progress = true;
  while (progress) {
    progress = false;
    for (const rule of current.assembly.problem.constraints) {
      const module = current.assembly.modules.get(rule.id)!;
      for (const event of module.propagate(current, rule)) {
        if (event.kind !== "proposal") continue;
        const checked = [...checkProposal(event.proposal, context(current))].at(-1);
        if (checked?.kind !== "checked") throw new Error(`rejected maintenance ${rule.id}`);
        current = commitChecked(current, checked.step).view;
        progress = true;
      }
    }
  }
  return current;
}

function ready<T>(events: Generator<IndexEvent<T>>): T {
  let result: T | undefined;
  for (const event of events) {
    if (event.kind === "ready") result = event.value;
    if (event.kind === "interrupted") throw new Error(event.reason);
  }
  if (!result) throw new Error("missing-ready");
  return result;
}

const scope = (id: string, cells: number[]): ConstraintInstance => ({
  id,
  type: "all-different@1",
  cells,
  parameters: {},
});
const order = (id: string, cells: [number, number]): ConstraintInstance => ({
  id,
  type: "order@1",
  cells,
  parameters: {},
});
const domain = (current: ReadView, cell: number) =>
  current.assembly.problem.symbols.filter((s) => current.state.domains[cell] & symbolMask(s));

/** Runs one technique on the view; every proposal must pass admission. */
function discover(current: ReadView, id: string): DeductionProposal[] {
  const descriptor = getTechniques("classic-expanded@1").find((entry) => entry.id === id);
  if (!descriptor) throw new Error(`no technique ${id}`);
  const eligibility = descriptor.eligible(current);
  if (eligibility.kind !== "yes") throw new Error(`excluded ${id}: ${eligibility.reason}`);
  const proposals: DeductionProposal[] = [];
  for (const event of descriptor.discover(current, discoveryContext())) {
    if (event.kind !== "proposal") continue;
    const checked = [...checkProposal(event.proposal, context(current))].at(-1);
    if (checked?.kind !== "checked")
      throw new Error(
        `${id} proposal rejected: ${checked && "code" in checked ? checked.code : "?"}`,
      );
    proposals.push(event.proposal);
  }
  return proposals;
}

describe("free generalization and relation strong links (T07)", () => {
  test("the implication index derives exactly the avoidable strong pairs of a relation", () => {
    // a < b over 1..3 with full domains: rows (1,2) (1,3) (2,3); only a=1 or b=3 covers all.
    const current = view(problem(2, 3, [], [order("t", [0, 1])]));
    const graph = ready(
      buildImplications(current, new IndexWorkspace({ entryLimit: 10000, byteLimit: 10000000 })),
    );
    const strong = graph.edges.filter(
      (edge) => edge.kind === "strong" && edge.recipe.kind === "relation-strong",
    );
    expect(strong.map((edge) => edge.literals.map((l) => `${l.cell}=${l.symbol}`))).toEqual([
      ["0=1", "1=3"],
    ]);
    expect(
      graph.strong({ cell: 0, symbol: 1, positive: true }, { cell: 1, symbol: 3, positive: true }),
    ).toBe(true);
    // Weak conflicts of the same relation remain: (1,1) (2,1) (2,2) (3,1) (3,2) (3,3).
    expect(
      graph.weak({ cell: 0, symbol: 2, positive: true }, { cell: 1, symbol: 2, positive: true }),
    ).toBe(true);
    expect(graph.edges.filter((edge) => edge.recipe.kind === "relation-conflict")).toHaveLength(6);
  });

  /**
   * Thermometer fixture whose strong link no cell bivalue can replace:
   * A in {1,5,6}, B in {2,7}, so a < b leaves rows (1,2) (1,7) (5,7) (6,7) and
   * "A=1 or B=7" is the only strong pair. C in {1,7} sees B; D in {1,2} sees A
   * and C. Chain: not A=1 -> B=7 -> not C=7 -> C=1; ends A=1 / C=1 remove D=1.
   */
  function thermometerFixture(): ReadView {
    const cells = { A: 0, B: 1, C: 2, D: 3 };
    const constraints: ConstraintInstance[] = [
      order("thermo", [cells.A, cells.B]),
      scope("bc", [cells.B, cells.C]),
      scope("ad", [cells.A, cells.D]),
      scope("cd", [cells.C, cells.D]),
    ];
    const givens: number[] = Array(23).fill(0);
    const pin = (id: string, cell: number, start: number, values: number[]) => {
      const peers = values.map((value, index) => {
        givens[start + index] = value;
        return start + index;
      });
      constraints.push(scope(id, [cell, ...peers]));
    };
    pin("ae", cells.A, 4, [2, 3, 4, 7]);
    pin("bf", cells.B, 8, [1, 3, 4, 5, 6]);
    pin("cg", cells.C, 13, [2, 3, 4, 5, 6]);
    pin("dh", cells.D, 18, [3, 4, 5, 6, 7]);
    const current = maintained(view(problem(23, 7, givens, constraints)));
    expect(domain(current, cells.A)).toEqual([1, 5, 6]);
    expect(domain(current, cells.B)).toEqual([2, 7]);
    expect(domain(current, cells.C)).toEqual([1, 7]);
    expect(domain(current, cells.D)).toEqual([1, 2]);
    return current;
  }

  test("an AIC crosses a thermometer strong link and is admitted by the chain grammar", () => {
    const current = thermometerFixture();
    const proposals = discover(current, "c16@1");
    const throughThermo = proposals.filter((proposal) =>
      JSON.stringify(proposal.pattern).includes('"kind":"relation"'),
    );
    expect(throughThermo.length).toBeGreaterThan(0);
    expect(
      throughThermo.some((proposal) =>
        proposal.effects.some((effect) => effect.cell === 3 && effect.symbol === 1),
      ),
    ).toBe(true);
    // Every chain proposal must be sound against the independent oracle.
    const oracleConstraints: VariantConstraint[] = [
      { kind: "order", cells: [0, 1] },
      ...current.assembly.problem.constraints
        .filter((c) => c.type === "all-different@1")
        .map((c) => ({ kind: "all-different" as const, cells: [...c.cells] })),
    ];
    const witnesses = variantOracle({
      cellCount: 23,
      symbols: [1, 2, 3, 4, 5, 6, 7],
      givens: current.assembly.problem.givens,
      constraints: oracleConstraints,
      limit: 500,
      maxNodes: 1000000,
    }).witnesses;
    expect(witnesses.length).toBeGreaterThan(0);
    for (const proposal of proposals)
      for (const effect of proposal.effects)
        for (const witness of witnesses)
          expect(effect.kind === "remove" && witness[effect.cell] === effect.symbol).toBe(false);
  });

  test("a forged relation strong source is rejected by the chain grammar", () => {
    const current = thermometerFixture();
    const proposal = discover(current, "c16@1").find((p) =>
      JSON.stringify(p.pattern).includes('"kind":"relation"'),
    );
    if (!proposal) throw new Error("no chain through the thermometer");
    // Miscount the relation table.
    const miscount = structuredClone(proposal) as DeductionProposal;
    const table = miscount.proof.nodes.find((node) => node.rule === "table-filter@1")!;
    (table.conclusion as { count: number }).count += 1;
    expect([...checkProposal(miscount, context(current))].at(-1)?.kind).toBe("rejected");
    // Widen the strong clause to a pair the rows do not all satisfy.
    const widened = structuredClone(proposal) as DeductionProposal;
    const projection = widened.proof.nodes.find(
      (node) =>
        node.rule === "table-project@1" &&
        node.conclusion.kind === "clause" &&
        node.conclusion.alternatives.every((l) => l.positive),
    )!;
    (
      projection.conclusion as unknown as { alternatives: { symbol: number }[] }
    ).alternatives[0].symbol = 5;
    expect([...checkProposal(widened, context(current))].at(-1)?.kind).toBe("rejected");
  });

  test("a naked pair inside a killer cage is found by C04 and admitted", () => {
    // Cage {0,1,2} sum 6; peers pin cells 0 and 1 to {1,2}, so the pair removes 2 from cell 2.
    const current = maintained(
      view(
        problem(
          5,
          4,
          [0, 0, 0, 3, 4],
          [
            { id: "k", type: "cage@1", cells: [0, 1, 2], parameters: { total: 6 } },
            scope("s3", [0, 3]),
            scope("s4", [0, 4]),
            scope("t3", [1, 3]),
            scope("t4", [1, 4]),
          ],
        ),
      ),
    );
    expect(domain(current, 0)).toEqual([1, 2]);
    expect(domain(current, 1)).toEqual([1, 2]);
    expect(domain(current, 2)).toContain(2);
    const proposals = discover(current, "c04@1");
    const pair = proposals.find((p) =>
      p.effects.some((effect) => effect.cell === 2 && effect.symbol === 2),
    );
    expect(pair).toBeDefined();
    expect(JSON.stringify(pair!.pattern)).toContain('"k"');
  });

  test("an ALS-XZ whose sets live in two-cell scopes is found by C18 and admitted", () => {
    // ALS A = {0,1} with {1,2,3} in scope a; ALS B = {2,3} with {1,3,4} in scope b.
    // Every 1 (and 3) of A sees every 1 (3) of B, and cell 4 sees all four cells,
    // so ALS-XZ removes the shared symbols from cell 4.
    const current = maintained(
      view(
        problem(
          7,
          4,
          [0, 0, 0, 0, 0, 4, 2],
          [
            scope("a", [0, 1]),
            scope("b", [2, 3]),
            scope("x02", [0, 2]),
            scope("x03", [0, 3]),
            scope("x12", [1, 2]),
            scope("x13", [1, 3]),
            scope("z0", [0, 4]),
            scope("z1", [1, 4]),
            scope("z2", [2, 4]),
            scope("z3", [3, 4]),
            scope("p0", [0, 5]),
            scope("p1", [1, 5]),
            scope("q2", [2, 6]),
            scope("q3", [3, 6]),
          ],
        ),
      ),
    );
    expect(domain(current, 0)).toEqual([1, 2, 3]);
    expect(domain(current, 2)).toEqual([1, 3, 4]);
    const proposals = discover(current, "c18@1");
    const xz = proposals.find((p) =>
      p.effects.some((effect) => effect.cell === 4 && (effect.symbol === 3 || effect.symbol === 1)),
    );
    expect(xz).toBeDefined();
    expect(JSON.stringify(xz!.pattern)).toMatch(/"house":"(a|b)"/);
  });
});
