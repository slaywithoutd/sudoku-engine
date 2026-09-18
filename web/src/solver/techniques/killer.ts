import type { Discovery, DiscoveryContext, TechniqueDescriptor } from "./types";
import type { ReadView, Fact } from "../state/types";
import type { DeductionProposal } from "../proof/types";
import { CertificateBuilder, literal } from "../proof/builder";
import { sameValue } from "../proof/primitives";
import { sourceFacts } from "../state/source-index";
import { symbolMask } from "../state/read";
import { symbolValue } from "../problem";
import type { EngineProblem } from "../problem";
import { variantEntries } from "./manifest";
import { defined } from "../invariants";
import { boundsRemovals } from "../rules/linear-rule";

/** Technique id of K01 proposals; the closed grammar lives in variant-grammar.ts. */
export const CAGE_COMBINATIONS = "k01@1";

/**
 * Versioned profile of K01 (spec §3.6): the complete finite table of a cage
 * is built from leaves of at most 256 Cartesian tuples (D068), so the input
 * box is the real bound. Raising `maxInputBox` is a profile change, not a
 * redesign; `maxUnsolved` keeps the table to the cages humans combine by hand.
 */
export const K01_PROFILE = Object.freeze({
  version: "k01-profile@1",
  minUnsolved: 2,
  maxUnsolved: 5,
  maxInputBox: 16384,
  leafVolume: 256,
});

export interface Cage {
  readonly constraintId: string;
  readonly cells: readonly number[];
  readonly scope: Fact;
  readonly sum: Fact;
}

/**
 * Live cages: a sum fact of a declared cage@1 rule whose cells equal that
 * rule's all-different fact. Full houses also carry a sum (lemma M4) but are
 * not cages: their table is every permutation and subsets already cover them.
 */
export function liveCages(view: ReadView): Cage[] {
  const cages: Cage[] = [];
  const types = new Map(view.assembly.problem.constraints.map((rule) => [rule.id, rule.type]));
  for (const sum of sourceFacts(view, "sum")) {
    const equation = sum.proposition;
    if (equation.kind !== "sum" || sum.conditional || sum.openAssumptions.length) continue;
    if (sum.rules.length !== 1 || equation.coefficients.some((c) => c !== 1)) continue;
    if (types.get(sum.rules[0]) !== "cage@1") continue;
    const scope = sourceFacts(view, "all-different").find(
      (candidate) =>
        candidate.proposition.kind === "all-different" &&
        !candidate.conditional &&
        candidate.openAssumptions.length === 0 &&
        sameValue(candidate.rules, sum.rules) &&
        sameValue(candidate.proposition.cells, equation.cells),
    );
    if (!scope) continue;
    cages.push({ constraintId: sum.rules[0], cells: equation.cells, scope, sum });
  }
  return cages.sort((left, right) => (left.constraintId < right.constraintId ? -1 : 1));
}

export function boxVolume(problem: EngineProblem, box: readonly number[]): number {
  return box.reduce(
    (volume, mask) =>
      volume * problem.symbols.filter((symbol) => (mask & symbolMask(symbol)) !== 0).length,
    1,
  );
}

/** Rows of the cage table: every box tuple that is distinct and reaches the total. */
export function* cageRows(
  problem: EngineProblem,
  box: readonly number[],
  total: number,
): Generator<readonly number[]> {
  const choices = box.map((mask) =>
    problem.symbols.filter((symbol) => (mask & symbolMask(symbol)) !== 0),
  );
  if (choices.some((values) => values.length === 0)) return;
  const indexes = choices.map(() => 0);
  for (;;) {
    const row = choices.map((values, index) => values[indexes[index]]);
    if (
      new Set(row).size === row.length &&
      row.reduce((sum, symbol) => sum + symbolValue(problem, symbol), 0) === total
    )
      yield row;
    let index = indexes.length - 1;
    while (index >= 0) {
      indexes[index] += 1;
      if (indexes[index] < choices[index].length) break;
      indexes[index] = 0;
      index -= 1;
    }
    if (index < 0) return;
  }
}

export interface CageAnalysis {
  readonly cage: Cage;
  readonly domains: readonly number[];
  readonly volume: number;
  readonly unsolved: number;
  readonly rows: number;
  readonly supported: readonly number[];
  readonly removals: readonly { cell: number; symbol: number }[];
}

