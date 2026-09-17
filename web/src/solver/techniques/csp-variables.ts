import { matchingFacts } from "../state/source-index";
import type { ReadView, Literal } from "../state/types";
import { assertOwnedView } from "../state/candidates";
import { symbolMask } from "../state/read";

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
export const candidateLiteral = (candidate: Candidate, positive = true): Literal => ({
  cell: candidate[0],
  symbol: candidate[1],
  positive,
});
export const candidateKey = (candidate: Candidate): string => `${candidate[0]}:${candidate[1]}`;
export const members = (value: Candidate | CandidateSet): CandidateSet =>
  typeof value[0] === "number" ? [value as Candidate] : (value as CandidateSet);

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
    view.assembly.allDifferent.reduce((n, house) => n + house.cells.length, 0) *
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
      .filter((symbol) => view.state.domains[cell] & symbolMask(symbol))
      .map((symbol) => [cell, symbol] as Candidate);
    result.push({
      id: `cell:${cell}`,
      cell,
      alternatives,
      premises: [view.state.domainFacts[cell]],
    });
  }
  for (const house of view.assembly.allDifferent)
    for (const symbol of view.assembly.problem.symbols) {
      const source = matchingFacts(view, { kind: "cover", symbol, cells: house.cells }).find(
        (fact) => !fact.openAssumptions.length,
      );
      if (!source) continue;
      const alternatives = house.cells
        .filter((cell) => view.state.domains[cell] & symbolMask(symbol))
        .map((cell) => [cell, symbol] as Candidate);
      if (alternatives.some((candidate) => view.state.values[candidate[0]])) continue;
      result.push({
        id: `${house.id}:symbol:${symbol}`,
        house: house.id,
        symbol,
        alternatives,
        premises: [source.id, ...house.cells.map((cell) => view.state.domainFacts[cell])],
      });
    }
  return result;
}

/** A geometric conflict is a recipe; the compiler still supplies its true fact. */
export function candidatesConflict(view: ReadView, left: Candidate, right: Candidate): boolean {
  return left[0] === right[0]
    ? left[1] !== right[1]
    : left[1] === right[1] &&
        view.assembly.allDifferent.some(
          (house) => house.cells.includes(left[0]) && house.cells.includes(right[0]),
        );
}

/** Sudoku group geometry is a single digit in one box-line intersection. */
export function candidateGroup(view: ReadView, values: CandidateSet): boolean {
  if (
    values.length < 2 ||
    values.length > 3 ||
    new Set(values.map(candidateKey)).size !== values.length ||
    new Set(values.map((candidate) => candidate[1])).size !== 1
  )
    return false;
  const cells = values.map((candidate) => candidate[0]);
  const contains = (house: { cells: readonly number[] }) =>
    cells.every((cell) => house.cells.includes(cell));
  return (
    view.assembly.allDifferent.some(
      (house) =>
        contains(house) &&
        house.cells.length === 9 &&
        new Set(house.cells.map((cell) => Math.floor(cell / 27) * 3 + Math.floor((cell % 9) / 3)))
          .size === 1,
    ) &&
    view.assembly.allDifferent.some(
      (house) =>
        contains(house) &&
        house.cells.length === 9 &&
        (new Set(house.cells.map((cell) => Math.floor(cell / 9))).size === 1 ||
          new Set(house.cells.map((cell) => cell % 9)).size === 1),
    )
  );
}
