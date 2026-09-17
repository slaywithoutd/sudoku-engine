import type { ReadView } from "../state/types";
import type { UniqueGeometry } from "./unique-compiler";
import { symbolMask } from "../state/read";
export type UniqueGeometryEvent =
  | { readonly kind: "work"; readonly units: number }
  | { readonly kind: "geometry"; readonly geometry: UniqueGeometry };
export type UniqueGeometryCursor = Generator<UniqueGeometryEvent, void, void>;
export const uniqueSymbols = (mask: number): number[] =>
  Array.from({ length: 9 }, (_, i) => i + 1).filter((symbol) => mask & symbolMask(symbol));
export function* uniqueCombinations(
  values: readonly number[],
  size: number,
  chosen: number[] = [],
  start = 0,
): Generator<number[]> {
  if (chosen.length === size) {
    yield [...chosen];
    return;
  }
  for (let i = start; i <= values.length - size + chosen.length; i++) {
    chosen.push(values[i]);
    yield* uniqueCombinations(values, size, chosen, i + 1);
    chosen.pop();
  }
}
const row = (cell: number) => Math.floor(cell / 9),
  col = (cell: number) => cell % 9,
  box = (cell: number) => Math.floor(cell / 27) * 3 + Math.floor((cell % 9) / 3);

/** Pure recipe creation; the compiler and independent checker retain authority separation. */
export function uniqueGeometry(
  view: ReadView,
  rowId: UniqueGeometry["row"],
  kind: UniqueGeometry["kind"],
  cells: readonly number[],
  coreMasks: readonly number[],
): UniqueGeometry {
  const alias = kind.startsWith("type")
    ? `Unique Rectangle type ${kind.slice(4)}`
    : kind === "hidden"
      ? "Hidden Rectangle"
      : kind.startsWith("avoidable")
        ? "Avoidable Rectangle"
        : kind === "extended"
          ? "Extended Rectangle"
          : kind === "loop"
            ? "Unique Loops"
            : rowId === "U04"
              ? "BUG+1"
              : "BUG+n";
  return {
    row: rowId,
    kind,
    alias,
    cells: [...cells],
    coreMasks: [...coreMasks],
    permutation: null,
    guardians: cells.flatMap((cell, i) =>
      uniqueSymbols(view.state.domains[cell] & ~coreMasks[i]).map((symbol) => ({
        cell,
        symbol,
        positive: true,
      })),
    ),
    loopOrder: [],
    auxiliaryCells: [],
    subsetHouse: null,
    strongSymbol: null,
    strongHouses: [],
    causalHouses: [],
  };
}

