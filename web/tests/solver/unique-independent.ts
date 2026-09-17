/** Independent coordinate algebra. No production solver, masks, builder or checker imports. */
export interface UniqueSeed {
  id: string;
  rowId: string;
  givens: string;
  preState: { values: number[]; domains: number[] };
  expectedPattern: Record<string, any>;
  expectedEffects: { kind: string; cell: number; symbol: number }[];
  prefix?: any[];
}
const demand = (value: unknown, message: string): void => {
  if (!value) throw Error(message);
};
const equal = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (
    !a ||
    !b ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  const left = Object.keys(a).sort(),
    right = Object.keys(b).sort();
  return (
    JSON.stringify(left) === JSON.stringify(right) &&
    left.every((k) => equal((a as any)[k], (b as any)[k]))
  );
};
const digits = (mask: number): number[] =>
  Array.from({ length: 9 }, (_, i) => i + 1).filter((d) => Math.floor(mask / 2 ** (d - 1)) % 2);
const cells = Array.from({ length: 81 }, (_, c) => c);
export const independentHouses = new Map<string, number[]>();
for (let n = 0; n < 9; n++) {
  independentHouses.set(
    `row:${n}`,
    cells.filter((c) => Math.floor(c / 9) === n),
  );
  independentHouses.set(
    `column:${n}`,
    cells.filter((c) => c % 9 === n),
  );
  independentHouses.set(
    `box:${n}`,
    cells.filter((c) => Math.floor(c / 27) * 3 + Math.floor((c % 9) / 3) === n),
  );
}
const peers = (a: number, b: number): boolean =>
  a !== b && [...independentHouses.values()].some((h) => h.includes(a) && h.includes(b));

function pathsValid(domains: number[], branch: any): void {
  const ends = branch.paths.map((path: any[]) => {
    let prior = branch.assumption;
    for (const link of path) {
      demand(equal(prior, link.from), "independent-disconnected-link");
      const a = link.from,
        b = link.to,
        r = link.reason;
      const sameCell = a.cell === b.cell && a.symbol !== b.symbol;
      if (r.kind === "cell-conflict")
        demand(
          a.positive && !b.positive && sameCell && r.cell === a.cell,
          "independent-cell-conflict",
        );
      else if (r.kind === "cell-cover")
        demand(
          !a.positive &&
            b.positive &&
            sameCell &&
            r.cell === a.cell &&
            equal(
              digits(domains[a.cell]),
              [a.symbol, b.symbol].sort((x, y) => x - y),
            ),
          "independent-cell-cover",
        );
      else {
        const house = independentHouses.get(r.house)!;
        demand(
          house &&
            house.includes(a.cell) &&
            house.includes(b.cell) &&
            a.cell !== b.cell &&
            a.symbol === b.symbol &&
            r.symbol === a.symbol,
          "independent-house-link",
        );
        if (r.kind === "scope-conflict")
          demand(a.positive && !b.positive, "independent-scope-sign");
        else
          demand(
            r.kind === "house-cover" &&
              !a.positive &&
              b.positive &&
              equal(
                house.filter((c) => digits(domains[c]).includes(a.symbol)),
                [a.cell, b.cell].sort((x, y) => x - y),
              ),
            "independent-house-cover",
          );
      }
      prior = b;
    }
    return prior;
  });
  if (branch.result === "false")
    demand(
      ends.length === 2 &&
        ends[0].cell === ends[1].cell &&
        ends[0].symbol === ends[1].symbol &&
        ends[0].positive !== ends[1].positive,
      "independent-branch-contradiction",
    );
  else demand(ends.length === 1 && equal(ends[0], branch.result), "independent-branch-result");
}

