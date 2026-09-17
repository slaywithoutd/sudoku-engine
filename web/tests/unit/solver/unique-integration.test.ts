import { expect, test } from "vitest";
import ors from "../../solver/fixtures/unique-conditional-or.json";
import templates from "../../solver/fixtures/unique-conditional-templates.json";
import { uniqueHarness, uniqueLimits } from "../../solver/unique-harness";
import {
  independentNamedUnique,
  independentUniquePlan,
  type UniqueSeed,
} from "../../solver/unique-independent";
import {
  independentTemplateCertificate,
  independentTemplates,
} from "../../solver/templates-independent";
import { compileUnique } from "../../../src/solver/techniques/unique-compiler";
import { compileOrForcing, type OrForcingPlan } from "../../../src/solver/techniques/or-forcing";
import { compileTemplates, type TemplatePlan } from "../../../src/solver/techniques/templates";
import { TemplateOperationContext } from "../../../src/solver/indexes/templates";
import { buildProvedClauses } from "../../../src/solver/indexes/proved-clauses";
import { checkProposal } from "../../../src/solver/proof/checker";
import { retainedProof } from "../../../src/solver/state/candidates";
import { replay, replayConditional } from "../../../src/solver/proof/replay";
import { ConditionalOperation } from "../../../src/solver/conditional";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import { deriveQuality } from "../../../src/solver/evidence";
import { getTechniques } from "../../../src/solver/techniques/registry";
import { oracle } from "../../solver/oracle";
import type { DeductionProposal, CheckedStep } from "../../../src/solver/proof/types";