/** Independent recomputation shared by discovery and the grammar; never trusts a proposal. */
export function analyzeCage(view: ReadView, cage: Cage): CageAnalysis {
  const problem = view.assembly.problem;
  const domains = cage.cells.map((cell) => view.state.domains[cell]);
  const total = cage.sum.proposition.kind === "sum" ? cage.sum.proposition.total : 0;
  const supported = cage.cells.map(() => 0);
  let rows = 0;
  for (const row of cageRows(problem, domains, total)) {
    rows += 1;
    row.forEach((symbol, index) => {
      supported[index] |= symbolMask(symbol);
    });
  }
  const removals: { cell: number; symbol: number }[] = [];
  cage.cells.forEach((cell, index) => {
    if (view.state.values[cell]) return;
    for (const symbol of problem.symbols)
      if (
        (domains[index] & symbolMask(symbol)) !== 0 &&
        (supported[index] & symbolMask(symbol)) === 0
      )
        removals.push({ cell, symbol });
  });
  return {
    cage,
    domains,
    volume: boxVolume(problem, domains),
    unsolved: cage.cells.filter((cell) => !view.state.values[cell]).length,
    rows,
    supported,
    removals,
  };
}

export function withinProfile(analysis: CageAnalysis): boolean {
  return (
    analysis.unsolved >= K01_PROFILE.minUnsolved &&
    analysis.unsolved <= K01_PROFILE.maxUnsolved &&
    analysis.volume <= K01_PROFILE.maxInputBox
  );
}

/**
 * Compiles the complete cage table as a binary union tree of filter leaves,
 * splitting the first multi-valued cell one symbol at a time until each leaf
 * box holds at most 256 tuples (the same shape chain certificates use).
 */
function* compileTable(
  builder: CertificateBuilder,
  view: ReadView,
  cage: Cage,
  box: number[],
): Generator<{ kind: "work"; units: number }, { id: number; count: number }> {
  yield { kind: "work", units: 1 };
  const problem = view.assembly.problem;
  if (boxVolume(problem, box) > K01_PROFILE.leafVolume) {
    const at = box.findIndex(
      (mask) => problem.symbols.filter((symbol) => mask & symbolMask(symbol)).length > 1,
    );
    const first = defined(
      problem.symbols.find((symbol) => box[at] & symbolMask(symbol)),
      "symbol",
    );
    const left = [...box],
      right = [...box];
    left[at] = symbolMask(first);
    right[at] &= ~symbolMask(first);
    const a = yield* compileTable(builder, view, cage, left);
    const b = yield* compileTable(builder, view, cage, right);
    return {
      id: builder.add("table-union@1", [a.id, b.id], {
        kind: "table",
        cells: cage.cells,
        count: a.count + b.count,
        definition: builder.next,
      }),
      count: a.count + b.count,
    };
  }
  let count = 0;
  const total = cage.sum.proposition.kind === "sum" ? cage.sum.proposition.total : 0;
  for (const _row of cageRows(problem, box, total)) count += 1;
  return {
    id: builder.add(
      "table-filter@1",
      [cage.scope.root, cage.sum.root, ...cage.cells.map((cell) => view.state.domainFacts[cell])],
      { kind: "table", cells: cage.cells, count, definition: builder.next },
      { cells: cage.cells, box },
    ),
    count,
  };
}

function* discoverCombinations(view: ReadView, context: DiscoveryContext): Discovery {
  const cages = liveCages(view);
  let considered = 0,
    outOfProfile = 0;
  for (const cage of cages) {
    yield { kind: "work", units: cage.cells.length };
    const analysis = analyzeCage(view, cage);
    if (analysis.unsolved === 0) continue;
    considered += 1;
    if (!withinProfile(analysis)) {
      outOfProfile += 1;
      continue;
    }
    yield { kind: "work", units: Math.max(1, Math.ceil(analysis.volume / 64)) };
    if (analysis.removals.length === 0 || analysis.rows === 0) continue;
    context.workspace.checkpoint();
    const builder = new CertificateBuilder(view);
    const table = yield* compileTable(builder, view, cage, [...analysis.domains]);
    for (const { cell, symbol } of analysis.removals) {
      yield { kind: "work", units: 1 };
      const root = builder.add("table-project@1", [table.id], literal(cell, symbol, false));
      builder.effect({ kind: "remove", cell, symbol }, root);
    }
    const proposal: DeductionProposal = builder.finish(CAGE_COMBINATIONS, {
      kind: "cage-combinations",
      alias: "Killer combinations",
      cage: cage.constraintId,
      cells: [...cage.cells],
      volume: analysis.volume,
      rows: analysis.rows,
    });
    yield { kind: "proposal", proposal };
  }
  if (considered > 0 && outOfProfile === considered)
    yield { kind: "excluded", reason: "cage-box-out-of-profile", dependencies: [{ kind: "all" }] };
  else yield { kind: "exhausted" };
}

