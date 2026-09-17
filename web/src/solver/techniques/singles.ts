import { CertificateBuilder, literal } from "../proof/builder";
import type { ReadView } from "../state/types";
import type { Discovery } from "./types";
import { hasSingleCandidate, symbolMask } from "../state/read";

/** One canonical cursor over cells. Every alias has its own validated presentation. */
export class NakedSingles {
  *discover(view: ReadView): Discovery {
    for (const cell of view.assembly.problem.cells) {
      yield { kind: "work", units: 1 };
      const mask = view.state.domains[cell];
      if (view.state.values[cell] || !hasSingleCandidate(mask)) continue;
      const symbol = Math.log2(mask) + 1;
      const houses = view.assembly.allDifferent.filter(
        (house) =>
          house.cells.length === view.assembly.problem.symbols.length &&
          house.cells.includes(cell) &&
          house.cells.filter((c) => !view.state.values[c]).length === 1,
      );
      const aliases = [
        { alias: "Naked Single", house: null as string | null },
        ...houses.flatMap((house) => [
          { alias: "Full House", house: house.id },
          { alias: "Last Digit", house: house.id },
        ]),
      ];
      for (const { alias, house } of aliases) {
        yield { kind: "work", units: 1 };
        const builder = new CertificateBuilder(view);
        const root = builder.add(
          "cover-clause@1",
          [view.state.domainFacts[cell]],
          literal(cell, symbol, true),
        );
        builder.place(cell, symbol, root);
        yield {
          kind: "proposal",
          proposal: builder.finish("c01@1", { kind: "single", alias, cell, symbol, house }),
        };
      }
    }
    yield { kind: "exhausted" };
  }
}

/** Complete proved symbol covers only; small all-different cages confer no existence. */
export class HiddenSingles {
  *discover(view: ReadView): Discovery {
    for (const cover of view.assembly.covers) {
      yield { kind: "work", units: 1 };
      const cells = cover.cells.filter(
        (cell) => (view.state.domains[cell] & symbolMask(cover.symbol)) !== 0,
      );
      if (cells.length !== 1 || view.state.values[cells[0]]) continue;
      const builder = new CertificateBuilder(view),
        cell = cells[0];
      const support = builder.support(cover.symbol, cover.cells);
      const root = builder.add("cover-clause@1", [support], literal(cell, cover.symbol, true));
      builder.place(cell, cover.symbol, root);
      yield {
        kind: "proposal",
        proposal: builder.finish("c02@1", {
          kind: "hidden-single",
          alias: "Hidden Single",
          cover: cover.id,
          cell,
          symbol: cover.symbol,
        }),
      };
    }
    yield { kind: "exhausted" };
  }
}
