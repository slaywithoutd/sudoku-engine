import type { CellState, Digit, EditorState, Value } from "./model";
export function parsePuzzleString(text: string): Value[] {
  const normalized = text.replace(/\s/g, "");
  if (!/^[1-9.0]{81}$/.test(normalized))
    throw new Error("Enter exactly 81 cells: 1–9, 0 or a dot.");
  return [...normalized].map((c) => (c === "." ? 0 : (Number(c) as Value)));
}
const units: number[][] = [];
for (let n = 0; n < 9; n++) {
  units.push(Array.from({ length: 9 }, (_, c) => n * 9 + c));
  units.push(Array.from({ length: 9 }, (_, r) => r * 9 + n));
  const br = Math.floor(n / 3) * 3,
    bc = (n % 3) * 3;
  units.push(
    Array.from(
      { length: 9 },
      (_, k) => (br + Math.floor(k / 3)) * 9 + bc + (k % 3),
    ),
  );
}
export function conflictingCells(values: readonly Value[]): number[] {
  const conflicts = new Set<number>();
  for (const unit of units) {
    const groups = new Map<Value, number[]>();
    for (const i of unit)
      if (values[i])
        groups.set(values[i], [...(groups.get(values[i]) ?? []), i]);
    for (const group of groups.values())
      if (group.length > 1) for (const i of group) conflicts.add(i);
  }
  return [...conflicts].sort((a, b) => a - b);
}
export function isComplete(values: readonly Value[]): boolean {
  return (
    values.length === 81 &&
    values.every((v) => Number.isInteger(v) && v >= 1 && v <= 9) &&
    conflictingCells(values).length === 0
  );
}
export function effectiveValues(
  editor: EditorState,
  givens: readonly Value[],
): Value[] {
  return editor.cells.map((cell, i) => givens[i] || cell.value);
}
/** The 20 cells sharing a row, column or box with `index`, ascending. */
export function peersOf(index: number): number[] {
  return PEERS[index];
}
const PEERS: number[][] = Array.from({ length: 81 }, (_, index) => {
  const set = new Set<number>();
  for (const unit of units) if (unit.includes(index)) unit.forEach((i) => set.add(i));
  set.delete(index);
  return [...set].sort((a, b) => a - b);
});
/**
 * Candidates from local row, column and box constraints only — no solving
 * technique and no knowledge of the solution.
 */
export function candidatesFor(values: readonly Value[], index: number): Digit[] {
  if (values[index]) return [];
  const used = new Set(PEERS[index].map((i) => values[i]));
  return ([1, 2, 3, 4, 5, 6, 7, 8, 9] as Digit[]).filter((d) => !used.has(d));
}
/** Note digits already placed in a peer cell, per cell index. */
export function noteConflicts(
  values: readonly Value[],
  cells: readonly CellState[],
): Map<number, Set<Digit>> {
  const result = new Map<number, Set<Digit>>();
  cells.forEach((cell, index) => {
    if (values[index]) return;
    const notes = [...cell.notes, ...(cell.center ?? [])];
    if (!notes.length) return;
    const used = new Set(PEERS[index].map((i) => values[i]));
    const bad = new Set(notes.filter((n) => used.has(n)));
    if (bad.size) result.set(index, bad);
  });
  return result;
}
/** Digits placed nine times without conflicts. */
export function completedDigits(values: readonly Value[]): Set<Digit> {
  const counts = new Map<Value, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  const conflicts = new Set(conflictingCells(values).map((i) => values[i]));
  return new Set(
    ([1, 2, 3, 4, 5, 6, 7, 8, 9] as Digit[]).filter(
      (d) => counts.get(d) === 9 && !conflicts.has(d),
    ),
  );
}
export function toPuzzleString(values: readonly Value[]): string {
  return values.map((v) => (v ? String(v) : ".")).join("");
}
