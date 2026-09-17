import { expect, test } from "vitest";
import fixtures from "../../solver/fixtures/C32-guardian-or.json";
import { fixtureView, originalCluePrefix, type TechniqueFixture } from "../../solver/acceptance";
import { compileTridagon, type TridagonPlan } from "../../../src/solver/techniques/tridagon";
import { checkProposal } from "../../../src/solver/proof/checker";
import { retainedProof, retainCheckedFacts } from "../../../src/solver/state/candidates";
import {
  buildProvedClauses,
  type ProvedClauseIndex,
} from "../../../src/solver/indexes/proved-clauses";
import { discoveryContext } from "../../solver/discovery-context";
import { independentGeneralized } from "../../solver/generalized-acceptance";
import { replay } from "../../../src/solver/proof/replay";
import type { SolverSnapshot } from "../../../src/solver/snapshot";
import { orTechniques } from "../../../src/solver/techniques/or-runtime";
import { oracle } from "../../solver/oracle";
import type { DeductionProposal } from "../../../src/solver/proof/types";

function source(f: any) {
  const base = fixtureView(f as TechniqueFixture),
    cursor = compileTridagon(base, {
      ...f.expectedPattern.clauseProof.pattern,
      alias: "Tridagon guardians",
    } as TridagonPlan);
  let proposal;
  while (true) {
    const n = cursor.next();
    if (n.done) {
      proposal = n.value;
      break;
    }
  }
  if (!proposal) throw Error("missing-guardian-proof");
  const context = {
    view: base,
    retained: retainedProof(base),
    limits: discoveryContext().limits,
    policy: "discharged" as const,
    uniqueEvidenceId: null,
  };
  let checked;
  for (const e of checkProposal(proposal, context)) if (e.kind !== "work") checked = e;
  if (checked?.kind !== "checked") throw Error(JSON.stringify(checked));
  return {
    base,
    proposal,
    checked: checked.step,
    view: retainCheckedFacts(base, checked.step),
    id: proposal.proof.roots[0],
  };
}

test.each(fixtures)(
  "$id retains genuine C32 lineage and independently checks/replays the inserted C28 consumer",
  (f) => {
    const { base, view, id, proposal, checked } = source(f),
      context = discoveryContext();
    let old: ProvedClauseIndex | undefined, next: ProvedClauseIndex | undefined;
    try {
      for (const e of buildProvedClauses(base, context.workspace))
        if (e.kind === "ready") old = e.value;
      expect(old!.completeFor(base)).toBe(true);
      expect(old!.completeFor(view)).toBe(false);
      expect(old!.acceptsView(view, () => {})).toBe(true);
      expect(view.state.key).toEqual(base.state.key);
      expect(view.state.domains).toBe(base.state.domains);
      expect(view.state.values).toBe(base.state.values);
      expect(() => retainCheckedFacts(view, checked)).toThrow("reused-proof-node");
      for (const e of buildProvedClauses(view, context.workspace))
        if (e.kind === "ready") next = e.value;
      const entry = next!.entries.find((e) => e.source === id)!;
      expect(entry).toBeDefined();
      expect(entry.premiseFacts[0]).toBe(view.facts.get(id));
      expect(entry.alternatives.map((l) => [l.cell, l.symbol])).toEqual(
        [...f.expectedPattern.clause].sort((a, b) => a[0] - b[0] || a[1] - b[1]),
      );
      const plan = {
        grammar: "inserted-or-whip",
        target: f.expectedPattern.target,
        positions: f.expectedPattern.positions.map((p) => ({
          ...p,
          alternatives: [...p.alternatives].sort((a, b) => a[0] - b[0] || a[1] - b[1]),
        })),
        source: id,
      };
      const consumer = independentGeneralized(view, plan);
      let terminal;
      for (const e of checkProposal(consumer, {
        view,
        retained: retainedProof(view),
        limits: context.limits,
        policy: "discharged",
        uniqueEvidenceId: null,
      }))
        if (e.kind !== "work") terminal = e;
      expect(terminal?.kind, JSON.stringify(terminal)).toBe("checked");
      expect(consumer.proof.imports).toContain(id);
      if (terminal?.kind !== "checked") throw Error(JSON.stringify(terminal));
      const effects = terminal.step.proposal.effects;
      expect(effects.length).toBeGreaterThan(0);
      expect(effects).toEqual(expect.arrayContaining(f.expectedEffects));
      const input = {
        givens: [...f.givens].map(Number),
        domains: f.preState.domains,
        limit: 1,
        maxNodes: 1000000,
      };
      expect(oracle(input)).toMatchObject({ interrupted: false, witnesses: [expect.any(Array)] });
      for (const effect of effects) {
        const counter =
          effect.kind === "remove"
            ? { force: [effect.cell, effect.symbol] as [number, number] }
            : { forbid: [effect.cell, effect.symbol] as [number, number] };
        expect(oracle({ ...input, ...counter }), `${f.id}:${JSON.stringify(effect)}`).toMatchObject(
          { exhausted: true, interrupted: false, witnesses: [] },
        );
      }
      const stale = [
        ...checkProposal(consumer, {
          view: base,
          retained: retainedProof(base),
          limits: context.limits,
          policy: "discharged",
          uniqueEvidenceId: null,
        }),
      ].at(-1);
      expect(stale?.kind).toBe("rejected");
      let accepted = 0;
      for (const e of replay(
        { problem: view.assembly.problem } as SolverSnapshot,
        [...originalCluePrefix(f as unknown as TechniqueFixture), proposal, consumer],
        view.assembly,
        { ...context.limits, timeMs: 120000, workUnits: 100000000 },
      )) {
        if (e.kind === "rejected") throw Error(e.code);
        if (e.kind === "checked") accepted++;
      }
      expect(accepted).toBe(originalCluePrefix(f as unknown as TechniqueFixture).length + 2);
    } finally {
      next?.dispose();
      old?.dispose();
    }
    expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  },
  150000,
);

