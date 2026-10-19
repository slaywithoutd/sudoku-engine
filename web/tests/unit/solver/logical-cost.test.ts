import { appendFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  CLASSIC_SOLVE_LIMITS,
  solveClassic,
  type ClassicSolveEvent,
} from "../../../src/solver/classic-run";
import { humanSteps } from "../../../src/solver/human";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import { normalizeClassic, type EngineProblem } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { productionRules } from "../../../src/solver/rules/registry";
import { schedulingOptions } from "../../../src/solver/scheduling/work";
import { commitChecked, initialize } from "../../../src/solver/state/candidates";
import { SourceIndex } from "../../../src/solver/state/source-index";
import type { ReadView } from "../../../src/solver/state/types";
import { assembleTechniqueJobs } from "../../../src/solver/techniques/registry";
import { profileFor } from "../../../src/solver/techniques/profiles";
import { corpusProblem } from "../../solver/bench/sample";
import benchCorpusJson from "../../solver/bench/corpus.json";
import type { Corpus } from "../../solver/bench/corpus-schema";
import evalCorpus from "../../solver/bench/eval-corpus.json";

// M2.6 T04 (spec §4.2): trace-preserving cost reductions. The golden traces
// (golden-traces.test.ts) stay byte-identical; this file checks the
// incremental source index against a cold rebuild and the cost targets.

const benchCorpus = benchCorpusJson as unknown as Corpus;
const puzzle = (id: string) => {
  const entry = evalCorpus.cases.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(id);
  return entry.puzzle;
};
const classic = (text: string) =>
  normalizeClassic({
    kind: "classic",
    version: 1,
    width: 9,
    height: 9,
    givens: [...text].map(Number),
  });

/** The accepted views of an Explain run, from the initial one on. */
function trajectory(problem: EngineProblem, maximum: number): ReadView[] {
  const assembled = assemble(problem, productionRules());
  if (!assembled.ok) throw new Error("assembly");
  const profile = profileFor(problem);
  let view = initialize(assembled.value, "primary");
  const views = [view];
  const workspace = new IndexWorkspace({ entryLimit: 100_000, byteLimit: 64_000_000 });
  // A tier-4 stall would burn the whole budget for nothing: keep it small.
  const limits = { ...CLASSIC_SOLVE_LIMITS, workUnits: 4_000_000 };
  const cursor = humanSteps(view, assembleTechniqueJobs(assembled.value, profile), {
    ...schedulingOptions({ limits, mode: "explain", profile }),
    workspace,
    clock: { now: () => 0 },
    accept: (step) => {
      view = commitChecked(view, step).view;
      views.push(view);
      return view;
    },
  });
  try {
    let next = cursor.next();
    while (!next.done && views.length <= maximum) {
      if (next.value.kind === "logical-stop") break;
      next = cursor.next(next.value.kind === "proposal" ? "accepted" : undefined);
    }
  } finally {
    cursor.return();
  }
  return views;
}

function drain(generator: Generator<unknown, SourceIndex, void>): SourceIndex {
  for (;;) {
    const next = generator.next();
    if (next.done) return next.value;
  }
}

