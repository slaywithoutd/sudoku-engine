import { expect, test } from "vitest";
import { getTechniques } from "../../../src/solver/techniques/registry";
import { fixtureCase, fixtureView } from "../../solver/acceptance";
import { assertSound } from "../../solver/acceptance";
import {
  independentSetCertificate,
  setFixtures,
  setView,
  setPrefix,
  independentLocalTable,
} from "./set-acceptance";
import { IndependentChainProof } from "../../solver/chains-acceptance";

test.each(["C20-intersection-2", "C21-aligned-auxiliary-5", "C21-count-multiple-symbols-external"])(
  "%s rejects independent valid substitute and mixed effect roots",
  (id) => {
    const f = setFixtures.find((f) => f.id === id)!,
      view = setView(f),
      genuine = independentSetCertificate(f),
      p = genuine.pattern as any,
      e = f.expectedEffects[0];
    const b = new IndependentChainProof(view);
    const cells = [
      ...new Set([
        e.cell,
        ...(p.kind === "sdc"
          ? [...p.intersection, ...p.lineSide, ...p.boxSide]
          : p.kind === "aligned"
            ? [...p.selected, ...p.auxiliaries.flatMap((a: any) => a.cells)]
            : p.cells),
      ]),
    ].sort((a, c) => a - c) as number[];
    const scopes = (
      p.kind === "sdc"
        ? [p.line, p.box]
        : p.kind === "aligned"
          ? [p.auxiliaries[0].house]
          : p.scopes.map((s: any) => s.house)
    ).map((house: string) => ({
      house,
      cells: view.assembly.allDifferent
        .find((h) => h.id === house)!
        .cells.filter((c) => cells.includes(c)),
    }));
    const table = independentLocalTable(b, cells, scopes),
      root = b.add("table-project@1", [table], {
        kind: "literal",
        value: { cell: e.cell, symbol: e.symbol, positive: false },
      });
    const substitute = b.proposal(f.rowId, genuine.pattern, [e], [root]);
    expect(check(f, substitute, true)?.kind).toBe("verified");
    expect(check(f, substitute)?.kind).toBe("rejected");
    const first = Math.min(...substitute.proof.nodes.map((n) => n.id)),
      shift = Math.max(...genuine.proof.nodes.map((n) => n.id)) + 1 - first;
    const move = (id: number) => (id >= first ? id + shift : id);
    const mixed: DeductionProposal = {
      ...genuine,
      proof: {
        ...genuine.proof,
        nodes: [
          ...genuine.proof.nodes,
          ...substitute.proof.nodes.map((n) => ({
            ...n,
            id: move(n.id),
            premises: n.premises.map(move),
            conclusion:
              n.conclusion.kind === "table"
                ? { ...n.conclusion, definition: move(n.conclusion.definition) }
                : n.conclusion,
          })),
        ],
        imports: [...new Set([...genuine.proof.imports, ...substitute.proof.imports])].sort(
          (a, c) => a - c,
        ),
        roots: [...genuine.proof.roots, ...substitute.proof.roots.map(move)],
      },
    };
    expect(check(f, mixed, true)?.kind).toBe("verified");
    expect(check(f, mixed)?.kind).toBe("rejected");
  },
);
import { discoveryContext } from "../../solver/discovery-context";
import { buildImplications, type ImplicationIndex } from "../../../src/solver/indexes/implications";
import { PatternGraph } from "../../../src/solver/techniques/pattern-runtime";
import { SetCertificate } from "../../../src/solver/techniques/set-certificate";
import type { SetPattern } from "../../../src/solver/techniques/set-contracts";
import type { ReadView } from "../../../src/solver/state/types";
import { checkProposal, verifyCertificate } from "../../../src/solver/proof/checker";
import {
  retainedProof,
  commitChecked,
  retainCheckedFacts,
} from "../../../src/solver/state/candidates";
import type { DeductionProposal } from "../../../src/solver/proof/types";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import { AlignedExclusionSearch } from "../../../src/solver/techniques/aligned-exclusion";
import { type TechniqueFixture } from "../../solver/acceptance";
import { replay } from "../../../src/solver/proof/replay";
import type { SolverSnapshot } from "../../../src/solver/snapshot";
import { oracle } from "../../solver/oracle";
import { fixtureCertificate } from "../../solver/acceptance";
import { localSets } from "../../../src/solver/techniques/set-runtime";
import { canonicalProblem } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { AllDifferentRule } from "../../../src/solver/rules/all-different";
import { initialize } from "../../../src/solver/state/candidates";
import { mockRuleRegistry } from "../../solver/mock-rules";

