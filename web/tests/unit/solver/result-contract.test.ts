import { describe, expect, test, vi } from "vitest";
import * as run from "../../../src/solver/run";
import {
  CLASSIC_SOLVE_LIMITS,
  coverageOf,
  solveClassic,
  stopReasonOf,
  type ClassicSolveEvent,
} from "../../../src/solver/classic-run";
import { normalizeClassic } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { productionRules } from "../../../src/solver/rules/registry";
import { coverageEntries } from "../../../src/solver/techniques/manifest";
import { assembleTechniqueJobs } from "../../../src/solver/techniques/registry";
import type { DetectorStatus, Ledger } from "../../../src/solver/techniques/types";
import evalCorpus from "../../solver/bench/eval-corpus.json";

// Every runSolver terminal event goes through this spy, so a test can read
// the actual final ledger next to the result built from it.
vi.mock("../../../src/solver/run", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../src/solver/run")>();
  return {
    ...original,
    runSolver: vi.fn((request: unknown, ports: Parameters<typeof original.runSolver>[1]) =>
      original.runSolver(request, {
        ...ports,
        publish: async (event: unknown) => {
          const terminal = event as { kind?: string; ledger?: Ledger };
          if (terminal.kind === "terminal") terminals.push(terminal.ledger);
          await ports.publish(event);
        },
      }),
    ),
  };
});
const terminals: (Ledger | undefined)[] = [];
void run;

// M2.6 T06 (spec §4.5, engine side): stopReason, coverage, countVerifiedMs
// and budgetLimitedSteps on the classic result.
type Result = Extract<ClassicSolveEvent, { kind: "result" }>;
type Step = Extract<ClassicSolveEvent, { kind: "step" }>;

async function solve(
  text: string,
  workUnits = 4_000_000,
  clock = { now: () => 0 },
  tierCap?: { fromTier: number; unitsPerJobPerState: number },
) {
  const events: ClassicSolveEvent[] = [];
  await solveClassic(
    {
      givens: [...text].map(Number),
      limits: { ...CLASSIC_SOLVE_LIMITS, workUnits },
      ...(tierCap ? { tierCap } : {}),
    },
    { clock, emit: (event) => events.push(event) },
  );
  const result = events.at(-1);
  if (result?.kind !== "result") throw new Error("no result");
  return { events, result, steps: events.filter((e): e is Step => e.kind === "step") };
}

/** Display names of the classic profile's techniques. */
function profileNames(): string[] {
  const problem = normalizeClassic({
    kind: "classic",
    version: 1,
    width: 9,
    height: 9,
    givens: Array(81).fill(0),
  });
  const assembled = assemble(problem, productionRules());
  if (!assembled.ok) throw new Error("assembly");
  const techniques = assembleTechniqueJobs(assembled.value, "classic-expanded@1").techniques;
  const coverage = coverageOf(
    undefined,
    techniques.map((technique) => technique.id),
  );
  return [...coverage.notStarted].sort();
}

const consistent: Record<Result["stopReason"], readonly Result["human"][]> = {
  "not-started": ["not-started"],
  solved: ["solved"],
  contradiction: ["contradiction", "invalidated"],
  "profile-stall": ["stalled-within-profile"],
  "tier-cap": ["stalled-within-profile", "incomplete"],
  "lower-interrupted": ["incomplete"],
  "work-limit": ["incomplete"],
  "time-limit": ["incomplete"],
};

describe("result contract on the evaluation corpus", () => {
  test("every case has a stop reason consistent with its status, and coverage of every technique", async () => {
    const names = profileNames();
    expect(names.length).toBeGreaterThan(30);
    expect(names.length).toBeLessThanOrEqual(60);
    const seen = new Set<string>();
    for (const entry of evalCorpus.cases) {
      const { result, steps } = await solve(entry.puzzle);
      seen.add(result.stopReason);
      expect(consistent[result.stopReason], entry.id).toContain(result.human);
      if (result.stopReason === "not-started") {
        expect(result.count, entry.id).toMatch(/zero|multiple/);
        expect(result.steps, entry.id).toBe(0);
      }
      // Each technique in exactly one coverage list.
      const { exhausted, capped, notStarted, highestTierTried } = result.coverage;
      const listed = [...exhausted, ...capped, ...notStarted];
      expect(new Set(listed).size, entry.id).toBe(listed.length);
      expect([...listed].sort(), entry.id).toEqual(names);
      const tiers = new Map(coverageEntries.map((e) => [e.version, e.tier] as const));
      for (const step of steps)
        expect(highestTierTried, entry.id).toBeGreaterThanOrEqual(tiers.get(step.technique) ?? -1);
      expect(result.budgetLimitedSteps, entry.id).toBe(steps.filter((s) => s.budgetLimited).length);
      expect(result.countVerifiedMs !== undefined, entry.id).toBe(result.count !== "unknown");
      // The result is plain data for the worker boundary.
      expect(structuredClone(result)).toEqual(result);
    }
    expect([...seen]).toEqual(expect.arrayContaining(["not-started", "solved"]));
  }, 1_200_000);

  test("a run stopped by its time limit reports time-limit", async () => {
    // A clock that advances on every read: the deadline passes during the logical phase.
    let now = 0;
    const events: ClassicSolveEvent[] = [];
    await solveClassic(
      {
        givens: [...evalCorpus.cases[0].puzzle].map(Number),
        limits: { ...CLASSIC_SOLVE_LIMITS, timeMs: 3_000 },
      },
      { clock: { now: () => (now += 1) }, emit: (event) => events.push(event) },
    );
    const result = events.at(-1) as Result;
    expect(result.human).toBe("incomplete");
    expect(result.stopReason).toBe("time-limit");
  }, 120_000);
});

