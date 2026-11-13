/**
 * Training pack builder (training puzzles spec §5.2, D106). Test-only and
 * offline: it generates classic puzzles with the repository's own generator
 * (unique by the independent oracles), runs Explain under a pinned policy with
 * a work-only budget and a clock that never moves, and harvests positions from
 * the checked trace. Same seeds, same pack, byte for byte (D094).
 *
 * Rebuild deliberately with
 * `TRAIN_PACK=write npx vitest run tests/unit/training-pack-build.test.ts`;
 * the independent checks live in `tests/unit/training-pack.test.ts` and import
 * nothing from `src/solver`.
 */
import { createHash } from "node:crypto";
import { classicCase } from "./generate";
import { solveClassic, type ClassicSolveEvent } from "../../../src/solver/classic-run";
import { EXACT_METHOD } from "../../../src/solver/exact";
import { coverageEntries } from "../../../src/solver/techniques/manifest";
import type { PolicyId } from "../../../src/solver/scheduling/work";
import {
  TRAINING_PACK_SCHEMA,
  type TrainingPack,
  type TrainingPosition,
} from "../../../src/domain/training-pack";

type Step = Extract<ClassicSolveEvent, { kind: "step" }>;

export const PACK_POLICY: PolicyId = "explain-fair@3";
/**
 * Only tiers 0–2 run (M2.7 preset, D105): the pack holds nothing above, and a
 * tier ≥ 3 search would only spend the budget. A step of tier ≤ 2 is never
 * set-limited under this set, so the "no simpler step" label is unchanged.
 */
export const PACK_TECHNIQUES = "up-to-wings-fish@1";
/** mulberry32 seeds `PACK_SEED_BASE + i`, i = 0, 1, … in order. */
export const PACK_SEED_BASE = 0x7a1a0000;
/** The first pack: tiers 0–2 (D106 item 5). */
export const PACK_MAX_TIER = 2;
/** At most this many positions come from one source puzzle (spec §8). */
export const PER_PUZZLE = 3;
/** About 500 positions (D106 item 5). */
export const PACK_TARGET = 500;
/** Scan positions are plentiful; they stop at this many so technique ones keep room. */
export const SCAN_CAP = 200;
/** No technique family takes more than this many entries. */
export const FAMILY_CAP = 120;
/** Seeds tried before the pack is closed short of its target. */
export const MAX_SEEDS = 4000;

// The work cap, not the clock, ends a run: the trace is the same on any machine.
// (The proof checker also reads performance.now() against timeMs; one check
// never comes near 600 s, so that bound is never what stops a pack run.)
const LIMITS = Object.freeze({
  timeMs: 600_000,
  workUnits: 4_000_000,
  exactNodes: 1_000_000,
  stepNodes: 4096,
  runNodes: 65536,
  proofBytes: 8_000_000,
  stepBytes: 2_000_000,
  batchBytes: 65536,
  inFlightBatches: 2,
  workspaceBytes: 64_000_000,
});

const tierOf = new Map(coverageEntries.map((entry) => [entry.version, entry.tier] as const));

const HOUSES: readonly (readonly number[])[] = (() => {
  const houses: number[][] = [];
  for (let i = 0; i < 9; i++) {
    houses.push(Array.from({ length: 9 }, (_, c) => i * 9 + c));
    houses.push(Array.from({ length: 9 }, (_, r) => r * 9 + i));
    const br = Math.floor(i / 3) * 3,
      bc = (i % 3) * 3;
    houses.push(Array.from({ length: 9 }, (_, k) => (br + Math.floor(k / 3)) * 9 + bc + (k % 3)));
  }
  return houses;
})();

/** Candidates from the placed digits alone (rows, columns, boxes), 0 for a filled cell. */
export function scanCandidates(values: readonly number[]): number[] {
  const masks = values.map((v) => (v ? 0 : 511));
  for (const house of HOUSES) {
    let used = 0;
    for (const cell of house) if (values[cell]) used |= 1 << (values[cell] - 1);
    for (const cell of house) if (!values[cell]) masks[cell] &= ~used;
  }
  return masks;
}

