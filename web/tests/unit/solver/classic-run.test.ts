import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { solveClassic, type ClassicSolveEvent } from "../../../src/solver/classic-run";
import { utf8Length } from "../../../src/solver/utf8";
import { ablationLimits, runCase } from "../../solver/bench/ablate";
import type { Corpus } from "../../solver/bench/corpus-schema";

const unique = "530070000600195000098000060800060003400803001700020006060000280000419005000080079";
const solution =
  "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
const givens = (text: string) => [...text].map(Number);

async function solve(text: string) {
  const events: ClassicSolveEvent[] = [];
  await solveClassic(
    { givens: givens(text) },
    { clock: { now: () => Date.now() }, emit: (event) => events.push(event) },
  );
  const result = events.at(-1);
  if (result?.kind !== "result") throw Error(JSON.stringify(result));
  return { events, result };
}

describe("classic solve composition", () => {
  test("explains and independently verifies a unique puzzle", async () => {
    const { events, result } = await solve(unique);
    expect(result).toMatchObject({ outcome: "complete", human: "solved", count: "unique" });
    expect(result.solution?.join("")).toBe(solution);
    expect(result.logicalValues.join("")).toBe(solution);
    const steps = events.filter((event) => event.kind === "step");
    expect(steps).toHaveLength(result.steps);
    expect(steps.every((step) => step.name.length > 0 && step.values.length === 81)).toBe(true);
    expect(events.find((event) => event.kind === "precount")).toMatchObject({
      solution: givens(solution),
    });
    // Informative difficulty (spec §3.8): the highest tier used and the per-tier step counts.
    expect(result.difficulty.schema).toBe("difficulty@0");
    expect(result.difficulty.maxTier).toBeGreaterThanOrEqual(0);
    expect(result.difficulty.stepsByTier.reduce((a, b) => a + b, 0)).toBe(result.steps);
  });
  test("reports multiple, zero and conflicting inputs without the logical phase", async () => {
    expect((await solve("0".repeat(80) + "1")).result).toMatchObject({
      count: "multiple",
      human: "not-started",
      steps: 0,
    });
    expect((await solve("123456780000000009" + "0".repeat(63))).result).toMatchObject({
      count: "zero",
      human: "not-started",
    });
    expect((await solve("55" + "0".repeat(79))).result).toMatchObject({
      count: "zero",
      human: "not-started",
    });
  });
  test("rejects malformed givens", async () => {
    await expect(
      solveClassic({ givens: [1, 2, 3] }, { clock: { now: () => 0 }, emit: () => {} }),
    ).rejects.toThrow();
  });
});

/**
 * An effect-free checked step publishes facts only (here a Tridagon guardian
 * clause, c32@1, with no elimination). The run retains it and goes on;
 * committing it ended the run with `unproductive-step`. Found by the M2.6 T09
 * ablation: explain-fair@3 reaches tier 5 on this held-out thermometer board at
 * 3,074,886 logical work units, which explain-fair@1 does not within 16M. The
 * 4M budget ends the run before a second such step.
 */
test("an effect-free step is retained, not committed as a candidate change", async () => {
  const corpus = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../solver/bench/corpus.json", import.meta.url)), "utf8"),
  ) as Corpus;
  const entry = corpus.heldOut.find((candidate) => candidate.id === "thermometer-1")!;
  const trace = await runCase(entry, "explain", "explain-fair@3", undefined, {
    ...ablationLimits("stop"),
    workUnits: 4_000_000,
  });
  expect(trace.steps.some((step) => step.technique === "c32@1" && step.effects === "")).toBe(true);
  expect(trace).toMatchObject({ outcome: "complete", human: "incomplete" });
}, 600_000);

test("utf8Length matches TextEncoder, including surrogates", () => {
  for (const text of ["", "abc", "é", "€", "😀", "a\ud800b", "\udc00", JSON.stringify('x"😀')])
    expect(utf8Length(text)).toBe(new TextEncoder().encode(text).length);
});
