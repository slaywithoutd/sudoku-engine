import { expect, test } from "vitest";
import { canonicalProblem } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { mockRuleRegistry } from "../../solver/mock-rules";
import { initialize, rebuildOwnedIndexes, retainedProof, commitChecked } from "../../../src/solver/state/candidates";
import { checkProposal } from "../../../src/solver/proof/checker";
import type { ReadView } from "../../../src/solver/state/types";
import { buildAls } from "../../../src/solver/indexes/als";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";

function fixture(cross = false, symbols = 3, cells = 4) {
  const result = assemble(canonicalProblem({ schema: 1, cells: Array.from({ length: cells }, (_,i) => i),
    symbols: Array.from({ length: symbols }, (_,i) => i+1), givens: Array(cells).fill(0),
    constraints: [ { id: "a", type: "all-different@1", cells: [0,1], parameters: {} },
      { id: "b", type: "all-different@1", cells: [2,3], parameters: {} },
      { id: "cross", type: "all-different@1", cells: cross ? [0,1,2,3] : [0,1,2], parameters: {} } ] }), mockRuleRegistry);
  if (!result.ok) throw Error("fixture"); return initialize(result.value, "primary");
}
const budget = () => new IndexWorkspace({ entryLimit: 100000, byteLimit: 256000000 });
function index(view = fixture()) {
  const events = [...buildAls(view, budget())], end = events.at(-1);
  if (end?.kind !== "ready") throw Error("missing-ready"); return end.value;
}

test("ALS contains exactly n+1 symbols and every digit occurrence in each canonical scope occurrence", () => {
  const view = fixture(), als = index(view);
  expect(als.entries).toHaveLength(5);
  for (const set of als.entries) {
    expect(set.symbols).toEqual([1,2,3]);
    expect(set.cells).toHaveLength(2);
    expect(set.occurrences).toEqual([1,2,3].map(symbol => ({ symbol, cells: set.cells })));
    expect(set.recipe.kind).toBe("als-domains");
    expect(set.premises).toHaveLength(3);
    expect(set.watches).toEqual([{ kind: "all" }]);
  }
  expect(als.entries).toEqual(index(rebuildOwnedIndexes(view)).entries);
});

function overlapView(): ReadView {
  const result = assemble(canonicalProblem({ schema: 1, cells: [0,1,2,3,4], symbols: [1,2,3], givens: [0,0,0,3,1],
    constraints: [ { id: "main", type: "all-different@1", cells: [0,1,2], parameters: {} },
      { id: "exclude-a", type: "all-different@1", cells: [0,3], parameters: {} },
      { id: "exclude-b", type: "all-different@1", cells: [2,3], parameters: {} },
      { id: "exclude-c", type: "all-different@1", cells: [1,4], parameters: {} } ] }), mockRuleRegistry);
  if (!result.ok) throw Error("fixture");
  let view = initialize(result.value, "primary");
  const limits = { timeMs: 20000, workUnits: 1000000, exactNodes: 1000000, stepNodes: 4096,
    runNodes: 20000, proofBytes: 8000000, stepBytes: 2000000, batchBytes: 65536,
    inFlightBatches: 2, workspaceBytes: 16000000 };
  for (const rule of view.assembly.problem.constraints) {
    for (const event of view.assembly.modules.get(rule.id)!.propagate(view,rule)) if (event.kind === "proposal") {
      const checked = [...checkProposal(event.proposal,{ view, retained: retainedProof(view), limits,
        policy: "unconditional", uniqueEvidenceId: null })].at(-1);
      if (checked?.kind !== "checked") throw Error("maintenance");
      view = commitChecked(view,checked.step).view;
    }
  }
  return view;
}

test("RCC permits overlap lacking its digit and rejects a shared tested-digit occurrence", () => {
  const view = overlapView(); expect(view.state.domains.slice(0,3)).toEqual([3,6,3]);
  const als = index(view), a = als.entries.find(e => e.cells.join() === "0,1")!, b = als.entries.find(e => e.cells.join() === "1,2")!;
  expect(als.rcc(a,b,1,() => {})).toBe(true);
  expect(als.rcc(a,b,2,() => {})).toBe(false);
  // Independent complete three-cell assignment oracle, with arithmetic domain checks.
  const assignments: number[][] = [];
  for (let x=1;x<=3;x++) for (let y=1;y<=3;y++) for (let z=1;z<=3;z++)
    if (x!==3 && z!==3 && y!==1 && x!==y && x!==z && y!==z) assignments.push([x,y,z]);
  expect(assignments.length).toBeGreaterThan(0);
  for (const values of assignments) expect(Number(values[0]===1)+Number(values[2]===1)).toBeLessThanOrEqual(1);
});

