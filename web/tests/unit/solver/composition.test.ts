import { discoveryContext } from "../../solver/discovery-context";
import { expect, test } from "vitest";
import { canonicalProblem, normalizeClassic } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { AllDifferentRule } from "../../../src/solver/rules/all-different";
import { initialize, retainedProof, retainCheckedFacts, commitChecked } from "../../../src/solver/state/candidates";
import { verifyCertificate, checkProposal, checkedWorkUnits } from "../../../src/solver/proof/checker";
import { CertificateSession } from "../../../src/solver/proof/certificates";
import { getTechniques } from "../../../src/solver/techniques/registry";
import type { CheckContext, DeductionProposal, ProofNode, Proposition } from "../../../src/solver/proof/types";
import type { ReadView } from "../../../src/solver/state/types";
import { mockRuleRegistry } from "../../solver/mock-rules";
import { assertCertificateSound as assertSound } from "../../solver/acceptance";
import { replay, initializationReservation } from "../../../src/solver/proof/replay";
import { SOLUTION } from "../../fixtures";
import { makeSnapshot } from "../../../src/solver/snapshot";

const limits = { timeMs: 20000, workUnits: 1000000, exactNodes: 1000000, stepNodes: 4096,
  runNodes: 20000, proofBytes: 8000000, stepBytes: 2000000, batchBytes: 65536,
  inFlightBatches: 2, workspaceBytes: 16000000 };
function fixture(cells = 4, symbols = 9, givens = Array(cells).fill(0)): ReadView {
  const result = assemble(canonicalProblem({ schema: 1, cells: Array.from({ length: cells }, (_,i) => i),
    symbols: Array.from({ length: symbols }, (_,i) => i+1), givens, constraints: [] }), [new AllDifferentRule()]);
  if (!result.ok) throw Error("fixture"); return initialize(result.value, "primary");
}
function builder(view: ReadView, retained = retainedProof(view)) {
  const nodes: ProofNode[] = [], imports = new Set<number>();
  const context: CheckContext = { view, retained, limits, policy: "discharged", uniqueEvidenceId: null };
  const add = (rule: string, premises: number[], conclusion: Proposition, parameters = {}) => {
    premises.filter(id => context.retained.has(id)).forEach(id => imports.add(id));
    const id = context.retained.size + nodes.length;
    nodes.push({ id, rule, premises, conclusion, parameters, scope: [] }); return id;
  };
  const table = (rule: string, premises: number[], cells: number[], count: number, parameters = {}) =>
    add(rule, premises, { kind: "table", cells, count, definition: context.retained.size + nodes.length } as Proposition, parameters);
  const proposal = (roots: number[]): DeductionProposal => ({ technique: "rule-propagation@1", state: view.state.key,
    effects: [], pattern: { kind: "roots" }, proof: { state: view.state.key, nodes, imports: [...imports], roots } });
  const check = (roots: number[]) => [...verifyCertificate(proposal(roots), context)].at(-1)!;
  return { add, table, proposal, check, nodes, context };
}

