import { fixtureView, originalCluePrefix, type TechniqueFixture } from "./acceptance";
import { discoveryContext } from "./discovery-context";
import { getTechniques } from "../../src/solver/techniques/registry";
import { checkProposal } from "../../src/solver/proof/checker";
import { commitChecked, retainedProof } from "../../src/solver/state/candidates";
import type { DeductionProposal } from "../../src/solver/proof/types";
import type { ReadView } from "../../src/solver/state/types";
import { IndependentChainProof } from "./chains-acceptance";
import type { Json } from "../../src/solver/problem";

const cache = new Map<string, { view: ReadView; prefix: DeductionProposal[] }>();
/** Original-clue prefix, independently specified operations matched to real named discovery. */
export function forcingView(f: TechniqueFixture & { independentPrefix?: any[] }): {
  view: ReadView;
  prefix: DeductionProposal[];
} {
  const cached = cache.get(f.id);
  if (cached) return cached;
  if (!f.independentPrefix) return { view: fixtureView(f), prefix: [...originalCluePrefix(f)] };
  const values = [...f.givens].map(Number),
    sees = (a: number, b: number) =>
      a !== b &&
      (Math.floor(a / 9) === Math.floor(b / 9) ||
        a % 9 === b % 9 ||
        (Math.floor(a / 27) === Math.floor(b / 27) &&
          Math.floor((a % 9) / 3) === Math.floor((b % 9) / 3)));
  const domains = values.map((s, c) =>
    s
      ? 1 << (s - 1)
      : Array.from({ length: 9 }, (_, i) => i + 1)
          .filter((d) => !values.some((v, p) => v === d && sees(c, p)))
          .reduce((m, d) => m | (1 << (d - 1)), 0),
  );
  const original = { ...f, preState: { values, domains } };
  let view = fixtureView(original);
  const prefix = [...originalCluePrefix(original)];
  for (const step of f.independentPrefix) {
    if (step.kind === "singleton-peer" && view.state.values[step.cell]) continue;
    const id = step.kind === "locked" ? "c03@1" : step.kind === "hidden-single" ? "c02@1" : "c01@1",
      context = discoveryContext();
    const cursor = getTechniques("classic-expanded@1")
      .find((d) => d.id === id)!
      .discover(view, context);
    let proposal: DeductionProposal | undefined;
    try {
      for (const e of cursor)
        if (e.kind === "proposal") {
          const p = e.proposal.pattern as any;
          if (
            step.kind === "locked"
              ? p.cover === `${step.house}:symbol:${Math.log2(step.bit) + 1}` &&
                p.group === step.otherHouse
              : step.kind === "hidden-single"
                ? p.cover === `${step.house}:symbol:${Math.log2(step.bit) + 1}`
                : p.cell === step.cell
          ) {
            proposal = e.proposal;
            break;
          }
        }
    } finally {
      cursor.return();
    }
    if (!proposal) throw Error("missing-independent-prefix-operation");
    const result = [
      ...checkProposal(proposal, {
        view,
        retained: retainedProof(view),
        limits: context.limits,
        policy: "unconditional",
        uniqueEvidenceId: null,
      }),
    ].at(-1);
    if (result?.kind !== "checked")
      throw Error("rejected-independent-prefix:" + JSON.stringify(result));
    prefix.push(result.step.proposal);
    view = commitChecked(view, result.step).view;
  }
  if (
    JSON.stringify(view.state.domains) !== JSON.stringify(f.preState.domains) ||
    JSON.stringify(view.state.values) !== JSON.stringify(f.preState.values)
  )
    throw Error("independent-net-prefix-mismatch");
  const result = { view, prefix };
  cache.set(f.id, result);
  return result;
}

