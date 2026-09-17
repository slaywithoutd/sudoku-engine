import { expect, test, vi } from "vitest";
import c25 from "../../solver/fixtures/C25.json";
import c26 from "../../solver/fixtures/C26.json";
import c27 from "../../solver/fixtures/C27.json";
import c28 from "../../solver/fixtures/C28.json";
import {
  fixtureView,
  assertSound,
  assertCertificateSound,
  originalCluePrefix,
  type TechniqueFixture,
} from "../../solver/acceptance";
import {
  checkProposal,
  verifyCertificate,
} from "../../../src/solver/proof/checker";
import {
  retainedProof,
  retainCheckedFacts,
  rebuildOwnedIndexes,
  initialize,
} from "../../../src/solver/state/candidates";
import { discoveryContext } from "../../solver/discovery-context";
import {
  compileGeneralized,
  type GeneralizedPlan,
} from "../../../src/solver/techniques/generalized-chains";
import {
  compileOrForcing,
  type OrForcingPlan,
} from "../../../src/solver/techniques/or-forcing";
import {
  compileForcing,
  type ForcingPlan,
} from "../../../src/solver/techniques/forcing";
import { buildProvedClauses } from "../../../src/solver/indexes/proved-clauses";
import { buildImplications } from "../../../src/solver/indexes/implications";
import { clause } from "../../../src/solver/proof/primitives";
import {
  candidateLiteral,
  buildCspVariables,
} from "../../../src/solver/techniques/csp-variables";
import {
  generalizedTechniques,
  GeneralizedSearch,
  generalizedFeatures,
} from "../../../src/solver/techniques/generalized-runtime";
import { orTechniques } from "../../../src/solver/techniques/or-runtime";
import {
  independentGeneralized,
  independentOrForcing,
} from "../../solver/generalized-acceptance";
import { replay } from "../../../src/solver/proof/replay";
import type { SolverSnapshot } from "../../../src/solver/snapshot";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import { oracle } from "../../solver/oracle";
import { independentForcing } from "../../solver/forcing-acceptance";
import type { Effect } from "../../../src/solver/proof/types";

function orFixture(
  fixture: (typeof c28)[number],
  assembly: "production" | "independent" = "production",
  sourceGrammar: "whip" | "bivalue" | "braid" = "whip",
) {
  let view = fixtureView(fixture as unknown as TechniqueFixture);
  const p = structuredClone(fixture.expectedPattern) as any;
  const forcingSource = (plan: ForcingPlan, effect: Effect) =>
    assembly === "production"
      ? compileForcing(view, plan, effect)
      : independentForcing({
          ...fixture,
          id: `${fixture.id}:independent-source`,
          rowId: "C22",
          expectedPattern: plan,
          expectedEffects: [effect],
        } as unknown as TechniqueFixture);
  let sourceProposal;
  if ("sourceCertificateRecipe" in fixture) {
    const recipe = fixture.sourceCertificateRecipe!;
    const kind =
      "cell" in recipe.expectedPattern.cover
        ? "cell"
        : "candidate" in recipe.expectedPattern.cover
          ? "digit"
          : "unit";
    sourceProposal = forcingSource(
      {
        ...recipe.expectedPattern,
        kind,
        alias:
          kind === "cell"
            ? "Cell forcing chains"
            : kind === "digit"
              ? "Digit forcing chains"
              : "Unit forcing chains",
        mode: "cache",
      } as unknown as ForcingPlan,
      { ...recipe.expectedEffects[0], kind: "remove" },
    );
    if (p.grammar !== "inserted-or-whip") {
      p.kind = "or-forcing";
      p.clause = p.alternatives.map((a: any) => [a.cell, a.symbol]);
      p.branches = p.branches.map((b: any) =>
        !b.form
          ? b
          : b.form === "static"
            ? {
                assumption: b.assumption,
                result: {
                  cell: p.target.cell,
                  symbol: p.target.symbol,
                  positive: false,
                },
                paths: [b.path],
              }
            : {
                assumption: b.assumption,
                result: "false",
                generalized: b.pattern,
              },
      );
    }
  } else if (p.kind === "or-forcing")
    sourceProposal = forcingSource(
      {
        ...p,
        kind: "cell",
        alias: "Cell forcing chains",
        mode: "cache",
      } as ForcingPlan,
      { ...fixture.expectedEffects[0], kind: "remove" },
    );
  else {
    const ordinary = structuredClone(p);
    ordinary.grammar = sourceGrammar;
    ordinary.mode = "cache";
    ordinary.positions[ordinary.orPosition].variable =
      ordinary.clauseProof.variable;
    delete ordinary.positions[ordinary.orPosition].role;
    sourceProposal =
      assembly === "production"
        ? compileGeneralized(view, ordinary)
        : independentGeneralized(view, ordinary);
  }
  const result = [
    ...checkProposal(sourceProposal, {
      view,
      retained: retainedProof(view),
      policy: "discharged",
      uniqueEvidenceId: null,
      limits: discoveryContext().limits,
    }),
  ].at(-1);
  expect(result, JSON.stringify(result)).toMatchObject({ kind: "checked" });
  if (result?.kind !== "checked") throw Error("source-cache");
  const theorem = sourceProposal.proof.nodes.find(
    (n) => n.id === sourceProposal.proof.roots[0],
  )!.conclusion;
  if (theorem.kind !== "literal" || theorem.value.positive)
    throw Error("expected-negative-cache-theorem");
  const counterfactual = oracle({
    givens: [...view.state.values],
    domains: [...view.state.domains],
    force: [theorem.value.cell, theorem.value.symbol],
    limit: 1,
    maxNodes: 1000000,
  });
  expect(counterfactual).toMatchObject({
    witnesses: [],
    exhausted: true,
    interrupted: false,
  });
  view = retainCheckedFacts(view, result.step);
  const proposition =
    p.kind === "or-forcing"
      ? clause(p.alternatives)
      : clause(p.clause.map((v: any) => candidateLiteral(v)));
  const source = [...view.facts.values()].find(
    (f) =>
      !f.openAssumptions.length &&
      JSON.stringify(f.proposition) === JSON.stringify(proposition) &&
      retainedProof(view).get(f.id)?.scope.length === 0,
  )!;
  expect(source).toBeDefined();
  p.source = source.id;
  const proposal =
    p.kind === "or-forcing"
      ? (assembly === "production" ? compileOrForcing : independentOrForcing)(
          view,
          p as OrForcingPlan,
          {
            ...fixture.expectedEffects[0],
            kind: fixture.expectedEffects[0].kind as "remove" | "place",
          },
        )
      : (assembly === "production"
          ? compileGeneralized
          : independentGeneralized)(view, p as GeneralizedPlan);
  return { view, proposal, p, sourceProposal };
}

