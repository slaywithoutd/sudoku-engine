import { expect, test } from "vitest";
import fixtures from "../../solver/fixtures/C23.json";
import {
  assertSound,
  assertCertificateSound,
  type TechniqueFixture,
} from "../../solver/acceptance";
import {
  forcingView,
  independentNetGeometry,
  independentNetCertificate,
} from "../../solver/forcing-acceptance";
import { discoveryContext } from "../../solver/discovery-context";
import { checkProposal, verifyCertificate } from "../../../src/solver/proof/checker";
import chainFixtures from "../../solver/fixtures/C22.json";
import { ForcingProof, type ForcingLink } from "../../../src/solver/techniques/forcing-proof";
import { retainedProof } from "../../../src/solver/state/candidates";
import { compileNet, type NetPlan } from "../../../src/solver/techniques/nets";
import { discoverNetCandidate } from "../../../src/solver/techniques/nets-runtime";
import { replay } from "../../../src/solver/proof/replay";
import type { SolverSnapshot } from "../../../src/solver/snapshot";
import { netTechniques } from "../../../src/solver/techniques/nets";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";

test.each(fixtures.filter((f) => f.expectation !== "out-of-profile"))(
  "compiles bounded mixed-digit net $id from its genuine prefix",
  (fixture) => {
    independentNetGeometry(fixture as unknown as TechniqueFixture);
    const { view, prefix } = forcingView(fixture as unknown as TechniqueFixture),
      plan = fixture.expectedPattern as unknown as NetPlan;
    const proposal = compileNet(view, plan);
    const counts = new Map<number, number>();
    for (const n of proposal.proof.nodes)
      if (
        n.scope.length &&
        ["resolution@1", "hall@1", "cover-clause@1", "contradiction@1", "cases@1"].includes(n.rule)
      ) {
        const a = n.scope.at(-1)!;
        counts.set(a, (counts.get(a) ?? 0) + 1);
      }
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(128);
    const result = [
      ...checkProposal(proposal, {
        view,
        retained: retainedProof(view),
        policy: "discharged",
        uniqueEvidenceId: null,
        limits: discoveryContext().limits,
      }),
    ].at(-1);
    expect(result, JSON.stringify(result)).toMatchObject({ kind: "checked" });
    assertSound(view, proposal);
    assertSound(view, independentNetCertificate(fixture as unknown as TechniqueFixture));
    expect(
      [
        ...replay(
          { problem: view.assembly.problem } as SolverSnapshot,
          [...prefix, proposal],
          view.assembly,
          discoveryContext().limits,
        ),
      ].at(-1)?.kind,
    ).toBe("checked");
  },
  60000,
);

test.each([128, 129])(
  "the independent %i-inference boundary has a complete productive mathematical proof",
  (maximum) => {
    const f = fixtures.find((f) => f.id === `C23-dynamic-semantic-${maximum}`)!,
      { view } = forcingView(f as unknown as TechniqueFixture),
      proposal = compileNet(view, f.expectedPattern as unknown as NetPlan);
    independentNetGeometry(f as unknown as TechniqueFixture);
    const semantic = proposal.proof.nodes.filter(
      (n) =>
        n.scope.length &&
        ["resolution@1", "hall@1", "cover-clause@1", "contradiction@1", "cases@1"].includes(n.rule),
    );
    expect(semantic).toHaveLength(maximum);
    expect(proposal.proof.nodes.length).toBeGreaterThan(128);
    assertCertificateSound(view, proposal);
    assertCertificateSound(view, independentNetCertificate(f as unknown as TechniqueFixture));
    const result = [
      ...checkProposal(proposal, {
        view,
        retained: retainedProof(view),
        policy: "discharged",
        uniqueEvidenceId: null,
        limits: discoveryContext().limits,
      }),
    ].at(-1);
    expect(result).toMatchObject(
      maximum === 128 ? { kind: "checked" } : { kind: "rejected", code: "net-node-out-of-profile" },
    );
  },
  60000,
);

test.each(["static", "dynamic", "nested"] as const)(
  "actual bounded %s candidate discovery",
  (mode) => {
    const fixture = fixtures[mode === "nested" ? 1 : 0],
      { view } = forcingView(fixture as unknown as TechniqueFixture),
      context = discoveryContext();
    const events = [
      ...discoverNetCandidate(view, { cell: 26, symbol: 3, positive: true }, mode, context),
    ];
    const event = events.find((e) => e.kind === "proposal");
    expect(event, JSON.stringify(events.at(-1))).toBeDefined();
    if (event?.kind !== "proposal") throw Error("missing-net");
    const result = [
      ...checkProposal(event.proposal, {
        view,
        retained: retainedProof(view),
        policy: "discharged",
        uniqueEvidenceId: null,
        limits: context.limits,
      }),
    ].at(-1);
    expect(result, JSON.stringify(result)).toMatchObject({ kind: "checked" });
    assertSound(view, event.proposal);
    expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  },
  60000,
);

