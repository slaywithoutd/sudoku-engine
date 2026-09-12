import type { EditorState, Value } from "./model";
export function parsePuzzleString(text: string): Value[] {
  const normalized = text.replace(/\s/g, "");
  if (!/^[1-9.0]{81}$/.test(normalized))
    throw new Error("Informe exatamente 81 células: 1–9, 0 ou ponto.");
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