test("aligned direct conflicts retain closed relation sources and different symbols", () => {
  const result = assemble(
    canonicalProblem({
      schema: 1,
      cells: Array.from({ length: 81 }, (_, i) => i),
      symbols: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      givens: Array(81).fill(0),
      constraints: [
        { id: "local-relation", type: "sum@1", cells: [0, 1], parameters: { total: 3 } },
      ],
    }),
    mockRuleRegistry,
  );
  if (!result.ok) throw Error(JSON.stringify(result));
  const view = initialize(result.value, "primary"),
    context = discoveryContext();
  let found = false;
  for (const event of getTechniques("classic-expanded@1")
    .find((d) => d.id === "c21@1")!
    .discover(view, context)) {
    if (event.kind !== "proposal") continue;
    expect(
      [
        ...checkProposal(event.proposal, {
          view,
          retained: retainedProof(view),
          limits: context.limits,
          policy: "discharged",
          uniqueEvidenceId: null,
        }),
      ].at(-1)?.kind,
    ).toBe("checked");
    expect(event.proposal.effects).toContainEqual({ kind: "remove", cell: 0, symbol: 3 });
    found = true;
    break;
  }
  expect(found).toBe(true);
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
});

test("auxiliary empty matching retains every actual relation conflict", () => {
  const original = setView(setFixtures.find((f) => f.id === "C21-aligned-2")!);
  const { key: _key, ...semantics } = original.assembly.problem;
  const assembled = assemble(
    canonicalProblem({
      ...semantics,
      constraints: [
        ...original.assembly.problem.constraints,
        { id: "sum-helper", type: "sum@1", cells: [36, 39], parameters: { total: 12 } },
      ],
    }),
    mockRuleRegistry,
  );
  if (!assembled.ok) throw Error(JSON.stringify(assembled));
  let view = initialize(assembled.value, "primary");
  const context = discoveryContext();
  for (const rule of view.assembly.problem.constraints)
    for (const event of view.assembly.modules.get(rule.id)!.propagate(view, rule))
      if (event.kind === "proposal") {
        const checked = [
          ...checkProposal(event.proposal, {
            view,
            retained: retainedProof(view),
            limits: context.limits,
            policy: "discharged",
            uniqueEvidenceId: null,
          }),
        ].at(-1);
        if (checked?.kind !== "checked") throw Error(JSON.stringify(checked));
        view = commitChecked(view, checked.step).view;
      }
  let index: ImplicationIndex | undefined;
  for (const event of buildImplications(view, context.workspace))
    if (event.kind === "ready") index = event.value;
  const lease = context.workspace.reserve(0, 65536),
    graph = new PatternGraph(index!, context, lease);
  try {
    for (const _event of graph.prepare(view)) {
      /* setup */
    }
    const auxiliaries = [{ cells: [36], house: "row:4", symbols: [3, 4] }],
      cursor = new AlignedExclusionSearch(view, graph, auxiliaries).classify([39, 47], auxiliaries);
    let reasons: number[] = [];
    while (true) {
      const step = cursor.next();
      if (step.done) {
        reasons = step.value.reasons;
        break;
      }
    }
    const pattern: SetPattern = {
      kind: "aligned",
      alias: "Aligned Pair Exclusion",
      selected: [39, 47],
      domains: [view.state.domains[39], view.state.domains[47]],
      auxiliaries: [{ ...auxiliaries[0], domains: [view.state.domains[36]], table: -1 }],
      reasons,
      rejections: [],
      roots: [],
    };
    const proposal = production(view, pattern, [{ kind: "remove", cell: 39, symbol: 4 }]);
    const verdict = [
      ...checkProposal(proposal, {
        view,
        retained: retainedProof(view),
        limits: context.limits,
        policy: "discharged",
        uniqueEvidenceId: null,
      }),
    ].at(-1);
    expect(verdict?.kind, JSON.stringify(verdict)).toBe("checked");
  } finally {
    lease.dispose();
    index!.dispose();
  }
});

