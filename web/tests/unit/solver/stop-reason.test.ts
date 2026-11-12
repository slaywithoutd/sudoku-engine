import { expect, test } from "vitest";
import {
  CLASSIC_SOLVE_LIMITS,
  solveClassic,
  type ClassicSolveEvent,
} from "../../../src/solver/classic-run";
import evalCorpus from "../../solver/bench/eval-corpus.json";

/**
 * M2.7, D105 item 8: a logical phase ended because a lower job was
 * interrupted (`incomplete-cheaper-tier`) reports `lower-interrupted`, not a
 * work limit. The case is the S1 note's check 1 (docs/history/m27-progress.md):
 * on Escargot under explain-fair@1, C33 (tier 5) is interrupted by its fixed
 * tuple bound, which blocks the tier-6 jobs above it.
 */
const escargot = evalCorpus.cases.find((entry) => entry.id === "escargot")?.puzzle ?? "";
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `C${String(from + i).padStart(2, "0")}`);

async function run(policy: "explain-fair@1" | "explain-fair@3") {
  const on = new Set(["C01", "C02", "C03", ...range(22, 28), "C33"]);
  const events: ClassicSolveEvent[] = [];
  await solveClassic(
    {
      givens: [...escargot].map(Number),
      policy,
      limits: { ...CLASSIC_SOLVE_LIMITS, timeMs: 3_600_000 },
      techniqueSelection: { off: range(1, 33).filter((id) => !on.has(id)) },
    },
    { clock: { now: () => 0 }, emit: (event) => events.push(event) },
  );
  const result = events.at(-1);
  if (result?.kind !== "result") throw new Error("no result");
  return result;
}

test("an interrupted lower job that stops @1 is reported as lower-interrupted", async () => {
  const result = await run("explain-fair@1");
  expect(result.human).toBe("incomplete");
  expect(result.stopReason).toBe("lower-interrupted");
  expect(result.count).toBe("unique");
});

test("under @3 the same job counts as settled, so the run climbs and stops on its budget", async () => {
  const result = await run("explain-fair@3");
  expect(result.stopReason).not.toBe("lower-interrupted");
  expect(result.coverage.highestTierTried).toBe(6);
});
