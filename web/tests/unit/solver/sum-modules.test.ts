import { describe, expect, test } from "vitest";
import { canonicalProblem, normalizeClassic, withDiagonals } from "../../../src/solver/problem";
import type { ConstraintInstance, EngineProblem } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { productionRules } from "../../../src/solver/rules/registry";
import { CageRule } from "../../../src/solver/rules/cage";
import { ArrowRule } from "../../../src/solver/rules/arrow";
import { initialize, retainedProof, commitChecked } from "../../../src/solver/state/candidates";
import { checkProposal } from "../../../src/solver/proof/checker";
import type { CheckContext, DeductionProposal } from "../../../src/solver/proof/types";
import type { ReadView } from "../../../src/solver/state/types";
import { symbolMask } from "../../../src/solver/state/read";
import { variantOracle } from "../../solver/oracle-variants";
import { generateSmall, toEngineConstraints } from "../../solver/generate-small";

const limits = {
  timeMs: 20000,
  workUnits: 1000000,
  exactNodes: 1000000,
  stepNodes: 4096,
  runNodes: 20000,
  proofBytes: 8000000,
  stepBytes: 2000000,
  batchBytes: 65536,
  inFlightBatches: 2,
  workspaceBytes: 16000000,
};

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

function propagateAll(start: ReadView): { view: ReadView; proposals: DeductionProposal[] } {
  let current = start;
  const proposals: DeductionProposal[] = [];
  let progress = true;
  while (progress) {
    progress = false;
    for (const rule of current.assembly.problem.constraints) {
      const module = current.assembly.modules.get(rule.id)!;
      for (const event of module.propagate(current, rule)) {
        if (event.kind !== "proposal") continue;
        const checked = [...checkProposal(event.proposal, context(current))].at(-1);
        if (checked?.kind !== "checked")
          throw new Error(
            `rejected ${rule.id}: ${checked && "code" in checked ? checked.code : "?"}`,
          );
        proposals.push(event.proposal);
        current = commitChecked(current, checked.step).view;
        progress = true;
      }
    }
  }
  return { view: current, proposals };
}

const domain = (current: ReadView, cell: number) =>
  current.assembly.problem.symbols.filter((s) => current.state.domains[cell] & symbolMask(s));
const cage = (id: string, cells: number[], total: number): ConstraintInstance => ({
  id,
  type: "cage@1",
  cells,
  parameters: { total },
});
const arrow = (id: string, cells: number[]): ConstraintInstance => ({
  id,
  type: "arrow@1",
  cells,
  parameters: {},
});

