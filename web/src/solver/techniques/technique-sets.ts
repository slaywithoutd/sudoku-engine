/**
 * Technique sets (M2.7, D105; design: docs/specs/2026-11-10-technique-set-semantics.md).
 *
 * Kept free of runtime imports, as `profiles.ts` is, so identity code
 * (`schedulingOptions`), settings validation and the Solve screen can name
 * rows and presets without loading the 8,000-line technique manifest. A test
 * pins every row's id, tier and profile membership against the manifest.
 *
 * Three layers own one rule each:
 * - identity (`scheduling/work.ts`): the canonical `techniques` option, strict;
 * - resolution (here): a preset id or a list of switched-off ids, resolved
 *   to the enabled ids of one profile;
 * - run input and worker request: carry the selection to `solveProblem`.
 */
import type { ProfileId } from "./profiles";

export interface TechniqueRow {
  /** Coverage id (`CoverageEntry.id`): the unit a user switches on or off. */
  readonly id: string;
  /** Catalogue tier (`CoverageEntry.tier`). */
  readonly tier: number;
  /** One label per family, for the selector (variant names stay in the step list). */
  readonly label: string;
  /** Which profiles hold the row: every profile, conditional ones, or variant ones. */
  readonly kind: "primary" | "conditional" | "variant";
}

/** Every catalogue row in catalogue order. Pinned against the manifest by test. */
export const TECHNIQUE_ROWS: readonly TechniqueRow[] = Object.freeze(
  (
    [
      ["C01", 0, "Naked single and full house", "primary"],
      ["C02", 0, "Hidden single", "primary"],
      ["C03", 0, "Locked candidates", "primary"],
      ["C04", 1, "Naked and hidden subsets", "primary"],
      ["C05", 1, "Locked pair and triple", "primary"],
      ["C06", 2, "Basic fish (X-Wing, Swordfish, Jellyfish)", "primary"],
      ["C07", 4, "Finned and sashimi fish", "primary"],
      ["C08", 4, "Franken and mutant fish", "primary"],
      ["C09", 4, "Endo-fin, cannibalistic and Siamese fish", "primary"],
      ["C10", 2, "Skyscraper, Two-String Kite, Turbot Fish, Empty Rectangle", "primary"],
      ["C11", 2, "XY-, XYZ- and W-Wing", "primary"],
      ["C12", 4, "WXYZ-Wing", "primary"],
      ["C13", 2, "Remote pairs", "primary"],
      ["C14", 3, "Colouring", "primary"],
      ["C15", 3, "3D Medusa", "primary"],
      ["C16", 4, "X-, XY-chains and AICs", "primary"],
      ["C17", 4, "Nice loops and grouped AICs", "primary"],
      ["C18", 4, "ALS-XZ and ALS-XY-Wing", "primary"],
      ["C19", 4, "ALS chains and Death Blossom", "primary"],
      ["C20", 5, "Sue de Coq", "primary"],
      ["C21", 5, "Aligned exclusion", "primary"],
      ["C22", 6, "Forcing chains", "primary"],
      ["C23", 6, "Forcing nets", "primary"],
      ["C24", 6, "Kraken fish", "primary"],
      ["C25", 6, "Bivalue chains", "primary"],
      ["C26", 6, "t-whips", "primary"],
      ["C27", 6, "Braids", "primary"],
      ["C28", 6, "OR-k forcing", "primary"],
      ["C29", 5, "Fireworks", "primary"],
      ["C30", 5, "SK loops", "primary"],
      ["C31", 5, "Exocet", "primary"],
      ["C32", 5, "Tridagon", "primary"],
      ["C33", 5, "Per-digit templates", "primary"],
      ["U01", 6, "Unique rectangles", "conditional"],
      ["U02", 6, "Hidden, avoidable and extended rectangles", "conditional"],
      ["U03", 6, "Unique loops", "conditional"],
      ["U04", 6, "BUG and BUG+1", "conditional"],
      ["U05", 6, "Generalized BUG", "conditional"],
      ["K01", 1, "Killer combinations", "variant"],
      ["K02", 2, "Innies and outies", "variant"],
    ] as const
  ).map(([id, tier, label, kind]) => Object.freeze({ id, tier, label, kind })),
);

const ROWS_BY_ID = new Map(TECHNIQUE_ROWS.map((row) => [row.id, row] as const));

export function techniqueRow(id: string): TechniqueRow | undefined {
  return ROWS_BY_ID.get(id);
}