test.each([
  ["production", compileOrForcing],
  ["independent", independentOrForcing],
] as const)(
  "%s assembly cannot relabel an empty-right contradiction as a literal OR result",
  (_name, compile) => {
    const { view, p } = orFixture(
      c28.find((f) => f.id === "C28-generalized-C25-z")!,
    );
    const branch = p.branches.find((b: any) => b.generalized);
    branch.generalized.positions.at(-1).right = [];
    branch.generalized.consequence = [67, 8];
    branch.result = { cell: 67, symbol: 8, positive: false };
    const proposal = compile(view, p, { kind: "remove", cell: 67, symbol: 8 });
    const context = {
      view,
      retained: retainedProof(view),
      policy: "discharged" as const,
      uniqueEvidenceId: null,
      limits: discoveryContext().limits,
    };
    expect([...verifyCertificate(proposal, context)].at(-1)).toMatchObject({
      kind: "verified",
    });
    const certificate = (proposal.pattern as any).certificate;
    const index = p.branches.indexOf(branch);
    expect(
      proposal.proof.nodes.find(
        (n) => n.id === certificate.branches[index].result,
      )?.conclusion,
    ).toEqual({ kind: "false" });
    expect([...checkProposal(proposal, context)].at(-1)).toMatchObject({
      kind: "rejected",
      code: "generalized-right-size",
    });
  },
);

test.each(["bivalue", "braid"] as const)(
  "independent %s cache source is retained before its independent OR consumer",
  (grammar) => {
    const fixture = c28.find((f) => f.id === "C28-inserted-or2-12")!;
    const { view, proposal, sourceProposal, p } = orFixture(
      fixture,
      "independent",
      grammar,
    );
    expect(sourceProposal.technique).toBe(
      grammar === "bivalue" ? "c25@1" : "c27@1",
    );
    expect(sourceProposal.effects).toEqual([]);
    expect(sourceProposal.proof.roots).toHaveLength(1);
    expect(view.facts.get(p.source)?.proposition.kind).toBe("clause");
    expect(proposal.proof.imports).toContain(p.source);
    assertSound(view, proposal);
    expect(
      [
        ...replay(
          { problem: view.assembly.problem } as SolverSnapshot,
          [
            ...originalCluePrefix(fixture as unknown as TechniqueFixture),
            sourceProposal,
            proposal,
          ],
          view.assembly,
          discoveryContext().limits,
        ),
      ].at(-1)?.kind,
    ).toBe("checked");
  },
  60000,
);