test("count-only omission preserves weighted inequalities, provenance and complete support contracts",()=>{
  const result=assemble(canonicalProblem({schema:1,cells:[0,1,2],symbols:[1,2],givens:[2,0,0],constraints:[
    {id:"base",type:"all-different@1",cells:[0,1],parameters:{}},
    {id:"capacity",type:"all-different@1",cells:[1,2],parameters:{}}]}),[new AllDifferentRule()]);
  if(!result.ok)throw Error("count-fixture");const view=initialize(result.value,"primary");
  const cover=[...view.facts.values()].find(f=>f.proposition.kind==="cover"&&f.proposition.symbol===1&&f.proposition.cells.join()==="0,1")!.id;
  const capacity=[...view.facts.values()].find(f=>f.proposition.kind==="all-different"&&f.proposition.cells.join()==="1,2")!.id;
  // The only complete assignment is (2,1,2). These weights independently
  // predict when every negative coefficient is proved zero and target w>B.
  for(let lower=1;lower<=3;lower++)for(let upper=1;upper<=3;upper++) {
    const b=builder(view),root=b.add("cover-count@1",[cover,capacity,view.state.domainFacts[0]],
      {kind:"literal",value:{cell:2,symbol:1,positive:false}},
      {symbol:1,covers:[{premise:cover,coefficient:lower}],capacities:[{premise:capacity,coefficient:upper}]});
    const terminal=b.check([root]);expect(terminal.kind,`weights ${lower}/${upper}`).toBe(upper>=lower?"verified":"rejected");
    if(terminal.kind==="verified")expect(terminal.certificate.consequences[0]).toMatchObject({rules:["base","capacity"],conditional:false,openAssumptions:[]});
  }
  const b=builder(view),support=b.add("support@1",[cover,view.state.domainFacts[0]],{kind:"cover",symbol:1,cells:[1]});
  expect(b.check([support])).toMatchObject({kind:"rejected",code:"incomplete-domain-evidence"});
});

test("checks a 6,561-row Cartesian table as a bounded coverage DAG", () => {
  const b = builder(fixture());
  const rows: number[] = [];
  for (let a = 0; a < 9; a++) {
    let row: number | undefined;
    for (let c = 0; c < 9; c++) {
      const leaf = b.table("table-filter@1", [0,1,2,3], [0,1,2,3], 81,
        { cells: [0,1,2,3], box: [1 << a, 1 << c, 511, 511] });
      row = row === undefined ? leaf : b.table("table-union@1", [row, leaf], [0,1,2,3], (c+1)*81);
    }
    rows.push(row!);
  }
  let root = rows[0];
  for (let a = 1; a < 9; a++) root = b.table("table-union@1", [root, rows[a]], [0,1,2,3], (a+1)*729);
  const projection = b.add("table-project@1", [root], { kind: "domain", cell: 3, mask: 511 });
  expect(b.check([projection])).toMatchObject({ kind: "verified" });
  expect(Math.max(...b.nodes.map(node => new TextEncoder().encode(JSON.stringify(node)).length))).toBeLessThan(16384);
  b.nodes[b.nodes.length - 1] = { ...b.nodes.at(-1)!, premises: [rows[0]] };
  expect(b.check([projection])).toMatchObject({ kind: "rejected", code: "incomplete-table" });
});

test("rejects a truncated row claim and overlapping coverage branches", () => {
  const b = builder(fixture(2, 2));
  const leaf = b.table("table-filter@1", [0,1], [0,1], 3, { cells: [0,1], box: [3,3] });
  expect(b.check([leaf])).toMatchObject({ kind: "rejected", code: "invalid-table-summary" });
  b.nodes[0] = { ...b.nodes[0], conclusion: { ...b.nodes[0].conclusion, count: 4 } as Proposition };
  const second = b.table("table-filter@1", [0,1], [0,1], 4, { cells: [0,1], box: [3,3] });
  const union = b.table("table-union@1", [leaf, second], [0,1], 8);
  expect(b.check([union])).toMatchObject({ kind: "rejected", code: "invalid-table-partition" });
});

test("table identity prevents equal-sized different rows from being substituted", () => {
  const b = builder(fixture(2, 2));
  const first = b.table("table-filter@1", [0,1], [0,1], 2, { cells: [0,1], box: [1,3] });
  const second = b.table("table-filter@1", [0,1], [0,1], 2, { cells: [0,1], box: [2,3] });
  b.nodes[1] = { ...b.nodes[1], conclusion: b.nodes[0].conclusion };
  expect(b.check([first, second])).toMatchObject({ kind: "rejected" });
});