/** Replay every independently specified ordinary prefix before examining a trade. */
export function independentUniqueState(seed: UniqueSeed): { values: number[]; domains: number[] } {
  const values = [...seed.givens].map(Number);
  const domains = cells.map((c) =>
    values[c]
      ? 2 ** (values[c] - 1)
      : digits(511)
          .filter((s) => !cells.some((p) => peers(c, p) && values[p] === s))
          .reduce((mask, s) => mask + 2 ** (s - 1), 0),
  );
  for (const op of seed.prefix ?? []) {
    if (typeof op !== "object") continue; // Original given-peer navigation notes are not steps.
    if (op.kind === "place") {
      demand(
        !values[op.cell] && digits(domains[op.cell]).includes(op.symbol),
        "independent-prefix-live",
      );
      if (op.reason.kind === "single")
        demand(domains[op.cell] === 2 ** (op.symbol - 1), "independent-prefix-single");
      else
        demand(
          op.reason.kind === "hidden" &&
            equal(
              independentHouses
                .get(op.reason.house)!
                .filter((c) => digits(domains[c]).includes(op.symbol)),
              [op.cell],
            ),
          "independent-prefix-hidden",
        );
      values[op.cell] = op.symbol;
      domains[op.cell] = 2 ** (op.symbol - 1);
    } else if (op.kind === "peer") {
      demand(values[op.cell] === op.symbol, "independent-prefix-peer-source");
      demand(
        equal(
          op.removed,
          cells.filter(
            (c) => !values[c] && peers(c, op.cell) && digits(domains[c]).includes(op.symbol),
          ),
        ),
        "independent-prefix-peer-completeness",
      );
      for (const c of op.removed) domains[c] -= 2 ** (op.symbol - 1);
    } else if (op.kind === "locked") {
      const source = independentHouses.get(op.source)!,
        target = independentHouses.get(op.target)!;
      demand(
        equal(
          op.supports,
          source.filter((c) => digits(domains[c]).includes(op.symbol)),
        ) && op.supports.every((c: number) => target.includes(c)),
        "independent-prefix-lock",
      );
      demand(
        equal(
          op.removed,
          target.filter((c) => !source.includes(c) && digits(domains[c]).includes(op.symbol)),
        ),
        "independent-prefix-lock-completeness",
      );
      for (const c of op.removed) domains[c] -= 2 ** (op.symbol - 1);
    } else if (
      op.kind === "forcing" ||
      op.kind === "forcing-placement" ||
      op.kind === "single-placement"
    ) {
      demand(equal(domains, op.sourceDomains), "independent-prefix-forcing-domains");
      if (op.kind === "single-placement") {
        demand(
          domains[op.cell] === 2 ** (op.symbol - 1),
          "independent-prefix-normalization-singleton",
        );
        demand(
          equal(op.expectedEffects, [
            { kind: "place", cell: op.cell, symbol: op.symbol },
            ...cells
              .filter(
                (c) => !values[c] && peers(c, op.cell) && digits(domains[c]).includes(op.symbol),
              )
              .map((cell) => ({ kind: "remove", cell, symbol: op.symbol })),
          ]),
          "independent-prefix-normalization-atomic",
        );
      } else {
        const p = op.expectedPattern,
          a = p.cover.candidate;
        demand(
          p.kind === "digit" &&
            a.positive &&
            p.branches.length === 2 &&
            p.branches.some((b: any) => equal(b.assumption, a)) &&
            p.branches.some((b: any) => equal(b.assumption, { ...a, positive: false })),
          "independent-prefix-complete-cases",
        );
        p.branches.forEach((b: any) => pathsValid(domains, b));
      }
      for (const e of op.expectedEffects) {
        demand(digits(domains[e.cell]).includes(e.symbol), "independent-prefix-live-effect");
        if (e.kind === "place") {
          values[e.cell] = e.symbol;
          domains[e.cell] = 2 ** (e.symbol - 1);
        } else domains[e.cell] -= 2 ** (e.symbol - 1);
      }
    }
  }
  demand(
    equal(values, seed.preState.values) && equal(domains, seed.preState.domains),
    `independent-prefix-final:${seed.id}`,
  );
  return { values, domains };
}

