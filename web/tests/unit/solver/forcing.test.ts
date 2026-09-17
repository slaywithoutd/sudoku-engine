import { expect, test } from "vitest";
import fixtures from "../../solver/fixtures/C22.json";
import {
  fixtureView,
  assertSound,
  originalCluePrefix,
  type TechniqueFixture,
} from "../../solver/acceptance";
import { checkProposal, verifyCertificate } from "../../../src/solver/proof/checker";
import type { Literal } from "../../../src/solver/state/types";
import type { ForcingLink } from "../../../src/solver/techniques/forcing";
import { retainedProof } from "../../../src/solver/state/candidates";
import { discoveryContext } from "../../solver/discovery-context";
import {
  compileForcing,
  forcingTechniques,
  type ForcingPlan,
} from "../../../src/solver/techniques/forcing";
import kraken from "../../solver/fixtures/C24.json";
import {
  compileKraken,
  krakenTechniques,
  type KrakenPlan,
} from "../../../src/solver/techniques/kraken";
import { replay } from "../../../src/solver/proof/replay";
import type { SolverSnapshot } from "../../../src/solver/snapshot";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import { independentForcing } from "../../solver/forcing-acceptance";
import { buildImplications } from "../../../src/solver/indexes/implications";

test.each(fixtures)(
  "compiles and checks independently authored exhaustive $id",
  (fixture) => {
    const view = fixtureView(fixture as unknown as TechniqueFixture);
    const proposal = compileForcing(view, fixture.expectedPattern as unknown as ForcingPlan, {
      ...fixture.expectedEffects[0],
      kind: fixture.expectedEffects[0].kind as "place" | "remove",
    });
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
    assertSound(view, independentForcing(fixture as unknown as TechniqueFixture));
    expect(
      [
        ...replay(
          { problem: view.assembly.problem } as SolverSnapshot,
          [...originalCluePrefix(fixture as unknown as TechniqueFixture), proposal],
          view.assembly,
          discoveryContext().limits,
        ),
      ].at(-1)?.kind,
    ).toBe("checked");
  },
  60000,
);

test("production graph discovery services each forcing family and releases resources", () => {
  const fixture = fixtures[0],
    view = fixtureView(fixture as unknown as TechniqueFixture),
    context = discoveryContext(),
    found = new Set<string>();
  // The acceptance consumer checks/oracles yielded proposals inside this real
  // wall-clock budget; allow for full-suite CPU contention explicitly.
  context.limits.timeMs = 120000;
  const cursor = forcingTechniques[0].discover(view, context);
  try {
    for (const event of cursor)
      if (event.kind === "proposal") {
        const p = event.proposal.pattern as { alias: string };
        if (found.has(p.alias)) continue;
        found.add(p.alias);
        const result = [
          ...checkProposal(event.proposal, {
            view,
            retained: retainedProof(view),
            policy: "discharged",
            uniqueEvidenceId: null,
            limits: context.limits,
          }),
        ].at(-1);
        expect(result, JSON.stringify(result) + JSON.stringify(p)).toMatchObject({
          kind: "checked",
        });
        assertSound(view, event.proposal);
        if (found.size === 4) break;
      }
  } finally {
    cursor.return();
  }
  expect([...found].sort()).toEqual([
    "Cell forcing chains",
    "Digit forcing chains",
    "Nishio",
    "Unit forcing chains",
  ]);
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
}, 180000);

test.each(kraken)(
  "checks independently authored $id fish geometry",
  (fixture) => {
    const view = fixtureView(fixture as unknown as TechniqueFixture),
      plan = structuredClone(fixture.expectedPattern) as unknown as KrakenPlan;
    const proposal = compileKraken(view, plan);
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
    assertSound(view, independentForcing(fixture as unknown as TechniqueFixture));
    expect(
      [
        ...replay(
          { problem: view.assembly.problem } as SolverSnapshot,
          [...originalCluePrefix(fixture as unknown as TechniqueFixture), proposal],
          view.assembly,
          discoveryContext().limits,
        ),
      ].at(-1)?.kind,
    ).toBe("checked");
  },
  60000,
);

