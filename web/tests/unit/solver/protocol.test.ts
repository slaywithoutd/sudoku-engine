import { expect, test } from "vitest";
import { decodeMessage } from "../../../src/solver/transport/protocol";

const key = {
  requestId: "r",
  snapshotId: "s",
  inputRevision: 0,
  problemKey: "p",
  operation: "primary" as const,
  mode: "explain" as const,
  engine: "engine@1",
  profile: "classic-expanded@1",
  scheduler: "scheduler@1",
  checker: "checker@1",
  exact: "original-dfs@1",
  optionsKey: "o",
  parentEvidenceId: null,
};
test("decodes a strict sequenced worker envelope", () => {
  expect(
    decodeMessage({
      protocol: 2,
      key,
      seq: 1,
      type: "stats",
      phase: "human",
      stats: { workUnits: 1, exactNodes: 0, steps: 0, elapsedMs: 1 },
    }),
  ).toMatchObject({ protocol: 2, seq: 1 });
  expect(() => decodeMessage({ protocol: 1, key, seq: 1, type: "stats" })).toThrow();
  expect(() => decodeMessage({ protocol: 2, key, seq: 0, type: "stats" })).toThrow();
});
