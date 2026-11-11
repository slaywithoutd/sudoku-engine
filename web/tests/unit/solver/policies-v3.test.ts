import { describe, expect, test } from "vitest";
import {
  CLASSIC_SOLVE_LIMITS,
  classicLimitsFor,
  solveClassic,
  stopReasonOf,
  type ClassicSolveEvent,
} from "../../../src/solver/classic-run";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import { normalizeClassic } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { productionRules } from "../../../src/solver/rules/registry";
import { StepSelection } from "../../../src/solver/scheduling/select";
import { POLICY_IDS, schedulingOptions, type PolicyId } from "../../../src/solver/scheduling/work";
import {
  commitChecked,
  initialize,
  retainCheckedFacts,
} from "../../../src/solver/state/candidates";

/** Commits a step, or retains an effect-free one as the classic run does (b9dfaf2). */
function accept(
  view: Parameters<typeof commitChecked>[0],
  step: Parameters<typeof commitChecked>[1],
) {
  return step.proposal.effects.length > 0
    ? commitChecked(view, step).view
    : retainCheckedFacts(view, step);
}
import { coverageEntries } from "../../../src/solver/techniques/manifest";
import { assembleTechniqueJobs } from "../../../src/solver/techniques/registry";
import type { Ledger, TechniqueDescriptor } from "../../../src/solver/techniques/types";
import { canonicalProblem } from "../../../src/solver/problem";
import { AllDifferentRule } from "../../../src/solver/rules/all-different";
import evalCorpus from "../../solver/bench/eval-corpus.json";

// M2.6 T05 (spec §4.4): explain-fair@3 / analyze-fair@3.
const puzzle = (id: string) => {
  const entry = evalCorpus.cases.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(id);
  return entry.puzzle;
};
const tiers = new Map(coverageEntries.map((entry) => [entry.version, entry.tier] as const));

