/**
 * Training puzzles (spec §4, §5.4, D106): attempts, streaks, per-category
 * aggregates, the missed queue and a bounded ring of recent attempts, all in
 * the library's `training` section. Pure functions; the screens own the clock.
 */
import type { TrainingPosition } from "./training-pack";

/** The most recent attempts kept (spec §5.4); older ones are dropped. */
export const ATTEMPT_RING = 500;
/** Correct times kept per category for its median (spec §4.3). */
export const RECENT_TIMES = 20;
/** A Train category id: `scan` or a catalogue version (D106); the pack test checks it. */
export const TRAIN_CATEGORY_PATTERN = /^(?:scan|c\d\d@\d+)$/;
/** Never more than one queued entry per position, so the queue is bounded by the pack. */
export type TrainingResult = "correct" | "miss";

export interface TrainingAttempt {
  readonly position: string;
  readonly category: string;
  readonly at: string;
  /** Active milliseconds from the position appearing to the answer. */
  readonly ms: number;
  readonly result: TrainingResult;
  /** The cell and digit the player entered. */
  readonly cell: number;
  readonly digit: number;
}
export interface CategoryRecord {
  readonly attempts: number;
  readonly correct: number;
  readonly bestMs: number | null;
  /** The last RECENT_TIMES correct times, oldest first. */
  readonly recentMs: readonly number[];
}
export interface PositionRecord {
  readonly attempts: number;
  readonly correct: number;
  readonly last: TrainingResult;
  readonly bestMs: number | null;
}
export interface MissedRecord {
  readonly position: string;
  /** Due once `attemptCount` reaches this value. */
  readonly due: number;
}
export interface TrainingData {
  /** Every recorded attempt ever, also those the ring has dropped. */
  readonly attemptCount: number;
  readonly streak: number;
  readonly longestStreak: number;
  readonly categories: Readonly<Record<string, CategoryRecord>>;
  readonly positions: Readonly<Record<string, PositionRecord>>;
  /** Oldest miss first. */
  readonly missed: readonly MissedRecord[];
  /** Oldest first, at most ATTEMPT_RING. */
  readonly attempts: readonly TrainingAttempt[];
}

export function emptyTraining(): TrainingData {
  return {
    attemptCount: 0,
    streak: 0,
    longestStreak: 0,
    categories: {},
    positions: {},
    missed: [],
    attempts: [],
  };
}

/** A category is `scan`, or the technique family (versioned catalogue row) of the key step. */
export function categoryOf(position: Pick<TrainingPosition, "kind" | "technique">): string {
  return position.kind === "scan" ? "scan" : position.technique;
}

const FAMILY_LABELS: Readonly<Record<string, string>> = {
  scan: "Scanning",
  "c04@1": "Naked and hidden subsets",
  "c05@1": "Locked subsets",
  "c06@1": "Fish",
  "c10@1": "Single-digit patterns",
  "c11@1": "Wings",
  "c13@1": "Remote pairs",
};
/** Display name of a category, in pack order of difficulty. */
export function categoryLabel(category: string): string {
  return FAMILY_LABELS[category] ?? category;
}
/** Categories sorted for display: scanning first, then by the catalogue id. */
export function compareCategories(a: string, b: string): number {
  if (a === b) return 0;
  if (a === "scan") return -1;
  if (b === "scan") return 1;
  return a < b ? -1 : 1;
}

const SUBSET_SIZES: Readonly<Record<number, string>> = { 2: "Pair", 3: "Triple", 4: "Quad" };
/**
 * The technique a position was found with, for "found with …" copy (never
 * "requires"): the engine's step name, except for C04, which the engine names
 * "Naked Pair" whatever the subset. There the pattern cells are the subset:
 * removals outside them make it naked, removals inside them hidden.
 */
export function foundWith(
  position: Pick<TrainingPosition, "kind" | "technique" | "name" | "cells" | "removed">,
): string {
  if (position.kind === "scan" || position.technique !== "c04@1") return position.name;
  const subset = new Set(position.cells),
    inside = position.removed.filter(([cell]) => subset.has(cell)).length,
    size = SUBSET_SIZES[subset.size];
  if (!size || !position.removed.length) return categoryLabel(categoryOf(position));
  if (inside === 0) return `Naked ${size}`;
  if (inside === position.removed.length) return `Hidden ${size}`;
  return categoryLabel(categoryOf(position));
}

export function isCorrect(
  position: Pick<TrainingPosition, "solution">,
  cell: number,
  digit: number,
) {
  return Number(position.solution[cell]) === digit;
}

/** Median of a list (mean of the middle two for an even length); null when empty. */
export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const best = (current: number | null, ms: number) =>
  current === null ? ms : Math.min(current, ms);