test.each(
  c28.flatMap((fixture) => [
    { ...fixture, assembly: "production" as const },
    { ...fixture, assembly: "independent" as const },
  ]),
)(
  "authentic complete retained OR $assembly $id",
  (fixture) => {
    const { view, proposal, p, sourceProposal } = orFixture(
      fixture,
      fixture.assembly,
    );
    if (
      "expectedAdmission" in fixture &&
      fixture.expectedAdmission === "out-of-profile"
    ) {
      const ctx = {
        view,
        retained: retainedProof(view),
        policy: "discharged" as const,
        uniqueEvidenceId: null,
        limits: discoveryContext().limits,
      };
      expect([...verifyCertificate(proposal, ctx)].at(-1)).toMatchObject({
        kind: "verified",
      });
      assertCertificateSound(view, independentGeneralized(view, p));
      expect([...checkProposal(proposal, ctx)].at(-1)).toMatchObject({
        kind: "rejected",
        code: "generalized-position-bound",
      });
      return;
    }
    assertSound(view, proposal);
    assertSound(
      view,
      p.kind === "or-forcing"
        ? independentOrForcing(view, p, {
            ...fixture.expectedEffects[0],
            kind: fixture.expectedEffects[0].kind as "remove" | "place",
          })
        : independentGeneralized(view, p),
    );
    const context = discoveryContext();
    let found = false;
    for (const e of buildProvedClauses(view, context.workspace))
      if (e.kind === "ready") {
        expect(e.value.completeFor(view)).toBe(true);
        found = e.value.entries.some((entry) => entry.source === p.source);
        e.value.dispose();
      }
    expect(found).toBe(true);
    expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
    expect(
      [
        ...replay(
          { problem: view.assembly.problem } as SolverSnapshot,
          [
            ...originalCluePrefix(fixture as unknown as TechniqueFixture),
            sourceProposal,
            proposal,
          ],
          view.assembly,
          discoveryContext().limits,
        ),
      ].at(-1)?.kind,
    ).toBe("checked");
  },
  60000,
);

test.each([...c25, ...c26, ...c27])(
  "independent ordered recipe $id",
  (fixture) => {
    const view = fixtureView(fixture as unknown as TechniqueFixture);
    const proposal = compileGeneralized(
      view,
      fixture.expectedPattern as unknown as GeneralizedPlan,
    );
    const result = [
      ...checkProposal(proposal, {
        view,
        retained: retainedProof(view),
        policy: "discharged",
        uniqueEvidenceId: null,
        limits: discoveryContext().limits,
      }),
    ].at(-1);
    expect(result, JSON.stringify(result)).toMatchObject({
      kind:
        "expectedAdmission" in fixture &&
        fixture.expectedAdmission === "out-of-profile"
          ? "rejected"
          : "checked",
    });
    const independent = independentGeneralized(view, fixture.expectedPattern);
    if (result?.kind === "checked") {
      assertSound(view, proposal);
      assertSound(view, independent);
      expect(
        [
          ...replay(
            { problem: view.assembly.problem } as SolverSnapshot,
            [
              ...originalCluePrefix(fixture as unknown as TechniqueFixture),
              independent,
            ],
            view.assembly,
            discoveryContext().limits,
          ),
        ].at(-1)?.kind,
      ).toBe("checked");
    } else assertCertificateSound(view, independent);
  },
  60000,
);

test.each(generalizedTechniques)(
  "actual $id discovery independently admits yielded grammar",
  (descriptor) => {
    const fixture =
      descriptor.id === "c27@1"
        ? c27.find((f) => f.id === "C27-gwhip-group2")!
        : c26[0];
    const view = fixtureView(fixture as unknown as TechniqueFixture),
      context = discoveryContext(),
      found = new Set<string>();
    context.limits.timeMs = 120000;
    const cursor = descriptor.discover(view, context);
    let terminal = "";
    try {
      for (const event of cursor) {
        terminal = event.kind;
        if (event.kind !== "proposal") continue;
        const plan = event.proposal.pattern as unknown as GeneralizedPlan;
        if (found.has(plan.grammar)) continue;
        if (
          plan.grammar === "z" &&
          !plan.positions.slice(0, -1).some((p) => p.excluded.length)
        )
          continue;
        if (
          plan.grammar === "t" &&
          !plan.positions.slice(0, -1).some((p) => p.excluded.length)
        )
          continue;
        assertSound(view, event.proposal);
        found.add(plan.grammar);
        if (found.size === 2) break;
      }
    } finally {
      cursor.return();
    }
    expect(found.size, terminal + ":" + [...found]).toBe(2);
    expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  },
  150000,
);

test("same-revision source publication invalidates completeness, preserves exact facts, and cannot repeat retention", () => {
  const fixture = c28.find((f) => f.id === "C28-inserted-or3")!,
    base = fixtureView(fixture as unknown as TechniqueFixture),
    { view, sourceProposal, p } = orFixture(fixture),
    context = discoveryContext();
  expect(view.state.key).toEqual(base.state.key);
  expect(view.state.domains).toBe(base.state.domains);
  expect(view.state.values).toBe(base.state.values);
  const checked = [
    ...checkProposal(sourceProposal, {
      view: base,
      retained: retainedProof(base),
      policy: "discharged",
      uniqueEvidenceId: null,
      limits: context.limits,
    }),
  ].at(-1);
  if (checked?.kind !== "checked") throw Error("source");
  expect(() => retainCheckedFacts(view, checked.step)).toThrow(
    "reused-proof-node",
  );
  for (const event of buildProvedClauses(base, context.workspace))
    if (event.kind === "ready") {
      const index = event.value;
      expect(index.completeFor(base)).toBe(true);
      expect(index.completeFor(view)).toBe(false);
      expect(index.acceptsView(view, () => {})).toBe(true);
      expect(index.completeFor(rebuildOwnedIndexes(base))).toBe(true);
      expect(index.acceptsView({ ...view }, () => {})).toBe(false);
      index.dispose();
    }
  for (const event of buildProvedClauses(view, context.workspace))
    if (event.kind === "ready") {
      const source = event.value.entries.find((e) => e.source === p.source)!;
      expect(source.premiseFacts).toEqual([view.facts.get(p.source)]);
      expect(source.premiseFacts[0]).toBe(view.facts.get(p.source));
      const pending = [p.source],
        seen = new Set<number>();
      while (pending.length) {
        const id = pending.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        const n = retainedProof(view).get(id)!;
        expect(n.rule).not.toBe("assume@1");
        pending.push(...n.premises);
      }
      event.value.dispose();
    }
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
});

