import { describe, expect, test } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { solveClassic, type ClassicSolveEvent } from "../../../src/solver/classic-run";

/**
 * Golden Explain traces under explain-fair@1 (spec §3.12 metric F and the T10
 * non-regression gate). The trace records only what the deduction sequence is
 * — technique ids and effects — never node ids or timings, so root-id shifts
 * (the M2.5 house sums) cannot move it while a changed step order would.
 *
 * Regenerate deliberately with GOLDEN_TRACES=write; a diff must be explained
 * in the decisions log, not absorbed.
 */
const goldenPath = fileURLToPath(
  new URL("../../solver/fixtures/golden-traces.json", import.meta.url),
);

interface GoldenTrace {
  readonly id: string;
  readonly puzzle: string;
  readonly result: { human: string; count: string; steps: number };
  readonly steps: readonly { technique: string; effects: string }[];
}

// The work cap, not the clock, ends the run: the recorded trace is the same on any machine.
const limits = {
  timeMs: 600_000,
  workUnits: 40_000_000,
  exactNodes: 1_000_000,
  stepNodes: 4096,
  runNodes: 65536,
  proofBytes: 8_000_000,
  stepBytes: 2_000_000,
  batchBytes: 65536,
  inFlightBatches: 2,
  workspaceBytes: 64_000_000,
};

async function trace(id: string, puzzle: string): Promise<GoldenTrace> {
  const events: ClassicSolveEvent[] = [];
  await solveClassic(
    { givens: [...puzzle].map(Number), limits, mode: "explain" },
    { clock: { now: () => Date.now() }, emit: (event) => events.push(event) },
  );
  const result = events.at(-1);
  if (result?.kind !== "result") throw new Error("no result");
  return {
    id,
    puzzle,
    result: { human: result.human, count: result.count, steps: result.steps },
    steps: events
      .filter(
        (event): event is Extract<ClassicSolveEvent, { kind: "step" }> => event.kind === "step",
      )
      .map((step) => ({
        technique: step.technique,
        effects: step.effects
          .map((effect) => `${effect.kind[0]}${effect.cell}:${effect.symbol}`)
          .sort()
          .join(","),
      })),
  };
}

const golden = JSON.parse(readFileSync(goldenPath, "utf8")) as { traces: GoldenTrace[] };

describe("golden classic traces under explain-fair@1", () => {
  test.each(golden.traces.map((entry) => [entry.id, entry] as const))(
    "%s keeps its deduction sequence",
    async (_id, entry) => {
      const current = await trace(entry.id, entry.puzzle);
      if (process.env.GOLDEN_TRACES === "write") {
        const index = golden.traces.findIndex((candidate) => candidate.id === entry.id);
        golden.traces[index] = current;
        writeFileSync(goldenPath, `${JSON.stringify(golden, null, 2)}\n`);
        return;
      }
      expect(current.result).toEqual(entry.result);
      expect(current.steps).toEqual(entry.steps);
    },
    600_000,
  );
});
