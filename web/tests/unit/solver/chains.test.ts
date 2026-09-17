import { expect, test } from "vitest";
import { getTechniques } from "../../../src/solver/techniques/registry";
import { fixtureCase, fixtureView, fixtureCertificate } from "../../solver/acceptance";
import { assertSound, assertCertificateSound, originalCluePrefix } from "../../solver/acceptance";
import {
  chainFixture,
  chainFixtures,
  independentChainCertificate,
} from "../../solver/chains-acceptance";
import { discoveryContext } from "../../solver/discovery-context";
import { checkProposal, verifyCertificate } from "../../../src/solver/proof/checker";
import {
  retainedProof,
  retainCheckedFacts,
  commitChecked,
} from "../../../src/solver/state/candidates";
import { replay } from "../../../src/solver/proof/replay";
import type { SolverSnapshot } from "../../../src/solver/snapshot";
import type { ChainPattern } from "../../../src/solver/techniques/chains-certificate";
import type { DeductionProposal } from "../../../src/solver/proof/types";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import { buildImplications, type ImplicationIndex } from "../../../src/solver/indexes/implications";
import { PatternGraph } from "../../../src/solver/techniques/pattern-runtime";
import { compileChain } from "../../../src/solver/techniques/chains-certificate";
import { createHash } from "node:crypto";
import { oracle } from "../../solver/oracle";
import { ChainSearch } from "../../../src/solver/techniques/chains-runtime";

test.each(["c16@1", "c17@1"])("%s is an implemented bounded chain descriptor", (id) => {
  const descriptor = getTechniques("classic-expanded@1").find((d) => d.id === id)!;
  expect(descriptor.eligible(fixtureView(fixtureCase("C01-one-hole")))).toEqual({ kind: "yes" });
  expect(descriptor.bounds.maxLength).toBe(24);
  if (id === "c17@1")
    expect(descriptor.bounds).toMatchObject({ maxAlternatives: 3, maxSetSize: 5 });
});

test.each(
  chainFixtures.filter((f) => ["C16", "C17"].includes(f.rowId) && f.expectation === "productive"),
)(
  "$id has independent exact named evidence and force/forbid acceptance",
  (f) => {
    expect(() => assertSound(fixtureView(f), independentChainCertificate(f))).not.toThrow();
  },
  30000,
);

test("four semantic ALS visits fit; five visits remain primitive-sound but out of profile", () => {
  for (const [id, expected] of [
    ["C17-four-als-visits", "checked"],
    ["C17-five-als-visits", "rejected"],
  ]) {
    const f = chainFixture(id),
      view = fixtureView(f),
      proposal = independentChainCertificate(f);
    expect(() => assertCertificateSound(view, proposal)).not.toThrow();
    expect(
      [
        ...checkProposal(proposal, {
          view,
          retained: retainedProof(view),
          limits: discoveryContext().limits,
          policy: "discharged",
          uniqueEvidenceId: null,
        }),
      ].at(-1)?.kind,
    ).toBe(expected);
  }
});

test.each(chainFixtures.filter((f) => f.expectation === "productive"))(
  "$id replays from original clues with no assumed candidate axioms",
  (f) => {
    const view = fixtureView(f),
      proposal = independentChainCertificate(f),
      prefix = originalCluePrefix(f);
    const events = [
      ...replay(
        { problem: view.assembly.problem } as SolverSnapshot,
        [...prefix, proposal],
        view.assembly,
        discoveryContext().limits,
      ),
    ];
    expect(events.filter((e) => e.kind === "rejected")).toEqual([]);
    expect(events.filter((e) => e.kind === "checked")).toHaveLength(prefix.length + 1);
  },
  30000,
);

