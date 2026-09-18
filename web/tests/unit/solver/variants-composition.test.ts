import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { canonicalProblem } from "../../../src/solver/problem";
import type { EngineProblem } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { productionRules } from "../../../src/solver/rules/registry";
import { initialize, retainedProof, commitChecked } from "../../../src/solver/state/candidates";
import { checkProposal } from "../../../src/solver/proof/checker";
import { exactSteps } from "../../../src/solver/exact";
import type { CheckContext, DeductionProposal } from "../../../src/solver/proof/types";
import type { ReadView } from "../../../src/solver/state/types";
import { symbolMask } from "../../../src/solver/state/read";
import { getTechniques } from "../../../src/solver/techniques/registry";
import { discoveryContext } from "../../solver/discovery-context";
import { variantOracle } from "../../solver/oracle-variants";
import { generateSmall, toEngineConstraints } from "../../solver/generate-small";

const limits = discoveryContext().limits;

/** Production files added by M2.5; the geometry non-regression rule (spec §3.1) applies to them. */
const newProductionFiles = [
  "rules/binary-relation.ts",
  "rules/order.ts",
  "rules/difference.ts",
  "rules/linear-rule.ts",
  "rules/cage.ts",
  "rules/arrow.ts",
  "rules/registry.ts",
  "techniques/variant-grammar.ts",
  "techniques/killer.ts",
  "proof/linear.ts",
];

function engineProblem(seed: number, options: Parameters<typeof generateSmall>[1]) {
  const small = generateSmall(seed, options);
  const problem = canonicalProblem({
    schema: 1,
    cells: Array.from({ length: small.cellCount }, (_, cell) => cell),
    symbols: [...small.symbols],
    givens: [...small.givens],
    constraints: toEngineConstraints(small).map((c) => ({
      ...c,
      cells: [...c.cells],
      parameters: { ...c.parameters },
    })),
  });
  return { small, problem };
}

function view(input: EngineProblem, modules = productionRules()): ReadView {
  const result = assemble(input, modules);
  if (!result.ok)
    throw new Error(result.issues.map((issue) => `${issue.code}: ${issue.message}`).join("; "));
  return initialize(result.value, "primary");
}

function context(current: ReadView): CheckContext {
  return {
    view: current,
    retained: retainedProof(current),
    limits,
    policy: "unconditional",
    uniqueEvidenceId: null,
  };
}

function maintained(start: ReadView): ReadView {
  let current = start;
  let progress = true;
  while (progress) {
    progress = false;
    for (const rule of current.assembly.problem.constraints)
      for (const event of current.assembly.modules.get(rule.id)!.propagate(current, rule)) {
        if (event.kind !== "proposal") continue;
        const checked = [...checkProposal(event.proposal, context(current))].at(-1);
        if (checked?.kind !== "checked") throw new Error(`rejected maintenance ${rule.id}`);
        current = commitChecked(current, checked.step).view;
        progress = true;
      }
  }
  return current;
}

function proposalsOf(current: ReadView, id: string): DeductionProposal[] {
  const descriptor = getTechniques("variants-expanded@1").find((entry) => entry.id === id)!;
  if (descriptor.eligible(current).kind !== "yes") return [];
  const proposals: DeductionProposal[] = [];
  for (const event of descriptor.discover(current, discoveryContext()))
    if (event.kind === "proposal") proposals.push(event.proposal);
  return proposals;
}

describe("M2.5 composition and non-regression (T10)", () => {
  test("new production files carry no classic geometry literal", () => {
    const root = fileURLToPath(new URL("../../../src/solver/", import.meta.url));
    for (const file of newProductionFiles) {
      const source = readFileSync(root + file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      const literals = source.match(/(?<![\w.])(81|27|9)(?![\w.])/g) ?? [];
      expect(literals, `${file} uses a geometry literal`).toEqual([]);
    }
  });

  test("registration order changes nothing in the assembly", () => {
    for (const seed of [1, 2, 3]) {
      const { problem } = engineProblem(seed, { cages: 2, orders: 2, dots: 2, arrows: 1 });
      const forward = assemble(problem, productionRules());
      const backward = assemble(problem, [...productionRules()].reverse());
      if (!forward.ok || !backward.ok) throw new Error("assembly");
      expect(backward.value.supportSignature).toBe(forward.value.supportSignature);
      expect(backward.value.sums).toEqual(forward.value.sums);
      expect(backward.value.relations).toEqual(forward.value.relations);
      expect(backward.value.allDifferent).toEqual(forward.value.allDifferent);
      const left = initialize(forward.value, "primary"),
        right = initialize(backward.value, "primary");
      expect([...right.facts.values()].map((f) => f.proposition)).toEqual(
        [...left.facts.values()].map((f) => f.proposition),
      );
    }
  });

  test("300 generated mixed problems: exact counts match the oracle and every accepted deduction is sound", () => {
    let deductions = 0,
      multiple = 0;
    for (let seed = 1; seed <= 300; seed += 1) {
      const width = seed % 5 === 0 ? 6 : 4;
      const { small, problem } = engineProblem(seed, {
        width: width as 4 | 6,
        cages: (seed % 4) + 1,
        orders: seed % 3,
        dots: seed % 3,
        arrows: seed % 2,
        negativeDots: seed % 7 === 0,
        givens: width === 6 ? 14 + (seed % 5) : seed % 4,
      });
      const assembly = assemble(problem, productionRules());
      if (!assembly.ok) throw new Error("assembly");
      const witnesses = variantOracle({
        cellCount: small.cellCount,
        symbols: small.symbols,
        givens: small.givens,
        constraints: small.constraints,
        limit: 3,
        maxNodes: 2_000_000,
      });
      expect(witnesses.exhausted || witnesses.witnesses.length >= 3).toBe(true);
      const expected = Math.min(witnesses.witnesses.length, 2);
      const events = [...exactSteps(problem, assembly.value)];
      expect(events.filter((event) => event.kind === "witness")).toHaveLength(expected);
      if (expected === 2) multiple += 1;
      // Rule maintenance then every variant-native family and the naked subsets.
      const current = maintained(initialize(assembly.value, "primary"));
      for (const id of ["k01@1", "k02@1", "c04@1"])
        for (const proposal of proposalsOf(current, id)) {
          expect([...checkProposal(proposal, context(current))].at(-1)?.kind).toBe("checked");
          for (const effect of proposal.effects) {
            deductions += 1;
            for (const witness of witnesses.witnesses)
              expect(
                effect.kind === "remove"
                  ? witness[effect.cell] !== effect.symbol
                  : witness[effect.cell] === effect.symbol,
              ).toBe(true);
          }
        }
      for (const witness of witnesses.witnesses)
        witness.forEach((symbol, cell) => {
          expect(current.state.domains[cell] & symbolMask(symbol)).not.toBe(0);
        });
    }
    expect(deductions).toBeGreaterThan(100);
    expect(multiple).toBeGreaterThan(20);
  });
});
