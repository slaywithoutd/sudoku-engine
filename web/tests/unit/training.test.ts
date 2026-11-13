import { describe, expect, test } from "vitest";
import {
  ATTEMPT_RING,
  RECENT_TIMES,
  categoryLabel,
  categoryOf,
  categoryStats,
  emptyTraining,
  foundWith,
  isCorrect,
  median,
  nextPosition,
  overallStats,
  packCategories,
  recordAttempt,
  TRAIN_CATEGORY_PATTERN,
  type TrainingAttempt,
  type TrainingData,
} from "../../src/domain/training";
import type { TrainingPosition } from "../../src/domain/training-pack";
import { createDraft, emptyLibrary, finishDraft, startPlay } from "../../src/domain/library";
import {
  exportBackup,
  parseBackup,
  previewRestore,
  validateLibrary,
} from "../../src/domain/backup";
import { NOW } from "../fixtures";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOLUTION = "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
function position(id: string, kind: "scan" | "technique", technique = "c02@1"): TrainingPosition {
  return {
    id,
    kind,
    givens: "0".repeat(81),
    values: "0".repeat(81),
    solution: SOLUTION,
    tier: kind === "scan" ? 0 : 1,
    technique,
    name: kind === "scan" ? "Hidden Single" : "Naked Pair",
    cells: [],
    removed: [],
    targets: [[0, 5]],
    source: { seed: 1, step: 0, policy: "explain-fair@3", method: "original-dfs@2" },
  };
}
const hex = (n: number) => n.toString(16).padStart(16, "0");
let clock = 0;
function attempt(
  id: string,
  result: "correct" | "miss",
  ms = 1000,
  category = "scan",
): TrainingAttempt {
  clock += 1000;
  return {
    position: id,
    category,
    at: new Date(Date.UTC(2026, 10, 13) + clock).toISOString(),
    ms,
    result,
    cell: 0,
    digit: result === "correct" ? 5 : 1,
  };
}