const entry = defined(
  variantEntries.find((row) => row.id === "K01"),
  "K01 catalogue row",
);

/** K01 Killer combinations: the complete table of a small cage and its projections. */
export const cageCombinationTechniques: readonly TechniqueDescriptor[] = Object.freeze([
  Object.freeze({
    id: entry.version,
    aliases: entry.aliases,
    tier: entry.tier,
    requires: entry.capabilities,
    assumptionPolicy: entry.assumptionPolicy,
    bounds: Object.freeze({
      maxLength: 0,
      maxBranchDepth: 0,
      maxAlternatives: 0,
      maxPatternCells: K01_PROFILE.maxUnsolved,
      maxSetSize: K01_PROFILE.maxUnsolved,
    }),
    watches: (view: ReadView) =>
      Object.freeze(
        liveCages(view).map((cage) => ({ kind: "sum" as const, id: `${cage.constraintId}:sum` })),
      ),
    eligible: (view: ReadView) => {
      const cages = liveCages(view);
      const dependencies = Object.freeze([{ kind: "all" as const }]);
      if (cages.length === 0)
        return { kind: "excluded" as const, reason: "no-cage-in-scope", dependencies };
      return { kind: "yes" as const };
    },
    estimate: () => ({ hit: 1, gain: 1, cost: 2 }),
    discover: discoverCombinations,
  }),
]);

/** Technique id of K02 proposals; the closed grammar lives in variant-grammar.ts. */
export const INNIES_OUTIES = "k02@1";

/**
 * Versioned profile of K02 (spec §3.6): one full-cover scope sum (a house,
 * lemma M4) minus any subset of the cages that intersect it, in one
 * linear-combine@1 node of at most 8 premises, then lemma-LS bounds on the
 * residual. Two-house containers stay outside this profile.
 */
export const K02_PROFILE = Object.freeze({
  version: "k02-profile@1",
  maxCages: 7,
  maxResidualCells: 16,
});

export interface Container {
  readonly constraintId: string;
  readonly cells: readonly number[];
  readonly sum: Fact;
}

/** Full-cover scope sums: every all-different@1 rule spanning the whole symbol set. */
export function liveContainers(view: ReadView): Container[] {
  const problem = view.assembly.problem;
  const types = new Map(problem.constraints.map((rule) => [rule.id, rule.type]));
  const containers: Container[] = [];
  for (const sum of sourceFacts(view, "sum")) {
    const equation = sum.proposition;
    if (equation.kind !== "sum" || sum.conditional || sum.openAssumptions.length) continue;
    if (sum.rules.length !== 1 || types.get(sum.rules[0]) !== "all-different@1") continue;
    if (equation.cells.length !== problem.symbols.length) continue;
    if (equation.coefficients.some((c) => c !== 1)) continue;
    containers.push({ constraintId: sum.rules[0], cells: equation.cells, sum });
  }
  return containers.sort((left, right) => (left.constraintId < right.constraintId ? -1 : 1));
}

export interface Residual {
  readonly cells: readonly number[];
  readonly coefficients: readonly number[];
  readonly total: number;
}

/** Lemma LC with multipliers +1 (container) and -1 (each cage); zero coefficients drop out. */
export function residualOf(container: Container, cages: readonly Cage[]): Residual | undefined {
  const coefficients = new Map<number, number>();
  for (const cell of container.cells) coefficients.set(cell, 1);
  let total = container.sum.proposition.kind === "sum" ? container.sum.proposition.total : 0;
  for (const cage of cages) {
    total -= cage.sum.proposition.kind === "sum" ? cage.sum.proposition.total : 0;
    for (const cell of cage.cells) coefficients.set(cell, (coefficients.get(cell) ?? 0) - 1);
  }
  const cells = [...coefficients]
    .filter(([, coefficient]) => coefficient !== 0)
    .map(([cell]) => cell)
    .sort((left, right) => left - right);
  if (cells.length === 0 || cells.length > K02_PROFILE.maxResidualCells) return undefined;
  return {
    cells,
    coefficients: cells.map((cell) => defined(coefficients.get(cell), "coefficient")),
    total,
  };
}

export interface InnieOutie {
  readonly container: Container;
  readonly cages: readonly Cage[];
  readonly residual: Residual;
  readonly removals: readonly { cell: number; symbol: number }[];
}

