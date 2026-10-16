/**
 * Corpus build and validation (plan T13).
 *
 * Validation runs in the normal suite. Building is opt-in and slow:
 *   CORPUS=build CORPUS_FAMILY=killer CORPUS_SEEDS=1-400 CORPUS_OUT=<dir> vitest run build-corpus
 * writes `<dir>/<family>-<from>-<to>.json` (entries); then
 *   CORPUS=assemble CORPUS_OUT=<dir> vitest run build-corpus
 * merges every part into tests/solver/bench/corpus.json.
 */
import { describe, expect, test } from "vitest";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { generators, type CorpusFamily } from "../../solver/bench/generate";
import {
  CORPUS_TARGETS,
  assembleCorpus,
  corpusHash,
  normalizedHash,
  partitionOf,
  toEntry,
  type Corpus,
  type CorpusEntry,
} from "../../solver/bench/corpus-schema";

const bench = fileURLToPath(new URL("../../solver/bench/", import.meta.url));
const corpusPath = bench + "corpus.json";
const mode = process.env.CORPUS;

function generatorHash(): string {
  return createHash("sha256")
    .update(readFileSync(bench + "generate.ts", "utf8").replace(/\r\n/g, "\n"))
    .digest("hex")
    .slice(0, 16);
}

describe.skipIf(mode !== "build")("corpus build", () => {
  test(
    "generates one family into a part file",
    () => {
      const family = process.env.CORPUS_FAMILY as CorpusFamily;
      expect(Object.keys(CORPUS_TARGETS)).toContain(family);
      const [from, to] = (process.env.CORPUS_SEEDS ?? "1-1000").split("-").map(Number);
      const out = process.env.CORPUS_OUT ?? bench + "parts/";
      mkdirSync(out, { recursive: true });
      const file = `${out}/${family}-${from}-${to}.json`;
      const entries: CorpusEntry[] = [];
      for (let seed = from; seed <= to; seed += 1) {
        const made = generators[family](seed);
        if (made) entries.push(toEntry(made));
        writeFileSync(file, JSON.stringify(entries));
      }
      expect(entries.length).toBeGreaterThan(0);
    },
    24 * 3600_000,
  );
});

describe.skipIf(mode !== "assemble")("corpus assemble", () => {
  test("merges every part into corpus.json", () => {
    const out = process.env.CORPUS_OUT ?? bench + "parts/";
    const entries = readdirSync(out)
      .filter((name) => name.endsWith(".json"))
      .flatMap((name) => JSON.parse(readFileSync(`${out}/${name}`, "utf8")) as CorpusEntry[]);
    const corpus = assembleCorpus(entries, generatorHash());
    writeFileSync(corpusPath, JSON.stringify(corpus) + "\n");
    expect(corpus.calibration.length + corpus.heldOut.length).toBe(entries.length);
  });
});

describe.skipIf(mode !== undefined)("corpus validation (T13)", () => {
  const corpus = JSON.parse(readFileSync(corpusPath, "utf8")) as Corpus;
  const all = [...corpus.calibration, ...corpus.heldOut];

  test("schema 2 with disjoint partitions fixed by hash", () => {
    expect(corpus.schema).toBe(2);
    expect(corpus.generator).toBe(generatorHash());
    expect(corpus.corpusHash).toBe(corpusHash(all));
    expect(new Set(all.map((entry) => entry.id)).size).toBe(all.length);
    expect(new Set(all.map((entry) => entry.hash)).size).toBe(all.length);
    for (const entry of all) {
      expect(entry.hash).toBe(normalizedHash(entry.puzzle, entry.constraints));
      expect(entry.partition).toBe(partitionOf(entry.hash));
      expect(entry.puzzle).toMatch(/^[0-9]{81}$/);
      expect(entry.oracleCount).toBe(1);
      expect(entry.license).toBe("repository-generated");
      expect(entry.sourceGroup.length).toBeGreaterThan(0);
    }
    expect(corpus.calibration.every((entry) => entry.partition === "calibration")).toBe(true);
    expect(corpus.heldOut.every((entry) => entry.partition === "held-out")).toBe(true);
    expect(corpus.policies).toContain("explain-fair@2");
    expect(corpus.policies).toContain("analyze-fair@2");
  });

  test("counts meet the spec §3.9 generated targets in every family", () => {
    for (const [family, target] of Object.entries(CORPUS_TARGETS)) {
      const count = all.filter((entry) => entry.family === family).length;
      expect(count, family).toBeGreaterThanOrEqual(target);
      const held = corpus.heldOut.filter((entry) => entry.family === family).length;
      expect(held, `${family} held-out`).toBeGreaterThan(0);
    }
  });

  test("generated cases replay deterministically from their seed", () => {
    // One case per family: the generator is pure in its seed.
    for (const family of Object.keys(CORPUS_TARGETS) as CorpusFamily[]) {
      const entry = all.find((candidate) => candidate.family === family)!;
      const made = generators[family](entry.seed!);
      expect(made?.puzzle).toBe(entry.puzzle);
      expect(made?.constraints).toEqual(entry.constraints);
    }
  }, 300_000);
});
