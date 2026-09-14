import { expect, test } from "vitest";
import {
  buildTemplates,
  TemplateOperationContext,
  type TemplateIndex,
} from "../../../src/solver/indexes/templates";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import { fixtureView, type TechniqueFixture } from "../../solver/acceptance";
import fixtures from "../../solver/fixtures/C33.json";
import {
  initialize,
  commitChecked,
  rebuildOwnedIndexes,
  isAcceptedDescendant,
  retainCheckedFacts,
} from "../../../src/solver/state/candidates";
import { assemble } from "../../../src/solver/rules/assemble";
import {
  canonicalProblem,
  normalizeClassic,
} from "../../../src/solver/problem";
import { AllDifferentRule } from "../../../src/solver/rules/all-different";
import {
  compileTemplates,
  type TemplatePlan,
} from "../../../src/solver/techniques/templates";
import { discoveryContext } from "../../solver/discovery-context";
import { checkProposal } from "../../../src/solver/proof/checker";
import { retainedProof } from "../../../src/solver/state/candidates";
import type {
  CheckedInference,
  DeductionProposal,
  ProofNode,
} from "../../../src/solver/proof/types";
import { PrimitiveRegistry } from "../../../src/solver/proof/primitives";
import { checkScope } from "../../../src/solver/proof/assumptions";
import { mockRuleRegistry } from "../../solver/mock-rules";
import { oracle } from "../../solver/oracle";
import { originalCluePrefix } from "../../solver/acceptance";
import { replay } from "../../../src/solver/proof/replay";
import type { SolverSnapshot } from "../../../src/solver/snapshot";
import { getTechniques } from "../../../src/solver/techniques/registry";
import {
  independentTemplateCertificate,
  independentTemplates,
} from "../../solver/templates-independent";
import type { ReadView } from "../../../src/solver/state/types";
import {
  coverageEntries,
  validateCoverage,
} from "../../../src/solver/techniques/manifest";
import { existsSync } from "node:fs";

// Independently enumerate ALL column permutations, then test boxes. No production helpers.
function independentEmptyGridTemplates(): number[] {
  const result: number[] = [],
    columns: number[] = [];
  function visit() {
    if (columns.length === 9) {
      if (
        new Set(
          columns.map((c, r) => Math.floor(r / 3) * 3 + Math.floor(c / 3)),
        ).size === 9
      )
        result.push(columns.reduce((n, c) => n * 9 + c, 0));
      return;
    }
    for (let c = 0; c < 9; c++)
      if (!columns.includes(c)) {
        columns.push(c);
        visit();
        columns.pop();
      }
  }
  visit();
  return result;
}
function emptyView() {
  const a = assemble(
    normalizeClassic({
      kind: "classic",
      version: 1,
      width: 9,
      height: 9,
      givens: Array(81).fill(0),
    }),
    [new AllDifferentRule()],
  );
  if (!a.ok) throw Error("assembly");
  return initialize(a.value, "primary");
}
const workspace = () =>
  new IndexWorkspace({ entryLimit: 1000000, byteLimit: 256000000 });
test("compiler rejects a mode-incompatible alias before allocating", () => {
  const view = fixtureView(fixtures[0] as unknown as TechniqueFixture);
  const context = {
    ...discoveryContext(),
    templates: new TemplateOperationContext(view),
  };
  expect(() => [
    ...compileTemplates(
      view,
      { mode: "single", symbols: [1], alias: "POM" },
      context,
    ),
  ]).toThrow("template-out-of-profile");
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
});
test("complete empty-grid relation equals all 46656 independent column permutations", () => {
  const expected = independentEmptyGridTemplates();
  expect(expected).toHaveLength(46656);
  const ws = workspace();
  let index: TemplateIndex | undefined;
  for (const e of buildTemplates(emptyView(), 1, ws))
    if (e.kind === "ready") index = e.value;
  expect(index).toBeDefined();
  expect(index!.codes).toEqual(expected);
  index!.dispose();
  expect(ws.usage).toEqual({ entries: 0, bytes: 0 });
});
test("incomplete enumeration cannot publish a relation and releases reservations", () => {
  let stop = false;
  const ws = new IndexWorkspace({
    entryLimit: 1000000,
    byteLimit: 256000000,
    cancelled: () => stop,
  });
  const cursor = buildTemplates(emptyView(), 1, ws);
  expect(cursor.next().value?.kind).toBe("work");
  stop = true;
  expect([...cursor]).toEqual([{ kind: "interrupted", reason: "cancelled" }]);
  expect(ws.usage).toEqual({ entries: 0, bytes: 0 });
});
test("operation tuple allowance survives restart and same-revision advance", () => {
  const view = fixtureView(fixtures[0] as unknown as TechniqueFixture),
    operation = new TemplateOperationContext(view);
  for (let i = 0; i < 100000; i++) operation.consumeTuple(view);
  operation.advance(view, () => {});
  expect(operation.tupleTests).toBe(100000);
  expect(() => operation.consumeTuple(view)).toThrow("template-tuple-limit");
});