/** Naked and hidden singles in `masks` over the empty cells, as sorted [cell, digit] pairs. */
export function singlesOf(values: readonly number[], masks: readonly number[]): [number, number][] {
  const found = new Map<number, number>();
  for (let cell = 0; cell < 81; cell++)
    if (!values[cell] && masks[cell] && (masks[cell] & (masks[cell] - 1)) === 0)
      found.set(cell, Math.log2(masks[cell]) + 1);
  for (const house of HOUSES)
    for (let digit = 1; digit <= 9; digit++) {
      if (house.some((cell) => values[cell] === digit)) continue;
      const spots = house.filter((cell) => !values[cell] && masks[cell] & (1 << (digit - 1)));
      if (spots.length === 1) found.set(spots[0], digit);
    }
  return [...found].sort((a, b) => a[0] - b[0]);
}

export function positionId(
  givens: readonly number[],
  values: readonly number[],
  kind: string,
): string {
  return createHash("sha256")
    .update(`${givens.join("")}|${values.join("")}|${kind}`)
    .digest("hex")
    .slice(0, 16);
}

function grid(values: readonly number[]): string {
  return values.join("");
}

interface Candidate {
  readonly position: TrainingPosition;
  /** Within one puzzle: lower first. */
  readonly rank: readonly number[];
}

export interface SeedTrace {
  readonly givens: readonly number[];
  readonly solution: readonly number[];
  readonly steps: readonly Step[];
}

/** The generated puzzle of `seed` and its Explain trace; undefined without a unique solution. */
export async function traceSeed(seed: number): Promise<SeedTrace | undefined> {
  const made = classicCase(seed);
  if (!made) return undefined;
  const givens = [...made.puzzle].map(Number);
  const events: ClassicSolveEvent[] = [];
  await solveClassic(
    {
      givens,
      limits: LIMITS,
      mode: "explain",
      policy: PACK_POLICY,
      techniqueSelection: { preset: PACK_TECHNIQUES },
    },
    { clock: { now: () => 0 }, emit: (event) => events.push(event) },
  );
  const result = events.at(-1);
  if (result?.kind !== "result" || result.count !== "unique" || !result.solution) return undefined;
  return {
    givens,
    solution: [...result.solution],
    steps: events.filter((event): event is Step => event.kind === "step"),
  };
}

export interface SeedHarvest {
  /** Eligible technique positions, highest tier first, then the earliest state. */
  readonly techniques: readonly TrainingPosition[];
  /** The best scan position: fewest singles, then the emptiest board, then the earliest. */
  readonly scan?: TrainingPosition;
}

/** Every eligible position of one source puzzle. */
export async function harvestSeed(seed: number): Promise<SeedHarvest> {
  const trace = await traceSeed(seed);
  if (!trace) return { techniques: [] };
  const { givens, solution, steps } = trace;
  const source = (step: number) => ({
    seed,
    step,
    policy: PACK_POLICY,
    method: EXACT_METHOD,
  });
  const scans: Candidate[] = [],
    techniques: Candidate[] = [];
  let before: readonly number[] = givens;
  for (const [index, step] of steps.entries()) {
    const values = before;
    before = step.values;
    // The event's values are the board after the step: the board before plus its placements.
    const expected = [...values];
    for (const effect of step.effects) if (effect.kind === "place") expected[effect.cell] = effect.symbol;
    if (expected.join("") !== before.join(""))
      throw new Error(`seed ${seed} step ${index}: values are not the board after the step`);
    const tier = tierOf.get(step.technique);
    // A simpler step may exist past a capped or switched-off job: never harvested.
    if (tier === undefined || tier > PACK_MAX_TIER || step.budgetLimited || step.setLimited)
      continue;
    const empty = values.filter((v) => !v).length;
    if (tier === 0) {
      const placed = step.effects.find((effect) => effect.kind === "place");
      if (!placed) continue;
      const targets = singlesOf(values, scanCandidates(values));
      if (!targets.some(([cell, digit]) => cell === placed.cell && digit === placed.symbol))
        continue;
      scans.push({
        position: {
          id: positionId(givens, values, "scan"),
          kind: "scan",
          givens: grid(givens),
          values: grid(values),
          solution: grid(solution),
          tier,
          technique: step.technique,
          name: step.name,
          cells: [...step.cells].sort((a, b) => a - b),
          removed: [],
          targets,
          source: source(index),
        },
        // Fewest singles to find, then the emptiest board, then the earliest state.
        rank: [targets.length, -empty, index],
      });
      continue;
    }
    if (!step.effects.length || step.effects.some((effect) => effect.kind !== "remove")) continue;
    const shown = step.candidates.map((mask, cell) => (values[cell] ? 0 : mask));
    if (singlesOf(values, shown).length) continue;
    const after = [...shown];
    for (const effect of step.effects) after[effect.cell] &= ~(1 << (effect.symbol - 1));
    const targets = singlesOf(values, after);
    if (!targets.length) continue;
    techniques.push({
      position: {
        id: positionId(givens, values, "technique"),
        kind: "technique",
        givens: grid(givens),
        values: grid(values),
        candidates: shown,
        solution: grid(solution),
        tier,
        technique: step.technique,
        name: step.name,
        cells: [...step.cells].sort((a, b) => a - b),
        removed: step.effects
          .map((effect) => [effect.cell, effect.symbol] as [number, number])
          .sort((a, b) => a[0] - b[0] || a[1] - b[1]),
        targets,
        source: source(index),
      },
      // Highest tier first, then the earliest state.
      rank: [-tier, index],
    });
  }
  const byRank = (a: Candidate, b: Candidate) => {
    for (let i = 0; i < a.rank.length; i++) if (a.rank[i] !== b.rank[i]) return a.rank[i] - b.rank[i];
    return 0;
  };
  return {
    techniques: [...techniques].sort(byRank).map((candidate) => candidate.position),
    scan: [...scans].sort(byRank)[0]?.position,
  };
}