test("independent subset oracle enumerates all ALS occurrences, including singleton and five-cell boundaries", () => {
  const view = overlapView(), als = index(view);
  const expected: { source: number; cells: number[]; symbols: number[] }[] = [];
  for (const fact of view.facts.values()) if (fact.proposition.kind === "all-different") {
    const scope = fact.proposition.cells;
    for (let membership=1;membership < 2**scope.length;membership++) {
      const cells = scope.filter((_,i) => Math.floor(membership/2**i)%2 === 1);
      if (cells.some(c => view.state.values[c]) || cells.length > 5) continue;
      const symbols = view.assembly.problem.symbols.filter(s => cells.some(c => Math.floor(view.state.domains[c]/2**(s-1))%2 === 1));
      if (symbols.length === cells.length+1) expected.push({ source: fact.id, cells, symbols });
    }
  }
  const key = (e: { source: number; cells: readonly number[]; symbols: readonly number[] }) => JSON.stringify(e);
  expect(als.entries.map(e => key({ source: e.recipe.source, cells: e.cells, symbols: e.symbols })).sort())
    .toEqual(expected.map(key).sort());
  expect(als.entries.some(e => e.cells.length === 1)).toBe(true);
  for (const symbols of [6,7]) {
    const cells = Array.from({ length: symbols }, (_,i) => i);
    const result = assemble(canonicalProblem({ schema: 1, cells, symbols: cells.map(c => c+1), givens: cells.map(() => 0),
      constraints: [{ id: "house", type: "all-different@1", cells, parameters: {} }] }), mockRuleRegistry);
    if (!result.ok) throw Error("fixture");
    const bounded = index(initialize(result.value,"primary"));
    expect(bounded.entries.length).toBe(symbols === 6 ? 6 : 0);
    expect(bounded.entries.every(e => e.cells.length === 5)).toBe(true);
  }
});

test("RCC cancellation and work interruption cannot be misreported as false", () => {
  let cancelled = false;
  const view = overlapView(), workspace = new IndexWorkspace({ entryLimit: 1000, byteLimit: 10000000, cancelled: () => cancelled });
  const end = [...buildAls(view,workspace)].at(-1);
  if (end?.kind !== "ready") throw Error("fixture");
  const als = end.value, a = als.entries.find(e => e.cells.join() === "0,1")!, b = als.entries.find(e => e.cells.join() === "1,2")!;
  expect(() => als.rcc(a,b,1,() => { throw Error("run-work-limit"); })).toThrow("run-work-limit");
  const used = workspace.usage;
  const rest = workspace.reserve(0,10000000-used.bytes);
  expect(() => als.rcc(a,b,1,() => {})).toThrow("workspace-byte-limit");
  rest.dispose(); expect(workspace.usage).toEqual(used);
  cancelled = true;
  expect(() => als.rcc(a,b,1,() => {})).toThrow("cancelled");
  cancelled = false; als.dispose(); expect(workspace.usage).toEqual({ entries: 0, bytes: 0 });
});

test("RCC cursors resume across work quanta and release query scratch on close or cancellation", () => {
  let cancelled = false;
  const workspace = new IndexWorkspace({ entryLimit: 1000, byteLimit: 10000000, cancelled: () => cancelled });
  const end = [...buildAls(overlapView(),workspace)].at(-1);
  if (end?.kind !== "ready") throw Error("fixture");
  const als = end.value, a = als.entries.find(e => e.cells.join() === "0,1")!, b = als.entries.find(e => e.cells.join() === "1,2")!;
  const baseline = workspace.usage, query = als.rccSteps(a,b,1);
  expect(query.next().value).toEqual({ kind: "work", units: 1 });
  expect(workspace.usage.bytes).toBe(baseline.bytes+4096);
  query.return(undefined);
  expect(workspace.usage).toEqual(baseline);
  const resumed = als.rccSteps(a,b,1);
  expect(resumed.next().value?.kind).toBe("work");
  expect([...resumed].at(-1)).toEqual({ kind: "ready", value: true });
  expect(workspace.usage).toEqual(baseline);
  const interrupted = als.rccSteps(a,b,1); interrupted.next(); cancelled = true;
  expect(interrupted.next().value).toEqual({ kind: "interrupted", reason: "cancelled" });
  expect(workspace.usage).toEqual(baseline);
  expect(interrupted.next().done).toBe(true);
  cancelled = false;
  const disposed = als.rccSteps(a,b,1); disposed.next(); als.dispose();
  expect(() => disposed.next()).toThrow("disposed-index");
  expect(workspace.usage).toEqual({ entries: 0, bytes: 0 });
});

test("RCC rejects an unseen cross-pair and overlaps, charging every tested pair", () => {
  const als = index();
  const a = als.entries.find(e => e.cells.join() === "0,1")!, b = als.entries.find(e => e.cells.join() === "2,3")!;
  let work = 0;
  expect(als.rcc(a,b,1,units => { work += units; })).toBe(false);
  expect(work).toBeGreaterThan(1);
  expect(als.rcc(a,a,1,() => {})).toBe(false);
  const complete = index(fixture(true));
  const c = complete.entries.find(e => e.cells.join() === "0,1")!, d = complete.entries.find(e => e.cells.join() === "2,3")!;
  expect(complete.rcc(c,d,1,() => {})).toBe(true);
  expect(complete.rcc(c,d,9,() => {})).toBe(false);
  expect(() => complete.rcc(a,d,1,() => {})).toThrow("foreign-als-entry");
  complete.dispose();
  expect(() => complete.rcc(c,d,1,() => {})).toThrow("disposed-index");
});

test("ALS enforces <=5 cells, authenticates before field access and releases interrupted reservations", () => {
  const view = fixture(false, 6, 6), als = index(view);
  expect(als.entries).toEqual([]); // every scope is too small to have n+1 = 6
  let read = false;
  const fake = new Proxy(view, { get() { read = true; throw Error("untrusted-read"); } });
  expect(() => buildAls(fake, budget()).next()).toThrow("inauthentic-candidate-view");
  expect(read).toBe(false);
  const limited = new IndexWorkspace({ entryLimit: 2, byteLimit: 1000000 });
  expect([...buildAls(fixture(), limited)].at(-1)).toEqual({ kind: "interrupted", reason: "workspace-entry-limit" });
  expect(limited.usage).toEqual({ entries: 0, bytes: 0 });
});
