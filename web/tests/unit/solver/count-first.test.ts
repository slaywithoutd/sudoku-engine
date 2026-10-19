import { appendFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import * as exact from "../../../src/solver/exact";
import {
  CLASSIC_SOLVE_LIMITS,
  solveClassic,
  type ClassicSolveEvent,
} from "../../../src/solver/classic-run";
import { PRECOUNT_SHARE, runSolver } from "../../../src/solver/run";
import { canonicalProblem } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { AllDifferentRule } from "../../../src/solver/rules/all-different";
import { makeSnapshot } from "../../../src/solver/snapshot";
import { initialize } from "../../../src/solver/state/candidates";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import { schedulingOptions } from "../../../src/solver/scheduling/work";
import corpusJson from "../../solver/bench/eval-corpus.json";
import type { EvalCorpus } from "../../solver/bench/eval-corpus";

// Every exactSteps call in the pipeline goes through this spy.
vi.mock("../../../src/solver/exact", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../src/solver/exact")>();
  return { ...original, exactSteps: vi.fn(original.exactSteps) };
});
const exactSteps = vi.mocked(exact.exactSteps);

const corpus = corpusJson as EvalCorpus;
const puzzle = (id: string) => {
  const entry = corpus.cases.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(id);
  return entry;
};

async function solve(givens: string, limits = CLASSIC_SOLVE_LIMITS) {
  const events: ClassicSolveEvent[] = [];
  await solveClassic(
    { givens: [...givens].map(Number), limits },
    { clock: { now: () => performance.now() }, emit: (event) => events.push(event) },
  );
  const result = events.at(-1);
  if (result?.kind !== "result") throw new Error(JSON.stringify(result));
  return { events, result };
}