test.each([false, true])("joint sum/order/row inference forces A=4 with both registry orders: %s", reverse => {
  const result = assemble(canonicalProblem({ schema: 1, cells: [0,1,2,3,4], symbols: [1,2,3,4,5,6,7,8,9], givens: [0,0,1,2,3],
    constraints: [ { id: "sum:0", type: "sum@1", cells: [0,1], parameters: { total: 10 } },
      { id: "order:0", type: "order@1", cells: [0,1], parameters: {} },
      { id: "row:0", type: "all-different@1", cells: [0,2,3,4], parameters: {} } ] }), reverse ? [...mockRuleRegistry].reverse() : mockRuleRegistry);
  if (!result.ok) throw Error("fixture");
  const view = initialize(result.value, "primary"), b = builder(view);
  const relations = [...view.facts.values()].filter(f => f.proposition.kind === "relation");
  const row = [...view.facts.values()].find(f => f.proposition.kind === "all-different")!;
  const joined = b.table("table-join@1", relations.map(f => f.root), [0,1], 4);
  const rowTable = b.table("table-filter@1", [0, ...[2,3,4].map(cell => view.state.domainFacts[cell]), row.root], [0,2,3,4], 6,
    { cells: [0,2,3,4], box: [511,1,2,4] });
  const mixed = b.table("table-join@1", [joined, rowTable], [0,1,2,3,4], 1);
  const place = b.add("table-project@1", [mixed], { kind: "literal", value: { cell: 0, symbol: 4, positive: true } });
  const domain = b.add("table-project@1", [mixed], { kind: "domain", cell: 0, mask: 8 });
  const proposal = { ...b.proposal([place, domain]), effects: [{ kind: "place", cell: 0, symbol: 4 } as const], pattern: { kind: "propagation" } };
  expect([...verifyCertificate(proposal, b.context)].at(-1)).toMatchObject({ kind: "verified", certificate: {
    proposal: { effects: [{ kind: "place", cell: 0, symbol: 4 }] }, consequences: [{ rules: ["order:0", "row:0", "sum:0"] }, { rules: ["order:0", "row:0", "sum:0"] }] } });
  expect(assertSound(view, proposal).proposal.effects).toEqual([{ kind: "place", cell: 0, symbol: 4 }]);
  expect(() => assertSound(view, proposal, { oracleMaxNodes: 0 })).toThrow(/interrupt/i);
});

test("replays a one-hole completion from original clues without discovery", () => {
  const givens = Array.from(SOLUTION, Number); givens[0] = 0;
  const problem = normalizeClassic({ kind: "classic", version: 1, width: 9, height: 9, givens });
  const result = assemble(problem, [new AllDifferentRule()]); if (!result.ok) throw Error("fixture");
  let view = initialize(result.value, "primary"); const proposals: DeductionProposal[] = [];
  for (const rule of view.assembly.problem.constraints) {
    for (const event of [...view.assembly.modules.get(rule.id)!.propagate(view, rule)]) if (event.kind === "proposal") {
      const checked = [...checkProposal(event.proposal, { view, retained: retainedProof(view), limits, policy: "unconditional", uniqueEvidenceId: null })].at(-1);
      if (checked?.kind !== "checked") throw Error("preamble");
      proposals.push(event.proposal); view = commitChecked(view, checked.step).view;
    }
  }
  const single = [...getTechniques("classic-expanded@1")[0].discover(view, discoveryContext())].find(e => e.kind === "proposal");
  if (single?.kind !== "proposal") throw Error("single"); proposals.push(single.proposal);
  const snapshot = makeSnapshot(problem, { kind: "manual" }, "replay", 0);
  expect([...replay(snapshot, proposals, result.value, limits)].at(-1)).toMatchObject({ kind: "checked" });
  const altered = structuredClone(proposals); (altered.at(-1)!.effects[0] as {symbol:number}).symbol = 4;
  expect([...replay(snapshot, altered, result.value, limits)].at(-1)?.kind).toBe("rejected");
});

