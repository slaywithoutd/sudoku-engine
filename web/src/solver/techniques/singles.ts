import { CertificateBuilder, literal } from "../proof/builder";
import type { ReadView } from "../state/types";
import type { Discovery } from "./types";

/** One canonical cursor over cells. Every alias has its own validated presentation. */
export class NakedSingles {
  *discover(view: ReadView): Discovery {
    for (const cell of view.assembly.problem.cells) {
      yield { kind: "work", units: 1 };
      const mask = view.state.domains[cell];
      if (view.state.values[cell] || !mask || (mask & (mask-1))) continue;
      const symbol = Math.log2(mask)+1;
      const houses = view.assembly.allDifferent.filter(h => h.cells.length === view.assembly.problem.symbols.length &&
        h.cells.includes(cell) && h.cells.filter(c => !view.state.values[c]).length === 1);
      const aliases = [{ alias: "Naked Single", house: null as string | null },
        ...houses.flatMap(h => [{ alias: "Full House", house: h.id }, { alias: "Last Digit", house: h.id }])];
      for (const { alias, house } of aliases) {
        yield { kind: "work", units: 1 };
        const builder = new CertificateBuilder(view);
        const root = builder.add("cover-clause@1", [view.state.domainFacts[cell]], literal(cell, symbol, true));
        builder.place(cell, symbol, root);
        yield { kind: "proposal", proposal: builder.finish("c01@1", { kind: "single", alias, cell, symbol, house }) };
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
      const cells = cover.cells.filter(cell => (view.state.domains[cell] & (1 << (cover.symbol-1))) !== 0);
      if (cells.length !== 1 || view.state.values[cells[0]]) continue;
      const builder = new CertificateBuilder(view), cell = cells[0];
      const support = builder.support(cover.symbol, cover.cells);
      const root = builder.add("cover-clause@1", [support], literal(cell, cover.symbol, true));
      builder.place(cell, cover.symbol, root);
      yield { kind: "proposal", proposal: builder.finish("c02@1", { kind: "hidden-single", alias: "Hidden Single",
        cover: cover.id, cell, symbol: cover.symbol }) };
    }
    yield { kind: "exhausted" };
  }
}
