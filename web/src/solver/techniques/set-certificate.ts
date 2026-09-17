import { matchingFacts } from "../state/source-index";
import type { Json } from "../problem";
import type { ReadView, Literal } from "../state/types";
import type { DeductionProposal, Effect } from "../proof/types";
import { clause, literals } from "../proof/primitives";
import { ChainCertificate, candidate, type ChainWork } from "./chains-certificate";
import type { PatternGraph } from "./pattern-runtime";
import type { SdcPattern, AlignedPattern, CountPattern, SetPattern } from "./set-contracts";
import { findHouse, symbolMask } from "../state/read";
import { defined } from "../invariants";

export const setDigits = (mask: number) =>
  Array.from({ length: 9 }, (_, i) => i + 1).filter((symbol) => mask & symbolMask(symbol));
export const setUnion = (view: ReadView, cells: number[]) =>
  setDigits(cells.reduce((mask, cell) => mask | view.state.domains[cell], 0));
export function* combinations(
  xs: readonly number[],
  size: number,
  start = 0,
  prefix: number[] = [],
): Generator<number[]> {
  if (!size) {
    yield prefix;
    return;
  }
  for (let i = start; i <= xs.length - size; i++)
    yield* combinations(xs, size - 1, i + 1, [...prefix, xs[i]]);
}
/** Constant-memory Cartesian cursor; includes conflicting rows and empty domains. */
export function* assignments(domains: readonly number[]): Generator<number[]> {
  const choices = domains.map(setDigits),
    indexes = choices.map(() => 0);
  if (choices.some((xs) => !xs.length)) return;
  for (;;) {
    yield choices.map((xs, i) => xs[indexes[i]]);
    let at = indexes.length - 1;
    while (at >= 0 && ++indexes[at] === choices[at].length) {
      indexes[at] = 0;
      at--;
    }
    if (at < 0) return;
  }
}

/** Untrusted set algebra. Complete table partitions are local, never a board
 * solve. Compiler state and yielded proposals borrow the invocation lease. */