export function categoryKey(position: Pick<TrainingPosition, "kind" | "technique">): string {
  return position.kind === "scan" ? "scan" : position.technique;
}

/**
 * The positions one puzzle contributes: technique positions first (they are
 * rare), one per family before a second of the same family, keeping a slot for
 * the scan position while scan positions are still wanted; at most PER_PUZZLE.
 */
export function choose(
  harvest: SeedHarvest,
  room: (category: string) => number,
): TrainingPosition[] {
  const scan = harvest.scan && room("scan") > 0 ? harvest.scan : undefined;
  const chosen: TrainingPosition[] = [];
  const used = new Map<string, number>();
  for (const pass of [0, 1])
    for (const position of harvest.techniques) {
      if (chosen.length >= PER_PUZZLE - (scan ? 1 : 0)) break;
      const family = categoryKey(position),
        count = used.get(family) ?? 0;
      if (chosen.includes(position) || count >= room(family) || (pass === 0 && count > 0)) continue;
      used.set(family, count + 1);
      chosen.push(position);
    }
  if (scan) chosen.push(scan);
  // Two states of one trace can show the same board (an effect-free step).
  const seen = new Set<string>();
  return chosen.filter((position) => !seen.has(position.id) && seen.add(position.id));
}

/**
 * Seeds in order until the target is met; each category stops at its cap.
 * Deterministic in the seed list, so a prefix of seeds yields a prefix of the
 * pack while no cap is reached.
 */
export async function buildPack(
  seeds: Iterable<number> = defaultSeeds(),
  target = PACK_TARGET,
): Promise<TrainingPack> {
  const taken = new Map<string, number>();
  const ids = new Set<string>();
  const positions: TrainingPosition[] = [];
  let tried = 0;
  for (const seed of seeds) {
    if (positions.length >= target) break;
    tried++;
    const room = (category: string) =>
      (category === "scan" ? SCAN_CAP : FAMILY_CAP) - (taken.get(category) ?? 0);
    for (const position of choose(await harvestSeed(seed), room)) {
      if (positions.length >= target || ids.has(position.id)) continue;
      const key = categoryKey(position);
      taken.set(key, (taken.get(key) ?? 0) + 1);
      ids.add(position.id);
      positions.push(position);
    }
  }
  positions.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    schema: TRAINING_PACK_SCHEMA,
    generator: "tests/solver/bench/training-pack.ts",
    license: "repository-generated",
    policy: PACK_POLICY,
    seeds: { base: PACK_SEED_BASE, tried },
    positions,
  };
}

export function* defaultSeeds(): Generator<number> {
  for (let i = 0; i < MAX_SEEDS; i++) yield PACK_SEED_BASE + i;
}

/** One position per line, so a rebuild diffs by position. */
export function serializePack(pack: TrainingPack): string {
  const { positions, ...header } = pack;
  const head = JSON.stringify(header).slice(0, -1);
  return `${head},"positions":[\n${positions.map((p) => JSON.stringify(p)).join(",\n")}\n]}\n`;
}