test.each(["sibling", "stale-domain", "missing-case", "depth3", "static-label", "substitute-root"])(
  "rejects net %s",
  (mutation) => {
    const fixture = fixtures[1],
      { view } = forcingView(fixture as unknown as TechniqueFixture),
      proposal = compileNet(view, fixture.expectedPattern as unknown as NetPlan),
      p = proposal as any,
      c = p.pattern.branch;
    if (mutation === "sibling")
      p.proof.nodes.find((n: any) => n.id === c.children[1].result).premises = [
        c.children[0].result,
      ];
    if (mutation === "stale-domain")
      p.proof.nodes.find((n: any) => n.id === c.cover).premises = [view.state.domainFacts[16]];
    if (mutation === "missing-case") c.children.pop();
    if (mutation === "depth3") {
      c.children[0].children = [structuredClone(c.children[1])];
      c.children[0].children[0].children = [structuredClone(c.children[1])];
    }
    if (mutation === "static-label") {
      p.pattern.mode = "static";
      p.pattern.alias = "Static forcing nets";
    }
    if (mutation === "substitute-root") p.pattern.root = c.result;
    expect(
      [
        ...checkProposal(proposal, {
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

test("a static basic proof cannot acquire a dynamic label without consuming a rebuilt link", () => {
  const { view } = forcingView(fixtures[0] as unknown as TechniqueFixture),
    proposal = compileNet(view, {
      ...fixtures[0].expectedPattern,
      mode: "dynamic",
    } as unknown as NetPlan);
  expect(
    [
      ...checkProposal(proposal, {
        view,
        retained: retainedProof(view),
        policy: "discharged",
        uniqueEvidenceId: null,
        limits: discoveryContext().limits,
      }),
    ].at(-1),
  ).toMatchObject({ kind: "rejected", code: "net-missing-dynamic-link" });
});

test("an unused Hall deduction cannot decorate a chain as a net", () => {
  const f = chainFixtures.find((f) => f.id === "C22-nishio")!,
    { view } = forcingView(f as unknown as TechniqueFixture),
    plan = f.expectedPattern as any,
    b = new ForcingProof(view),
    value = plan.branches[0].assumption;
  const assumption = b.add("assume@1", [], { kind: "literal", value });
  b.scope = [assumption];
  const end = b.path(
      assumption,
      plan.branches[0].paths.find((p: ForcingLink[]) => p.length),
    ).end,
    result = b.add("contradiction@1", [assumption, end], { kind: "false" });
  b.scope = [];
  const root = b.add("discharge@1", [assumption, result], {
    kind: "literal",
    value: { ...value, positive: false },
  });
  const proposal = b.finish(
    "c23@1",
    {
      kind: "net",
      mode: "static",
      alias: "Static forcing nets",
      branch: { assumption, result, cover: null, children: [] },
      root,
    },
    { kind: "remove", cell: value.cell, symbol: value.symbol },
    root,
  );
  const house = view.assembly.allDifferent.find(
      (h) => h.cells.filter((c) => view.state.values[c]).length >= 2,
    )!,
    givens = house.cells.filter((c) => view.state.values[c]).slice(0, 2),
    cell = house.cells.find((c) => !givens.includes(c))!;
  const fact = [...view.facts.values()].find(
    (f) =>
      f.proposition.kind === "all-different" && f.proposition.cells.join() === house.cells.join(),
  )!.id;
  const p = {
    ...proposal,
    proof: {
      ...proposal.proof,
      imports: [
        ...new Set([
          ...proposal.proof.imports,
          fact,
          ...givens.map((c) => view.state.domainFacts[c]),
        ]),
      ].sort((a, b) => a - b),
      nodes: [
        ...proposal.proof.nodes,
        {
          id: Math.max(...proposal.proof.nodes.map((n) => n.id)) + 1,
          rule: "hall@1",
          premises: [fact, ...givens.map((c) => view.state.domainFacts[c])],
          parameters: {},
          scope: [assumption],
          conclusion: {
            kind: "literal" as const,
            value: { cell, symbol: view.state.values[givens[0]], positive: false },
          },
        },
      ],
    },
  };
  const context = {
    view,
    retained: retainedProof(view),
    policy: "discharged" as const,
    uniqueEvidenceId: null,
    limits: discoveryContext().limits,
  };
  expect([...verifyCertificate(p, context)].at(-1)).toMatchObject({
    kind: "rejected",
    code: "unused-proof-node",
  });
  expect([...checkProposal(p, context)].at(-1)).toMatchObject({
    kind: "rejected",
    code: "unused-proof-node",
  });
});

test("net branch work exhaustion and early cursor close release all sessions", () => {
  const { view } = forcingView(fixtures[0] as unknown as TechniqueFixture);
  for (const maximum of [1, 2500, 10000]) {
    const context = discoveryContext();
    context.limits.workUnits = maximum;
    const events = [...netTechniques[0].discover(view, context)];
    expect(events.at(-1)).toMatchObject({ kind: "interrupted", reason: "work-limit" });
    expect(events.some((e) => e.kind === "proposal")).toBe(false);
    expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  }
  const context = discoveryContext(),
    cursor = netTechniques[0].discover(view, context);
  for (let i = 0; i < 3000; i++) cursor.next();
  cursor.return();
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
});

test("net time and primitive proof limits cannot become a failed-candidate result", () => {
  const { view } = forcingView(fixtures[0] as unknown as TechniqueFixture);
  for (const reason of ["time-limit", "proof-step-limit"] as const) {
    const context = discoveryContext();
    if (reason === "time-limit") context.limits.timeMs = 0;
    else context.limits.stepNodes = 1;
    const events = [
      ...discoverNetCandidate(view, { cell: 26, symbol: 3, positive: true }, "static", context),
    ];
    expect(events.at(-1)).toEqual({ kind: "interrupted", reason });
    expect(events.some((e) => e.kind === "proposal")).toBe(false);
    expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  }
});

test("net candidate construction releases its lease when prefix reservation fails", () => {
  const { view } = forcingView(fixtures[0] as unknown as TechniqueFixture),
    context = {
      ...discoveryContext(),
      workspace: new IndexWorkspace({ entryLimit: 100000, byteLimit: 140000 }),
    };
  expect([...netTechniques[0].discover(view, context)].at(-1)).toEqual({
    kind: "interrupted",
    reason: "workspace-byte-limit",
  });
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
});