test("C28 owns the exact-ready transferred clause index before work interruption", () => {
  const { view } = orFixture(c28.find((f) => f.id === "C28-inserted-or2")!),
    measure = discoveryContext();
  let work = 0;
  for (const e of buildProvedClauses(view, measure.workspace))
    if (e.kind === "work") work += e.units;
    else if (e.kind === "ready") e.value.dispose();
  const context = discoveryContext();
  context.limits.workUnits = work + 1;
  expect([...orTechniques[0].discover(view, context)].at(-1)).toEqual({
    kind: "interrupted",
    reason: "work-limit",
  });
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
});

test("C28 owns both transferred indexes at the implication ready boundary", () => {
  const { view } = orFixture(c28.find((f) => f.id === "C28-inserted-or2")!),
    measure = discoveryContext();
  let work = 0;
  for (const builder of [buildProvedClauses, buildImplications]) {
    for (const event of builder(view, measure.workspace)) {
      if (event.kind === "work") work += event.units;
      else if (event.kind === "ready") event.value.dispose();
    }
  }
  const context = discoveryContext();
  context.limits.workUnits = work + 2;
  expect([...orTechniques[0].discover(view, context)].at(-1)).toEqual({
    kind: "interrupted",
    reason: "work-limit",
  });
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
});

test.each([generalizedTechniques[0], orTechniques[0]])(
  "$id counts consumer time between yields and releases ownership",
  (descriptor) => {
    const { view } = orFixture(c28.find((f) => f.id === "C28-inserted-or2")!),
      context = discoveryContext();
    let now = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    const cursor = descriptor.discover(view, context);
    try {
      expect(cursor.next().value).toMatchObject({ kind: "work" });
      now = context.limits.timeMs + 1;
      expect([...cursor].at(-1)).toEqual({
        kind: "interrupted",
        reason: "time-limit",
      });
    } finally {
      cursor.return();
      clock.mockRestore();
    }
    expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  },
);

test("a primitive-valid shorter proof cannot decorate or replace a complete ordered root", () => {
  const f = c26.find((f) => f.id === "C26-whip")!,
    view = fixtureView(f as unknown as TechniqueFixture);
  const long = compileGeneralized(
      view,
      f.expectedPattern as unknown as GeneralizedPlan,
    ),
    short = compileGeneralized(
      view,
      c25.find((f) => f.id === "C25-z")!
        .expectedPattern as unknown as GeneralizedPlan,
    );
  const mixed = structuredClone(long) as any,
    offset = Math.max(...long.proof.nodes.map((n) => n.id)) + 1,
    map = new Map(short.proof.nodes.map((n, i) => [n.id, offset + i]));
  const remap = (id: number) => map.get(id) ?? id;
  mixed.proof.nodes.push(
    ...short.proof.nodes
      .filter((n) => n.rule !== "domain-restrict@1")
      .map((n) => ({
        ...n,
        id: remap(n.id),
        premises: n.premises.map(remap),
        scope: n.scope.map(remap),
      })),
  );
  const extra = remap((short.pattern as any).certificate.root);
  mixed.proof.roots.push(extra);
  mixed.proof.imports = [
    ...new Set([...long.proof.imports, ...short.proof.imports]),
  ].sort((a: any, b: any) => a - b);
  const context = {
    view,
    retained: retainedProof(view),
    policy: "discharged" as const,
    uniqueEvidenceId: null,
    limits: discoveryContext().limits,
  };
  expect([...verifyCertificate(mixed, context)].at(-1)).toMatchObject({
    kind: "verified",
  });
  expect([...checkProposal(mixed, context)].at(-1)).toMatchObject({
    kind: "rejected",
    code: "forcing-unrelated-root",
  });
});

test("an authentic cached same-effect theorem cannot decorate the inserted OR proof", () => {
  const { view, proposal, sourceProposal } = orFixture(
      c28.find((f) => f.id === "C28-inserted-or2")!,
    ),
    mixed = structuredClone(proposal) as any;
  const cached = sourceProposal.proof.roots[0];
  mixed.proof.roots.push(cached);
  mixed.proof.imports = [...new Set([...mixed.proof.imports, cached])].sort(
    (a: any, b: any) => a - b,
  );
  const ctx = {
    view,
    retained: retainedProof(view),
    policy: "discharged" as const,
    uniqueEvidenceId: null,
    limits: discoveryContext().limits,
  };
  expect([...verifyCertificate(mixed, ctx)].at(-1)).toMatchObject({
    kind: "verified",
  });
  expect([...checkProposal(mixed, ctx)].at(-1)).toMatchObject({
    kind: "rejected",
    code: "forcing-unrelated-root",
  });
});

