export function solverStatus(status: string): string {
  const labels: Record<string, string> = {
    idle: "Ready",
    running: "Solving…",
    complete: "Complete",
    cancelled: "Cancelled",
    error: "Unable to solve",
    timeout: "Time limit reached",
    "resource-limit": "Work limit reached",
  };
  return labels[status] ?? "Analysis";
}
export function countSummary(count: string): string {
  const labels: Record<string, string> = {
    unique: "Exactly one solution, verified by exhaustive search.",
    multiple: "This puzzle has more than one solution.",
    zero: "This puzzle has no solution.",
    unknown: "The solution count could not be established within the limits.",
  };
  return labels[count] ?? labels.unknown;
}
/**
 * `restricted`: the run used a technique set (M2.7, D105). Its stall says
 * nothing about the puzzle, only about the selected techniques (S1 note §5.2).
 */
export function logicalSummary(human: string, steps: number, restricted = false): string {
  const labels: Record<string, string> = {
    solved: `Solved logically in ${steps} explained steps.`,
    "stalled-within-profile": restricted
      ? `No step with the selected techniques after ${steps} steps.`
      : `Logical techniques stalled after ${steps} steps.`,
    incomplete: `The logical explanation stopped at its limit after ${steps} steps.`,
    contradiction: "Logical analysis found a contradiction.",
    "not-started": "No logical explanation was attempted.",
    invalidated: "The logical explanation was invalidated.",
  };
  return labels[human] ?? "";
}
/** How the count was settled (spec M2.6 §4.5). */
export function countVerification(
  count: string,
  verifiedMs: number | undefined,
  outcome: string | undefined,
): string {
  if (count !== "unknown" && verifiedMs !== undefined)
    return `Count: verified in ${(verifiedMs / 1000).toFixed(1)} s`;
  if (outcome === "timeout") return "Count: not verified (time limit)";
  if (outcome === "resource-limit" || outcome === "complete")
    return "Count: not verified (work limit)";
  return "Count: not verified (solver error)";
}
const stopLabels: Record<string, string> = {
  "profile-stall": "no technique applies",
  "tier-cap": "work cap",
  "work-limit": "work limit",
  "time-limit": "time limit",
};
/** Where and why the logical phase stopped; empty when it never ran. */
export function logicStop(
  human: string,
  stopReason: string | undefined,
  coverage:
    { readonly notStarted: readonly string[]; readonly highestTierTried: number } | undefined,
  restricted = false,
): string {
  if (human === "solved") return "Logic: solved";
  if (human === "contradiction") return "Logic: found a contradiction";
  if (human === "invalidated") return "Logic: the explanation did not match the count";
  if (human === "not-started" || !stopReason || !coverage) return "";
  const untried = coverage.notStarted.length;
  const tail = untried ? `; ${untried} technique${untried === 1 ? "" : "s"} not tried` : "";
  // Tiers count from 0 (singles); -1 means no technique was served at all.
  const tier = coverage.highestTierTried;
  // A stall: no technique applies, or the capped ones still could (spec §4.5);
  // a budget stop: the phase was cut wherever it was.
  if (stopReason === "profile-stall" && restricted)
    return `Logic: stalled at tier ${Math.max(0, tier)} (no step with the selected techniques)${tail}`;
  if (stopReason === "profile-stall" || stopReason === "tier-cap")
    return `Logic: stalled at tier ${Math.max(0, tier)} (${stopLabels[stopReason]})${tail}`;
  const where = tier < 0 ? "before any technique" : `at tier ${tier}`;
  return `Logic: stopped ${where} by the ${stopLabels[stopReason] ?? "limit"}${tail}`;
}
/** Shown on Explain steps found while a simpler technique was cut by a budget. */
export const BUDGET_LIMITED_NOTE =
  "A simpler step may exist: a simpler technique stopped at its limit.";
/** Shown on steps found while a simpler technique is switched off (M2.7, D105 item 2). */
export const SET_LIMITED_NOTE = "A simpler step may exist: a simpler technique is switched off.";
/** The header line counting set-limited steps (D105 item 2); empty when none. */
export function setLimitedSummary(count: number): string {
  if (!count) return "";
  return count === 1
    ? "1 step may have a simpler explanation: a simpler technique is switched off."
    : `${count} steps may have a simpler explanation: a simpler technique is switched off.`;
}
/** What the technique set of a run left out, e.g. "Techniques: No fish (28 of 33)". */
export function techniqueSetLine(label: string, enabled: number, total: number): string {
  return enabled === total
    ? `Techniques: ${label}`
    : `Techniques: ${label} (${enabled} of ${total})`;
}
/** One line of technique coverage (spec M2.6 §4.5), with the switched-off families. */
export function coverageLine(
  coverage: {
    readonly exhausted: readonly string[];
    readonly capped: readonly string[];
    readonly notStarted: readonly string[];
  },
  notSelected = 0,
): string {
  const parts = [
    `${coverage.exhausted.length} exhausted`,
    `${coverage.capped.length} capped`,
    `${coverage.notStarted.length} not started`,
  ];
  if (notSelected) parts.push(`${notSelected} not selected`);
  return `Coverage: ${parts.join(", ")}`;
}
/** Matches the board labels: rows A–I, columns 1–9. */
export function cellName(cell: number): string {
  return `${"ABCDEFGHI"[Math.floor(cell / 9)]}${(cell % 9) + 1}`;
}