for (const fixture of [...ors.fixtures, ...templates.fixtures])
  for (const independent of [true, false]) {
    test(`${fixture.id} ${independent ? "independent" : "production"} conditional pipeline`, () => {
      const seed = fixture.sourceFixture as UniqueSeed,
        h = uniqueHarness(seed),
        bundles: DeductionProposal[] = [],
        steps: CheckedStep[] = [];
      const commit = (proposal: DeductionProposal) => {
        const event = [...h.operation.checkAndCommit(proposal)].at(-1);
        expect(event?.kind, JSON.stringify(event)).toBe("checked");
        if (event?.kind !== "checked") throw Error("pipeline-check");
        expect(
          event.step.consequences.every((c) => c.conditional && !c.openAssumptions.length),
        ).toBe(true);
        bundles.push(event.step.proposal);
        steps.push(event.step);
      };
      try {
        const source = independent
          ? independentNamedUnique(
              h.operation.view,
              seed,
              h.parent.evidenceId,
              seed.expectedEffects[0] as any,
            )
          : compileUnique(
              h.operation.view,
              independentUniquePlan(seed, seed.expectedEffects[0]),
              seed.expectedEffects[0] as any,
              h.operation.authority,
            );
        commit(source);
        expect(h.operation.view.state.values).toEqual(fixture.preState.values);
        expect(h.operation.view.state.domains).toEqual(fixture.preState.domains);
        const view = h.operation.view;
        let consumer: DeductionProposal;
        if ("rowId" in fixture) {
          const pattern = fixture.expectedPattern as any;
          const sourceFact = [...view.facts.values()].find(
            (f) =>
              f.conditional &&
              !f.openAssumptions.length &&
              f.proposition.kind === "clause" &&
              JSON.stringify(f.proposition.alternatives) === JSON.stringify(pattern.alternatives),
          );
          expect(sourceFact).toBeDefined();
          let indexed = false;
          for (const event of buildProvedClauses(view, h.workspace))
            if (event.kind === "ready") {
              try {
                indexed = event.value.entries.some(
                  (e) => e.source === sourceFact!.id && e.conditional,
                );
              } finally {
                event.value.dispose();
              }
            }
          expect(indexed).toBe(true);
          const plan: OrForcingPlan = { ...pattern, source: sourceFact!.id, alias: "OR-k forcing" };
          consumer = independent
            ? independentNamedUnique(
                view,
                seed,
                h.parent.evidenceId,
                fixture.expectedEffects[0] as any,
                undefined,
                { source: sourceFact!.id, plan },
              )
            : compileOrForcing(view, plan, fixture.expectedEffects[0] as any);
        } else {
          const math = independentTemplates(fixture as any);
          expect(math.effects).toEqual(fixture.expectedEffects);
          const placed = seed.expectedEffects[0];
          expect(
            [...view.facts.values()].some(
              (f) =>
                f.conditional &&
                f.proposition.kind === "literal" &&
                f.proposition.value.positive &&
                f.proposition.value.cell === placed.cell &&
                f.proposition.value.symbol === placed.symbol,
            ),
          ).toBe(true);
          if (independent)
            consumer = independentTemplateCertificate(
              { ...fixture, alias: "Per-digit templates" } as any,
              view,
            );
          else {
            const cursor = compileTemplates(view, fixture.expectedPattern as TemplatePlan, {
              workspace: h.workspace,
              limits: uniqueLimits,
              templates: new TemplateOperationContext(view),
              uniqueAuthority: h.operation.authority,
            });
            let next = cursor.next();
            while (!next.done) next = cursor.next();
            expect(next.value).not.toBeNull();
            consumer = next.value!;
          }
        }
        expect(consumer.effects).toEqual(fixture.expectedEffects);
        if (!independent) {
          const descriptor = getTechniques("classic-conditional@1").find(
            (d) => d.id === ("rowId" in fixture ? "c28@1" : "c33@1"),
          )!;
          const baseline = h.workspace.usage,
            cursor = descriptor.discover(view, {
              workspace: h.workspace,
              limits: uniqueLimits,
              uniqueAuthority: h.operation.authority,
              templates: new TemplateOperationContext(view),
            });
          let found = false,
            last = "unfinished";
          try {
            for (const event of cursor) {
              if (event.kind !== "work") last = event.kind;
              if (event.kind !== "proposal") continue;
              const checked = [
                ...checkProposal(event.proposal, {
                  view,
                  retained: retainedProof(view),
                  policy: "unique-only",
                  uniqueEvidenceId: null,
                  uniqueAuthority: h.operation.authority,
                  limits: uniqueLimits,
                }),
              ].at(-1);
              expect(checked?.kind, JSON.stringify(checked)).toBe("checked");
              if (
                JSON.stringify(event.proposal.effects) === JSON.stringify(fixture.expectedEffects)
              ) {
                found = true;
                break;
              }
            }
          } finally {
            cursor.return();
          }
          expect(found, `consumer-discovery:${fixture.id}:${last}`).toBe(true);
          expect(h.workspace.usage).toEqual(baseline);
        }
        const ordinary = [
          ...checkProposal(consumer, {
            view,
            retained: retainedProof(view),
            policy: "discharged",
            uniqueEvidenceId: null,
            limits: uniqueLimits,
          }),
        ].at(-1);
        expect(ordinary?.kind).toBe("rejected");
        commit(consumer);
        for (const effect of [...source.effects, ...consumer.effects]) {
          const result = oracle({
            givens: [...fixture.givens].map(Number),
            limit: 2,
            maxNodes: 1_000_000,
            ...(effect.kind === "place"
              ? { forbid: [effect.cell, effect.symbol] as [number, number] }
              : { force: [effect.cell, effect.symbol] as [number, number] }),
          });
          expect(result.exhausted && !result.interrupted && result.witnesses.length === 0).toBe(
            true,
          );
        }
        expect(
          deriveQuality(h.operation.snapshot, "solved", steps, h.count, false, {
            ...h.context,
            run: h.operation.run,
            initialView: h.operation.initialView,
            acceptedView: h.operation.view,
          }),
        ).toBe("not-established");
        expect(
          [
            ...replay(
              h.operation.snapshot,
              [...h.operation.prefix, ...bundles],
              h.operation.assembly,
              uniqueLimits,
            ),
          ].at(-1)?.kind,
        ).toBe("rejected");
        const workspace = new IndexWorkspace({
          entryLimit: 1_000_000,
          byteLimit: uniqueLimits.workspaceBytes,
        });
        const fresh = ConditionalOperation.begin(
          h.parent,
          h.operation.run,
          uniqueLimits,
          workspace,
        );
        try {
          for (const event of fresh.rebuildPrefix()) expect(event.kind).not.toBe("rejected");
          const replayed = [...replayConditional(fresh, structuredClone(bundles))].filter(
            (e) => e.kind !== "work",
          );
          expect(replayed.map((e) => e.kind)).toEqual(["checked", "checked"]);
          expect(fresh.view.state).toEqual(h.operation.view.state);
        } finally {
          fresh.dispose();
        }
        expect(workspace.usage).toEqual({ entries: 0, bytes: 0 });
      } finally {
        h.operation.dispose();
      }
      expect(h.workspace.usage).toEqual({ entries: 0, bytes: 0 });
    }, 30000);
  }