test.each(["cover-only", "extra-root", "effectful", "missing-position"])(
  "complete theorem cache rejects %s",
  (mutation) => {
    const { sourceProposal } = orFixture(
        c28.find((f) => f.id === "C28-inserted-or2")!,
      ),
      view = fixtureView(
        c28.find(
          (f) => f.id === "C28-inserted-or2",
        )! as unknown as TechniqueFixture,
      ),
      p = structuredClone(sourceProposal) as any;
    if (mutation === "cover-only")
      p.proof.roots = [p.pattern.certificate.positions[0].cover];
    if (mutation === "extra-root")
      p.proof.roots.push(p.pattern.certificate.positions[0].cover);
    if (mutation === "effectful")
      p.effects = [
        {
          kind: "remove",
          cell: p.pattern.target[0],
          symbol: p.pattern.target[1],
        },
      ];
    if (mutation === "missing-position") p.pattern.positions.pop();
    expect(
      [
        ...checkProposal(p, {
          view,
          retained: retainedProof(view),
          policy: "discharged",
          uniqueEvidenceId: null,
          limits: discoveryContext().limits,
        }),
      ].at(-1)?.kind,
    ).toBe("rejected");
  },
);

test.each([
  "source",
  "missing-case",
  "differing-effect",
  "inserted-alias",
  "source-sibling",
])("OR forcing rejects %s", (mutation) => {
  const { view, proposal } = orFixture(c28.find((f) => f.id === "C28-or3")!),
    p = structuredClone(proposal) as any;
  if (mutation === "source") p.pattern.source = view.state.domainFacts[58];
  if (mutation === "missing-case") p.pattern.branches.pop();
  if (mutation === "differing-effect")
    p.pattern.branches.find((b: any) => b.result !== "false").result.symbol = 1;
  if (mutation === "inserted-alias") {
    p.pattern.grammar = "inserted-or-whip";
    p.pattern.alias = "OR-k whips";
  }
  if (mutation === "source-sibling")
    p.proof.nodes.find((n: any) => n.rule === "resolution@1").scope = [
      p.pattern.certificate.branches[1].assumption,
    ];
  expect(
    [
      ...checkProposal(p, {
        view,
        retained: retainedProof(view),
        policy: "discharged",
        uniqueEvidenceId: null,
        limits: discoveryContext().limits,
      }),
    ].at(-1)?.kind,
  ).toBe("rejected");
});

test.each([
  "missing-alternative",
  "prefix",
  "suffix",
  "second-or",
  "thirteenth",
])("inserted OR rejects %s", (mutation) => {
  const { view, proposal } = orFixture(
      c28.find((f) => f.id === "C28-inserted-or3")!,
    ),
    p = structuredClone(proposal) as any,
    i = p.pattern.positions.findIndex((s: any) => s.role === "or");
  if (mutation === "missing-alternative")
    p.pattern.positions[i].alternatives.pop();
  if (mutation === "prefix")
    p.pattern.positions[i].leftConflict = p.pattern.positions.at(-2).right;
  if (mutation === "suffix")
    p.pattern.positions[i + 1].leftConflict = p.pattern.target;
  if (mutation === "second-or") p.pattern.positions[0].role = "or";
  if (mutation === "thirteenth")
    p.pattern.positions = Array(13).fill(p.pattern.positions[0]);
  expect(
    [
      ...checkProposal(p, {
        view,
        retained: retainedProof(view),
        policy: "discharged",
        uniqueEvidenceId: null,
        limits: discoveryContext().limits,
      }),
    ].at(-1)?.kind,
  ).toBe("rejected");
});

test("OR case admits a generalized same-effect branch without a second assumption", () => {
  const { view, p } = orFixture(c28.find((f) => f.id === "C28-or2")!);
  const plan = structuredClone(p) as any;
  plan.branches[1] = {
    assumption: { cell: 5, symbol: 8, positive: true },
    result: { cell: 57, symbol: 6, positive: false },
    generalized: {
      grammar: "bivalue",
      target: [5, 8],
      consequence: [57, 6],
      positions: [
        {
          variable: "row:0:symbol:6",
          alternatives: [
            [3, 6],
            [5, 6],
          ],
          left: [5, 6],
          leftConflict: [5, 8],
          excluded: [],
          right: [3, 6],
        },
      ],
    },
  };
  const proposal = compileOrForcing(view, plan, {
    kind: "remove",
    cell: 57,
    symbol: 6,
  });
  assertSound(view, proposal);
  expect(
    proposal.proof.nodes.filter((n) => n.rule === "assume@1"),
  ).toHaveLength(2);
  const bad = structuredClone(proposal) as any;
  bad.pattern.branches[1].generalized.consequence = [58, 6];
  expect(
    [
      ...checkProposal(bad, {
        view,
        retained: retainedProof(view),
        policy: "discharged",
        uniqueEvidenceId: null,
        limits: discoveryContext().limits,
      }),
    ].at(-1)?.kind,
  ).toBe("rejected");
});

