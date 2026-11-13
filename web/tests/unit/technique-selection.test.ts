import { expect, test } from "vitest";
import {
  SELECTABLE_IDS,
  switchAllTechniques,
  switchTechnique,
  techniqueSelectionOf,
  techniqueSetText,
} from "../../src/ui/technique-selection";

// M2.7 S3 review (D105): the Solve screen's request and the custom-set edits.
const settings = (solverTechniquePreset: string, solverTechniquesOff: string[] = []) => ({
  solverTechniquePreset,
  solverTechniquesOff,
});

test("All sends no selection; a preset sends its id; Custom sends the stored list", () => {
  expect(techniqueSelectionOf(settings("all@1", ["C06"]))).toBeUndefined();
  expect(techniqueSelectionOf(settings("no-fish@1", ["C06"]))).toEqual({ preset: "no-fish@1" });
  expect(techniqueSelectionOf(settings("custom", ["C06", "U01"]))).toEqual({
    off: ["C06", "U01"],
  });
  expect(techniqueSelectionOf(settings("custom"))).toEqual({ off: [] });
});
test("the set line counts the classic families", () => {
  expect(SELECTABLE_IDS).toHaveLength(33);
  expect(techniqueSetText(settings("all@1"))).toBe("Techniques: All");
  expect(techniqueSetText(settings("no-fish@1"))).toBe("Techniques: No fish (28 of 33)");
  expect(techniqueSetText(settings("custom", ["C06", "K01", "U01"]))).toBe(
    "Techniques: Custom (32 of 33)",
  );
});
test("custom edits keep the ids the screen does not show, sorted and unique", () => {
  const stored = ["C06", "K01", "U01"];
  expect(switchTechnique(stored, "C24", false)).toEqual(["C06", "C24", "K01", "U01"]);
  expect(switchTechnique(stored, "C06", true)).toEqual(["K01", "U01"]);
  expect(switchTechnique(stored, "C06", false)).toEqual(stored);
  expect(switchAllTechniques(stored, true)).toEqual(["K01", "U01"]);
  const off = switchAllTechniques(stored, false);
  expect(off).toHaveLength(35);
  expect(off).toContain("K01");
  expect(off).toContain("U01");
  expect([...off].sort()).toEqual(off);
});