const limits = {
  ...discoveryContext().limits,
  timeMs: 180000,
  workUnits: 20000000,
};
function compile(f: (typeof fixtures)[number]): DeductionProposal {
  return compileOwned(
    fixtureView(f as unknown as TechniqueFixture),
    f.expectedPattern as TemplatePlan,
  );
}
function compileOwned(view: ReadView, plan: TemplatePlan): DeductionProposal {
  const context = {
    ...discoveryContext(),
    limits,
    templates: new TemplateOperationContext(view),
  };
  const cursor = compileTemplates(view, plan, context);
  let result: DeductionProposal | null = null;
  for (;;) {
    const e = cursor.next();
    if (e.done) {
      result = e.value;
      break;
    }
  }
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  expect(result).not.toBeNull();
  return result!;
}
function checked(f: (typeof fixtures)[number], proposal: DeductionProposal) {
  const view = fixtureView(f as unknown as TechniqueFixture);
  let terminal;
  for (const e of checkProposal(proposal, {
    view,
    retained: retainedProof(view),
    limits,
    policy: "unconditional",
    uniqueEvidenceId: null,
  }))
    if (e.kind !== "work") terminal = e;
  return terminal;
}
test.each(fixtures)(
  "$id complete source lists and full named certificate check",
  (f) => {
    const proposal = compile(f);
    expect(proposal.effects).toEqual(expect.arrayContaining(f.expectedEffects));
    const terminal = checked(f, proposal);
    expect(terminal?.kind, JSON.stringify(terminal)).toBe("checked");
  },
  200000,
);

const encode = (cells: readonly number[]) =>
  cells.reduce((n, c) => n * 9 + (c % 9), 0);
