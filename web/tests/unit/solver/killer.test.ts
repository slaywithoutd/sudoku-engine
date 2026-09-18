import { describe, expect, test } from "vitest";
import { canonicalProblem } from "../../../src/solver/problem";
import type { ConstraintInstance, EngineProblem } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { productionRules } from "../../../src/solver/rules/registry";
import { initialize, retainedProof, commitChecked } from "../../../src/solver/state/candidates";
import { checkProposal } from "../../../src/solver/proof/checker";
import { replay } from "../../../src/solver/proof/replay";
import { makeSnapshot } from "../../../src/solver/snapshot";
import type { CheckContext, DeductionProposal } from "../../../src/solver/proof/types";
import type { ReadView } from "../../../src/solver/state/types";
import { symbolMask } from "../../../src/solver/state/read";
import {
  getTechniques,
  profileFor,
  profileReadiness,
  PROFILES,
} from "../../../src/solver/techniques/registry";
import { schedulingOptions } from "../../../src/solver/scheduling/work";
import { K01_PROFILE, analyzeCage, liveCages } from "../../../src/solver/techniques/killer";
import { validateVariantCoverage, variantEntries } from "../../../src/solver/techniques/manifest";
import { discoveryContext } from "../../solver/discovery-context";
import { variantOracle } from "../../solver/oracle-variants";
import { generateSmall, toEngineConstraints } from "../../solver/generate-small";
import fixtures from "../../solver/fixtures/K01.json";

const limits = discoveryContext().limits;

interface Fixture {
  id: string;
  cellCount: number;
  symbols: number;
  givens: number[];
  constraints: ConstraintInstance[];
  volume: number;
  rows?: number;
  expectedExclusion?: string;
}

function fixture(id: string): Fixture {
  const entry = (fixtures.fixtures as Fixture[]).find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`no fixture ${id}`);
  return entry;
}

