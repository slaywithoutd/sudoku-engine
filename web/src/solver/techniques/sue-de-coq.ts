import type { ReadView } from "../state/types";
import type { Effect } from "../proof/types";
import type { LocalSet, SdcPattern } from "./set-contracts";
import { combinations, setUnion } from "./set-certificate";
import { setDescriptor, type SetCursor } from "./set-runtime";

/** Extended two-sector allocation. Outside-V symbols are counted separately on
 * each side, even when equal; a V-symbol shared by the sides is forbidden. */
export function sdcAllocation(view: ReadView, intersection: number[], line: LocalSet, box: LocalSet): boolean {
  const v = setUnion(view, intersection), a = line.symbols, b = box.symbols;
  return v.length >= intersection.length + 2 && a.length === line.cells.length + 1 && b.length === box.cells.length + 1 &&
    new Set([...v, ...a, ...b]).size <= 9 && !v.some(s => a.includes(s) && b.includes(s)) &&
    line.cells.length + box.cells.length === v.length - intersection.length + a.filter(s => !v.includes(s)).length + b.filter(s => !v.includes(s)).length;
}

export class SueDeCoqSearch {
  constructor(readonly view: ReadView, readonly sets: readonly LocalSet[]) {}
  *patterns(intersectionSize: number, lineSize: number, boxSize: number): SetCursor {
    const view = this.view;
    const lines = view.assembly.allDifferent.filter(h => h.cells.length === 9 && (new Set(h.cells.map(c => Math.floor(c / 9))).size === 1 || new Set(h.cells.map(c => c % 9)).size === 1));
    const boxes = view.assembly.allDifferent.filter(h => h.cells.length === 9 && new Set(h.cells.map(c => Math.floor(c / 27) * 3 + Math.floor(c % 9 / 3))).size === 1);
    for (const line of lines) for (const box of boxes) {
      yield { kind: "work", units: 1 };
      const geometric = line.cells.filter(c => box.cells.includes(c)); if (geometric.length !== 3) continue;
      for (const intersection of combinations(geometric.filter(c => !view.state.values[c]), intersectionSize)) {
        yield { kind: "work", units: 1 };
        if (setUnion(view, intersection).length < intersectionSize + 2) continue;
        for (const a of this.sets) {
          yield { kind: "work", units: 1 };
          if (a.house !== line.id || a.cells.length !== lineSize || a.cells.some(c => intersection.includes(c))) continue;
          for (const b of this.sets) {
            yield { kind: "work", units: 1 };
            if (b.house !== box.id || b.cells.length !== boxSize || b.cells.some(c => intersection.includes(c) || a.cells.includes(c)) || !sdcAllocation(view, intersection, a, b)) continue;
            const cells = [...intersection, ...a.cells, ...b.cells].sort((x, y) => x - y), v = setUnion(view, intersection);
            const p: SdcPattern = { kind: "sdc", alias: "Sue de Coq", line: line.id, box: box.id, intersection, lineSide: a.cells, boxSide: b.cells,
              domains: cells.map(c => view.state.domains[c]), table: -1, routes: [] };
            const effects: Effect[] = [];
            for (const sector of ["line", "box"] as const) {
              const own = sector === "line" ? a : b, other = sector === "line" ? b : a, house = sector === "line" ? line : box;
              const local = [...intersection, ...own.cells].sort((x, y) => x - y);
              const symbols = [...new Set([...own.symbols, ...v.filter(s => !other.symbols.includes(s))])].sort((x, y) => x - y);
              for (const cell of house.cells) for (const symbol of symbols) {
                yield { kind: "work", units: 1 };
                if (local.includes(cell) || view.state.values[cell] || !(view.state.domains[cell] & (1 << (symbol - 1))) || effects.some(e => e.cell === cell && e.symbol === symbol)) continue;
                const occurrences = local.filter(c => view.state.domains[c] & (1 << (symbol - 1)));
                if (!occurrences.length) continue;
                effects.push({ kind: "remove", cell, symbol }); p.routes.push({ sector, occurrences, projection: -1, visibility: [], root: -1 });
              }
            }
            if (effects.length) yield { kind: "candidate", pattern: p, effects };
          }
        }
      }
    }
  }
}
export const sueDeCoqTechniques = Object.freeze([setDescriptor("C20", (view, _graph, sets) => {
  const search = new SueDeCoqSearch(view, sets);
  return [2, 3].flatMap(c => [1, 2, 3, 4].flatMap(a => [1, 2, 3, 4].map(b => search.patterns(c, a, b))));
})]);
