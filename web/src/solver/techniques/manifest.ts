import type { AssumptionPolicy } from "../proof/types";
export type CoverageStatus = "catalogued" | "specified" | "implemented" | "independently-verified" | "unsupported";
export interface CoverageEvidence { readonly kind: "positive" | "negative" | "boundary" | "original-clue" | "independent-oracle"; readonly fixtureId: string; readonly alias: string; readonly record: string }
export interface CoverageEntry {
  readonly id: string; readonly version: string; readonly aliases: readonly string[]; readonly tier: number;
  readonly capabilities: readonly string[]; readonly assumptionPolicy: AssumptionPolicy;
  /** Exact, versioned matrix bounds, retained verbatim rather than lossy common maxima. */
  readonly bounds: string; readonly grammarId: string; readonly detectorId: string; readonly checkerId: string;
  readonly descriptionPath: string; readonly fixtureIds: readonly string[]; readonly status: CoverageStatus;
  readonly evidence: readonly CoverageEvidence[];
}
function freeze(entry: CoverageEntry): CoverageEntry {
  return Object.freeze({ ...entry, aliases: Object.freeze([...entry.aliases]), capabilities: Object.freeze([...entry.capabilities]),
    fixtureIds: Object.freeze([...entry.fixtureIds]), evidence: Object.freeze(entry.evidence.map(e => Object.freeze({...e}))) });
}
/** Complete target catalogue. A specified descriptor is excluded, never exhausted. */
export const coverageEntries: readonly CoverageEntry[] = Object.freeze((
[
  {
    "id": "C01",
    "version": "c01@1",
    "aliases": [
      "Naked Single",
      "Full House",
      "Last Digit"
    ],
    "tier": 0,
    "capabilities": [
      "D",
      "A"
    ],
    "assumptionPolicy": "unconditional",
    "bounds": "Singleton unresolved domain; Full House is a one-empty covering house presentation. One placement plus explicit peer removals.",
    "grammarId": "c01-grammar@1",
    "detectorId": "c01@1",
    "checkerId": "c01-grammar@1",
    "descriptionPath": "docs/solver/techniques/foundation.md",
    "fixtureIds": [
      "C01-full-house",
      "C01-last-digit",
      "C01-one-hole",
      "C01-two-candidates-negative"
    ],
    "status": "independently-verified",
    "evidence": [
      {
        "kind": "positive",
        "fixtureId": "C01-one-hole",
        "alias": "Naked Single",
        "record": "web/tests/unit/solver/foundation.test.ts#exact-named-discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C01-one-hole",
        "alias": "Naked Single",
        "record": "web/tests/unit/solver/foundation.test.ts#independent-certificate-mutations"
      },
      {
        "kind": "boundary",
        "fixtureId": "C01-one-hole",
        "alias": "Naked Single",
        "record": "web/tests/unit/solver/foundation.test.ts#outside-bound-and-positive-class"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C01-one-hole",
        "alias": "Naked Single",
        "record": "web/tests/unit/solver/foundation.test.ts#replays-original-clue-prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C01-one-hole",
        "alias": "Naked Single",
        "record": "web/tests/unit/solver/foundation.test.ts#assertSound-both-certificates"
      },
      {
        "kind": "positive",
        "fixtureId": "C01-full-house",
        "alias": "Full House",
        "record": "web/tests/unit/solver/foundation.test.ts#exact-named-discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C01-full-house",
        "alias": "Full House",
        "record": "web/tests/unit/solver/foundation.test.ts#independent-certificate-mutations"
      },
      {
        "kind": "boundary",
        "fixtureId": "C01-full-house",
        "alias": "Full House",
        "record": "web/tests/unit/solver/foundation.test.ts#outside-bound-and-positive-class"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C01-full-house",
        "alias": "Full House",
        "record": "web/tests/unit/solver/foundation.test.ts#replays-original-clue-prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C01-full-house",
        "alias": "Full House",
        "record": "web/tests/unit/solver/foundation.test.ts#assertSound-both-certificates"
      },
      {
        "kind": "positive",
        "fixtureId": "C01-last-digit",
        "alias": "Last Digit",
        "record": "web/tests/unit/solver/foundation.test.ts#exact-named-discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C01-last-digit",
        "alias": "Last Digit",
        "record": "web/tests/unit/solver/foundation.test.ts#independent-certificate-mutations"
      },
      {
        "kind": "boundary",
        "fixtureId": "C01-last-digit",
        "alias": "Last Digit",
        "record": "web/tests/unit/solver/foundation.test.ts#outside-bound-and-positive-class"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C01-last-digit",
        "alias": "Last Digit",
        "record": "web/tests/unit/solver/foundation.test.ts#replays-original-clue-prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C01-last-digit",
        "alias": "Last Digit",
        "record": "web/tests/unit/solver/foundation.test.ts#assertSound-both-certificates"
      }
    ]
  },
  {
    "id": "C02",
    "version": "c02@1",
    "aliases": [
      "Hidden Single"
    ],
    "tier": 0,
    "capabilities": [
      "D",
      "H"
    ],
    "assumptionPolicy": "unconditional",
    "bounds": "One remaining support in a proved symbol cover; all 27 classic houses and nine symbols.",
    "grammarId": "c02-grammar@1",
    "detectorId": "c02@1",
    "checkerId": "c02-grammar@1",
    "descriptionPath": "docs/solver/techniques/foundation.md",
    "fixtureIds": [
      "C02-box",
      "C02-column",
      "C02-row",
      "C02-small-cage-negative"
    ],
    "status": "independently-verified",
    "evidence": [
      {
        "kind": "positive",
        "fixtureId": "C02-row",
        "alias": "Hidden Single",
        "record": "web/tests/unit/solver/foundation.test.ts#exact-named-discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C02-row",
        "alias": "Hidden Single",
        "record": "web/tests/unit/solver/foundation.test.ts#independent-certificate-mutations"
      },
      {
        "kind": "boundary",
        "fixtureId": "C02-row",
        "alias": "Hidden Single",
        "record": "web/tests/unit/solver/foundation.test.ts#outside-bound-and-positive-class"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C02-row",
        "alias": "Hidden Single",
        "record": "web/tests/unit/solver/foundation.test.ts#replays-original-clue-prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C02-row",
        "alias": "Hidden Single",
        "record": "web/tests/unit/solver/foundation.test.ts#assertSound-both-certificates"
      }
    ]
  },
  {
    "id": "C03",
    "version": "c03@1",
    "aliases": [
      "Locked Candidates",
      "pointing",
      "claiming",
      "direct forms"
    ],
    "tier": 0,
    "capabilities": [
      "D",
      "A",
      "H"
    ],
    "assumptionPolicy": "unconditional",
    "bounds": "Nonempty proper intersection of a cover and all-different group; supports confined to intersection, remove outside. Classic both box→line and line→box, support size 2–3; singleton reported C02. Direct-single consequence is a subsequent C01/C02 step.",
    "grammarId": "c03-grammar@1",
    "detectorId": "c03@1",
    "checkerId": "c03-grammar@1",
    "descriptionPath": "docs/solver/techniques/foundation.md",
    "fixtureIds": [
      "C03-claim-column",
      "C03-claim-column-outside-support",
      "C03-claim-column-size2",
      "C03-claim-column-size3",
      "C03-claim-row",
      "C03-claim-row-outside-support",
      "C03-claim-row-size2",
      "C03-claim-row-size3",
      "C03-direct-forms",
      "C03-locked-candidates",
      "C03-point-column",
      "C03-point-column-outside-support",
      "C03-point-column-size2",
      "C03-point-column-size3",
      "C03-point-row",
      "C03-point-row-outside-support",
      "C03-point-row-size2",
      "C03-point-row-size3",
      "C03-singleton-out-of-profile"
    ],
    "status": "independently-verified",
    "evidence": [
      {
        "kind": "positive",
        "fixtureId": "C03-locked-candidates",
        "alias": "Locked Candidates",
        "record": "web/tests/unit/solver/foundation.test.ts#exact-named-discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C03-locked-candidates",
        "alias": "Locked Candidates",
        "record": "web/tests/unit/solver/foundation.test.ts#independent-certificate-mutations"
      },
      {
        "kind": "boundary",
        "fixtureId": "C03-locked-candidates",
        "alias": "Locked Candidates",
        "record": "web/tests/unit/solver/foundation.test.ts#outside-bound-and-positive-class"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C03-locked-candidates",
        "alias": "Locked Candidates",
        "record": "web/tests/unit/solver/foundation.test.ts#replays-original-clue-prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C03-locked-candidates",
        "alias": "Locked Candidates",
        "record": "web/tests/unit/solver/foundation.test.ts#assertSound-both-certificates"
      },
      {
        "kind": "positive",
        "fixtureId": "C03-point-column",
        "alias": "pointing",
        "record": "web/tests/unit/solver/foundation.test.ts#exact-named-discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C03-point-column",
        "alias": "pointing",
        "record": "web/tests/unit/solver/foundation.test.ts#independent-certificate-mutations"
      },
      {
        "kind": "boundary",
        "fixtureId": "C03-point-column",
        "alias": "pointing",
        "record": "web/tests/unit/solver/foundation.test.ts#outside-bound-and-positive-class"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C03-point-column",
        "alias": "pointing",
        "record": "web/tests/unit/solver/foundation.test.ts#replays-original-clue-prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C03-point-column",
        "alias": "pointing",
        "record": "web/tests/unit/solver/foundation.test.ts#assertSound-both-certificates"
      },
      {
        "kind": "positive",
        "fixtureId": "C03-claim-row",
        "alias": "claiming",
        "record": "web/tests/unit/solver/foundation.test.ts#exact-named-discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C03-claim-row",
        "alias": "claiming",
        "record": "web/tests/unit/solver/foundation.test.ts#independent-certificate-mutations"
      },
      {
        "kind": "boundary",
        "fixtureId": "C03-claim-row",
        "alias": "claiming",
        "record": "web/tests/unit/solver/foundation.test.ts#outside-bound-and-positive-class"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C03-claim-row",
        "alias": "claiming",
        "record": "web/tests/unit/solver/foundation.test.ts#replays-original-clue-prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C03-claim-row",
        "alias": "claiming",
        "record": "web/tests/unit/solver/foundation.test.ts#assertSound-both-certificates"
      },
      {
        "kind": "positive",
        "fixtureId": "C03-direct-forms",
        "alias": "direct forms",
        "record": "web/tests/unit/solver/foundation.test.ts#exact-named-discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C03-direct-forms",
        "alias": "direct forms",
        "record": "web/tests/unit/solver/foundation.test.ts#independent-certificate-mutations"
      },
      {
        "kind": "boundary",
        "fixtureId": "C03-direct-forms",
        "alias": "direct forms",
        "record": "web/tests/unit/solver/foundation.test.ts#outside-bound-and-positive-class"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C03-direct-forms",
        "alias": "direct forms",
        "record": "web/tests/unit/solver/foundation.test.ts#replays-original-clue-prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C03-direct-forms",
        "alias": "direct forms",
        "record": "web/tests/unit/solver/foundation.test.ts#assertSound-both-certificates"
      }
    ]
  },
  {
    "id": "C04",
    "version": "c04@1",
    "aliases": [
      "Naked Pair",
      "Naked Triple",
      "Naked Quad",
      "Hidden Pair",
      "Hidden Triple",
      "Hidden Quad",
      "complementary quintuple",
      "complementary sextuple",
      "complementary septuple"
    ],
    "tier": 1,
    "capabilities": [
      "D",
      "A; hidden also H"
    ],
    "assumptionPolicy": "unconditional",
    "bounds": "n=2…4 direct enumeration; complementary house forms n=5…7 recognized through the n=4…2 complement with explicit alias metadata, not separate discovery. Naked union size n; hidden complete supports in n cells.",
    "grammarId": "c04-grammar@1",
    "detectorId": "c04@1",
    "checkerId": "c04-grammar@1",
    "descriptionPath": "docs/solver/techniques/foundation.md",
    "fixtureIds": [
      "C04-complement-5",
      "C04-complement-6",
      "C04-complement-7",
      "C04-complement-naked-5",
      "C04-complement-naked-6",
      "C04-complement-naked-7",
      "C04-extra-support",
      "C04-hidden-2-box",
      "C04-hidden-2-column",
      "C04-hidden-2-row",
      "C04-hidden-3-box",
      "C04-hidden-3-column",
      "C04-hidden-3-row",
      "C04-hidden-4-box",
      "C04-hidden-4-column",
      "C04-hidden-4-row",
      "C04-naked-2-box",
      "C04-naked-2-column",
      "C04-naked-2-row",
      "C04-naked-3-box",
      "C04-naked-3-column",
      "C04-naked-3-row",
      "C04-naked-4-box",
      "C04-naked-4-column",
      "C04-naked-4-row",
      "C04-no-effect",
      "C04-three-cells-two-values"
    ],
    "status": "independently-verified",
    "evidence": [
      {
        "kind": "positive",
        "fixtureId": "C04-naked-2-column",
        "alias": "Naked Pair",
        "record": "web/tests/unit/solver/foundation.test.ts#exact-named-discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C04-naked-2-column",
        "alias": "Naked Pair",
        "record": "web/tests/unit/solver/foundation.test.ts#independent-certificate-mutations"
      },
      {
        "kind": "boundary",
        "fixtureId": "C04-naked-2-column",
        "alias": "Naked Pair",
        "record": "web/tests/unit/solver/foundation.test.ts#outside-bound-and-positive-class"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C04-naked-2-column",
        "alias": "Naked Pair",
        "record": "web/tests/unit/solver/foundation.test.ts#replays-original-clue-prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C04-naked-2-column",
        "alias": "Naked Pair",
        "record": "web/tests/unit/solver/foundation.test.ts#assertSound-both-certificates"
      },
      {
        "kind": "positive",
        "fixtureId": "C04-naked-3-box",
        "alias": "Naked Triple",
        "record": "web/tests/unit/solver/foundation.test.ts#exact-named-discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C04-naked-3-box",
        "alias": "Naked Triple",
        "record": "web/tests/unit/solver/foundation.test.ts#independent-certificate-mutations"
      },
      {
        "kind": "boundary",
        "fixtureId": "C04-naked-3-box",
        "alias": "Naked Triple",
        "record": "web/tests/unit/solver/foundation.test.ts#outside-bound-and-positive-class"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C04-naked-3-box",
        "alias": "Naked Triple",
        "record": "web/tests/unit/solver/foundation.test.ts#replays-original-clue-prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C04-naked-3-box",
        "alias": "Naked Triple",
        "record": "web/tests/unit/solver/foundation.test.ts#assertSound-both-certificates"
      },
      {
        "kind": "positive",
        "fixtureId": "C04-naked-4-column",
        "alias": "Naked Quad",
        "record": "web/tests/unit/solver/foundation.test.ts#exact-named-discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C04-naked-4-column",
        "alias": "Naked Quad",
        "record": "web/tests/unit/solver/foundation.test.ts#independent-certificate-mutations"
      },
      {
        "kind": "boundary",
        "fixtureId": "C04-naked-4-column",
        "alias": "Naked Quad",
        "record": "web/tests/unit/solver/foundation.test.ts#outside-bound-and-positive-class"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C04-naked-4-column",
        "alias": "Naked Quad",
        "record": "web/tests/unit/solver/foundation.test.ts#replays-original-clue-prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C04-naked-4-column",
        "alias": "Naked Quad",
        "record": "web/tests/unit/solver/foundation.test.ts#assertSound-both-certificates"
      },
      {
        "kind": "positive",
        "fixtureId": "C04-hidden-2-row",
        "alias": "Hidden Pair",
        "record": "web/tests/unit/solver/foundation.test.ts#exact-named-discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C04-hidden-2-row",
        "alias": "Hidden Pair",
        "record": "web/tests/unit/solver/foundation.test.ts#independent-certificate-mutations"
      },
      {
        "kind": "boundary",
        "fixtureId": "C04-hidden-2-row",
        "alias": "Hidden Pair",
        "record": "web/tests/unit/solver/foundation.test.ts#outside-bound-and-positive-class"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C04-hidden-2-row",
        "alias": "Hidden Pair",
        "record": "web/tests/unit/solver/foundation.test.ts#replays-original-clue-prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C04-hidden-2-row",
        "alias": "Hidden Pair",
        "record": "web/tests/unit/solver/foundation.test.ts#assertSound-both-certificates"
      },
      {
        "kind": "positive",
        "fixtureId": "C04-hidden-3-column",
        "alias": "Hidden Triple",
        "record": "web/tests/unit/solver/foundation.test.ts#exact-named-discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C04-hidden-3-column",
        "alias": "Hidden Triple",
        "record": "web/tests/unit/solver/foundation.test.ts#independent-certificate-mutations"
      },
      {
        "kind": "boundary",
        "fixtureId": "C04-hidden-3-column",
        "alias": "Hidden Triple",
        "record": "web/tests/unit/solver/foundation.test.ts#outside-bound-and-positive-class"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C04-hidden-3-column",
        "alias": "Hidden Triple",
        "record": "web/tests/unit/solver/foundation.test.ts#replays-original-clue-prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C04-hidden-3-column",
        "alias": "Hidden Triple",
        "record": "web/tests/unit/solver/foundation.test.ts#assertSound-both-certificates"
      },
      {
        "kind": "positive",
        "fixtureId": "C04-hidden-4-box",
        "alias": "Hidden Quad",
        "record": "web/tests/unit/solver/foundation.test.ts#exact-named-discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C04-hidden-4-box",
        "alias": "Hidden Quad",
        "record": "web/tests/unit/solver/foundation.test.ts#independent-certificate-mutations"
      },
      {
        "kind": "boundary",
        "fixtureId": "C04-hidden-4-box",
        "alias": "Hidden Quad",
        "record": "web/tests/unit/solver/foundation.test.ts#outside-bound-and-positive-class"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C04-hidden-4-box",
        "alias": "Hidden Quad",
        "record": "web/tests/unit/solver/foundation.test.ts#replays-original-clue-prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C04-hidden-4-box",
        "alias": "Hidden Quad",
        "record": "web/tests/unit/solver/foundation.test.ts#assertSound-both-certificates"
      },
      {
        "kind": "positive",
        "fixtureId": "C04-complement-5",
        "alias": "complementary quintuple",
        "record": "web/tests/unit/solver/foundation.test.ts#exact-named-discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C04-complement-5",
        "alias": "complementary quintuple",
        "record": "web/tests/unit/solver/foundation.test.ts#independent-certificate-mutations"
      },
      {
        "kind": "boundary",
        "fixtureId": "C04-complement-5",
        "alias": "complementary quintuple",
        "record": "web/tests/unit/solver/foundation.test.ts#outside-bound-and-positive-class"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C04-complement-5",
        "alias": "complementary quintuple",
        "record": "web/tests/unit/solver/foundation.test.ts#replays-original-clue-prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C04-complement-5",
        "alias": "complementary quintuple",
        "record": "web/tests/unit/solver/foundation.test.ts#assertSound-both-certificates"
      },
      {
        "kind": "positive",
        "fixtureId": "C04-complement-6",
        "alias": "complementary sextuple",
        "record": "web/tests/unit/solver/foundation.test.ts#exact-named-discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C04-complement-6",
        "alias": "complementary sextuple",
        "record": "web/tests/unit/solver/foundation.test.ts#independent-certificate-mutations"
      },
      {
        "kind": "boundary",
        "fixtureId": "C04-complement-6",
        "alias": "complementary sextuple",
        "record": "web/tests/unit/solver/foundation.test.ts#outside-bound-and-positive-class"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C04-complement-6",
        "alias": "complementary sextuple",
        "record": "web/tests/unit/solver/foundation.test.ts#replays-original-clue-prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C04-complement-6",
        "alias": "complementary sextuple",
        "record": "web/tests/unit/solver/foundation.test.ts#assertSound-both-certificates"
      },
      {
        "kind": "positive",
        "fixtureId": "C04-complement-7",
        "alias": "complementary septuple",
        "record": "web/tests/unit/solver/foundation.test.ts#exact-named-discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C04-complement-7",
        "alias": "complementary septuple",
        "record": "web/tests/unit/solver/foundation.test.ts#independent-certificate-mutations"
      },
      {
        "kind": "boundary",
        "fixtureId": "C04-complement-7",
        "alias": "complementary septuple",
        "record": "web/tests/unit/solver/foundation.test.ts#outside-bound-and-positive-class"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C04-complement-7",
        "alias": "complementary septuple",
        "record": "web/tests/unit/solver/foundation.test.ts#replays-original-clue-prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C04-complement-7",
        "alias": "complementary septuple",
        "record": "web/tests/unit/solver/foundation.test.ts#assertSound-both-certificates"
      }
    ]
  },
  {
    "id": "C05",
    "version": "c05@1",
    "aliases": [
      "Locked Pair",
      "Locked Triple"
    ],
    "tier": 1,
    "capabilities": [
      "D",
      "A",
      "H"
    ],
    "assumptionPolicy": "unconditional",
    "bounds": "C04 n=2…3 entirely within a box-line intersection, with separate proved effects in each applicable house; combine only roots already checked.",
    "grammarId": "c05-grammar@1",
    "detectorId": "c05@1",
    "checkerId": "c05-grammar@1",
    "descriptionPath": "docs/solver/techniques/foundation.md",
    "fixtureIds": [
      "C05-one-house-only",
      "C05-pair-column",
      "C05-pair-row",
      "C05-size1-out-of-profile",
      "C05-size4-out-of-profile",
      "C05-triple-column",
      "C05-triple-row"
    ],
    "status": "independently-verified",
    "evidence": [
      {
        "kind": "positive",
        "fixtureId": "C05-pair-row",
        "alias": "Locked Pair",
        "record": "web/tests/unit/solver/foundation.test.ts#exact-named-discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C05-pair-row",
        "alias": "Locked Pair",
        "record": "web/tests/unit/solver/foundation.test.ts#independent-certificate-mutations"
      },
      {
        "kind": "boundary",
        "fixtureId": "C05-pair-row",
        "alias": "Locked Pair",
        "record": "web/tests/unit/solver/foundation.test.ts#outside-bound-and-positive-class"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C05-pair-row",
        "alias": "Locked Pair",
        "record": "web/tests/unit/solver/foundation.test.ts#replays-original-clue-prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C05-pair-row",
        "alias": "Locked Pair",
        "record": "web/tests/unit/solver/foundation.test.ts#assertSound-both-certificates"
      },
      {
        "kind": "positive",
        "fixtureId": "C05-triple-column",
        "alias": "Locked Triple",
        "record": "web/tests/unit/solver/foundation.test.ts#exact-named-discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C05-triple-column",
        "alias": "Locked Triple",
        "record": "web/tests/unit/solver/foundation.test.ts#independent-certificate-mutations"
      },
      {
        "kind": "boundary",
        "fixtureId": "C05-triple-column",
        "alias": "Locked Triple",
        "record": "web/tests/unit/solver/foundation.test.ts#outside-bound-and-positive-class"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C05-triple-column",
        "alias": "Locked Triple",
        "record": "web/tests/unit/solver/foundation.test.ts#replays-original-clue-prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C05-triple-column",
        "alias": "Locked Triple",
        "record": "web/tests/unit/solver/foundation.test.ts#assertSound-both-certificates"
      }
    ]
  },
  {
    "id": "C06",
    "version": "c06@1",
    "aliases": [
      "X-Wing",
      "Swordfish",
      "Jellyfish",
      "Squirmbag",
      "Whale",
      "Leviathan"
    ],
    "tier": 2,
    "capabilities": [
      "D",
      "A",
      "H",
      "K"
    ],
    "assumptionPolicy": "unconditional",
    "bounds": "n=2…7 disjoint parallel base lines and n orthogonal cover lines, one symbol. Supports of every base contained in covers; remove from covers outside bases. Both orientations, all support densities including smaller equivalent fish.",
    "grammarId": "c06-grammar@1",
    "detectorId": "c06@1",
    "checkerId": "c06-grammar@1",
    "descriptionPath": "docs/solver/techniques/fish.md",
    "fixtureIds": [
      "C06-size-2-row",
      "C06-size-2-column",
      "C06-size-3-row",
      "C06-size-3-column",
      "C06-size-4-row",
      "C06-size-4-column",
      "C06-size-5-row",
      "C06-size-5-column",
      "C06-size-6-row",
      "C06-size-6-column",
      "C06-size-7-row",
      "C06-size-7-column",
      "C06-size-8-outside",
      "C06-missing-base-coverage"
    ],
    "status": "independently-verified",
    "evidence": [
      {
        "kind": "positive",
        "fixtureId": "C06-size-2-row",
        "alias": "X-Wing",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C06-size-2-row",
        "alias": "X-Wing",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C06-size-2-row",
        "alias": "X-Wing",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C06-size-2-row",
        "alias": "X-Wing",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C06-size-2-row",
        "alias": "X-Wing",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C06-size-2-column",
        "alias": "X-Wing",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C06-size-2-column",
        "alias": "X-Wing",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C06-size-2-column",
        "alias": "X-Wing",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C06-size-2-column",
        "alias": "X-Wing",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C06-size-2-column",
        "alias": "X-Wing",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C06-size-3-row",
        "alias": "Swordfish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C06-size-3-row",
        "alias": "Swordfish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C06-size-3-row",
        "alias": "Swordfish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C06-size-3-row",
        "alias": "Swordfish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C06-size-3-row",
        "alias": "Swordfish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C06-size-3-column",
        "alias": "Swordfish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C06-size-3-column",
        "alias": "Swordfish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C06-size-3-column",
        "alias": "Swordfish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C06-size-3-column",
        "alias": "Swordfish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C06-size-3-column",
        "alias": "Swordfish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C06-size-4-row",
        "alias": "Jellyfish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C06-size-4-row",
        "alias": "Jellyfish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C06-size-4-row",
        "alias": "Jellyfish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C06-size-4-row",
        "alias": "Jellyfish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C06-size-4-row",
        "alias": "Jellyfish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C06-size-4-column",
        "alias": "Jellyfish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C06-size-4-column",
        "alias": "Jellyfish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C06-size-4-column",
        "alias": "Jellyfish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C06-size-4-column",
        "alias": "Jellyfish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C06-size-4-column",
        "alias": "Jellyfish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C06-size-5-row",
        "alias": "Squirmbag",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C06-size-5-row",
        "alias": "Squirmbag",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C06-size-5-row",
        "alias": "Squirmbag",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C06-size-5-row",
        "alias": "Squirmbag",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C06-size-5-row",
        "alias": "Squirmbag",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C06-size-5-column",
        "alias": "Squirmbag",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C06-size-5-column",
        "alias": "Squirmbag",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C06-size-5-column",
        "alias": "Squirmbag",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C06-size-5-column",
        "alias": "Squirmbag",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C06-size-5-column",
        "alias": "Squirmbag",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C06-size-6-row",
        "alias": "Whale",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C06-size-6-row",
        "alias": "Whale",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C06-size-6-row",
        "alias": "Whale",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C06-size-6-row",
        "alias": "Whale",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C06-size-6-row",
        "alias": "Whale",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C06-size-6-column",
        "alias": "Whale",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C06-size-6-column",
        "alias": "Whale",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C06-size-6-column",
        "alias": "Whale",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C06-size-6-column",
        "alias": "Whale",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C06-size-6-column",
        "alias": "Whale",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C06-size-7-row",
        "alias": "Leviathan",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C06-size-7-row",
        "alias": "Leviathan",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C06-size-7-row",
        "alias": "Leviathan",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C06-size-7-row",
        "alias": "Leviathan",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C06-size-7-row",
        "alias": "Leviathan",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C06-size-7-column",
        "alias": "Leviathan",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C06-size-7-column",
        "alias": "Leviathan",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C06-size-7-column",
        "alias": "Leviathan",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C06-size-7-column",
        "alias": "Leviathan",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C06-size-7-column",
        "alias": "Leviathan",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      }
    ]
  },
  {
    "id": "C07",
    "version": "c07@1",
    "aliases": [
      "Finned fish",
      "Sashimi fish"
    ],
    "tier": 4,
    "capabilities": [
      "D",
      "A",
      "H",
      "K"
    ],
    "assumptionPolicy": "discharged",
    "bounds": "Basic n=2…7, 1…4 exo-fin candidate occurrences confined to one box. Under target=true all fins conflict and finless cover argument follows. Sashimi permits missing corners and <2 residual supports; exact incidence proof required.",
    "grammarId": "c07-grammar@1",
    "detectorId": "c07@1",
    "checkerId": "c07-grammar@1",
    "descriptionPath": "docs/solver/techniques/fish.md",
    "fixtureIds": [
      "C07-finned-2-row",
      "C07-finned-2-column",
      "C07-sashimi-2-row",
      "C07-sashimi-2-column",
      "C07-finned-3-row",
      "C07-finned-3-column",
      "C07-sashimi-3-row",
      "C07-sashimi-3-column",
      "C07-finned-4-row",
      "C07-finned-4-column",
      "C07-sashimi-4-row",
      "C07-sashimi-4-column",
      "C07-finned-5-row",
      "C07-finned-5-column",
      "C07-sashimi-5-row",
      "C07-sashimi-5-column",
      "C07-finned-6-row",
      "C07-finned-6-column",
      "C07-sashimi-6-row",
      "C07-sashimi-6-column",
      "C07-finned-7-row",
      "C07-finned-7-column",
      "C07-sashimi-7-row",
      "C07-sashimi-7-column",
      "C07-finned-fins-2-row",
      "C07-finned-fins-2-column",
      "C07-finned-fins-3-row",
      "C07-finned-fins-3-column",
      "C07-finned-fins-4-row",
      "C07-finned-fins-4-column",
      "C07-sashimi-fins-2-row",
      "C07-sashimi-fins-2-column",
      "C07-sashimi-fins-3-row",
      "C07-sashimi-fins-3-column",
      "C07-sashimi-fins-4-row",
      "C07-sashimi-fins-4-column",
      "C07-five-fins-outside",
      "C07-nonseeing-target"
    ],
    "status": "independently-verified",
    "evidence": [
      {
        "kind": "positive",
        "fixtureId": "C07-finned-2-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-finned-2-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-finned-2-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-finned-2-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-finned-2-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-finned-2-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-finned-2-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-finned-2-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-finned-2-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-finned-2-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-sashimi-2-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-sashimi-2-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-sashimi-2-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-sashimi-2-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-sashimi-2-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-sashimi-2-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-sashimi-2-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-sashimi-2-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-sashimi-2-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-sashimi-2-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-finned-3-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-finned-3-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-finned-3-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-finned-3-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-finned-3-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-finned-3-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-finned-3-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-finned-3-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-finned-3-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-finned-3-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-sashimi-3-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-sashimi-3-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-sashimi-3-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-sashimi-3-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-sashimi-3-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-sashimi-3-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-sashimi-3-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-sashimi-3-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-sashimi-3-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-sashimi-3-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-finned-4-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-finned-4-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-finned-4-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-finned-4-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-finned-4-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-finned-4-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-finned-4-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-finned-4-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-finned-4-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-finned-4-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-sashimi-4-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-sashimi-4-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-sashimi-4-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-sashimi-4-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-sashimi-4-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-sashimi-4-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-sashimi-4-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-sashimi-4-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-sashimi-4-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-sashimi-4-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-finned-5-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-finned-5-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-finned-5-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-finned-5-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-finned-5-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-finned-5-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-finned-5-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-finned-5-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-finned-5-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-finned-5-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-sashimi-5-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-sashimi-5-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-sashimi-5-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-sashimi-5-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-sashimi-5-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-sashimi-5-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-sashimi-5-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-sashimi-5-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-sashimi-5-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-sashimi-5-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-finned-6-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-finned-6-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-finned-6-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-finned-6-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-finned-6-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-finned-6-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-finned-6-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-finned-6-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-finned-6-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-finned-6-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-sashimi-6-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-sashimi-6-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-sashimi-6-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-sashimi-6-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-sashimi-6-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-sashimi-6-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-sashimi-6-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-sashimi-6-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-sashimi-6-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-sashimi-6-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-finned-7-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-finned-7-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-finned-7-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-finned-7-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-finned-7-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-finned-7-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-finned-7-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-finned-7-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-finned-7-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-finned-7-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-sashimi-7-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-sashimi-7-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-sashimi-7-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-sashimi-7-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-sashimi-7-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-sashimi-7-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-sashimi-7-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-sashimi-7-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-sashimi-7-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-sashimi-7-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-finned-fins-2-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-finned-fins-2-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-finned-fins-2-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-finned-fins-2-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-finned-fins-2-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-finned-fins-2-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-finned-fins-2-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-finned-fins-2-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-finned-fins-2-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-finned-fins-2-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-finned-fins-3-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-finned-fins-3-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-finned-fins-3-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-finned-fins-3-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-finned-fins-3-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-finned-fins-3-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-finned-fins-3-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-finned-fins-3-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-finned-fins-3-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-finned-fins-3-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-finned-fins-4-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-finned-fins-4-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-finned-fins-4-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-finned-fins-4-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-finned-fins-4-row",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-finned-fins-4-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-finned-fins-4-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-finned-fins-4-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-finned-fins-4-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-finned-fins-4-column",
        "alias": "Finned fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-sashimi-fins-2-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-sashimi-fins-2-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-sashimi-fins-2-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-sashimi-fins-2-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-sashimi-fins-2-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-sashimi-fins-2-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-sashimi-fins-2-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-sashimi-fins-2-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-sashimi-fins-2-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-sashimi-fins-2-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-sashimi-fins-3-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-sashimi-fins-3-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-sashimi-fins-3-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-sashimi-fins-3-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-sashimi-fins-3-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-sashimi-fins-3-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-sashimi-fins-3-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-sashimi-fins-3-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-sashimi-fins-3-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-sashimi-fins-3-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-sashimi-fins-4-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-sashimi-fins-4-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-sashimi-fins-4-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-sashimi-fins-4-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-sashimi-fins-4-row",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C07-sashimi-fins-4-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C07-sashimi-fins-4-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C07-sashimi-fins-4-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C07-sashimi-fins-4-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C07-sashimi-fins-4-column",
        "alias": "Sashimi fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      }
    ]
  },
  {
    "id": "C08",
    "version": "c08@1",
    "aliases": [
      "Franken fish",
      "Mutant fish"
    ],
    "tier": 4,
    "capabilities": [
      "D",
      "A",
      "H",
      "K"
    ],
    "assumptionPolicy": "discharged",
    "bounds": "n=2…4, any distinct classic base/cover house sets. Franken mixes boxes with one line orientation per side; Mutant permits row/column/box mixing. <=4 fin occurrences. Overlaps handled by the incidence certificate below.",
    "grammarId": "c08-grammar@1",
    "detectorId": "c08@1",
    "checkerId": "c08-grammar@1",
    "descriptionPath": "docs/solver/techniques/fish.md",
    "fixtureIds": [
      "C08-mutant-3",
      "C08-mutant-4",
      "C08-franken-2",
      "C08-mutant-2",
      "C08-franken-3",
      "C08-franken-4",
      "C08-size-5-outside",
      "C08-omitted-overlap"
    ],
    "status": "independently-verified",
    "evidence": [
      {
        "kind": "positive",
        "fixtureId": "C08-mutant-3",
        "alias": "Mutant fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C08-mutant-3",
        "alias": "Mutant fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C08-mutant-3",
        "alias": "Mutant fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C08-mutant-3",
        "alias": "Mutant fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C08-mutant-3",
        "alias": "Mutant fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C08-mutant-4",
        "alias": "Mutant fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C08-mutant-4",
        "alias": "Mutant fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C08-mutant-4",
        "alias": "Mutant fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C08-mutant-4",
        "alias": "Mutant fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C08-mutant-4",
        "alias": "Mutant fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C08-franken-2",
        "alias": "Franken fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C08-franken-2",
        "alias": "Franken fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C08-franken-2",
        "alias": "Franken fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C08-franken-2",
        "alias": "Franken fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C08-franken-2",
        "alias": "Franken fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C08-mutant-2",
        "alias": "Mutant fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C08-mutant-2",
        "alias": "Mutant fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C08-mutant-2",
        "alias": "Mutant fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C08-mutant-2",
        "alias": "Mutant fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C08-mutant-2",
        "alias": "Mutant fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C08-franken-3",
        "alias": "Franken fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C08-franken-3",
        "alias": "Franken fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C08-franken-3",
        "alias": "Franken fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C08-franken-3",
        "alias": "Franken fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C08-franken-3",
        "alias": "Franken fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C08-franken-4",
        "alias": "Franken fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C08-franken-4",
        "alias": "Franken fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C08-franken-4",
        "alias": "Franken fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C08-franken-4",
        "alias": "Franken fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C08-franken-4",
        "alias": "Franken fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      }
    ]
  },
  {
    "id": "C09",
    "version": "c09@1",
    "aliases": [
      "Endo-fin fish",
      "Cannibalistic fish",
      "Siamese fish"
    ],
    "tier": 4,
    "capabilities": [
      "D",
      "A",
      "H",
      "K"
    ],
    "assumptionPolicy": "discharged",
    "bounds": "C08 sizes 2…4; <=4 combined endo/exo-fin occurrences; cannibalistic target may lie in a base. Siamese is exactly two same-symbol fish sharing the base set with different covers, each separately checked (union of effects, no unsupported synergistic claim).",
    "grammarId": "c09-grammar@1",
    "detectorId": "c09@1",
    "checkerId": "c09-grammar@1",
    "descriptionPath": "docs/solver/techniques/fish.md",
    "fixtureIds": [
      "C09-endo-4",
      "C09-endo-3",
      "C09-endo-2",
      "C09-cannibal-4",
      "C09-cannibal-2",
      "C09-cannibal-3",
      "C09-siamese-2",
      "C09-siamese-3",
      "C09-siamese-4",
      "C09-size-5-outside",
      "C09-third-component-outside",
      "C09-missing-second-component"
    ],
    "status": "independently-verified",
    "evidence": [
      {
        "kind": "positive",
        "fixtureId": "C09-endo-4",
        "alias": "Endo-fin fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C09-endo-4",
        "alias": "Endo-fin fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C09-endo-4",
        "alias": "Endo-fin fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C09-endo-4",
        "alias": "Endo-fin fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C09-endo-4",
        "alias": "Endo-fin fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C09-endo-3",
        "alias": "Endo-fin fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C09-endo-3",
        "alias": "Endo-fin fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C09-endo-3",
        "alias": "Endo-fin fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C09-endo-3",
        "alias": "Endo-fin fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C09-endo-3",
        "alias": "Endo-fin fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C09-endo-2",
        "alias": "Endo-fin fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C09-endo-2",
        "alias": "Endo-fin fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C09-endo-2",
        "alias": "Endo-fin fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C09-endo-2",
        "alias": "Endo-fin fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C09-endo-2",
        "alias": "Endo-fin fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C09-cannibal-4",
        "alias": "Cannibalistic fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C09-cannibal-4",
        "alias": "Cannibalistic fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C09-cannibal-4",
        "alias": "Cannibalistic fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C09-cannibal-4",
        "alias": "Cannibalistic fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C09-cannibal-4",
        "alias": "Cannibalistic fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C09-cannibal-2",
        "alias": "Cannibalistic fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C09-cannibal-2",
        "alias": "Cannibalistic fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C09-cannibal-2",
        "alias": "Cannibalistic fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C09-cannibal-2",
        "alias": "Cannibalistic fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C09-cannibal-2",
        "alias": "Cannibalistic fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C09-cannibal-3",
        "alias": "Cannibalistic fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C09-cannibal-3",
        "alias": "Cannibalistic fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C09-cannibal-3",
        "alias": "Cannibalistic fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C09-cannibal-3",
        "alias": "Cannibalistic fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C09-cannibal-3",
        "alias": "Cannibalistic fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C09-siamese-2",
        "alias": "Siamese fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C09-siamese-2",
        "alias": "Siamese fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C09-siamese-2",
        "alias": "Siamese fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C09-siamese-2",
        "alias": "Siamese fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C09-siamese-2",
        "alias": "Siamese fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C09-siamese-3",
        "alias": "Siamese fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C09-siamese-3",
        "alias": "Siamese fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C09-siamese-3",
        "alias": "Siamese fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C09-siamese-3",
        "alias": "Siamese fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C09-siamese-3",
        "alias": "Siamese fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      },
      {
        "kind": "positive",
        "fixtureId": "C09-siamese-4",
        "alias": "Siamese fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#actual discovery proves the required named bound class"
      },
      {
        "kind": "negative",
        "fixtureId": "C09-siamese-4",
        "alias": "Siamese fish",
        "record": "web/tests/unit/solver/fish.test.ts#rejects changed incidence, aliases, fins, size and complete-source premises"
      },
      {
        "kind": "boundary",
        "fixtureId": "C09-siamese-4",
        "alias": "Siamese fish",
        "record": "web/tests/unit/solver/fish.test.ts#independently rejects the documented negative/profile shape"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C09-siamese-4",
        "alias": "Siamese fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#replays its independent certificate from original clues"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C09-siamese-4",
        "alias": "Siamese fish",
        "record": "web/tests/unit/solver/fish-complex.test.ts#all 63 unchanged original inputs reproduce hashes, SAT and 98 forced counterfactuals"
      }
    ]
  },
  {
    "id": "C10",
    "version": "c10@1",
    "aliases": [
      "Turbot Fish",
      "Skyscraper",
      "Two-String Kite",
      "Empty Rectangle",
      "Dual Empty Rectangle"
    ],
    "tier": 2,
    "capabilities": [
      "D",
      "A",
      "H",
      "G",
      "K"
    ],
    "assumptionPolicy": "unconditional",
    "bounds": "Four-vertex single-digit strong/weak/strong path (three internal links), plus target conflicts with both outer vertices. Scalar Turbot uses four candidate occurrences; Empty Rectangle may use grouped vertices. Skyscraper uses parallel strong links; kite orthogonal links joined in a box. Empty rectangle uses a box cover partitioned into disjoint exhaustive row/column groups (each <=3); dual is two checked such roots.",
    "grammarId": "c10-grammar@1",
    "detectorId": "c10@1",
    "checkerId": "c10-grammar@1",
    "descriptionPath": "docs/solver/techniques/wings-and-short-patterns.md",
    "fixtureIds": [
      "C10-turbot",
      "C10-skyscraper-column",
      "C10-skyscraper-row",
      "C10-kite-row",
      "C10-er-column",
      "C10-er-row",
      "C10-dual-er",
      "C10-kite-column",
      "C10-er-extra-support",
      "C10-incorrect-strong",
      "C10-nonseeing-target",
      "C10-turbot-row"
    ],
    "status": "independently-verified",
    "evidence": [
      {
        "kind": "positive",
        "fixtureId": "C10-turbot",
        "alias": "Turbot Fish",
        "record": "web/tests/unit/solver/short-patterns.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C10-turbot",
        "alias": "Turbot Fish",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C10-turbot",
        "alias": "Turbot Fish",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C10-turbot",
        "alias": "Turbot Fish",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C10-turbot",
        "alias": "Turbot Fish",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C10-turbot-row",
        "alias": "Turbot Fish",
        "record": "web/tests/unit/solver/short-patterns.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C10-turbot-row",
        "alias": "Turbot Fish",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C10-turbot-row",
        "alias": "Turbot Fish",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C10-turbot-row",
        "alias": "Turbot Fish",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C10-turbot-row",
        "alias": "Turbot Fish",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C10-skyscraper-column",
        "alias": "Skyscraper",
        "record": "web/tests/unit/solver/short-patterns.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C10-skyscraper-column",
        "alias": "Skyscraper",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C10-skyscraper-column",
        "alias": "Skyscraper",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C10-skyscraper-column",
        "alias": "Skyscraper",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C10-skyscraper-column",
        "alias": "Skyscraper",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C10-skyscraper-row",
        "alias": "Skyscraper",
        "record": "web/tests/unit/solver/short-patterns.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C10-skyscraper-row",
        "alias": "Skyscraper",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C10-skyscraper-row",
        "alias": "Skyscraper",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C10-skyscraper-row",
        "alias": "Skyscraper",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C10-skyscraper-row",
        "alias": "Skyscraper",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C10-kite-row",
        "alias": "Two-String Kite",
        "record": "web/tests/unit/solver/short-patterns.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C10-kite-row",
        "alias": "Two-String Kite",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C10-kite-row",
        "alias": "Two-String Kite",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C10-kite-row",
        "alias": "Two-String Kite",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C10-kite-row",
        "alias": "Two-String Kite",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C10-kite-column",
        "alias": "Two-String Kite",
        "record": "web/tests/unit/solver/short-patterns.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C10-kite-column",
        "alias": "Two-String Kite",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C10-kite-column",
        "alias": "Two-String Kite",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C10-kite-column",
        "alias": "Two-String Kite",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C10-kite-column",
        "alias": "Two-String Kite",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C10-er-column",
        "alias": "Empty Rectangle",
        "record": "web/tests/unit/solver/short-patterns.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C10-er-column",
        "alias": "Empty Rectangle",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C10-er-column",
        "alias": "Empty Rectangle",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C10-er-column",
        "alias": "Empty Rectangle",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C10-er-column",
        "alias": "Empty Rectangle",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C10-er-row",
        "alias": "Empty Rectangle",
        "record": "web/tests/unit/solver/short-patterns.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C10-er-row",
        "alias": "Empty Rectangle",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C10-er-row",
        "alias": "Empty Rectangle",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C10-er-row",
        "alias": "Empty Rectangle",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C10-er-row",
        "alias": "Empty Rectangle",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C10-dual-er",
        "alias": "Dual Empty Rectangle",
        "record": "web/tests/unit/solver/short-patterns.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C10-dual-er",
        "alias": "Dual Empty Rectangle",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C10-dual-er",
        "alias": "Dual Empty Rectangle",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C10-dual-er",
        "alias": "Dual Empty Rectangle",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C10-dual-er",
        "alias": "Dual Empty Rectangle",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      }
    ]
  },
  {
    "id": "C11",
    "version": "c11@1",
    "aliases": [
      "XY-Wing",
      "Y-Wing",
      "XYZ-Wing",
      "W-Wing"
    ],
    "tier": 2,
    "capabilities": [
      "D",
      "A",
      "G"
    ],
    "assumptionPolicy": "unconditional",
    "bounds": "XY: three bivalue cells, pivot XY, wings XZ/YZ seeing pivot, target sees both Z wings. XYZ: pivot XYZ and wings XZ/YZ, target sees all Z occurrences. W: two identical bivalue endpoints plus a conjugate-house bridge on one endpoint symbol.",
    "grammarId": "c11-grammar@1",
    "detectorId": "c11@1",
    "checkerId": "c11-grammar@1",
    "descriptionPath": "docs/solver/techniques/wings-and-short-patterns.md",
    "fixtureIds": [
      "C11-xyz-row",
      "C11-xy-box",
      "C11-xyz-box",
      "C11-xy-row",
      "C11-xy-column",
      "C11-xyz-column",
      "C11-w",
      "C11-y-box",
      "C11-y-row",
      "C11-y-column",
      "C11-wrong-pivot-size",
      "C11-xyz-missing-visibility",
      "C11-nonconjugate-bridge",
      "C11-w-row"
    ],
    "status": "independently-verified",
    "evidence": [
      {
        "kind": "positive",
        "fixtureId": "C11-xy-box",
        "alias": "XY-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C11-xy-box",
        "alias": "XY-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C11-xy-box",
        "alias": "XY-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C11-xy-box",
        "alias": "XY-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C11-xy-box",
        "alias": "XY-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C11-xy-row",
        "alias": "XY-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C11-xy-row",
        "alias": "XY-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C11-xy-row",
        "alias": "XY-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C11-xy-row",
        "alias": "XY-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C11-xy-row",
        "alias": "XY-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C11-xy-column",
        "alias": "XY-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C11-xy-column",
        "alias": "XY-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C11-xy-column",
        "alias": "XY-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C11-xy-column",
        "alias": "XY-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C11-xy-column",
        "alias": "XY-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C11-y-box",
        "alias": "Y-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C11-y-box",
        "alias": "Y-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C11-y-box",
        "alias": "Y-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C11-y-box",
        "alias": "Y-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C11-y-box",
        "alias": "Y-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C11-y-row",
        "alias": "Y-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C11-y-row",
        "alias": "Y-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C11-y-row",
        "alias": "Y-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C11-y-row",
        "alias": "Y-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C11-y-row",
        "alias": "Y-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C11-y-column",
        "alias": "Y-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C11-y-column",
        "alias": "Y-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C11-y-column",
        "alias": "Y-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C11-y-column",
        "alias": "Y-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C11-y-column",
        "alias": "Y-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C11-xyz-row",
        "alias": "XYZ-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C11-xyz-row",
        "alias": "XYZ-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C11-xyz-row",
        "alias": "XYZ-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C11-xyz-row",
        "alias": "XYZ-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C11-xyz-row",
        "alias": "XYZ-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C11-xyz-box",
        "alias": "XYZ-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C11-xyz-box",
        "alias": "XYZ-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C11-xyz-box",
        "alias": "XYZ-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C11-xyz-box",
        "alias": "XYZ-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C11-xyz-box",
        "alias": "XYZ-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C11-xyz-column",
        "alias": "XYZ-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C11-xyz-column",
        "alias": "XYZ-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C11-xyz-column",
        "alias": "XYZ-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C11-xyz-column",
        "alias": "XYZ-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C11-xyz-column",
        "alias": "XYZ-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C11-w",
        "alias": "W-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C11-w",
        "alias": "W-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C11-w",
        "alias": "W-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C11-w",
        "alias": "W-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C11-w",
        "alias": "W-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C11-w-row",
        "alias": "W-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C11-w-row",
        "alias": "W-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C11-w-row",
        "alias": "W-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C11-w-row",
        "alias": "W-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C11-w-row",
        "alias": "W-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      }
    ]
  },
  {
    "id": "C12",
    "version": "c12@1",
    "aliases": [
      "WXYZ-Wing",
      "Bent almost-locked subsets"
    ],
    "tier": 4,
    "capabilities": [
      "D",
      "A",
      "R"
    ],
    "assumptionPolicy": "discharged",
    "bounds": "n=4…6 cells with n symbols; one nonrestricted common symbol z, every other shared symbol restricted across non-seeing portions. Enumerate the selected n-cell assignments using only cited conflict edges and domains; all surviving assignments contain z in the pattern. Remove z only from targets seeing every possible z occurrence. No uniqueness premise.",
    "grammarId": "c12-grammar@1",
    "detectorId": "c12@1",
    "checkerId": "c12-grammar@1",
    "descriptionPath": "docs/solver/techniques/wings-and-short-patterns.md",
    "fixtureIds": [
      "C12-n5",
      "C12-n6",
      "C12-n4",
      "C12-restricted-lookalike",
      "C12-missing-occurrence",
      "C12-target-misses-occurrence",
      "C12-n7",
      "C12-partition-n6"
    ],
    "status": "independently-verified",
    "evidence": [
      {
        "kind": "positive",
        "fixtureId": "C12-n4",
        "alias": "WXYZ-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C12-n4",
        "alias": "WXYZ-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C12-n4",
        "alias": "WXYZ-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C12-n4",
        "alias": "WXYZ-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C12-n4",
        "alias": "WXYZ-Wing",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C12-n5",
        "alias": "Bent almost-locked subsets",
        "record": "web/tests/unit/solver/wings.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C12-n5",
        "alias": "Bent almost-locked subsets",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C12-n5",
        "alias": "Bent almost-locked subsets",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C12-n5",
        "alias": "Bent almost-locked subsets",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C12-n5",
        "alias": "Bent almost-locked subsets",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C12-n6",
        "alias": "Bent almost-locked subsets",
        "record": "web/tests/unit/solver/wings.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C12-n6",
        "alias": "Bent almost-locked subsets",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C12-n6",
        "alias": "Bent almost-locked subsets",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C12-n6",
        "alias": "Bent almost-locked subsets",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C12-n6",
        "alias": "Bent almost-locked subsets",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C12-partition-n6",
        "alias": "Bent almost-locked subsets",
        "record": "web/tests/unit/solver/wings.test.ts#C12 partitions a 5000-assignment original-clue local table and checks all 220 survivors"
      },
      {
        "kind": "negative",
        "fixtureId": "C12-partition-n6",
        "alias": "Bent almost-locked subsets",
        "record": "web/tests/unit/solver/wings.test.ts#both Dual Empty Rectangle roots and every C12 table boundary remain necessary"
      },
      {
        "kind": "boundary",
        "fixtureId": "C12-partition-n6",
        "alias": "Bent almost-locked subsets",
        "record": "web/tests/unit/solver/wings.test.ts#C12 partitions a 5000-assignment original-clue local table and checks all 220 survivors"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C12-partition-n6",
        "alias": "Bent almost-locked subsets",
        "record": "web/tests/unit/solver/wings.test.ts#C12 partitions a 5000-assignment original-clue local table and checks all 220 survivors"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C12-partition-n6",
        "alias": "Bent almost-locked subsets",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      }
    ]
  },
  {
    "id": "C13",
    "version": "c13@1",
    "aliases": [
      "Remote Pairs",
      "Chute Remote Pairs"
    ],
    "tier": 2,
    "capabilities": [
      "D",
      "A",
      "G",
      "K"
    ],
    "assumptionPolicy": "unconditional",
    "bounds": "Simple path of m=4/6/8/10/12 identical-bivalue cells; 2m-1 explicit inference links (internal cell strong edges included), <=24. Opposite endpoint colors; target conflicts with both endpoints for the same symbol. Target-conflict premises are additional. Chute requires all path cells in one band/stack (D074).",
    "grammarId": "c13-grammar@1",
    "detectorId": "c13@1",
    "checkerId": "c13-grammar@1",
    "descriptionPath": "docs/solver/techniques/wings-and-short-patterns.md",
    "fixtureIds": [
      "C13-length-6",
      "C13-length-8",
      "C13-length-10",
      "C13-length-12",
      "C13-length-4",
      "C13-chute-stack",
      "C13-chute-band",
      "C13-parity-negative",
      "C13-length-13",
      "C13-length-14",
      "C13-out-of-chute",
      "C13-wrong-inference-count"
    ],
    "status": "independently-verified",
    "evidence": [
      {
        "kind": "positive",
        "fixtureId": "C13-length-6",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/short-patterns.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C13-length-6",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C13-length-6",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C13-length-6",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C13-length-6",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C13-length-8",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/short-patterns.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C13-length-8",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C13-length-8",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C13-length-8",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C13-length-8",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C13-length-10",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/short-patterns.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C13-length-10",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C13-length-10",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C13-length-10",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C13-length-10",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C13-length-12",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/short-patterns.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C13-length-12",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C13-length-12",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C13-length-12",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C13-length-12",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C13-length-4",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/short-patterns.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C13-length-4",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C13-length-4",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C13-length-4",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C13-length-4",
        "alias": "Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C13-chute-stack",
        "alias": "Chute Remote Pairs",
        "record": "web/tests/unit/solver/short-patterns.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C13-chute-stack",
        "alias": "Chute Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C13-chute-stack",
        "alias": "Chute Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C13-chute-stack",
        "alias": "Chute Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C13-chute-stack",
        "alias": "Chute Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      },
      {
        "kind": "positive",
        "fixtureId": "C13-chute-band",
        "alias": "Chute Remote Pairs",
        "record": "web/tests/unit/solver/short-patterns.test.ts#independent named evidence and productive discovery"
      },
      {
        "kind": "negative",
        "fixtureId": "C13-chute-band",
        "alias": "Chute Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "boundary",
        "fixtureId": "C13-chute-band",
        "alias": "Chute Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#enforces its named alias and exact tuple/path boundary"
      },
      {
        "kind": "original-clue",
        "fixtureId": "C13-chute-band",
        "alias": "Chute Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#rejects primitive mutations and replays the original clue prefix"
      },
      {
        "kind": "independent-oracle",
        "fixtureId": "C13-chute-band",
        "alias": "Chute Remote Pairs",
        "record": "web/tests/unit/solver/wings.test.ts#durable seed hashes reproduce SAT and both forced and forbidden counterfactuals independently"
      }
    ]
  },
  {
    "id": "C14",
    "version": "c14@1",
    "aliases": [
      "Simple coloring",
      "Color trap",
      "Color wrap",
      "Multi-coloring"
    ],
    "tier": 3,
    "capabilities": [
      "D",
      "A",
      "H",
      "G"
    ],
    "assumptionPolicy": "discharged",
    "bounds": "Single-symbol conjugate components over <=81 occurrences; trap target sees both colors, wrap same color contains conflict. Multi-color uses two components, exhaustive two-color assignments and checked cross-conflicts; <=4 color branches.",
    "grammarId": "c14-grammar@1",
    "detectorId": "c14@1",
    "checkerId": "c14-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "C14-trap",
      "C14-wrap",
      "C14-multi"
    ],
    "status": "specified",
    "evidence": []
  },
  {
    "id": "C15",
    "version": "c15@1",
    "aliases": [
      "3D Medusa"
    ],
    "tier": 3,
    "capabilities": [
      "D",
      "A",
      "H",
      "G"
    ],
    "assumptionPolicy": "discharged",
    "bounds": "Components over <=729 cell-symbol literals using cell bivalue and house conjugate XOR edges; exhaustive 2-color alternatives with same-cell/house conflicts and common effects. Every edge checked, graph size remains bounded by actual candidates.",
    "grammarId": "c15-grammar@1",
    "detectorId": "c15@1",
    "checkerId": "c15-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "C15-cell-wrap",
      "C15-house-wrap",
      "C15-trap"
    ],
    "status": "specified",
    "evidence": []
  },
  {
    "id": "C16",
    "version": "c16@1",
    "aliases": [
      "X-Chains",
      "XY-Chains",
      "AICs"
    ],
    "tier": 4,
    "capabilities": [
      "D",
      "A",
      "H",
      "G"
    ],
    "assumptionPolicy": "discharged",
    "bounds": "Simple alternating weak/strong paths <=24 links; X uses one symbol, XY uses bivalue cell transitions, AIC permits both cell/house links. Endpoint inference via resolution or discharged target contradiction. Distinct path nodes except closing endpoint.",
    "grammarId": "c16-grammar@1",
    "detectorId": "c16@1",
    "checkerId": "c16-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "C16-x",
      "C16-xy",
      "C16-aic"
    ],
    "status": "specified",
    "evidence": []
  },
  {
    "id": "C17",
    "version": "c17@1",
    "aliases": [
      "Continuous Nice Loops",
      "Discontinuous Nice Loops",
      "Grouped AIC",
      "Grouped loops",
      "ALS links"
    ],
    "tier": 4,
    "capabilities": [
      "D",
      "A",
      "H",
      "G",
      "R"
    ],
    "assumptionPolicy": "discharged",
    "bounds": "<=24 links; at most four group/ALS nodes per path, groups <=3 same-symbol occurrences, ALS <=5 cells. Continuous loop weak edges become strong through complete cyclic proof; discontinuity uses the checked repeated endpoint to infer its polarity.",
    "grammarId": "c17-grammar@1",
    "detectorId": "c17@1",
    "checkerId": "c17-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "C17-continuous",
      "C17-discontinuous-on/off",
      "C17-group",
      "C17-als"
    ],
    "status": "specified",
    "evidence": []
  },
  {
    "id": "C18",
    "version": "c18@1",
    "aliases": [
      "ALS-XZ",
      "ALS-XY-Wing"
    ],
    "tier": 4,
    "capabilities": [
      "D",
      "A",
      "R"
    ],
    "assumptionPolicy": "unconditional",
    "bounds": "Two/three ALSs each 1…5 cells. Support disjoint and overlapping sets only with overlap excluded from RCC and a checked table/cover argument; one or two RCCs, all cross-occurrences conflict. XZ uses two sets, XY-Wing three; eliminate only from targets seeing all relevant z occurrences.",
    "grammarId": "c18-grammar@1",
    "detectorId": "c18@1",
    "checkerId": "c18-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "C18-xz-single-rcc",
      "C18-xz-double-rcc",
      "C18-overlap",
      "C18-xy"
    ],
    "status": "specified",
    "evidence": []
  },
  {
    "id": "C19",
    "version": "c19@1",
    "aliases": [
      "ALS chains",
      "Death Blossom"
    ],
    "tier": 4,
    "capabilities": [
      "D",
      "A",
      "R",
      "G"
    ],
    "assumptionPolicy": "discharged",
    "bounds": "ALS chain <=6 sets and <=24 links, each <=5 cells; Death Blossom one stem of 2…4 candidates with one petal per candidate, all stem alternatives covered, petals <=5 cells. Proof may share petals but cannot ignore overlap conflicts.",
    "grammarId": "c19-grammar@1",
    "detectorId": "c19@1",
    "checkerId": "c19-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "C19-chain-2/6",
      "C19-blossom-2/3/4"
    ],
    "status": "specified",
    "evidence": []
  },
  {
    "id": "C20",
    "version": "c20@1",
    "aliases": [
      "Sue de Coq",
      "Two-sector disjoint subsets"
    ],
    "tier": 5,
    "capabilities": [
      "D",
      "A",
      "H",
      "R",
      "K"
    ],
    "assumptionPolicy": "unconditional",
    "bounds": "Box-line intersection of 2…3 cells, plus disjoint side ALSs of 1…4 cells each outside intersection in line/box; total <=11 cells, <=9 symbols. Reconstruct allowed symbol allocations with Hall/cover counts; only proved side/intersection eliminations.",
    "grammarId": "c20-grammar@1",
    "detectorId": "c20@1",
    "checkerId": "c20-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "C20-intersection-2/3"
    ],
    "status": "specified",
    "evidence": []
  },
  {
    "id": "C21",
    "version": "c21@1",
    "aliases": [
      "Aligned Pair Exclusion",
      "Aligned Triple Exclusion",
      "Generalized Aligned Exclusion",
      "Subset counting"
    ],
    "tier": 5,
    "capabilities": [
      "D",
      "A",
      "R"
    ],
    "assumptionPolicy": "discharged",
    "bounds": "Selected 2…4 cells; Cartesian assignments <=9^4=6,561; auxiliary ALSs <=5 cells. Reject tuple only by a cited direct conflict or empty auxiliary-set matching. Eliminate a selected candidate absent in all surviving tuples. Subset-counting uses <=4 all-different scopes/<=12 cells, symbol counts 1…9 and explicit inequalities.",
    "grammarId": "c21-grammar@1",
    "detectorId": "c21@1",
    "checkerId": "c21-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "C21-aligned-2/3/4",
      "C21-count"
    ],
    "status": "specified",
    "evidence": []
  },
  {
    "id": "C22",
    "version": "c22@1",
    "aliases": [
      "Digit forcing chains",
      "Cell forcing chains",
      "Unit forcing chains",
      "Nishio"
    ],
    "tier": 6,
    "capabilities": [
      "D",
      "A",
      "H",
      "G"
    ],
    "assumptionPolicy": "discharged",
    "bounds": "Candidate true/false split; all 2…9 cell alternatives; all 2…9 house-symbol supports. <=24 links per branch. Nishio is one digit, one target=true, only single-digit cover/weak-link consequences until contradiction.",
    "grammarId": "c22-grammar@1",
    "detectorId": "c22@1",
    "checkerId": "c22-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "C22-digit",
      "C22-cell",
      "C22-unit",
      "C22-nishio"
    ],
    "status": "specified",
    "evidence": []
  },
  {
    "id": "C23",
    "version": "c23@1",
    "aliases": [
      "Static forcing nets",
      "Dynamic forcing nets",
      "Nested forcing"
    ],
    "tier": 6,
    "capabilities": [
      "D",
      "A",
      "H",
      "G",
      "R"
    ],
    "assumptionPolicy": "discharged",
    "bounds": "<=128 inference nodes/branch, <=9 alternatives, nesting depth <=2, <=81 cells. Static uses original graph; dynamic rebuilds links only from proved branch domains. Nested branches use C01–C05 propagation and graph resolution only; no recursive whole-solver calls or MRV DFS.",
    "grammarId": "c23-grammar@1",
    "detectorId": "c23@1",
    "checkerId": "c23-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "C23-static",
      "C23-dynamic",
      "C23-nested-depth2"
    ],
    "status": "specified",
    "evidence": []
  },
  {
    "id": "C24",
    "version": "c24@1",
    "aliases": [
      "Kraken Fish"
    ],
    "tier": 6,
    "capabilities": [
      "D",
      "A",
      "H",
      "G",
      "K"
    ],
    "assumptionPolicy": "discharged",
    "bounds": "C07/C08 fish size 2…4, <=4 fins; instead of direct target/fin visibility, prove target=true forces every fin false via <=24-link branches. Apply underlying checked fish certificate.",
    "grammarId": "c24-grammar@1",
    "detectorId": "c24@1",
    "checkerId": "c24-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "C24-kraken-basic",
      "C24-kraken-franken"
    ],
    "status": "specified",
    "evidence": []
  },
  {
    "id": "C25",
    "version": "c25@1",
    "aliases": [
      "Bivalue chains",
      "z-chains"
    ],
    "tier": 6,
    "capabilities": [
      "D",
      "A",
      "H",
      "G"
    ],
    "assumptionPolicy": "discharged",
    "bounds": "<=12 pairs. Bivalue pairs have exactly two original alternatives. z-pairs may exclude extra alternatives by conflict with Z only; endpoint closes through Z. Bivalue-chain endpoint presentation may instead eliminate a target seeing both chain endpoints.",
    "grammarId": "c25-grammar@1",
    "detectorId": "c25@1",
    "checkerId": "c25-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "C25-bivalue",
      "C25-z"
    ],
    "status": "specified",
    "evidence": []
  },
  {
    "id": "C26",
    "version": "c26@1",
    "aliases": [
      "t-whips",
      "Whips"
    ],
    "tier": 6,
    "capabilities": [
      "D",
      "A",
      "H",
      "G"
    ],
    "assumptionPolicy": "discharged",
    "bounds": "<=12 pairs. t-pairs exclude extras through earlier right candidates only; whips permit Z and earlier right candidates. Continuous Li→previous Ri is required; final no-right variable must list every eliminated alternative with its allowed conflict witness.",
    "grammarId": "c26-grammar@1",
    "detectorId": "c26@1",
    "checkerId": "c26-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "C26-t",
      "C26-whip"
    ],
    "status": "specified",
    "evidence": []
  },
  {
    "id": "C27",
    "version": "c27@1",
    "aliases": [
      "Braids",
      "g-whips"
    ],
    "tier": 6,
    "capabilities": [
      "D",
      "A",
      "H",
      "G"
    ],
    "assumptionPolicy": "discharged",
    "bounds": "Braid <=12 pairs relaxes Li predecessor to Z or any earlier Ri, while each right is the sole survivor relative to Z/earlier rights. g-whip remains continuous, but <=4 right groups of <=3 occurrences may replace scalar rights; every conflict against a group holds for all members.",
    "grammarId": "c27-grammar@1",
    "detectorId": "c27@1",
    "checkerId": "c27-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "C27-braid",
      "C27-gwhip"
    ],
    "status": "specified",
    "evidence": []
  },
  {
    "id": "C28",
    "version": "c28@1",
    "aliases": [
      "OR-k forcing",
      "OR-k whips"
    ],
    "tier": 6,
    "capabilities": [
      "D",
      "A",
      "H",
      "G",
      "R"
    ],
    "assumptionPolicy": "discharged",
    "bounds": "k=2…4 alternatives from an already proved clause (e.g. guardians), not a guessed list. Per branch C25–C27 <=12 pairs or static C22 chains <=24 links. Shared conclusion under every branch, no additional nesting.",
    "grammarId": "c28-grammar@1",
    "detectorId": "c28@1",
    "checkerId": "c28-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "C28-or2/3/4"
    ],
    "status": "specified",
    "evidence": []
  },
  {
    "id": "C29",
    "version": "c29@1",
    "aliases": [
      "Fireworks",
      "Triple Fireworks",
      "Quadruple Fireworks"
    ],
    "tier": 5,
    "capabilities": [
      "D",
      "A",
      "H",
      "K",
      "R"
    ],
    "assumptionPolicy": "unconditional",
    "bounds": "Triple: intersecting row/column, intersection cell X in box B, one wing Y outside B on row and one wing Z outside B on column; each of three symbols has no other support outside B. Prove each symbol occurs in X/Y/Z, then restrict this three-cell cover. Quad: two such cover relations on <=4 selected cells/four symbols, verify their conjunction with local table/count proof; do not assume that any two fireworks form a quad.",
    "grammarId": "c29-grammar@1",
    "detectorId": "c29@1",
    "checkerId": "c29-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "C29-triple",
      "C29-quad"
    ],
    "status": "specified",
    "evidence": []
  },
  {
    "id": "C30",
    "version": "c30@1",
    "aliases": [
      "SK Loops"
    ],
    "tier": 5,
    "capabilities": [
      "D",
      "A",
      "H",
      "K",
      "R"
    ],
    "assumptionPolicy": "unconditional",
    "bounds": "Exactly four boxes at two bands/two stacks and eight two-cell groups around their row/column rectangle. Adjacent groups share a house; link symbol sets size 1…3, total link multiplicity <=16. Enumerate each pair's local tuples, join count/compatibility relations around the eight-group ring, close the ring, and project only full-ring supported effects. Support vanilla and 1/2/3-link distributions satisfying this checked relation, including solved singleton members. No assertion that a visual rectangle alone proves a locked set.",
    "grammarId": "c30-grammar@1",
    "detectorId": "c30@1",
    "checkerId": "c30-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "C30-all-double",
      "C30-mixed-1-3",
      "C30-singleton"
    ],
    "status": "specified",
    "evidence": []
  },
  {
    "id": "C31",
    "version": "c31@1",
    "aliases": [
      "Exocet",
      "Junior Exocet",
      "Double Exocet"
    ],
    "tier": 5,
    "capabilities": [
      "D",
      "A",
      "H",
      "K",
      "R"
    ],
    "assumptionPolicy": "unconditional",
    "bounds": "Junior: two base cells on one box-line with union 3…4 symbols; two non-seeing targets in the other boxes of that band/stack; three cross-lines through targets and unused base mini-line cell; companions exclude base symbols; all occurrences (including assigned values) of each base symbol in S-cells outside band/stack covered by <=2 houses. Prove each of the two true base symbols must occur in targets through explicit cover-count certificates. Apply target restriction and base-symbol impossibility when S coverage <=1. Double: exactly two independently checked Junior relations sharing band/stack, <=4 base cells, four targets and <=4 symbols; derive further effects only by joining their proved base-target relations and shared cover counts.",
    "grammarId": "c31-grammar@1",
    "detectorId": "c31@1",
    "checkerId": "c31-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "C31-junior-3/4",
      "C31-cover-one",
      "C31-double"
    ],
    "status": "specified",
    "evidence": []
  },
  {
    "id": "C32",
    "version": "c32@1",
    "aliases": [
      "Tridagon",
      "Thor's Hammer",
      "Degenerate Tridagon",
      "Tridagon guardians"
    ],
    "tier": 5,
    "capabilities": [
      "D",
      "A",
      "K",
      "R"
    ],
    "assumptionPolicy": "discharged",
    "bounds": "Select four boxes in a two-band/two-stack rectangle, three distinct cells in each, union of three core symbols plus <=4 guardian literals. Remove guardians hypothetically, enumerate all <=6 permutations of core digits per box triple (<=6^4=1,296 combinations), reject each by explicit row/column/box conflicts. Supports degenerate triples within this geometry if the same complete table closes; parity diagrams alone never suffice. Derive the guardian OR clause and checked common consequences; C28 may consume it.",
    "grammarId": "c32-grammar@1",
    "detectorId": "c32@1",
    "checkerId": "c32-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "C32-parity",
      "C32-degenerate",
      "C32-guardian-1/2/4"
    ],
    "status": "specified",
    "evidence": []
  },
  {
    "id": "C33",
    "version": "c33@1",
    "aliases": [
      "Per-digit templates",
      "Pattern overlay",
      "POM",
      "Template incompatibility"
    ],
    "tier": 5,
    "capabilities": [
      "D",
      "A",
      "H",
      "K",
      "R"
    ],
    "assumptionPolicy": "unconditional",
    "bounds": "A template chooses exactly one cell in each row/column/box for one symbol, matching givens/current domains. Enumerate all geometrically legal templates (<=46,656 per symbol on empty classic grid; verify independently), filter with complete reasons. Single-symbol projection; pairwise incompatibility across symbols for intersecting cells; repeatedly remove templates with no compatible partner until fixed point. Two/three-symbol overlay may enumerate compatible tuples, capped at 100,000 tuple tests per revision; incomplete enumeration gives no absence conclusion. No nine-symbol completion enumeration inside logical POM.",
    "grammarId": "c33-grammar@1",
    "detectorId": "c33@1",
    "checkerId": "c33-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "C33-single",
      "C33-pair",
      "C33-triple",
      "C33-incompatibility"
    ],
    "status": "specified",
    "evidence": []
  },
  {
    "id": "U01",
    "version": "u01@1",
    "aliases": [
      "Unique Rectangle type 1",
      "Unique Rectangle type 2",
      "Unique Rectangle type 3",
      "Unique Rectangle type 4",
      "Unique Rectangle type 5",
      "Unique Rectangle type 6"
    ],
    "tier": 6,
    "capabilities": [
      "K",
      "U",
      "D",
      "H"
    ],
    "assumptionPolicy": "unique-only",
    "bounds": "Four cells in two rows/two columns/two boxes, two core symbols, empty of original givens. Each type's eliminations must reduce the forbidden core-only swap situation through a checked subset/strong-link/case proof, <=24 links. Validate type annotation separately from uniqueness-transform.",
    "grammarId": "u01-grammar@1",
    "detectorId": "u01@1",
    "checkerId": "u01-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "U01-type1",
      "U01-type6"
    ],
    "status": "specified",
    "evidence": []
  },
  {
    "id": "U02",
    "version": "u02@1",
    "aliases": [
      "Hidden Rectangle",
      "Avoidable Rectangle",
      "Extended Rectangle"
    ],
    "tier": 6,
    "capabilities": [
      "K",
      "U",
      "D",
      "H"
    ],
    "assumptionPolicy": "unique-only",
    "bounds": "Hidden uses same 2×2 geometry plus certified strong links. Avoidable allows derived assignments but never changed givens and includes all assignment provenance. Extended supports 2×3 or 3×2 six-cell rectangles, <=3 core symbols, explicit nonidentity permutation preserving every affected house and clue.",
    "grammarId": "u02-grammar@1",
    "detectorId": "u02@1",
    "checkerId": "u02-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "U02-hidden",
      "U02-avoidable",
      "U02-extended-2x3/3x2"
    ],
    "status": "specified",
    "evidence": []
  },
  {
    "id": "U03",
    "version": "u03@1",
    "aliases": [
      "Unique Loops"
    ],
    "tier": 6,
    "capabilities": [
      "K",
      "U",
      "D",
      "H"
    ],
    "assumptionPolicy": "unique-only",
    "bounds": "Even loop of 4…12 cells, two core symbols, each affected house contains zero or two loop cells; no original given changed. <=4 extra guardian literals; core alternation enables a nontrivial preserved assignment swap.",
    "grammarId": "u03-grammar@1",
    "detectorId": "u03@1",
    "checkerId": "u03-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "U03-length4/12"
    ],
    "status": "specified",
    "evidence": []
  },
  {
    "id": "U04",
    "version": "u04@1",
    "aliases": [
      "BUG",
      "BUG+1"
    ],
    "tier": 6,
    "capabilities": [
      "K",
      "U",
      "D",
      "H"
    ],
    "assumptionPolicy": "unique-only",
    "bounds": "Entire residual board core is bivalue, each unplaced house-symbol has zero or two supports, no satisfied support counted again. BUG core must exhibit a nontrivial solution-preserving trade, checked structurally by alternate-cycle certificate. BUG+1 has exactly one extra candidate occurrence; infer it only after certifying the forbidden core.",
    "grammarId": "u04-grammar@1",
    "detectorId": "u04@1",
    "checkerId": "u04-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "U04-core",
      "U04-plus1"
    ],
    "status": "specified",
    "evidence": []
  },
  {
    "id": "U05",
    "version": "u05@1",
    "aliases": [
      "Generalized BUG",
      "BUG+n"
    ],
    "tier": 6,
    "capabilities": [
      "K",
      "U",
      "D",
      "H"
    ],
    "assumptionPolicy": "unique-only",
    "bounds": "n=2…4 extra candidate occurrences over a checked U04 core; derive OR of every extra, then direct common conflict or <=24-link conditional forcing consequences. No arbitrary multivalue residual labeled BUG.",
    "grammarId": "u05-grammar@1",
    "detectorId": "u05@1",
    "checkerId": "u05-grammar@1",
    "descriptionPath": "docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",
    "fixtureIds": [
      "U05-plus2/3/4"
    ],
    "status": "specified",
    "evidence": []
  }
] as CoverageEntry[]).map(freeze));