describe("count-first pipeline (spec M2.6 §4.3, T03)", () => {
  // Wall-clock dependent by nature: the precount must finish hard1 inside 30 %
  // of 15 s (about 2-3 s on mains on the development laptop).
  test("Norvig hard1 at the 15 s preset reports multiple solutions", async () => {
    const { result } = await solve(puzzle("norvig-hard1").puzzle, {
      ...CLASSIC_SOLVE_LIMITS,
      timeMs: 15_000,
    });
    expect(result).toMatchObject({ outcome: "complete", count: "multiple", steps: 0 });
  }, 120_000);

  test("no corpus case starts the exact search twice", async () => {
    // A small work budget keeps the logical phase short; the 30 % precount share
    // (1.8M units) still covers hard1 (about 1.3M units with the reservation).
    const limits = { ...CLASSIC_SOLVE_LIMITS, workUnits: 6_000_000 };
    for (const entry of corpus.cases) {
      exactSteps.mockClear();
      const { result } = await solve(entry.puzzle, limits);
      expect(exactSteps, entry.id).toHaveBeenCalledTimes(1);
      const expected = { "0": "zero", "1": "unique", "2+": "multiple" }[entry.count];
      expect(result.count, entry.id).toBe(expected);
      if (entry.count !== "1") expect(result.steps, entry.id).toBe(0);
    }
  }, 600_000);

  test("an inconclusive precount is resumed after the logical phase, not restarted", async () => {
    const problem = canonicalProblem({
        schema: 1,
        cells: [0, 1],
        symbols: [1, 2],
        givens: [0, 0],
        constraints: [{ id: "pair", type: "all-different@1", cells: [0, 1], parameters: {} }],
      }),
      assembled = assemble(problem, [new AllDifferentRule()]);
    if (!assembled.ok) throw Error("fixture");
    const reservation = exact.exactInitializationReservation(problem, assembled.value).workUnits;
    // The precount share cannot even pay the reservation; the whole budget can.
    const workUnits = Math.ceil(reservation / PRECOUNT_SHARE) - 1;
    expect(Math.floor(workUnits * PRECOUNT_SHARE)).toBeLessThan(reservation);
    const snapshot = makeSnapshot(problem, { kind: "manual" }, "resume-test", 0),
      view = initialize(assembled.value, "primary"),
      workspace = new IndexWorkspace({ entryLimit: 100000, byteLimit: 64000000 });
    const limits = { ...CLASSIC_SOLVE_LIMITS, timeMs: 10_000, workUnits };
    const published: { kind?: string; outcome?: string; count?: { kind?: string } }[] = [];
    exactSteps.mockClear();
    await runSolver(
      {
        snapshot,
        assembly: assembled.value,
        view,
        registry: { rules: [], techniques: [] },
        workspace,
        limits,
        options: { ...schedulingOptions({ limits }), workspace },
        run: {
          requestId: "resume-test",
          snapshotId: snapshot.snapshotId,
          inputRevision: 0,
          problemKey: problem.key,
          operation: "primary",
          mode: "explain",
          engine: "engine@1",
          profile: "classic-expanded@1",
          scheduler: "scheduler@1",
          checker: "checker@1",
          exact: exact.EXACT_METHOD,
          optionsKey: "options",
          parentEvidenceId: null,
        },
        accept: () => view,
      },
      {
        clock: { now: () => performance.now() },
        yieldTask: async () => {},
        publish: async (event) => {
          published.push(event as (typeof published)[number]);
        },
        awaitAcceptance: async () => "accepted",
      },
    );
    expect(exactSteps).toHaveBeenCalledTimes(1);
    expect(published.find((event) => event.kind === "precount")?.count?.kind).toBe("unknown");
    expect(published.at(-1)).toMatchObject({
      kind: "terminal",
      outcome: "complete",
      count: { kind: "multiple" },
    });
    expect(workspace.usage.bytes).toBe(0);
  });

  test("a precount cut mid-search resumes with its pending node charged once", async () => {
    // 4x4 classic with no givens: rows, columns and 2x2 boxes.
    const houses = [
      ...[0, 1, 2, 3].map((row) => [0, 1, 2, 3].map((column) => row * 4 + column)),
      ...[0, 1, 2, 3].map((column) => [0, 1, 2, 3].map((row) => row * 4 + column)),
      ...[0, 2, 8, 10].map((corner) => [corner, corner + 1, corner + 4, corner + 5]),
    ];
    const problem = canonicalProblem({
        schema: 1,
        cells: Array.from({ length: 16 }, (_, cell) => cell),
        symbols: [1, 2, 3, 4],
        givens: Array(16).fill(0),
        constraints: houses.map((cells, index) => ({
          id: `h${index}`,
          type: "all-different@1",
          cells,
          parameters: {},
        })),
      }),
      assembled = assemble(problem, [new AllDifferentRule()]);
    if (!assembled.ok) throw Error("fixture");
    // A fresh search: total work, and the work up to its first witness.
    let total = 0,
      atFirst = 0;
    for (const event of exact.exactSteps(problem, assembled.value))
      if (event.kind === "work") total += event.units;
      else if (event.kind === "witness" && atFirst === 0) atFirst = total;
    const workUnits = Math.ceil((atFirst + 1) / PRECOUNT_SHARE);
    expect(Math.floor(workUnits * PRECOUNT_SHARE)).toBe(atFirst + 1);
    const snapshot = makeSnapshot(problem, { kind: "manual" }, "carry-test", 0),
      view = initialize(assembled.value, "primary"),
      workspace = new IndexWorkspace({ entryLimit: 100000, byteLimit: 64000000 });
    const limits = { ...CLASSIC_SOLVE_LIMITS, timeMs: 10_000, workUnits };
    const published: {
      kind?: string;
      phase?: string;
      units?: number;
      count?: { kind?: string; witnesses?: unknown[] };
    }[] = [];
    exactSteps.mockClear();
    await runSolver(
      {
        snapshot,
        assembly: assembled.value,
        view,
        registry: { rules: [], techniques: [] },
        workspace,
        limits,
        options: { ...schedulingOptions({ limits }), workspace },
        run: {
          requestId: "carry-test",
          snapshotId: snapshot.snapshotId,
          inputRevision: 0,
          problemKey: problem.key,
          operation: "primary",
          mode: "explain",
          engine: "engine@1",
          profile: "classic-expanded@1",
          scheduler: "scheduler@1",
          checker: "checker@1",
          exact: exact.EXACT_METHOD,
          optionsKey: "options",
          parentEvidenceId: null,
        },
        accept: () => view,
      },
      {
        clock: { now: () => performance.now() },
        yieldTask: async () => {},
        publish: async (event) => {
          published.push(event as (typeof published)[number]);
        },
        awaitAcceptance: async () => "accepted",
      },
    );
    expect(exactSteps).toHaveBeenCalledTimes(1);
    const precount = published.find((event) => event.kind === "precount");
    expect(precount?.count).toMatchObject({ kind: "unknown" });
    expect(precount?.count?.witnesses).toHaveLength(1);
    // Published exact work equals a fresh run's: the carried node is charged once.
    const charged = published
      .filter((event) => event.kind === "work" && event.phase === "exact")
      .reduce((sum, event) => sum + (event.units ?? 0), 0);
    expect(charged).toBe(total);
    expect(published.at(-1)).toMatchObject({
      kind: "terminal",
      outcome: "complete",
      count: { kind: "multiple" },
    });
    expect(workspace.usage.bytes).toBe(0);
  });

  // Spec §5 T03: three consecutive runs of every corpus case at 60 s give the
  // same result, timings aside. Minutes per unique case before T04, so it runs
  // only with M26_DETERMINISM=1; M26_DETERMINISM_RECORD=<file> logs each case.
  const determinism = process.env.M26_DETERMINISM === "1";
  test.skipIf(!determinism)(
    "three runs of every corpus case at 60 s give the same result",
    async () => {
      for (const entry of corpus.cases) {
        const runs: string[] = [];
        const started = performance.now();
        for (let run = 0; run < 3; run++) {
          const { events, result } = await solve(entry.puzzle);
          const steps = events.flatMap((event) =>
            event.kind === "step" ? [`${event.technique}:${JSON.stringify(event.effects)}`] : [],
          );
          runs.push(JSON.stringify({ result, steps }));
        }
        if (process.env.M26_DETERMINISM_RECORD)
          appendFileSync(
            process.env.M26_DETERMINISM_RECORD,
            JSON.stringify({
              id: entry.id,
              identical: runs.every((run) => run === runs[0]),
              result: JSON.parse(runs[0]).result,
              ms: Math.round(performance.now() - started),
            }) + "\n",
          );
        expect(runs[1], entry.id).toBe(runs[0]);
        expect(runs[2], entry.id).toBe(runs[0]);
      }
    },
    14_400_000,
  );
});
