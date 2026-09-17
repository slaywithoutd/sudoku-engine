import type {
  DeductionProposal,
  ProofNode,
  Proposition,
} from "../../src/solver/proof/types";
import { fixtureView, type TechniqueFixture } from "./acceptance";

/** Test-only mathematics: permutations and BigInt intersection, no engine helpers. */
let geometric: number[][] | undefined;
export function independentGeometry(): number[][] {
  if (geometric) return geometric;
  const output: number[][] = [],
    columns: number[] = [];
  function visit() {
    if (columns.length === 9) {
      if (
        [0, 3, 6].every(
          (start) =>
            new Set(
              columns.slice(start, start + 3).map((c) => Math.floor(c / 3)),
            ).size === 3,
        )
      )
        output.push(columns.map((c, r) => r * 9 + c));
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
  geometric = output;
  return output;
}
export const encodeTemplate = (cells: readonly number[]): number =>
  cells.reduce((n, c) => n * 9 + (c % 9), 0);
export function independentTemplates(f: TechniqueFixture) {
  const plan = f.expectedPattern as unknown as {
    mode: string;
    symbols: number[];
  };
  const lists = plan.symbols.map((symbol) =>
    independentGeometry().filter(
      (cells) =>
        cells.every(
          (c) =>
            Math.floor(f.preState.domains[c] / 2 ** (symbol - 1)) % 2 === 1,
        ) &&
        f.preState.values.every((v, c) => v !== symbol || cells.includes(c)),
    ),
  );
  const masks = lists.map((list) =>
    list.map((cells) =>
      cells.reduce((mask, c) => mask | (1n << BigInt(c)), 0n),
    ),
  );
  let live = masks.map((list) => list.map((_, i) => i)),
    tests = 0,
    compatibleTuples = 0;
  const rounds: number[][] = [];
  if (plan.mode === "pair" || plan.mode === "triple") {
    const supports = lists.map(() => new Set<number>()),
      choice: number[] = [];
    function tuples(depth: number) {
      if (depth < lists.length) {
        for (let i = 0; i < lists[depth].length; i++) {
          choice.push(i);
          tuples(depth + 1);
          choice.pop();
        }
        return;
      }
      tests++;
      let union = 0n;
      for (let s = 0; s < choice.length; s++) {
        const mask = masks[s][choice[s]];
        if (union & mask) return;
        union |= mask;
      }
      compatibleTuples++;
      choice.forEach((i, s) => supports[s].add(i));
    }
    tuples(0);
    live = live.map((list, s) => list.filter((i) => supports[s].has(i)));
  } else if (plan.mode === "incompatibility") {
    for (;;) {
      const next = live.map((list, s) =>
        list.filter((i) =>
          live.every(
            (partners, t) =>
              s === t ||
              partners.some((j) => {
                tests++;
                return (masks[s][i] & masks[t][j]) === 0n;
              }),
          ),
        ),
      );
      const removed = live.map((list, s) => list.length - next[s].length);
      live = next;
      if (!removed.some(Boolean)) break;
      rounds.push(removed);
    }
  }
  const supported = live.map((list, s) => list.map((i) => lists[s][i]));
  const effects: TechniqueFixture["expectedEffects"] = [];
  for (let cell = 0; cell < 81; cell++)
    for (let s = 0; s < plan.symbols.length; s++)
      if (
        !f.preState.values[cell] &&
        Math.floor(f.preState.domains[cell] / 2 ** (plan.symbols[s] - 1)) %
          2 ===
          1 &&
        !supported[s].some((t) => t.includes(cell))
      )
        effects.push({ kind: "remove", cell, symbol: plan.symbols[s] });
  return { lists, supported, effects, tests, rounds, compatibleTuples };
}

/** Independent wire assembly from independently recomputed mathematical sets. */
export function independentTemplateCertificate(
  f: TechniqueFixture,
  acceptedView?: import("../../src/solver/state/types").ReadView,
): DeductionProposal {
  const view = acceptedView ?? fixtureView(f),
    math = independentTemplates(f),
    plan = f.expectedPattern as unknown as { mode: string; symbols: number[] };
  const nodes: ProofNode[] = [],
    imports = new Set<number>(),
    roots: number[] = [];
  let next = 0;
  for (const fact of view.facts.values()) next = Math.max(next, fact.root + 1);
  function add(
    rule: string,
    premises: number[],
    conclusion: Proposition,
    parameters: any = {},
  ) {
    const id = next++;
    nodes.push({ id, rule, premises, conclusion, parameters, scope: [] });
    return id;
  }
  function fact(claim: Proposition): number {
    const canonical = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(canonical)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => [k, canonical(v)]),
            )
          : value;
    const source = [...view.facts.values()].find(
      (f) =>
        !f.openAssumptions.length &&
        (!f.conditional || !!acceptedView) &&
        JSON.stringify(canonical(f.proposition)) ===
          JSON.stringify(canonical(claim)),
    );
    if (!source) throw Error("independent-template-source-missing");
    return source.root;
  }
  const groups: number[][] = [[], [], [], []],
    covers: number[] = [];
  for (let c = 0; c < 81; c++)
    groups[Math.floor(c / 27)].push(view.state.domainFacts[c]);
  const row = (n: number) => Array.from({ length: 9 }, (_, i) => n * 9 + i);
  for (let r = 0; r < 9; r++)
    groups[3].push(fact({ kind: "all-different", cells: row(r) }));
  for (let c = 0; c < 9; c++)
    groups[3].push(
      fact({
        kind: "all-different",
        cells: Array.from({ length: 9 }, (_, r) => r * 9 + c),
      }),
    );
  for (let b = 0; b < 9; b++)
    groups[3].push(
      fact({
        kind: "all-different",
        cells: Array.from(
          { length: 9 },
          (_, i) =>
            (Math.floor(b / 3) * 3 + Math.floor(i / 3)) * 9 +
            (b % 3) * 3 +
            (i % 3),
        ),
      }),
    );
  for (const symbol of plan.symbols)
    for (let r = 0; r < 9; r++)
      covers.push(fact({ kind: "cover", cells: row(r), symbol }));
  for (let i = 0; i < covers.length; i += 27)
    groups.push(covers.slice(i, i + 27));
  const anchors: number[] = [];
  for (let c = 0; c < 81; c++)
    if (view.state.values[c])
      anchors.push(
        fact({
          kind: "literal",
          value: { cell: c, symbol: view.state.values[c], positive: true },
        }),
      );
  for (let i = 0; i < anchors.length; i += 27)
    groups.push(anchors.slice(i, i + 27));
  const packs = groups.map((ids) => {
    ids.forEach((id) => imports.add(id));
    return add("conjunction@1", ids, {
      kind: "and",
      terms: ids.map((id) => view.facts.get(id)!.proposition),
    });
  });
  const pack = (list: number[][]) => {
    const codes = list.map(encodeTemplate),
      result: number[][] = [];
    for (let i = 0; i < codes.length; i += 1024)
      result.push(codes.slice(i, i + 1024));
    return result;
  };
  const terms: Proposition[] = math.effects.map(({ cell, symbol }) => ({
    kind: "literal",
    value: { cell, symbol, positive: false },
  }));
  const certificate = add(
    "template-cover@1",
    packs,
    { kind: "and", terms },
    {
      mode: plan.mode,
      symbols: plan.symbols,
      templates: math.lists.map(pack),
      supported: math.supported.map(pack),
      tupleTests: math.tests,
      rounds: math.rounds,
    },
  );
  const domainRoots = new Map<number, { id: number; mask: number }>();
  math.effects.forEach((effect, i) => {
    const root = add("conjunction@1", [certificate], terms[i], { index: i });
    roots.push(root);
    const previous = domainRoots.get(effect.cell) ?? {
      id: view.state.domainFacts[effect.cell],
      mask: view.state.domains[effect.cell],
    };
    const mask = previous.mask - 2 ** (effect.symbol - 1);
    domainRoots.set(effect.cell, {
      id: add("domain-restrict@1", [previous.id, root], {
        kind: "domain",
        cell: effect.cell,
        mask,
      }),
      mask,
    });
  });
  roots.push(...[...domainRoots.values()].map((d) => d.id));
  return {
    technique: "c33@1",
    state: view.state.key,
    effects: math.effects,
    pattern: {
      kind: "templates",
      mode: plan.mode,
      symbols: plan.symbols,
      alias: f.alias,
      certificate,
    },
    proof: {
      state: view.state.key,
      nodes,
      imports: [...imports].sort((a, b) => a - b),
      roots,
    },
  };
}