test.each([
  "C16-x-4-vertices",
  "C16-xy-24-vertices",
  "C16-aic-cell-and-house",
  "C17-continuous-24-links",
  "C17-discontinuous-off",
  "C17-discontinuous-on",
  "C17-group-three-members",
  "C17-grouped-loop",
  "C17-als-link-size-5",
])(
  "%s has independently sound production family discovery",
  (id) => {
    const f = chainFixture(id),
      view = fixtureView(f),
      expected = independentChainCertificate(f).pattern as unknown as ChainPattern;
    const detector = getTechniques("classic-expanded@1").find(
        (d) => d.id === f.rowId.toLowerCase() + "@1",
      )!,
      context = discoveryContext();
    let found = false,
      work = 0;
    for (const event of detector.discover(view, context)) {
      if (event.kind === "work") work += event.units;
      if (event.kind === "interrupted") throw Error(`discovery:${id}:${event.reason}:${work}`);
      if (event.kind !== "proposal") continue;
      const p = event.proposal.pattern as unknown as ChainPattern;
      if (p.alias !== expected.alias || p.polarity !== expected.polarity) continue;
      expect(() => assertSound(view, event.proposal)).not.toThrow();
      found = true;
      break;
    }
    expect(found).toBe(true);
    expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  },
  60000,
);

test("an authentic singleton cache invalidates source-prefix completeness without changing candidate revision", () => {
  const view = fixtureView(fixtureCase("C02-row")),
    full = fixtureCertificate("C02-row"),
    nodes = full.proof.nodes.slice(0, 2);
  const cache = {
    ...full,
    effects: [],
    proof: {
      ...full.proof,
      nodes,
      roots: [nodes[1].id],
      imports: [
        ...new Set(nodes.flatMap((n) => n.premises).filter((id) => view.facts.has(id))),
      ].sort((a, b) => a - b),
    },
  };
  const checked = [
    ...checkProposal(cache, {
      view,
      retained: retainedProof(view),
      limits: discoveryContext().limits,
      policy: "unconditional",
      uniqueEvidenceId: null,
    }),
  ].at(-1);
  expect(checked?.kind).toBe("checked");
  if (checked?.kind !== "checked") throw Error("cache");
  const context = discoveryContext();
  let before: ImplicationIndex | undefined;
  for (const event of buildImplications(view, context.workspace))
    if (event.kind === "ready") before = event.value;
  const extended = retainCheckedFacts(view, checked.step);
  expect(extended.state.key.revision).toBe(view.state.key.revision);
  expect(before!.acceptsView(extended, () => {})).toBe(true);
  expect(before!.completeFor(extended)).toBe(false);
  before!.dispose();
  let after: ImplicationIndex | undefined;
  for (const event of buildImplications(extended, context.workspace))
    if (event.kind === "ready") after = event.value;
  expect(after!.completeFor(extended)).toBe(true);
  expect(after!.covers.some((c) => c.recipe.source === nodes[0].id)).toBe(true);
  after!.dispose();
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
});

test("a smaller closed cover from an accepted step is discovered and compiled with its exact source identity", () => {
  const f = chainFixture("C17-group-three-members"),
    allEffects = structuredClone(f.expectedEffects);
  f.expectedEffects = allEffects.slice(0, 1);
  const initial = fixtureView(f),
    first = independentChainCertificate(f),
    accepted = assertSound(initial, first),
    view = commitChecked(initial, accepted).view;
  const fact = [...view.facts.values()].find(
    (f) =>
      f.proposition.kind === "cover" &&
      f.proposition.symbol === 6 &&
      f.proposition.cells.join() === "60,69",
  )!;
  expect(fact.openAssumptions).toEqual([]);
  expect(fact.rules).toContain("column:6");
  const context = discoveryContext();
  let index: ImplicationIndex | undefined;
  for (const event of buildImplications(view, context.workspace))
    if (event.kind === "ready") index = event.value;
  const lease = context.workspace.reserve(0, 65536),
    graph = new PatternGraph(index!, context, lease);
  [...graph.prepare(view)];
  const search = new ChainSearch(view, graph, "group");
  [...search.prepare()];
  expect(
    search.strong.some((a) => a.source.kind === "proved-cover" && a.source.source === fact.id),
  ).toBe(true);
  const pattern = structuredClone(first.pattern) as unknown as ChainPattern;
  pattern.links[2].source = { kind: "proved-cover", source: fact.id, house: "column:6", symbol: 6 };
  pattern.cuts = [-1, -1];
  graph.compilation = context.workspace.reserve(0, 65536);
  try {
    const compiler = compileChain(view, graph, pattern, allEffects.slice(1));
    let next = compiler.next();
    while (!next.done) next = compiler.next();
    const proposal = next.value;
    expect(proposal.proof.imports).toContain(fact.id);
    expect(() => assertSound(view, proposal)).not.toThrow();
    const forged = structuredClone(proposal),
      changed = forged.pattern as unknown as ChainPattern;
    (changed.links[2].source as { source: number }).source = view.state.domainFacts[60];
    expect(
      [
        ...checkProposal(forged, {
          view,
          retained: retainedProof(view),
          limits: context.limits,
          policy: "discharged",
          uniqueEvidenceId: null,
        }),
      ].at(-1)?.kind,
    ).toBe("rejected");
  } finally {
    graph.compilation.dispose();
    lease.dispose();
    index!.dispose();
  }
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
});

