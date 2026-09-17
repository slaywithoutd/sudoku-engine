import { CertificateBuilder, proposedClause } from "../proof/builder";
import type { ReadView } from "../state/types";
import type { Discovery } from "./types";
import { symbolMask } from "../state/read";

/** Canonical cover/group/symbol intersections; single support belongs to C02. */
export class LockedCandidates {
  *discover(view: ReadView): Discovery {
    for (const cover of view.assembly.covers)
      for (const group of view.assembly.allDifferent) {
        yield { kind: "work", units: 1 };
        const intersection = cover.cells.filter((cell) => group.cells.includes(cell));
        if (
          !intersection.length ||
          intersection.length === cover.cells.length ||
          intersection.length === group.cells.length
        )
          continue;
        const cells = cover.cells.filter(
          (cell) => view.state.domains[cell] & symbolMask(cover.symbol),
        );
        if (
          cells.length < 2 ||
          cells.length > 3 ||
          cells.some((cell) => !intersection.includes(cell))
        )
          continue;
        const targets = group.cells.filter(
          (cell) =>
            !cover.cells.includes(cell) &&
            !view.state.values[cell] &&
            view.state.domains[cell] & symbolMask(cover.symbol),
        );
        if (!targets.length) continue;
        const primary = cover.id.startsWith("box:")
          ? "pointing"
          : group.id.startsWith("box:")
            ? "claiming"
            : null;
        for (const alias of [...(primary ? [primary] : []), "Locked Candidates", "direct forms"]) {
          const builder = new CertificateBuilder(view),
            support = builder.support(cover.symbol, cover.cells);
          const initial = builder.add(
            "cover-clause@1",
            [support],
            proposedClause(cells.map((cell) => ({ cell, symbol: cover.symbol, positive: true }))),
          );
          for (const cell of targets) {
            yield { kind: "work", units: 1 };
            let root = initial;
            for (const [index, source] of cells.entries()) {
              const weak = builder.add(
                "weak-link@1",
                [builder.fact({ kind: "all-different", cells: group.cells })],
                proposedClause([
                  { cell: source, symbol: cover.symbol, positive: false },
                  { cell, symbol: cover.symbol, positive: false },
                ]),
              );
              root = builder.add(
                "resolution@1",
                [root, weak],
                proposedClause([
                  ...cells
                    .slice(index + 1)
                    .map((other) => ({ cell: other, symbol: cover.symbol, positive: true })),
                  { cell, symbol: cover.symbol, positive: false },
                ]),
              );
            }
            builder.effect({ kind: "remove", cell, symbol: cover.symbol }, root);
          }
          yield {
            kind: "proposal",
            proposal: builder.finish("c03@1", {
              kind: "intersection",
              alias,
              cover: cover.id,
              group: group.id,
              symbol: cover.symbol,
              cells,
            }),
          };
        }
      }
    yield { kind: "exhausted" };
  }
}
