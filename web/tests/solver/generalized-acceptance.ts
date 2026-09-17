import type { ReadView } from "../../src/solver/state/types";
import type { DeductionProposal, Effect } from "../../src/solver/proof/types";
import type { Json } from "../../src/solver/problem";
import { IndependentChainProof } from "./chains-acceptance";

type Pair = readonly [number, number];
const literal = (v: Pair, positive = true) => ({
  cell: v[0],
  symbol: v[1],
  positive,
});
const group = (v: any): Pair[] => (typeof v[0] === "number" ? [v] : v);

/** Independent explicit fixture interpreter. It uses only the existing test
 * algebra and original complete domain facts, never production generalized
 * builders, indexes, discovery, recognition, or certificate IDs.
 */
export function independentGeneralized(
  view: ReadView,
  recipe: unknown,
): DeductionProposal {
  const p = structuredClone(recipe) as any,
    b = new IndependentChainProof(view);
  const assumption = b.add("assume@1", [], b.clause([literal(p.target)]));
  const certificate = independentPositions(b, p, assumption);
  b.lexicalScope = [];
  const root = b.add(
    "discharge@1",
    [assumption, certificate.contradiction],
    b.clause([literal(p.target, false)]),
  );
  const aliases: Record<string, string> = {
    bivalue: "Bivalue chains",
    z: "z-chains",
    t: "t-whips",
    whip: "Whips",
    braid: "Braids",
    "g-whip": "g-whips",
    "inserted-or-whip": "OR-k whips",
  };
  const row =
    p.grammar === "inserted-or-whip"
      ? "C28"
      : ["bivalue", "z"].includes(p.grammar)
        ? "C25"
        : ["t", "whip"].includes(p.grammar)
          ? "C26"
          : "C27";
  const effects: Effect[] =
    p.mode === "cache"
      ? []
      : [{ kind: "remove", cell: p.target[0], symbol: p.target[1] }];
  return b.proposal(
    row,
    {
      ...p,
      alias: aliases[p.grammar],
      certificate: { ...certificate, root },
    } as Json,
    effects,
    [root],
  );
}

function independentPositions(
  b: IndependentChainProof,
  p: any,
  assumption: number,
) {
  b.lexicalScope = [assumption];
  const results = new Map<string, number>([
    [JSON.stringify([p.target]), assumption],
  ]);
  const exclusion = (value: Pair, witness: Pair[], start: number) => {
    const weak: number[] = [],
      reductions: number[] = [];
    let result = start;
    for (let i = 0; i < witness.length; i++) {
      b.lexicalScope = [];
      weak.push(b.weak(literal(value), literal(witness[i])));
      b.lexicalScope = [assumption];
      result = b.add(
        "resolution@1",
        [result, weak[i]],
        b.clause([
          ...witness.slice(i + 1).map((v) => literal(v)),
          literal(value, false),
        ]),
      );
      reductions.push(result);
    }
    return { weak, reductions, result };
  };
  const positions = p.positions.map((position: any) => {
    let cover: number;
    b.lexicalScope = [];
    if (position.role === "or") cover = p.source;
    else if (position.variable.startsWith("cell:"))
      cover = b.cell(Number(position.variable.split(":")[1]));
    else {
      const split = position.variable.lastIndexOf(":symbol:");
      cover = b.house(
        position.variable.slice(0, split),
        Number(position.variable.slice(split + 8)),
      );
    }
    b.lexicalScope = [assumption];
    const entries = [
      { literal: position.left, conflictWith: position.leftConflict },
      ...position.excluded,
    ];
    if (position.closingCandidate)
      entries.push({
        literal: position.closingCandidate,
        conflictWith: position.closingConflict,
      });
    const exclusions = entries.map((entry: any) =>
      exclusion(
        entry.literal,
        group(entry.conflictWith),
        results.get(JSON.stringify(group(entry.conflictWith)))!,
      ),
    );
    let result = cover;
    const reductions: number[] = [];
    if (position.right === null) {
      const ordered = position.alternatives.map(
        (value: Pair) =>
          exclusions[
            entries.findIndex(
              (e: any) => JSON.stringify(e.literal) === JSON.stringify(value),
            )
          ].result,
      );
      result = b.add("contradiction@1", [cover, ...ordered], { kind: "false" });
    } else {
      let remaining: Pair[] = [...position.alternatives];
      entries.forEach((e: any, i: number) => {
        remaining = remaining.filter(
          (v) => JSON.stringify(v) !== JSON.stringify(e.literal),
        );
        result = b.add(
          "resolution@1",
          [result, exclusions[i].result],
          b.clause(remaining.map((v) => literal(v))),
        );
        reductions.push(result);
      });
      results.set(JSON.stringify(group(position.right)), result);
    }
    return { cover, exclusions, reductions, result };
  });
  let contradiction = positions.at(-1).result,
    closing = null;
  const last = p.positions.at(-1);
  if (last.right !== null) {
    closing = exclusion(
      p.consequence ?? p.target,
      group(last.right),
      positions.at(-1).result,
    );
    contradiction = p.consequence
      ? closing.result
      : b.add("contradiction@1", [assumption, closing.result], {
          kind: "false",
        });
  }
  return { assumption, positions, closing, contradiction };
}