describe("training transitions", () => {
  test("a correct answer raises the streak, the category and the position record", () => {
    const data = recordAttempt(emptyTraining(), attempt(hex(1), "correct", 4200), 10);
    expect(data).toMatchObject({ attemptCount: 1, streak: 1, longestStreak: 1, missed: [] });
    expect(data.categories.scan).toEqual({ attempts: 1, correct: 1, bestMs: 4200, recentMs: [4200] });
    expect(data.positions[hex(1)]).toEqual({ attempts: 1, correct: 1, last: "correct", bestMs: 4200 });
    expect(data.attempts).toHaveLength(1);
  });
  test("a miss resets the streak, keeps the longest, records the miss and queues it", () => {
    let data = emptyTraining();
    data = recordAttempt(data, attempt(hex(1), "correct"), 10);
    data = recordAttempt(data, attempt(hex(2), "correct"), 10);
    data = recordAttempt(data, attempt(hex(3), "miss", 900), 10);
    expect(data).toMatchObject({ attemptCount: 3, streak: 0, longestStreak: 2 });
    expect(data.categories.scan).toMatchObject({ attempts: 3, correct: 2 });
    expect(data.positions[hex(3)]).toEqual({ attempts: 1, correct: 0, last: "miss", bestMs: null });
    expect(data.missed).toEqual([{ position: hex(3), due: 13 }]);
    // A miss never sets a best time or a median sample.
    expect(data.categories.scan.recentMs).toHaveLength(2);
  });
  test("best times keep the minimum per category and per position", () => {
    let data = emptyTraining();
    for (const ms of [3000, 1200, 2500])
      data = recordAttempt(data, attempt(hex(1), "correct", ms), 10);
    expect(data.categories.scan.bestMs).toBe(1200);
    expect(data.positions[hex(1)].bestMs).toBe(1200);
  });
  test("a repeat gap of 0 never queues a miss", () => {
    const data = recordAttempt(emptyTraining(), attempt(hex(1), "miss"), 0);
    expect(data.missed).toEqual([]);
  });
  test("a second miss re-queues once; a correct answer takes the position off", () => {
    let data = recordAttempt(emptyTraining(), attempt(hex(1), "miss"), 5);
    data = recordAttempt(data, attempt(hex(1), "miss"), 5);
    expect(data.missed).toEqual([{ position: hex(1), due: 7 }]);
    data = recordAttempt(data, attempt(hex(1), "correct"), 5);
    expect(data.missed).toEqual([]);
    expect(data.positions[hex(1)]).toMatchObject({ attempts: 3, correct: 1, last: "correct" });
  });
  test("categories are separate", () => {
    let data = recordAttempt(emptyTraining(), attempt(hex(1), "correct", 1000, "scan"), 10);
    data = recordAttempt(data, attempt(hex(2), "miss", 1000, "c04@1"), 10);
    expect(Object.keys(data.categories).sort()).toEqual(["c04@1", "scan"]);
    expect(data.categories["c04@1"]).toEqual({ attempts: 1, correct: 0, bestMs: null, recentMs: [] });
  });
  test("the ring never exceeds its bound and keeps the newest attempts", () => {
    let data: TrainingData = emptyTraining();
    for (let i = 0; i < ATTEMPT_RING + 37; i++)
      data = recordAttempt(data, attempt(hex(i), i % 3 ? "correct" : "miss", i + 1), 10);
    expect(data.attempts).toHaveLength(ATTEMPT_RING);
    expect(data.attemptCount).toBe(ATTEMPT_RING + 37);
    expect(data.attempts[0].position).toBe(hex(37));
    expect(data.attempts.at(-1)?.position).toBe(hex(ATTEMPT_RING + 36));
    expect(data.categories.scan.recentMs).toHaveLength(RECENT_TIMES);
    // The whole state still validates after the ring wrapped.
    const library = { ...emptyLibrary(), training: data };
    expect(validateLibrary(library).training).toEqual(data);
  });
  test("recording never mutates its input", () => {
    const before = recordAttempt(emptyTraining(), attempt(hex(1), "miss"), 10),
      frozen = structuredClone(before);
    recordAttempt(before, attempt(hex(1), "correct"), 10);
    expect(before).toEqual(frozen);
  });
});