test("a genuine 25-link OR branch is primitive-valid and rejected by the named static cap", () => {
  const { view, p } = orFixture(
      c28.find((f) => f.id === "C28-signed-or2-static24")!,
    ),
    plan = structuredClone(p) as any;
  const house = view.assembly.allDifferent.find(
    (h) =>
      h.cells.includes(49) &&
      h.cells.some(
        (c) => c !== 49 && !view.state.values[c] && view.state.domains[c] & 2,
      ),
  )!;
  const cell = house.cells.find(
    (c) => c !== 49 && !view.state.values[c] && view.state.domains[c] & 2,
  )!;
  for (const branch of plan.branches) {
    const from = branch.result,
      to = { cell, symbol: 2, positive: false };
    branch.paths[0].push({
      from,
      to,
      reason: { kind: "scope-conflict", house: house.id, symbol: 2 },
    });
    branch.result = to;
  }
  const proposal = compileOrForcing(view, plan, {
      kind: "remove",
      cell,
      symbol: 2,
    }),
    ctx = {
      view,
      retained: retainedProof(view),
      policy: "discharged" as const,
      uniqueEvidenceId: null,
      limits: discoveryContext().limits,
    };
  expect(plan.branches[0].paths[0]).toHaveLength(25);
  expect([...verifyCertificate(proposal, ctx)].at(-1)).toMatchObject({
    kind: "verified",
  });
  expect([...checkProposal(proposal, ctx)].at(-1)).toMatchObject({
    kind: "rejected",
    code: "or-static-bound",
  });
});

test("signed retained OR clauses support forcing but cannot be inserted as positive candidates", () => {
  const { view } = orFixture(c28.find((f) => f.id === "C28-inserted-or2")!),
    context = discoveryContext();
  let source = 0;
  for (const e of buildProvedClauses(view, context.workspace))
    if (e.kind === "ready") {
      const entry = e.value.entries.find((e) =>
        e.alternatives.every((a) => !a.positive),
      )!;
      expect(entry).toBeDefined();
      source = entry.source;
      e.value.dispose();
    }
  // Search the actual scalar graph rather than fabricate signed branch facts.
  const cursor = orTechniques[0].discover(view, context);
  let found = false;
  try {
    for (const e of cursor)
      if (e.kind === "proposal") {
        const p = e.proposal.pattern as any;
        if (
          p.kind !== "or-forcing" ||
          !p.alternatives.some((a: any) => !a.positive)
        )
          continue;
        assertSound(view, e.proposal);
        found = true;
        break;
      }
  } finally {
    cursor.return();
  }
  expect(found).toBe(true);
  const bad = structuredClone(
    orFixture(c28.find((f) => f.id === "C28-inserted-or2")!).proposal,
  ) as any;
  bad.pattern.source = source;
  bad.pattern.certificate.positions[
    bad.pattern.positions.findIndex((p: any) => p.role === "or")
  ].cover = source;
  expect(
    [
      ...checkProposal(bad, {
        view,
        retained: retainedProof(view),
        policy: "discharged",
        uniqueEvidenceId: null,
        limits: context.limits,
      }),
    ].at(-1)?.kind,
  ).toBe("rejected");
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
}, 60000);

test("production target search discovers real nonpredecessor braid structure", () => {
  const f = c27.find((f) => f.id.includes("causal")) ?? c27[0],
    view = fixtureView(f as unknown as TechniqueFixture),
    p = f.expectedPattern as unknown as GeneralizedPlan;
  const search = new GeneralizedSearch(view, buildCspVariables(view)),
    cursor = search.plans("braid", 12, undefined, p.target);
  let work = 0,
    found = false;
  try {
    for (const e of cursor) {
      if (++work > 10000000) break;
      if (
        e.kind !== "plan" ||
        !generalizedFeatures(e.plan).split(":").includes("true")
      )
        continue;
      const positions = e.plan.positions;
      const nonpredecessor = positions.some(
        (p, i) =>
          i > 0 &&
          JSON.stringify(p.leftConflict) !==
            JSON.stringify(positions[i - 1].right),
      );
      if (!nonpredecessor) continue;
      assertSound(view, compileGeneralized(view, e.plan));
      found = true;
      break;
    }
  } finally {
    cursor.return(undefined);
  }
  expect(found, `work:${work}`).toBe(true);
}, 60000);

test.each([...generalizedTechniques, ...orTechniques])(
  "$id interrupts and releases on every resource class",
  (descriptor) => {
    const view = fixtureView(c26[0] as unknown as TechniqueFixture);
    for (const reason of [
      "work-limit",
      "time-limit",
      "cancelled",
      "workspace-entry-limit",
      "workspace-byte-limit",
    ] as const) {
      const context = { ...discoveryContext() };
      if (reason === "work-limit") context.limits.workUnits = 1;
      if (reason === "time-limit") context.limits.timeMs = 0;
      if (reason === "cancelled")
        context.workspace = new IndexWorkspace({
          entryLimit: 1000000,
          byteLimit: 256000000,
          cancelled: () => true,
        });
      if (reason === "workspace-entry-limit")
        context.workspace = new IndexWorkspace({
          entryLimit: 0,
          byteLimit: 256000000,
        });
      if (reason === "workspace-byte-limit")
        context.workspace = new IndexWorkspace({
          entryLimit: 1000000,
          byteLimit: 1,
        });
      expect([...descriptor.discover(view, context)].at(-1)).toEqual({
        kind: "interrupted",
        reason,
      });
      expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
    }
  },
);

