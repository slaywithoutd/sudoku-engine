import { describe, expect, test } from "vitest";
import { PrimitiveRegistry } from "../../../src/solver/proof/primitives";
import { oracle } from "../../solver/oracle";
import u01 from "../../solver/fixtures/U01.json";
import u02 from "../../solver/fixtures/U02.json";
import u03 from "../../solver/fixtures/U03.json";
import u04 from "../../solver/fixtures/U04.json";
import u05 from "../../solver/fixtures/U05.json";
import {
  independentUniqueTrade,
  independentUniqueCertificate,
  independentUniquePlan,
  independentNamedUnique,
  type UniqueSeed,
} from "../../solver/unique-independent";
import { uniqueHarness, uniqueLimits } from "../../solver/unique-harness";
import { verifyCertificate, checkProposal } from "../../../src/solver/proof/checker";
import { compileUnique } from "../../../src/solver/techniques/unique-compiler";
import type { Effect } from "../../../src/solver/proof/types";
import { getTechniques } from "../../../src/solver/techniques/registry";
import { ConditionalOperation } from "../../../src/solver/conditional";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import { replayConditional } from "../../../src/solver/proof/replay";
import { retainedProof } from "../../../src/solver/state/candidates";

const seeds: UniqueSeed[] = [u01, u02, u03, u04, u05].flatMap(
  (file) => file.fixtures as UniqueSeed[],
);

describe("independent original-clue uniqueness", () => {
  test.each(seeds)("$id", (fixture) => {
    const givens = [...fixture.givens].map(Number);
    const original = oracle({ givens, limit: 2, maxNodes: 1_000_000 });
    expect(original.interrupted).toBe(false);
    independentUniqueTrade(fixture as UniqueSeed);
    if (fixture.id === "U01-nonunique-trade") {
      expect(original.witnesses).toHaveLength(2);
      expect(original.witnesses[0]).not.toEqual(original.witnesses[1]);
      return;
    }
    expect(original.exhausted).toBe(true);
    expect(original.witnesses).toHaveLength(1);
    for (const effect of fixture.expectedEffects) {
      const opposite = oracle({
        givens,
        limit: 2,
        maxNodes: 1_000_000,
        ...(effect.kind === "place"
          ? { forbid: [effect.cell, effect.symbol] as [number, number] }
          : { force: [effect.cell, effect.symbol] as [number, number] }),
      });
      expect(opposite.interrupted).toBe(false);
      expect(opposite.exhausted).toBe(true);
      expect(opposite.witnesses).toHaveLength(0);
    }
  });
});

test("the closed primitive registry owns the uniqueness transformation checker", () => {
  expect(new PrimitiveRegistry().ids).toContain("unique-transform@1");
});