function certificateData(proposal: DeductionProposal): any {
  return proposal.proof.nodes.find((n) => n.rule === "template-cover@1")!
    .parameters;
}
test.each(fixtures)(
  "$id matches independent source/support lists and tuple accounting",
  (f) => {
    const p = certificateData(compile(f)),
      record = f.independentEnumeration as any;
    for (let i = 0; i < f.expectedPattern.symbols.length; i++) {
      const symbol = f.expectedPattern.symbols[i];
      expect(p.templates[i].flat()).toEqual(
        record.templates[symbol]
          .map(encode)
          .sort((a: number, b: number) => a - b),
      );
      expect(p.supported[i].flat()).toEqual(
        record.supportedTemplates[symbol]
          .map(encode)
          .sort((a: number, b: number) => a - b),
      );
    }
    expect(p.tupleTests).toBe(
      f.expectedPattern.mode === "single" ? 0 : record.tupleTests,
    );
    if (f.id === "C33-incompatibility")
      expect(p.rounds).toEqual([
        [2, 0, 4],
        [0, 0, 2],
      ]);
    if (f.id === "C33-incompatibility-nine") expect(p.rounds).toHaveLength(4);
    const independent = independentTemplates(f as unknown as TechniqueFixture);
    expect(independent.effects).toEqual(compile(f).effects);
    expect(independent.tests).toBe(p.tupleTests);
    expect(independent.rounds).toEqual(p.rounds);
  },
);
test.each(fixtures)(
  "$id independently assembled certificate checks and replays original clues",
  (f) => {
    const fixture = f as unknown as TechniqueFixture,
      view = fixtureView(fixture),
      proposal = independentTemplateCertificate(fixture);
    expect(checked(f, proposal)?.kind).toBe("checked");
    let count = 0;
    const prefix = originalCluePrefix(fixture);
    for (const e of replay(
      { problem: view.assembly.problem } as SolverSnapshot,
      [...prefix, proposal],
      view.assembly,
      limits,
    )) {
      expect(e.kind === "rejected" ? e.code : undefined).toBeUndefined();
      if (e.kind === "checked") count++;
    }
    expect(count).toBe(prefix.length + 1);
  },
  200000,
);
test("actual discovery fairly reaches single pair triple and iterative modes with checked oracle effects", () => {
  const f = fixtures[0],
    view = fixtureView(f as unknown as TechniqueFixture),
    context = {
      ...discoveryContext(),
      limits,
      templates: new TemplateOperationContext(view),
    };
  const cursor = getTechniques("classic-expanded@1")
      .find((d) => d.id === "c33@1")!
      .discover(view, context),
    found = new Map<string, DeductionProposal>();
  try {
    for (const e of cursor)
      if (e.kind === "proposal") {
        const p = e.proposal.pattern as any;
        if (!found.has(p.mode)) found.set(p.mode, e.proposal);
        if (found.size === 4) break;
      }
  } finally {
    cursor.return();
  }
  expect([...found.keys()].sort()).toEqual([
    "incompatibility",
    "pair",
    "single",
    "triple",
  ]);
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  for (const proposal of found.values()) {
    const terminal = checked(f, proposal);
    expect(terminal?.kind, JSON.stringify(terminal)).toBe("checked");
    for (const e of proposal.effects)
      expect(
        oracle({
          givens: [...f.givens].map(Number),
          force: [e.cell, e.symbol],
          limit: 1,
          maxNodes: 1000000,
        }),
      ).toMatchObject({ interrupted: false, exhausted: true, witnesses: [] });
  }
}, 200000);
test.each(fixtures)(
  "$id local and original-clue oracle counterfactuals plus exact replay",
  (f) => {
    const fixture = f as unknown as TechniqueFixture,
      view = fixtureView(fixture),
      proposal = compile(fixture as unknown as typeof f);
    const givens = [...f.givens].map(Number);
    for (const domains of [f.preState.domains, undefined]) {
      const input = { givens, domains, limit: 1, maxNodes: 1000000 };
      expect(oracle(input)).toMatchObject({
        interrupted: false,
        witnesses: [expect.any(Array)],
      });
      for (const effect of proposal.effects)
        expect(
          oracle({ ...input, force: [effect.cell, effect.symbol] }),
          JSON.stringify(effect),
        ).toMatchObject({ interrupted: false, exhausted: true, witnesses: [] });
    }
    const prefix = originalCluePrefix(fixture);
    let checked = 0;
    for (const e of replay(
      { problem: view.assembly.problem } as SolverSnapshot,
      [...prefix, proposal],
      view.assembly,
      limits,
    )) {
      expect(e.kind === "rejected" ? e.code : undefined).toBeUndefined();
      if (e.kind === "checked") checked++;
    }
    expect(checked).toBe(prefix.length + 1);
  },
  200000,
);
test("triple projection contains all four exclusions beyond complete pair fixed point", () => {
  const f = fixtures.find((f) => f.id === "C33-triple")!,
    proposal = compile(f);
  const triple = independentTemplates(f as unknown as TechniqueFixture);
  const pairClosure = independentTemplates({
    ...f,
    expectedPattern: { ...f.expectedPattern, mode: "incompatibility" },
  } as unknown as TechniqueFixture);
  expect(proposal.effects).toEqual(triple.effects);
  expect(triple.effects).toEqual(expect.arrayContaining(pairClosure.effects));
  const beyond = triple.effects.filter(
    (effect) =>
      !pairClosure.effects.some(
        (other) => other.cell === effect.cell && other.symbol === effect.symbol,
      ),
  );
  expect(beyond).toEqual(
    (f.independentEnumeration as any).newBeyondPairClosure
      .map((effect: { cell: number; symbol: number }) => ({
        kind: "remove",
        ...effect,
      }))
      .sort(
        (
          a: { cell: number; symbol: number },
          b: { cell: number; symbol: number },
        ) => a.cell - b.cell || a.symbol - b.symbol,
      ),
  );
  expect(beyond).toHaveLength(4);
});
test.each(fixtures)(
  "$id rejects omitted lists, unsupported mode substitutions and mixed effect roots",
  (f) => {
    const source = compile(f);
    for (const mutate of [
      (p: any) => {
        certificateData(p).templates[0][0].pop();
      },
      (p: any) => {
        certificateData(p).templates[0][0][0]++;
      },
      (p: any) => {
        certificateData(p).supported[0][0].pop();
      },
      (p: any) => {
        certificateData(p).tupleTests++;
      },
      (p: any) => {
        p.pattern.mode = p.pattern.mode === "single" ? "pair" : "single";
      },
      (p: any) => {
        p.pattern.alias = "Unknown template alias";
      },
      (p: any) => {
        const pack = p.proof.nodes[0];
        pack.premises[0] = pack.premises[1];
        pack.conclusion.terms[0] = pack.conclusion.terms[1];
      },
      (p: any) => {
        const root = p.proof.nodes.find(
          (n: any) =>
            p.proof.roots.includes(n.id) && n.conclusion.kind === "literal",
        );
        const next = p.proof.nodes.at(-1).id + 1;
        p.proof.nodes.push({
          id: next,
          rule: "conjunction@1",
          premises: [root.id],
          parameters: {},
          scope: [],
          conclusion: { kind: "and", terms: [root.conclusion] },
        });
        p.proof.nodes.push({
          id: next + 1,
          rule: "conjunction@1",
          premises: [next],
          parameters: { index: 0 },
          scope: [],
          conclusion: root.conclusion,
        });
        p.proof.roots.push(next + 1);
      },
    ]) {
      const bad = structuredClone(source);
      mutate(bad);
      expect(checked(f, bad)?.kind).toBe("rejected");
    }
  },
  200000,
);
test("unfinished second incompatibility round and unfinished triple crossproduct reject", () => {
  for (const id of ["C33-incompatibility", "C33-triple"]) {
    const f = fixtures.find((f) => f.id === id)!,
      bad = structuredClone(compile(f)),
      data = certificateData(bad);
    if (id.endsWith("incompatibility")) {
      data.rounds.pop();
      data.supported[2] = data.templates[2];
    } else {
      data.tupleTests = 199;
      data.supported[0] = data.templates[0];
    }
    expect(checked(f, bad)?.kind).toBe("rejected");
  }
});
test("missing operation context is a configuration error before allocation", () => {
  const view = fixtureView(fixtures[0] as unknown as TechniqueFixture),
    context = discoveryContext();
  const descriptor = getTechniques("classic-expanded@1").find(
    (d) => d.id === "c33@1",
  )!;
  expect(descriptor.eligible(view)).toEqual({ kind: "yes" });
  expect(() => descriptor.discover(view, context).next()).toThrow(
    "missing-template-operation-context",
  );
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
});
test.each([
  "stepNodes",
  "stepBytes",
  "proofBytes",
  "workspaceBytes",
  "workUnits",
  "timeMs",
] as const)(
  "compiler %s overflow releases resources without returning effects",
  (field) => {
    const f = fixtures[0],
      view = fixtureView(f as unknown as TechniqueFixture),
      context = {
        ...discoveryContext(),
        templates: new TemplateOperationContext(view),
      };
    context.limits[field] = 0;
    expect(() => [
      ...compileTemplates(view, f.expectedPattern as TemplatePlan, context),
    ]).toThrow();
    expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  },
);
test("tuple overflow and restarts never publish an unfinished product", () => {
  const f = fixtures.find((f) => f.id === "C33-pair")!,
    view = fixtureView(f as unknown as TechniqueFixture),
    context = {
      ...discoveryContext(),
      templates: new TemplateOperationContext(view),
    };
  for (let i = 0; i < 99999; i++) context.templates.consumeTuple(view);
  for (let restart = 0; restart < 2; restart++) {
    expect(() => [
      ...compileTemplates(view, f.expectedPattern as TemplatePlan, context),
    ]).toThrow("template-tuple-limit");
    expect(context.templates.tupleTests).toBe(100000);
    expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  }
});
test("work limit at the completed index transition still disposes the transferred lease", () => {
  const f = fixtures[0],
    view = fixtureView(f as unknown as TechniqueFixture),
    ws = workspace();
  let indexWork = 0;
  for (const e of buildTemplates(view, 1, ws)) {
    if (e.kind === "work") indexWork += e.units;
    if (e.kind === "ready") e.value.dispose();
  }
  const context = {
    ...discoveryContext(),
    templates: new TemplateOperationContext(view),
  };
  context.limits.workUnits = view.facts.size + indexWork;
  expect(() => [
    ...compileTemplates(view, f.expectedPattern as TemplatePlan, context),
  ]).toThrow("work-limit");
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
});

