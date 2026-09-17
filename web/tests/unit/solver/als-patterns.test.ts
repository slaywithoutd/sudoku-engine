import { expect, test } from "vitest";
import { getTechniques } from "../../../src/solver/techniques/registry";
import { fixtureCase, fixtureView } from "../../solver/acceptance";
import { assertSound } from "../../solver/acceptance";
import { alsFixture, alsFixtures, productiveAlsFixtures, independentAlsCertificate } from "./als-acceptance";
import { discoveryContext } from "../../solver/discovery-context";
import { AlsCertificate, type AlsPattern, type BlossomPattern } from "../../../src/solver/techniques/als-certificate";
import { buildImplications, type ImplicationIndex } from "../../../src/solver/indexes/implications";
import { PatternGraph } from "../../../src/solver/techniques/pattern-runtime";
import { checkProposal, verifyCertificate } from "../../../src/solver/proof/checker";
import { retainedProof } from "../../../src/solver/state/candidates";
import type { DeductionProposal } from "../../../src/solver/proof/types";
import type { TechniqueFixture } from "../../solver/acceptance";
import { originalCluePrefix } from "../../solver/acceptance";
import { replay } from "../../../src/solver/proof/replay";
import type { SolverSnapshot } from "../../../src/solver/snapshot";
import { IndependentChainProof } from "../../solver/chains-acceptance";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import { buildAls, type AlsIndex } from "../../../src/solver/indexes/als";
import { commitChecked, retainCheckedFacts } from "../../../src/solver/state/candidates";
import { fixtureCertificate } from "../../solver/acceptance";
import { AlsSearch } from "../../../src/solver/techniques/als-runtime";
import { createHash } from "node:crypto";
import { oracle } from "../../solver/oracle";

function checked(f: TechniqueFixture, proposal: DeductionProposal) {
  const view = fixtureView(f);
  return [...checkProposal(proposal, { view, retained: retainedProof(view), limits: discoveryContext().limits,
    policy: "discharged", uniqueEvidenceId: null })].at(-1);
}

test.each(["c18@1", "c19@1"])("%s provides the approved ALS strategy", id => {
  const descriptor = getTechniques("classic-expanded@1").find(d => d.id === id)!;
  expect(descriptor.eligible(fixtureView(fixtureCase("C01-one-hole")))) .toEqual({ kind: "yes" });
  expect(descriptor.bounds.maxSetSize).toBe(5);
});