for (const seed of seeds.filter((s) => s.id !== "U01-nonunique-trade")) {
  // These five complete BUG fixtures also hash long genuine prefixes and replay
  // a fresh owner; measured combined runs take 38-45s, not a latency benchmark.
  const timeout = seed.rowId === "U04" || seed.rowId === "U05" ? 60000 : 30000;
  test(
    `${seed.id} has an authentic complete primitive trade`,
    async () => {
      const h = uniqueHarness(seed);
      try {
        const view = h.operation.view,
          proposal = independentUniqueCertificate(view, seed, h.parent.evidenceId);
        const result = [
          ...verifyCertificate(proposal, {
            view,
            retained: retainedProof(view),
            policy: "unique-only",
            uniqueEvidenceId: h.parent.evidenceId,
            uniqueAuthority: h.operation.authority,
            limits: uniqueLimits,
          }),
        ].at(-1);
        expect(result?.kind, JSON.stringify(result)).toBe("verified");
        if (result?.kind === "verified")
          expect(
            result.certificate.consequences.every(
              (c) => c.conditional && !c.openAssumptions.length,
            ),
          ).toBe(true);
        for (const effect of seed.expectedEffects as Effect[]) {
          const plan = independentUniquePlan(seed, effect);
          for (const proposal of [
            independentNamedUnique(view, seed, h.parent.evidenceId, effect),
            compileUnique(view, plan, effect, h.operation.authority),
          ]) {
            const checked = [
              ...checkProposal(proposal, {
                view,
                retained: retainedProof(view),
                policy: "unique-only",
                uniqueEvidenceId: h.parent.evidenceId,
                uniqueAuthority: h.operation.authority,
                limits: uniqueLimits,
              }),
            ].at(-1);
            if (seed.id.includes("length14"))
              expect(checked).toEqual({ kind: "rejected", code: "unique-loop-bound" });
            else {
              expect(checked?.kind, `${seed.id}:${JSON.stringify(checked)}`).toBe("checked");
              const ctx = {
                view,
                retained: retainedProof(view),
                policy: "unique-only" as const,
                uniqueEvidenceId: h.parent.evidenceId,
                uniqueAuthority: h.operation.authority,
                limits: uniqueLimits,
              };
              expect(
                [
                  ...checkProposal(proposal, {
                    ...ctx,
                    limits: { ...uniqueLimits, stepNodes: proposal.proof.nodes.length - 1 },
                  }),
                ].at(-1)?.kind,
              ).toBe("rejected");
              if (seed.id === "U01-type6-independent")
                for (const mutate of [
                  (p: any) => p.effects.pop(),
                  (p: any) => p.effects.push(p.effects[0]),
                  (p: any) => delete p.pattern.certificate.companion,
                  (p: any) => p.pattern.geometry.strongHouses.pop(),
                  (p: any) => {
                    p.pattern.certificate.companion.root = p.pattern.certificate.root;
                  },
                ]) {
                  const bad = structuredClone(proposal);
                  mutate(bad);
                  expect([...checkProposal(bad, ctx)].at(-1)?.kind).toBe("rejected");
                }
              const missing = structuredClone(proposal);
              (missing.pattern as any).geometry.guardians.pop();
              expect([...checkProposal(missing, ctx)].at(-1)?.kind).toBe("rejected");
            }
          }
        }
        if (!seed.id.includes("length14")) {
          const descriptor = getTechniques("classic-conditional@1").find(
            (d) => d.id === `${seed.rowId.toLowerCase()}@1`,
          )!;
          const baseline = h.workspace.usage;
          const cursor = descriptor.discover(view, {
            workspace: h.workspace,
            limits: uniqueLimits,
            uniqueAuthority: h.operation.authority,
          });
          const expected = independentUniquePlan(seed, seed.expectedEffects[0]).geometry;
          let found = false,
            terminal = "unfinished",
            proposals = 0;
          try {
            for (const event of cursor) {
              if (event.kind !== "work") terminal = event.kind;
              if (event.kind !== "proposal") continue;
              proposals++;
              const checked = [
                ...checkProposal(event.proposal, {
                  view,
                  retained: retainedProof(view),
                  policy: "unique-only",
                  uniqueEvidenceId: h.parent.evidenceId,
                  uniqueAuthority: h.operation.authority,
                  limits: uniqueLimits,
                }),
              ].at(-1);
              expect(checked?.kind, `discovery:${seed.id}:${JSON.stringify(checked)}`).toBe(
                "checked",
              );
              for (const effect of event.proposal.effects) {
                const opposite = oracle({
                  givens: [...seed.givens].map(Number),
                  limit: 2,
                  maxNodes: 1_000_000,
                  ...(effect.kind === "place"
                    ? { forbid: [effect.cell, effect.symbol] as [number, number] }
                    : { force: [effect.cell, effect.symbol] as [number, number] }),
                });
                expect(
                  opposite.exhausted && opposite.witnesses.length === 0 && !opposite.interrupted,
                ).toBe(true);
              }
              const g = (event.proposal.pattern as any).geometry;
              if (
                g.kind === expected.kind &&
                g.cells.length === expected.cells.length &&
                g.guardians.length === expected.guardians.length &&
                g.auxiliaryCells.length === expected.auxiliaryCells.length
              ) {
                found = true;
                break;
              }
            }
          } finally {
            cursor.return();
          }
          expect(found, `discovery:${seed.id}:${terminal}:${proposals}`).toBe(true);
          expect(h.workspace.usage).toEqual(baseline);
          expect(await h.operation.digestPrefix()).toMatch(/^[a-f0-9]{64}$/);
          const compiled = compileUnique(
            view,
            independentUniquePlan(seed, seed.expectedEffects[0]),
            seed.expectedEffects[0] as Effect,
            h.operation.authority,
          );
          const committed = [...h.operation.checkAndCommit(compiled)].at(-1);
          expect(committed?.kind, JSON.stringify(committed)).toBe("checked");
          const replayWorkspace = new IndexWorkspace({
            entryLimit: 1_000_000,
            byteLimit: uniqueLimits.workspaceBytes,
          });
          const fresh = ConditionalOperation.begin(
            h.parent,
            h.operation.run,
            uniqueLimits,
            replayWorkspace,
          );
          try {
            for (const event of fresh.rebuildPrefix()) expect(event.kind).not.toBe("rejected");
            const replayed = [...replayConditional(fresh, [structuredClone(compiled)])].at(-1);
            expect(replayed?.kind, JSON.stringify(replayed)).toBe("checked");
            expect(fresh.view.state).toEqual(h.operation.view.state);
          } finally {
            fresh.dispose();
          }
          expect(replayWorkspace.usage).toEqual({ entries: 0, bytes: 0 });
        }
      } finally {
        h.operation.dispose();
      }
      expect(h.workspace.usage).toEqual({ entries: 0, bytes: 0 });
    },
    timeout,
  );
}

test("named uniqueness compilation is separate from primitive authority", async () => {
  const module = await import("../../../src/solver/techniques/unique-compiler").catch(() => ({}));
  expect(module).toHaveProperty("compileUnique");
});