function admitted(view: ReadView, proposal: DeductionProposal) {
  let terminal;
  for (const e of checkProposal(proposal, {
    view,
    retained: retainedProof(view),
    limits,
    policy: "unconditional",
    uniqueEvidenceId: null,
  }))
    if (e.kind !== "work") terminal = e;
  expect(terminal?.kind, JSON.stringify(terminal)).toBe("checked");
  if (terminal?.kind !== "checked") throw Error("not-checked");
  return terminal.step;
}
function single(view: ReadView, at = 0) {
  const proposals = [
    ...getTechniques("classic-expanded@1")
      .find((d) => d.id === "c01@1")!
      .discover(view, discoveryContext()),
  ].flatMap((e) => (e.kind === "proposal" ? [e.proposal] : []));
  expect(proposals.length).toBeGreaterThan(at);
  const step = admitted(view, proposals[at]);
  return { step, view: commitChecked(view, step).view };
}
test("advance accepts only a charged true descendant and rejects same-assembly sibling replenishment", () => {
  const root = fixtureView(fixtures[0] as unknown as TechniqueFixture),
    a = single(root, 0),
    sibling = single(root, 1),
    b = single(sibling.view, 0);
  expect(a.view.assembly).toBe(b.view.assembly);
  expect(b.view.state.key.revision).toBeGreaterThan(a.view.state.key.revision);
  const op = new TemplateOperationContext(root);
  op.consumeTuple(root);
  let work = 0;
  op.advance(a.view, (n) => (work += n));
  expect(work).toBe(1);
  expect(op.tupleTests).toBe(0);
  op.consumeTuple(a.view);
  expect(() => op.advance(b.view, () => {})).toThrow("template-state-mismatch");
  expect(op.tupleTests).toBe(1);
  expect(() => op.advance(root, () => {})).toThrow("template-state-mismatch");
  op.advance(rebuildOwnedIndexes(a.view), () => {});
  expect(op.tupleTests).toBe(1);
  expect(() =>
    op.advance(single(a.view).view, () => {
      throw Error("cancelled-lineage");
    }),
  ).toThrow("cancelled-lineage");
  expect(op.tupleTests).toBe(1);
  expect(isAcceptedDescendant(root, b.view, () => {})).toBe(true);
});
test("unplaced singletons stay in mask abstraction; applied placements require authentic anchors", () => {
  const f = fixtures[0],
    root = fixtureView(f as unknown as TechniqueFixture),
    placed = single(root, 1);
  const effect = placed.step.proposal.effects.find((e) => e.kind === "place")!;
  expect(root.state.values[effect.cell]).toBe(0);
  expect(root.state.domains[effect.cell]).toBe(2 ** (effect.symbol - 1));
  let before: TemplateIndex | undefined, after: TemplateIndex | undefined;
  const ws = workspace();
  for (const e of buildTemplates(root, effect.symbol, ws))
    if (e.kind === "ready") before = e.value;
  for (const e of buildTemplates(placed.view, effect.symbol, ws))
    if (e.kind === "ready") after = e.value;
  const contains = (code: number) =>
    Math.floor(code / 9 ** (8 - Math.floor(effect.cell / 9))) % 9 ===
    effect.cell % 9;
  expect(before!.codes.some((code) => !contains(code))).toBe(true);
  expect(after!.codes.every(contains)).toBe(true);
  before!.dispose();
  after!.dispose();
  expect(ws.usage).toEqual({ entries: 0, bytes: 0 });
  const context = {
    ...discoveryContext(),
    limits,
    templates: new TemplateOperationContext(placed.view),
  };
  const cursor = compileTemplates(
    placed.view,
    { mode: "single", symbols: [1] },
    context,
  );
  let proposal: DeductionProposal | null = null;
  for (;;) {
    const n = cursor.next();
    if (n.done) {
      proposal = n.value;
      break;
    }
  }
  expect(proposal).not.toBeNull();
  admitted(placed.view, proposal!);
  const positive = placed.step.proposal.proof.roots.find((id) => {
    const n = retainedProof(placed.view).get(id);
    return n?.conclusion.kind === "literal" && n.conclusion.value.positive;
  })!;
  expect(proposal!.proof.imports).toContain(positive);
  expect(retainedProof(placed.view).get(positive)!.rule).not.toBe("given@1");
  const bad = structuredClone(proposal!) as any,
    certificate = bad.proof.nodes.find(
      (n: any) => n.rule === "template-cover@1",
    );
  const anchorPacks = certificate.premises
    .slice(5)
    .map((id: number) => bad.proof.nodes.find((n: any) => n.id === id));
  const pack = anchorPacks.find((p: any) => p.premises.includes(positive));
  const i = pack.premises.indexOf(positive);
  pack.premises.splice(i, 1);
  pack.conclusion.terms.splice(i, 1);
  let terminal;
  for (const e of checkProposal(bad, {
    view: placed.view,
    retained: retainedProof(placed.view),
    limits,
    policy: "unconditional",
    uniqueEvidenceId: null,
  }))
    if (e.kind !== "work") terminal = e;
  expect(terminal?.kind).toBe("rejected");
  let count = 0;
  const prefix = originalCluePrefix(f as unknown as TechniqueFixture);
  for (const e of replay(
    { problem: root.assembly.problem } as SolverSnapshot,
    [...prefix, placed.step.proposal, proposal!],
    root.assembly,
    limits,
  )) {
    expect(e.kind === "rejected" ? e.code : undefined).toBeUndefined();
    if (e.kind === "checked") count++;
  }
  expect(count).toBe(prefix.length + 2);
}, 200000);
test("original anchor omission and forged replacement never authorize template effects", () => {
  const f = fixtures[0],
    source = compile(f);
  for (const mode of ["omit", "forge"]) {
    const bad = structuredClone(source) as any,
      certificate = bad.proof.nodes.find(
        (n: any) => n.rule === "template-cover@1",
      );
    const pack = bad.proof.nodes.find(
      (n: any) => n.id === certificate.premises[5],
    );
    if (mode === "omit") {
      pack.premises.pop();
      pack.conclusion.terms.pop();
    } else {
      pack.conclusion.terms[0].value.symbol =
        (pack.conclusion.terms[0].value.symbol % 9) + 1;
    }
    expect(checked(f, bad)?.kind).toBe("rejected");
  }
});
test("discovery releases all leases before its terminal interruption is observed", () => {
  const view = fixtureView(fixtures[0] as unknown as TechniqueFixture),
    context = {
      ...discoveryContext(),
      templates: new TemplateOperationContext(view),
    };
  context.limits.workUnits = 10;
  const cursor = getTechniques("classic-expanded@1")
    .find((d) => d.id === "c33@1")!
    .discover(view, context);
  let terminal;
  for (;;) {
    const e = cursor.next();
    if (e.done) break;
    if (e.value.kind !== "work") {
      terminal = e.value;
      break;
    }
  }
  expect(terminal?.kind).toBe("interrupted");
  try {
    expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  } finally {
    cursor.return();
  }
});
test("same-revision proof-prefix extension preserves tuple budget", () => {
  const view = fixtureView(fixtures[0] as unknown as TechniqueFixture),
    op = new TemplateOperationContext(view);
  op.consumeTuple(view);
  const cell = 10,
    symbol = 7;
  let id = 0;
  for (const n of retainedProof(view).keys()) id = Math.max(id, n + 1);
  const proposal: DeductionProposal = {
    technique: "c01@1",
    state: view.state.key,
    effects: [],
    pattern: {
      kind: "single",
      alias: "Naked Single",
      cell,
      symbol,
      house: null,
    },
    proof: {
      state: view.state.key,
      imports: [view.state.domainFacts[cell]],
      roots: [id],
      nodes: [
        {
          id,
          rule: "cover-clause@1",
          premises: [view.state.domainFacts[cell]],
          parameters: {},
          scope: [],
          conclusion: {
            kind: "literal",
            value: { cell, symbol, positive: true },
          },
        },
      ],
    },
  };
  const cached = retainCheckedFacts(view, admitted(view, proposal));
  expect(cached.state.key.revision).toBe(view.state.key.revision);
  let charged = 0;
  op.advance(cached, (n) => (charged += n));
  expect(charged).toBe(1);
  expect(op.tupleTests).toBe(1);
  op.consumeTuple(cached);
  expect(op.tupleTests).toBe(2);
});
test.each(fixtures)(
  "$id mode boundary and every configured proof/check limit remain enforced",
  (f) => {
    const source = compile(f),
      view = fixtureView(f as unknown as TechniqueFixture);
    const bad = structuredClone(source) as any;
    certificateData(bad).symbols = [...f.expectedPattern.symbols, 10];
    expect(checked(f, bad)?.kind).toBe("rejected");
    for (const field of [
      "stepNodes",
      "stepBytes",
      "workspaceBytes",
      "workUnits",
      "timeMs",
    ] as const) {
      let terminal;
      for (const e of checkProposal(source, {
        view,
        retained: retainedProof(view),
        limits: { ...limits, [field]: 0 },
        policy: "unconditional",
        uniqueEvidenceId: null,
      }))
        if (e.kind !== "work") terminal = e;
      expect(terminal?.kind).toBe("rejected");
    }
  },
);
test("read-only C33 verified-status projection has real evidence for every alias", () => {
  const entry = coverageEntries.find((e) => e.id === "C33")!;
  expect(entry.status).toBe("implemented");
  expect(
    validateCoverage(
      coverageEntries.map((e) =>
        e.id === "C33"
          ? { ...e, status: "independently-verified" as const }
          : e,
      ),
    ),
  ).toEqual([]);
  for (const evidence of entry.evidence) {
    expect(
      fixtures.some(
        (f) => f.id === evidence.fixtureId && f.alias === evidence.alias,
      ),
    ).toBe(true);
    expect(
      existsSync(new URL(`../../../../${evidence.record}`, import.meta.url)),
    ).toBe(true);
  }
  expect(
    getTechniques("classic-expanded@1").find((d) => d.id === "c33@1")!.bounds
      .templates,
  ).toEqual({
    maxTemplatesPerSymbol: 46656,
    maxOverlaySymbols: 3,
    maxIncompatibilitySymbols: 9,
    maxTupleTestsPerRevision: 100000,
  });
});
test("complete 7776-template relation honestly interrupts its overlarge 16KiB wire certificate", () => {
  const givens = "000456789567000234" + "0".repeat(63),
    values = [...givens].map(Number);
  const peer = (a: number, b: number) =>
    Math.floor(a / 9) === Math.floor(b / 9) ||
    a % 9 === b % 9 ||
    (Math.floor(a / 27) === Math.floor(b / 27) &&
      Math.floor((a % 9) / 3) === Math.floor((b % 9) / 3));
  const domains = values.map((v, c) =>
    v
      ? 2 ** (v - 1)
      : [1, 2, 3, 4, 5, 6, 7, 8, 9]
          .filter((s) => !values.some((n, d) => n === s && peer(c, d)))
          .reduce((m, s) => m + 2 ** (s - 1), 0),
  );
  const f: TechniqueFixture = {
    id: "C33-wire-boundary",
    rowId: "C33",
    grammar: "c33-grammar@1",
    alias: "Per-digit templates",
    givens,
    preState: { values, domains },
    expectedPattern: { mode: "single", symbols: [1] },
    expectedEffects: [],
    expectation: "productive",
    reachability: "original-clue-path",
  };
  const view = fixtureView(f),
    context = {
      ...discoveryContext(),
      limits,
      templates: new TemplateOperationContext(view),
    };
  let index: TemplateIndex | undefined;
  for (const e of buildTemplates(view, 1, context.workspace))
    if (e.kind === "ready") index = e.value;
  // Fixed distinct boxes for the first two rows retain one sixth of geometry.
  expect(index!.codes).toHaveLength(46656 / 6);
  index!.dispose();
  expect(independentTemplates(f).lists[0]).toHaveLength(7776);
  expect(independentTemplates(f).effects.length).toBeGreaterThan(0);
  expect(() => [
    ...compileTemplates(view, { mode: "single", symbols: [1] }, context),
  ]).toThrow("proof-step-limit");
  expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  expect(oracle({ givens: values, limit: 1, maxNodes: 1000000 })).toMatchObject(
    { interrupted: false, witnesses: [expect.any(Array)] },
  );
});

