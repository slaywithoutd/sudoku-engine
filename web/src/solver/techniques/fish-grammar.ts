import { matchingFacts } from "../state/source-index";
import type { ReadView } from "../state/types";
import type { Effect } from "../proof/types";
import { requireProof, sameValue } from "../proof/primitives";
import { findHouse, symbolMask } from "../state/read";

export interface FishComponent {
  readonly alias: string;
  readonly form: "basic" | "finned" | "sashimi" | "franken" | "mutant";
  readonly size: number;
  readonly symbol: number;
  readonly bases: readonly string[];
  readonly covers: readonly string[];
  readonly fins: readonly number[];
  readonly incidence?: readonly number[];
}
export interface SiameseFish {
  readonly alias: "Siamese fish";
  readonly size: number;
  readonly symbol: number;
  readonly components: readonly FishComponent[];
}
export type FishPattern = FishComponent | SiameseFish;
export interface FishRequirement {
  readonly pattern: FishComponent;
  readonly coefficients: readonly number[];
  readonly baseCounts: readonly number[];
  readonly effects: readonly Effect[];
}
export const fishNames: Readonly<Record<number, string>> = Object.freeze({
  2: "X-Wing",
  3: "Swordfish",
  4: "Jellyfish",
  5: "Squirmbag",
  6: "Whale",
  7: "Leviathan",
});
/** Geometry is reconstructed from real scopes; IDs alone confer no capability. */
export function fishHouse(view: ReadView, id: string): readonly number[] {
  const house = findHouse(view, id);
  requireProof(
    house &&
      house.cells.length === 9 &&
      view.assembly.problem.cells.length === 81 &&
      view.assembly.problem.symbols.length === 9,
    "fish-classic-scope",
  );
  const match = /^(row|column|box):([0-8])$/.exec(id);
  requireProof(match, "fish-house-id");
  const n = Number(match[2]),
    expected = Array.from({ length: 81 }, (_, cell) => cell).filter((cell) =>
      match[1] === "row"
        ? Math.floor(cell / 9) === n
        : match[1] === "column"
          ? cell % 9 === n
          : Math.floor(cell / 27) * 3 + Math.floor((cell % 9) / 3) === n,
    );
  requireProof(sameValue(house.cells, expected), "fish-house-geometry");
  return house.cells;
}
export function fishSees(view: ReadView, left: number, right: number): boolean {
  return (
    left !== right &&
    view.assembly.allDifferent.some(
      (house) => house.cells.includes(left) && house.cells.includes(right),
    )
  );
}
function fields(pattern: object, names: string[]) {
  requireProof(sameValue(Object.keys(pattern).sort(), names.sort()), "fish-pattern-fields");
}
function houseSet(value: readonly string[], size: number): void {
  requireProof(
    Array.isArray(value) &&
      value.length === size &&
      value.every((id, i) => typeof id === "string" && (!i || id > value[i - 1])),
    "fish-house-set",
  );
}
export function mixedFishForm(
  bases: readonly string[],
  covers: readonly string[],
): "franken" | "mutant" {
  const kinds = (ids: readonly string[]) => new Set(ids.map((id) => id.split(":")[0])),
    right = kinds(bases),
    coverKinds = kinds(covers);
  const oriented = (left: Set<string>, right: Set<string>) =>
    !left.has("column") && !right.has("row");
  return (right.has("box") || coverKinds.has("box")) &&
    (oriented(right, coverKinds) || oriented(coverKinds, right))
    ? "franken"
    : "mutant";
}
/** Independent named predicates plus exact incidence arithmetic, never discovery. */
export function validateFishGeometry(
  view: ReadView,
  component: FishComponent | undefined,
): FishRequirement {
  requireProof(
    component && typeof component === "object" && !Array.isArray(component),
    "fish-component",
  );
  const simple = ["basic", "finned", "sashimi"].includes(component.form),
    max = simple ? 7 : 4;
  fields(component, [
    "alias",
    "form",
    "size",
    "symbol",
    "bases",
    "covers",
    "fins",
    ...(simple ? [] : ["incidence"]),
  ]);
  requireProof(
    Number.isSafeInteger(component.size) &&
      component.size >= 2 &&
      component.size <= max &&
      view.assembly.problem.symbols.includes(component.symbol),
    "fish-size-symbol",
  );
  houseSet(component.bases, component.size);
  houseSet(component.covers, component.size);
  const bases = component.bases.map((id) => fishHouse(view, id)),
    covers = component.covers.map((id) => fishHouse(view, id));
  requireProof(
    bases.every((cells) =>
      matchingFacts(view, { kind: "cover", symbol: component.symbol, cells }).some(
        (fact) => !fact.openAssumptions.length,
      ),
    ),
    "fish-missing-base-cover",
  );
  const baseCounts = Array(81).fill(0) as number[],
    coverCounts = Array(81).fill(0) as number[];
  for (const cells of bases) for (const cell of cells) baseCounts[cell]++;
  for (const cells of covers) for (const cell of cells) coverCounts[cell]++;
  const coefficients = baseCounts.map((right, cell) => coverCounts[cell] - right),
    bit = symbolMask(component.symbol);
  const current = (cell: number) => !!(view.state.domains[cell] & bit);
  const fins = baseCounts.flatMap((right, cell) =>
    current(cell) && (right > 1 || (right > 0 && coverCounts[cell] === 0)) ? [cell] : [],
  );
  requireProof(sameValue(component.fins, fins) && fins.length <= 4, "fish-exact-fins");
  if (simple) {
    const right = component.bases[0].split(":")[0],
      coverKind = component.covers[0].split(":")[0];
    requireProof(
      ["row", "column"].includes(right) &&
        ["row", "column"].includes(coverKind) &&
        right !== coverKind &&
        component.bases.every((id) => id.startsWith(right + ":")) &&
        component.covers.every((id) => id.startsWith(coverKind + ":")),
      "fish-parallel-lines",
    );
    if (component.form === "basic")
      requireProof(
        !fins.length && component.alias === fishNames[component.size],
        "fish-basic-alias",
      );
    else {
      requireProof(
        fins.length > 0 &&
          new Set(fins.map((cell) => Math.floor(cell / 27) * 3 + Math.floor((cell % 9) / 3)))
            .size === 1,
        "fish-fin-box",
      );
      const sashimi = bases.some(
        (cells) => cells.filter((cell) => current(cell) && !fins.includes(cell)).length < 2,
      );
      requireProof(
        component.form === (sashimi ? "sashimi" : "finned") &&
          component.alias === (sashimi ? "Sashimi fish" : "Finned fish"),
        "fish-finned-alias",
      );
    }
  } else {
    // Mutant is the general arbitrary-house grammar. Franken is its more
    // specific box + opposite-line-orientation presentation (D079).
    requireProof(
      (component.form === "mutant" ||
        (component.form === "franken" &&
          mixedFishForm(component.bases, component.covers) === "franken")) &&
        sameValue(component.incidence, coefficients),
      "fish-mixed-incidence",
    );
    requireProof(
      [
        component.form === "franken" ? "Franken fish" : "Mutant fish",
        "Endo-fin fish",
        "Cannibalistic fish",
      ].includes(component.alias),
      "fish-mixed-alias",
    );
    if (component.alias === "Endo-fin fish")
      requireProof(
        fins.some((cell) => baseCounts[cell] > 1),
        "fish-missing-endofin",
      );
  }
  const effects = coefficients.flatMap((coefficient, cell) =>
    coefficient > 0 &&
    current(cell) &&
    !view.state.values[cell] &&
    (component.alias !== "Cannibalistic fish" || baseCounts[cell] > 0)
      ? [{ kind: "remove" as const, cell, symbol: component.symbol }]
      : [],
  );
  return { pattern: component, coefficients, baseCounts, effects };
}
/** Ordinary fish additionally requires direct target-to-fin visibility. */
export function validateFishComponent(view: ReadView, component: FishComponent): FishRequirement {
  const geometry = validateFishGeometry(view, component),
    effects = geometry.effects.filter((effect) =>
      component.fins.every((fin) => fishSees(view, effect.cell, fin)),
    );
  requireProof(effects.length > 0, "unproductive-fish");
  return { ...geometry, effects };
}
export function validateFishPattern(
  view: ReadView,
  pattern: FishPattern,
  technique: string,
  effects: readonly Effect[],
): readonly FishRequirement[] {
  let requirements: FishRequirement[];
  if (pattern.alias === "Siamese fish") {
    const pair = pattern as SiameseFish;
    fields(pair, ["alias", "size", "symbol", "components"]);
    requireProof(
      technique === "c09@1" && Array.isArray(pair.components) && pair.components.length === 2,
      "fish-siamese-pair",
    );
    requirements = pair.components.map((component) => validateFishComponent(view, component));
    const [left, right] = pair.components;
    requireProof(
      left.size === pair.size &&
        right.size === pair.size &&
        pair.size <= 4 &&
        left.symbol === pair.symbol &&
        right.symbol === pair.symbol &&
        sameValue(left.bases, right.bases) &&
        !sameValue(left.covers, right.covers) &&
        new Set([...left.fins, ...right.fins]).size <= 4,
      "fish-siamese-identity",
    );
  } else {
    const component = pattern as FishComponent;
    requireProof(
      technique === "c06@1"
        ? component.form === "basic"
        : technique === "c07@1"
          ? ["finned", "sashimi"].includes(component.form)
          : technique === "c08@1"
            ? ["Franken fish", "Mutant fish"].includes(pattern.alias)
            : technique === "c09@1" &&
              ["Endo-fin fish", "Cannibalistic fish"].includes(pattern.alias),
      "fish-technique-alias",
    );
    requirements = [validateFishComponent(view, component)];
  }
  const expected = [
    ...new Map(
      requirements
        .flatMap((requirement) => requirement.effects)
        .map((effect) => [effect.cell, effect]),
    ).values(),
  ].sort((left, right) => left.cell - right.cell);
  requireProof(
    sameValue(
      [...effects].sort((left, right) => left.cell - right.cell),
      expected,
    ),
    "fish-exact-effects",
  );
  return requirements;
}