/** Separate test algebra: no production forcing compiler, detector or index. */
export function independentForcing(f: TechniqueFixture): DeductionProposal {
  const { view } = forcingView(f),
    b = new IndependentChainProof(view),
    p = structuredClone(f.expectedPattern) as any;
  const house = (id: string) => view.assembly.allDifferent.find((h) => h.id === id)!.cells;
  const source = (id: string, symbol?: number) =>
    [...view.facts.values()].find((f) => {
      const v = f.proposition;
      return symbol === undefined
        ? v.kind === "all-different" && v.cells.join() === house(id).join()
        : v.kind === "cover" && v.symbol === symbol && v.cells.join() === house(id).join();
    })!.id;
  const path = (assumption: number, links: any[]) => {
    let end = assumption;
    const clauses: number[] = [],
      steps: number[] = [];
    if (!links.length) end = b.package([assumption])[0];
    for (const link of links) {
      const r = link.reason;
      let clause: number;
      if (r.kind === "cell-cover") clause = b.cell(r.cell);
      else if (r.kind === "house-cover") clause = b.house(r.house, r.symbol);
      else
        clause = b.add(
          "weak-link@1",
          [r.kind === "cell-conflict" ? view.state.domainFacts[r.cell] : source(r.house)],
          b.clause([{ ...link.from, positive: false }, link.to]),
        );
      clauses.push(clause);
      end = b.add("resolution@1", [end, clause], b.clause([link.to]));
      steps.push(end);
    }
    return { end, clauses, links: steps };
  };
  if (f.rowId === "C22") {
    let cover: number | null = null;
    if (p.kind === "cell") cover = b.cell(p.cover.cell);
    else if (p.kind === "unit") cover = b.house(p.cover.house, p.cover.symbol);
    else if (p.kind === "digit") {
      const a = p.cover.candidate;
      cover = b.cell(a.cell);
      const others = Array.from({ length: 9 }, (_, i) => i + 1).filter(
        (s) => s !== a.symbol && view.state.domains[a.cell] & (1 << (s - 1)),
      );
      others.forEach((symbol, i) => {
        const weak = b.weak({ ...a, symbol }, a);
        cover = b.add(
          "resolution@1",
          [cover!, weak],
          b.clause([
            a,
            { ...a, positive: false },
            ...others.slice(i + 1).map((symbol) => ({ ...a, symbol })),
          ]),
        );
      });
    }
    const branches = p.branches.map((branch: any) => {
      b.lexicalScope = [];
      const assumption = b.add("assume@1", [], b.clause([branch.assumption]));
      b.lexicalScope = [assumption];
      const paths = branch.paths.map((links: any[]) => path(assumption, links)),
        result =
          branch.result === "false"
            ? b.add(
                "contradiction@1",
                paths.map((p: any) => p.end),
                { kind: "false" },
              )
            : paths[0].end;
      return { assumption, paths, result };
    });
    b.lexicalScope = [];
    const effect = f.expectedEffects[0],
      conclusion = b.clause([
        { cell: effect.cell, symbol: effect.symbol, positive: effect.kind === "place" },
      ]);
    const ordered = p.branches
      .map((branch: any, i: number) => ({ a: branch.assumption, c: branches[i] }))
      .sort(
        (x: any, y: any) =>
          x.a.cell - y.a.cell ||
          x.a.symbol - y.a.symbol ||
          Number(x.a.positive) - Number(y.a.positive),
      );
    const root =
      p.kind === "nishio"
        ? b.add("discharge@1", [branches[0].assumption, branches[0].result], conclusion)
        : b.add(
            "cases@1",
            [cover!, ...ordered.flatMap((v: any) => [v.c.assumption, v.c.result])],
            conclusion,
          );
    // D088 retains the independently assembled full negative theorem. Empty
    // effects omit candidate/domain closure; its source clauses keep their own
    // globally scoped primitive ancestry inside the complete named proof.
    if (p.mode === "cache") {
      if (effect.kind !== "remove") throw Error("independent-cache-negative-only");
      return b.proposal(
        "C22",
        {
          ...p,
          cacheTarget: { cell: effect.cell, symbol: effect.symbol, positive: false },
          certificate: { cover, branches, root },
        } as Json,
        [],
        [root],
      );
    }
    const effects = [effect],
      roots = [root];
    if (effect.kind === "place")
      for (const cell of view.assembly.problem.cells)
        if (
          !view.state.values[cell] &&
          cell !== effect.cell &&
          view.state.domains[cell] & (1 << (effect.symbol - 1)) &&
          view.assembly.peers[effect.cell].includes(cell)
        ) {
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
      "C22",
      { ...p, certificate: { cover, branches, root } } as Json,
      effects,
      roots,
    );
  }
  const fish = p.fish,
    z = fish.symbol,
    assumption = b.add("assume@1", [], b.clause([{ ...p.target, positive: true }]));
  b.lexicalScope = [assumption];
  const fins = p.finBranches.map((fin: any) => {
    const proof = path(assumption, fin.path),
      domain = b.add("domain-restrict@1", [view.state.domainFacts[fin.fin], proof.end], {
        kind: "domain",
        cell: fin.fin,
        mask: view.state.domains[fin.fin] & ~(1 << (z - 1)),
      });
    return { fin: fin.fin, path: proof, domain };
  });
  const covers = fish.bases.map((h: string) => ({ premise: source(h, z), coefficient: 1 })),
    capacities = fish.covers.map((h: string) => ({ premise: source(h), coefficient: 1 }));
  const count = b.add(
    "cover-count@1",
    [
      ...covers.map((c: any) => c.premise),
      ...capacities.map((c: any) => c.premise),
      ...p.incidence.flatMap((w: number, c: number) =>
        w < 0 && !fish.fins.includes(c) ? [view.state.domainFacts[c]] : [],
      ),
      ...fins.map((f: any) => f.domain),
    ],
    b.clause([{ ...p.target, positive: false }]),
    { symbol: z, covers, capacities },
  );
  const contradiction = b.add("contradiction@1", [assumption, count], { kind: "false" });
  b.lexicalScope = [];
  const root = b.add(
    "discharge@1",
    [assumption, contradiction],
    b.clause([{ ...p.target, positive: false }]),
  );
  return b.proposal(
    "C24",
    {
      ...p,
      alias: "Kraken Fish",
      certificate: { assumption, fins, count, contradiction, root },
    } as Json,
    f.expectedEffects,
    [root],
  );
}

