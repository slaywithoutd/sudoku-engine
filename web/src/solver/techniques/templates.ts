import type { ReadView, Proposition } from "../state/types";
import type { DiscoveryContext, Discovery, TechniqueDescriptor } from "./types";
import type { DeductionProposal, Effect } from "../proof/types";
import {
  buildTemplates,
  TemplateIndex,
  TemplateLimit,
  templateCells,
} from "../indexes/templates";
import {
  IndexInterrupted,
  type WorkspaceReservation,
  work,
} from "../indexes/workspace";
import { assertOwnedView, retainedProof } from "../state/candidates";
import { ForcingProof } from "./forcing-proof";
import { coverageEntries } from "./manifest";
import { sameValue, domainAssertion } from "../proof/primitives";

export interface TemplatePlan {
  readonly mode: "single" | "pair" | "triple" | "incompatibility";
  readonly symbols: readonly number[];
  readonly alias?:
    | "Per-digit templates"
    | "Pattern overlay"
    | "POM"
    | "Template incompatibility";
}
type Work = { kind: "work"; units: number };
class TemplateInterrupted extends Error {
  constructor(
    readonly reason: "proof-step-limit" | "work-limit" | "time-limit",
  ) {
    super(reason);
  }
}
/** Invocation work is distinct from the operation's persistent overlay quota. */
class TemplateWork {
  #used = 0;
  readonly #start = performance.now();
  constructor(readonly context: DiscoveryContext) {}
  charge(units = 1): void {
    this.context.workspace.checkpoint();
    if (this.#used + units > this.context.limits.workUnits)
      throw new TemplateInterrupted("work-limit");
    if (performance.now() - this.#start >= this.context.limits.timeMs)
      throw new TemplateInterrupted("time-limit");
    this.#used += units;
  }
}
function operation(view: ReadView, context: DiscoveryContext) {
  // Configuration errors precede any allocation/work and cannot mean excluded.
  if (!context.templates) throw Error("missing-template-operation-context");
  context.templates.assertRevision(view);
  return context.templates;
}
function geometry(kind: number, n: number): number[] {
  const cells: number[] = [];
  for (let c = 0; c < 81; c++)
    if (
      (kind === 0
        ? Math.floor(c / 9)
        : kind === 1
          ? c % 9
          : Math.floor(c / 27) * 3 + Math.floor((c % 9) / 3)) === n
    )
      cells.push(c);
  return cells;
}
function sourceKey(p: Proposition): string | undefined {
  if (p.kind === "all-different" && p.cells.length === 9)
    return `a:${p.cells.join(",")}`;
  if (p.kind === "cover" && p.cells.length === 9)
    return `c:${p.symbol}:${p.cells.join(",")}`;
  return undefined;
}
function planValid(p: TemplatePlan): boolean {
  const aliases =
    p.mode === "single"
      ? ["Per-digit templates"]
      : p.mode === "incompatibility"
        ? ["Template incompatibility"]
        : ["Pattern overlay", "POM"];
  return (
    (p.alias === undefined || aliases.includes(p.alias)) &&
    Array.isArray(p.symbols) &&
    p.symbols.length >= 1 &&
    p.symbols.length <= (p.mode === "incompatibility" ? 9 : 3) &&
    p.symbols.every(
      (s, i) =>
        Number.isInteger(s) && s >= 1 && s <= 9 && (!i || s > p.symbols[i - 1]),
    ) &&
    (p.mode === "single"
      ? p.symbols.length === 1
      : p.mode === "pair"
        ? p.symbols.length === 2
        : p.mode === "triple"
          ? p.symbols.length === 3
          : p.mode === "incompatibility" && p.symbols.length >= 2)
  );
}
const chunk = (codes: readonly number[]) => {
  const result: number[][] = [];
  for (let i = 0; i < codes.length; i += 1024)
    result.push(codes.slice(i, i + 1024));
  return result;
};
const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).length;

/**
 * Complete single/pair/triple projection or synchronous pairwise fixed point.
 * Every actual pair/full-triple test consumes the shared revision quota.
 * Constant product cursors never retain a cross-product or compatibility map.
 */
function* overlay(
  view: ReadView,
  plan: TemplatePlan,
  indexes: readonly TemplateIndex[],
  context: DiscoveryContext,
  lease: WorkspaceReservation,
): Generator<
  Work,
  {
    supported: number[][];
    rounds: number[][];
    tupleTests: number;
    effects: Effect[];
  }
> {
  const op = operation(view, context);
  let tupleTests = 0;
  const total = indexes.reduce((n, index) => n + index.codes.length, 0);
  lease.grow(0, 65536 + total * 512);
  const rows: number[][][] = [],
    codes = indexes.map((index) => index.codes);
  let active: number[][] = [];
  for (const index of indexes) {
    const list: number[][] = [],
      members: number[] = [];
    rows.push(list);
    active.push(members);
    for (const code of index.codes) {
      yield* work(context.workspace);
      members.push(list.length);
      list.push(templateCells(code));
    }
  }
  const rounds: number[][] = [];
  const compatible = (a: readonly number[], b: readonly number[]) =>
    !a.some((c, r) => c === b[r]);
  if (plan.mode === "pair" || plan.mode === "triple") {
    const seen = rows.map((list) => list.map(() => false));
    for (const a of active[0])
      for (const b of active[1])
        for (
          let c = 0;
          c < (plan.mode === "triple" ? rows[2].length : 1);
          c++
        ) {
          op.consumeTuple(view);
          tupleTests++;
          yield* work(context.workspace);
          if (
            compatible(rows[0][a], rows[1][b]) &&
            (plan.mode !== "triple" ||
              (compatible(rows[0][a], rows[2][c]) &&
                compatible(rows[1][b], rows[2][c])))
          ) {
            seen[0][a] = seen[1][b] = true;
            if (plan.mode === "triple") seen[2][c] = true;
          }
        }
    active = active.map((list, s) => list.filter((i) => seen[s][i]));
  } else if (plan.mode === "incompatibility") {
    for (;;) {
      const next = active.map(() => [] as number[]);
      for (let s = 0; s < active.length; s++)
        for (const i of active[s]) {
          yield* work(context.workspace);
          let keep = true;
          for (let t = 0; t < active.length; t++)
            if (t !== s) {
              let partner = false;
              for (const j of active[t]) {
                op.consumeTuple(view);
                tupleTests++;
                yield* work(context.workspace);
                if (compatible(rows[s][i], rows[t][j])) {
                  partner = true;
                  break;
                }
              }
              if (!partner) {
                keep = false;
                break;
              }
            }
          if (keep) next[s].push(i);
        }
      const removed = active.map((list, s) => list.length - next[s].length);
      active = next;
      if (removed.every((n) => !n)) break;
      lease.grow(0, 128);
      rounds.push(removed);
    }
  }
  const occurs = rows.map(() => Array<boolean>(81).fill(false));
  for (let s = 0; s < active.length; s++)
    for (const i of active[s]) {
      yield* work(context.workspace);
      for (const c of rows[s][i]) occurs[s][c] = true;
    }
  const effects: Effect[] = [];
  for (let cell = 0; cell < 81; cell++)
    for (let s = 0; s < plan.symbols.length; s++) {
      yield* work(context.workspace);
      const symbol = plan.symbols[s],
        bit = 1 << (symbol - 1);
      if (
        !view.state.values[cell] &&
        view.state.domains[cell] & bit &&
        !occurs[s][cell]
      )
        effects.push({ kind: "remove", cell, symbol });
    }
  return {
    supported: active.map((list, s) => list.map((i) => codes[s][i])),
    rounds,
    tupleTests,
    effects,
  };
}

function* compile(
  view: ReadView,
  plan: TemplatePlan,
  context: DiscoveryContext,
  cached?: ReadonlyMap<number, TemplateIndex>,
): Generator<Work, DeductionProposal | null> {
  operation(view, context);
  if (!planValid(plan)) throw Error("template-out-of-profile");
  let lease: WorkspaceReservation | undefined;
  const owned: TemplateIndex[] = [];
  try {
    lease = context.workspace.reserve(0, 131072);
    const sourceFacts = new Map<string, number>(),
      anchorFacts = new Map<number, number>();
    for (const fact of view.facts.values()) {
      yield* work(context.workspace);
      // Closed conditional sources remain available in the conditional profile.
      // Their actual roots carry taint through packs and every checked projection.
      if (fact.openAssumptions.length) continue;
      const claim = fact.proposition;
      if (
        claim.kind === "literal" &&
        claim.value.positive &&
        view.state.values[claim.value.cell] === claim.value.symbol &&
        !anchorFacts.has(claim.value.cell)
      ) {
        lease.grow(0, 128);
        anchorFacts.set(claim.value.cell, fact.root);
      }
      const key = sourceKey(fact.proposition);
      if (key && !sourceFacts.has(key)) {
        lease.grow(0, 512);
        sourceFacts.set(key, fact.root);
      }
    }
    const groups: number[][] = [[], [], [], []],
      covers: number[] = [];
    for (let cell = 0; cell < 81; cell++) {
      const id = view.state.domainFacts[cell],
        fact = view.facts.get(id);
      if (
        !fact ||
        !sameValue(domainAssertion(fact.proposition), {
          cell,
          mask: view.state.domains[cell],
        })
      )
        throw Error("unproved-template-domain");
      groups[Math.floor(cell / 27)].push(fact.root);
    }
    for (let kind = 0; kind < 3; kind++)
      for (let i = 0; i < 9; i++) {
        const id = sourceFacts.get(`a:${geometry(kind, i).join(",")}`);
        if (id === undefined) throw Error("missing-template-geometry");
        groups[3].push(id);
      }
    for (const symbol of plan.symbols)
      for (let i = 0; i < 9; i++) {
        const id = sourceFacts.get(`c:${symbol}:${geometry(0, i).join(",")}`);
        if (id === undefined) throw Error("missing-template-cover");
        covers.push(id);
      }
    for (let i = 0; i < covers.length; i += 27)
      groups.push(covers.slice(i, i + 27));
    const anchors: number[] = [];
    for (let cell = 0; cell < 81; cell++)
      if (view.state.values[cell]) {
        const id = anchorFacts.get(cell);
        if (id === undefined) throw Error("missing-template-anchor");
        anchors.push(id);
      }
    for (let i = 0; i < anchors.length; i += 27)
      groups.push(anchors.slice(i, i + 27));
    const indexes: TemplateIndex[] = [];
    for (const symbol of plan.symbols) {
      const ready = cached?.get(symbol);
      if (ready) {
        if (!ready.acceptsView(view)) throw Error("stale-template-index");
        indexes.push(ready);
        continue;
      }
      for (const event of buildTemplates(view, symbol, context.workspace)) {
        if (event.kind === "ready") {
          owned.push(event.value);
          indexes.push(event.value);
        } else if (event.kind === "interrupted")
          throw new IndexInterrupted(event.reason);
        else yield event;
      }
    }
    const result = yield* overlay(view, plan, indexes, context, lease);
    if (!result.effects.length) return null;
    const builder = new ForcingProof(view, lease),
      prefix = retainedProof(view);
    const packs = groups.map((ids) =>
      builder.add("conjunction@1", ids, {
        kind: "and",
        terms: ids.map((id) => prefix.get(id)!.conclusion),
      }),
    );
    const terms: Proposition[] = result.effects.map((e) => ({
      kind: "literal",
      value: { cell: e.cell, symbol: e.symbol, positive: false },
    }));
    lease.grow(
      0,
      indexes.reduce((n, i) => n + i.codes.length, 0) * 64 +
        result.effects.length * 1024,
    );
    const certificate = builder.add(
      "template-cover@1",
      packs,
      { kind: "and", terms },
      {
        mode: plan.mode,
        symbols: [...plan.symbols],
        templates: indexes.map((i) => chunk(i.codes)),
        supported: result.supported.map(chunk),
        tupleTests: result.tupleTests,
        rounds: result.rounds,
      },
    );
    const roots: number[] = [],
      domains = new Map<number, { root: number; mask: number }>();
    for (let index = 0; index < terms.length; index++) {
      yield* work(context.workspace);
      const root = builder.add("conjunction@1", [certificate], terms[index], {
        index,
      });
      roots.push(root);
      const effect = result.effects[index],
        prior = domains.get(effect.cell) ?? {
          root: view.state.domainFacts[effect.cell],
          mask: view.state.domains[effect.cell],
        },
        mask = prior.mask & ~(1 << (effect.symbol - 1));
      domains.set(effect.cell, {
        root: builder.add("domain-restrict@1", [prior.root, root], {
          kind: "domain",
          cell: effect.cell,
          mask,
        }),
        mask,
      });
    }
    roots.push(...[...domains.values()].map((d) => d.root));
    const alias =
      plan.alias ??
      (plan.mode === "single"
        ? "Per-digit templates"
        : plan.mode === "incompatibility"
          ? "Template incompatibility"
          : plan.mode === "triple"
            ? "POM"
            : "Pattern overlay");
    const proposal = builder.bundle(
      "c33@1",
      {
        kind: "templates",
        alias,
        mode: plan.mode,
        symbols: [...plan.symbols],
        certificate,
      },
      result.effects,
      roots,
    );
    const limits = context.limits;
    if (
      proposal.proof.nodes.length > limits.stepNodes ||
      view.facts.size + proposal.proof.nodes.length > limits.runNodes
    )
      throw new TemplateInterrupted("proof-step-limit");
    let retainedBytes = 0;
    for (const node of prefix.values()) {
      yield* work(context.workspace);
      retainedBytes += bytes(node);
    }
    const wire = bytes(proposal);
    lease.grow(0, wire * 3);
    if (
      wire > limits.stepBytes ||
      wire + retainedBytes > limits.proofBytes ||
      wire + retainedBytes > limits.workspaceBytes ||
      bytes({ ...proposal, proof: { ...proposal.proof, nodes: [] } }) > 32768
    )
      throw new TemplateInterrupted("proof-step-limit");
    for (const node of proposal.proof.nodes) {
      yield* work(context.workspace);
      if (bytes(node) > 16384 || node.premises.length > 64)
        throw new TemplateInterrupted("proof-step-limit");
    }
    return proposal;
  } finally {
    for (const index of owned) index.dispose();
    lease?.dispose();
  }
}

/** Standalone compiler transfers its result to the caller; no hidden quota. */
export function* compileTemplates(
  view: ReadView,
  plan: TemplatePlan,
  context: DiscoveryContext,
): Generator<Work, DeductionProposal | null> {
  operation(view, context);
  const budget = new TemplateWork(context),
    cursor = compile(view, plan, context);
  try {
    for (;;) {
      const next = cursor.next();
      if (next.done) return next.value;
      budget.charge(next.value.units);
      yield next.value;
    }
  } finally {
    cursor.return(null);
  }
}

/** Shared nine digit relations, four fixed search cursors; round-robin fairness. */
export function* discoverTemplates(
  view: ReadView,
  context: DiscoveryContext,
): Discovery {
  operation(view, context);
  const eligibility = templateTechniques[0].eligible(view);
  if (eligibility.kind === "excluded") {
    yield eligibility;
    return;
  }
  const indexes = new Map<number, TemplateIndex>(),
    budget = new TemplateWork(context);
  const jobs: Generator<
    Work | { kind: "proposal"; proposal: DeductionProposal }
  >[] = [];
  let root: WorkspaceReservation | undefined;
  const dispose = () => {
    for (const job of jobs) job.return(undefined);
    jobs.length = 0;
    for (const index of indexes.values()) index.dispose();
    indexes.clear();
    root?.dispose();
  };
  try {
    root = context.workspace.reserve(0, 65536);
    for (const symbol of view.assembly.problem.symbols)
      for (const event of buildTemplates(view, symbol, context.workspace)) {
        if (event.kind === "ready")
          indexes.set(symbol, event.value); // Acquire before any throwing accounting boundary.
        else if (event.kind === "interrupted")
          throw new IndexInterrupted(event.reason);
        else {
          budget.charge(event.units);
          yield event;
        }
      }
    function* plans(mode: TemplatePlan["mode"]): Generator<TemplatePlan> {
      if (mode === "single") {
        for (let s = 1; s <= 9; s++) yield { mode, symbols: [s] };
        return;
      }
      if (mode === "incompatibility") {
        yield { mode, symbols: [1, 2, 3, 4, 5, 6, 7, 8, 9] };
        function* combinations(
          size: number,
          start = 1,
          chosen: number[] = [],
        ): Generator<number[]> {
          if (!size) {
            yield chosen;
            return;
          }
          for (let s = start; s <= 10 - size; s++)
            yield* combinations(size - 1, s + 1, [...chosen, s]);
        }
        for (let size = 2; size < 9; size++)
          for (const symbols of combinations(size)) yield { mode, symbols };
        return;
      }
      for (let a = 1; a <= 9; a++)
        for (let b = a + 1; b <= 9; b++) {
          if (mode !== "triple") yield { mode, symbols: [a, b] };
          if (mode !== "pair")
            for (let c = b + 1; c <= 9; c++) yield { mode, symbols: [a, b, c] };
        }
    }
    function* job(
      mode: TemplatePlan["mode"],
    ): Generator<Work | { kind: "proposal"; proposal: DeductionProposal }> {
      for (const plan of plans(mode)) {
        const proposal = yield* compile(view, plan, context, indexes);
        if (proposal) {
          const borrowed = context.workspace.reserve(
            proposal.proof.nodes.length,
            bytes(proposal) * 3 + 65536,
          );
          try {
            yield { kind: "proposal", proposal };
          } finally {
            borrowed.dispose();
          }
        }
      }
    }
    for (const mode of ["single", "pair", "triple", "incompatibility"] as const)
      jobs.push(job(mode));
    while (jobs.length)
      for (let i = 0; i < jobs.length; ) {
        const next = jobs[i].next();
        if (next.done) {
          jobs.splice(i, 1);
          continue;
        }
        if (next.value.kind === "work") budget.charge(next.value.units);
        yield next.value;
        i++;
      }
    dispose();
    yield { kind: "exhausted" };
  } catch (error) {
    dispose();
    if (
      error instanceof IndexInterrupted ||
      error instanceof TemplateInterrupted
    )
      yield { kind: "interrupted", reason: error.reason };
    else if (
      error instanceof TemplateLimit &&
      error.reason === "template-tuple-limit"
    )
      yield { kind: "interrupted", reason: "work-limit" };
    else throw error;
  } finally {
    dispose();
  }
}

const entry = coverageEntries.find((e) => e.id === "C33")!;
export const templateTechniques: readonly TechniqueDescriptor[] = Object.freeze(
  [
    Object.freeze({
      id: entry.version,
      aliases: entry.aliases,
      tier: entry.tier,
      requires: entry.capabilities,
      assumptionPolicy: entry.assumptionPolicy,
      bounds: Object.freeze({
        maxLength: 0,
        maxBranchDepth: 0,
        maxAlternatives: 9,
        maxPatternCells: 81,
        maxSetSize: 3,
        templates: Object.freeze({
          maxTemplatesPerSymbol: 46656,
          maxOverlaySymbols: 3,
          maxIncompatibilitySymbols: 9,
          maxTupleTestsPerRevision: 100000,
        }),
      }),
      watches: (_view: ReadView) => Object.freeze([{ kind: "all" as const }]),
      eligible(view: ReadView) {
        assertOwnedView(view);
        // Synchronous eligibility visits bounded assembled capabilities only.
        // Exact accepted source reconstruction belongs to the charged compiler.
        const facts = new Set<string>();
        for (const scope of view.assembly.allDifferent)
          if (scope.cells.length === 9) facts.add(`a:${scope.cells.join(",")}`);
        for (const cover of view.assembly.covers)
          if (cover.cells.length === 9)
            facts.add(`c:${cover.symbol}:${cover.cells.join(",")}`);
        let valid =
          view.assembly.problem.cells.length === 81 &&
          view.assembly.problem.symbols.length === 9;
        for (let kind = 0; kind < 3; kind++)
          for (let n = 0; n < 9; n++)
            if (!facts.has(`a:${geometry(kind, n).join(",")}`)) valid = false;
        for (let s = 1; s <= 9; s++)
          for (let n = 0; n < 9; n++)
            if (!facts.has(`c:${s}:${geometry(0, n).join(",")}`)) valid = false;
        return valid
          ? { kind: "yes" as const }
          : {
              kind: "excluded" as const,
              reason: "missing-template-geometry",
              dependencies: [{ kind: "all" as const }],
            };
      },
      estimate: (_view: ReadView) => ({ hit: 1, gain: 1, cost: 100000 }),
      discover: discoverTemplates,
    }),
  ],
);