test("actual closed capabilities govern eligibility without relying on familiar IDs", () => {
  const base = setView(setFixtures[0]);
  for (const shape of ["none", "arbitrary", "partial"] as const) {
    const constraints =
      shape === "none"
        ? []
        : shape === "arbitrary"
          ? [{ id: "row:0", type: "all-different@1", cells: [0, 10], parameters: {} }]
          : [
              {
                id: "sector-a",
                type: "all-different@1",
                cells: base.assembly.allDifferent.find((h) => h.id === "row:0")!.cells,
                parameters: {},
              },
              {
                id: "sector-b",
                type: "all-different@1",
                cells: base.assembly.allDifferent.find((h) => h.id === "box:0")!.cells,
                parameters: {},
              },
            ];
    const assembled = assemble(
      canonicalProblem({
        schema: 1,
        cells: Array.from({ length: 81 }, (_, i) => i),
        symbols: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        givens: Array(81).fill(0),
        constraints,
      }),
      [new AllDifferentRule()],
    );
    if (!assembled.ok) throw Error(JSON.stringify(assembled));
    const view = initialize(assembled.value, "primary");
    for (const id of ["c20@1", "c21@1"]) {
      const descriptor = getTechniques("classic-expanded@1").find((d) => d.id === id)!,
        excluded = shape === "none" || (id === "c20@1" && shape === "arbitrary");
      expect(descriptor.eligible(view).kind).toBe(excluded ? "excluded" : "yes");
      if (excluded) {
        const context = discoveryContext();
        expect([...descriptor.discover(view, context)]).toEqual([
          { kind: "excluded", reason: "missing-set-capability", dependencies: [{ kind: "all" }] },
        ]);
        expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
      }
      expect(() => [...descriptor.discover({ ...view }, discoveryContext())]).toThrow();
    }
  }
});

test("a prefix extension requires a fresh complete source index", () => {
  const f = fixtureCase("C01-one-hole"),
    view = setView(f),
    original = fixtureCertificate(f.id);
  const positive = original.proof.nodes.find((n) => n.rule === "cover-clause@1")!;
  const cached = {
    ...original,
    effects: [],
    proof: { ...original.proof, nodes: [positive], roots: [positive.id] },
  };
  const accepted = check(f, cached);
  if (accepted?.kind !== "checked") throw Error(JSON.stringify(accepted));
  const extended = retainCheckedFacts(view, accepted.step),
    context = discoveryContext();
  let index: ImplicationIndex | undefined;
  for (const e of buildImplications(view, context.workspace))
    if (e.kind === "ready") index = e.value;
  const lease = context.workspace.reserve(0, 65536),
    graph = new PatternGraph(index!, context, lease);
  try {
    expect(index!.completeFor(extended)).toBe(false);
    expect(() => new SetCertificate(extended, graph)).toThrow("incomplete-set-source-prefix");
    expect(() => [...localSets(extended, graph, 5)]).toThrow("incomplete-set-source-prefix");
  } finally {
    lease.dispose();
    index!.dispose();
  }
  const first = setFixtures[0],
    proof = independentSetCertificate(first),
    admitted = check(first, proof);
  if (admitted?.kind !== "checked") throw Error(JSON.stringify(admitted));
  const changed = commitChecked(setView(first), admitted.step).view;
  expect(
    [
      ...checkProposal(proof, {
        view: changed,
        retained: retainedProof(changed),
        limits: context.limits,
        policy: "discharged",
        uniqueEvidenceId: null,
      }),
    ].at(-1)?.kind,
  ).toBe("rejected");
});