test.each(["basic", "franken", "mutant"])(
  "actual Kraken %s production discovery retains chain-assisted fin lineage",
  (form) => {
    const fixture = kraken.find((f) => f.id === `C24-kraken-${form}`)!,
      view = fixtureView(fixture as unknown as TechniqueFixture),
      context = discoveryContext();
    const cursor = krakenTechniques[0].discover(view, context);
    let found = false,
      terminal = "";
    try {
      for (const event of cursor) {
        terminal = event.kind;
        if (event.kind !== "proposal") continue;
        const p = event.proposal.pattern as unknown as KrakenPlan;
        if (
          (form === "basic"
            ? !["finned", "sashimi"].includes(p.fish.form)
            : p.fish.form !== form) ||
          !p.finBranches.some((f) => !view.assembly.peers[p.target.cell].includes(f.fin))
        )
          continue;
        assertSound(view, event.proposal);
        found = true;
        break;
      }
    } finally {
      cursor.return();
    }
    expect(found, terminal).toBe(true);
    expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  },
  60000,
);

test.each([
  "omit-last-support-case",
  "sibling",
  "stale",
  "domain",
  "scope",
  "substitute-root",
  "mixed-root",
])("C22 rejects %s", (mutation) => {
  const fixture = structuredClone(fixtures.find((f) => f.id === "C22-unit2")!),
    view = fixtureView(fixture as unknown as TechniqueFixture),
    proposal = compileForcing(view, fixture.expectedPattern as unknown as ForcingPlan, {
      ...fixture.expectedEffects[0],
      kind: "remove",
    });
  const p = proposal as any,
    c = p.pattern.certificate;
  if (mutation === "omit-last-support-case") p.pattern.branches.pop();
  if (mutation === "sibling")
    p.proof.nodes.find((n: any) => n.id === c.branches[1].paths[0].end).scope = [
      c.branches[0].assumption,
    ];
  if (mutation === "stale") p.state = { ...p.state, revision: p.state.revision + 1 };
  if (mutation === "domain") p.proof.nodes.find((n: any) => n.rule === "support@1").premises.pop();
  if (mutation === "scope")
    p.proof.nodes.find((n: any) => n.rule === "resolution@1" && n.scope.length).scope = [];
  if (mutation === "substitute-root") c.root = c.branches[0].result;
  if (mutation === "mixed-root") p.proof.roots.push(c.branches[0].result);
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
});

test.each([
  "omit-fin-branch",
  "count-source",
  "foreign-fin",
  "overlength",
  "substitute-count",
  "mixed-root",
])("C24 rejects %s", (mutation) => {
  const fixture = structuredClone(kraken[0]),
    view = fixtureView(fixture as unknown as TechniqueFixture),
    proposal = compileKraken(view, fixture.expectedPattern as unknown as KrakenPlan),
    p = proposal as any,
    c = p.pattern.certificate;
  if (mutation === "omit-fin-branch") p.pattern.finBranches.pop();
  if (mutation === "count-source") p.proof.nodes.find((n: any) => n.id === c.count).premises.pop();
  if (mutation === "foreign-fin") c.fins[0].fin++;
  if (mutation === "overlength")
    p.pattern.finBranches[0].path = Array(25).fill(p.pattern.finBranches[0].path[0]);
  if (mutation === "substitute-count") c.count = c.fins[0].path.end;
  if (mutation === "mixed-root") p.proof.roots.push(c.fins[0].path.end);
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
});

test.each([forcingTechniques[0], krakenTechniques[0]])(
  "$id reports interruption without a failed-candidate deduction",
  (descriptor) => {
    const view = fixtureView(fixtures[0] as unknown as TechniqueFixture);
    for (const kind of ["work", "bytes", "cancel"]) {
      const context = { ...discoveryContext() };
      if (kind === "work") context.limits.workUnits = 1;
      if (kind === "bytes")
        context.workspace = new IndexWorkspace({ entryLimit: 100000, byteLimit: 100 });
      if (kind === "cancel")
        context.workspace = new IndexWorkspace({
          entryLimit: 100000,
          byteLimit: 10000000,
          cancelled: () => true,
        });
      const events = [...descriptor.discover(view, context)];
      expect(events.at(-1)?.kind).toBe("interrupted");
      expect(events.some((e) => e.kind === "proposal")).toBe(false);
      expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
    }
  },
);