function problemOf(entry: Fixture): EngineProblem {
  return canonicalProblem({
    schema: 1,
    cells: Array.from({ length: entry.cellCount }, (_, cell) => cell),
    symbols: Array.from({ length: entry.symbols }, (_, index) => index + 1),
    givens: entry.givens,
    constraints: entry.constraints,
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

/** Rule maintenance to a fixed point, collecting the accepted bundles for replay. */
function maintained(start: ReadView): { view: ReadView; bundles: DeductionProposal[] } {
  let current = start;
  const bundles: DeductionProposal[] = [];
  let progress = true;
  while (progress) {
    progress = false;
    for (const rule of current.assembly.problem.constraints)
      for (const event of current.assembly.modules.get(rule.id)!.propagate(current, rule)) {
        if (event.kind !== "proposal") continue;
        const checked = [...checkProposal(event.proposal, context(current))].at(-1);
        if (checked?.kind !== "checked") throw new Error(`rejected maintenance ${rule.id}`);
        bundles.push(event.proposal);
        current = commitChecked(current, checked.step).view;
        progress = true;
      }
  }
  return { view: current, bundles };
}

const k01 = () => getTechniques("variants-expanded@1").find((entry) => entry.id === "k01@1")!;
const domain = (current: ReadView, cell: number) =>
  current.assembly.problem.symbols.filter((s) => current.state.domains[cell] & symbolMask(s));

function discover(current: ReadView) {
  const events = [...k01().discover(current, discoveryContext())];
  const proposals = events.flatMap((event) => (event.kind === "proposal" ? [event.proposal] : []));
  return { events, proposals, terminal: events.at(-1) };
}

describe("K01 Killer combinations (T08)", () => {
  test("catalogue, profiles and options know the variant rows", () => {
    expect(variantEntries.map((entry) => entry.id)).toContain("K01");
    expect(validateVariantCoverage(variantEntries)).toEqual([]);
    expect(getTechniques("classic-expanded@1")).toHaveLength(33);
    expect(getTechniques("classic-conditional@1")).toHaveLength(38);
    expect(getTechniques("variants-expanded@1").map((d) => d.id)).toContain("k01@1");
    expect(getTechniques("variants-conditional@1").length).toBe(38 + variantEntries.length);
    expect(PROFILES).toContain("variants-expanded@1");
    expect(() => schedulingOptions({ limits, profile: "variants-expanded@1" })).not.toThrow();
    const cage = problemOf(fixture("K01-four-cell-full-box"));
    expect(profileFor(cage)).toBe("variants-expanded@1");
    expect(profileFor(cage, true)).toBe("variants-conditional@1");
    expect(profileFor({ constraints: [{ type: "all-different@1" }] })).toBe("classic-expanded@1");
    // Until the block review flips the row to independently-verified, the variant profile is not ready.
    expect(profileReadiness("classic-expanded@1").ready).toBe(true);
    expect(profileReadiness("variants-expanded@1").missing).toEqual(
      variantEntries.filter((e) => e.status !== "independently-verified").map((e) => e.id),
    );
  });

  test("four-cell-full-box: after bounds maintenance the complete table leaves only 1..4", () => {
    const entry = fixture("K01-four-cell-full-box");
    const { view: current } = maintained(view(problemOf(entry)));
    for (const cell of [0, 1, 2, 3]) expect(domain(current, cell)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const cages = liveCages(current);
    expect(cages).toHaveLength(1);
    const analysis = analyzeCage(current, cages[0]);
    expect(analysis.volume).toBe(entry.volume);
    expect(analysis.rows).toBe(entry.rows);
    const { proposals, terminal } = discover(current);
    expect(terminal).toEqual({ kind: "exhausted" });
    expect(proposals).toHaveLength(1);
    const [proposal] = proposals;
    expect(proposal.technique).toBe("k01@1");
    expect(proposal.effects).toHaveLength(12);
    expect(new Set(proposal.effects.map((e) => e.symbol))).toEqual(new Set([5, 6, 7]));
    const leaves = proposal.proof.nodes.filter((n) => n.rule === "table-filter@1").length;
    const unions = proposal.proof.nodes.filter((n) => n.rule === "table-union@1").length;
    expect(leaves).toBeGreaterThan(1);
    expect(unions).toBe(leaves - 1);
    expect([...checkProposal(proposal, context(current))].at(-1)?.kind).toBe("checked");
  });

  test("forged-table: tampered counts, boxes, effects and relabelling are rejected", () => {
    const { view: current } = maintained(view(problemOf(fixture("K01-four-cell-full-box"))));
    const [proposal] = discover(current).proposals;
    const rejected = (mutate: (p: DeductionProposal) => void) => {
      const copy = structuredClone(proposal) as DeductionProposal;
      mutate(copy);
      return [...checkProposal(copy, context(current))].at(-1)?.kind;
    };
    expect(
      rejected((p) => {
        const leaf = p.proof.nodes.find((n) => n.rule === "table-filter@1")!;
        (leaf.conclusion as { count: number }).count += 1;
      }),
    ).toBe("rejected");
    expect(
      rejected((p) => {
        const leaf = p.proof.nodes.find((n) => n.rule === "table-filter@1")!;
        (leaf.parameters as { box: number[] }).box[0] |= symbolMask(9);
      }),
    ).toBe("rejected");
    expect(
      rejected((p) => {
        (p.effects as { kind: string; cell: number; symbol: number }[]).push({
          kind: "remove",
          cell: 0,
          symbol: 4,
        });
      }),
    ).toBe("rejected");
    expect(
      rejected((p) => {
        (p as { technique: string }).technique = "rule-sum@1";
        (p as { pattern: unknown }).pattern = { kind: "sum", constraintId: "cage" };
      }),
    ).toBe("rejected");
    expect(
      rejected((p) => {
        (p.pattern as { rows: number }).rows += 1;
      }),
    ).toBe("rejected");
  });

  test("profile-boundary: a five-cell full box is excluded, not approximated", () => {
    const entry = fixture("K01-five-cell-out-of-profile");
    const { view: current } = maintained(view(problemOf(entry)));
    const analysis = analyzeCage(current, liveCages(current)[0]);
    expect(analysis.volume).toBeGreaterThan(K01_PROFILE.maxInputBox);
    const { proposals, terminal } = discover(current);
    expect(proposals).toHaveLength(0);
    expect(terminal).toMatchObject({ kind: "excluded", reason: entry.expectedExclusion });
    // Eligibility still says yes (a cage exists); a problem without cages is excluded with a reason.
    expect(k01().eligible(current)).toEqual({ kind: "yes" });
    const none = view(
      canonicalProblem({
        schema: 1,
        cells: [0, 1],
        symbols: [1, 2],
        givens: [0, 0],
        constraints: [{ id: "s", type: "all-different@1", cells: [0, 1], parameters: {} }],
      }),
    );
    expect(k01().eligible(none)).toMatchObject({ kind: "excluded", reason: "no-cage-in-scope" });
  });

  test("replay: the narrowed five-cell cage is accepted and its bundle replays from original clues", () => {
    const entry = fixture("K01-five-cell-narrowed");
    const start = view(problemOf(entry));
    const { view: current, bundles } = maintained(start);
    const analysis = analyzeCage(current, liveCages(current)[0]);
    expect(analysis.volume).toBeLessThanOrEqual(K01_PROFILE.maxInputBox);
    const { proposals } = discover(current);
    expect(proposals).toHaveLength(1);
    const [proposal] = proposals;
    for (const cell of [2, 3, 4])
      for (const symbol of [6, 7, 8, 9])
        expect(proposal.effects).toContainEqual({ kind: "remove", cell, symbol });
    expect(proposal.effects.some((e) => e.cell === 0 || e.cell === 1)).toBe(false);
    expect([...checkProposal(proposal, context(current))].at(-1)?.kind).toBe("checked");
    const snapshot = makeSnapshot(start.assembly.problem, { kind: "manual" }, "k01", 0);
    expect([...replay(snapshot, [...bundles, proposal], start.assembly, limits)].at(-1)?.kind).toBe(
      "checked",
    );
  });

  test("oracle: K01 never removes a candidate present in an oracle solution", () => {
    let effects = 0;
    for (let seed = 1; seed <= 30; seed += 1) {
      const small = generateSmall(seed, { cages: 4, givens: 2 });
      const problem = canonicalProblem({
        schema: 1,
        cells: Array.from({ length: small.cellCount }, (_, cell) => cell),
        symbols: [...small.symbols],
        givens: [...small.givens],
        constraints: toEngineConstraints(small).map((c) => ({
          ...c,
          cells: [...c.cells],
          parameters: { ...c.parameters },
        })),
      });
      const { view: current } = maintained(view(problem));
      const { proposals } = discover(current);
      const witnesses = variantOracle({
        cellCount: small.cellCount,
        symbols: small.symbols,
        givens: small.givens,
        constraints: small.constraints,
        limit: 200,
        maxNodes: 200000,
      }).witnesses;
      expect(witnesses.length).toBeGreaterThan(0);
      for (const proposal of proposals) {
        expect([...checkProposal(proposal, context(current))].at(-1)?.kind).toBe("checked");
        for (const effect of proposal.effects) {
          effects += 1;
          for (const witness of witnesses) expect(witness[effect.cell]).not.toBe(effect.symbol);
        }
      }
    }
    expect(effects).toBeGreaterThan(0);
  });
});