describe("coverageOf and stopReasonOf", () => {
  const row = (technique: string, status: DetectorStatus, work: number) =>
    ({ technique, scopeKey: "", status, work, dependencies: [] }) as unknown as Ledger[number];
  test("map every ledger status to one list, rule jobs excluded", () => {
    const ledger: Ledger = [
      row("rule-propagation@1", "exhausted", 10),
      row("c01@1", "exhausted", 5),
      row("c02@1", "excluded", 0),
      row("c03@1", "capped", 100),
      row("c04@1", "interrupted", 7),
      row("c05@1", "in-progress", 3),
      row("c06@1", "pending", 0),
      row("c20@1", "pending", 2),
    ];
    const coverage = coverageOf(ledger, []);
    const tier = (version: string) =>
      coverageEntries.find((entry) => entry.version === version)?.tier;
    expect(coverage.exhausted).toHaveLength(2);
    expect(coverage.capped).toHaveLength(4);
    expect(coverage.notStarted).toHaveLength(1);
    expect(coverage.highestTierTried).toBe(tier("c20@1"));
    // A capped technique explains a work-limit stop under explain-fair@3.
    expect(stopReasonOf("incomplete", "work-limit", ledger)).toBe("tier-cap");
    expect(stopReasonOf("incomplete", "work-limit", [row("c04@1", "interrupted", 1)])).toBe(
      "work-limit",
    );
    expect(stopReasonOf("incomplete", "logical-budget", ledger)).toBe("tier-cap");
    expect(stopReasonOf("stalled-within-profile", "profile-stall", ledger)).toBe("tier-cap");
    expect(stopReasonOf("stalled-within-profile", "profile-stall", [])).toBe("profile-stall");
    expect(stopReasonOf("incomplete", "time-limit", ledger)).toBe("time-limit");
    expect(stopReasonOf("incomplete", "logical-budget", [row("c04@1", "interrupted", 1)])).toBe(
      "work-limit",
    );
    // An interrupted lower job ended the phase (M2.7, D105 item 8): its own
    // reason, ahead of a capped job, behind the time safety stop.
    expect(stopReasonOf("incomplete", "incomplete-cheaper-tier", ledger)).toBe("lower-interrupted");
    expect(stopReasonOf("incomplete", "incomplete-cheaper-tier", [])).toBe("lower-interrupted");
    expect(stopReasonOf("solved", "incomplete-cheaper-tier", [])).toBe("solved");
    expect(stopReasonOf("not-started", undefined, undefined)).toBe("not-started");
    expect(stopReasonOf("invalidated", "solved", undefined)).toBe("contradiction");
  });
});

describe("coverage against the actual final ledger", () => {
  const techniques = () => profileNames();
  const expectMatches = (result: Result, ledger: Ledger | undefined) => {
    expect(ledger).toBeDefined();
    const name = (version: string) =>
      coverageEntries.find((entry) => entry.version === version)?.aliases[0] ?? version;
    for (const row of ledger ?? []) {
      if (!coverageEntries.some((entry) => entry.version === row.technique)) continue;
      const list =
        row.status === "exhausted" ||
        row.status === "excluded" ||
        (result.human === "solved" && row.work > 0)
          ? result.coverage.exhausted
          : row.work > 0
            ? result.coverage.capped
            : result.coverage.notStarted;
      expect(list, `${row.technique} ${row.status} ${row.work}`).toContain(name(row.technique));
    }
    expect(
      [
        ...result.coverage.exhausted,
        ...result.coverage.capped,
        ...result.coverage.notStarted,
      ].sort(),
    ).toEqual(techniques());
  };
  test("a solved run lists nothing as capped", async () => {
    terminals.length = 0;
    const { result } = await solve(evalCorpus.cases[0].puzzle);
    expect(result.human).toBe("solved");
    expect(result.coverage.capped).toEqual([]);
    expectMatches(result, terminals.at(-1));
  }, 120_000);
  test("an explain-fair@3 run cut by its budget reports tier-cap and the capped jobs", async () => {
    terminals.length = 0;
    const escargot = evalCorpus.cases.find((entry) => entry.id === "escargot")?.puzzle ?? "";
    // A small cap so tier 3 and 4 jobs cap well inside the 3M-unit budget.
    const { result } = await solve(
      escargot,
      3_000_000,
      { now: () => 0 },
      {
        fromTier: 3,
        unitsPerJobPerState: 5_000,
      },
    );
    const ledger = terminals.at(-1);
    expect(ledger?.some((row) => row.status === "capped")).toBe(true);
    expect(result.stopReason).toBe("tier-cap");
    expectMatches(result, ledger);
  }, 300_000);
  test("a run ended by runSolver's own deadline still reports the final state's ledger", async () => {
    terminals.length = 0;
    let now = 0;
    const events: ClassicSolveEvent[] = [];
    await solveClassic(
      {
        givens: [...(evalCorpus.cases.find((e) => e.id === "escargot")?.puzzle ?? "")].map(Number),
        limits: { ...CLASSIC_SOLVE_LIMITS, timeMs: 20_000 },
      },
      { clock: { now: () => (now += 1) }, emit: (event) => events.push(event) },
    );
    const result = events.at(-1) as Result;
    expect(result.stopReason).toBe("time-limit");
    expectMatches(result, terminals.at(-1));
  }, 300_000);
  test("the result reaches the screen unchanged through a worker message", async () => {
    const { result } = await solve(evalCorpus.cases[0].puzzle);
    // solver.worker.ts posts results in this envelope (postMessage clones it).
    const message = { kind: "terminal", outcome: result.outcome, revision: result.steps, result };
    expect(structuredClone(message)).toEqual(message);
  }, 120_000);
});