function checked(f: ReturnType<typeof chainFixture>, proposal: DeductionProposal) {
  const view = fixtureView(f);
  return [
    ...checkProposal(proposal, {
      view,
      retained: retainedProof(view),
      limits: discoveryContext().limits,
      policy: "discharged",
      uniqueEvidenceId: null,
    }),
  ].at(-1);
}

test.each(
  chainFixtures.filter((f) => ["C16", "C17"].includes(f.rowId) && f.expectation === "productive"),
)("$id rejects alias, source, assumption and count corruption", (f) => {
  for (const mutation of ["alias", "source", "assumption", "count"]) {
    const proposal = structuredClone(independentChainCertificate(f)),
      p = proposal.pattern as unknown as ChainPattern;
    if (mutation === "alias") p.alias = "Unproved chain";
    if (mutation === "source") p.links.find((l) => l.kind === "strong")!.roots = [];
    if (mutation === "assumption")
      (proposal.proof.nodes[0] as unknown as { scope: number[] }).scope = [
        proposal.proof.nodes[0].id,
      ];
    if (mutation === "count") p.inferenceLinks++;
    expect(checked(f, proposal)?.kind, mutation).toBe("rejected");
  }
});

test.each([
  "omitted-group-member",
  "outside-intersection",
  "repeated-interior",
  "alternation",
  "polarity",
  "omitted-als-occurrence",
  "als-size-six",
  "even-prefix",
  "length25",
])("rejects %s without trusting a valid substitute proof", (mutation) => {
  const id = mutation.includes("als")
    ? "C17-als-link-size-5"
    : mutation === "polarity"
      ? "C17-discontinuous-on"
      : mutation === "even-prefix" || mutation === "length25"
        ? "C16-xy-24-vertices"
        : "C17-group-three-members";
  const f = chainFixture(id),
    proposal = structuredClone(independentChainCertificate(f)),
    p = proposal.pattern as unknown as ChainPattern;
  if (mutation === "omitted-group-member" || mutation === "omitted-als-occurrence")
    p.vertices[0].members.pop();
  if (mutation === "outside-intersection") p.vertices[0].members[0] = p.vertices[2].members[0];
  if (mutation === "repeated-interior") p.vertices[2] = p.vertices[0];
  if (mutation === "alternation") p.links[1].kind = "strong";
  if (mutation === "polarity") p.polarity = "off";
  if (mutation === "als-size-six") p.vertices[0].als!.push(80);
  if (mutation === "even-prefix" || mutation === "length25") {
    p.vertices.push({ members: [{ cell: 0, symbol: 1, positive: true }], als: null });
    p.links.push({ kind: "weak", source: null, roots: [] });
    if (mutation === "length25") {
      p.vertices.push({ members: [{ cell: 0, symbol: 2, positive: true }], als: null });
      p.links.push({ kind: "strong", source: { kind: "cell", cell: 0 }, roots: [] });
    }
    p.inferenceLinks = p.links.length;
  }
  expect(checked(f, proposal)?.kind).toBe("rejected");
});

test("24 vertices mean 23 open links; the productive closed loop retains 24 including closure", () => {
  const open = independentChainCertificate(chainFixture("C16-xy-24-vertices"))
    .pattern as unknown as ChainPattern;
  const closed = independentChainCertificate(chainFixture("C17-continuous-24-links"))
    .pattern as unknown as ChainPattern;
  expect([open.vertices.length, open.links.length, open.closed]).toEqual([24, 23, false]);
  expect([closed.vertices.length, closed.links.length, closed.closed]).toEqual([24, 24, true]);
});