describe("cage@1 and arrow@1 modules (T05)", () => {
  test("validate scope and parameters", () => {
    const base = problem(20, 9, [], []);
    const cageIssues = (rule: ConstraintInstance) =>
      new CageRule().validate(base, rule).map((issue) => issue.code);
    expect(cageIssues(cage("c", [0, 1], 3))).toEqual([]);
    expect(cageIssues(cage("c", [0], 3))).toContain("invalid-scope");
    expect(cageIssues(cage("c", [0, 0], 3))).toContain("invalid-scope");
    expect(cageIssues(cage("c", [0, 99], 3))).toContain("invalid-scope");
    expect(
      cageIssues(
        cage(
          "c",
          Array.from({ length: 17 }, (_, i) => i),
          3,
        ),
      ),
    ).toContain("invalid-scope");
    expect(cageIssues(cage("c", [0, 1], 0))).toContain("invalid-parameters");
    expect(cageIssues(cage("c", [0, 1], 2.5))).toContain("invalid-parameters");
    expect(
      cageIssues({ id: "c", type: "cage@1", cells: [0, 1], parameters: { total: 3, x: 1 } }),
    ).toContain("invalid-parameters");
    const arrowIssues = (rule: ConstraintInstance) =>
      new ArrowRule().validate(base, rule).map((issue) => issue.code);
    expect(arrowIssues(arrow("a", [0, 1, 2]))).toEqual([]);
    expect(arrowIssues(arrow("a", [0, 1]))).toContain("invalid-scope");
    expect(arrowIssues(arrow("a", [0, 1, 0]))).toContain("invalid-scope");
    expect(
      arrowIssues({ id: "a", type: "arrow@1", cells: [0, 1, 2], parameters: { total: 1 } }),
    ).toContain("invalid-parameters");
  });

  test("checkComplete matches the rules' meaning", () => {
    const cageRule = new CageRule(),
      arrowRule = new ArrowRule();
    expect(cageRule.checkComplete(cage("c", [0, 1, 2], 6), { values: [1, 2, 3] })).toBe(true);
    expect(cageRule.checkComplete(cage("c", [0, 1, 2], 6), { values: [2, 2, 2] })).toBe(false);
    expect(cageRule.checkComplete(cage("c", [0, 1, 2], 7), { values: [1, 2, 3] })).toBe(false);
    expect(cageRule.checkComplete(cage("c", [0, 1, 2], 6), { values: [1, 0, 5] })).toBe(false);
    expect(arrowRule.checkComplete(arrow("a", [0, 1, 2]), { values: [7, 3, 4] })).toBe(true);
    expect(arrowRule.checkComplete(arrow("a", [0, 1, 2]), { values: [7, 3, 3] })).toBe(false);
    expect(arrowRule.checkComplete(arrow("a", [0, 1, 2]), { values: [6, 3, 3] })).toBe(true);
    expect(arrowRule.checkComplete(arrow("a", [0, 1, 2]), { values: [0, 3, 3] })).toBe(false);
  });

  test("publish the expected capabilities: cage scope plus sum, signed arrow sum, house sum", () => {
    const current = view(problem(12, 9, [], [cage("k", [2, 0, 1], 6), arrow("a", [5, 4, 3])]));
    const facts = [...current.facts.values()];
    expect(
      facts.find((f) => f.proposition.kind === "all-different" && f.rules.includes("k"))
        ?.proposition,
    ).toEqual({ kind: "all-different", cells: [0, 1, 2] });
    expect(
      facts.filter((f) => f.proposition.kind === "cover" && f.rules.includes("k")),
    ).toHaveLength(0);
    expect(
      facts.find((f) => f.proposition.kind === "sum" && f.rules.includes("k"))?.proposition,
    ).toEqual({
      kind: "sum",
      cells: [0, 1, 2],
      coefficients: [1, 1, 1],
      total: 6,
    });
    expect(
      facts.find((f) => f.proposition.kind === "sum" && f.rules.includes("a"))?.proposition,
    ).toEqual({
      kind: "sum",
      cells: [3, 4, 5],
      coefficients: [1, 1, -1],
      total: 0,
    });
    // A full classic house now carries its 45-sum beside its covers (lemma M4).
    const classic = view(
      normalizeClassic({
        kind: "classic",
        version: 1,
        width: 9,
        height: 9,
        givens: Array(81).fill(0),
      }),
    );
    const houseSums = [...classic.facts.values()].filter((f) => f.proposition.kind === "sum");
    expect(houseSums).toHaveLength(27);
    expect(houseSums.every((f) => f.proposition.kind === "sum" && f.proposition.total === 45)).toBe(
      true,
    );
    // A cage as large as the symbol set still claims no covers.
    const wide = view(
      problem(
        9,
        9,
        [],
        [
          cage(
            "w",
            Array.from({ length: 9 }, (_, i) => i),
            45,
          ),
        ],
      ),
    );
    expect([...wide.facts.values()].filter((f) => f.proposition.kind === "cover")).toHaveLength(0);
  });

  test("bounds propagation narrows a cage, an arrow in both directions, and a placed partner", () => {
    const small = propagateAll(view(problem(3, 9, [], [cage("k", [0, 1, 2], 6)])));
    for (const cell of [0, 1, 2]) expect(domain(small.view, cell)).toEqual([1, 2, 3, 4]);
    expect(small.proposals.every((p) => p.technique === "rule-sum@1")).toBe(true);
    for (const proposal of small.proposals)
      expect(proposal.proof.nodes.filter((node) => node.rule === "linear-sum@1")).toHaveLength(
        proposal.effects.length,
      );
    const shot = propagateAll(view(problem(3, 9, [], [arrow("a", [0, 1, 2])])));
    expect(domain(shot.view, 0)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(domain(shot.view, 1)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(domain(shot.view, 2)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const placed = propagateAll(view(problem(2, 9, [4, 0], [cage("k", [0, 1], 10)])));
    expect(domain(placed.view, 1)).toEqual([6]);
    // Nothing to remove: exhausted without a proposal.
    const idle = view(problem(2, 9, [], [cage("k", [0, 1], 10)]));
    const events = [
      ...idle.assembly.modules.get("k")!.propagate(idle, idle.assembly.problem.constraints[0]),
    ];
    expect(events.some((e) => e.kind === "proposal")).toBe(false);
  });

  test("the sum maintenance grammar rejects unjustified, tampered or relabeled proposals", () => {
    const current = view(problem(3, 9, [], [cage("k", [0, 1, 2], 6)]));
    const event = [
      ...current.assembly.modules
        .get("k")!
        .propagate(current, current.assembly.problem.constraints[0]),
    ].find((e) => e.kind === "proposal");
    if (event?.kind !== "proposal") throw new Error("no proposal");
    expect([...checkProposal(event.proposal, context(current))].at(-1)?.kind).toBe("checked");
    const forged = structuredClone(event.proposal) as DeductionProposal;
    (forged.effects as { cell: number; symbol: number; kind: string }[]).push({
      kind: "remove",
      cell: 0,
      symbol: 4,
    });
    expect([...checkProposal(forged, context(current))].at(-1)?.kind).toBe("rejected");
    const dropped = structuredClone(event.proposal) as DeductionProposal;
    const node = dropped.proof.nodes.find((n) => n.rule === "linear-sum@1")!;
    (node as unknown as { premises: number[] }).premises = node.premises.slice(0, -1);
    expect([...checkProposal(dropped, context(current))].at(-1)?.kind).toBe("rejected");
    const relabeled = {
      ...event.proposal,
      technique: "rule-relation@1",
      pattern: { kind: "relation", constraintId: "k" },
    };
    expect([...checkProposal(relabeled, context(current))].at(-1)?.kind).toBe("rejected");
  });

  test("withDiagonals adds two full-cover scopes and rejects non-square grids", () => {
    const square = withDiagonals(problem(16, 4, [], []));
    const current = view(square);
    const covers = [...current.facts.values()].filter((f) => f.proposition.kind === "cover");
    expect(covers.filter((f) => f.rules.includes("diagonal:main"))).toHaveLength(4);
    expect(covers.filter((f) => f.rules.includes("diagonal:anti"))).toHaveLength(4);
    expect(
      [...current.facts.values()].find(
        (f) => f.proposition.kind === "all-different" && f.rules.includes("diagonal:anti"),
      )?.proposition,
    ).toEqual({ kind: "all-different", cells: [3, 6, 9, 12] });
    expect(() => withDiagonals(problem(12, 4, [], []))).toThrow();
  });

  test("propagation never removes a candidate present in an oracle solution (cages and arrows)", () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const small = generateSmall(seed, { cages: 3, arrows: 3, orders: 1, givens: 4 });
      const constraints = toEngineConstraints(small);
      const engineProblem = canonicalProblem({
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
      const { view: fixed } = propagateAll(view(engineProblem));
      const witnesses = variantOracle({
        cellCount: small.cellCount,
        symbols: small.symbols,
        givens: small.givens,
        constraints: small.constraints,
        limit: 500,
        maxNodes: 200000,
      }).witnesses;
      expect(witnesses.length).toBeGreaterThanOrEqual(1);
      for (const witness of witnesses)
        witness.forEach((symbol, cell) => {
          expect(fixed.state.domains[cell] & symbolMask(symbol)).not.toBe(0);
        });
    }
  });
});
