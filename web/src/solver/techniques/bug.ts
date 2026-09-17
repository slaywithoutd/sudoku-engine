import type { ReadView } from "../state/types";
import {
  uniqueCombinations,
  uniqueGeometry,
  uniqueSymbols,
  type UniqueGeometryCursor,
} from "./unique-rectangles";
import { symbolMask } from "../state/read";

/** Complete residual-core enumeration, with explicit extra occurrence accounting. */
export class Bug {
  *geometries(view: ReadView, family: "U04" | "U05"): UniqueGeometryCursor {
    const cells = view.assembly.problem.cells.filter((cell) => !view.state.values[cell]),
      masks: number[] = [],
      maximum = family === "U04" ? 1 : 4;
    if (cells.length < 4) return;
    const minimumExtras = cells.reduce(
      (n, cell) => n + Math.max(0, uniqueSymbols(view.state.domains[cell]).length - 2),
      0,
    );
    if (
      minimumExtras > maximum ||
      cells.some((cell) => uniqueSymbols(view.state.domains[cell]).length < 2)
    )
      return;
    function* visit(index: number, extras: number): UniqueGeometryCursor {
      yield { kind: "work", units: 1 };
      if (index === cells.length) {
        if (extras < (family === "U04" ? 1 : 2) || extras > maximum) return;
        for (const house of view.assembly.allDifferent)
          for (const symbol of view.assembly.problem.symbols) {
            const count = cells.filter(
              (cell, i) => house.cells.includes(cell) && masks[i] & symbolMask(symbol),
            ).length;
            if (count !== 0 && count !== 2) return;
          }
        yield { kind: "geometry", geometry: uniqueGeometry(view, family, "bug", cells, masks) };
        return;
      }
      const values = uniqueSymbols(view.state.domains[cells[index]]),
        nextExtras = extras + values.length - 2;
      if (nextExtras > maximum) return;
      for (const pair of uniqueCombinations(values, 2)) {
        yield { kind: "work", units: 1 };
        masks.push(pair.reduce((mask, symbol) => mask | symbolMask(symbol), 0));
        if (
          !view.assembly.allDifferent.some((house) =>
            pair.some(
              (symbol) =>
                cells
                  .slice(0, index + 1)
                  .filter((cell, i) => house.cells.includes(cell) && masks[i] & symbolMask(symbol))
                  .length > 2,
            ),
          )
        )
          yield* visit(index + 1, nextExtras);
        masks.pop();
      }
    }
    yield* visit(0, 0);
  }
}