/** Coordinate/set-only basic replay. Author counts never establish proof size. */
export function independentNetGeometry(f: TechniqueFixture & { independentPrefix?: any[] }): void {
  const houses = new Map<string, number[]>();
  for (const kind of ["row", "column", "box"])
    for (let n = 0; n < 9; n++)
      houses.set(
        `${kind}:${n}`,
        Array.from({ length: 81 }, (_, c) => c).filter(
          (c) =>
            (kind === "row"
              ? Math.floor(c / 9)
              : kind === "column"
                ? c % 9
                : Math.floor(c / 27) * 3 + Math.floor((c % 9) / 3)) === n,
        ),
      );
  const peers = (c: number) =>
    [...new Set([...houses.values()].filter((h) => h.includes(c)).flat())]
      .filter((p) => p !== c)
      .sort((a, b) => a - b);
  const givens = [...f.givens].map(Number),
    bits = (m: number) => Array.from({ length: 9 }, (_, i) => 1 << i).filter((b) => m & b);
  const m = givens.map((s, c) =>
    s
      ? 1 << (s - 1)
      : bits(511)
          .filter((b) => !peers(c).some((p) => givens[p] && (1 << (givens[p] - 1)) & b))
          .reduce((a, b) => a | b, 0),
  );
  const require = (ok: unknown) => {
    if (!ok) throw Error("independent-net-geometry");
  };
  const steps = (steps: any[], m: number[]) => {
    for (const st of steps) {
      let expected: number[][] = [];
      if (st.kind === "singleton-peer") {
        require(m[st.cell] === st.mask && bits(st.mask).length === 1);
        expected = peers(st.cell)
          .filter((c) => m[c] & st.mask)
          .map((c) => [c, m[c] & ~st.mask]);
      } else if (st.kind === "hidden-single" || st.kind === "locked") {
        const support = houses.get(st.house)!.filter((c) => m[c] & st.bit);
        require(JSON.stringify(support) === JSON.stringify(st.supports));
        if (st.kind === "hidden-single") {
          require(support.length === 1);
          expected = [[support[0], st.bit]];
        } else {
          require(
            support.length >= 2 &&
              support.length <= 3 &&
              support.every((c) => houses.get(st.otherHouse)!.includes(c)),
          );
          expected = houses
            .get(st.otherHouse)!
            .filter((c) => !houses.get(st.house)!.includes(c) && m[c] & st.bit)
            .map((c) => [c, m[c] & ~st.bit]);
        }
      } else {
        require(
          st.kind === "naked-subset" &&
            st.cells.length >= 2 &&
            st.cells.length <= 4 &&
            st.cells.every((c: number) => houses.get(st.house)!.includes(c)),
        );
        const mask = st.cells.reduce((a: number, c: number) => a | m[c], 0);
        require(mask === st.mask && bits(mask).length === st.cells.length);
        expected = houses
          .get(st.house)!
          .filter((c) => !st.cells.includes(c) && m[c] & mask)
          .map((c) => [c, m[c] & ~mask]);
      }
      require(
        JSON.stringify(expected.sort((a, b) => a[0] - b[0])) ===
          JSON.stringify([...st.effects].sort((a, b) => a[0] - b[0])),
      );
      for (const [cell, mask] of expected) m[cell] = mask;
    }
  };
  steps(f.independentPrefix!, m);
  require(JSON.stringify(m) === JSON.stringify(f.preState.domains));
  const p = f.expectedPattern as any;
  m[p.outer.assumption.cell] = 1 << (p.outer.assumption.symbol - 1);
  steps(p.outer.steps, m);
  if (p.branches) {
    require(
      JSON.stringify(bits(m[p.innerCell]).map((b) => Math.log2(b) + 1)) ===
        JSON.stringify(p.innerAlternatives),
    );
    require(p.branches.length === p.innerAlternatives.length);
    for (const [i, branch] of p.branches.entries()) {
      require(
        branch.assumption.cell === p.innerCell &&
          branch.assumption.symbol === p.innerAlternatives[i],
      );
      const local = [...m];
      local[p.innerCell] = 1 << (branch.assumption.symbol - 1);
      steps(branch.steps, local);
      require(local[branch.contradiction.cell] === 0);
    }
  } else require(m[p.outer.contradiction.cell] === 0);
}

