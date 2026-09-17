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
  const h = findHouse(view, id);
  requireProof(
    h &&
      h.cells.length === 9 &&
      view.assembly.problem.cells.length === 81 &&
      view.assembly.problem.symbols.length === 9,
    "fish-classic-scope",
  );
  const match = /^(row|column|box):([0-8])$/.exec(id);
  requireProof(match, "fish-house-id");
  const n = Number(match[2]),
    expected = Array.from({ length: 81 }, (_, c) => c).filter((c) =>
      match[1] === "row"
        ? Math.floor(c / 9) === n
        : match[1] === "column"
          ? c % 9 === n
          : Math.floor(c / 27) * 3 + Math.floor((c % 9) / 3) === n,
    );
  requireProof(sameValue(h.cells, expected), "fish-house-geometry");
  return h.cells;
}
export function fishSees(view: ReadView, a: number, b: number): boolean {
  return (
    a !== b && view.assembly.allDifferent.some((h) => h.cells.includes(a) && h.cells.includes(b))
  );
}
function fields(p: object, names: string[]) {
  requireProof(sameValue(Object.keys(p).sort(), names.sort()), "fish-pattern-fields");
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
    b = kinds(bases),
    c = kinds(covers);
  const oriented = (left: Set<string>, right: Set<string>) =>
    !left.has("column") && !right.has("row");
  return (b.has("box") || c.has("box")) && (oriented(b, c) || oriented(c, b))
    ? "franken"
    : "mutant";
}
/** Independent named predicates plus exact incidence arithmetic, never discovery. */
export function validateFishGeometry(view: ReadView, p: FishComponent): FishRequirement {
  requireProof(p && typeof p === "object" && !Array.isArray(p), "fish-component");
  const simple = ["basic", "finned", "sashimi"].includes(p.form),
    max = simple ? 7 : 4;
  fields(p, [
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
    Number.isSafeInteger(p.size) &&
      p.size >= 2 &&
      p.size <= max &&
      view.assembly.problem.symbols.includes(p.symbol),
    "fish-size-symbol",
  );
  houseSet(p.bases, p.size);
  houseSet(p.covers, p.size);
  const bases = p.bases.map((id) => fishHouse(view, id)),
    covers = p.covers.map((id) => fishHouse(view, id));
  requireProof(
    bases.every((cells) =>
      matchingFacts(view, { kind: "cover", symbol: p.symbol, cells }).some(
        (f) => !f.openAssumptions.length,
      ),
    ),
    "fish-missing-base-cover",
  );
  const baseCounts = Array(81).fill(0) as number[],
    coverCounts = Array(81).fill(0) as number[];
  for (const cells of bases) for (const c of cells) baseCounts[c]++;
  for (const cells of covers) for (const c of cells) coverCounts[c]++;
  const coefficients = baseCounts.map((b, c) => coverCounts[c] - b),
    bit = symbolMask(p.symbol);
  const current = (c: number) => !!(view.state.domains[c] & bit);
  const fins = baseCounts.flatMap((b, c) =>
    current(c) && (b > 1 || (b > 0 && coverCounts[c] === 0)) ? [c] : [],
  );
  requireProof(sameValue(p.fins, fins) && fins.length <= 4, "fish-exact-fins");
  if (simple) {
    const b = p.bases[0].split(":")[0],
      c = p.covers[0].split(":")[0];
    requireProof(
      ["row", "column"].includes(b) &&
        ["row", "column"].includes(c) &&
        b !== c &&
        p.bases.every((id) => id.startsWith(b + ":")) &&
        p.covers.every((id) => id.startsWith(c + ":")),
      "fish-parallel-lines",
    );
    if (p.form === "basic")
      requireProof(!fins.length && p.alias === fishNames[p.size], "fish-basic-alias");
    else {
      requireProof(
        fins.length > 0 &&
          new Set(fins.map((c) => Math.floor(c / 27) * 3 + Math.floor((c % 9) / 3))).size === 1,
        "fish-fin-box",
      );
      const sashimi = bases.some(
        (cells) => cells.filter((c) => current(c) && !fins.includes(c)).length < 2,
      );
      requireProof(
        p.form === (sashimi ? "sashimi" : "finned") &&
          p.alias === (sashimi ? "Sashimi fish" : "Finned fish"),
        "fish-finned-alias",
      );
    }
  } else {
    // Mutant is the general arbitrary-house grammar. Franken is its more
    // specific box + opposite-line-orientation presentation (D079).
    requireProof(
      (p.form === "mutant" ||
        (p.form === "franken" && mixedFishForm(p.bases, p.covers) === "franken")) &&
        sameValue(p.incidence, coefficients),
      "fish-mixed-incidence",
    );
    requireProof(
      [
        p.form === "franken" ? "Franken fish" : "Mutant fish",
        "Endo-fin fish",
        "Cannibalistic fish",
      ].includes(p.alias),
      "fish-mixed-alias",
    );
    if (p.alias === "Endo-fin fish")
      requireProof(
        fins.some((c) => baseCounts[c] > 1),
        "fish-missing-endofin",
      );
  }
  const effects = coefficients.flatMap((coefficient, cell) =>
    coefficient > 0 &&
    current(cell) &&
    !view.state.values[cell] &&
    (p.alias !== "Cannibalistic fish" || baseCounts[cell] > 0)
      ? [{ kind: "remove" as const, cell, symbol: p.symbol }]
      : [],
  );
  return { pattern: p, coefficients, baseCounts, effects };
}
/** Ordinary fish additionally requires direct target-to-fin visibility. */
export function validateFishComponent(view: ReadView, p: FishComponent): FishRequirement {
  const geometry = validateFishGeometry(view, p),
    effects = geometry.effects.filter((e) => p.fins.every((fin) => fishSees(view, e.cell, fin)));
  requireProof(effects.length > 0, "unproductive-fish");
  return { ...geometry, effects };
}
export function validateFishPattern(
  view: ReadView,
  p: FishPattern,
  technique: string,
  effects: readonly Effect[],
): readonly FishRequirement[] {
  let requirements: FishRequirement[];
  if (p.alias === "Siamese fish") {
    const pair = p as SiameseFish;
    fields(pair, ["alias", "size", "symbol", "components"]);
    requireProof(
      technique === "c09@1" && Array.isArray(pair.components) && pair.components.length === 2,
      "fish-siamese-pair",
    );
    requirements = pair.components.map((c) => validateFishComponent(view, c));
    const [a, b] = pair.components;
    requireProof(
      a.size === pair.size &&
        b.size === pair.size &&
        pair.size <= 4 &&
        a.symbol === pair.symbol &&
        b.symbol === pair.symbol &&
        sameValue(a.bases, b.bases) &&
        !sameValue(a.covers, b.covers) &&
        new Set([...a.fins, ...b.fins]).size <= 4,
      "fish-siamese-identity",
    );
  } else {
    const component = p as FishComponent;
    requireProof(
      technique === "c06@1"
        ? component.form === "basic"
        : technique === "c07@1"
          ? ["finned", "sashimi"].includes(component.form)
          : technique === "c08@1"
            ? ["Franken fish", "Mutant fish"].includes(p.alias)
            : technique === "c09@1" && ["Endo-fin fish", "Cannibalistic fish"].includes(p.alias),
      "fish-technique-alias",
    );
    requirements = [validateFishComponent(view, component)];
  }
  const expected = [
    ...new Map(requirements.flatMap((r) => r.effects).map((e) => [e.cell, e])).values(),
  ].sort((a, b) => a.cell - b.cell);
  requireProof(
    sameValue(
      [...effects].sort((a, b) => a.cell - b.cell),
      expected,
    ),
    "fish-exact-effects",
  );
  return requirements;
}
