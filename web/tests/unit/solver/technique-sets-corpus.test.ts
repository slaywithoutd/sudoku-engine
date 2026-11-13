import { describe, expect, test, vi } from "vitest";
import * as exact from "../../../src/solver/exact";
import {
  CLASSIC_SOLVE_LIMITS,
  solveClassic,
  type ClassicSolveEvent,
} from "../../../src/solver/classic-run";
import type { TechniqueSelection } from "../../../src/solver/techniques/technique-sets";
import evalCorpus from "../../solver/bench/eval-corpus.json";

/**
 * M2.7 S2 (D105), S1 note §6 table 4: count and checker results are
 * identical across technique sets on the evaluation corpus. The set never
 * reaches the exact phase (D049, D103), so `count` and `solution` cannot move.
 */

// Every exactSteps call in the pipeline goes through this spy (count-first.test.ts).
vi.mock("../../../src/solver/exact", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../src/solver/exact")>();
  return { ...original, exactSteps: vi.fn(original.exactSteps) };
});
const exactSteps = vi.mocked(exact.exactSteps);

const SETS: Record<string, TechniqueSelection> = {
  "all@1": { preset: "all@1" },
  "singles@1": { preset: "singles@1" },
  "no-fish@1": { preset: "no-fish@1" },
  // The empty set: every primary row switched off.
  empty: { off: Array.from({ length: 33 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`) },
};
// A case with zero or several solutions ends at the precount, so it keeps the
// default budget (norvig-hard1's count needs more than 1M units). A unique
// case runs the logical phase, which a 1.2M cut ends early on the hard cases;
// their counts settle well inside its 80 % precount share.
const unitsFor = (count: string) => (count === "1" ? 1_200_000 : CLASSIC_SOLVE_LIMITS.workUnits);
const label = (count: string) => (count === "1" ? "unique" : count === "0" ? "zero" : "multiple");

describe("table 4: count and checker results are identical across sets", () => {
  // One test per case, so no single test runs 131 x 4 solves under one timeout.
  test.for(evalCorpus.cases.map((entry) => [entry.id, entry] as const))(
    "4.1–4.4 on %s",
    async ([, entry]) => {
      const results: Extract<ClassicSolveEvent, { kind: "result" }>[] = [];
      for (const [name, selection] of Object.entries(SETS)) {
        const events: ClassicSolveEvent[] = [];
        exactSteps.mockClear();
        await solveClassic(
          {
            givens: [...entry.puzzle].map(Number),
            mode: "explain",
            limits: {
              ...CLASSIC_SOLVE_LIMITS,
              timeMs: 3_600_000,
              workUnits: unitsFor(entry.count),
            },
            techniqueSelection: selection,
          },
          { clock: { now: () => 0 }, emit: (event) => events.push(event) },
        );
        const id = `${entry.id} under ${name}`;
        const result = events.at(-1);
        if (result?.kind !== "result") throw new Error(id);
        results.push(result);
        // 4.1
        expect(result.count, id).toBe(label(entry.count));
        expect(result.solution?.join("") ?? null, id).toBe(
          entry.count === "1" ? entry.solution : null,
        );
        // 4.2 the exact phase starts once per run.
        expect(exactSteps, id).toHaveBeenCalledTimes(1);
        if (entry.count !== "1") continue;
        // 4.3 no step contradicts the corpus solution.
        const solution = [...(entry.solution as string)].map(Number);
        for (const event of events)
          if (event.kind === "step")
            for (const effect of event.effects)
              expect(
                effect.kind === "place"
                  ? effect.symbol === solution[effect.cell]
                  : effect.symbol !== solution[effect.cell],
                `${id}: step ${event.index}`,
              ).toBe(true);
        // 4.4
        if (result.human === "solved") expect(result.logicalValues, id).toEqual(solution);
      }
      expect(new Set(results.map((result) => result.count)).size, entry.id).toBe(1);
    },
  );
});
