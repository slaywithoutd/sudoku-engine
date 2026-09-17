import type { ReadView } from "../state/types";
import type { Effect } from "../proof/types";
import type { LocalSet, SdcPattern } from "./set-contracts";
import { combinations, setUnion } from "./set-certificate";
import { setDescriptor, type SetCursor } from "./set-runtime";
import { symbolMask } from "../state/read";

/** Extended two-sector allocation. Outside-V symbols are counted separately on
 * each side, even when equal; a V-symbol shared by the sides is forbidden. */
export function sdcAllocation(
  view: ReadView,
  intersection: number[],
  line: LocalSet,
  box: LocalSet,
): boolean {
  const value = setUnion(view, intersection),
    left = line.symbols,
    right = box.symbols;
  return (
    value.length >= intersection.length + 2 &&
    left.length === line.cells.length + 1 &&
    right.length === box.cells.length + 1 &&
    new Set([...value, ...left, ...right]).size <= 9 &&
    !value.some((symbol) => left.includes(symbol) && right.includes(symbol)) &&
    line.cells.length + box.cells.length ===
      value.length -
        intersection.length +
        left.filter((symbol) => !value.includes(symbol)).length +
        right.filter((symbol) => !value.includes(symbol)).length
  );
}

export class SueDeCoqSearch {
  constructor(
    readonly view: ReadView,
    readonly sets: readonly LocalSet[],
  ) {}
  *patterns(intersectionSize: number, lineSize: number, boxSize: number): SetCursor {
    const view = this.view;
    const lines = view.assembly.allDifferent.filter(
      (house) =>
        house.cells.length === 9 &&
        (new Set(house.cells.map((cell) => Math.floor(cell / 9))).size === 1 ||
          new Set(house.cells.map((cell) => cell % 9)).size === 1),
    );
    const boxes = view.assembly.allDifferent.filter(
      (house) =>
        house.cells.length === 9 &&
        new Set(house.cells.map((cell) => Math.floor(cell / 27) * 3 + Math.floor((cell % 9) / 3)))
          .size === 1,
    );
    for (const line of lines)
      for (const box of boxes) {
        yield { kind: "work", units: 1 };
        const geometric = line.cells.filter((cell) => box.cells.includes(cell));
        if (geometric.length !== 3) continue;
        for (const intersection of combinations(
          geometric.filter((cell) => !view.state.values[cell]),
          intersectionSize,
        )) {
          yield { kind: "work", units: 1 };
          if (setUnion(view, intersection).length < intersectionSize + 2) continue;
          for (const set of this.sets) {
            yield { kind: "work", units: 1 };
            if (
              set.house !== line.id ||
              set.cells.length !== lineSize ||
              set.cells.some((cell) => intersection.includes(cell))
            )
              continue;
            for (const candidate of this.sets) {
              yield { kind: "work", units: 1 };
              if (
                candidate.house !== box.id ||
                candidate.cells.length !== boxSize ||
                candidate.cells.some(
                  (cell) => intersection.includes(cell) || set.cells.includes(cell),
                ) ||
                !sdcAllocation(view, intersection, set, candidate)
              )
                continue;
              const cells = [...intersection, ...set.cells, ...candidate.cells].sort(
                  (x, y) => x - y,
                ),
                value = setUnion(view, intersection);
              const pattern: SdcPattern = {
                kind: "sdc",
                alias: "Sue de Coq",
                line: line.id,
                box: box.id,
                intersection,
                lineSide: set.cells,
                boxSide: candidate.cells,
                domains: cells.map((cell) => view.state.domains[cell]),
                table: -1,
                routes: [],
              };
              const effects: Effect[] = [];
              for (const sector of ["line", "box"] as const) {
                const own = sector === "line" ? set : candidate,
                  other = sector === "line" ? candidate : set,
                  house = sector === "line" ? line : box;
                const local = [...intersection, ...own.cells].sort((x, y) => x - y);
                const symbols = [
                  ...new Set([
                    ...own.symbols,
                    ...value.filter((symbol) => !other.symbols.includes(symbol)),
                  ]),
                ].sort((x, y) => x - y);
                for (const cell of house.cells)
                  for (const symbol of symbols) {
                    yield { kind: "work", units: 1 };
                    if (
                      local.includes(cell) ||
                      view.state.values[cell] ||
                      !(view.state.domains[cell] & symbolMask(symbol)) ||
                      effects.some((effect) => effect.cell === cell && effect.symbol === symbol)
                    )
                      continue;
                    const occurrences = local.filter(
                      (peer) => view.state.domains[peer] & symbolMask(symbol),
                    );
                    if (!occurrences.length) continue;
                    effects.push({ kind: "remove", cell, symbol });
                    pattern.routes.push({
                      sector,
                      occurrences,
                      projection: -1,
                      visibility: [],
                      root: -1,
                    });
                  }
              }
              if (effects.length) yield { kind: "candidate", pattern: pattern, effects };
            }
          }
        }
      }
  }
}
export const sueDeCoqTechniques = Object.freeze([
  setDescriptor("C20", (view, _graph, sets) => {
    const search = new SueDeCoqSearch(view, sets);
    return [2, 3].flatMap((cell) =>
      [1, 2, 3, 4].flatMap((left) =>
        [1, 2, 3, 4].map((right) => search.patterns(cell, left, right)),
      ),
    );
  }),
]);
