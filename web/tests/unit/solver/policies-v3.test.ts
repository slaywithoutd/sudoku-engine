import { describe, expect, test } from "vitest";
import {
  CLASSIC_SOLVE_LIMITS,
  solveClassic,
  type ClassicSolveEvent,
} from "../../../src/solver/classic-run";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import { normalizeClassic } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { productionRules } from "../../../src/solver/rules/registry";
import { StepSelection } from "../../../src/solver/scheduling/select";
import { POLICY_IDS, schedulingOptions, type PolicyId } from "../../../src/solver/scheduling/work";
import { commitChecked, initialize } from "../../../src/solver/state/candidates";
import { coverageEntries } from "../../../src/solver/techniques/manifest";
import { assembleTechniqueJobs } from "../../../src/solver/techniques/registry";
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
          expect(event.canClaimSimplerExhausted).toBe(selection.ledger.simplerExhausted(tier));
          if (lowerCapped) {
            pastCapped += 1;
            expect(event.canClaimSimplerExhausted).toBe(false);
            expect(event.budgetLimited).toBe(true);
          }
          view = commitChecked(view, event.step).view;
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
      const limits = { ...CLASSIC_SOLVE_LIMITS, timeMs: 15_000 };
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
          view = commitChecked(view, step).view;
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