test("aligned classification visits all 6561 assignments and retains equal nonpeer values", () => {
  const f = {
    ...setFixtures[0],
    givens: "0".repeat(81),
    preState: { values: Array(81).fill(0), domains: Array(81).fill(511) },
  };
  const view = setView(f),
    context = discoveryContext();
  let index: ImplicationIndex | undefined;
  for (const e of buildImplications(view, context.workspace))
    if (e.kind === "ready") index = e.value;
  const lease = context.workspace.reserve(0, 65536),
    graph = new PatternGraph(index!, context, lease);
  try {
    for (const _e of graph.prepare(view)) {
      /* source setup */
    }
    const cursor = new AlignedExclusionSearch(view, graph, []).classify([0, 13, 26, 39], []);
    let work = 0;
    while (true) {
      const e = cursor.next();
      if (e.done) {
        expect(e.value).toEqual({ reasons: Array(6561).fill(0), support: [511, 511, 511, 511] });
        break;
      }
      work++;
    }
    expect(work).toBe(6561);
  } finally {
    lease.dispose();
    index!.dispose();
  }
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
});

function check(f: TechniqueFixture, proposal: DeductionProposal, primitive = false) {
  const view = setView(f),
    context = {
      view,
      retained: retainedProof(view),
      limits: discoveryContext().limits,
      policy: "discharged" as const,
      uniqueEvidenceId: null,
    };
  return [
    ...(primitive ? verifyCertificate(proposal, context) : checkProposal(proposal, context)),
  ].at(-1);
}

