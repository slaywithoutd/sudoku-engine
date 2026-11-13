import { describe, expect, test } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { oracle } from "../solver/oracle";
import {
  TRAINING_PACK_SCHEMA,
  type TrainingPack,
  type TrainingPosition,
} from "../../src/domain/training-pack";

/**
 * Independent checks of the committed training pack (spec §6 T1, D106). This
 * file and what it imports never touch `src/solver`: the solution comes from
 * the Algorithm X oracle, singles are recomputed here from rows, columns and
 * boxes, and nothing trusts the builder's own helpers.
 */
const packPath = fileURLToPath(new URL("../../src/assets/training-pack.json", import.meta.url));
const text = readFileSync(packPath, "utf8");
const pack = JSON.parse(text) as TrainingPack;

const HOUSES: number[][] = [];
for (let i = 0; i < 9; i++) {
  HOUSES.push([0, 1, 2, 3, 4, 5, 6, 7, 8].map((c) => i * 9 + c));
  HOUSES.push([0, 1, 2, 3, 4, 5, 6, 7, 8].map((r) => r * 9 + i));
  const r0 = 3 * Math.floor(i / 3),
    c0 = 3 * (i % 3);
  HOUSES.push([0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => (r0 + Math.floor(k / 3)) * 9 + c0 + (k % 3)));
}
const bit = (digit: number) => 1 << (digit - 1);
const TIERS: Record<string, number> = {
  "c01@1": 0,
  "c02@1": 0,
  "c03@1": 0,
  "c04@1": 1,
  "c05@1": 1,
  "c06@1": 2,
  "c10@1": 2,
  "c11@1": 2,
  "c13@1": 2,
};
const digits = (grid: string) => [...grid].map(Number);

/** Candidate sets from placed digits only, as arrays of digits (empty cells only). */
function fromPlaced(values: number[]): Set<number>[] {
  return values.map((value, cell) => {
    const result = new Set<number>();
    if (value) return result;
    for (let d = 1; d <= 9; d++)
      if (!HOUSES.some((h) => h.includes(cell) && h.some((other) => values[other] === d)))
        result.add(d);
    return result;
  });
}
function setsOf(masks: readonly number[], values: number[]): Set<number>[] {
  return masks.map((mask, cell) => {
    const result = new Set<number>();
    if (!values[cell]) for (let d = 1; d <= 9; d++) if (mask & bit(d)) result.add(d);
    return result;
  });
}
/** Naked singles and hidden singles, as "cell:digit" strings. */
function singles(values: number[], sets: Set<number>[]): Set<string> {
  const found = new Set<string>();
  sets.forEach((set, cell) => {
    if (!values[cell] && set.size === 1) found.add(`${cell}:${[...set][0]}`);
  });
  for (const house of HOUSES)
    for (let d = 1; d <= 9; d++) {
      if (house.some((cell) => values[cell] === d)) continue;
      const spots = house.filter((cell) => !values[cell] && sets[cell].has(d));
      if (spots.length === 1) found.add(`${spots[0]}:${d}`);
    }
  return found;
}
const pairs = (list: readonly (readonly [number, number])[]) =>
  new Set(list.map(([cell, digit]) => `${cell}:${digit}`));

