import { describe, expect, test } from "vitest";
import { countVerification, logicStop } from "../../src/ui/solver-copy";

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