test.each(setFixtures)(
  "$id replays only original clues and named checked steps",
  (f) => {
    const view = setView(f),
      prefix = setPrefix(f),
      proposal = independentSetCertificate(f);
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

test("every positive pre-state is satisfiable and each forced removal is independently exhausted", () => {
  let fixtures = 0,
    effects = 0,
    nodes = 0;
  for (const f of setFixtures) {
    const input = {
      givens: [...f.givens].map(Number),
      domains: f.preState.domains,
      limit: 1,
      maxNodes: 200000,
    };
    const sat = oracle(input);
    expect(sat).toMatchObject({ interrupted: false, witnesses: [expect.any(Array)] });
    fixtures++;
    nodes += sat.nodes;
    for (const e of f.expectedEffects) {
      const result = oracle({ ...input, force: [e.cell, e.symbol] });
      expect(result, f.id).toMatchObject({ interrupted: false, exhausted: true, witnesses: [] });
      effects++;
      nodes += result.nodes;
      expect(oracle({ ...input, forbid: [e.cell, e.symbol] }), f.id).toMatchObject({
        interrupted: false,
        witnesses: [expect.any(Array)],
      });
    }
  }
  expect(fixtures).toBe(15);
  expect(effects).toBe(15);
  expect(nodes).toBeGreaterThan(0);
});

test.each([
  "drop-surviving-tuple",
  "omit-reason",
  "false-rejection",
  "omit-auxiliary",
  "oversize-selected",
  "oversize-auxiliary",
  "wrong-domain",
])("aligned excludes %s mutations", (mutation) => {
  const f = setFixtures.find((f) => f.id === "C21-aligned-4")!,
    proposal = independentSetCertificate(f),
    p = proposal.pattern as any;
  if (mutation === "drop-surviving-tuple") {
    const i = p.reasons.indexOf(0);
    p.reasons.splice(i, 1);
    p.rejections.splice(i, 1);
  }
  if (mutation === "omit-reason") p.reasons.pop();
  if (mutation === "false-rejection") {
    const i = p.reasons.indexOf(0);
    p.reasons[i] = 1;
    p.rejections[i] = p.rejections.find((n: number) => n >= 0);
  }
  if (mutation === "omit-auxiliary") p.auxiliaries.pop();
  if (mutation === "oversize-selected") p.selected.push(72);
  if (mutation === "oversize-auxiliary") p.auxiliaries[0].cells = [0, 1, 2, 3, 4, 5];
  if (mutation === "wrong-domain") p.domains[0] = 511;
  expect(check(f, proposal)?.kind).toBe("rejected");
});

test.each([
  "overlap-cells",
  "shared-V-symbol",
  "wrong-allocation",
  "side-5",
  "intersection-1",
  "intersection-4",
  "total-12",
  "incomplete-partition",
  "wrong-sector",
  "missing-projection",
])("SDC rejects %s", (mutation) => {
  const f = setFixtures.find((f) => f.id === "C20-line-side-4")!,
    proposal = independentSetCertificate(f),
    p = proposal.pattern as any;
  if (mutation === "overlap-cells") p.boxSide = [p.intersection[0]];
  if (mutation === "shared-V-symbol") p.boxSide = [p.lineSide[0]];
  if (mutation === "wrong-allocation") p.lineSide.pop();
  if (mutation === "side-5") p.lineSide.push(77);
  if (mutation === "intersection-1") p.intersection.pop();
  if (mutation === "intersection-4") p.intersection = [72, 73, 74, 75];
  if (mutation === "total-12") {
    p.intersection = [72, 73, 74];
    p.lineSide = [75, 76, 77, 78];
    p.boxSide = [54, 55, 56, 63, 64];
  }
  if (mutation === "incomplete-partition") {
    const t = proposal.proof.nodes.find((n) => n.id === p.table)!;
    expect(t.rule).toBe("table-union@1");
    p.table = t.premises[0];
  }
  if (mutation === "wrong-sector")
    p.routes[0].sector = p.routes[0].sector === "line" ? "box" : "line";
  if (mutation === "missing-projection") p.routes[0].projection = p.routes[0].root;
  expect(check(f, proposal)?.kind).toBe("rejected");
});

test.each([
  "understate",
  "overstate",
  "missing-symbol",
  "omit-zero",
  "duplicate-domain",
  "missing-domain",
  "missing-target-domain",
  "duplicate-scope",
  "fifth-scope",
  "thirteen-cells",
  "unknown-field",
  "false-target",
  "escaped-assumption",
])("count primitive rejects %s", (mutation) => {
  const f = setFixtures.find((f) => f.id === "C21-count-multiple-symbols-external")!,
    proposal = independentSetCertificate(f),
    p = proposal.pattern as any;
  const n = proposal.proof.nodes.find((n) => n.id === p.contradiction)! as any;
  if (mutation === "understate") n.parameters.capacities[0] = 0;
  if (mutation === "overstate") n.parameters.capacities[0] = 2;
  if (mutation === "missing-symbol") n.parameters.symbols.pop();
  if (mutation === "omit-zero") {
    n.parameters.symbols.splice(1, 1);
    n.parameters.capacities.splice(1, 1);
  }
  if (mutation === "duplicate-domain") n.premises.splice(2, 0, n.premises[1]);
  if (mutation === "missing-domain") n.premises.splice(1, 1);
  if (mutation === "missing-target-domain") n.premises.splice(2, 1);
  if (mutation === "duplicate-scope") n.premises.push(n.premises.at(-1));
  if (mutation === "fifth-scope") n.premises.push(n.premises.at(-2));
  if (mutation === "thirteen-cells") n.parameters.cells = Array.from({ length: 13 }, (_, i) => i);
  if (mutation === "unknown-field") n.parameters.oracle = true;
  if (mutation === "false-target") n.parameters.target.symbol = 8;
  if (mutation === "escaped-assumption") n.scope = [];
  expect(check(f, proposal, true)?.kind).toBe("rejected");
});

test.each(["c20@1", "c21@1"])("%s closes owned resources across all termination paths", (id) => {
  const f = setFixtures.find(
      (f) => f.id === (id === "c20@1" ? "C20-intersection-2" : "C21-aligned-2"),
    )!,
    view = setView(f);
  const descriptor = getTechniques("classic-expanded@1").find((d) => d.id === id)!;
  for (const scenario of [
    "return",
    "cancel",
    "work",
    "proof",
    "workspace-bytes",
    "workspace-entries",
  ]) {
    const context = { ...discoveryContext() };
    let cancel = false;
    if (scenario === "cancel")
      context.workspace = new IndexWorkspace({
        entryLimit: 1000000,
        byteLimit: 256000000,
        cancelled: () => cancel,
      });
    if (scenario === "work") context.limits.workUnits = 1;
    if (scenario === "proof") context.limits.stepNodes = 1;
    if (scenario === "workspace-bytes")
      context.workspace = new IndexWorkspace({ entryLimit: 1000000, byteLimit: 1 });
    if (scenario === "workspace-entries")
      context.workspace = new IndexWorkspace({ entryLimit: 0, byteLimit: 256000000 });
    const cursor = descriptor.discover(view, context);
    if (scenario === "cancel") {
      cursor.next();
      cancel = true;
    }
    let terminal: unknown;
    for (const event of cursor) {
      terminal = event;
      if (event.kind === "proposal") break;
    }
    expect(terminal).toMatchObject(
      scenario === "return"
        ? { kind: "proposal" }
        : {
            kind: "interrupted",
            reason:
              scenario === "cancel"
                ? "cancelled"
                : scenario === "work"
                  ? "work-limit"
                  : scenario === "proof"
                    ? "proof-step-limit"
                    : scenario === "workspace-bytes"
                      ? "workspace-byte-limit"
                      : "workspace-entry-limit",
          },
    );
    expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  }
  const context = discoveryContext();
  context.limits.workUnits = 2750;
  expect(
    [...descriptor.discover(fixtureView(fixtureCase("C01-one-hole")), context)].at(-1),
  ).toEqual({ kind: "interrupted", reason: "work-limit" });
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  const complete = discoveryContext();
  expect(
    [...descriptor.discover(fixtureView(fixtureCase("C01-one-hole")), complete)].at(-1),
  ).toEqual({ kind: "exhausted" });
  expect(complete.workspace.usage).toEqual({ entries: 0, bytes: 0 });
});

function production(view: ReadView, pattern: SetPattern, effects: any[]) {
  const context = discoveryContext();
  let index: ImplicationIndex | undefined;
  for (const e of buildImplications(view, context.workspace))
    if (e.kind === "ready") index = e.value;
  const lease = context.workspace.reserve(0, 65536),
    graph = new PatternGraph(index!, context, lease);
  try {
    for (const _e of graph.prepare(view)) {
      /* cooperative setup */
    }
    graph.compilation = context.workspace.reserve(0, 65536);
    const compiler = new SetCertificate(view, graph).compile(pattern, effects);
    while (true) {
      const e = compiler.next();
      if (e.done) return e.value;
    }
  } finally {
    graph.compilation?.dispose();
    lease.dispose();
    index?.dispose();
    expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  }
}

test.each(setFixtures)("$id production compiler agrees with independent evidence", (f) => {
  const view = setView(f),
    independent = independentSetCertificate(f);
  expect(() =>
    assertSound(
      view,
      production(view, independent.pattern as unknown as SetPattern, f.expectedEffects),
    ),
  ).not.toThrow();
});

test.each([
  "C20-intersection-2",
  "C20-intersection-3",
  "C20-line-side-4",
  "C20-box-side-4",
  "C20-unused-third-side",
  "C20-shared-outside-symbol",
  "C20-max11-symbol9",
  "C21-aligned-2",
  "C21-aligned-3",
  "C21-aligned-4",
  "C21-count-multiple-symbols-external",
])(
  "%s has actual sound family discovery",
  (id) => {
    const f = setFixtures.find((f) => f.id === id)!,
      view = setView(f),
      context = discoveryContext();
    context.limits.workUnits = 2000000;
    let found = false,
      proposals = 0;
    for (const event of getTechniques("classic-expanded@1")
      .find((d) => d.id === f.rowId.toLowerCase() + "@1")!
      .discover(view, context)) {
      if (event.kind === "interrupted") throw Error(event.reason);
      if (event.kind !== "proposal") continue;
      expect(() => assertSound(view, event.proposal)).not.toThrow();
      proposals++;
      const p = event.proposal.pattern as unknown as SetPattern;
      let matches = id.includes("count")
        ? p.kind === "count" && p.symbols.length > 1
        : id.includes("aligned")
          ? p.kind === "aligned" && p.selected.length === Number(id.at(-1))
          : p.kind === "sdc";
      if (p.kind === "sdc") {
        if (id === "C20-intersection-3") matches &&= p.intersection.length === 3;
        if (id === "C20-line-side-4") matches &&= p.lineSide.length === 4;
        if (id === "C20-box-side-4") matches &&= p.boxSide.length === 4;
        if (id === "C20-unused-third-side") {
          const line = view.assembly.allDifferent.find((h) => h.id === p.line)!,
            box = view.assembly.allDifferent.find((h) => h.id === p.box)!;
          matches &&= [...p.lineSide, ...p.boxSide].some(
            (c) => line.cells.includes(c) && box.cells.includes(c),
          );
        }
        if (id === "C20-shared-outside-symbol") {
          const mask = (xs: number[]) => xs.reduce((n, c) => n | view.state.domains[c], 0);
          matches &&= !!(mask(p.lineSide) & mask(p.boxSide) & ~mask(p.intersection));
        }
        if (id === "C20-max11-symbol9")
          matches &&= p.intersection.length + p.lineSide.length + p.boxSide.length === 11;
      }
      if (matches) {
        found = true;
        break;
      }
    }
    expect(found, String(proposals)).toBe(true);
    expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  },
  60000,
);

test.each(setFixtures)("$id accepts an independent named certificate", (f) => {
  const proposal = independentSetCertificate(f);
  expect(() => assertSound(setView(f), proposal)).not.toThrow();
  if (f.rowId === "C20") {
    const pattern = proposal.pattern as any,
      table = proposal.proof.nodes.find((n) => n.id === pattern.table)!.conclusion;
    expect(table.kind === "table" && table.count).toBe((f as any).independentLocalAssignments);
  }
});

test("both C20 spellings share the same independently checked allocation", () => {
  const f = structuredClone(setFixtures[0]);
  (f.expectedPattern as any).alias = "Two-sector disjoint subsets";
  expect(() => assertSound(setView(f), independentSetCertificate(f))).not.toThrow();
});

test("maximum occupancy proof cooperates with work, workspace and caller-close limits", () => {
  const f = setFixtures.find((f) => f.id === "C21-count-12-symbols-9")!,
    view = setView(f),
    proposal = independentSetCertificate(f),
    limits = discoveryContext().limits;
  const context = {
    view,
    retained: retainedProof(view),
    limits,
    policy: "discharged" as const,
    uniqueEvidenceId: null,
  };
  expect(
    [...verifyCertificate(proposal, { ...context, limits: { ...limits, workUnits: 10000 } })].at(
      -1,
    ),
  ).toEqual({ kind: "rejected", code: "proof-work-limit" });
  expect(
    [
      ...verifyCertificate(proposal, { ...context, limits: { ...limits, workspaceBytes: 4095 } }),
    ].at(-1)?.kind,
  ).toBe("rejected");
  const cursor = verifyCertificate(proposal, context);
  let work = 0;
  for (let i = 0; i < 1000; i++) {
    const event = cursor.next();
    if (event.done) throw Error("premature-count-completion");
    if (event.value.kind === "work") work += event.value.units;
  }
  expect(work).toBeGreaterThan(0);
  expect(cursor.return()).toEqual({ done: true, value: undefined });
  expect(view.state.domains[39]).toBe(f.preState.domains[39]);
});

test.each(["c20@1", "c21@1"])("%s has a callable finite set strategy", (id) => {
  const descriptor = getTechniques("classic-expanded@1").find((d) => d.id === id)!;
  expect(descriptor.eligible(fixtureView(fixtureCase("C01-one-hole")))).toEqual({ kind: "yes" });
});
