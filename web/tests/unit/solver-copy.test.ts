import { describe, expect, test } from "vitest";
import {
  countVerification,
  coverageLine,
  logicalSummary,
  logicStop,
  SET_LIMITED_NOTE,
  setLimitedSummary,
  stepNoteText,
  techniqueSetLine,
} from "../../src/ui/solver-copy";

// M2.6 T07: the Solve screen's count and logic lines (spec §4.5).
describe("solver copy", () => {
  test("count line by outcome", () => {
    expect(countVerification("unique", 312, "complete")).toBe("Count: verified in 0.3 s");
    expect(countVerification("unknown", undefined, "timeout")).toBe(
      "Count: not verified (time limit)",
    );
    expect(countVerification("unknown", undefined, "resource-limit")).toBe(
      "Count: not verified (work limit)",
    );
    expect(countVerification("unknown", undefined, "error")).toBe(
      "Count: not verified (solver error)",
    );
  });
  test("logic line by status and stop reason", () => {
    const coverage = (highestTierTried: number, notStarted = 0) => ({
      highestTierTried,
      notStarted: Array.from({ length: notStarted }, (_, i) => `t${i}`),
    });
    expect(logicStop("solved", "solved", coverage(0))).toBe("Logic: solved");
    expect(logicStop("not-started", "not-started", coverage(-1))).toBe("");
    expect(logicStop("incomplete", "tier-cap", coverage(4, 14))).toBe(
      "Logic: stalled at tier 4 (work cap); 14 techniques not tried",
    );
    expect(logicStop("stalled-within-profile", "profile-stall", coverage(6))).toBe(
      "Logic: stalled at tier 6 (no technique applies)",
    );
    expect(logicStop("incomplete", "time-limit", coverage(6, 1))).toBe(
      "Logic: stopped at tier 6 by the time limit; 1 technique not tried",
    );
    expect(logicStop("incomplete", "work-limit", coverage(-1, 30))).toBe(
      "Logic: stopped before any technique by the work limit; 30 techniques not tried",
    );
    expect(logicStop("invalidated", "contradiction", coverage(2))).toBe(
      "Logic: the explanation did not match the count",
    );
  });
});

// M2.7 S3 (D105): wording under a technique set.
describe("solver copy for technique sets", () => {
  const coverage = { highestTierTried: 2, notStarted: [] as string[] };
  test("a restricted stall speaks of the selected techniques, never of the puzzle", () => {
    expect(logicalSummary("stalled-within-profile", 27, true)).toBe(
      "No step with the selected techniques after 27 steps.",
    );
    expect(logicalSummary("stalled-within-profile", 27)).toBe(
      "Logical techniques stalled after 27 steps.",
    );
    expect(logicStop("stalled-within-profile", "profile-stall", coverage, true)).toBe(
      "Logic: stalled at tier 2 (no step with the selected techniques)",
    );
    for (const text of [
      logicalSummary("stalled-within-profile", 27, true),
      logicStop("stalled-within-profile", "profile-stall", coverage, true),
    ])
      expect(text).not.toMatch(/no technique applies|cannot be solved|needs harder/);
    // A budget stop is worded as before.
    expect(logicStop("incomplete", "tier-cap", coverage, true)).toBe(
      "Logic: stalled at tier 2 (work cap)",
    );
  });
  test("set-limited notes, the set line and the coverage line", () => {
    expect(SET_LIMITED_NOTE).toBe("A simpler step may exist: a simpler technique is switched off.");
    expect(setLimitedSummary(0)).toBe("");
    expect(setLimitedSummary(1)).toBe(
      "1 step may have a simpler explanation: a simpler technique is switched off.",
    );
    expect(setLimitedSummary(6)).toMatch(/^6 steps may/);
    expect(techniqueSetLine("All", 33, 33)).toBe("Techniques: All");
    expect(techniqueSetLine("No fish", 28, 33)).toBe("Techniques: No fish (28 of 33)");
    expect(coverageLine({ exhausted: ["a"], capped: ["b", "c"], notStarted: [] }, 5)).toBe(
      "Coverage: 1 exhausted, 2 capped, 0 not started, 5 not selected",
    );
    expect(coverageLine({ exhausted: [], capped: [], notStarted: ["x"] })).toBe(
      "Coverage: 0 exhausted, 0 capped, 1 not started",
    );
  });
  test("a stop by an interrupted lower job says so", () => {
    expect(
      logicStop("incomplete", "lower-interrupted", { highestTierTried: 6, notStarted: [] }),
    ).toBe("Logic: stopped at tier 6: a simpler technique was interrupted by its resource limit");
  });
  test("an empty set names no tier; the step note is one sentence", () => {
    expect(
      logicStop(
        "stalled-within-profile",
        "profile-stall",
        { highestTierTried: -1, notStarted: [] },
        true,
      ),
    ).toBe("Logic: no step with the selected techniques");
    expect(stepNoteText({})).toBe("");
    expect(stepNoteText({ setLimited: true })).toBe(SET_LIMITED_NOTE);
    expect(stepNoteText({ budgetLimited: true })).toMatch(/stopped at its limit\.$/);
    expect(stepNoteText({ budgetLimited: true, setLimited: true })).toBe(
      "A simpler step may exist: a simpler technique stopped at its limit or is switched off.",
    );
  });
});
