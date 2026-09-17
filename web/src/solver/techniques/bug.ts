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
  *geometries(view: ReadView, row: "U04" | "U05"): UniqueGeometryCursor {
    const cells = view.assembly.problem.cells.filter((c) => !view.state.values[c]),
      masks: number[] = [],
      maximum = row === "U04" ? 1 : 4;
    if (cells.length < 4) return;
    const minimumExtras = cells.reduce(
      (n, c) => n + Math.max(0, uniqueSymbols(view.state.domains[c]).length - 2),
      0,
    );
    if (
      minimumExtras > maximum ||
      cells.some((c) => uniqueSymbols(view.state.domains[c]).length < 2)
    )
      return;
    function* visit(index: number, extras: number): UniqueGeometryCursor {
      yield { kind: "work", units: 1 };
      if (index === cells.length) {
        if (extras < (row === "U04" ? 1 : 2) || extras > maximum) return;
        for (const h of view.assembly.allDifferent)
          for (const symbol of view.assembly.problem.symbols) {
            const count = cells.filter(
              (c, i) => h.cells.includes(c) && masks[i] & symbolMask(symbol),
            ).length;
            if (count !== 0 && count !== 2) return;
          }
        yield { kind: "geometry", geometry: uniqueGeometry(view, row, "bug", cells, masks) };
        return;
      }
      const values = uniqueSymbols(view.state.domains[cells[index]]),
        nextExtras = extras + values.length - 2;
      if (nextExtras > maximum) return;
      for (const pair of uniqueCombinations(values, 2)) {
        yield { kind: "work", units: 1 };
        masks.push(pair.reduce((m, s) => m | symbolMask(s), 0));
        if (
          !view.assembly.allDifferent.some((h) =>
            pair.some(
              (symbol) =>
                cells
                  .slice(0, index + 1)
                  .filter((c, i) => h.cells.includes(c) && masks[i] & symbolMask(symbol)).length >
                2,
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