test("exhaustively checks all nonempty three-symbol domain boxes under sum/order in both registry orders", () => {
  for (const reverse of [false,true]) {
    const result = assemble(canonicalProblem({ schema: 1, cells: [0,1], symbols: [1,2,3], givens: [0,0], constraints: [
      { id: "sum:0", type: "sum@1", cells: [0,1], parameters: { total: 4 } },
      { id: "order:0", type: "order@1", cells: [0,1], parameters: {} }] }), reverse ? [...mockRuleRegistry].reverse() : mockRuleRegistry);
    if (!result.ok) throw Error("fixture"); const view = initialize(result.value, "primary");
    const relations = [...view.facts.values()].filter(f => f.proposition.kind === "relation").map(f => f.root);
    for (let a = 1; a < 8; a++) for (let c = 1; c < 8; c++) {
      // Hand-derived joint semantics: the only ordered pair summing to four is (1,3).
      const count = a % 2 === 1 && c >= 4 ? 1 : 0;
      const b = builder(view), root = b.table("table-filter@1", [0,1,...relations], [0,1], count, { cells: [0,1], box: [a,c] });
      expect(b.check([root]).kind, `box ${a},${c}; reversed ${reverse}`).toBe("verified");
    }
  }
});

test("table enumeration yields before completion and rejects a depleted work budget", () => {
  const b = builder(fixture(2,9));
  const root = b.table("table-filter@1", [0,1], [0,1], 81, { cells: [0,1], box: [511,511] });
  const events = [...verifyCertificate(b.proposal([root]), { ...b.context, limits: { ...limits, workUnits: 20 } })];
  expect(events.filter(event => event.kind === "work").length).toBeGreaterThan(10);
  expect(events.at(-1)).toEqual({ kind: "rejected", code: "proof-work-limit" });
});

test("acceptance rejects an unsatisfiable pre-state instead of passing vacuously", () => {
  const result = assemble(canonicalProblem({ schema: 1, cells: [0,1], symbols: [1,2], givens: [1,1], constraints: [
    { id: "row:0", type: "all-different@1", cells: [0,1], parameters: {} }] }), [new AllDifferentRule()]);
  if (!result.ok) throw Error("fixture"); const view = initialize(result.value, "primary"), b = builder(view);
  const root = b.add("given@1", [], { kind: "literal", value: { cell: 0, symbol: 1, positive: true } });
  expect(() => assertSound(view, b.proposal([root]))).toThrow(/pre-state is unsatisfiable/);
});

test("certificate-only tables preserve exact definitions without candidate or replay authority", () => {
  const view = fixture(2,2), b = builder(view), session = new CertificateSession(b.context);
  const table = b.table("table-filter@1", [0,1], [0,1], 4, { cells: [0,1], box: [3,3] });
  const first = b.check([table]); if (first.kind !== "verified") throw Error("fixture proof");
  session.retain(first.certificate);
  const other=fixture(2,2), unrelated=new CertificateSession({...b.context,view:other,retained:retainedProof(other)});
  expect(()=>unrelated.retain(first.certificate)).toThrow("substituted-certificate-import");
  const c = builder(view, session.context.retained);
  expect(view.state.key.revision).toBe(0); expect(retainedProof(view).size).toBe(2);
  const root = c.add("table-project@1", [table], { kind: "domain", cell: 0, mask: 3 });
  expect(c.check([root]).kind).toBe("verified");
  expect(() => commitChecked(view, first.certificate as never)).toThrow("inauthentic");
  expect(() => retainCheckedFacts(view, first.certificate as never)).toThrow("inauthentic");
  expect([...checkProposal(c.proposal([root]), session.context)].at(-1)).toMatchObject({ kind: "rejected", code: "inauthentic-retained-node" });
  const snapshot = makeSnapshot(view.assembly.problem, { kind: "manual" }, "cached", 0);
  expect([...replay(snapshot, [b.proposal([table])], view.assembly, limits)].at(-1)?.kind).toBe("rejected");
});

