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
export function logicalSummary(human: string, steps: number): string {
  const labels: Record<string, string> = {
    solved: `Solved logically in ${steps} explained steps.`,
    "stalled-within-profile": `Logical techniques stalled after ${steps} steps.`,
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
  return `Count: not verified (${outcome === "timeout" ? "time limit" : "work limit"})`;
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
): string {
  if (human === "solved") return "Logic: solved";
  if (human === "contradiction" || human === "invalidated") return "Logic: found a contradiction";
  if (human === "not-started" || !stopReason || !coverage) return "";
  const untried = coverage.notStarted.length;
  return (
    `Logic: stalled at tier ${Math.max(0, coverage.highestTierTried)}` +
    ` (${stopLabels[stopReason] ?? "limit"})` +
    (untried ? `; ${untried} technique${untried === 1 ? "" : "s"} not tried` : "")
  );
}
/** Shown on Explain steps found while a simpler technique was cut by a budget. */
export const BUDGET_LIMITED_NOTE =
  "A simpler step may exist: a simpler technique stopped at its limit.";
/** Matches the board labels: rows A–I, columns 1–9. */
export function cellName(cell: number): string {
  return `${"ABCDEFGHI"[Math.floor(cell / 9)]}${(cell % 9) + 1}`;
}