test.each([false, true])(
  "a valid shorter proof cannot substitute or decorate the mandatory 24-vertex path: mixed=%s",
  (mixed) => {
    const f = chainFixture("C16-xy-24-vertices"),
      long = independentChainCertificate(f),
      shortFixture = chainFixture("C17-four-als-visits");
    shortFixture.rowId = "C16";
    const raw = shortFixture.expectedPattern as Record<string, any>;
    delete raw.alsVisits;
    raw.alias = "XY-Chain";
    const short = independentChainCertificate(shortFixture),
      view = fixtureView(f);
    let proposal: DeductionProposal;
    if (!mixed) proposal = { ...short, pattern: long.pattern };
    else {
      const first = Math.min(...short.proof.nodes.map((n) => n.id)),
        shift = Math.max(...long.proof.nodes.map((n) => n.id)) + 1 - first;
      const move = (id: number) => (id >= first ? id + shift : id);
      proposal = {
        ...long,
        proof: {
          ...long.proof,
          nodes: [
            ...long.proof.nodes,
            ...short.proof.nodes.map((n) => ({
              ...n,
              id: move(n.id),
              premises: n.premises.map(move),
              scope: n.scope.map(move),
            })),
          ],
          imports: [...new Set([...long.proof.imports, ...short.proof.imports])].sort(
            (a, b) => a - b,
          ),
          roots: [...long.proof.roots, ...short.proof.roots.map(move)],
        },
      };
    }
    expect(
      [
        ...verifyCertificate(proposal, {
          view,
          retained: retainedProof(view),
          limits: discoveryContext().limits,
          policy: "discharged",
          uniqueEvidenceId: null,
        }),
      ].at(-1)?.kind,
    ).toBe("verified");
    expect(checked(f, proposal)?.kind).toBe("rejected");
  },
);

test.each(["C14", "C15", "C16", "C17"])(
  "%s closes owned leases on return, cancellation, proof cap and work cap",
  (row) => {
    const f = chainFixtures.find((f) => f.rowId === row)!,
      view = fixtureView(f),
      detector = getTechniques("classic-expanded@1").find(
        (d) => d.id === row.toLowerCase() + "@1",
      )!;
    for (const scenario of ["return", "cancel", "proof", "work", "bytes"]) {
      const context = { ...discoveryContext() };
      let cancelled = false;
      if (scenario === "cancel")
        context.workspace = new IndexWorkspace({
          entryLimit: 1000000,
          byteLimit: 256000000,
          cancelled: () => cancelled,
        });
      if (scenario === "bytes")
        context.workspace = new IndexWorkspace({ entryLimit: 1, byteLimit: 1 });
      if (scenario === "proof") context.limits.stepNodes = 1;
      if (scenario === "work") context.limits.workUnits = 1;
      const cursor = detector.discover(view, context);
      if (scenario === "cancel") {
        cursor.next();
        cancelled = true;
      }
      let found = false,
        end: unknown;
      for (const event of cursor) {
        end = event;
        if (event.kind === "proposal") {
          found = true;
          break;
        }
      }
      if (scenario === "return") expect(found).toBe(true);
      else
        expect(end).toEqual({
          kind: "interrupted",
          reason:
            scenario === "cancel"
              ? "cancelled"
              : scenario === "proof"
                ? "proof-step-limit"
                : scenario === "work"
                  ? "work-limit"
                  : "workspace-byte-limit",
        });
      expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
    }
  },
  60000,
);

test.each(["C16", "C17"])(
  "%s releases the published index at the exact work-limit boundary",
  (row) => {
    const view = fixtureView(fixtureCase("C01-one-hole")),
      measured = discoveryContext();
    let workEvents = 0,
      index: ImplicationIndex | undefined;
    try {
      for (const event of buildImplications(view, measured.workspace)) {
        if (event.kind === "work") workEvents++;
        else if (event.kind === "ready") index = event.value;
        else throw Error("measurement interrupted");
      }
      expect(index).toBeDefined();
      expect(workEvents).toBe(2750);
    } finally {
      index?.dispose();
    }
    expect(measured.workspace.usage).toEqual({ entries: 0, bytes: 0 });

    const context = discoveryContext();
    context.limits.workUnits = workEvents;
    const events = [
      ...getTechniques("classic-expanded@1")
        .find((d) => d.id === row.toLowerCase() + "@1")!
        .discover(view, context),
    ];
    expect(events.at(-1)).toEqual({ kind: "interrupted", reason: "work-limit" });
    expect(events.some((event) => event.kind === "proposal" || event.kind === "exhausted")).toBe(
      false,
    );
    expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  },
);