/** Check every affected house, complete extras and universal local trade algebra. */
export function independentUniqueTrade(seed: UniqueSeed): void {
  const { domains } = independentUniqueState(seed),
    p = seed.expectedPattern;
  if (p.coreDomains) {
    const residual: number[] = p.residualCells;
    demand(
      residual.every((c) => !Number(seed.givens[c]) && digits(p.coreDomains[c]).length === 2),
      "independent-bug-core",
    );
    const extras = cells.flatMap((cell) =>
      digits(domains[cell])
        .filter((s) => !digits(p.coreDomains[cell]).includes(s))
        .map((symbol) => ({ cell, symbol })),
    );
    demand(equal(extras, p.extras), "independent-bug-extras");
    for (const [name, house] of independentHouses)
      for (const symbol of digits(511)) {
        const supports = house.filter(
          (c) => residual.includes(c) && digits(p.coreDomains[c]).includes(symbol),
        );
        demand(
          supports.length === 0 || supports.length === 2,
          `independent-bug-house:${name}:${symbol}`,
        );
        if (supports.length)
          demand(
            house.every((c) => residual.includes(c) || !digits(domains[c]).includes(symbol)),
            "independent-bug-fixed-outside",
          );
      }
    p.conditionalBranches?.forEach((b: any) => pathsValid(domains, b));
    return;
  }
  const selected: number[] = p.cells,
    core: number[] = p.core ?? p.coreSymbols;
  demand(
    selected.every((c) => seed.givens[c] === "0"),
    "independent-trade-given",
  );
  const affected = [...independentHouses.values()]
    .map((h) => h.filter((c) => selected.includes(c)))
    .filter((h) => h.length);
  let compatible = 0;
  const assignment = new Map<number, number>();
  function visit(index: number): void {
    if (index < selected.length) {
      const cell = selected[index];
      for (const symbol of core)
        if (![...assignment].some(([c, s]) => peers(c, cell) && s === symbol)) {
          assignment.set(cell, symbol);
          visit(index + 1);
          assignment.delete(cell);
        }
      return;
    }
    compatible++;
    const after = new Map(
      selected.map((c, i) => [
        c,
        p.permutation
          ? assignment.get(p.permutation[i])!
          : core.find((s) => s !== assignment.get(c))!,
      ]),
    );
    demand(
      selected.some((c) => assignment.get(c) !== after.get(c)),
      "independent-identity-trade",
    );
    for (const h of affected)
      demand(
        equal(h.map((c) => assignment.get(c)).sort(), h.map((c) => after.get(c)).sort()),
        "independent-house-multiset",
      );
  }
  visit(0);
  demand(compatible > 0, "independent-incompatible-core");
  if (p.guardians)
    demand(
      equal(
        p.guardians,
        selected.flatMap((cell) =>
          digits(domains[cell])
            .filter((s) => !core.includes(s))
            .map((symbol) => ({ cell, symbol })),
        ),
      ),
      "independent-loop-guardians",
    );
  p.conditionalBranches?.forEach((b: any) => pathsValid(domains, b));
}