/** Independent OR case compiler preserves the fixture's actual signed paths. */
export function independentOrForcing(
  view: ReadView,
  recipe: unknown,
  effect: Effect,
): DeductionProposal {
  const p = structuredClone(recipe) as any,
    b = new IndependentChainProof(view);
  const branches = p.branches.map((branch: any) => {
    b.lexicalScope = [];
    const assumption = b.add("assume@1", [], b.clause([branch.assumption]));
    b.lexicalScope = [assumption];
    if (branch.generalized) {
      const generalized = independentPositions(
        b,
        branch.generalized,
        assumption,
      );
      return {
        assumption,
        result: generalized.contradiction,
        paths: [],
        generalized,
      };
    }
    const paths = branch.paths.map((path: any[]) => {
      let end = path.length ? assumption : b.package([assumption])[0];
      const clauses: number[] = [],
        links: number[] = [];
      for (const step of path) {
        const reason = step.reason;
        const house = reason.house
          ? view.assembly.allDifferent.find((h) => h.id === reason.house)
          : undefined;
        const fact = house
          ? [...view.facts.values()].find(
              (f) =>
                f.proposition.kind === "all-different" &&
                JSON.stringify(f.proposition.cells) ===
                  JSON.stringify(house.cells),
            )
          : undefined;
        const edge =
          reason.kind === "cell-cover"
            ? b.cell(reason.cell)
            : reason.kind === "house-cover"
              ? b.house(reason.house, reason.symbol)
              : b.add(
                  "weak-link@1",
                  [
                    reason.kind === "cell-conflict"
                      ? view.state.domainFacts[reason.cell]
                      : fact!.id,
                  ],
                  b.clause([{ ...step.from, positive: false }, step.to]),
                );
        clauses.push(edge);
        end = b.add("resolution@1", [end, edge], b.clause([step.to]));
        links.push(end);
      }
      return { end, clauses, links };
    });
    const result =
      branch.result === "false"
        ? b.add(
            "contradiction@1",
            paths.map((p: any) => p.end),
            { kind: "false" },
          )
        : paths[0].end;
    return { assumption, result, paths, generalized: null };
  });
  b.lexicalScope = [];
  const order = p.branches
    .map((branch: any, i: number) => ({ a: branch.assumption, c: branches[i] }))
    .sort(
      (x: any, y: any) =>
        x.a.cell - y.a.cell ||
        x.a.symbol - y.a.symbol ||
        Number(x.a.positive) - Number(y.a.positive),
    );
  const root = b.add(
    "cases@1",
    [p.source, ...order.flatMap((v: any) => [v.c.assumption, v.c.result])],
    b.clause([
      {
        cell: effect.cell,
        symbol: effect.symbol,
        positive: effect.kind === "place",
      },
    ]),
  );
  const effects = [effect],
    roots = [root];
  if (effect.kind === "place")
    for (const cell of view.assembly.problem.cells) {
      if (
        cell === effect.cell ||
        view.state.values[cell] ||
        !(view.state.domains[cell] & (1 << (effect.symbol - 1)))
      )
        continue;
      const house = view.assembly.allDifferent.find(
        (h) => h.cells.includes(cell) && h.cells.includes(effect.cell),
      );
      if (!house) continue;
      const weak = b.weak(
        { cell: effect.cell, symbol: effect.symbol, positive: true },
        { cell, symbol: effect.symbol, positive: true },
      );
      roots.push(
        b.add(
          "resolution@1",
          [root, weak],
          b.clause([{ cell, symbol: effect.symbol, positive: false }]),
        ),
      );
      effects.push({ kind: "remove", cell, symbol: effect.symbol });
    }
  return b.proposal(
    "C28",
    { ...p, alias: "OR-k forcing", certificate: { branches, root } } as Json,
    effects,
    roots,
  );
}