describe("explain-fair@3 tier cap", () => {
  test("a step past a capped simpler job never claims simpler exhaustion and is budget-limited", () => {
    let checked = 0,
      pastCapped = 0;
    for (const id of ["escargot", "golden-nugget", "inkala-2012"]) {
      const problem = normalizeClassic({
        kind: "classic",
        version: 1,
        width: 9,
        height: 9,
        givens: [...puzzle(id)].map(Number),
      });
      const assembled = assemble(problem, productionRules());
      if (!assembled.ok) throw new Error("assembly");
      let view = initialize(assembled.value, "primary");
      const limits = { ...CLASSIC_SOLVE_LIMITS, workUnits: 3_000_000 };
      const selection = new StepSelection(
        view,
        assembleTechniqueJobs(assembled.value, "classic-expanded@1"),
        {
          ...schedulingOptions({
            limits,
            mode: "explain",
            policy: "explain-fair@3",
            // Small enough that tier 3 and 4 jobs cap long before the budget ends.
            tierCap: { fromTier: 3, unitsPerJobPerState: 5_000 },
          }),
          workspace: new IndexWorkspace({ entryLimit: 100_000, byteLimit: limits.workspaceBytes }),
          clock: { now: () => 0 },
        },
      );
      try {
        for (let step = 0; step < 60; step++) {
          let event:
            | Extract<
                ReturnType<StepSelection["select"]> extends Generator<infer E> ? E : never,
                { kind: "checked-step" }
              >
            | undefined;
          let stopped = false;
          for (const next of selection.select()) {
            if (next.kind === "checked-step") event = next;
            if (next.kind === "logical-stop") stopped = true;
          }
          if (stopped || !event) break;
          const tier = tiers.get(event.step.proposal.technique) ?? -1;
          const lowerCapped = selection.ledger.jobs.some(
            (job) => job.tier < tier && job.status === "capped",
          );
          checked += 1;
          // Independently of the ledger helpers: a claim needs every simpler job
          // exhausted or excluded.
          const unsettled = selection.ledger.jobs.some(
            (job) => job.tier < tier && job.status !== "exhausted" && job.status !== "excluded",
          );
          expect(event.canClaimSimplerExhausted).toBe(!unsettled);
          if (lowerCapped) {
            pastCapped += 1;
            expect(event.canClaimSimplerExhausted).toBe(false);
            expect(event.budgetLimited).toBe(true);
          }
          view = accept(view, event.step);
          selection.advance(view);
        }
      } finally {
        selection.dispose();
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(pastCapped).toBeGreaterThan(0);
  }, 600_000);
});

async function run(text: string, policy: PolicyId, workUnits: number) {
  const events: ClassicSolveEvent[] = [];
  await solveClassic(
    {
      givens: [...text].map(Number),
      limits: { ...CLASSIC_SOLVE_LIMITS, workUnits },
      mode: policy.startsWith("analyze") ? "analyze" : "explain",
      policy,
    },
    // A clock that never moves: only the work cut ends a run.
    { clock: { now: () => 0 }, emit: (event) => events.push(event) },
  );
  const result = events.at(-1);
  if (result?.kind !== "result") throw new Error("no result");
  const steps = events.flatMap((event) =>
    event.kind === "step"
      ? [`${event.technique}:${JSON.stringify(event.effects)}:${event.workUnits}`]
      : [],
  );
  return { result, steps };
}

describe("analyze-fair@3", () => {
  test("engine Analyze yields at least one step on every unique corpus case", async () => {
    const unique = evalCorpus.cases.filter((entry) => entry.count === "1");
    expect(unique.length).toBeGreaterThanOrEqual(10);
    for (const entry of unique) {
      const { steps } = await run(entry.puzzle, "analyze-fair@3", 4_000_000);
      expect(steps.length, entry.id).toBeGreaterThan(0);
      // Where singles solve the grid, Analyze must reach technique steps, not
      // only rule maintenance (rule-propagation@1): the @3 window fix.
      if (entry.singles !== "none")
        expect(
          steps.some((step) => !step.startsWith("rule-")),
          entry.id,
        ).toBe(true);
    }
  }, 1_200_000);
});

describe("determinism (spec §5 T05)", () => {
  test.each(POLICY_IDS.map((policy) => [policy] as const))(
    "%s gives the same steps and result on two runs",
    async (policy) => {
      expect(POLICY_IDS).toHaveLength(8);
      for (const id of ["easy", "golden-nugget"]) {
        const first = await run(puzzle(id), policy, 3_000_000),
          second = await run(puzzle(id), policy, 3_000_000);
        expect(second, `${policy} ${id}`).toEqual(first);
      }
    },
    600_000,
  );
});

// Spec §5 T05, wall time at the 15 s preset: runs only with M26_TIMING=1.
const timing = process.env.M26_TIMING === "1";
describe("explain-fair@3 at the 15 s preset", () => {
  test.skipIf(!timing).each([["escargot"], ["inkala-2012"], ["golden-nugget"]] as const)(
    "%s reaches tier 5 within 15 s",
    (id) => {
      const problem = normalizeClassic({
        kind: "classic",
        version: 1,
        width: 9,
        height: 9,
        givens: [...puzzle(id)].map(Number),
      });
      const assembled = assemble(problem, productionRules());
      if (!assembled.ok) throw new Error("assembly");
      let view = initialize(assembled.value, "primary");
      const limits = classicLimitsFor(15_000);
      const selection = new StepSelection(
        view,
        assembleTechniqueJobs(assembled.value, "classic-expanded@1"),
        {
          ...schedulingOptions({ limits, mode: "explain", policy: "explain-fair@3" }),
          workspace: new IndexWorkspace({ entryLimit: 100_000, byteLimit: limits.workspaceBytes }),
          clock: { now: () => performance.now() },
        },
      );
      let highestServed = -1;
      try {
        for (;;) {
          let step: Parameters<typeof commitChecked>[1] | undefined;
          let stopped = false;
          for (const next of selection.select()) {
            if (next.kind === "checked-step") step = next.step;
            if (next.kind === "logical-stop") stopped = true;
          }
          for (const job of selection.ledger.jobs)
            if (job.work > 0) highestServed = Math.max(highestServed, job.tier);
          if (stopped || !step) break;
          view = accept(view, step);
          selection.advance(view);
        }
      } finally {
        selection.dispose();
      }
      expect(highestServed).toBeGreaterThanOrEqual(5);
    },
    60_000,
  );
});

describe("explain-fair@3 reopening ends", () => {
  // Review regression (T05): a tier-3 job that keeps hitting the same
  // interruption must not be reopened forever on one state.
  const limits = { ...CLASSIC_SOLVE_LIMITS, timeMs: 10_000, workUnits: 1_000_000 };
  const fixture = () => {
    const assembled = assemble(
      canonicalProblem({
        schema: 1,
        cells: [0, 1, 2, 3],
        symbols: [1, 2],
        givens: [1, 0, 0, 0],
        constraints: [
          { id: "a", type: "all-different@1", cells: [0, 1], parameters: {} },
          { id: "b", type: "all-different@1", cells: [1, 2], parameters: {} },
        ],
      }),
      [new AllDifferentRule()],
    );
    if (!assembled.ok) throw Error("fixture");
    return initialize(assembled.value, "primary");
  };
  const stub = (discover: TechniqueDescriptor["discover"]) =>
    ({
      id: "stub@1",
      aliases: [],
      tier: 3,
      requires: [],
      assumptionPolicy: "unconditional",
      bounds: {
        maxLength: 0,
        maxBranchDepth: 0,
        maxAlternatives: 0,
        maxPatternCells: 0,
        maxSetSize: 0,
      },
      watches: () => [{ kind: "all" }],
      eligible: () => ({ kind: "yes" }),
      estimate: () => ({ hit: 0, gain: 0, cost: 1 }),
      discover,
    }) as unknown as TechniqueDescriptor;
  const select = (technique: TechniqueDescriptor) => {
    const selection = new StepSelection(
      fixture(),
      { rules: [], techniques: [technique] },
      {
        ...schedulingOptions({
          limits,
          mode: "explain",
          policy: "explain-fair@3",
          tierCap: { fromTier: 3, unitsPerJobPerState: 1_000 },
        }),
        workspace: new IndexWorkspace({ entryLimit: 100_000, byteLimit: limits.workspaceBytes }),
        clock: { now: () => 0 },
      },
    );
    let reason: string | undefined;
    try {
      for (const event of selection.select())
        if (event.kind === "logical-stop") reason = event.reason;
      rows = selection.ledger.rows;
    } finally {
      selection.dispose();
    }
    return reason;
  };
  let rows: Ledger = [];
  test.each([[0], [10]] as const)(
    "an interrupted job is not reopened (%i units first)",
    (units) => {
      let opens = 0;
      const reason = select(
        stub(function* () {
          opens += 1;
          if (units) yield { kind: "work", units };
          yield { kind: "interrupted", reason: "proof-step-limit" };
        }),
      );
      expect(opens).toBe(1);
      expect(reason).toBeDefined();
    },
  );
  test("a capped job is reopened with a doubled cap until the budget ends", () => {
    let opens = 0;
    const reason = select(
      stub(function* () {
        opens += 1;
        for (;;) yield { kind: "work", units: 50 };
      }),
    );
    // 1k + 2k + 4k + ... units: about log2(1M / 1k) rounds, then the work limit.
    expect(opens).toBeGreaterThan(5);
    expect(opens).toBeLessThan(15);
    expect(reason).toBe("work-limit");
    // T08 review: the budget ends the last reopened round while the job runs,
    // so its row is in progress, not capped; the stop is still a tier cap.
    expect(rows.map((row) => [row.status, row.reason])).toEqual([["in-progress", "tier-work-cap"]]);
    expect(stopReasonOf("incomplete", reason, rows)).toBe("tier-cap");
  });
});
