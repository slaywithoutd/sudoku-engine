import type { VersionId } from "../problem";
import type { ReadView } from "../state/types";
import type { Assembly } from "../rules/types";
import type { Discovery, DiscoveryContext, TechniqueDescriptor } from "./types";
import { coverageEntries } from "./manifest";
import { NakedSingles, HiddenSingles } from "./singles";
import { LockedCandidates } from "./intersections";
import { Subsets, LockedSubsets } from "./subsets";
import { shortPatternTechniques } from "./short-patterns";
import { wingTechniques } from "./wings";
import { bentSubsetTechniques } from "./bent-subsets";
import { remotePairTechniques } from "./remote-pairs";
import { fishTechniques } from "./fish";
import { chainTechniques } from "./chains";
import { loopTechniques } from "./loops";
import { coloringTechniques } from "./coloring";
import { alsPatternTechniques } from "./als-patterns";
import { deathBlossomTechniques } from "./death-blossom";
import { sueDeCoqTechniques } from "./sue-de-coq";
import { alignedExclusionTechniques } from "./aligned-exclusion";
import { forcingTechniques } from "./forcing";
import { netTechniques } from "./nets";
import { krakenTechniques } from "./kraken";
import { generalizedTechniques } from "./generalized-runtime";
import { exocetTechniques } from "./exocet";
import { tridagonTechniques } from "./tridagon";
import { skLoopTechniques } from "./sk-loops";
import { fireworksTechniques } from "./fireworks";
import { orTechniques } from "./or-runtime";
import { templateTechniques } from "./templates";
import { uniqueTechniques } from "./unique-runtime";
import { defined } from "../invariants";

const detectors = new Map<
  string,
  { discover(view: ReadView, context: DiscoveryContext): Discovery }
>([
  ["C01", new NakedSingles()],
  ["C02", new HiddenSingles()],
  ["C03", new LockedCandidates()],
  ["C04", new Subsets()],
  ["C05", new LockedSubsets()],
]);
// Common scheduler projections of the exact per-row textual manifest. Additional
// dimensions (fins, local tuples, incidence, guardians) stay in that contract.
const dimensions: Record<string, readonly [number, number, number, number, number]> = {
  C01: [0, 0, 1, 1, 1],
  C02: [0, 0, 9, 9, 1],
  C03: [0, 0, 3, 18, 3],
  C04: [0, 0, 9, 9, 4],
  C05: [0, 0, 9, 15, 3],
  C06: [0, 0, 9, 81, 7],
  C07: [0, 1, 2, 81, 7],
  C08: [0, 1, 2, 81, 4],
  C09: [0, 1, 2, 81, 4],
  C10: [3, 0, 3, 12, 3],
  C11: [0, 0, 3, 5, 3],
  C12: [0, 1, 9, 6, 6],
  C13: [24, 0, 2, 12, 2],
  C14: [0, 2, 4, 81, 0],
  C15: [0, 1, 2, 81, 0],
  C16: [24, 1, 2, 81, 0],
  C17: [24, 1, 3, 81, 5],
  C18: [0, 0, 9, 15, 5],
  C19: [24, 1, 4, 31, 5],
  C20: [0, 0, 9, 11, 4],
  C21: [0, 1, 9, 12, 5],
  C22: [24, 1, 9, 81, 0],
  C23: [24, 2, 9, 81, 0],
  C24: [24, 1, 2, 81, 4],
  C25: [12, 1, 9, 81, 0],
  C26: [12, 1, 9, 81, 0],
  C27: [12, 1, 9, 81, 3],
  C28: [24, 1, 4, 81, 4],
  C29: [0, 0, 9, 4, 4],
  C30: [0, 0, 9, 16, 3],
  C31: [0, 0, 9, 81, 4],
  C32: [0, 1, 6, 12, 4],
  C33: [0, 0, 9, 81, 3],
  U01: [24, 1, 2, 4, 2],
  U02: [24, 1, 3, 6, 3],
  U03: [12, 0, 4, 12, 2],
  U04: [0, 0, 1, 81, 2],
  U05: [24, 1, 4, 81, 4],
};
const advanced = [
  ...uniqueTechniques,
  ...templateTechniques,
  ...fishTechniques,
  ...shortPatternTechniques,
  ...wingTechniques,
  ...bentSubsetTechniques,
  ...remotePairTechniques,
  ...coloringTechniques,
  ...chainTechniques,
  ...loopTechniques,
  ...alsPatternTechniques,
  ...deathBlossomTechniques,
  ...sueDeCoqTechniques,
  ...alignedExclusionTechniques,
  ...forcingTechniques,
  ...netTechniques,
  ...krakenTechniques,
  ...generalizedTechniques,
  ...orTechniques,
  ...fireworksTechniques,
  ...skLoopTechniques,
  ...tridagonTechniques,
  ...exocetTechniques,
];
const descriptors: readonly TechniqueDescriptor[] = Object.freeze(
  coverageEntries.map(
    (entry) =>
      advanced.find((descriptor) => descriptor.id === entry.version) ??
      Object.freeze({
        id: entry.version,
        aliases: entry.aliases,
        tier: entry.tier,
        requires: entry.capabilities,
        assumptionPolicy: entry.assumptionPolicy,
        bounds: Object.freeze({
          maxLength: dimensions[entry.id][0],
          maxBranchDepth: dimensions[entry.id][1],
          maxAlternatives: dimensions[entry.id][2],
          maxPatternCells: dimensions[entry.id][3],
          maxSetSize: dimensions[entry.id][4],
        }),
        watches: (_view: ReadView) => Object.freeze([{ kind: "all" as const }]),
        eligible: (view: ReadView) => {
          const dependencies = Object.freeze([{ kind: "all" as const }]);
          if (!detectors.has(entry.id))
            return { kind: "excluded" as const, reason: "specified-not-implemented", dependencies };
          if (
            (entry.capabilities.includes("A") && !view.assembly.allDifferent.length) ||
            (entry.capabilities.includes("H") && !view.assembly.covers.length)
          )
            return { kind: "excluded" as const, reason: "missing-capability", dependencies };
          return { kind: "yes" as const };
        },
        estimate: (_view: ReadView) => Object.freeze({ hit: 1, gain: 1, cost: entry.tier + 1 }),
        *discover(view: ReadView, context: DiscoveryContext): Discovery {
          const detector = detectors.get(entry.id);
          if (!detector) throw Error("specified-not-implemented");
          yield* detector.discover(view, context);
        },
      }),
  ),
);