/** Code-unit order, the order of the canonical key (`compareText` in the ledger). */
export function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** The rows a profile runs, in catalogue order (the registry's order). */
export function profileRowIds(profile: ProfileId): readonly string[] {
  const conditional = profile.endsWith("conditional@1"),
    variant = profile.startsWith("variants-");
  return Object.freeze(
    TECHNIQUE_ROWS.filter(
      (row) =>
        row.kind === "primary" ||
        (row.kind === "conditional" && conditional) ||
        (row.kind === "variant" && variant),
    ).map((row) => row.id),
  );
}

/**
 * Shipped presets (S1 note §5.4, D105 item 3). A preset is a rule over a
 * profile's rows, so one preset has a meaning on every profile; its name is
 * never part of a run's identity. A change of membership on any profile is a
 * new version (`name@n`); a change of label is not.
 */
export interface TechniquePreset {
  readonly id: string;
  readonly label: string;
  readonly includes: (row: TechniqueRow) => boolean;
}
const NO_FISH = new Set(["C06", "C07", "C08", "C09", "C24"]);
const SINGLES = new Set(["C01", "C02"]);
export const TECHNIQUE_PRESETS: readonly TechniquePreset[] = Object.freeze([
  Object.freeze({ id: "all@1", label: "All", includes: () => true }),
  Object.freeze({
    id: "singles@1",
    label: "Singles only",
    includes: (row: TechniqueRow) => SINGLES.has(row.id),
  }),
  Object.freeze({
    id: "up-to-subsets@1",
    label: "Up to subsets",
    includes: (row: TechniqueRow) => row.tier <= 1,
  }),
  Object.freeze({
    id: "up-to-wings-fish@1",
    label: "Up to wings and fish",
    includes: (row: TechniqueRow) => row.tier <= 2,
  }),
  Object.freeze({
    id: "no-fish@1",
    label: "No fish",
    includes: (row: TechniqueRow) => !NO_FISH.has(row.id),
  }),
]);
export const DEFAULT_TECHNIQUE_PRESET = "all@1";
export const TECHNIQUE_PRESET_IDS: readonly string[] = Object.freeze(
  TECHNIQUE_PRESETS.map((preset) => preset.id),
);

/**
 * Preset ids of earlier versions, mapped to the current version of the same
 * name (D105 item 5: a stored choice follows its name). None exists yet; a
 * future `no-fish@2` adds `"no-fish@1": "no-fish@2"` here.
 */
export const RETIRED_TECHNIQUE_PRESETS: Readonly<Record<string, string>> = Object.freeze({});

export function currentPresetId(id: string): string {
  return Object.hasOwn(RETIRED_TECHNIQUE_PRESETS, id) ? RETIRED_TECHNIQUE_PRESETS[id] : id;
}

/** What a run input or a worker request carries: a preset, or a custom set's switched-off ids. */
export type TechniqueSelection = { readonly preset: string } | { readonly off: readonly string[] };

export class TechniqueSetError extends Error {
  constructor(readonly code: "unknown-technique" | "invalid-technique-set") {
    super(code);
  }
}

function strings(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > TECHNIQUE_ROWS.length * 2)
    throw new TechniqueSetError("invalid-technique-set");
  for (const item of value)
    if (typeof item !== "string") throw new TechniqueSetError("invalid-technique-set");
  if (new Set(value).size !== value.length) throw new TechniqueSetError("invalid-technique-set");
  return value as readonly string[];
}

/**
 * The enabled coverage ids of `profile` for a selection, in catalogue order,
 * or `undefined` for no selection. Untrusted input is shape-checked here:
 * a malformed selection or an unknown preset is `invalid-technique-set`, a
 * switched-off id that is no catalogue row is `unknown-technique`. A
 * catalogue row outside this profile (a U row under `classic-expanded@1`) is
 * ignored, since that row is not in the run anyway. Never falls back to the
 * full set.
 */
export function resolveTechniqueSet(
  profile: ProfileId,
  selection: unknown,
): readonly string[] | undefined {
  if (selection === undefined) return undefined;
  if (!selection || typeof selection !== "object" || Array.isArray(selection))
    throw new TechniqueSetError("invalid-technique-set");
  const record = selection as Record<string, unknown>,
    keys = Object.keys(record);
  const rows = profileRowIds(profile);
  if (keys.length === 1 && keys[0] === "preset") {
    const id = typeof record.preset === "string" ? currentPresetId(record.preset) : undefined;
    const preset = TECHNIQUE_PRESETS.find((item) => item.id === id);
    if (!preset) throw new TechniqueSetError("invalid-technique-set");
    return Object.freeze(
      rows.filter((row) => preset.includes(ROWS_BY_ID.get(row) as TechniqueRow)),
    );
  }
  if (keys.length === 1 && keys[0] === "off") {
    const off = strings(record.off);
    for (const id of off) if (!ROWS_BY_ID.has(id)) throw new TechniqueSetError("unknown-technique");
    const switchedOff = new Set(off);
    return Object.freeze(rows.filter((row) => !switchedOff.has(row)));
  }
  throw new TechniqueSetError("invalid-technique-set");
}

/**
 * The canonical `techniques` option (S1 note §5.3) for a profile: sorted by
 * code unit, `undefined` for the full set so the default key is unchanged.
 * Throws `invalid-technique-set` for a malformed list and
 * `unknown-technique` for an id that is not a row of the profile.
 */
export function canonicalTechniques(
  profile: ProfileId,
  techniques: unknown,
): readonly string[] | undefined {
  if (techniques === undefined) return undefined;
  const list = strings(techniques);
  const rows = new Set(profileRowIds(profile));
  for (const id of list) if (!rows.has(id)) throw new TechniqueSetError("unknown-technique");
  const sorted = [...list].sort(compareIds);
  if (sorted.length === rows.size) return undefined;
  return Object.freeze(sorted);
}

/** Lowest tier among a profile's rows outside an enabled set; `undefined` for the full set. */
export function lowestTierOff(
  profile: ProfileId,
  enabled: readonly string[] | undefined,
): number | undefined {
  if (!enabled) return undefined;
  const on = new Set(enabled);
  const tiers = profileRowIds(profile)
    .filter((id) => !on.has(id))
    .map((id) => (ROWS_BY_ID.get(id) as TechniqueRow).tier);
  return tiers.length ? Math.min(...tiers) : undefined;
}