/** Syntax assembly is independent of every production builder/detector. */
export function independentUniqueCertificate(
  view: import("../../src/solver/state/types").ReadView,
  seed: UniqueSeed,
  evidenceId: string,
): import("../../src/solver/proof/types").DeductionProposal {
  type Node = import("../../src/solver/proof/types").ProofNode;
  type Proposition = import("../../src/solver/state/types").Proposition;
  const nodes: Node[] = [],
    imports = new Set<number>();
  let id = Math.max(...view.facts.keys()) + 1;
  const add = (
    rule: string,
    premises: number[],
    conclusion: Proposition,
    parameters: any = {},
  ): number => {
    const next = id++;
    nodes.push({ id: next, rule, premises, conclusion, parameters, scope: [] });
    premises.filter((n) => view.facts.has(n)).forEach((n) => imports.add(n));
    return next;
  };
  const sourceIds = [
    ...new Set([
      ...view.state.domainFacts,
      ...[...view.facts.values()]
        .filter(
          (f) =>
            f.proposition.kind === "rule" ||
            (f.proposition.kind === "literal" &&
              f.proposition.value.positive &&
              view.assembly.problem.givens[f.proposition.value.cell] ===
                f.proposition.value.symbol),
        )
        .map((f) => f.id),
    ]),
  ];
  const groups: number[] = [];
  for (let n = 0; n < sourceIds.length; n += 32) {
    const group = sourceIds.slice(n, n + 32);
    groups.push(
      add("conjunction@1", group, {
        kind: "and",
        terms: group.map((n) => view.facts.get(n)!.proposition),
      }),
    );
  }
  const p = seed.expectedPattern,
    selected: number[] = p.cells ?? p.residualCells;
  const coreMasks: number[] = selected.map((c) =>
    p.coreDomains
      ? p.coreDomains[c]
      : (p.core ?? p.coreSymbols).reduce((m: number, s: number) => m + 2 ** (s - 1), 0),
  );
  const alternatives = selected.flatMap((cell, i) =>
    digits(view.state.domains[cell])
      .filter((s) => !digits(coreMasks[i]).includes(s))
      .map((symbol) => ({ cell, symbol, positive: true })),
  );
  const conclusion: Proposition =
    alternatives.length === 1
      ? { kind: "literal", value: alternatives[0] }
      : { kind: "clause", alternatives };
  const root = add("unique-transform@1", groups, conclusion, {
    cells: selected,
    coreMasks,
    permutation: p.permutation ?? null,
    evidenceId,
  });
  return {
    technique: `${seed.rowId.toLowerCase()}@1`,
    state: view.state.key,
    pattern: {},
    effects: [],
    proof: {
      state: view.state.key,
      nodes,
      imports: [...imports].sort((a, b) => a - b),
      roots: [root],
    },
  };
}

type Literal = import("../../src/solver/state/types").Literal;
type Link = import("../../src/solver/techniques/forcing-proof").ForcingLink;
const key = (a: Literal): string => `${a.cell}/${a.symbol}/${a.positive}`;
const flip = (a: Literal): Literal => ({ ...a, positive: !a.positive });
function independentPaths(
  domains: readonly number[],
  start: Literal,
  strong?: { symbol: number; houses: string[] },
): Map<string, Link[]> {
  const edges: Link[] = [];
  for (const cell of cells) {
    const values = digits(domains[cell]);
    for (const a of values)
      for (const b of values)
        if (a !== b) {
          edges.push({
            from: { cell, symbol: a, positive: true },
            to: { cell, symbol: b, positive: false },
            reason: { kind: "cell-conflict", cell },
          });
          if (values.length === 2)
            edges.push({
              from: { cell, symbol: a, positive: false },
              to: { cell, symbol: b, positive: true },
              reason: { kind: "cell-cover", cell },
            });
        }
  }
  for (const [house, group] of independentHouses)
    for (const symbol of digits(511)) {
      const supports = group.filter((c) => digits(domains[c]).includes(symbol));
      for (const a of supports)
        for (const b of supports)
          if (a !== b) {
            edges.push({
              from: { cell: a, symbol, positive: true },
              to: { cell: b, symbol, positive: false },
              reason: { kind: "scope-conflict", house, symbol },
            });
            if (supports.length === 2)
              edges.push({
                from: { cell: a, symbol, positive: false },
                to: { cell: b, symbol, positive: true },
                reason: { kind: "house-cover", house, symbol },
              });
          }
    }
  const result = new Map<string, Link[]>([[key(start), []]]),
    queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const value = queue[i],
      path = result.get(key(value))!;
    if (path.length === 24) continue;
    for (const edge of edges)
      if (
        key(edge.from) === key(value) &&
        !result.has(key(edge.to)) &&
        !(
          strong &&
          edge.reason.kind === "house-cover" &&
          edge.reason.symbol === strong.symbol &&
          !strong.houses.includes(edge.reason.house!)
        )
      ) {
        result.set(key(edge.to), [...path, edge]);
        queue.push(edge.to);
      }
  }
  return result;
}