/** Separate finite cursors let the runtime service every rectangle form fairly. */
export class UniqueRectangles {
  cursors(view: ReadView, rowId: "U01" | "U02"): UniqueGeometryCursor[] {
    return rowId === "U01"
      ? [1, 2, 3, 4, 5, 6].map((n) => this.rectangles(view, `type${n}` as UniqueGeometry["kind"]))
      : [
          this.rectangles(view, "hidden"),
          this.rectangles(view, "avoidable1"),
          this.rectangles(view, "avoidable2"),
          this.extended(view, "rows"),
          this.extended(view, "columns"),
        ];
  }
  private *rectangles(view: ReadView, kind: UniqueGeometry["kind"]): UniqueGeometryCursor {
    const coordinates = Array.from({ length: 9 }, (_, i) => i),
      domains = view.state.domains;
    for (const rows of uniqueCombinations(coordinates, 2))
      for (const cols of uniqueCombinations(coordinates, 2)) {
        yield { kind: "work", units: 1 };
        const cells = rows.flatMap((r) => cols.map((cell) => r * 9 + cell));
        if (
          new Set(cells.map(box)).size !== 2 ||
          cells.some((cell) => view.assembly.problem.givens[cell])
        )
          continue;
        for (const core of uniqueCombinations(view.assembly.problem.symbols, 2)) {
          yield { kind: "work", units: 1 };
          const mask = core.reduce((m, symbol) => m | symbolMask(symbol), 0),
            avoidable = kind.startsWith("avoidable");
          if (
            cells.some((cell) =>
              avoidable
                ? !(domains[cell] & mask)
                : view.state.values[cell] || (domains[cell] & mask) !== mask,
            )
          )
            continue;
          const geometry = uniqueGeometry(
            view,
            kind.startsWith("type") ? "U01" : "U02",
            kind,
            cells,
            cells.map(() => mask),
          );
          const roofs = cells.filter((cell) =>
              geometry.guardians.some((literal) => literal.cell === cell),
            ),
            derived = cells.filter((cell) => view.state.values[cell]);
          const adjacent =
            roofs.length === 2 &&
            (row(roofs[0]) === row(roofs[1]) || col(roofs[0]) === col(roofs[1]));
          if (!geometry.guardians.length) continue;
          if (kind === "type1" && roofs.length === 1)
            yield { kind: "geometry", geometry: geometry };
          if (
            (kind === "avoidable1" && derived.length === 3 && roofs.length === 1) ||
            (kind === "avoidable2" &&
              derived.length === 2 &&
              roofs.length === 2 &&
              new Set(geometry.guardians.map((literal) => literal.symbol)).size === 1)
          )
            yield { kind: "geometry", geometry: geometry };
          if (
            (kind === "type2" &&
              adjacent &&
              new Set(geometry.guardians.map((literal) => literal.symbol)).size === 1) ||
            (kind === "type5" &&
              (roofs.length === 3 || (roofs.length === 2 && !adjacent)) &&
              new Set(geometry.guardians.map((literal) => literal.symbol)).size === 1)
          )
            yield { kind: "geometry", geometry: geometry };
          if (kind === "type3" && adjacent) {
            const extras = [...new Set(geometry.guardians.map((literal) => literal.symbol))],
              extraMask = extras.reduce((m, symbol) => m | symbolMask(symbol), 0);
            if (extras.length < 2 || extras.length > 4) continue;
            for (const house of view.assembly.allDifferent)
              if (roofs.every((cell) => house.cells.includes(cell))) {
                const auxiliary = house.cells.filter(
                  (cell) =>
                    !cells.includes(cell) &&
                    !view.state.values[cell] &&
                    (domains[cell] & ~extraMask) === 0,
                );
                for (const chosen of uniqueCombinations(auxiliary, extras.length - 1)) {
                  yield { kind: "work", units: 1 };
                  yield {
                    kind: "geometry",
                    geometry: { ...geometry, auxiliaryCells: chosen, subsetHouse: house.id },
                  };
                }
              }
          }
          if (["type4", "type6", "hidden"].includes(kind))
            for (const strongSymbol of core) {
              const houses = view.assembly.allDifferent.filter((house) => {
                const supports = house.cells.filter(
                  (cell) => domains[cell] & symbolMask(strongSymbol),
                );
                return supports.length === 2 && supports.every((cell) => cells.includes(cell));
              });
              if (kind === "type4" && adjacent)
                for (const house of houses)
                  if (roofs.every((cell) => house.cells.includes(cell)))
                    yield {
                      kind: "geometry",
                      geometry: { ...geometry, strongSymbol, strongHouses: [house.id] },
                    };
              if (kind === "type6" && roofs.length === 2 && !adjacent)
                for (const coordinate of [row, col]) {
                  const orthogonal = houses.filter(
                    (house) =>
                      new Set(house.cells.map(row)).size === 1 ||
                      new Set(house.cells.map(col)).size === 1,
                  );
                  if (orthogonal.length !== 4) continue;
                  const lines = houses.filter(
                    (house) => new Set(house.cells.map(coordinate)).size === 1,
                  );
                  if (lines.length === 2)
                    yield {
                      kind: "geometry",
                      geometry: {
                        ...geometry,
                        strongSymbol,
                        strongHouses: orthogonal.map((house) => house.id),
                        causalHouses: lines.map((house) => house.id),
                      },
                    };
                }
              if (kind === "hidden")
                for (const floor of cells.filter((cell) =>
                  cells.some(
                    (other) =>
                      row(other) !== row(cell) &&
                      col(other) !== col(cell) &&
                      domains[other] === mask,
                  ),
                )) {
                  const lines = houses.filter((house) => house.cells.includes(floor));
                  for (const house of lines.filter((h) => new Set(h.cells.map(row)).size === 1))
                    for (const b of lines.filter((h) => new Set(h.cells.map(col)).size === 1))
                      yield {
                        kind: "geometry",
                        geometry: { ...geometry, strongSymbol, strongHouses: [house.id, b.id] },
                      };
                }
            }
        }
      }
  }
  private *extended(view: ReadView, orientation: "rows" | "columns"): UniqueGeometryCursor {
    const coordinates = Array.from({ length: 9 }, (_, i) => i);
    for (const left of uniqueCombinations(coordinates, 2))
      for (const right of uniqueCombinations(coordinates, 3)) {
        yield { kind: "work", units: 1 };
        const cells = (
          orientation === "rows"
            ? left.flatMap((r) => right.map((cell) => 9 * r + cell))
            : right.flatMap((r) => left.map((cell) => 9 * r + cell))
        ).sort((x, y) => x - y);
        if (
          new Set(cells.map(box)).size !== 3 ||
          cells.some((cell) => view.state.values[cell] || view.assembly.problem.givens[cell])
        )
          continue;
        const common = cells.reduce((mask, cell) => mask & view.state.domains[cell], 511);
        for (const core of uniqueCombinations(uniqueSymbols(common), 3)) {
          yield { kind: "work", units: 1 };
          const mask = core.reduce((m, symbol) => m | symbolMask(symbol), 0),
            geometry = uniqueGeometry(
              view,
              "U02",
              "extended",
              cells,
              cells.map(() => mask),
            );
          if (!geometry.guardians.length) continue;
          const permutation = cells.map((cell) =>
            orientation === "rows"
              ? (row(cell) === left[0] ? left[1] : left[0]) * 9 + col(cell)
              : row(cell) * 9 + (col(cell) === left[0] ? left[1] : left[0]),
          );
          yield { kind: "geometry", geometry: { ...geometry, permutation } };
        }
      }
  }
}