describe("statistics", () => {
  test("median", () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  test("the median covers only the last 20 correct answers", () => {
    let data = emptyTraining();
    for (let i = 1; i <= 25; i++) data = recordAttempt(data, attempt(hex(i), "correct", i * 100), 10);
    // Times 600..2500 remain: median of 20 values = (1500 + 1600) / 2.
    expect(categoryStats(data)[0]).toMatchObject({ medianMs: 1550, bestMs: 100, accuracy: 1 });
  });
  test("category assignment and labels", () => {
    expect(categoryOf(position(hex(1), "scan", "c01@1"))).toBe("scan");
    expect(categoryOf(position(hex(1), "technique", "c04@1"))).toBe("c04@1");
    expect(categoryLabel("scan")).toBe("Scanning");
    expect(categoryLabel("c06@1")).toBe("Fish");
    expect(categoryLabel("c99@1")).toBe("c99@1");
    expect(foundWith(position(hex(1), "scan"))).toBe("Hidden Single");
    expect(foundWith(position(hex(1), "technique", "c04@1"))).toBe("Naked and hidden subsets");
    expect(packCategories([position(hex(2), "technique", "c06@1"), position(hex(1), "scan"), position(hex(3), "technique", "c04@1")])).toEqual(["scan", "c04@1", "c06@1"]);
  });
  test("overall statistics and accuracy", () => {
    let data = recordAttempt(emptyTraining(), attempt(hex(1), "correct"), 10);
    data = recordAttempt(data, attempt(hex(2), "miss"), 10);
    data = recordAttempt(data, attempt(hex(1), "correct"), 10);
    expect(overallStats(data)).toEqual({ streak: 1, longestStreak: 1, positionsSeen: 2, missedWaiting: 1 });
    expect(categoryStats(data)[0].accuracy).toBeCloseTo(2 / 3);
  });
  test("any digit equal to the solution is correct", () => {
    const p = position(hex(1), "scan");
    expect(isCorrect(p, 0, 5)).toBe(true);
    expect(isCorrect(p, 80, 9)).toBe(true);
    expect(isCorrect(p, 0, 4)).toBe(false);
  });
});

describe("position choice", () => {
  const pack = [
    position(hex(1), "scan"),
    position(hex(2), "scan"),
    position(hex(3), "technique", "c04@1"),
  ];
  const pick = (data: TrainingData, shown: string[], off: string[] = [], previous?: string) =>
    nextPosition(pack, data, { categoriesOff: off, shown: new Set(shown), random: () => 0, previous })?.id;
  test("random within the selected categories, never repeating in a session", () => {
    expect(pick(emptyTraining(), [])).toBe(hex(1));
    expect(pick(emptyTraining(), [hex(1)])).toBe(hex(2));
    expect(pick(emptyTraining(), [hex(1), hex(2)])).toBe(hex(3));
    expect(pick(emptyTraining(), [hex(1), hex(2), hex(3)])).toBeUndefined();
    expect(pick(emptyTraining(), [], ["scan"])).toBe(hex(3));
    expect(pick(emptyTraining(), [hex(3)], ["scan"])).toBeUndefined();
  });
  test("a missed position comes back first once its gap has passed", () => {
    let data = recordAttempt(emptyTraining(), attempt(hex(2), "miss"), 2);
    expect(pick(data, [hex(2)], [], hex(2))).toBe(hex(1));
    data = recordAttempt(data, attempt(hex(1), "correct"), 2);
    expect(pick(data, [hex(1), hex(2)])).toBe(hex(3));
    data = recordAttempt(data, attempt(hex(3), "correct", 1000, "c04@1"), 2);
    // Due now (3 >= 1 + 2), even though the session already showed it.
    expect(pick(data, [hex(1), hex(2), hex(3)])).toBe(hex(2));
    // Not when its category is switched off.
    expect(pick(data, [hex(1), hex(3)], ["scan"])).toBeUndefined();
    // Not once the setting is "Never", even though it was queued before.
    expect(
      nextPosition(pack, data, { categoriesOff: [], shown: new Set([hex(1), hex(2), hex(3)]), random: () => 0, repeatGap: 0 }),
    ).toBeUndefined();
  });
  test("a queued miss outside the current pack is not counted as waiting", () => {
    let data = recordAttempt(emptyTraining(), attempt(hex(2), "miss"), 10);
    data = recordAttempt(data, attempt(hex(99), "miss"), 10);
    expect(overallStats(data).missedWaiting).toBe(2);
    expect(overallStats(data, new Set(pack.map((p) => p.id))).missedWaiting).toBe(1);
  });
  test("every category of the committed pack is a valid settings id", () => {
    const committed = JSON.parse(
      readFileSync(fileURLToPath(new URL("../../src/assets/training-pack.json", import.meta.url)), "utf8"),
    ) as { positions: TrainingPosition[] };
    for (const category of packCategories(committed.positions))
      expect(category).toMatch(TRAIN_CATEGORY_PATTERN);
  });
});

describe("storage (format version 4)", () => {
  const library = () =>
    startPlay(finishDraft(createDraft(emptyLibrary(), "d", NOW), "d", "p", NOW), "p", NOW);
  const trained = () => {
    let training = recordAttempt(emptyTraining(), attempt(hex(1), "correct", 2100), 10);
    training = recordAttempt(training, attempt(hex(2), "miss", 800, "c04@1"), 10);
    const data = library();
    data.training = training;
    data.settings.trainCategoriesOff = ["c06@1", "scan"];
    data.settings.trainRepeatGap = 5;
    data.settings.trainShowClock = false;
    return data;
  };
  test.each([1, 2, 3])("a version %i library and backup load with empty training data", (version) => {
    const data = structuredClone(library()) as unknown as Record<string, any>;
    data.formatVersion = version;
    delete data.training;
    for (const key of ["trainShowClock", "trainCategoriesOff", "trainRepeatGap"]) delete data.settings[key];
    const loaded = validateLibrary(data);
    expect(loaded.formatVersion).toBe(4);
    expect(loaded.training).toEqual(emptyTraining());
    expect(loaded.settings).toMatchObject({ trainShowClock: true, trainCategoriesOff: [], trainRepeatGap: 10 });
    const restored = parseBackup(
      JSON.stringify({ format: "sudoku-engine-backup", version, exportedAt: NOW, data }),
    );
    expect(restored.version).toBe(4);
    expect(restored.data.training).toEqual(emptyTraining());
  });
  test("a version 4 backup round-trips training data and settings", () => {
    const data = trained(),
      text = exportBackup(data, NOW);
    expect(JSON.parse(text)).toMatchObject({ version: 4, data: { formatVersion: 4 } });
    const back = parseBackup(text).data;
    expect(back.training).toEqual(data.training);
    expect(back.settings).toMatchObject({ trainCategoriesOff: ["c06@1", "scan"], trainRepeatGap: 5, trainShowClock: false });
    expect(parseBackup(exportBackup(back, NOW)).data).toEqual(back);
  });
  test("restore keeps local training unless asked to replace it", () => {
    const local = library(),
      source = trained(),
      incoming = parseBackup(exportBackup(source, NOW));
    expect(previewRestore(local, incoming, () => "x", false).data.training).toEqual(emptyTraining());
    expect(previewRestore(local, incoming, () => "x", false, true).data.training).toEqual(
      source.training,
    );
    // A version 3 backup has no training section: it never erases local statistics.
    const old = structuredClone(library()) as unknown as Record<string, any>;
    old.formatVersion = 3;
    delete old.training;
    const v3 = parseBackup(
      JSON.stringify({ format: "sudoku-engine-backup", version: 3, exportedAt: NOW, data: old }),
    );
    expect(v3.trainingIncluded).toBe(false);
    expect(incoming.trainingIncluded).toBe(true);
    const kept = { ...local, training: source.training };
    expect(previewRestore(kept, v3, () => "x", false, true).data.training).toEqual(source.training);
  });
  test.each<[string, (t: any) => void]>([
    ["a streak above the attempt count", (t) => (t.streak = 9)],
    ["a longest streak below the streak", (t) => ((t.streak = 1), (t.longestStreak = 0))],
    ["an unknown category", (t) => (t.categories.bogus = t.categories.scan)],
    ["more correct than attempts", (t) => (t.categories.scan.correct = 5)],
    ["a best time without a correct answer", (t) => (t.categories["c04@1"].bestMs = 5)],
    ["a malformed position id", (t) => (t.positions.xyz = t.positions[hex(1)])],
    ["a missed position never missed", (t) => t.missed.push({ position: hex(1), due: 4 })],
    ["a duplicated missed entry", (t) => t.missed.push({ ...t.missed[0] })],
    ["a wrong result", (t) => (t.attempts[0].result = "maybe")],
    ["a digit out of range", (t) => (t.attempts[0].digit = 0)],
    ["more attempts than recorded", (t) => (t.attemptCount = 1)],
    ["a missing section", (t) => Object.keys(t).forEach((k) => delete t[k])],
  ])("rejects %s", (_name, mutate) => {
    const data = structuredClone(trained()) as unknown as Record<string, any>;
    mutate(data.training);
    expect(() => validateLibrary(data)).toThrow("Invalid backup data.");
  });
  test.each<unknown>([["scan", "scan"], ["c04@1", "c03@1"], ["Fish"], "scan", [1]])(
    "rejects trainCategoriesOff %j",
    (off) => {
      const data = structuredClone(library()) as unknown as Record<string, any>;
      data.settings.trainCategoriesOff = off;
      expect(() => validateLibrary(data)).toThrow("Invalid backup data.");
    },
  );
  test("rejects a repeat gap outside its choices", () => {
    const data = structuredClone(library()) as unknown as Record<string, any>;
    data.settings.trainRepeatGap = 7;
    expect(() => validateLibrary(data)).toThrow("Invalid backup data.");
  });
});