test.each([forcingTechniques[0], krakenTechniques[0]])(
  "$id preserves time and proof limits as incomplete outcomes",
  (descriptor) => {
    const view = fixtureView(fixtures[0] as unknown as TechniqueFixture);
    for (const reason of ["time-limit", "proof-step-limit"] as const) {
      const context = discoveryContext();
      if (reason === "time-limit") context.limits.timeMs = 0;
      else context.limits.stepNodes = 1;
      const events = [...descriptor.discover(view, context)];
      expect(events.at(-1)).toEqual({ kind: "interrupted", reason });
      expect(events.some((e) => e.kind === "proposal")).toBe(false);
      expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
    }
  },
);

test.each([forcingTechniques[0], krakenTechniques[0]])(
  "$id captures transferred index before an exact-ready-boundary work interruption",
  (descriptor) => {
    const view = fixtureView(fixtures[0] as unknown as TechniqueFixture),
      measure = discoveryContext();
    let work = 0;
    for (const e of buildImplications(view, measure.workspace))
      if (e.kind === "ready") e.value.dispose();
      else if (e.kind === "work") work += e.units;
    const context = discoveryContext();
    context.limits.workUnits = work;
    const events = [...descriptor.discover(view, context)];
    expect(events.at(-1)).toEqual({ kind: "interrupted", reason: "work-limit" });
    expect(events.some((e) => e.kind === "proposal")).toBe(false);
    expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  },
);

test("the independent 24-link positive branch has distinct signed vertices and admits placement closure", () => {
  const f = fixtures.find((f) => f.id === "C22-digit-positive-24")!,
    p = f.expectedPattern as unknown as ForcingPlan,
    path = p.branches[0].paths[0];
  expect(path.length).toBe(24);
  expect(
    new Set(
      [path[0].from, ...path.map((l) => l.to)].map((v) => `${v.cell}:${v.symbol}:${v.positive}`),
    ).size,
  ).toBe(25);
  const view = fixtureView(f as unknown as TechniqueFixture),
    proposal = compileForcing(view, p, { kind: "place", cell: 49, symbol: 2 });
  expect(proposal.effects.filter((e) => e.kind === "place")).toEqual([
    { kind: "place", cell: 49, symbol: 2 },
  ]);
  expect(proposal.effects.length).toBeGreaterThan(1);
  const outside = structuredClone(proposal) as any;
  outside.pattern.branches[0].paths[0].push(outside.pattern.branches[0].paths[0][0]);
  expect(
    [
      ...checkProposal(outside, {
        view,
        retained: retainedProof(view),
        policy: "discharged",
        uniqueEvidenceId: null,
        limits: discoveryContext().limits,
      }),
    ].at(-1),
  ).toMatchObject({ kind: "rejected", code: "forcing-branch-bound" });
});

test("Kraken admits the attainable 23-link boundary with distinct signed vertices", () => {
  const f = kraken.find((f) => f.id === "C24-kraken-simple23")!,
    p = f.expectedPattern as unknown as KrakenPlan,
    path = p.finBranches[0].path;
  expect(path).toHaveLength(23);
  expect(
    new Set(
      [path[0].from, ...path.map((l) => l.to)].map((v) => `${v.cell}:${v.symbol}:${v.positive}`),
    ).size,
  ).toBe(24);
  expect(path[0].from.positive).toBe(true);
  expect(path.at(-1)!.to.positive).toBe(false);
  // Every scalar edge flips sign, so an even24-link path cannot finish fin=false.
  expect(path.every((l) => l.from.positive !== l.to.positive)).toBe(true);
});