/** Every productive container/cage-subset combination in canonical order, recomputed from facts. */
export function* innieOuties(view: ReadView): Generator<InnieOutie> {
  const problem = view.assembly.problem;
  const cages = liveCages(view);
  for (const container of liveContainers(view)) {
    const touching = cages.filter((cage) =>
      cage.cells.some((cell) => container.cells.includes(cell)),
    );
    const limit = Math.min(touching.length, K02_PROFILE.maxCages);
    const subsets: Cage[][] = [];
    const walk = (start: number, chosen: Cage[]) => {
      if (chosen.length > 0) subsets.push([...chosen]);
      if (chosen.length === limit) return;
      for (let index = start; index < touching.length; index += 1) {
        chosen.push(touching[index]);
        walk(index + 1, chosen);
        chosen.pop();
      }
    };
    walk(0, []);
    subsets.sort((left, right) => left.length - right.length);
    for (const subset of subsets) {
      const residual = residualOf(container, subset);
      if (!residual) continue;
      const open = residual.cells.map((cell) => view.state.values[cell] === 0);
      if (!open.some(Boolean)) continue;
      const removals = boundsRemovals(
        problem,
        residual,
        residual.cells.map((cell) => view.state.domains[cell]),
        open,
      );
      if (removals.length === 0) continue;
      yield { container, cages: subset, residual, removals };
    }
  }
}

function* discoverInnieOuties(view: ReadView, context: DiscoveryContext): Discovery {
  const containers = liveContainers(view);
  const cages = liveCages(view);
  if (containers.length === 0 || cages.length === 0) {
    yield { kind: "excluded", reason: "no-overlapping-sums", dependencies: [{ kind: "all" }] };
    return;
  }
  for (const found of innieOuties(view)) {
    yield { kind: "work", units: found.residual.cells.length + found.cages.length };
    context.workspace.checkpoint();
    const builder = new CertificateBuilder(view);
    const combined = builder.add(
      "linear-combine@1",
      [found.container.sum.root, ...found.cages.map((cage) => cage.sum.root)],
      { kind: "sum", ...found.residual },
      { multipliers: [1, ...found.cages.map(() => -1)] },
    );
    const premises = [
      combined,
      ...found.residual.cells.map((cell) => view.state.domainFacts[cell]),
    ];
    for (const { cell, symbol } of found.removals) {
      yield { kind: "work", units: 1 };
      const root = builder.add("linear-sum@1", premises, literal(cell, symbol, false));
      builder.effect({ kind: "remove", cell, symbol }, root);
    }
    yield {
      kind: "proposal",
      proposal: builder.finish(INNIES_OUTIES, {
        kind: "innies-outies",
        alias: "Innies/outies",
        container: found.container.constraintId,
        cages: found.cages.map((cage) => cage.constraintId),
        residual: {
          cells: [...found.residual.cells],
          coefficients: [...found.residual.coefficients],
          total: found.residual.total,
        },
      }),
    };
  }
  yield { kind: "exhausted" };
}

const k02Entry = defined(
  variantEntries.find((row) => row.id === "K02"),
  "K02 catalogue row",
);

/** K02 Innies/outies: a house sum minus its cages, bounded on the residual. */
export const innieOutieTechniques: readonly TechniqueDescriptor[] = Object.freeze([
  Object.freeze({
    id: k02Entry.version,
    aliases: k02Entry.aliases,
    tier: k02Entry.tier,
    requires: k02Entry.capabilities,
    assumptionPolicy: k02Entry.assumptionPolicy,
    bounds: Object.freeze({
      maxLength: 0,
      maxBranchDepth: 0,
      maxAlternatives: K02_PROFILE.maxCages,
      maxPatternCells: K02_PROFILE.maxResidualCells,
      maxSetSize: K02_PROFILE.maxCages,
    }),
    watches: (view: ReadView) =>
      Object.freeze([
        ...liveContainers(view).map((container) => ({
          kind: "sum" as const,
          id: `${container.constraintId}:sum`,
        })),
        ...liveCages(view).map((cage) => ({
          kind: "sum" as const,
          id: `${cage.constraintId}:sum`,
        })),
      ]),
    eligible: (view: ReadView) => {
      const dependencies = Object.freeze([{ kind: "all" as const }]);
      const cages = liveCages(view);
      if (
        cages.length === 0 ||
        !liveContainers(view).some((container) =>
          cages.some((cage) => cage.cells.some((cell) => container.cells.includes(cell))),
        )
      )
        return { kind: "excluded" as const, reason: "no-overlapping-sums", dependencies };
      return { kind: "yes" as const };
    },
    estimate: () => ({ hit: 1, gain: 1, cost: 3 }),
    discover: discoverInnieOuties,
  }),
]);