export function independentUniquePlan(
  seed: UniqueSeed,
  effect: { kind: string; cell: number; symbol: number },
): import("../../src/solver/techniques/unique-compiler").UniquePlan {
  const p = seed.expectedPattern,
    selected: number[] = p.cells ?? p.residualCells;
  const kind = p.kind ?? (seed.rowId === "U01" ? "type1" : p.coreDomains ? "bug" : "loop");
  const coreMasks = selected.map((c) =>
    p.coreDomains
      ? p.coreDomains[c]
      : (p.core ?? p.coreSymbols).reduce((m: number, s: number) => m + 2 ** (s - 1), 0),
  );
  const guardians: Literal[] = selected.flatMap((cell, i) =>
    digits(seed.preState.domains[cell])
      .filter((s) => !digits(coreMasks[i]).includes(s))
      .map((symbol) => ({ cell, symbol, positive: true })),
  );
  const alias = kind.startsWith("type")
    ? `Unique Rectangle type ${kind.slice(4)}`
    : kind === "hidden"
      ? "Hidden Rectangle"
      : kind.startsWith("avoidable")
        ? "Avoidable Rectangle"
        : kind === "extended"
          ? "Extended Rectangle"
          : kind === "loop"
            ? "Unique Loops"
            : seed.rowId === "U04"
              ? "BUG+1"
              : "BUG+n";
  const geometry: any = {
    row: seed.rowId,
    kind,
    alias,
    cells: selected,
    coreMasks,
    permutation: p.permutation ?? null,
    guardians,
    loopOrder: p.loopOrder ?? [],
    auxiliaryCells: p.auxiliaryCells ?? [],
    subsetHouse: p.subsetHouse ?? null,
    strongSymbol: p.strongSymbol ?? null,
    strongHouses: p.strongHouses ?? [],
    causalHouses:
      kind === "type6" ? p.strongHouses.filter((h: string) => h.startsWith("row:")) : [],
  };
  if (p.conditionalBranches)
    return { geometry, consequence: { kind: "cases", branches: p.conditionalBranches } };
  const target: Literal = {
    cell: effect.cell,
    symbol: effect.symbol,
    positive: effect.kind === "place",
  };
  const reachable = independentPaths(
    seed.preState.domains,
    flip(target),
    kind === "type6" ? { symbol: p.strongSymbol, houses: geometry.causalHouses } : undefined,
  );
  const paths = guardians.map((a) => {
    const found = reachable.get(key(flip(a)));
    demand(found, `independent-no-denial:${seed.id}:${key(a)}`);
    return found!;
  });
  if (kind === "type6") {
    const cell = selected.find((c) => c !== effect.cell && guardians.some((a) => a.cell === c))!,
      otherEffect = { kind: "remove" as const, cell, symbol: effect.symbol };
    const reachableOther = independentPaths(
      seed.preState.domains,
      { cell, symbol: effect.symbol, positive: true },
      { symbol: p.strongSymbol, houses: geometry.causalHouses },
    );
    const otherPaths = guardians.map((a) => {
      const found = reachableOther.get(key(flip(a)));
      demand(found, "independent-type6-mirror-denial");
      return found!;
    });
    return {
      geometry,
      consequence: { kind: "denial", paths },
      companion: { effect: otherEffect, consequence: { kind: "denial", paths: otherPaths } },
    };
  }
  return { geometry, consequence: { kind: "denial", paths } };
}