test.each(["C18-overlap", "C19-blossom-4"])("%s rejects standalone and mixed primitive-valid substitute roots", id => {
  const f = alsFixture(id), view = fixtureView(f), genuine = independentAlsCertificate(f), e = f.expectedEffects[0];
  const seed = f.expectedPattern as any, cells = [...seed.sets.flatMap((s: any) => s.cells), e.cell, ...(seed.stem === undefined ? [] : [seed.stem])];
  const house = view.assembly.allDifferent.find(h => cells.every((c: number) => h.cells.includes(c)))!;
  const b = new IndependentChainProof(view);
  const root = b.strong({ kind: "als", cells: [...house.cells], house: house.id, symbols: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    [{ cell: e.cell, symbol: e.symbol, positive: false }]);
  const substitute = b.proposal(f.rowId, genuine.pattern, [e], [root]);
  const context = { view, retained: retainedProof(view), limits: discoveryContext().limits, policy: "discharged" as const, uniqueEvidenceId: null };
  expect([...verifyCertificate(substitute, context)].at(-1)?.kind).toBe("verified");
  expect(checked(f, substitute)?.kind).toBe("rejected");
  const first = Math.min(...substitute.proof.nodes.map(n => n.id)), shift = Math.max(...genuine.proof.nodes.map(n => n.id)) + 1 - first;
  const move = (n: number) => n >= first ? n + shift : n;
  const mixed: DeductionProposal = { ...genuine, proof: { ...genuine.proof,
    nodes: [...genuine.proof.nodes, ...substitute.proof.nodes.map(n => ({ ...n, id: move(n.id), premises: n.premises.map(move),
      conclusion: n.conclusion.kind === "table" ? { ...n.conclusion, definition: move(n.conclusion.definition) } : n.conclusion }))],
    imports: [...new Set([...genuine.proof.imports, ...substitute.proof.imports])].sort((a, b) => a - b), roots: [...genuine.proof.roots, ...substitute.proof.roots.map(move)] } };
  expect([...verifyCertificate(mixed, context)].at(-1)?.kind).toBe("verified");
  expect(checked(f, mixed)?.kind).toBe("rejected");
});

test("the six-set certificate is exact and seven/repeated sets cannot reuse its proof", () => {
  const f = alsFixture("C19-chain-6"), original = independentAlsCertificate(f), p = original.pattern as unknown as AlsPattern;
  expect(p.sets).toHaveLength(6); expect(p.rccs).toHaveLength(5); expect(p.routes[0].projections).toHaveLength(6);
  for (const count of [6, 7]) {
    const proposal = structuredClone(original), p = proposal.pattern as unknown as AlsPattern;
    if (count === 6) p.sets[5] = structuredClone(p.sets[0]); else p.sets.push(structuredClone(p.sets[0]));
    expect(checked(f, proposal)?.kind).toBe("rejected");
  }
});

test("a valid bivalue clause cannot replace a singleton ALS's complete table", () => {
  const f = alsFixture("C18-xy"), proposal = independentAlsCertificate(f), p = proposal.pattern as unknown as AlsPattern;
  const source = p.routes[0].projections[0], cell = p.sets[source.set].cells[0], view = fixtureView(f);
  const nodes = proposal.proof.nodes.map(n => n.id === source.root ? { ...n, rule: "cover-clause@1", premises: [view.state.domainFacts[cell]], parameters: {} } : n);
  const needed = new Set<number>(), queue = [...proposal.proof.roots], byId = new Map(nodes.map(n => [n.id, n]));
  while (queue.length) { const id = queue.pop()!; if (needed.has(id)) continue; needed.add(id); queue.push(...(byId.get(id)?.premises ?? [])); }
  const substitute = { ...proposal, proof: { ...proposal.proof, nodes: nodes.filter(n => needed.has(n.id)),
    imports: [...needed].filter(id => view.facts.has(id)).sort((a, b) => a - b) } };
  expect([...verifyCertificate(substitute, { view, retained: retainedProof(view), limits: discoveryContext().limits, policy: "discharged", uniqueEvidenceId: null })].at(-1)?.kind).toBe("verified");
  expect(checked(f, substitute)?.kind).toBe("rejected");
});

test.each(alsFixtures.filter(f => f.expectation === "out-of-profile"))("$id is primitive-sound but rejected at the named bound", f => {
  const view = fixtureView(f), proposal = independentAlsCertificate(f);
  expect([...verifyCertificate(proposal, { view, retained: retainedProof(view), limits: discoveryContext().limits, policy: "discharged", uniqueEvidenceId: null })].at(-1)?.kind).toBe("verified");
  expect(checked(f, proposal)?.kind).toBe("rejected");
});

test("durable input hashes reproduce every satisfiable prestate and exhaustive opposite", () => {
  let fixtures = 0, effects = 0;
  for (const f of alsFixtures) {
    const input = { givens: [...f.givens].map(Number), domains: f.preState.domains, limit: 1 as const, maxNodes: 500000 };
    expect(createHash("sha256").update(JSON.stringify(input)).digest("hex"), f.id).toBe((f as any).oracleRecord.inputHash);
    expect(oracle(input), f.id).toMatchObject({ interrupted: false, witnesses: [expect.any(Array)] }); fixtures++;
    for (const effect of f.expectedEffects) {
      expect(oracle({ ...input, force: [effect.cell, effect.symbol] }), f.id).toMatchObject({ interrupted: false, exhausted: true, witnesses: [] }); effects++;
    }
  }
  expect({ fixtures, effects }).toEqual({ fixtures: 16, effects: 18 });
});

test("all advertised ALS and stem bounds have explicit authored geometry", () => {
  // Dedicated per-fixture tests compile/check both proofs; this assertion audits
  // only the independent fixture inventory and should not repeat that work.
  const patterns = productiveAlsFixtures.map(f => f.expectedPattern as unknown as { sets: AlsPattern["sets"]; stemSymbols?: number[]; petals?: number[] });
  expect([...new Set(patterns.flatMap(p => p.sets.map(s => s.cells.length)))].sort()).toEqual([1, 2, 3, 4, 5]);
  expect([...new Set(patterns.flatMap(p => p.stemSymbols ? [p.stemSymbols.length] : []))].sort()).toEqual([2, 3, 4]);
  const shared = patterns.find(p => p.stemSymbols && p.sets.length === 1)!;
  expect(shared.petals).toEqual([0, 0]); expect(shared.sets[0].cells).toHaveLength(5);
});

test("a broad ALS-chain search checks every emitted effect and reports its work cap honestly", () => {
  const f = alsFixture("C19-chain-6"), view = fixtureView(f), context = discoveryContext(); context.limits.workUnits = 100000;
  let terminal: unknown, proposals = 0, maximum = 0;
  for (const event of getTechniques("classic-expanded@1").find(d => d.id === "c19@1")!.discover(view, context)) {
    terminal = event;
    if (event.kind !== "proposal") continue;
    const p = event.proposal.pattern as unknown as AlsPattern | BlossomPattern;
    expect(() => assertSound(view, event.proposal), JSON.stringify(p)).not.toThrow(); proposals++;
    if (p.kind === "als") maximum = Math.max(maximum, p.sets.length);
  }
  expect(terminal).toEqual({ kind: "interrupted", reason: "work-limit" });
  expect(proposals).toBeGreaterThan(0); expect(maximum).toBeLessThanOrEqual(6);
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
}, 60000);

test.each(["c18@1", "c19@1"])("%s releases all resources on return, cancellation, proof/work/workspace limits and exhaustion", id => {
  const f = alsFixture("C19-blossom-4"), view = fixtureView(f), descriptor = getTechniques("classic-expanded@1").find(d => d.id === id)!;
  for (const scenario of ["return", "cancel", "proof", "work", "workspace"]) {
    const context = { ...discoveryContext() }; let cancelled = false;
    if (scenario === "cancel") context.workspace = new IndexWorkspace({ entryLimit: 1000000, byteLimit: 256000000, cancelled: () => cancelled });
    if (scenario === "workspace") context.workspace = new IndexWorkspace({ entryLimit: 1, byteLimit: 1 });
    if (scenario === "proof") context.limits.stepNodes = 1;
    if (scenario === "work") context.limits.workUnits = 1;
    const cursor = descriptor.discover(view, context);
    if (scenario === "cancel") { cursor.next(); cancelled = true; }
    let terminal: unknown;
    for (const event of cursor) { terminal = event; if (event.kind === "proposal") break; }
    expect(terminal).toMatchObject(scenario === "return" ? { kind: "proposal" } : { kind: "interrupted", reason:
      scenario === "cancel" ? "cancelled" : scenario === "proof" ? "proof-step-limit" : scenario === "work" ? "work-limit" : "workspace-byte-limit" });
    expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  }
  const context = discoveryContext();
  expect([...descriptor.discover(fixtureView(fixtureCase("C01-one-hole")), context)].at(-1)).toEqual({ kind: "exhausted" });
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
}, 30000);

test.each(["c18@1", "c19@1"])("%s captures both index transfers before exact-boundary interruption", id => {
  const view = fixtureView(fixtureCase("C01-one-hole")), measured = discoveryContext();
  let implicationWork = 0, alsWork = 0;
  for (const event of buildImplications(view, measured.workspace)) { if (event.kind === "work") implicationWork++; else if (event.kind === "ready") event.value.dispose(); }
  for (const event of buildAls(view, measured.workspace)) { if (event.kind === "work") alsWork++; else if (event.kind === "ready") event.value.dispose(); }
  expect(implicationWork).toBe(2750);
  for (const cap of [implicationWork, implicationWork + 1 + alsWork]) {
    const context = discoveryContext(); context.limits.workUnits = cap;
    const events = [...getTechniques("classic-expanded@1").find(d => d.id === id)!.discover(view, context)];
    expect(events.at(-1)).toEqual({ kind: "interrupted", reason: "work-limit" });
    expect(events.some(e => e.kind === "exhausted" || e.kind === "proposal")).toBe(false);
    expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  }
});

// Cold original-clue proof setup is part of this correctness fixture, not a latency benchmark.
test("source-prefix growth and candidate revision invalidate stale ALS search and certificates", () => {
  const view = fixtureView(fixtureCase("C02-row")), full = fixtureCertificate("C02-row"), nodes = full.proof.nodes.slice(0, 2);
  const cache = { ...full, effects: [], proof: { ...full.proof, nodes, roots: [nodes[1].id],
    imports: [...new Set(nodes.flatMap(n => n.premises).filter(id => view.facts.has(id)))].sort((a, b) => a - b) } };
  const accepted = [...checkProposal(cache, { view, retained: retainedProof(view), limits: discoveryContext().limits, policy: "unconditional", uniqueEvidenceId: null })].at(-1);
  if (accepted?.kind !== "checked") throw Error("cache-failed");
  const context = discoveryContext(); let als: AlsIndex | undefined, implications: ImplicationIndex | undefined;
  for (const event of buildAls(view, context.workspace)) if (event.kind === "ready") als = event.value;
  for (const event of buildImplications(view, context.workspace)) if (event.kind === "ready") implications = event.value;
  const extended = retainCheckedFacts(view, accepted.step), lease = context.workspace.reserve(0, 65536), graph = new PatternGraph(implications!, context, lease);
  try {
    expect(als!.acceptsView(extended, () => {})).toBe(true); expect(als!.completeFor(extended)).toBe(false);
    expect(() => [...new AlsSearch(extended, graph, als!).prepare()]).toThrow("incomplete-als-source-prefix");
  } finally { lease.dispose(); als!.dispose(); implications!.dispose(); }
  const f = alsFixture("C18-overlap"), proposal = independentAlsCertificate(f), checkedStep = checked(f, proposal);
  if (checkedStep?.kind !== "checked") throw Error("fixture-failed");
  const changed = commitChecked(fixtureView(f), checkedStep.step).view;
  expect([...checkProposal(proposal, { view: changed, retained: retainedProof(changed), limits: context.limits, policy: "discharged", uniqueEvidenceId: null })].at(-1)?.kind).toBe("rejected");
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
}, 30000);

test.each(productiveAlsFixtures)("$id has independent named proof and exhaustive counterfactual evidence", f => {
  expect(() => assertSound(fixtureView(f), independentAlsCertificate(f))).not.toThrow();
}, 30000);

test.each(productiveAlsFixtures)("$id compiles exact authored geometry through production", f => {
  const view = fixtureView(f), context = discoveryContext(); let index: ImplicationIndex | undefined;
  for (const e of buildImplications(view, context.workspace)) if (e.kind === "ready") index = e.value;
  const lease = context.workspace.reserve(0, 65536), graph = new PatternGraph(index!, context, lease); [...graph.prepare(view)];
  graph.compilation = context.workspace.reserve(0, 65536);
  try {
    const independent = independentAlsCertificate(f), compiler = new AlsCertificate(view, graph).compile(independent.pattern as unknown as AlsPattern | BlossomPattern, [...independent.effects]);
    let next = compiler.next(); while (!next.done) next = compiler.next();
    expect(() => assertSound(view, next.value)).not.toThrow();
  } finally { graph.compilation.dispose(); lease.dispose(); index!.dispose(); }
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
}, 30000);

test.each(productiveAlsFixtures)("$id replays original clues and declared rules", f => {
  const view = fixtureView(f), prefix = originalCluePrefix(f), proposal = independentAlsCertificate(f);
  const events = [...replay({ problem: view.assembly.problem } as SolverSnapshot, [...prefix, proposal], view.assembly, discoveryContext().limits)];
  expect(events.filter(e => e.kind === "rejected")).toEqual([]);
  expect(events.filter(e => e.kind === "checked")).toHaveLength(prefix.length + 1);
}, 30000);

test.each(["C18-overlap", "C18-xz-double-rcc", "C18-double-rcc-locked-effects", "C18-xz-single-rcc", "C18-xy", "C19-chain-2", "C19-blossom-2", "C19-blossom-3", "C19-blossom-4"])("%s has sound measured family discovery", id => {
  const f = alsFixture(id), view = fixtureView(f), context = discoveryContext();
  const descriptor = getTechniques("classic-expanded@1").find(d => d.id === f.rowId.toLowerCase() + "@1")!;
  let found = false, work = 0, proposals = 0;
  for (const event of descriptor.discover(view, context)) {
    if (event.kind === "work") work += event.units;
    if (event.kind === "interrupted") throw Error(`${id}:${event.reason}:${work}`);
    if (event.kind !== "proposal") continue;
    if (++proposals > 50) throw Error(`too-many:${id}:${work}:${proposals}`);
    expect(() => assertSound(view, event.proposal), JSON.stringify(event.proposal.pattern)).not.toThrow();
    const p = event.proposal.pattern as unknown as AlsPattern | BlossomPattern;
    if (p.alias !== f.alias) continue;
    if (p.kind === "blossom" && p.symbols.length !== Number(id.at(-1))) continue;
    if (p.kind === "als" && (id.includes("overlap") && !p.overlaps.some(o => o.cells.length) || id.includes("double") && p.rccs.length !== 2 ||
      id.includes("locked-effects") && !p.routes.some(r => r.form === "rcc"))) continue;
    found = true; break;
  }
  expect(found).toBe(true); expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
}, 60000);

test.each(["remove-petal", "wrong-stem", "wrong-branch-root", "escape", "omit-occurrence", "omit-rcc", "overlap-rcc", "omit-overlap", "repeat-set", "wrong-double-class"])("rejects %s in independently compiled proof", mutation => {
  const f = alsFixture(["remove-petal", "wrong-stem", "wrong-branch-root", "escape"].includes(mutation) ? "C19-blossom-4" : mutation === "wrong-double-class" ? "C18-xz-double-rcc" : "C18-overlap");
  const proposal = independentAlsCertificate(f), p = proposal.pattern as unknown as AlsPattern | BlossomPattern;
  if (p.kind === "blossom") {
    if (mutation === "remove-petal") p.branches[0].pop();
    if (mutation === "wrong-stem") p.stem = 0;
    if (mutation === "wrong-branch-root") p.branches[0][1].root = p.branches[0][0].root;
    if (mutation === "escape") (proposal.proof.roots as number[]).push(p.branches[0][0].root);
  } else {
    if (mutation === "omit-occurrence") p.sets[0].occurrences[p.sets[0].symbols[0]].pop();
    if (mutation === "omit-rcc") p.rccs[0].roots.pop();
    if (mutation === "overlap-rcc") p.rccs[0].symbol = 8;
    if (mutation === "omit-overlap") p.overlaps[0].cells = [];
    if (mutation === "repeat-set") p.sets[1] = structuredClone(p.sets[0]);
    if (mutation === "wrong-double-class") p.routes[0].form = "path";
  }
  expect(checked(f, proposal)?.kind).toBe("rejected");
});