/** Independent finite-operation certificate interpreter. Sources are looked up
 * by mathematical assertions; no production net compiler or grammar is used.
 */
export function independentNetCertificate(f: TechniqueFixture): DeductionProposal {
  const { view } = forcingView(f),
    b = new IndependentChainProof(view),
    plan = f.expectedPattern as any;
  const houses = new Map(view.assembly.allDifferent.map((h) => [h.id, h.cells]));
  const fact = (house: string, symbol?: number) =>
    [...view.facts.values()].find((f) => {
      const p = f.proposition;
      return symbol === undefined
        ? p.kind === "all-different" && p.cells.join() === houses.get(house)!.join()
        : p.kind === "cover" && p.symbol === symbol && p.cells.join() === houses.get(house)!.join();
    })!.id;
  type Domains = { m: number[]; r: number[] };
  const copy = (d: Domains): Domains => ({ m: [...d.m], r: [...d.r] });
  const restrict = (d: Domains, c: number, mask: number, root: number) => {
    d.r[c] = b.add("domain-restrict@1", [d.r[c], root], { kind: "domain", cell: c, mask });
    d.m[c] = mask;
  };
  const apply = (d: Domains, steps: any[]) => {
    for (const s of steps) {
      let source = 0;
      const digit = Math.log2(s.mask ?? s.bit) + 1;
      if (s.kind === "singleton-peer")
        source = b.add(
          "cover-clause@1",
          [d.r[s.cell]],
          b.clause([{ cell: s.cell, symbol: digit, positive: true }]),
        );
      if (s.kind === "hidden-single" || s.kind === "locked") {
        const cells = houses.get(s.house)!,
          symbol = Math.log2(s.bit) + 1,
          support = b.add("support@1", [fact(s.house, symbol), ...cells.map((c) => d.r[c])], {
            kind: "cover",
            cells: cells.filter((c) => d.m[c] & s.bit),
            symbol,
          });
        source = b.add(
          "cover-clause@1",
          [support],
          b.clause(s.supports.map((cell: number) => ({ cell, symbol, positive: true }))),
        );
      }
      for (const [cell, mask] of s.effects) {
        if (s.kind === "hidden-single") {
          restrict(d, cell, mask, source);
          continue;
        }
        for (let symbol = 1; symbol <= 9; symbol++)
          if (d.m[cell] & ~mask & (1 << (symbol - 1))) {
            let root = source;
            if (s.kind === "naked-subset")
              root = b.add(
                "hall@1",
                [fact(s.house), ...s.cells.map((c: number) => d.r[c])],
                b.clause([{ cell, symbol, positive: false }]),
              );
            else {
              const supports = s.kind === "singleton-peer" ? [s.cell] : s.supports,
                house =
                  s.kind === "singleton-peer"
                    ? [...houses].find(([, cs]) => cs.includes(cell) && cs.includes(s.cell))![0]
                    : s.otherHouse;
              for (let i = 0; i < supports.length; i++) {
                const weak = b.add(
                  "weak-link@1",
                  [fact(house)],
                  b.clause([
                    { cell: supports[i], symbol, positive: false },
                    { cell, symbol, positive: false },
                  ]),
                );
                root = b.add(
                  "resolution@1",
                  [root, weak],
                  b.clause([
                    ...supports
                      .slice(i + 1)
                      .map((cell: number) => ({ cell, symbol, positive: true })),
                    { cell, symbol, positive: false },
                  ]),
                );
              }
            }
            restrict(d, cell, d.m[cell] & ~(1 << (symbol - 1)), root);
          }
      }
    }
  };
  const d: Domains = { m: [...view.state.domains], r: [...view.state.domainFacts] },
    value = { ...plan.outer.assumption, positive: true };
  const assumption = b.add("assume@1", [], b.clause([value]));
  b.lexicalScope = [assumption];
  restrict(d, value.cell, 1 << (value.symbol - 1), assumption);
  apply(d, plan.outer.steps);
  let result: number,
    cover: number | null = null;
  const children: { assumption: number; result: number; cover: null; children: never[] }[] = [];
  if (plan.branches) {
    cover = b.add(
      "cover-clause@1",
      [d.r[plan.innerCell]],
      b.clause(
        plan.innerAlternatives.map((symbol: number) => ({
          cell: plan.innerCell,
          symbol,
          positive: true,
        })),
      ),
    );
    for (const child of plan.branches) {
      b.lexicalScope = [assumption];
      const a = b.add("assume@1", [], b.clause([{ ...child.assumption, positive: true }]));
      b.lexicalScope = [assumption, a];
      const local = copy(d);
      restrict(local, child.assumption.cell, 1 << (child.assumption.symbol - 1), a);
      apply(local, child.steps);
      children.push({
        assumption: a,
        result: b.add("contradiction@1", [local.r[child.contradiction.cell]], { kind: "false" }),
        cover: null,
        children: [],
      });
    }
    b.lexicalScope = [assumption];
    result = b.add("cases@1", [cover, ...children.flatMap((c) => [c.assumption, c.result])], {
      kind: "false",
    });
  } else result = b.add("contradiction@1", [d.r[plan.outer.contradiction.cell]], { kind: "false" });
  b.lexicalScope = [];
  const root = b.add(
      "discharge@1",
      [assumption, result],
      b.clause([{ ...value, positive: false }]),
    ),
    mode = plan.mode ?? (plan.branches ? "nested" : "static");
  return b.proposal(
    "C23",
    {
      kind: "net",
      mode,
      alias:
        mode === "nested"
          ? "Nested forcing"
          : mode === "dynamic"
            ? "Dynamic forcing nets"
            : "Static forcing nets",
      branch: { assumption, result, cover, children },
      root,
    },
    [...f.expectedEffects],
    [root],
  );
}
