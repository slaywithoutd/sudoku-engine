import type { CellId, Mask, SymbolId } from "../problem";
import type { AllDifferent } from "../rules/types";
import type { ReadView } from "./types";

/** Number of cells in a classic row, column or box. */
export const CLASSIC_HOUSE_SIZE = 9;

/**
 * The all-different house registered under `houseId`, if the assembly has one.
 * Grammars pass untrusted ids straight from a pattern, so any value is accepted.
 */
export function findHouse(view: ReadView, houseId: unknown): AllDifferent | undefined {
  return view.assembly.allDifferent.find((house) => house.id === houseId);
}

/** Cells of the house registered under `houseId`; throws when the id is unknown. */
export function houseCells(view: ReadView, houseId: string): readonly CellId[] {
  const house = findHouse(view, houseId);
  if (!house) throw Error(`unknown-house:${houseId}`);
  return house.cells;
}

/** First all-different house containing every listed cell, if any. */
export function findHouseWithCells(
  view: ReadView,
  ...cells: readonly CellId[]
): AllDifferent | undefined {
  return view.assembly.allDifferent.find((house) =>
    cells.every((cell) => house.cells.includes(cell)),
  );
}

/** First all-different house containing every listed cell; throws when none does. */
export function houseWithCells(view: ReadView, ...cells: readonly CellId[]): AllDifferent {
  const house = findHouseWithCells(view, ...cells);
  if (!house) throw Error(`no-house-with-cells:${cells.join()}`);
  return house;
}

function isClassicHouse(house: AllDifferent): boolean {
  return house.cells.length === CLASSIC_HOUSE_SIZE;
}

/** The house whose cell list equals `cells` in the same order, if any. */
export function findHouseEqualTo(
  view: ReadView,
  cells: readonly CellId[],
): AllDifferent | undefined {
  const key = cells.join();
  return view.assembly.allDifferent.find((house) => house.cells.join() === key);
}

/** The classic (nine-cell) house whose cell list equals `cells` in the same order. */
export function classicHouseEqualTo(
  view: ReadView,
  cells: readonly CellId[],
): AllDifferent | undefined {
  const key = cells.join();
  return view.assembly.allDifferent.find(
    (house) => isClassicHouse(house) && house.cells.join() === key,
  );
}

/**
 * The classic house equal to `cells`, else the first classic house containing
 * all of them. Sources smaller than a house resolve to their enclosing house.
 */
export function classicHouseContaining(
  view: ReadView,
  cells: readonly CellId[],
): AllDifferent | undefined {
  return (
    classicHouseEqualTo(view, cells) ??
    view.assembly.allDifferent.find(
      (house) => isClassicHouse(house) && cells.every((cell) => house.cells.includes(cell)),
    )
  );
}

/** Domain bit for one symbol: bit 0 is symbol 1. */
export function symbolMask(symbol: SymbolId): Mask {
  return 1 << (symbol - 1);
}

/** True when the mask holds exactly one candidate. */
export function hasSingleCandidate(mask: Mask): boolean {
  return mask !== 0 && (mask & (mask - 1)) === 0;
}

/** True when the cell's domain still permits the symbol. */
export function allows(mask: Mask, symbol: SymbolId): boolean {
  return (mask & symbolMask(symbol)) !== 0;
}

/** Distinct cells named by a group of houses or scopes, in first-seen order. */
export function cellsOf(scopes: Iterable<{ readonly cells: readonly CellId[] }>): CellId[] {
  const seen = new Set<CellId>();
  for (const scope of scopes) for (const cell of scope.cells) seen.add(cell);
  return [...seen];
}