export class SetCertificate {
  readonly algebra: ChainCertificate;
  constructor(
    readonly view: ReadView,
    readonly graph: PatternGraph,
  ) {
    if (!graph.index.completeFor(view)) throw Error("incomplete-set-source-prefix");
    this.algebra = new ChainCertificate(view, graph);
  }
  *table(
    cells: number[],
    scopes: { cells: number[]; house: string }[],
  ): Generator<ChainWork, number> {
    const certificate = this.algebra,
      constraints: number[] = [];
    for (const scope of scopes) {
      yield { kind: "work", units: 1 };
      const house = defined(findHouse(this.view, scope.house), "findHouse");
      const source = matchingFacts(this.view, { kind: "all-different", cells: house.cells }).find(
        (fact) => !fact.openAssumptions.length,
      );
      if (!source) throw Error("missing-set-source");
      constraints.push(
        certificate.add("all-different-subset@1", [source.id], {
          kind: "all-different",
          cells: scope.cells,
        }),
      );
    }
    const sources = [...cells.map((cell) => this.view.state.domainFacts[cell]), ...constraints];
    const build = function* (box: number[]): Generator<ChainWork, { id: number; count: number }> {
      yield { kind: "work", units: 1 };
      const choices = box.map(setDigits),
        volume = choices.reduce((n, xs) => n * xs.length, 1);
      if (volume > 256) {
        const at = choices.findIndex((xs) => xs.length > 1),
          left = [...box],
          right = [...box];
        left[at] = symbolMask(choices[at][0]);
        right[at] &= ~left[at];
        const first = yield* build(left),
          rightTable = yield* build(right),
          count = first.count + rightTable.count;
        return {
          id: certificate.add("table-union@1", [first.id, rightTable.id], {
            kind: "table",
            cells,
            count,
            definition: certificate.next,
          }),
          count,
        };
      }
      let count = 0;
      for (const row of assignments(box)) {
        yield { kind: "work", units: 1 };
        if (
          scopes.every(
            (scope) =>
              new Set(scope.cells.map((cell) => row[cells.indexOf(cell)])).size ===
              scope.cells.length,
          )
        )
          count++;
      }
      return {
        id: certificate.add(
          "table-filter@1",
          sources,
          { kind: "table", cells, count, definition: certificate.next },
          { cells, box },
        ),
        count,
      };
    };
    return (yield* build(cells.map((cell) => this.view.state.domains[cell]))).id;
  }
  *compile(input: SetPattern, effects: Effect[]): Generator<ChainWork, DeductionProposal> {
    const pattern = structuredClone(input),
      certificate = this.algebra;
    if (pattern.kind === "sdc") yield* this.sdc(pattern, effects);
    else if (pattern.kind === "aligned") yield* this.aligned(pattern, effects);
    else yield* this.count(pattern, effects);
    const roots =
      pattern.kind === "sdc"
        ? pattern.routes.map((route) => route.root)
        : pattern.kind === "aligned"
          ? pattern.roots
          : [pattern.root];
    return certificate.close(
      pattern.kind === "sdc" ? "c20@1" : "c21@1",
      pattern as unknown as Json,
      effects,
      roots,
    );
  }
  private *sdc(pattern: SdcPattern, effects: Effect[]): Generator<ChainWork> {
    const cells = [...pattern.intersection, ...pattern.lineSide, ...pattern.boxSide].sort(
      (left, right) => left - right,
    );
    pattern.table = yield* this.table(cells, [
      {
        cells: [...pattern.intersection, ...pattern.lineSide].sort((left, right) => left - right),
        house: pattern.line,
      },
      {
        cells: [...pattern.intersection, ...pattern.boxSide].sort((left, right) => left - right),
        house: pattern.box,
      },
    ]);
    for (const [i, route] of pattern.routes.entries()) {
      route.projection = this.algebra.add(
        "table-project@1",
        [pattern.table],
        clause(route.occurrences.map((cell) => candidate(cell, effects[i].symbol))),
      );
      route.visibility = [];
      for (const cell of route.occurrences)
        route.visibility.push(
          yield* this.algebra.weak(
            candidate(cell, effects[i].symbol),
            candidate(effects[i].cell, effects[i].symbol),
          ),
        );
      route.root = yield* this.algebra.eliminate(route.projection, effects[i]);
    }
  }
  private *aligned(pattern: AlignedPattern, effects: Effect[]): Generator<ChainWork> {
    const certificate = this.algebra;
    for (const set of pattern.auxiliaries) set.table = yield* this.table(set.cells, [set]);
    const pairs = pattern.selected.flatMap((left, i) =>
      pattern.selected.slice(i + 1).map((cell) => [left, cell]),
    );
    pattern.rejections = [];
    let index = 0;
    for (const tuple of assignments(pattern.domains)) {
      yield { kind: "work", units: 1 };
      const reason = pattern.reasons[index++];
      if (!reason) {
        pattern.rejections.push(-1);
        continue;
      }
      if (reason < 0) {
        const pair = pairs[-reason - 1];
        pattern.rejections.push(
          yield* certificate.weak(
            candidate(pair[0], tuple[pattern.selected.indexOf(pair[0])]),
            candidate(pair[1], tuple[pattern.selected.indexOf(pair[1])]),
          ),
        );
        continue;
      }
      const auxiliary = pattern.auxiliaries[reason - 1],
        blocked: { literal: Literal; selected: number }[] = [];
      for (const cell of auxiliary.cells)
        for (const symbol of setDigits(this.view.state.domains[cell])) {
          yield { kind: "work", units: 1 };
          const selected = pattern.selected.findIndex((other, i) =>
            this.graph.has(candidate(cell, symbol), candidate(other, tuple[i])),
          );
          if (selected >= 0) blocked.push({ literal: candidate(cell, symbol), selected });
        }
      let root = certificate.add(
        "table-project@1",
        [auxiliary.table],
        clause(blocked.map((value) => value.literal)),
      );
      for (const value of blocked)
        root = certificate.resolve(
          root,
          yield* certificate.weak(
            value.literal,
            candidate(pattern.selected[value.selected], tuple[value.selected]),
          ),
          value.literal,
        );
      pattern.rejections.push(root);
    }
    const sources = [
      ...pattern.selected.map((cell) => certificate.cell(cell)),
      ...pattern.rejections.filter((n) => n >= 0),
    ];
    const packaged = certificate
      .package([...sources, ...pattern.auxiliaries.map((set) => set.table)])
      .slice(0, sources.length);
    const mapped = new Map(sources.map((id, i) => [id, packaged[i]]));
    pattern.roots = [];
    // Eliminate only the declared 2..4 selected variables. A recursive cell
    // cover resolution avoids exponential generic clause cross-products.
    for (const effect of effects) {
      const rest = pattern.selected.filter((cell) => cell !== effect.cell);
      const infer = function* (
        depth: number,
        values: Map<number, number>,
      ): Generator<ChainWork, number> {
        yield { kind: "work", units: 1 };
        if (depth === rest.length) {
          let tupleIndex = 0;
          for (let i = 0; i < pattern.selected.length; i++)
            tupleIndex =
              tupleIndex * setDigits(pattern.domains[i]).length +
              setDigits(pattern.domains[i]).indexOf(
                defined(values.get(pattern.selected[i]), "value"),
              );
          const root = pattern.rejections[tupleIndex];
          if (root < 0) throw Error("retained-aligned-candidate");
          return defined(mapped.get(root), "mapped");
        }
        const cell = rest[depth],
          alternatives = setDigits(certificate.view.state.domains[cell]);
        let root = defined(mapped.get(certificate.cell(cell)), "mapped");
        for (const symbol of alternatives) {
          values.set(cell, symbol);
          const rejected = yield* infer(depth + 1, values);
          if (
            !literals(defined(certificate.values.get(rejected), "value")).some(
              (literal) => literal.cell === cell,
            )
          )
            return rejected;
          root = certificate.resolve(root, rejected, candidate(cell, symbol));
        }
        return root;
      };
      pattern.roots.push(yield* infer(0, new Map([[effect.cell, effect.symbol]])));
    }
  }
  private *count(pattern: CountPattern, _effects: Effect[]): Generator<ChainWork> {
    const certificate = this.algebra;
    for (const scope of pattern.scopes) {
      yield { kind: "work", units: 1 };
      const house = defined(findHouse(this.view, scope.house), "findHouse");
      const fact = matchingFacts(this.view, { kind: "all-different", cells: house.cells }).find(
        (entry) => !entry.openAssumptions.length,
      );
      if (!fact) throw Error("missing-set-source");
      scope.root = certificate.add("all-different-subset@1", [fact.id], {
        kind: "all-different",
        cells: scope.cells,
      });
    }
    const cells = [...new Set([...pattern.cells, pattern.target.cell])].sort(
      (left, cell) => left - cell,
    );
    pattern.assumption = certificate.add(
      "assume@1",
      [],
      clause([candidate(pattern.target.cell, pattern.target.symbol)]),
    );
    certificate.scope = [pattern.assumption];
    pattern.contradiction = certificate.add(
      "subset-count@1",
      [
        pattern.assumption,
        ...cells.map((cell) => this.view.state.domainFacts[cell]),
        ...pattern.scopes.map((scope) => scope.root),
      ],
      { kind: "false" },
      {
        cells: pattern.cells,
        symbols: pattern.symbols,
        capacities: pattern.capacities,
        target: pattern.target,
      },
    );
    certificate.scope = [];
    pattern.root = certificate.add(
      "discharge@1",
      [pattern.assumption, pattern.contradiction],
      clause([{ ...candidate(pattern.target.cell, pattern.target.symbol), positive: false }]),
    );
  }
}