describe("training pack (independent checks)", () => {
  test("header, size, order and sources", () => {
    expect(pack.schema).toBe(TRAINING_PACK_SCHEMA);
    expect(pack.license).toBe("repository-generated");
    expect(pack.positions.length).toBeGreaterThanOrEqual(450);
    expect(pack.positions.length).toBeLessThanOrEqual(550);
    const ids = pack.positions.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
    const perSource = new Map<number, number>();
    for (const p of pack.positions) perSource.set(p.source.seed, (perSource.get(p.source.seed) ?? 0) + 1);
    expect(Math.max(...perSource.values())).toBeLessThanOrEqual(3);
    // One position per line: a rebuild diffs by position.
    expect(text.split("\n").length).toBe(pack.positions.length + 3);
    expect(text.endsWith("]}\n")).toBe(true);
  });

  test.each(pack.positions.map((p) => [p.id, p] as const))("position %s", (id, p: TrainingPosition) => {
    const givens = digits(p.givens),
      values = digits(p.values),
      solution = digits(p.solution);
    for (const grid of [p.givens, p.values, p.solution]) expect(grid).toMatch(/^[0-9]{81}$/);
    expect(id).toBe(
      createHash("sha256").update(`${p.givens}|${p.values}|${p.kind}`).digest("hex").slice(0, 16),
    );
    // The oracle's unique solution, from the givens alone.
    const found = oracle({ givens, limit: 2, maxNodes: 2_000_000 });
    expect(found.exhausted).toBe(true);
    expect(found.witnesses).toEqual([solution]);
    // Values extend the givens and agree with the solution; an open cell remains.
    values.forEach((v, cell) => {
      if (givens[cell]) expect(v).toBe(givens[cell]);
      if (v) expect(v).toBe(solution[cell]);
    });
    expect(values.some((v) => !v)).toBe(true);
    // Catalogue tiers as data (manifest.ts): never read from the solver here.
    expect(TIERS[p.technique]).toBeDefined();
    expect(p.tier).toBe(TIERS[p.technique]);
    expect(p.tier).toBeLessThanOrEqual(2);
    expect(p.name.length).toBeGreaterThan(0);
    for (const cell of p.cells) expect(cell >= 0 && cell < 81).toBe(true);
    expect(p.targets.length).toBeGreaterThan(0);
    for (const [cell, digit] of p.targets) {
      expect(values[cell]).toBe(0);
      expect(digit).toBe(solution[cell]);
    }
    if (p.kind === "scan") {
      expect(["c01@1", "c02@1"]).toContain(p.technique);
      expect(p.candidates).toBeUndefined();
      expect(p.removed).toEqual([]);
      // A single from the placed digits alone, and the targets are exactly those singles.
      const scan = singles(values, fromPlaced(values));
      expect(scan.size).toBeGreaterThan(0);
      expect(pairs(p.targets)).toEqual(scan);
      return;
    }
    expect(p.kind).toBe("technique");
    expect(p.tier).toBeGreaterThanOrEqual(1);
    // The pattern cells are what the explanation draws (spec §4.1, T5).
    expect(p.cells.length).toBeGreaterThan(0);
    const masks = p.candidates ?? [];
    expect(masks.length).toBe(81);
    const shown = setsOf(masks, values),
      placed = fromPlaced(values);
    masks.forEach((mask, cell) => {
      if (values[cell]) expect(mask).toBe(0);
      else {
        // Every mask holds the solution digit and only digits the placed ones allow.
        expect(shown[cell].has(solution[cell])).toBe(true);
        for (const d of shown[cell]) expect(placed[cell].has(d)).toBe(true);
      }
    });
    // The shown candidates still admit exactly the solution (oracle with domains).
    const restricted = oracle({
      givens: values,
      domains: values.map((v, cell) => (v ? bit(v) : masks[cell])),
      limit: 2,
      maxNodes: 2_000_000,
    });
    expect(restricted.witnesses).toEqual([solution]);
    expect(singles(values, shown).size).toBe(0);
    expect(p.removed.length).toBeGreaterThan(0);
    for (const [cell, digit] of p.removed) {
      expect(shown[cell].has(digit)).toBe(true);
      expect(digit).not.toBe(solution[cell]);
      shown[cell].delete(digit);
    }
    const after = singles(values, shown);
    expect(after.size).toBeGreaterThan(0);
    expect(pairs(p.targets)).toEqual(after);
  });

  test("this file imports nothing from src/solver, directly or through its imports", () => {
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      expect(file.replace(/\\/g, "/")).not.toMatch(/\/src\/solver\//);
      const source = readFileSync(file, "utf8");
      for (const [, spec] of source.matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)) {
        if (!spec.startsWith(".")) continue;
        const base = resolve(dirname(file), spec);
        const next = [`${base}.ts`, base, join(base, "index.ts")].find(
          (candidate) => existsSync(candidate) && /\.(ts|json)$/.test(candidate),
        );
        expect(next, `${spec} from ${file}`).toBeDefined();
        if (next?.endsWith(".ts")) visit(next);
      }
    };
    visit(fileURLToPath(import.meta.url));
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
});