describe("incremental source index (spec §4.2)", () => {
  test("equals a cold rebuild on 300 accepted states, classic and variant", () => {
    const problems: EngineProblem[] = [
      ...[
        "easy",
        "hidden-singles",
        "seventeen",
        "anti-brute-force",
        "random-57",
        "poisoned-42",
      ].map((id) => classic(puzzle(id))),
      // Relation facts (kropki dots, thermometers) take the domain-dependent path.
      ...[...benchCorpus.calibration, ...benchCorpus.heldOut]
        .filter((entry) => entry.family === "kropki" || entry.family === "mixed")
        .slice(0, 4)
        .map((entry) => corpusProblem(entry)),
    ];
    let states = 0,
      relations = 0;
    for (const problem of problems) {
      // The production workspace (100k entries): a leaking index would cut
      // the trajectory short instead of failing a comparison.
      const views = trajectory(problem, 60);
      const variant = problem.constraints.some((rule) => rule.type !== "all-different@1");
      if (variant) expect(views.length).toBeGreaterThan(20);
      const workspace = new IndexWorkspace({ entryLimit: 1_000_000, byteLimit: 512_000_000 });
      for (const level of ["complete", "facts"] as const) {
        let previous = drain(SourceIndex.prepare(views[0], workspace, { level }));
        for (const view of views.slice(1)) {
          const advanced = drain(SourceIndex.advance(previous, view, workspace, { level }));
          // The parent handed its lease over and no longer answers.
          expect(() => previous.maximumId).toThrow("disposed-source-index");
          // Only the advanced index holds this workspace now: its leases
          // account for exactly what a cold index of the same view holds.
          const coldWorkspace = new IndexWorkspace({
            entryLimit: 1_000_000,
            byteLimit: 512_000_000,
          });
          const cold = drain(SourceIndex.prepare(view, coldWorkspace, { level }));
          expect(advanced.contents()).toEqual(cold.contents());
          expect(workspace.usage).toEqual(coldWorkspace.usage);
          cold.dispose();
          previous = advanced;
          if (level === "complete") {
            states += 1;
            if (
              view.facts.size &&
              [...view.facts.values()].some((f) => f.proposition.kind === "relation")
            )
              relations += 1;
          }
        }
        previous.dispose();
      }
      expect(workspace.usage.bytes).toBe(0);
    }
    expect(states).toBeGreaterThanOrEqual(300);
    expect(relations).toBeGreaterThan(0);
  }, 600_000);

  test("a view that does not extend the parent falls back to a cold rebuild", () => {
    const first = trajectory(classic(puzzle("easy")), 3),
      other = trajectory(classic(puzzle("hidden-singles")), 2);
    const workspace = new IndexWorkspace({ entryLimit: 1_000_000, byteLimit: 512_000_000 });
    const parent = drain(SourceIndex.prepare(first[2], workspace));
    const advanced = drain(SourceIndex.advance(parent, other[1], workspace));
    // The parent that could not be extended is released by advance itself.
    expect(() => parent.maximumId).toThrow("disposed-source-index");
    const cold = drain(SourceIndex.prepare(other[1], workspace));
    expect(advanced.contents()).toEqual(cold.contents());
    for (const index of [advanced, cold]) index.dispose();
    expect(workspace.usage.bytes).toBe(0);
    // A scan stopped by its consumer also releases the parent.
    const stopped = drain(SourceIndex.prepare(first[2], workspace));
    const cursor = SourceIndex.advance(stopped, first[3], workspace);
    cursor.next();
    cursor.return(undefined as never);
    expect(workspace.usage.bytes).toBe(0);
  });
});

/** Median of `runs` Explain runs at the default limits (after one warm-up run). */
async function measure(text: string, runs = 3) {
  const samples: { ms: number; basicMs: number; basicUnits: number; human: string }[] = [];
  for (let run = 0; run <= runs; run++) {
    const marks: { at: number; event: ClassicSolveEvent }[] = [];
    const start = performance.now();
    await solveClassic(
      { givens: [...text].map(Number) },
      {
        clock: { now: () => performance.now() },
        emit: (event) => marks.push({ at: performance.now(), event }),
      },
    );
    const ms = performance.now() - start;
    if (run === 0) continue;
    // A step event is emitted when its successor starts; its time and units
    // are the gap to the previous step event. The first gap starts at the
    // precount event, so the exact phase is not a logical step; it still
    // includes the logical phase's one-time setup (selection, cold index).
    const basic: { ms: number; units: number }[] = [];
    let at = marks.find((mark) => mark.event.kind === "precount")?.at ?? start,
      units = 0;
    for (const { at: time, event } of marks)
      if (event.kind === "step") {
        if (event.technique === "rule-propagation@1")
          basic.push({ ms: time - at, units: event.workUnits - units });
        at = time;
        units = event.workUnits;
      }
    const result = marks.at(-1)?.event;
    samples.push({
      ms,
      basicMs: basic.reduce((sum, step) => sum + step.ms, 0) / basic.length,
      basicUnits: basic.reduce((sum, step) => sum + step.units, 0) / basic.length,
      human: result?.kind === "result" ? result.human : "none",
    });
  }
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1];
  const result = {
    ms: median(samples.map((sample) => sample.ms)),
    basicMs: median(samples.map((sample) => sample.basicMs)),
    basicUnits: median(samples.map((sample) => sample.basicUnits)),
    human: samples.map((sample) => sample.human),
  };
  if (process.env.M26_TIMING_RECORD)
    appendFileSync(process.env.M26_TIMING_RECORD, `${JSON.stringify({ samples, ...result })}\n`);
  return result;
}

// Work units are deterministic and always checked. Wall time varies about 4x
// with this laptop's load and power state, so the time targets run only with
// M26_TIMING=1, measured alone (docs/history/m26-implementation-progress.md).
const timing = process.env.M26_TIMING === "1";
describe("logical phase cost targets (spec §5 T04)", () => {
  test("easy puzzle: < 1 s end to end, basic steps < 10 ms and < 10k units", async () => {
    const easy = await measure(puzzle("easy"));
    expect(easy.human).toEqual(["solved", "solved", "solved"]);
    expect(easy.basicUnits).toBeLessThan(10_000);
    if (!timing) return;
    expect(easy.ms).toBeLessThan(1000);
    expect(easy.basicMs).toBeLessThan(10);
  }, 120_000);

  test("17-clue singles puzzle: < 3 s end to end", async () => {
    const seventeen = await measure(puzzle("seventeen"));
    expect(seventeen.human).toEqual(["solved", "solved", "solved"]);
    if (timing) expect(seventeen.ms).toBeLessThan(3000);
  }, 120_000);
});