test("inline relation projection preserves correlations and deduplicates every complete projected row", () => {
  const b = builder(fixture(3,2));
  const table = b.table("table-filter@1", [0,1,2], [0,1,2], 8, { cells: [0,1,2], box: [3,3,3] });
  const root = b.add("table-project@1", [table], { kind: "relation", cells: [0,2], tuples: [[1,1],[1,2],[2,1],[2,2]] });
  expect(b.check([root]).kind).toBe("verified");
  b.nodes[1] = { ...b.nodes[1], conclusion: { kind: "relation", cells: [0,2], tuples: [[1,1],[1,2],[2,1]] } };
  expect(b.check([root])).toMatchObject({ kind: "rejected", code: "invalid-table-projection" });
});

test("table projections reject ignored fields on their literal claims", () => {
  const b = builder(fixture(2,2,[1,0]));
  const table = b.table("table-filter@1", [2,1], [0,1], 2, { cells: [0,1], box: [1,3] });
  const root = b.add("table-project@1", [table], { kind: "literal", value: { cell: 0, symbol: 2, positive: false }, ignored: true } as Proposition);
  expect(b.check([root]).kind).toBe("rejected");
});

test("table definition authority survives exact conjunction projection", () => {
  const b = builder(fixture(2,2));
  const table = b.table("table-filter@1", [0,1], [0,1], 4, { cells: [0,1], box: [3,3] });
  const claim = b.nodes[0].conclusion;
  const and = b.add("conjunction@1", [table], { kind: "and", terms: [claim] });
  const alias = b.add("conjunction@1", [and], claim, { index: 0 });
  const root = b.add("table-project@1", [alias], { kind: "domain", cell: 0, mask: 3 });
  expect(b.check([root]).kind).toBe("verified");
});

test("cases cannot equate different tables merely because their cells and row counts match", () => {
  const b = builder(fixture(2,2));
  const clause = b.add("cover-clause@1", [1], { kind: "clause", alternatives: [
    { cell: 1, symbol: 1, positive: true }, { cell: 1, symbol: 2, positive: true }] });
  const a = b.add("assume@1", [], { kind: "literal", value: { cell: 1, symbol: 1, positive: true } });
  const first = b.table("table-filter@1", [0,a], [0,1], 2, { cells: [0,1], box: [3,1] });
  b.nodes[b.nodes.length-1] = { ...b.nodes.at(-1)!, scope: [a] };
  const c = b.add("assume@1", [], { kind: "literal", value: { cell: 1, symbol: 2, positive: true } });
  const second = b.table("table-filter@1", [0,c], [0,1], 2, { cells: [0,1], box: [3,2] });
  b.nodes[b.nodes.length-1] = { ...b.nodes.at(-1)!, scope: [c] };
  const root = b.add("cases@1", [clause,a,first,c,second], b.nodes.find(node => node.id === first)!.conclusion);
  expect(b.check([root])).toMatchObject({ kind: "rejected", code: "invalid-case-conclusion" });
});

test.each(["invalid", "work", "workspace", "nodes", "time"])("empty replay still enforces startup budget: %s", limit => {
  const view = fixture(2,2), snapshot = makeSnapshot(view.assembly.problem, { kind: "manual" }, "empty", 0);
  const constrained = { ...limits };
  if (limit === "invalid") constrained.stepNodes = -1;
  if (limit === "work") constrained.workUnits = 1;
  if (limit === "workspace") constrained.workspaceBytes = 1;
  if (limit === "nodes") constrained.runNodes = 1;
  if (limit === "time") constrained.timeMs = 0;
  expect([...replay(snapshot, [], view.assembly, constrained)].at(-1)?.kind).toBe("rejected");
});