// These are primitive-level metadata inputs, not checked retained-node authority.
// A real uniqueness-derived placement lifecycle is a T18/T25 acceptance gate.
test.each([
  { name: "closed", open: [] },
  { name: "open", open: [987654] },
])(
  "template anchor packs preserve conditional metadata and $name scopes",
  ({ open }) => {
    const f = fixtures[0] as unknown as TechniqueFixture;
    const view = fixtureView(f),
      proposal = independentTemplateCertificate(f);
    const retained = new Map(retainedProof(view));
    const inferences = new Map<number, CheckedInference>();
    for (const fact of view.facts.values())
      inferences.set(fact.root, {
        conclusion: fact.proposition,
        conditional: false,
        openAssumptions: [],
        rules: fact.rules,
      });
    const anchor = [...view.facts.values()].find(
      (fact) =>
        fact.proposition.kind === "literal" && fact.proposition.value.positive,
    )!;
    inferences.set(anchor.root, {
      conclusion: anchor.proposition,
      conditional: true,
      openAssumptions: open,
      rules: ["test:conditional-anchor"],
    });
    const registry = new PrimitiveRegistry();
    let template: ProofNode | undefined;
    for (const node of proposal.proof.nodes) {
      const context = {
        view,
        retained,
        premiseInferences: inferences,
        limits,
        policy: "unique-only" as const,
        uniqueEvidenceId: "primitive-metadata-only",
        workspaceRemaining: limits.workspaceBytes,
        currentNode: node,
      };
      const cursor = registry.checkSteps(node, context);
      let inferred: CheckedInference;
      for (;;) {
        const event = cursor.next();
        if (event.done) {
          inferred = event.value;
          break;
        }
      }
      retained.set(node.id, node);
      inferences.set(node.id, inferred);
      if (node.premises.includes(anchor.root)) {
        expect(inferred).toMatchObject({
          conditional: true,
          openAssumptions: open,
        });
        expect(inferred.rules).toContain("test:conditional-anchor");
      }
      if (node.rule === "template-cover@1") {
        template = node;
        expect(inferred).toMatchObject({
          conditional: true,
          openAssumptions: open,
        });
        expect(inferred.rules).toContain("test:conditional-anchor");
      }
      if (template && node.premises.includes(template.id)) {
        expect(inferred).toMatchObject({
          conditional: true,
          openAssumptions: open,
        });
        expect(inferred.rules).toContain("test:conditional-anchor");
        if (open.length)
          expect(() => checkScope(node, context)).toThrow("escaped-assumption");
      }
    }
    expect(template).toBeDefined();
  },
  20000,
);