test.each([
  "wrong-alias",
  "forward-right",
  "omit-alternative",
  "t-interior-z",
  "mixed-root",
  "replace-root",
  "wrong-scope",
])("ordered admission rejects %s", (mutation) => {
  const f = c26.find((f) => f.id === "C26-whip")!,
    view = fixtureView(f as unknown as TechniqueFixture),
    p = structuredClone(
      compileGeneralized(view, f.expectedPattern as unknown as GeneralizedPlan),
    ) as any;
  if (mutation === "wrong-alias") p.pattern.alias = "Braids";
  if (mutation === "forward-right")
    p.pattern.positions[1].leftConflict = p.pattern.positions[3].right;
  if (mutation === "omit-alternative")
    p.pattern.positions[3].alternatives.pop();
  if (mutation === "t-interior-z") {
    p.pattern.grammar = "t";
    p.pattern.alias = "t-whips";
  }
  if (mutation === "mixed-root")
    p.proof.roots.push(p.pattern.certificate.positions[0].result);
  if (mutation === "replace-root")
    p.pattern.certificate.root = p.pattern.certificate.positions[0].result;
  if (mutation === "wrong-scope")
    p.proof.nodes.find((n: any) => n.rule === "resolution@1").scope = [];
  expect(
    [
      ...checkProposal(p, {
        view,
        retained: retainedProof(view),
        policy: "discharged",
        uniqueEvidenceId: null,
        limits: discoveryContext().limits,
      }),
    ].at(-1)?.kind,
  ).toBe("rejected");
});

test.each(["member", "member-proof", "forward", "alias"])(
  "group certificate rejects %s substitution",
  (mutation) => {
    const f = c27.find((f) => f.id === "C27-gwhip-group2")!,
      view = fixtureView(f as unknown as TechniqueFixture),
      p = structuredClone(
        compileGeneralized(
          view,
          f.expectedPattern as unknown as GeneralizedPlan,
        ),
      ) as any;
    if (mutation === "member") p.pattern.positions[3].leftConflict.pop();
    if (mutation === "member-proof")
      p.pattern.certificate.positions[3].exclusions[0].weak.pop();
    if (mutation === "forward")
      p.pattern.positions[2].leftConflict = p.pattern.positions[3].right;
    if (mutation === "alias") {
      p.pattern.grammar = "whip";
      p.pattern.alias = "Whips";
      p.technique = "c26@1";
    }
    expect(
      [
        ...checkProposal(p, {
          view,
          retained: retainedProof(view),
          policy: "discharged",
          uniqueEvidenceId: null,
          limits: discoveryContext().limits,
        }),
      ].at(-1)?.kind,
    ).toBe("rejected");
  },
);

test("actual OR forcing and inserted discovery use retained source facts", () => {
  const { view } = orFixture(c28.find((f) => f.id === "C28-inserted-or2")!),
    context = discoveryContext();
  context.limits.timeMs = 120000;
  const cursor = orTechniques[0].discover(view, context),
    found = new Set<string>();
  let terminal = "";
  try {
    for (const e of cursor) {
      terminal = e.kind;
      if (e.kind !== "proposal") continue;
      const p = e.proposal.pattern as { grammar?: string; kind?: string },
        kind = p.grammar ?? p.kind!;
      if (found.has(kind)) continue;
      assertSound(view, e.proposal);
      found.add(kind);
      if (found.size === 2) break;
    }
  } finally {
    cursor.return();
  }
  expect([...found].sort(), terminal).toEqual([
    "inserted-or-whip",
    "or-forcing",
  ]);
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
}, 150000);

test("actual OR discovery includes an independently checked generalized case", () => {
  const { view } = orFixture(
      c28.find((f) => f.id === "C28-generalized-C25-z")!,
    ),
    context = discoveryContext();
  context.limits.timeMs = 120000;
  const cursor = orTechniques[0].discover(view, context);
  let found = false,
    terminal = "";
  try {
    for (const e of cursor) {
      terminal = e.kind;
      if (e.kind !== "proposal") continue;
      const p = e.proposal.pattern as any;
      if (
        p.kind !== "or-forcing" ||
        !p.branches.some((b: any) => b.generalized)
      )
        continue;
      assertSound(view, e.proposal);
      found = true;
      break;
    }
  } finally {
    cursor.return();
  }
  expect(found, terminal).toBe(true);
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
}, 150000);

const scalarGrammarAliases = [
  ["bivalue", "Bivalue chains"],
  ["z", "z-chains"],
  ["t", "t-whips"],
  ["whip", "Whips"],
  ["braid", "Braids"],
] as const;

