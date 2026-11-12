import { expect, test } from "vitest";
import {
  CLASSIC_SOLVE_LIMITS,
  solveClassic,
  type ClassicSolveEvent,
} from "../../../src/solver/classic-run";
import { oracle } from "../../solver/oracle";
import evalCorpus from "../../solver/bench/eval-corpus.json";

/**
 * M2.7 S5 (D105): the technique selection proposal's §2 puzzle as a stall
 * case. It is AI Escargot, already the corpus case `escargot`, so no case is
 * added; this file pins the identity and the stall. It asserts the count and
 * the solution only, never a solving technique: the catalogue may have no
 * deduction that finishes it.
 */
const PROPOSAL_PUZZLE =
  "1....7.9..3..2...8..96..5....53..9...1..8...26....4...3......1..4......7..7...3..";
const entry = evalCorpus.cases.find((candidate) => candidate.id === "escargot");

test("the proposal's §2 puzzle is the corpus case escargot", () => {
  expect(entry?.puzzle).toBe(PROPOSAL_PUZZLE.replace(/\./g, "0"));
  expect(evalCorpus.cases.filter((candidate) => candidate.puzzle === entry?.puzzle)).toHaveLength(
    1,
  );
});

test("count unique and the stored solution match the Algorithm X oracle", () => {
  const independent = oracle({
    givens: [...(entry?.puzzle ?? "")].map(Number),
    limit: 2,
    maxNodes: 50_000_000,
  });
  expect(independent.interrupted).toBe(false);
  expect(independent.witnesses).toHaveLength(1);
  expect(entry?.count).toBe("1");
  expect(independent.witnesses[0].join("")).toBe(entry?.solution);
});

test("the classic run stalls or stops: human is incomplete or stalled-within-profile", async () => {
  const events: ClassicSolveEvent[] = [];
  await solveClassic(
    {
      givens: [...(entry?.puzzle ?? "")].map(Number),
      limits: { ...CLASSIC_SOLVE_LIMITS, timeMs: 3_600_000, workUnits: 2_000_000 },
    },
    { clock: { now: () => 0 }, emit: (event) => events.push(event) },
  );
  const result = events.at(-1);
  if (result?.kind !== "result") throw new Error("no result");
  expect(["incomplete", "stalled-within-profile"]).toContain(result.human);
  expect(result.count).toBe("unique");
  expect(result.solution?.join("")).toBe(entry?.solution);
});