test("authentic additional compatible rule assembly compiles and replays C33", () => {
  const f = fixtures[0];
  const { key: _key, ...classic } = normalizeClassic({
    kind: "classic",
    version: 1,
    width: 9,
    height: 9,
    givens: [...f.givens].map(Number),
  });
  const cells = classic.givens
    .flatMap((symbol, cell) => (symbol ? [cell] : []))
    .slice(0, 2);
  const result = assemble(
    canonicalProblem({
      ...classic,
      constraints: [
        ...classic.constraints,
        {
          id: "extra:given-sum",
          type: "sum@1",
          cells,
          parameters: {
            total: cells.reduce((sum, cell) => sum + classic.givens[cell], 0),
          },
        },
      ],
    }),
    mockRuleRegistry,
  );
  if (!result.ok) throw Error(JSON.stringify(result.issues));
  let view = initialize(result.value, "primary");
  const prefix: DeductionProposal[] = [];
  for (const rule of view.assembly.problem.constraints) {
    for (const event of view.assembly.modules
      .get(rule.id)!
      .propagate(view, rule)) {
      if (event.kind !== "proposal") continue;
      const step = admitted(view, event.proposal);
      prefix.push(step.proposal);
      view = commitChecked(view, step).view;
    }
  }
  expect(
    view.assembly.relations.some((relation) =>
      relation.id.startsWith("extra:given-sum"),
    ),
  ).toBe(true);
  expect(view.state.domains).toEqual(f.preState.domains);
  expect(
    getTechniques("classic-expanded@1")
      .find((d) => d.id === "c33@1")!
      .eligible(view),
  ).toEqual({ kind: "yes" });
  const proposal = compileOwned(view, f.expectedPattern as TemplatePlan);
  expect(proposal.effects).toEqual(compile(f).effects);
  admitted(view, proposal);
  let checkedCount = 0;
  for (const event of replay(
    { problem: result.value.problem } as SolverSnapshot,
    [...prefix, proposal],
    result.value,
    limits,
  )) {
    expect(event.kind === "rejected" ? event.code : undefined).toBeUndefined();
    if (event.kind === "checked") checkedCount++;
  }
  expect(checkedCount).toBe(prefix.length + 1);
}, 30000);

