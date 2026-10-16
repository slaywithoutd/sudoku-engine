/**
 * Corpus schema 2 (spec §3.9, plan T13): every case carries its normalized
 * hash, source group and license; the partition is a pure function of the
 * hash, so a case can never move partitions without a new corpus hash.
 * Test-only, no production imports.
 */
import { createHash } from "node:crypto";
import type { CorpusCase, CorpusConstraint, CorpusFamily } from "./generate";

export type Partition = "calibration" | "held-out";

export interface CorpusEntry {
  readonly id: string;
  readonly partition: Partition;
  readonly family: CorpusFamily;
  readonly puzzle: string;
  readonly constraints: readonly CorpusConstraint[];
  readonly givens: number;
  readonly oracleCount: 1;
  readonly sourceGroup: string;
  readonly license: string;
  /** sha256 of the normalized puzzle string and canonical constraint list. */
  readonly hash: string;
  readonly seed?: number;
}

export interface Corpus {
  readonly schema: 2;
  readonly generator: string;
  readonly corpusHash: string;
  readonly calibration: readonly CorpusEntry[];
  readonly heldOut: readonly CorpusEntry[];
  readonly policies: readonly string[];
  readonly profiles: Readonly<Record<string, string>>;
  readonly limits: { timeMs: number; workUnits: number; exactNodes: number };
}

export const CORPUS_TARGETS: Readonly<Record<CorpusFamily, number>> = {
  classic: 300,
  killer: 150,
  thermometer: 100,
  kropki: 100,
  arrow: 100,
  mixed: 100,
};

/** One in four cases (by hash) is held out; the rest calibrate. */
export const HELD_OUT_MODULUS = 4;

export function normalizedHash(puzzle: string, constraints: readonly CorpusConstraint[]): string {
  const canonical = [...constraints]
    .map(
      (c) =>
        `${c.type}|${c.cells.join(",")}|${JSON.stringify(c.parameters, Object.keys(c.parameters).sort())}`,
    )
    .sort();
  return createHash("sha256")
    .update(`${puzzle}\n${canonical.join("\n")}`)
    .digest("hex");
}

export function partitionOf(hash: string): Partition {
  return parseInt(hash.slice(0, 8), 16) % HELD_OUT_MODULUS === 0 ? "held-out" : "calibration";
}

export function toEntry(made: CorpusCase): CorpusEntry {
  const hash = normalizedHash(made.puzzle, made.constraints);
  return {
    id: made.id,
    partition: partitionOf(hash),
    family: made.family,
    puzzle: made.puzzle,
    constraints: made.constraints,
    givens: made.givens,
    oracleCount: 1,
    sourceGroup: made.sourceGroup,
    license: made.license,
    hash,
    seed: made.seed,
  };
}

export function corpusHash(entries: readonly CorpusEntry[]): string {
  const hashes = entries.map((entry) => entry.hash).sort();
  return createHash("sha256").update(hashes.join("\n")).digest("hex");
}

export function assembleCorpus(entries: readonly CorpusEntry[], generator: string): Corpus {
  const sorted = [...entries].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    schema: 2,
    generator,
    corpusHash: corpusHash(sorted),
    calibration: sorted.filter((entry) => entry.partition === "calibration"),
    heldOut: sorted.filter((entry) => entry.partition === "held-out"),
    policies: [
      "fixed-scan@1",
      "event-fixed@1",
      "explain-fair@1",
      "analyze-fair@1",
      "explain-fair@2",
      "analyze-fair@2",
    ],
    profiles: { classic: "classic-expanded@1", variants: "variants-expanded@1" },
    limits: { timeMs: 10000, workUnits: 2000000, exactNodes: 500000 },
  };
}