/** Closed known-version dispatch. Unimplemented rows remain visible and excluded. */
export function getTechniques(profile: VersionId): readonly TechniqueDescriptor[] {
  if (!["classic-expanded@1", "classic-conditional@1"].includes(profile))
    throw Error("unknown-profile");
  return profile === "classic-conditional@1"
    ? descriptors
    : Object.freeze(
        descriptors.filter((descriptor) => descriptor.assumptionPolicy !== "unique-only"),
      );
}

/**
 * Catalogue visibility is distinct from runtime readiness; partial M2 cannot stall successfully.
 */
export function profileReadiness(profile: VersionId): {
  readonly ready: boolean;
  readonly missing: readonly string[];
} {
  getTechniques(profile);
  const missing = coverageEntries
    .filter(
      (entry) =>
        (profile === "classic-conditional@1" || entry.assumptionPolicy !== "unique-only") &&
        entry.status !== "independently-verified",
    )
    .map((entry) => entry.id);
  return Object.freeze({ ready: missing.length === 0, missing: Object.freeze(missing) });
}

/** One cursor per rule and family; never materialize combinatorial scope jobs. */
export function assembleTechniqueJobs(assembly: Assembly, profile: VersionId) {
  const techniques = getTechniques(profile);
  if (assembly.problem.constraints.length + techniques.length > 256)
    throw Error("profile-job-limit");
  if (!profileReadiness(profile).ready) throw Error("profile-incomplete");
  return Object.freeze({
    rules: Object.freeze(
      assembly.problem.constraints.map((rule) =>
        Object.freeze({
          id: "rule-propagation@1",
          scopeKey: rule.id,
          discover: (view: ReadView): Discovery =>
            defined(assembly.modules.get(rule.id), "module").propagate(view, rule),
        }),
      ),
    ),
    techniques,
  });
}