test.each(["missing", "familiar-id-wrong-cells"])(
  "actual %s classic geometry is excluded before enumeration",
  (mode) => {
    const { key: _key, ...classic } = normalizeClassic({
      kind: "classic",
      version: 1,
      width: 9,
      height: 9,
      givens: Array(81).fill(0),
    });
    const constraints =
      mode === "missing"
        ? classic.constraints.filter((rule) => rule.id !== "row:0")
        : classic.constraints.map((rule) =>
            rule.id === "row:0"
              ? { ...rule, cells: [0, 1, 2, 3, 4, 5, 6, 7, 9] }
              : rule,
          );
    const result = assemble(canonicalProblem({ ...classic, constraints }), [
      new AllDifferentRule(),
    ]);
    if (!result.ok) throw Error(JSON.stringify(result.issues));
    const view = initialize(result.value, "primary");
    if (mode !== "missing")
      expect(
        view.assembly.problem.constraints.some((rule) => rule.id === "row:0"),
      ).toBe(true);
    expect(
      getTechniques("classic-expanded@1")
        .find((d) => d.id === "c33@1")!
        .eligible(view),
    ).toMatchObject({ kind: "excluded", reason: "missing-template-geometry" });
    const context = {
      ...discoveryContext(),
      limits,
      templates: new TemplateOperationContext(view),
    };
    expect(() => [
      ...compileTemplates(view, { mode: "single", symbols: [1] }, context),
    ]).toThrow("missing-template-geometry");
    expect(context.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  },
);

const wireMutations: { name: string; code: string; mutate(data: any): void }[] =
  [
    {
      name: "empty chunk",
      code: "invalid-template-chunks",
      mutate: (d) => {
        d.templates[0] = [[]];
      },
    },
    {
      name: "short nonfinal chunk",
      code: "invalid-template-chunks",
      mutate: (d) => {
        const list = d.templates[0][0];
        d.templates[0] = [list.slice(0, 1), list.slice(1)];
      },
    },
    {
      name: "too many chunks",
      code: "invalid-template-chunks",
      mutate: (d) => {
        d.templates[0] = Array.from({ length: 47 }, () => [0]);
      },
    },
    {
      name: "1025-code chunk",
      code: "invalid-template-chunks",
      mutate: (d) => {
        d.templates[0] = [Array.from({ length: 1025 }, (_, i) => i)];
      },
    },
    {
      name: "duplicate across chunk boundary",
      code: "invalid-template-code-order",
      mutate: (d) => {
        d.templates[0] = [Array.from({ length: 1024 }, (_, i) => i), [1023]];
      },
    },
    {
      name: "missing symbol list",
      code: "invalid-template-lists",
      mutate: (d) => {
        d.templates.pop();
      },
    },
    {
      name: "extra supported symbol list",
      code: "invalid-template-lists",
      mutate: (d) => {
        d.supported.push([]);
      },
    },
    {
      name: "negative code",
      code: "invalid-template-code-order",
      mutate: (d) => {
        d.templates[0][0][0] = -1;
      },
    },
    {
      name: "duplicate supported code",
      code: "invalid-template-code-order",
      mutate: (d) => {
        d.supported[0][0][1] = d.supported[0][0][0];
      },
    },
    {
      name: "decode overflow",
      code: "invalid-template-code-order",
      mutate: (d) => {
        d.templates[0][0][0] = 9 ** 9;
      },
    },
    {
      name: "duplicate code",
      code: "invalid-template-code-order",
      mutate: (d) => {
        d.templates[0][0][1] = d.templates[0][0][0];
      },
    },
    {
      name: "reverse order",
      code: "invalid-template-code-order",
      mutate: (d) => {
        d.templates[0][0].reverse();
      },
    },
    {
      name: "decoded repeated column",
      code: "incomplete-template-list",
      mutate: (d) => {
        d.templates[0][0][0] = 0;
      },
    },
    {
      name: "missing legal template",
      code: "incomplete-template-list",
      mutate: (d) => {
        d.templates[0][0].pop();
      },
    },
    {
      name: "extra in-range template",
      code: "incomplete-template-list",
      mutate: (d) => {
        d.templates[0][0].push(9 ** 9 - 1);
      },
    },
    {
      name: "unsupported list count",
      code: "incomplete-template-overlay",
      mutate: (d) => {
        d.supported[0][0].pop();
      },
    },
    {
      name: "negative tuple count",
      code: "invalid-template-lists",
      mutate: (d) => {
        d.tupleTests = -1;
      },
    },
  ];
test.each(wireMutations)(
  "canonical wire rejects $name at $code below ordinary caps",
  ({ mutate, code }) => {
    const bad = structuredClone(
      independentTemplateCertificate(
        fixtures[0] as unknown as TechniqueFixture,
      ),
    );
    mutate(certificateData(bad));
    expect(
      Math.max(
        ...bad.proof.nodes.map(
          (node) => new TextEncoder().encode(JSON.stringify(node)).length,
        ),
      ),
    ).toBeLessThan(16384);
    expect(checked(fixtures[0], bad)).toEqual({ kind: "rejected", code });
  },
);

// Insert authentic conjunction aliases without duplicate ordinary premises;
// renumber only the new bundle so ordinary DAG admission reaches C33 sources.
function renumberTemplateBundle(proposal: any): void {
  const start = Math.min(
    ...proposal.proof.nodes.map((node: ProofNode) => node.id),
  );
  const ids = new Map<number, number>(
    proposal.proof.nodes.map((node: ProofNode, i: number) => [
      node.id,
      start + i,
    ]),
  );
  for (const node of proposal.proof.nodes) {
    node.id = ids.get(node.id)!;
    node.premises = node.premises.map((id: number) => ids.get(id) ?? id);
  }
  proposal.proof.roots = proposal.proof.roots.map(
    (id: number) => ids.get(id) ?? id,
  );
}
const sourceMutations = [
  {
    name: "missing domain",
    pack: 0,
    action: "missing",
    code: "invalid-template-source-pack",
  },
  {
    name: "extra domain",
    pack: 0,
    action: "extra",
    code: "invalid-template-source-pack",
  },
  {
    name: "missing house",
    pack: 3,
    action: "missing",
    code: "invalid-template-source-pack",
  },
  {
    name: "extra house",
    pack: 3,
    action: "extra",
    code: "invalid-template-source-pack",
  },
  {
    name: "missing row cover",
    pack: 4,
    action: "missing",
    code: "invalid-template-source-pack",
  },
  {
    name: "extra row cover",
    pack: 4,
    action: "extra",
    code: "invalid-template-source-pack",
  },
  {
    name: "missing anchor",
    pack: 5,
    action: "missing",
    code: "invalid-template-source-pack",
  },
  {
    name: "extra anchor",
    pack: 5,
    action: "extra",
    code: "invalid-template-source-pack",
  },
  {
    name: "duplicate domain",
    pack: 0,
    action: "duplicate",
    code: "invalid-template-domain",
  },
  {
    name: "duplicate house",
    pack: 3,
    action: "duplicate",
    code: "invalid-template-house",
  },
  {
    name: "duplicate row cover",
    pack: 4,
    action: "duplicate",
    code: "invalid-template-cover",
  },
  {
    name: "duplicate anchor",
    pack: 5,
    action: "duplicate",
    code: "invalid-template-anchor",
  },
  {
    name: "nested domain",
    pack: 0,
    action: "nested",
    code: "nested-template-source-pack",
  },
  {
    name: "nested house",
    pack: 3,
    action: "nested",
    code: "nested-template-source-pack",
  },
  {
    name: "nested cover",
    pack: 4,
    action: "nested",
    code: "nested-template-source-pack",
  },
  {
    name: "nested anchor",
    pack: 5,
    action: "nested",
    code: "nested-template-source-pack",
  },
];
test.each(sourceMutations)(
  "ordinary-valid $name substitution reaches $code",
  ({ pack: packIndex, action, code }) => {
    const f = fixtures[0] as unknown as TechniqueFixture;
    const bad = structuredClone(independentTemplateCertificate(f)) as any;
    const certificate = bad.proof.nodes.find(
      (node: ProofNode) => node.rule === "template-cover@1",
    );
    const pack = bad.proof.nodes.find(
      (node: ProofNode) => node.id === certificate.premises[packIndex],
    );
    if (action === "missing") {
      pack.premises.pop();
      pack.conclusion.terms.pop();
    } else if (action === "extra") {
      const otherPacks = bad.proof.nodes.filter((node: ProofNode) =>
        certificate.premises.includes(node.id),
      );
      const extra = otherPacks
        .flatMap((other: any) =>
          other.premises.map((id: number, i: number) => ({
            id,
            claim: other.conclusion.terms[i],
          })),
        )
        .find((source: { id: number }) => !pack.premises.includes(source.id));
      expect(extra).toBeDefined();
      pack.premises.push(extra.id);
      pack.conclusion.terms.push(extra.claim);
    } else {
      const selected = action === "duplicate" ? 1 : 0;
      const next =
        Math.max(...bad.proof.nodes.map((node: ProofNode) => node.id)) + 1;
      const inner: ProofNode = {
        id: next,
        rule: "conjunction@1",
        premises: [pack.premises[selected]],
        parameters: {},
        scope: [],
        conclusion: { kind: "and", terms: [pack.conclusion.terms[selected]] },
      };
      const inserted = [inner];
      if (action === "duplicate")
        inserted.push({
          id: next + 1,
          rule: "conjunction@1",
          premises: [next],
          parameters: { index: 0 },
          scope: [],
          conclusion: pack.conclusion.terms[selected],
        });
      bad.proof.nodes.splice(bad.proof.nodes.indexOf(pack), 0, ...inserted);
      pack.premises[0] = inserted.at(-1)!.id;
      pack.conclusion.terms[0] = inserted.at(-1)!.conclusion;
      renumberTemplateBundle(bad);
    }
    expect(checked(fixtures[0], bad)).toEqual({ kind: "rejected", code });
  },
);
