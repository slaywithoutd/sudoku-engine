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
/** Matches the board labels: rows A–I, columns 1–9. */
export function cellName(cell: number): string {
  return `${"ABCDEFGHI"[Math.floor(cell / 9)]}${(cell % 9) + 1}`;
}
