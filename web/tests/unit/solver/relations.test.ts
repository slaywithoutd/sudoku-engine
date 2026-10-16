import { describe, expect, test } from "vitest";
import { canonicalProblem } from "../../../src/solver/problem";
import type { ConstraintInstance, EngineProblem } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { productionRules } from "../../../src/solver/rules/registry";
import { OrderRule } from "../../../src/solver/rules/order";
import { DifferenceRule } from "../../../src/solver/rules/difference";
import { initialize, retainedProof, commitChecked } from "../../../src/solver/state/candidates";
import { checkProposal } from "../../../src/solver/proof/checker";
import type { CheckContext, DeductionProposal } from "../../../src/solver/proof/types";
import type { ReadView } from "../../../src/solver/state/types";
import { symbolMask } from "../../../src/solver/state/read";
import { variantOracle, type VariantConstraint } from "../../solver/oracle-variants";
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

/** Runs every rule's propagation to a fixed point through the real admission path. */
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

describe("order@1 and difference@1 modules (T04)", () => {
  test("validate scope and parameters", () => {
    const order = new OrderRule();
    const base = problem(3, 4, [], []);
    const issues = (rule: ConstraintInstance) => order.validate(base, rule).map((i) => i.code);
    expect(issues({ id: "o", type: "order@1", cells: [0, 1], parameters: {} })).toEqual([]);
    expect(issues({ id: "o", type: "order@1", cells: [0], parameters: {} })).toContain(
      "invalid-scope",
    );
    expect(issues({ id: "o", type: "order@1", cells: [1, 1], parameters: {} })).toContain(
      "invalid-scope",
    );
    expect(issues({ id: "o", type: "order@1", cells: [0, 7], parameters: {} })).toContain(
      "invalid-scope",
    );
    expect(issues({ id: "o", type: "order@1", cells: [0, 1], parameters: { x: 1 } })).toContain(
      "invalid-parameters",
    );
    const difference = new DifferenceRule();
    const dIssues = (rule: ConstraintInstance) =>
      difference.validate(base, rule).map((i) => i.code);
    for (const kind of ["consecutive", "ratio", "neither"])
      expect(
        dIssues({ id: "d", type: "difference@1", cells: [0, 1], parameters: { kind } }),
      ).toEqual([]);
    expect(dIssues({ id: "d", type: "difference@1", cells: [0, 1], parameters: {} })).toContain(
      "invalid-parameters",
    );
    expect(
      dIssues({ id: "d", type: "difference@1", cells: [0, 1], parameters: { kind: "twin" } }),
    ).toContain("invalid-parameters");
    expect(
      assemble(
        problem(
          2,
          4,
          [],
          [{ id: "d", type: "difference@1", cells: [0, 1], parameters: { kind: "x" } }],
        ),
        productionRules(),
      ).ok,
    ).toBe(false);
  });

  test("publish relation facts in ascending cell order regardless of the rule's orientation", () => {
    const forward = view(
      problem(3, 4, [], [{ id: "o", type: "order@1", cells: [0, 2], parameters: {} }]),
    );
    const backward = view(
      problem(3, 4, [], [{ id: "o", type: "order@1", cells: [2, 0], parameters: {} }]),
    );
    const relation = (current: ReadView) =>
      [...current.facts.values()].find((fact) => fact.proposition.kind === "relation")!.proposition;
    expect(relation(forward)).toEqual({
      kind: "relation",
      cells: [0, 2],
      tuples: [
        [1, 2],
        [1, 3],
        [1, 4],
        [2, 3],
        [2, 4],
        [3, 4],
      ],
    });
    expect(relation(backward)).toEqual({
      kind: "relation",
      cells: [0, 2],
      tuples: [
        [2, 1],
        [3, 1],
        [3, 2],
        [4, 1],
        [4, 2],
        [4, 3],
      ],
    });
    const dots = view(
      problem(
        2,
        6,
        [],
        [{ id: "w", type: "difference@1", cells: [0, 1], parameters: { kind: "consecutive" } }],
      ),
    );
    const ratio = view(
      problem(
        2,
        6,
        [],
        [{ id: "b", type: "difference@1", cells: [0, 1], parameters: { kind: "ratio" } }],
      ),
    );
    const neither = view(
      problem(
        2,
        6,
        [],
        [{ id: "n", type: "difference@1", cells: [0, 1], parameters: { kind: "neither" } }],
      ),
    );
    expect((relation(dots) as unknown as { tuples: number[][] }).tuples).toEqual([
      [1, 2],
      [2, 1],
      [2, 3],
      [3, 2],
      [3, 4],
      [4, 3],
      [4, 5],
      [5, 4],
      [5, 6],
      [6, 5],
    ]);
    expect((relation(ratio) as unknown as { tuples: number[][] }).tuples).toEqual([
      [1, 2],
      [2, 1],
      [2, 4],
      [3, 6],
      [4, 2],
      [6, 3],
    ]);
    // 36 pairs minus 10 consecutive minus 6 ratio, plus the 2 pairs that are both ((1,2) and (2,1)).
    expect((relation(neither) as unknown as { tuples: number[][] }).tuples).toHaveLength(
      36 - 10 - 6 + 2,
    );
  });

  test("checkComplete agrees with the oracle's evaluators on complete grids", () => {
    const order = new OrderRule(),
      difference = new DifferenceRule();
    for (let a = 1; a <= 6; a += 1)
      for (let b = 1; b <= 6; b += 1) {
        const assignment = { values: [a, b] };
        expect(
          order.checkComplete(
            { id: "o", type: "order@1", cells: [0, 1], parameters: {} },
            assignment,
          ),
        ).toBe(a < b);
        for (const kind of ["consecutive", "ratio", "neither"] as const)
          expect(
            difference.checkComplete(
              { id: "d", type: "difference@1", cells: [0, 1], parameters: { kind } },
              assignment,
            ),
          ).toBe(
            kind === "consecutive"
              ? Math.abs(a - b) === 1
              : kind === "ratio"
                ? a === 2 * b || b === 2 * a
                : Math.abs(a - b) !== 1 && a !== 2 * b && b !== 2 * a,
          );
      }
    expect(
      order.checkComplete(
        { id: "o", type: "order@1", cells: [0, 1], parameters: {} },
        { values: [0, 3] },
      ),
    ).toBe(false);
  });

  test("a thermometer chain propagates bounds through the checked table path", () => {
    // 0 < 1 < 2 < 3 over symbols 1..5: cell0 <= 2, cell3 >= 4, after two passes.
    const chain = problem(
      4,
      5,
      [],
      [
        { id: "t0", type: "order@1", cells: [0, 1], parameters: {} },
        { id: "t1", type: "order@1", cells: [1, 2], parameters: {} },
        { id: "t2", type: "order@1", cells: [2, 3], parameters: {} },
      ],
    );
    const { view: fixed, proposals } = propagateAll(view(chain));
    expect(domain(fixed, 0)).toEqual([1, 2]);
    expect(domain(fixed, 1)).toEqual([2, 3]);
    expect(domain(fixed, 2)).toEqual([3, 4]);
    expect(domain(fixed, 3)).toEqual([4, 5]);
    expect(proposals.every((p) => p.technique === "rule-relation@1")).toBe(true);
    // Every proposal is one table plus one projection per removal plus domain closure.
    for (const proposal of proposals) {
      const rules = proposal.proof.nodes.map((node) => node.rule);
      expect(rules.filter((rule) => rule === "table-filter@1")).toHaveLength(1);
      expect(rules.filter((rule) => rule === "table-project@1")).toHaveLength(
        proposal.effects.length,
      );
    }
  });

  test("a placed cell drives the partner and a black dot removes non-ratio candidates", () => {
    const placed = view(
      problem(
        2,
        9,
        [4, 0],
        [{ id: "b", type: "difference@1", cells: [0, 1], parameters: { kind: "ratio" } }],
      ),
    );
    const { view: fixed } = propagateAll(placed);
    expect(domain(fixed, 1)).toEqual([2, 8]);
    const nothing = view(
      problem(
        2,
        9,
        [],
        [{ id: "n", type: "difference@1", cells: [0, 1], parameters: { kind: "neither" } }],
      ),
    );
    // A negative dot over full domains excludes nothing yet: propagation is exhausted without a proposal.
    const events = [
      ...nothing.assembly.modules
        .get("n")!
        .propagate(nothing, nothing.assembly.problem.constraints[0]),
    ];
    expect(events.some((event) => event.kind === "proposal")).toBe(false);
    expect(events.at(-1)).toEqual({ kind: "exhausted" });
  });

  test("the maintenance grammar rejects a proposal whose effect the relation still supports", () => {
    const current = view(
      problem(2, 4, [], [{ id: "o", type: "order@1", cells: [0, 1], parameters: {} }]),
    );
    const event = [
      ...current.assembly.modules
        .get("o")!
        .propagate(current, current.assembly.problem.constraints[0]),
    ].find((e) => e.kind === "proposal");
    if (event?.kind !== "proposal") throw new Error("no proposal");
    // Genuine proposal: cell0 loses 4, cell1 loses 1.
    expect([...checkProposal(event.proposal, context(current))].at(-1)?.kind).toBe("checked");
    // Forge an extra effect the table does not justify.
    const forged = structuredClone(event.proposal) as DeductionProposal;
    (forged.effects as { cell: number; symbol: number; kind: string }[]).push({
      kind: "remove",
      cell: 0,
      symbol: 2,
    });
    expect([...checkProposal(forged, context(current))].at(-1)?.kind).toBe("rejected");
    // Tamper with the table's count.
    const miscount = structuredClone(event.proposal) as DeductionProposal;
    const table = miscount.proof.nodes.find((node) => node.rule === "table-filter@1")!;
    (table.conclusion as { count: number }).count += 1;
    expect([...checkProposal(miscount, context(current))].at(-1)?.kind).toBe("rejected");
    // Relabel as classic propagation: the classic grammar must refuse table nodes.
    const relabeled = {
      ...event.proposal,
      technique: "rule-propagation@1",
      pattern: { kind: "propagation" },
    };
    expect([...checkProposal(relabeled, context(current))].at(-1)?.kind).toBe("rejected");
  });

  test("propagation never removes a candidate present in an oracle solution (generated mixed problems)", () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const small = generateSmall(seed, {
        orders: 3,
        dots: 3,
        negativeDots: seed % 2 === 0,
        givens: 5,
      });
      const constraints = toEngineConstraints(small).filter((c) =>
        ["all-different@1", "order@1", "difference@1"].includes(c.type),
      );
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
      const oracleConstraints: VariantConstraint[] = small.constraints.filter(
        (c) => c.kind !== "sum",
      );
      const witnesses = variantOracle({
        cellCount: small.cellCount,
        symbols: small.symbols,
        givens: small.givens,
        constraints: oracleConstraints,
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
