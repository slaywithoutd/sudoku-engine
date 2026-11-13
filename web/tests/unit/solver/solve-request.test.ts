import { expect, test } from "vitest";
import { solveInputOf } from "../../../src/workers/solve-request";
import { CLASSIC_SOLVE_LIMITS, classicLimitsFor } from "../../../src/solver/classic-run";

// M2.7 S2 review: the worker's solve-classic request, S1 note §6 table 5.5.
const base = { kind: "solve-classic", requestId: "r", givens: Array(81).fill(0), mode: "explain" };

test("a request with an unknown key is rejected, so a misspelt selection never runs the full set", () => {
  for (const key of ["techniques", "techniqueSet", "preset", "policy"])
    expect(solveInputOf({ ...base, [key]: { preset: "no-fish@1" } })).toEqual({
      error: "invalid-solve-request",
    });
});
test("the selection passes through unchecked, for solveProblem to validate", () => {
  for (const selection of [{ preset: "no-fish@1" }, { off: ["C06"] }, "garbage", null])
    expect(solveInputOf({ ...base, techniqueSelection: selection })).toMatchObject({
      techniqueSelection: selection,
    });
  expect("techniqueSelection" in solveInputOf(base)).toBe(false);
});
test("the time limit scales the work budget and falls back to the default", () => {
  expect(solveInputOf({ ...base, timeLimitMs: 15_000 })).toMatchObject({
    limits: classicLimitsFor(15_000),
  });
  for (const timeLimitMs of [undefined, 10, "60000", 1.5e6])
    expect(solveInputOf({ ...base, timeLimitMs })).toMatchObject({
      limits: classicLimitsFor(CLASSIC_SOLVE_LIMITS.timeMs),
    });
});