/**
 * Records one answered attempt. `repeatGap` 0 never queues a miss; otherwise a
 * missed position is due again after that many other attempts. A correct
 * answer takes the position off the queue.
 */
export function recordAttempt(
  data: TrainingData,
  attempt: TrainingAttempt,
  repeatGap: number,
): TrainingData {
  const correct = attempt.result === "correct",
    attemptCount = data.attemptCount + 1,
    streak = correct ? data.streak + 1 : 0;
  const category = data.categories[attempt.category] ?? {
      attempts: 0,
      correct: 0,
      bestMs: null,
      recentMs: [],
    },
    position = data.positions[attempt.position];
  const missed = data.missed.filter((entry) => entry.position !== attempt.position);
  if (!correct && repeatGap > 0)
    missed.push({ position: attempt.position, due: attemptCount + repeatGap });
  return {
    attemptCount,
    streak,
    longestStreak: Math.max(data.longestStreak, streak),
    categories: {
      ...data.categories,
      [attempt.category]: {
        attempts: category.attempts + 1,
        correct: category.correct + (correct ? 1 : 0),
        bestMs: correct ? best(category.bestMs, attempt.ms) : category.bestMs,
        recentMs: correct
          ? [...category.recentMs, attempt.ms].slice(-RECENT_TIMES)
          : category.recentMs,
      },
    },
    positions: {
      ...data.positions,
      [attempt.position]: {
        attempts: (position?.attempts ?? 0) + 1,
        correct: (position?.correct ?? 0) + (correct ? 1 : 0),
        last: attempt.result,
        bestMs: correct ? best(position?.bestMs ?? null, attempt.ms) : (position?.bestMs ?? null),
      },
    },
    missed,
    attempts: [...data.attempts, attempt].slice(-ATTEMPT_RING),
  };
}

export interface CategoryStats {
  readonly category: string;
  readonly attempts: number;
  readonly correct: number;
  /** correct / attempts, or null before the first attempt. */
  readonly accuracy: number | null;
  readonly bestMs: number | null;
  readonly medianMs: number | null;
}
export function categoryStats(data: TrainingData): CategoryStats[] {
  return Object.entries(data.categories)
    .map(([category, record]) => ({
      category,
      attempts: record.attempts,
      correct: record.correct,
      accuracy: record.attempts ? record.correct / record.attempts : null,
      bestMs: record.bestMs,
      medianMs: median(record.recentMs),
    }))
    .sort((a, b) => compareCategories(a.category, b.category));
}

export interface OverallStats {
  readonly streak: number;
  readonly longestStreak: number;
  readonly positionsSeen: number;
  readonly missedWaiting: number;
}
/**
 * `known`: the ids of the current pack. A position a later pack no longer
 * holds is counted neither as seen nor, if queued, as waiting (it can never
 * come back).
 */
export function overallStats(data: TrainingData, known?: ReadonlySet<string>): OverallStats {
  return {
    streak: data.streak,
    longestStreak: data.longestStreak,
    positionsSeen: known
      ? Object.keys(data.positions).filter((id) => known.has(id)).length
      : Object.keys(data.positions).length,
    missedWaiting: known
      ? data.missed.filter((entry) => known.has(entry.position)).length
      : data.missed.length,
  };
}

/**
 * The next position of a session (spec §4.2): a missed position whose gap has
 * passed comes first (oldest miss first), even if the session already showed
 * it; otherwise a random position of the selected categories the session has
 * not shown. Undefined when the session has shown them all.
 */
export function nextPosition(
  positions: readonly TrainingPosition[],
  data: TrainingData,
  options: {
    readonly categoriesOff: readonly string[];
    readonly shown: ReadonlySet<string>;
    readonly random: () => number;
    /** The position just answered never comes straight back. */
    readonly previous?: string;
    /** 0: missed positions never come back, also those queued before (the setting's "Never"). */
    readonly repeatGap?: number;
  },
): TrainingPosition | undefined {
  const off = new Set(options.categoriesOff),
    eligible = positions.filter((p) => !off.has(categoryOf(p)));
  const byId = new Map(eligible.map((p) => [p.id, p] as const));
  if (options.repeatGap !== 0)
    for (const entry of data.missed) {
      const position = byId.get(entry.position);
      if (position && entry.due <= data.attemptCount && position.id !== options.previous)
        return position;
    }
  const fresh = eligible.filter((p) => !options.shown.has(p.id));
  if (!fresh.length) return undefined;
  return fresh[Math.min(fresh.length - 1, Math.floor(options.random() * fresh.length))];
}

/** Every category the pack holds, sorted for display. */
export function packCategories(positions: readonly TrainingPosition[]): string[] {
  return [...new Set(positions.map(categoryOf))].sort(compareCategories);
}