test.each(scalarGrammarAliases)(
  "inclusive %s grammar admits a genuine twelve-pair certificate",
  (grammar, alias) => {
    const f = c25.find((f) => f.id === "C25-bivalue-12-no-premature-close")!,
      view = fixtureView(f as unknown as TechniqueFixture);
    const plan = {
      ...f.expectedPattern,
      grammar,
    } as unknown as GeneralizedPlan;
    expect(plan.positions).toHaveLength(12);
    expect(plan.positions.every((p) => p.right !== null)).toBe(true);
    for (const [assembly, proposal] of [
      ["production", compileGeneralized(view, plan)],
      ["independent", independentGeneralized(view, plan)],
    ] as const) {
      expect((proposal.pattern as any).alias, assembly).toBe(alias);
      assertSound(view, proposal);
    }
  },
  60000,
);

test.each(
  scalarGrammarAliases.filter(
    ([grammar]) => grammar !== "bivalue" && grammar !== "braid",
  ),
)(
  "a genuine thirteen-pair %s certificate is primitive-valid and rejected by the named bound",
  (grammar, alias) => {
    const f = c25.find((f) => f.id === "C25-bivalue-13-no-premature-close")!,
      view = fixtureView(f as unknown as TechniqueFixture),
      plan = {
        ...f.expectedPattern,
        grammar,
      } as unknown as GeneralizedPlan,
      context = {
        view,
        retained: retainedProof(view),
        policy: "discharged" as const,
        uniqueEvidenceId: null,
        limits: discoveryContext().limits,
      };
    expect(plan.positions).toHaveLength(13);
    expect(plan.positions.every((position) => position.right !== null)).toBe(
      true,
    );
    for (const [assembly, proposal] of [
      ["production", compileGeneralized(view, plan)],
      ["independent", independentGeneralized(view, plan)],
    ] as const) {
      expect((proposal.pattern as any).alias, assembly).toBe(alias);
      expect(
        [...verifyCertificate(proposal, context)].at(-1),
        assembly,
      ).toMatchObject({ kind: "verified" });
      assertCertificateSound(view, proposal);
      expect(
        [...checkProposal(proposal, context)].at(-1),
        assembly,
      ).toMatchObject({
        kind: "rejected",
        code: "generalized-position-bound",
      });
    }
  },
  60000,
);

test("inclusive scalar grammars admit the one-position minimum without fake padding", () => {
  const view = fixtureView(c26[0] as unknown as TechniqueFixture),
    search = new GeneralizedSearch(view, buildCspVariables(view)),
    cursor = search.plans("bivalue", 1);
  let plan: GeneralizedPlan | undefined;
  try {
    for (const event of cursor)
      if (event.kind === "plan") {
        plan = event.plan;
        break;
      }
  } finally {
    cursor.return(undefined);
  }
  expect(plan?.positions).toHaveLength(1);
  for (const grammar of ["bivalue", "z", "t", "whip", "braid"] as const)
    assertSound(view, compileGeneralized(view, { ...plan!, grammar }));
});

test("a designated t terminal closing candidate cannot be an ordinary target-dependent extra", () => {
  const f = c26.find((f) => f.id === "C26-t")!,
    view = fixtureView(f as unknown as TechniqueFixture),
    proposal = structuredClone(
      compileGeneralized(view, f.expectedPattern as unknown as GeneralizedPlan),
    ) as any;
  const terminal = proposal.pattern.positions.at(-1);
  terminal.excluded.push({
    literal: terminal.closingCandidate,
    conflictWith: terminal.closingConflict,
  });
  delete terminal.closingCandidate;
  delete terminal.closingConflict;
  const ctx = {
    view,
    retained: retainedProof(view),
    policy: "discharged" as const,
    uniqueEvidenceId: null,
    limits: discoveryContext().limits,
  };
  expect([...verifyCertificate(proposal, ctx)].at(-1)).toMatchObject({
    kind: "verified",
  });
  expect([...checkProposal(proposal, ctx)].at(-1)).toMatchObject({
    kind: "rejected",
    code: "t-extra-policy",
  });
});

test("C28 reports watched source absence only after completing the owned clause scan", () => {
  const base = fixtureView(c26[0] as unknown as TechniqueFixture),
    view = initialize(base.assembly, "primary"),
    context = discoveryContext();
  const events = [...orTechniques[0].discover(view, context)];
  expect(events.at(-1)).toEqual({
    kind: "excluded",
    reason: "missing-proved-or-clause",
    dependencies: [{ kind: "all" }],
  });
  expect(events.some((e) => e.kind === "exhausted")).toBe(false);
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
});

test.each([generalizedTechniques[0], orTechniques[0]])(
  "$id preserves proof-size interruption and releases compilation ownership",
  (descriptor) => {
    const { view } = orFixture(c28.find((f) => f.id === "C28-inserted-or2")!),
      context = discoveryContext();
    context.limits.stepNodes = 1;
    expect([...descriptor.discover(view, context)].at(-1)).toEqual({
      kind: "interrupted",
      reason: "proof-step-limit",
    });
    expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  },
);