test.each(["C14", "C15", "C16", "C17"])(
  "%s reports exhaustion only after a completed unproductive search",
  (row) => {
    const view = fixtureView(fixtureCase("C01-one-hole")),
      context = discoveryContext();
    const events = [
      ...getTechniques("classic-expanded@1")
        .find((d) => d.id === row.toLowerCase() + "@1")!
        .discover(view, context),
    ];
    expect(events.at(-1)).toEqual({ kind: "exhausted" });
    expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  },
);

test.each(
  chainFixtures.filter((f) => ["C16", "C17"].includes(f.rowId) && f.expectation === "productive"),
)(
  "$id also compiles through production at the exact independently authored geometry",
  (f) => {
    const view = fixtureView(f),
      independent = independentChainCertificate(f),
      context = discoveryContext();
    let index: ImplicationIndex | undefined;
    for (const event of buildImplications(view, context.workspace))
      if (event.kind === "ready") index = event.value;
    const lease = context.workspace.reserve(0, 65536),
      graph = new PatternGraph(index!, context, lease);
    [...graph.prepare(view)];
    graph.compilation = context.workspace.reserve(0, 65536);
    try {
      const compiler = compileChain(view, graph, independent.pattern as unknown as ChainPattern, [
        ...independent.effects,
      ]);
      let next = compiler.next();
      while (!next.done) next = compiler.next();
      expect(() => assertSound(view, next.value!)).not.toThrow();
    } finally {
      graph.compilation.dispose();
      lease.dispose();
      index!.dispose();
    }
    expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  },
  30000,
);

test("durable original seed hashes reproduce every satisfiable prestate and force-or-forbid counterfactual", () => {
  let fixtures = 0,
    counterfactuals = 0,
    nodes = 0;
  for (const f of chainFixtures) {
    const record = (f as unknown as { oracleRecord: { inputHash?: string } }).oracleRecord;
    if (!record.inputHash || f.id === "C17-grouped-loop") continue;
    const input = {
      givens: [...f.givens].map(Number),
      domains: f.preState.domains,
      limit: 1 as const,
      maxNodes: 500000,
    };
    expect(createHash("sha256").update(JSON.stringify(input)).digest("hex"), f.id).toBe(
      record.inputHash,
    );
    const pre = oracle(input);
    expect(pre.interrupted).toBe(false);
    expect(pre.witnesses).toHaveLength(1);
    nodes += pre.nodes;
    fixtures++;
    for (const e of f.expectedEffects) {
      const opposite = oracle({
        ...input,
        ...(e.kind === "place"
          ? { forbid: [e.cell, e.symbol] as const }
          : { force: [e.cell, e.symbol] as const }),
      });
      expect(opposite, f.id).toMatchObject({ interrupted: false, exhausted: true, witnesses: [] });
      nodes += opposite.nodes;
      counterfactuals++;
    }
  }
  expect({ fixtures, counterfactuals, nodes }).toEqual({
    fixtures: 16,
    counterfactuals: 30,
    nodes: 1578,
  });
});

test("a bounded broad search remains incomplete before the exact 24-vertex route", () => {
  const f = chainFixture("C16-xy-24-vertices"),
    view = fixtureView(f),
    context = discoveryContext();
  context.limits.workUnits = 100000;
  const detector = getTechniques("classic-expanded@1").find((d) => d.id === "c16@1")!;
  let terminal: unknown,
    maximum = 0,
    proposals = 0;
  for (const event of detector.discover(view, context)) {
    terminal = event;
    if (event.kind === "proposal") {
      maximum = Math.max(
        maximum,
        (event.proposal.pattern as unknown as ChainPattern).inferenceLinks,
      );
      proposals++;
      expect(() => assertSound(view, event.proposal)).not.toThrow();
    }
  }
  expect(terminal).toEqual({ kind: "interrupted", reason: "work-limit" });
  expect(maximum).toBeLessThan(23);
  expect(proposals).toBeGreaterThan(0);
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
}, 60000);
