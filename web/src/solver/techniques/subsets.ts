import { CertificateBuilder, literal } from "../proof/builder";
import type { ReadView } from "../state/types";
import type { Discovery } from "./types";
import { symbolMask } from "../state/read";

/** Lexicographic finite combination cursor; no per-combination scheduler jobs. */
function* combinations(
  values: readonly number[],
  size: number,
  prefix: number[] = [],
  start = 0,
): Generator<number[]> {
  if (prefix.length === size) {
    yield prefix;
    return;
  }
  for (let i = start; i <= values.length - (size - prefix.length); i++)
    yield* combinations(values, size, [...prefix, values[i]], i + 1);
}
function symbols(view: ReadView, mask: number) {
  return view.assembly.problem.symbols.filter((symbol) => mask & symbolMask(symbol));
}
const names: Record<number, string> = { 2: "Pair", 3: "Triple", 4: "Quad" };
const complements: Record<number, string> = {
  5: "complementary quintuple",
  6: "complementary sextuple",
  7: "complementary septuple",
};

/** Hall certificates for direct small subsets and their explicitly named complements. */
export class Subsets {
  *discover(view: ReadView): Discovery {
    for (const house of view.assembly.allDifferent)
      for (const size of [2, 3, 4]) {
        const unresolved = house.cells.filter((cell) => !view.state.values[cell]);
        for (const cells of combinations(unresolved, size)) {
          yield { kind: "work", units: 1 };
          const union = cells.reduce((mask, cell) => mask | view.state.domains[cell], 0),
            digits = symbols(view, union);
          if (digits.length !== size || cells.some((cell) => !view.state.domains[cell])) continue;
          yield* this.propose(view, house, cells, digits, "naked");
        }
        if (house.cells.length !== view.assembly.problem.symbols.length) continue;
        for (const digits of combinations(view.assembly.problem.symbols, size)) {
          yield { kind: "work", units: 1 };
          if (digits.some((digit) => house.cells.some((cell) => view.state.values[cell] === digit)))
            continue;
          const mask = digits.reduce((bits, digit) => bits | symbolMask(digit), 0);
          const cells = house.cells.filter((cell) => view.state.domains[cell] & mask);
          if (
            cells.length !== size ||
            digits.some(
              (digit) => !cells.some((cell) => view.state.domains[cell] & symbolMask(digit)),
            )
          )
            continue;
          yield* this.propose(view, house, cells, digits, "hidden");
        }
      }
    yield { kind: "exhausted" };
  }
  private *propose(
    view: ReadView,
    house: { id: string; cells: readonly number[] },
    cells: number[],
    digits: number[],
    form: "naked" | "hidden",
  ): Discovery {
    const selected = form === "naked" ? cells : house.cells.filter((cell) => !cells.includes(cell));
    const mask = selected.reduce((bits, cell) => bits | view.state.domains[cell], 0);
    if (symbols(view, mask).length !== selected.length) return;
    const targets =
      form === "naked"
        ? house.cells.filter((cell) => !cells.includes(cell) && !view.state.values[cell])
        : cells;
    const effects = targets.flatMap((cell) =>
      symbols(view, view.state.domains[cell] & mask).map((symbol) => ({
        kind: "remove" as const,
        cell,
        symbol,
      })),
    );
    if (!effects.length) return;
    const aliases = [
      {
        alias: `${form === "naked" ? "Naked" : "Hidden"} ${names[cells.length]}`,
        complement: null as number | null,
      },
    ];
    if (house.cells.length === 9)
      aliases.push({ alias: complements[9 - cells.length], complement: 9 - cells.length });
    for (const { alias, complement } of aliases) {
      yield { kind: "work", units: 1 };
      const builder = new CertificateBuilder(view);
      for (const effect of effects)
        builder.effect(
          effect,
          builder.add(
            "hall@1",
            [
              builder.fact({ kind: "all-different", cells: house.cells }),
              ...selected.map((cell) => view.state.domainFacts[cell]),
            ],
            literal(effect.cell, effect.symbol, false),
          ),
        );
      yield {
        kind: "proposal",
        proposal: builder.finish("c04@1", {
          kind: "subset",
          alias,
          form,
          house: house.id,
          cells,
          symbols: digits,
          complement,
        }),
      };
    }
  }
}

/** Combines separately proved Hall roots for both intersecting houses. */
export class LockedSubsets {
  *discover(view: ReadView): Discovery {
    for (const box of view.assembly.allDifferent.filter((house) => house.id.startsWith("box:")))
      for (const line of view.assembly.allDifferent.filter(
        (house) => house.id.startsWith("row:") || house.id.startsWith("column:"),
      ))
        for (const size of [2, 3])
          for (const cells of combinations(
            box.cells.filter((cell) => line.cells.includes(cell) && !view.state.values[cell]),
            size,
          )) {
            yield { kind: "work", units: 1 };
            const union = cells.reduce((mask, cell) => mask | view.state.domains[cell], 0),
              digits = symbols(view, union);
            if (digits.length !== size || cells.some((cell) => !view.state.domains[cell])) continue;
            const houses = [box, line].sort((left, right) => left.id.localeCompare(right.id));
            const perHouse = houses.map((house) =>
              house.cells
                .filter((cell) => !cells.includes(cell) && !view.state.values[cell])
                .flatMap((cell) =>
                  symbols(view, view.state.domains[cell] & union).map((symbol) => ({
                    kind: "remove" as const,
                    cell,
                    symbol,
                  })),
                ),
            );
            if (perHouse.some((effect) => !effect.length)) continue;
            const builder = new CertificateBuilder(view);
            for (const [index, effects] of perHouse.entries())
              for (const effect of effects)
                builder.effect(
                  effect,
                  builder.add(
                    "hall@1",
                    [
                      builder.fact({ kind: "all-different", cells: houses[index].cells }),
                      ...cells.map((cell) => view.state.domainFacts[cell]),
                    ],
                    literal(effect.cell, effect.symbol, false),
                  ),
                );
            yield {
              kind: "proposal",
              proposal: builder.finish("c05@1", {
                kind: "locked-subset",
                alias: `Locked ${names[size]}`,
                houses: houses.map((house) => house.id),
                cells,
                symbols: digits,
              }),
            };
          }
    yield { kind: "exhausted" };
  }
}
