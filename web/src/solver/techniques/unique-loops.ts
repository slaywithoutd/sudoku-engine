import type { ReadView } from "../state/types";
import { uniqueCombinations, uniqueGeometry, type UniqueGeometryCursor } from "./unique-rectangles";
import { symbolMask } from "../state/read";
import { defined } from "../invariants";

/** Increasing even length; smallest cell first; reverse traversals are canonicalized. */
export class UniqueLoops {
  *geometries(view: ReadView): UniqueGeometryCursor {
    for (let length = 4; length <= 12; length += 2)
      for (const core of uniqueCombinations(view.assembly.problem.symbols, 2)) {
        const mask = core.reduce((bits, symbol) => bits | symbolMask(symbol), 0),
          candidates = view.assembly.problem.cells.filter(
            (cell) => !view.state.values[cell] && (view.state.domains[cell] & mask) === mask,
          );
        const houses = view.assembly.allDifferent;
        for (const first of candidates) {
          const path = [first];
          function* visit(): UniqueGeometryCursor {
            yield { kind: "work", units: 1 };
            if (path.length === length) {
              if (
                path[1] > defined(path.at(-1), "path") ||
                !houses.some(
                  (house) =>
                    house.cells.includes(first) &&
                    house.cells.includes(defined(path.at(-1), "path")),
                )
              )
                return;
              for (const house of houses) {
                const touched = house.cells.filter((cell) => path.includes(cell));
                if (
                  touched.length &&
                  (touched.length !== 2 ||
                    path.indexOf(touched[0]) % 2 === path.indexOf(touched[1]) % 2)
                )
                  return;
              }
              const cells = [...path].sort((left, right) => left - right),
                geometry = uniqueGeometry(
                  view,
                  "U03",
                  "loop",
                  cells,
                  cells.map(() => mask),
                );
              if (geometry.guardians.length >= 1 && geometry.guardians.length <= 4)
                yield { kind: "geometry", geometry: { ...geometry, loopOrder: [...path] } };
              return;
            }
            for (const next of candidates) {
              yield { kind: "work", units: 1 };
              if (
                next <= first ||
                path.includes(next) ||
                !houses.some(
                  (house) =>
                    house.cells.includes(next) &&
                    house.cells.includes(defined(path.at(-1), "path")),
                )
              )
                continue;
              if (
                houses.some(
                  (house) =>
                    house.cells.includes(next) &&
                    path.filter((cell) => house.cells.includes(cell)).length >= 2,
                )
              )
                continue;
              path.push(next);
              yield* visit();
              path.pop();
            }
          }
          yield* visit();
        }
      }
  }
}
