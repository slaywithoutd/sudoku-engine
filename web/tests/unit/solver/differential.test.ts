import { expect, test } from "vitest";
import { exactSteps, isWitness } from "../../../src/solver/exact";
import { canonicalProblem } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
test("exact witnesses satisfy the independent assembled semantics", () => {
  const problem = canonicalProblem({
      schema: 1,
      cells: [0, 1],
      symbols: [1, 2],
      givens: [0, 0],
      constraints: [],
    }),
    assembly = assemble(problem, []);
  if (!assembly.ok) throw Error("assembly");
  const witnesses = [...exactSteps(problem, assembly.value)].filter(
    (event) => event.kind === "witness",
  );
  expect(witnesses).toHaveLength(2);
  for (const event of witnesses)
    expect(isWitness(problem, assembly.value, event.values)).toBe(true);
});