function namedPath() {
  const problem = canonicalProblem({ schema: 1, cells: [0,1], symbols: [1,2], givens: [1,0],
    constraints: [{ id: "row:0", type: "all-different@1", cells: [0,1], parameters: {} }] });
  const assembly = assemble(problem, [new AllDifferentRule()]); if (!assembly.ok) throw Error("fixture");
  const initial = initialize(assembly.value, "primary");
  const event = [...assembly.value.modules.get("row:0")!.propagate(initial, problem.constraints[0])].find(e => e.kind === "proposal");
  if (event?.kind !== "proposal") throw Error("fixture");
  const first = [...checkProposal(event.proposal, { view: initial, retained: retainedProof(initial), limits, policy: "unconditional", uniqueEvidenceId: null })].at(-1);
  if (first?.kind !== "checked") throw Error("fixture");
  const view = commitChecked(initial, first.step).view, b = builder(view);
  const root = b.add("cover-clause@1", [view.state.domainFacts[1]], { kind: "literal", value: { cell: 1, symbol: 2, positive: true } });
  const second: DeductionProposal = { ...b.proposal([root]), technique: "c01@1", pattern: {kind:"single",alias:"Naked Single",cell:1,symbol:2,house:null} };
  const checked = [...checkProposal(second, b.context)].at(-1); if (checked?.kind !== "checked") throw Error("cache");
  return { initial, proposals: [event.proposal, second], steps: [first.step, checked.step], snapshot: makeSnapshot(problem, {kind:"manual"}, "named-path", 0) };
}

test("replay charges cumulative headers even when every named bundle fits individually", () => {
  const path = namedPath(), bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
  const cap = [...retainedProof(path.initial).values()].reduce((sum,node) => sum+bytes(node), 0) + path.proposals.reduce((sum,p) => sum+bytes(p), 0)-1;
  const events = [...replay(path.snapshot, path.proposals, path.initial.assembly, {...limits,proofBytes:cap})];
  expect(events.filter(e => e.kind === "checked")).toHaveLength(1);
  expect(events.at(-1)).toMatchObject({kind:"rejected",code:"proof-byte-limit"});
});

test("replay includes checker bookkeeping in the cumulative work limit", () => {
  const path = namedPath(), estimator = initializationReservation(path.initial.assembly);
  let startup = 1, next = estimator.next();
  while (!next.done) { if (next.value.kind === "work") startup += next.value.units; next = estimator.next(); }
  startup += next.value.workUnits;
  const cap = startup + path.steps.reduce((sum,step) => sum+checkedWorkUnits(step), 0)-1;
  const events = [...replay(path.snapshot, path.proposals, path.initial.assembly, {...limits,workUnits:cap})];
  expect(events.filter(e => e.kind === "checked")).toHaveLength(1);
  expect(events.at(-1)).toMatchObject({kind:"rejected",code:"proof-work-limit"});
});

test("an empty table proves exactly false and rejects unsupported conclusion fields", () => {
  const result = assemble(canonicalProblem({ schema: 1, cells: [0,1], symbols: [1,2], givens: [1,1], constraints: [
    { id: "row:0", type: "all-different@1", cells: [0,1], parameters: {} }] }), [new AllDifferentRule()]);
  if (!result.ok) throw Error("fixture"); const view = initialize(result.value, "primary"), b = builder(view);
  const table = b.table("table-filter@1", [2,3,5], [0,1], 0, { cells: [0,1], box: [1,1] });
  const root = b.add("table-project@1", [table], { kind: "false" });
  expect(b.check([root]).kind).toBe("verified");
  b.nodes[1] = { ...b.nodes[1], conclusion: { kind: "false", ignored: true } as unknown as Proposition };
  expect(b.check([root])).toMatchObject({ kind: "rejected", code: "invalid-table-projection" });
});

test("cumulative replay bytes include separators between nodes in an earlier named bundle", () => {
  const path = namedPath(), bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
  expect(path.proposals[0].proof.nodes.length).toBeGreaterThan(1);
  const cap = [...retainedProof(path.initial).values()].reduce((sum,node) => sum+bytes(node), 0) + path.proposals.reduce((sum,p) => sum+bytes(p), 0)-1;
  const events = [...replay(path.snapshot, path.proposals, path.initial.assembly, {...limits,proofBytes:cap})];
  expect(events.filter(e => e.kind === "checked")).toHaveLength(1);
  expect(events.at(-1)).toMatchObject({kind:"rejected",code:"proof-byte-limit"});
});