/** Build gate: names, versions and evidence are checked against the closed catalogue. */
export function validateCoverage(entries: readonly CoverageEntry[]): readonly string[] {
  const errors = new Set<string>();
  if (entries.length !== 38 || new Set(entries.map(e => e.id)).size !== 38) errors.add("missing-coverage-row");
  for (const entry of entries) {
    const known = coverageEntries.find(e => e.id === entry.id);
    if (!known || entry.aliases.length !== known.aliases.length || new Set(entry.aliases).size !== entry.aliases.length ||
      entry.aliases.some(alias => !known.aliases.includes(alias))) errors.add("unknown-alias");
    if (known && (entry.bounds !== known.bounds || entry.version !== known.version || entry.grammarId !== known.grammarId ||
      entry.detectorId !== known.detectorId || entry.checkerId !== known.checkerId || entry.tier !== known.tier ||
      entry.assumptionPolicy !== known.assumptionPolicy || JSON.stringify(entry.capabilities) !== JSON.stringify(known.capabilities))) errors.add("changed-profile-contract");
    if (entry.status === "independently-verified") {
      for (const alias of entry.aliases) for (const kind of ["positive", "negative", "boundary", "original-clue", "independent-oracle"])
        if (!entry.evidence?.some(e => e.kind === kind && e.alias === alias && entry.fixtureIds.includes(e.fixtureId) && e.record)) errors.add("missing-independent-evidence");
    }
  }
  return Object.freeze([...errors].sort());
}

