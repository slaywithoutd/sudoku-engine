import type { ReadView } from "../state/types";
import type { UniqueGeometry } from "./unique-compiler";
import { symbolMask } from "../state/read";
export type UniqueGeometryEvent =
  | { readonly kind: "work"; readonly units: number }
  | { readonly kind: "geometry"; readonly geometry: UniqueGeometry };
export type UniqueGeometryCursor = Generator<UniqueGeometryEvent, void, void>;
export const uniqueSymbols = (mask: number): number[] =>
  Array.from({ length: 9 }, (_, i) => i + 1).filter((s) => mask & symbolMask(s));
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
const row = (c: number) => Math.floor(c / 9),
  col = (c: number) => c % 9,
  box = (c: number) => Math.floor(c / 27) * 3 + Math.floor((c % 9) / 3);

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
        const cells = rows.flatMap((r) => cols.map((c) => r * 9 + c));
        if (
          new Set(cells.map(box)).size !== 2 ||
          cells.some((c) => view.assembly.problem.givens[c])
        )
          continue;
        for (const core of uniqueCombinations(view.assembly.problem.symbols, 2)) {
          yield { kind: "work", units: 1 };
          const mask = core.reduce((m, s) => m | symbolMask(s), 0),
            avoidable = kind.startsWith("avoidable");
          if (
            cells.some((c) =>
              avoidable
                ? !(domains[c] & mask)
                : view.state.values[c] || (domains[c] & mask) !== mask,
            )
          )
            continue;
          const g = uniqueGeometry(
            view,
            kind.startsWith("type") ? "U01" : "U02",
            kind,
            cells,
            cells.map(() => mask),
          );
          const roofs = cells.filter((c) => g.guardians.some((a) => a.cell === c)),
            derived = cells.filter((c) => view.state.values[c]);
          const adjacent =
            roofs.length === 2 &&
            (row(roofs[0]) === row(roofs[1]) || col(roofs[0]) === col(roofs[1]));
          if (!g.guardians.length) continue;
          if (kind === "type1" && roofs.length === 1) yield { kind: "geometry", geometry: g };
          if (
            (kind === "avoidable1" && derived.length === 3 && roofs.length === 1) ||
            (kind === "avoidable2" &&
              derived.length === 2 &&
              roofs.length === 2 &&
              new Set(g.guardians.map((a) => a.symbol)).size === 1)
          )
            yield { kind: "geometry", geometry: g };
          if (
            (kind === "type2" &&
              adjacent &&
              new Set(g.guardians.map((a) => a.symbol)).size === 1) ||
            (kind === "type5" &&
              (roofs.length === 3 || (roofs.length === 2 && !adjacent)) &&
              new Set(g.guardians.map((a) => a.symbol)).size === 1)
          )
            yield { kind: "geometry", geometry: g };
          if (kind === "type3" && adjacent) {
            const extras = [...new Set(g.guardians.map((a) => a.symbol))],
              extraMask = extras.reduce((m, s) => m | symbolMask(s), 0);
            if (extras.length < 2 || extras.length > 4) continue;
            for (const house of view.assembly.allDifferent)
              if (roofs.every((c) => house.cells.includes(c))) {
                const auxiliary = house.cells.filter(
                  (c) =>
                    !cells.includes(c) && !view.state.values[c] && (domains[c] & ~extraMask) === 0,
                );
                for (const chosen of uniqueCombinations(auxiliary, extras.length - 1)) {
                  yield { kind: "work", units: 1 };
                  yield {
                    kind: "geometry",
                    geometry: { ...g, auxiliaryCells: chosen, subsetHouse: house.id },
                  };
                }
              }
          }
          if (["type4", "type6", "hidden"].includes(kind))
            for (const strongSymbol of core) {
              const houses = view.assembly.allDifferent.filter((h) => {
                const supports = h.cells.filter((c) => domains[c] & symbolMask(strongSymbol));
                return supports.length === 2 && supports.every((c) => cells.includes(c));
              });
              if (kind === "type4" && adjacent)
                for (const h of houses)
                  if (roofs.every((c) => h.cells.includes(c)))
                    yield {
                      kind: "geometry",
                      geometry: { ...g, strongSymbol, strongHouses: [h.id] },
                    };
              if (kind === "type6" && roofs.length === 2 && !adjacent)
                for (const coordinate of [row, col]) {
                  const orthogonal = houses.filter(
                    (h) =>
                      new Set(h.cells.map(row)).size === 1 || new Set(h.cells.map(col)).size === 1,
                  );
                  if (orthogonal.length !== 4) continue;
                  const lines = houses.filter((h) => new Set(h.cells.map(coordinate)).size === 1);
                  if (lines.length === 2)
                    yield {
                      kind: "geometry",
                      geometry: {
                        ...g,
                        strongSymbol,
                        strongHouses: orthogonal.map((h) => h.id),
                        causalHouses: lines.map((h) => h.id),
                      },
                    };
                }
              if (kind === "hidden")
                for (const floor of cells.filter((c) =>
                  cells.some(
                    (other) =>
                      row(other) !== row(c) && col(other) !== col(c) && domains[other] === mask,
                  ),
                )) {
                  const lines = houses.filter((h) => h.cells.includes(floor));
                  for (const a of lines.filter((h) => new Set(h.cells.map(row)).size === 1))
                    for (const b of lines.filter((h) => new Set(h.cells.map(col)).size === 1))
                      yield {
                        kind: "geometry",
                        geometry: { ...g, strongSymbol, strongHouses: [a.id, b.id] },
                      };
                }
            }
        }
      }
  }
  private *extended(view: ReadView, orientation: "rows" | "columns"): UniqueGeometryCursor {
    const coordinates = Array.from({ length: 9 }, (_, i) => i);
    for (const a of uniqueCombinations(coordinates, 2))
      for (const b of uniqueCombinations(coordinates, 3)) {
        yield { kind: "work", units: 1 };
        const cells = (
          orientation === "rows"
            ? a.flatMap((r) => b.map((c) => 9 * r + c))
            : b.flatMap((r) => a.map((c) => 9 * r + c))
        ).sort((x, y) => x - y);
        if (
          new Set(cells.map(box)).size !== 3 ||
          cells.some((c) => view.state.values[c] || view.assembly.problem.givens[c])
        )
          continue;
        const common = cells.reduce((mask, c) => mask & view.state.domains[c], 511);
        for (const core of uniqueCombinations(uniqueSymbols(common), 3)) {
          yield { kind: "work", units: 1 };
          const mask = core.reduce((m, s) => m | symbolMask(s), 0),
            g = uniqueGeometry(
              view,
              "U02",
              "extended",
              cells,
              cells.map(() => mask),
            );
          if (!g.guardians.length) continue;
          const permutation = cells.map((c) =>
            orientation === "rows"
              ? (row(c) === a[0] ? a[1] : a[0]) * 9 + col(c)
              : row(c) * 9 + (col(c) === a[0] ? a[1] : a[0]),
          );
          yield { kind: "geometry", geometry: { ...g, permutation } };
        }
      }
  }
}
