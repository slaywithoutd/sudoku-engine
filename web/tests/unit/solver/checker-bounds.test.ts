/**
 * Problem-sized checker bounds (D102). The state key embeds the canonical
 * problem, so a variant grid can outgrow the classic header caps; and the
 * scheduler no longer holds a fixed 3 x stepBytes lease per open check.
 */
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Corpus } from "../../solver/bench/corpus-schema";
import { corpusProblem, SAMPLE_LIMITS } from "../../solver/bench/sample";
import { assemble } from "../../../src/solver/rules/assemble";
import { productionRules } from "../../../src/solver/rules/registry";
import { initialize, retainedProof } from "../../../src/solver/state/candidates";
import { assembleTechniqueJobs, profileFor } from "../../../src/solver/techniques/registry";
import { checkProposal } from "../../../src/solver/proof/checker";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import { StepSelection } from "../../../src/solver/scheduling/select";
import { schedulingOptions } from "../../../src/solver/scheduling/work";
import type { DeductionProposal } from "../../../src/solver/proof/types";
import { PUZZLE } from "../../fixtures";
import { normalizeClassic } from "../../../src/solver/problem";

const corpus = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../solver/bench/corpus.json", import.meta.url)), "utf8"),
) as Corpus;

function view(id: string) {
  const entry = [...corpus.calibration, ...corpus.heldOut].find((c) => c.id === id)!;
  const problem = corpusProblem(entry);
  const assembled = assemble(problem, productionRules());
  if (!assembled.ok) throw new Error("assembly");
  return { problem, view: initialize(assembled.value, "primary") };
}

function firstRuleProposal(state: ReturnType<typeof view>): DeductionProposal {
  const registry = assembleTechniqueJobs(state.view.assembly, profileFor(state.problem));
  for (const rule of registry.rules)
    for (const event of rule.discover(state.view)) {
      if (event.kind === "proposal") return event.proposal;
      if (event.kind !== "work") break;
    }
  throw new Error("no rule proposal");
}

describe("problem-sized checker bounds (D102)", () => {
  test("a kropki grid whose state key exceeds 16 KB still checks its rule proposals", () => {
    const state = view("kropki-10");
    expect(JSON.stringify(state.view.state.key).length).toBeGreaterThan(16 * 1024);
    const proposal = firstRuleProposal(state);
    const reserved: number[] = [];
    const result = [
      ...checkProposal(proposal, {
        view: state.view,
        retained: retainedProof(state.view),
        limits: SAMPLE_LIMITS,
        policy: "unconditional",
        uniqueEvidenceId: null,
        reserveBytes: (bytes) => reserved.push(bytes),
      }),
    ].at(-1);
    expect(result?.kind).toBe("checked");
    // The gate is asked before copying, monotonically, and far below 3 x stepBytes.
    expect(reserved.length).toBeGreaterThan(0);
    expect(reserved).toEqual([...reserved].sort((a, b) => a - b));
    expect(reserved.at(-1)!).toBeLessThan(SAMPLE_LIMITS.stepBytes);
  });

  test("a refused storage request rejects the check as workspace-byte-limit", () => {
    const state = view("kropki-10");
    const result = [
      ...checkProposal(firstRuleProposal(state), {
        view: state.view,
        retained: retainedProof(state.view),
        limits: SAMPLE_LIMITS,
        policy: "unconditional",
        uniqueEvidenceId: null,
        reserveBytes: () => {
          throw new Error("refused");
        },
      }),
    ].at(-1);
    expect(result).toMatchObject({ kind: "rejected", code: "workspace-byte-limit" });
  });

  test("an open check holds storage proportional to its copies, not 3 x stepBytes", () => {
    const assembled = assemble(
      normalizeClassic({
        kind: "classic",
        version: 1,
        width: 9,
        height: 9,
        givens: [...PUZZLE].map(Number),
      }),
      productionRules(),
    );
    if (!assembled.ok) throw new Error("assembly");
    const start = initialize(assembled.value, "primary");
    const workspace = new IndexWorkspace({ entryLimit: 100_000, byteLimit: 64_000_000 });
    const selection = new StepSelection(
      start,
      assembleTechniqueJobs(start.assembly, "classic-expanded@1"),
      { ...schedulingOptions({ limits: SAMPLE_LIMITS }), workspace, clock: { now: () => 0 } },
    );
    let peak = 0;
    try {
      for (const event of selection.select()) {
        peak = Math.max(peak, workspace.usage.bytes);
        if (event.kind === "checked-step") break;
      }
    } finally {
      selection.dispose();
    }
    // Before D102 one open check alone held 3 x stepBytes (6 MB); the peak now
    // includes the shared indexes and still stays under that single lease.
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThan(3 * SAMPLE_LIMITS.stepBytes);
  });
});