/** One primary grammar per alias, with the named spelling as its specialization. */
export const aliasMappings = Object.freeze(coverageEntries.flatMap(entry => entry.aliases.map(alias => Object.freeze({
  alias, rowId: entry.id, grammarId: entry.grammarId, specialization: alias,
}))));

/** Explicit generalizations outside the finite profile; none silently disappear. */
export const unsupportedAliases = Object.freeze([
  {alias:"Unlimited whips/braids",reason:"Generalized paths exceed 12 pairs",nearestSupportedForm:"C25–C27 bounded generalized chains"},
  {alias:"Unlimited chains and nets",reason:"Chains exceed 24 links or forcing depth exceeds two",nearestSupportedForm:"C16–C17 / C22–C23"},
  {alias:"Fish above size seven",reason:"Basic fish supports sizes 2–7",nearestSupportedForm:"C06 Leviathan"},
  {alias:"Complex fish above size four",reason:"Complex incidence grammar supports sizes 2–4",nearestSupportedForm:"C08–C09"},
  {alias:"Fish with more than four fins",reason:"Combined fin occurrence cap is four",nearestSupportedForm:"C07–C09 / C24"},
  {alias:"ALS above five cells",reason:"Per-ALS bound is five cells",nearestSupportedForm:"C18–C19"},
  {alias:"Aligned exclusion above four selected cells",reason:"Cartesian selected scope is bounded at four",nearestSupportedForm:"C21"},
  {alias:"General non-Junior Exocet",reason:"No specified transformation/cover grammar outside Junior geometry",nearestSupportedForm:"C31 Junior Exocet"},
  {alias:"Unproved Exocet mirror or escape",reason:"Visual naming does not establish a cover theorem",nearestSupportedForm:"C31 checked base-target relations"},
  {alias:"Non-ring generalized SK patterns",reason:"Only the eight-group four-box ring is specified",nearestSupportedForm:"C30 SK Loops"},
  {alias:"Other Tridagon geometries",reason:"Only the four-box twelve-cell schema is specified",nearestSupportedForm:"C32"},
  {alias:"Nine-symbol overlay search",reason:"POM supports bounded two/three-symbol overlays",nearestSupportedForm:"C33"},
  {alias:"BUG with more than four extras",reason:"Conditional extras are bounded at four",nearestSupportedForm:"U05"},
  {alias:"Custom variants",reason:"M2 production registration is classic only",nearestSupportedForm:"Classic rule profile"},
  {alias:"Bowman's Bingo / unrestricted trial and error",reason:"Unrestricted DFS is fallback search, not a named logical grammar",nearestSupportedForm:"Explicit exact fallback"},
].map(entry=>Object.freeze(entry)));