/** Fully independent named certificate assembly, including shared denial DAG nodes. */
export function independentNamedUnique(
  view: import("../../src/solver/state/types").ReadView,
  seed: UniqueSeed,
  evidenceId: string,
  effect: import("../../src/solver/proof/types").Effect,
  overridePlan?: import("../../src/solver/techniques/unique-compiler").UniquePlan,
  orSource?: {
    source: number;
    plan: import("../../src/solver/techniques/or-forcing").OrForcingPlan;
  },
): import("../../src/solver/proof/types").DeductionProposal {
  type Proposition = import("../../src/solver/state/types").Proposition;
  const initial = orSource
      ? {
          technique: "c28@1",
          state: view.state.key,
          effects: [],
          pattern: {},
          proof: {
            state: view.state.key,
            nodes: [],
            imports: [orSource.source],
            roots: [orSource.source],
          },
        }
      : independentUniqueCertificate(view, seed, evidenceId),
    nodes = [...initial.proof.nodes],
    imports = new Set(initial.proof.imports);
  let next = Math.max(...[...view.facts.keys()], ...nodes.map((n) => n.id)) + 1,
    scope: number[] = [];
  const literal = (value: Literal): Proposition => ({ kind: "literal", value });
  const clause = (values: Literal[]): Proposition => {
    const sorted = values.sort(
      (a, b) => a.cell - b.cell || a.symbol - b.symbol || Number(a.positive) - Number(b.positive),
    );
    return sorted.length === 1 ? literal(sorted[0]) : { kind: "clause", alternatives: sorted };
  };
  const add = (
    rule: string,
    premises: number[],
    conclusion: Proposition,
    parameters: any = {},
  ): number => {
    const id = next++;
    nodes.push({ id, rule, premises, conclusion, parameters, scope: [...scope] });
    premises.filter((id) => view.facts.has(id)).forEach((id) => imports.add(id));
    return id;
  };
  const fact = (p: Proposition): number => {
    const f = [...view.facts.values()].find((f) => equal(f.proposition, p));
    demand(f, "independent-named-fact");
    return f!.id;
  };
  const plan = orSource
      ? {
          ...independentUniquePlan(seed, seed.expectedEffects[0]),
          consequence: {
            kind: "cases" as const,
            branches: orSource.plan.branches as Extract<
              import("../../src/solver/techniques/unique-compiler").UniquePlan["consequence"],
              { kind: "cases" }
            >["branches"],
          },
        }
      : (overridePlan ?? independentUniquePlan(seed, effect)),
    trade = initial.proof.roots[0],
    target: Literal = {
      cell: effect.cell,
      symbol: effect.symbol,
      positive: effect.kind === "place",
    };
  const pathSet = (assumption: number, recipes: readonly (readonly Link[])[]) => {
    const shared = new Map<string, { edge: number; link: number }>();
    return recipes.map((path) => {
      let root = assumption;
      const clauses: number[] = [],
        links: number[] = [];
      if (!path.length) {
        const p = nodes.find((n) => n.id === assumption)!.conclusion;
        root = add(
          "conjunction@1",
          [add("conjunction@1", [assumption], { kind: "and", terms: [p] })],
          p,
          { index: 0 },
        );
      }
      for (const link of path) {
        const identity = `${root}:${JSON.stringify(link)}`;
        let stored = shared.get(identity);
        if (!stored) {
          const r = link.reason;
          let edge: number;
          if (r.kind === "cell-cover")
            edge = add(
              "cover-clause@1",
              [view.state.domainFacts[r.cell!]],
              clause(
                digits(view.state.domains[r.cell!]).map((symbol) => ({
                  cell: r.cell!,
                  symbol,
                  positive: true,
                })),
              ),
            );
          else if (r.kind === "house-cover") {
            const h = independentHouses.get(r.house!)!,
              supports = h.filter((c) => digits(view.state.domains[c]).includes(r.symbol!));
            const support = add(
              "support@1",
              [
                fact({ kind: "cover", cells: h, symbol: r.symbol! }),
                ...h.map((c) => view.state.domainFacts[c]),
              ],
              { kind: "cover", cells: supports, symbol: r.symbol! },
            );
            edge = add(
              "cover-clause@1",
              [support],
              clause(supports.map((cell) => ({ cell, symbol: r.symbol!, positive: true }))),
            );
          } else
            edge = add(
              "weak-link@1",
              [
                r.kind === "cell-conflict"
                  ? view.state.domainFacts[r.cell!]
                  : fact({ kind: "all-different", cells: independentHouses.get(r.house!)! }),
              ],
              clause([flip(link.from), link.to]),
            );
          const end = add("resolution@1", [root, edge], literal(link.to));
          stored = { edge, link: end };
          shared.set(identity, stored);
        }
        clauses.push(stored.edge);
        links.push(stored.link);
        root = stored.link;
      }
      return { clauses, links, end: root };
    });
  };
  const derive = (consequence: typeof plan.consequence, target: Literal) => {
    scope = [];
    const branches: any[] = [];
    let root: number;
    if (consequence.kind === "denial") {
      const assumption = add("assume@1", [], literal(flip(target)));
      scope = [assumption];
      const paths = pathSet(assumption, consequence.paths),
        result = add("contradiction@1", [trade, ...paths.map((p) => p.end)], { kind: "false" });
      branches.push({ assumption, paths, result });
      scope = [];
      root = add("discharge@1", [assumption, result], literal(target));
    } else {
      for (const b of consequence.branches) {
        scope = [];
        const assumption = add("assume@1", [], literal(b.assumption));
        scope = [assumption];
        const paths = pathSet(assumption, b.paths),
          result =
            b.result === "false"
              ? add(
                  "contradiction@1",
                  paths.map((p) => p.end),
                  { kind: "false" },
                )
              : paths[0].end;
        branches.push({ assumption, paths, result });
      }
      scope = [];
      const order = consequence.branches
        .map((b, i) => ({ a: b.assumption, c: branches[i] }))
        .sort((a, b) => a.a.cell - b.a.cell || a.a.symbol - b.a.symbol);
      root = add(
        "cases@1",
        [trade, ...order.flatMap(({ c }) => [c.assumption, c.result])],
        literal(target),
      );
    }
    return { trade, branches, root };
  };
  const certificate = derive(plan.consequence, target),
    root = certificate.root;
  const effects = [effect],
    roots = [root];
  let companion: typeof certificate | undefined;
  if (plan.companion) {
    companion = derive(plan.companion.consequence, {
      cell: plan.companion.effect.cell,
      symbol: plan.companion.effect.symbol,
      positive: false,
    });
    effects.push(plan.companion.effect);
    roots.push(companion.root);
  }
  if (effect.kind === "place")
    for (const cell of cells)
      if (
        !view.state.values[cell] &&
        peers(cell, effect.cell) &&
        digits(view.state.domains[cell]).includes(effect.symbol)
      ) {
        const h = [...independentHouses.values()].find(
          (h) => h.includes(cell) && h.includes(effect.cell),
        )!;
        const weak = add(
          "weak-link@1",
          [fact({ kind: "all-different", cells: h })],
          clause([
            { ...target, positive: false },
            { cell, symbol: effect.symbol, positive: false },
          ]),
        );
        roots.push(
          add(
            "resolution@1",
            [root, weak],
            literal({ cell, symbol: effect.symbol, positive: false }),
          ),
        );
        effects.push({ kind: "remove", cell, symbol: effect.symbol });
      }
  effects.forEach((e, i) =>
    roots.push(
      add("domain-restrict@1", [view.state.domainFacts[e.cell], roots[i]], {
        kind: "domain",
        cell: e.cell,
        mask:
          e.kind === "place"
            ? 2 ** (e.symbol - 1)
            : view.state.domains[e.cell] - 2 ** (e.symbol - 1),
      }),
    ),
  );
  return {
    ...initial,
    effects,
    pattern: (orSource
      ? {
          ...orSource.plan,
          certificate: {
            root,
            branches: certificate.branches.map((b) => ({ ...b, generalized: null })),
          },
        }
      : { ...plan, certificate: { ...certificate, ...(companion ? { companion } : {}) } }) as any,
    proof: { state: view.state.key, nodes, imports: [...imports].sort((a, b) => a - b), roots },
  };
}
