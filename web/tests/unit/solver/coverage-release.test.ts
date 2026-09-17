import { expect, test } from "vitest";
import { getTechniques, profileReadiness } from "../../../src/solver/techniques/registry";
test("release profiles expose all independently verified named rows", () => {
  expect(profileReadiness("classic-expanded@1").missing).toEqual([]);
  expect(profileReadiness("classic-conditional@1").missing).toEqual([]);
  expect(getTechniques("classic-expanded@1").length).toBeGreaterThanOrEqual(33);
});