test("actual C28 discovery consumes a native guardian clause at the same candidate revision", () => {
  const f = fixtures[0],
    { view, id } = source(f),
    context = discoveryContext();
  context.limits.timeMs = 120000;
  const cursor = orTechniques[0].discover(view, context);
  let found: DeductionProposal | undefined, terminal;
  try {
    for (const e of cursor) {
      terminal = e;
      if (
        e.kind === "proposal" &&
        (e.proposal.pattern as any).grammar === "inserted-or-whip" &&
        (e.proposal.pattern as any).source === id
      ) {
        found = e.proposal;
        break;
      }
    }
  } finally {
    cursor.return();
  }
  expect(found, JSON.stringify(terminal)).toBeDefined();
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  let checked;
  for (const e of checkProposal(found!, {
    view,
    retained: retainedProof(view),
    limits: { ...context.limits, workUnits: 100000000 },
    policy: "discharged",
    uniqueEvidenceId: null,
  }))
    if (e.kind !== "work") checked = e;
  expect(checked?.kind, JSON.stringify(checked)).toBe("checked");
  const e = found!.effects[0];
  expect(
    oracle({
      givens: [...f.givens].map(Number),
      domains: f.preState.domains,
      force: [e.cell, e.symbol],
      limit: 1,
      maxNodes: 1000000,
    }),
  ).toMatchObject({ exhausted: true, interrupted: false, witnesses: [] });
}, 150000);

test.each(fixtures)("$id proves OR without claiming guardian exclusivity", (f) => {
  const input = {
      givens: [...f.givens].map(Number),
      domains: f.preState.domains,
      limit: 1,
      maxNodes: 1000000,
    },
    guardians = f.expectedPattern.clause;
  expect(oracle(input)).toMatchObject({ interrupted: false, witnesses: [expect.any(Array)] });
  const denied = [...input.domains];
  guardians.forEach(([c, s]) => (denied[c] &= ~(1 << (s - 1))));
  expect(oracle({ ...input, domains: denied })).toMatchObject({
    interrupted: false,
    exhausted: true,
    witnesses: [],
  });
  let simultaneous = false;
  for (let i = 0; i < guardians.length; i++)
    for (let j = i + 1; j < guardians.length; j++) {
      const domains = [...input.domains];
      for (const [c, s] of [guardians[i], guardians[j]]) domains[c] = 1 << (s - 1);
      const r = oracle({ ...input, domains });
      expect(r.interrupted).toBe(false);
      simultaneous ||= r.witnesses.length > 0;
    }
  expect(simultaneous).toBe(true);
});
