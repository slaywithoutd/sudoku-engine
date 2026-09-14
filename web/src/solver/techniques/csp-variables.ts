import {matchingFacts} from "../state/source-index";
import type { ReadView, Literal } from "../state/types";
import { assertOwnedView } from "../state/candidates";
import { sameValue } from "../proof/primitives";

/** Candidate identities remain physical occurrences across variable projections. */
export type Candidate = readonly [number, number];
export type CandidateSet = readonly Candidate[];
export interface CspVariable {
  readonly id: string;
  readonly alternatives: CandidateSet;
  readonly premises: readonly number[];
  readonly cell?: number;
  readonly house?: string;
  readonly symbol?: number;
}
export const candidateLiteral = (v: Candidate, positive = true): Literal => ({
  cell: v[0],
  symbol: v[1],
  positive,
});
export const candidateKey = (v: Candidate): string => `${v[0]}:${v[1]}`;
export const members = (v: Candidate | CandidateSet): CandidateSet =>
  typeof v[0] === "number" ? [v as Candidate] : (v as CandidateSet);

/** Upper bound before allocating complete variables and occurrence incidence.
 * General capability assemblies can contain more than the 27 classic houses.
 */
export function cspVariableReservation(view: ReadView): {
  entries: number;
  bytes: number;
} {
  const count =
    view.assembly.problem.cells.length +
    view.assembly.allDifferent.length * view.assembly.problem.symbols.length;
  const slots =
    view.assembly.problem.cells.length * view.assembly.problem.symbols.length +
    view.assembly.allDifferent.reduce((n, h) => n + h.cells.length, 0) *
      view.assembly.problem.symbols.length;
  return { entries: count + slots, bytes: count * 1024 + slots * 512 };
}

/** Complete current cell and declared covering-house domains with exact FactIds.
 * This bounded value builder does not issue facts. Discovery reserves its output.
 */
export function buildCspVariables(view: ReadView): readonly CspVariable[] {
  assertOwnedView(view);
  const result: CspVariable[] = [];
  for (const cell of view.assembly.problem.cells) {
    if (view.state.values[cell]) continue;
    const alternatives = view.assembly.problem.symbols
      .filter((s) => view.state.domains[cell] & (1 << (s - 1)))
      .map((s) => [cell, s] as Candidate);
    result.push({
      id: `cell:${cell}`,
      cell,
      alternatives,
      premises: [view.state.domainFacts[cell]],
    });
  }
  for (const house of view.assembly.allDifferent)
    for (const symbol of view.assembly.problem.symbols) {
      const source = matchingFacts(view,{kind:"cover",symbol,cells:house.cells}).find(f=>!f.openAssumptions.length);
      if (!source) continue;
      const alternatives = house.cells
        .filter((c) => view.state.domains[c] & (1 << (symbol - 1)))
        .map((c) => [c, symbol] as Candidate);
      if (alternatives.some((v) => view.state.values[v[0]])) continue;
      result.push({
        id: `${house.id}:symbol:${symbol}`,
        house: house.id,
        symbol,
        alternatives,
        premises: [
          source.id,
          ...house.cells.map((c) => view.state.domainFacts[c]),
        ],
      });
    }
  return result;
}

/** A geometric conflict is a recipe; the compiler still supplies its true fact. */
export function candidatesConflict(
  view: ReadView,
  a: Candidate,
  b: Candidate,
): boolean {
  return a[0] === b[0]
    ? a[1] !== b[1]
    : a[1] === b[1] &&
        view.assembly.allDifferent.some(
          (h) => h.cells.includes(a[0]) && h.cells.includes(b[0]),
        );
}

/** Sudoku group geometry is a single digit in one box-line intersection. */
export function candidateGroup(view: ReadView, values: CandidateSet): boolean {
  if (
    values.length < 2 ||
    values.length > 3 ||
    new Set(values.map(candidateKey)).size !== values.length ||
    new Set(values.map((v) => v[1])).size !== 1
  )
    return false;
  const cells = values.map((v) => v[0]);
  const contains = (h: { cells: readonly number[] }) =>
    cells.every((c) => h.cells.includes(c));
  return (
    view.assembly.allDifferent.some(
      (h) =>
        contains(h) &&
        h.cells.length === 9 &&
        new Set(
          h.cells.map((c) => Math.floor(c / 27) * 3 + Math.floor((c % 9) / 3)),
        ).size === 1,
    ) &&
    view.assembly.allDifferent.some(
      (h) =>
        contains(h) &&
        h.cells.length === 9 &&
        (new Set(h.cells.map((c) => Math.floor(c / 9))).size === 1 ||
          new Set(h.cells.map((c) => c % 9)).size === 1),
    )
  );
}
