import type { ReadView } from "../state/types";
import { uniqueCombinations, uniqueGeometry, type UniqueGeometryCursor } from "./unique-rectangles";
import { symbolMask } from "../state/read";

/** Increasing even length; smallest cell first; reverse traversals are canonicalized. */
export class UniqueLoops {
  *geometries(view: ReadView): UniqueGeometryCursor {
    for (let length = 4; length <= 12; length += 2)
      for (const core of uniqueCombinations(view.assembly.problem.symbols, 2)) {
        const mask = core.reduce((m, s) => m | symbolMask(s), 0),
          candidates = view.assembly.problem.cells.filter(
            (c) => !view.state.values[c] && (view.state.domains[c] & mask) === mask,
          );
        const houses = view.assembly.allDifferent;
        for (const first of candidates) {
          const path = [first];
          function* visit(): UniqueGeometryCursor {
            yield { kind: "work", units: 1 };
            if (path.length === length) {
              if (
                path[1] > path.at(-1)! ||
                !houses.some((h) => h.cells.includes(first) && h.cells.includes(path.at(-1)!))
              )
                return;
              for (const h of houses) {
                const touched = h.cells.filter((c) => path.includes(c));
                if (
                  touched.length &&
                  (touched.length !== 2 ||
                    path.indexOf(touched[0]) % 2 === path.indexOf(touched[1]) % 2)
                )
                  return;
              }
              const cells = [...path].sort((a, b) => a - b),
                g = uniqueGeometry(
                  view,
                  "U03",
                  "loop",
                  cells,
                  cells.map(() => mask),
                );
              if (g.guardians.length >= 1 && g.guardians.length <= 4)
                yield { kind: "geometry", geometry: { ...g, loopOrder: [...path] } };
              return;
            }
            for (const next of candidates) {
              yield { kind: "work", units: 1 };
              if (
                next <= first ||
                path.includes(next) ||
                !houses.some((h) => h.cells.includes(next) && h.cells.includes(path.at(-1)!))
              )
                continue;
              if (
                houses.some(
                  (h) =>
                    h.cells.includes(next) && path.filter((c) => h.cells.includes(c)).length >= 2,
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
