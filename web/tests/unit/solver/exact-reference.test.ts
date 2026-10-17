import { appendFileSync, writeFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { exactSteps, type ExactStats } from "../../../src/solver/exact";
import { normalizeClassic } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { productionRules } from "../../../src/solver/rules/registry";
import { isSolutionOf, referenceCount } from "../../solver/reference-dfs";
import {
  buildEvalCorpus,
  HEAVY,
  SEEDED_CASES,
  type EvalCase,
  type EvalCorpus,
} from "../../solver/bench/eval-corpus";
import corpusJson from "../../solver/bench/eval-corpus.json";

// M2.6 T01: the engine's exact count against the independent reference DFS on
// the evaluation corpus. Heavy cases (minutes with the baseline engine) run
// only with M26_HEAVY=1; M26_BASELINE_RECORD=<file> appends one JSON line of
// nodes and milliseconds per case for docs/history/m26-baseline.md.
const corpus = corpusJson as EvalCorpus;
const runHeavy = process.env.M26_HEAVY === "1";
const recordPath = process.env.M26_BASELINE_RECORD;
const bench = new URL("../../solver/bench/", import.meta.url);

/** The shipped classic path: production rules; a failed assembly is a zero count (countClassic). */
function engineCount(puzzle: string): {
  witnesses: string[];
  terminal: string;
  stats: ExactStats;
} {
  const problem = normalizeClassic({
    kind: "classic",
    version: 1,
    width: 9,
    height: 9,
    givens: [...puzzle].map(Number),
  });
  const assembled = assemble(problem, productionRules());
  if (!assembled.ok)
    return { witnesses: [], terminal: "assembly", stats: { nodes: 0, backtracks: 0, maxDepth: 0 } };
  const witnesses: string[] = [];
  let terminal = "none",
    stats: ExactStats = { nodes: 0, backtracks: 0, maxDepth: 0 };
  for (const event of exactSteps(problem, assembled.value)) {
    stats = event.stats;
    terminal = event.kind;
    if (event.kind === "witness") witnesses.push(event.values.join(""));
  }
  return { witnesses, terminal, stats };
}

describe("M2.6 evaluation corpus", () => {
  if (process.env.EVAL_CORPUS === "write")
    test("rebuilds eval-corpus.json", () => {
      writeFileSync(
        new URL("eval-corpus.json", bench),
        JSON.stringify(buildEvalCorpus(), null, 2) + "\n",
      );
    }, 600_000);

  test("holds every named, derived and seeded case of spec §5 T01", () => {
    const ids = corpus.cases.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [
      "easy",
      "hidden-singles",
      "seventeen",
      "escargot",
      "inkala-2012",
      "golden-nugget",
      "anti-brute-force",
      "norvig-hard1",
      "empty",
      "seventeen-minus-one",
      "escargot-poisoned",
    ])
      expect(ids).toContain(id);
    for (const family of ["random", "poisoned"] as const)
      expect(corpus.cases.filter((entry) => entry.family === family)).toHaveLength(SEEDED_CASES);
    expect(corpus.cases.filter((entry) => entry.heavy).map((entry) => entry.id)).toEqual([
      ...HEAVY,
    ]);
    expect(corpus.cases.find((entry) => entry.id === "hidden-singles")?.singles).toBe("hidden");
    expect(corpus.cases.find((entry) => entry.id === "seventeen")?.givens).toBe(17);
    expect(corpus.cases.find((entry) => entry.id === "seventeen-minus-one")?.givens).toBe(16);
  });

  test("regenerates byte for byte from its builder, labels included", () => {
    expect(buildEvalCorpus()).toEqual(corpus);
  });

  test.for(corpus.cases.map((entry) => [entry.id, entry] as [string, EvalCase]))(
    "engine count and solution equal the reference DFS: %s",
    // Harness allowance, not a latency target: see docs/history/m26-baseline.md.
    { timeout: runHeavy ? 3_600_000 : 120_000 },
    ([, entry], { skip }) => {
      let started = performance.now();
      const reference = referenceCount(entry.puzzle, 2);
      const referenceMs = performance.now() - started;
      // The committed label is the reference's own verdict, checked even for heavy cases.
      expect(reference.count === 0 ? "0" : reference.count === 1 ? "1" : "2+").toBe(entry.count);
      if (entry.heavy && !runHeavy) skip("heavy case: set M26_HEAVY=1");
      started = performance.now();
      const engine = engineCount(entry.puzzle);
      const engineMs = performance.now() - started;
      if (recordPath)
        appendFileSync(
          recordPath,
          JSON.stringify({
            id: entry.id,
            count: entry.count,
            engineNodes: engine.stats.nodes,
            engineBacktracks: engine.stats.backtracks,
            engineMaxDepth: engine.stats.maxDepth,
            engineMs: Math.round(engineMs * 10) / 10,
            referenceNodes: reference.nodes,
            referenceMs: Math.round(referenceMs * 10) / 10,
          }) + "\n",
        );

      expect(engine.witnesses).toHaveLength(reference.count);
      if (reference.count === 2) expect(engine.terminal).toBe("cap-reached");
      else
        expect(["exhausted", ...(reference.count === 0 ? ["assembly"] : [])]).toContain(
          engine.terminal,
        );
      for (const witness of engine.witnesses)
        expect(isSolutionOf(entry.puzzle, witness)).toBe(true);
      if (entry.count === "1") {
        expect(engine.witnesses[0]).toBe(reference.solutions[0]);
        expect(entry.solution).toBe(reference.solutions[0]);
      }
      if (entry.count === "2+") expect(engine.witnesses[0]).not.toBe(engine.witnesses[1]);
    },
  );
});