test("a valid shorter proof cannot substitute for or decorate the named 24-link certificate", () => {
  const f = fixtures.find((f) => f.id === "C22-digit-positive-24")!,
    view = fixtureView(f as unknown as TechniqueFixture),
    long = compileForcing(view, f.expectedPattern as unknown as ForcingPlan, {
      kind: "place",
      cell: 49,
      symbol: 2,
    });
  // Independently reconstruct scalar clauses using coordinate/set arithmetic.
  const arcs = new Map<string, ForcingLink[]>(),
    key = (v: Literal) => `${v.cell}:${v.symbol}:${v.positive}`,
    flip = (v: Literal) => ({ ...v, positive: !v.positive });
  const link = (from: Literal, to: Literal, reason: ForcingLink["reason"]) => {
    const list = arcs.get(key(from)) ?? [];
    list.push({ from, to, reason });
    arcs.set(key(from), list);
  };
  const candidates = (cell: number) =>
    Array.from({ length: 9 }, (_, i) => i + 1)
      .filter((s) => view.state.domains[cell] & (1 << (s - 1)))
      .map((symbol) => ({ cell, symbol, positive: true }));
  for (let cell = 0; cell < 81; cell++) {
    const values = candidates(cell);
    for (const a of values)
      for (const b of values)
        if (a.symbol !== b.symbol) link(a, flip(b), { kind: "cell-conflict", cell });
    if (values.length === 2) {
      link(flip(values[0]), values[1], { kind: "cell-cover", cell });
      link(flip(values[1]), values[0], { kind: "cell-cover", cell });
    }
  }
  for (const house of view.assembly.allDifferent)
    for (let symbol = 1; symbol <= 9; symbol++) {
      const values = house.cells
        .filter((c) => view.state.domains[c] & (1 << (symbol - 1)))
        .map((cell) => ({ cell, symbol, positive: true }));
      for (const a of values)
        for (const b of values)
          if (a.cell !== b.cell)
            link(a, flip(b), { kind: "scope-conflict", house: house.id, symbol });
      if (values.length === 2) {
        link(flip(values[0]), values[1], { kind: "house-cover", house: house.id, symbol });
        link(flip(values[1]), values[0], { kind: "house-cover", house: house.id, symbol });
      }
    }
  const plan = structuredClone(f.expectedPattern) as unknown as ForcingPlan,
    target = { cell: 49, symbol: 2, positive: true };
  const branches = plan.branches.map((branch) => {
    const paths = new Map<string, ForcingLink[]>([[key(branch.assumption), []]]),
      queue = [branch.assumption];
    for (let i = 0; i < queue.length && !paths.has(key(target)); i++)
      for (const edge of arcs.get(key(queue[i])) ?? [])
        if (!paths.has(key(edge.to))) {
          paths.set(key(edge.to), [...paths.get(key(queue[i]))!, edge]);
          queue.push(edge.to);
        }
    return { ...branch, result: target, paths: [paths.get(key(target))!] };
  });
  expect(branches[0].paths[0].length).toBeLessThan(24);
  const short = compileForcing(view, { ...plan, branches }, { kind: "place", cell: 49, symbol: 2 });
  assertSound(view, short);
  const context = {
    view,
    retained: retainedProof(view),
    policy: "discharged" as const,
    uniqueEvidenceId: null,
    limits: discoveryContext().limits,
  };
  for (const mixed of [false, true]) {
    let p: any;
    if (!mixed) p = { ...short, pattern: long.pattern };
    else {
      const offset = Math.max(...long.proof.nodes.map((n) => n.id)) + 1,
        ids = new Map(short.proof.nodes.map((n, i) => [n.id, offset + i])),
        id = (n: number) => ids.get(n) ?? n;
      const nodes = short.proof.nodes.map((n) => ({
        ...n,
        id: id(n.id),
        premises: n.premises.map(id),
        scope: n.scope.map(id),
      }));
      p = {
        ...long,
        proof: {
          ...long.proof,
          nodes: [...long.proof.nodes, ...nodes],
          roots: [...long.proof.roots, ...short.proof.roots.map(id)],
          imports: [...new Set([...long.proof.imports, ...short.proof.imports])].sort(
            (a, b) => a - b,
          ),
        },
      };
    }
    expect([...verifyCertificate(p, context)].at(-1)).toMatchObject({ kind: "verified" });
    expect([...checkProposal(p, context)].at(-1)?.kind).toBe("rejected");
  }
});

test("Nishio rejects a mixed-digit chain relabeled as a single-digit contradiction", () => {
  const f = structuredClone(fixtures[0]),
    view = fixtureView(f as unknown as TechniqueFixture),
    p = f.expectedPattern as unknown as ForcingPlan;
  const branch = p.branches.find((b) => b.result === "false")!;
  const proposal = compileForcing(
    view,
    {
      kind: "nishio",
      alias: "Nishio",
      cover: { candidate: branch.assumption },
      alternatives: [branch.assumption],
      branches: [branch],
    },
    { kind: "remove", cell: branch.assumption.cell, symbol: branch.assumption.symbol },
  );
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
  ).toMatchObject({ kind: "rejected", code: "nishio-mixed-digit" });
});
