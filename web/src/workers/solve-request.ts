import {
  CLASSIC_SOLVE_LIMITS,
  classicLimitsFor,
  type ClassicSolveInput,
} from "../solver/classic-run";

/** Every field a `solve-classic` request may carry; any other key rejects the request. */
const SOLVE_FIELDS = new Set([
  "kind",
  "requestId",
  "givens",
  "mode",
  "timeLimitMs",
  "techniqueSelection",
]);

/**
 * The run input of an untrusted `solve-classic` worker message. A request
 * with a key it does not know is rejected (`invalid-solve-request`), so a
 * misspelt technique selection can never run the full set (M2.7, D105). The
 * selection itself is shape-checked by `solveProblem`; the givens by
 * `normalizeClassic`. An invalid `timeLimitMs` falls back to the default, as
 * before: harmless for a limit.
 */
export function solveInputOf(
  request: Readonly<Record<string, unknown>>,
): ClassicSolveInput | { readonly error: string } {
  if (Object.keys(request).some((key) => !SOLVE_FIELDS.has(key)))
    return { error: "invalid-solve-request" };
  const { timeLimitMs } = request;
  const timeMs =
    typeof timeLimitMs === "number" &&
    Number.isSafeInteger(timeLimitMs) &&
    timeLimitMs >= 1000 &&
    timeLimitMs <= 600_000
      ? timeLimitMs
      : CLASSIC_SOLVE_LIMITS.timeMs;
  return {
    givens: request.givens as readonly number[],
    mode: request.mode as ClassicSolveInput["mode"],
    requestId: request.requestId as string,
    // The work budget scales with the preset (spec M2.6 T08).
    limits: classicLimitsFor(timeMs),
    ...(request.techniqueSelection === undefined
      ? {}
      : { techniqueSelection: request.techniqueSelection }),
  };
}
