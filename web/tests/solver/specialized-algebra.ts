/** Independent direct-coordinate finite checker. No production imports,
 * detector helpers, primitive arithmetic or exact solver participates. */
export const independentDigits = (mask: number) =>
  [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((s) => Math.floor(mask / 2 ** (s - 1)) % 2 === 1);
export const independentPeer = (a: number, b: number) =>
  a !== b &&
  (Math.floor(a / 9) === Math.floor(b / 9) ||
    a % 9 === b % 9 ||
    (Math.floor(a / 27) === Math.floor(b / 27) &&
      Math.floor((a % 9) / 3) === Math.floor((b % 9) / 3)));
export function* independentProduct(sets: readonly (readonly number[])[]): Generator<number[]> {
  const indexes = sets.map(() => 0);
  if (sets.some((s) => !s.length)) return;
  while (true) {
    yield sets.map((s, i) => s[indexes[i]]);
    let i = sets.length - 1;
    while (i >= 0 && ++indexes[i] === sets[i].length) {
      indexes[i] = 0;
      i--;
    }
    if (i < 0) return;
  }
}
export function independentFireworks(f: any): number[][] {
  const p = f.expectedPattern,
    rows = [];
  for (const assignment of independentProduct(
    p.selected.map((c: number) => independentDigits(f.preState.domains[c])),
  ))
    if (
      p.components.every((part: any) =>
        part.symbols.every((s: number) =>
          [part.intersection, part.rowWing, part.columnWing].some(
            (c) => assignment[p.selected.indexOf(c)] === s,
          ),
        ),
      )
    )
      rows.push(assignment);
  return rows;
}
export function independentRing(f: any) {
  const p = f.expectedPattern,
    choices: number[][][] = p.groups.map((g: number[]) =>
      [...independentProduct(g.map((c) => independentDigits(f.preState.domains[c])))].filter(
        (row) => row[0] !== row[1],
      ),
    );
  const assigned = new Map<number, number>();
  let survivors = 0,
    visited = 0;
  const walk = (i: number) => {
    if (i === 8) {
      survivors++;
      for (let k = 0; k < 8; k++)
        for (const s of p.links[k].symbols)
          if (![...p.groups[k], ...p.groups[(k + 1) % 8]].some((c) => assigned.get(c) === s))
            throw Error("independent-nonclosing-ring");
      return;
    }
    for (const row of choices[i]) {
      visited++;
      if (
        row.some((s, j) =>
          [...assigned].some(([c, t]) => s === t && independentPeer(c, p.groups[i][j])),
        )
      )
        continue;
      row.forEach((s, j) => assigned.set(p.groups[i][j], s));
      walk(i + 1);
      p.groups[i].forEach((c: number) => assigned.delete(c));
    }
  };
  walk(0);
  return { survivors, visited, local: choices.map((c) => c.length) };
}
interface IndependentBaseImplication {
  base: number;
  symbol: number;
  targets: number[];
  kind: "count" | "domain";
  tested: number;
}
const independentEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function independentRequire(condition: unknown, reason: string): asserts condition {
  if (!condition) throw Error("independent-junior-" + reason);
}
function independentHouse(name: string): number[] {
  independentRequire(typeof name === "string" && /^(row|column|box):[0-8]$/.test(name), "house");
  const [kind, index] = name.split(":");
  return Array.from({ length: 81 }, (_, c) => c).filter(
    (c) =>
      (kind === "row"
        ? Math.floor(c / 9)
        : kind === "column"
          ? c % 9
          : Math.floor(c / 27) * 3 + Math.floor((c % 9) / 3)) === Number(index),
  );
}
/** Derive the base implications by enumerating the three complete cross-line
 * placements. This is independent of the production signed-incidence arithmetic:
 * no base/target equality is assumed and no expected effect filters a tuple. */
function independentJunior(f: any, p: any): IndependentBaseImplication[] {
  const cell = (c: number) => Number.isInteger(c) && c >= 0 && c < 81;
  const pair = (v: unknown): v is number[] =>
    Array.isArray(v) && v.length === 2 && v.every(cell) && v[0] !== v[1];
  independentRequire(
    ["row", "column"].includes(p.orientation) && pair(p.base) && pair(p.targets),
    "geometry",
  );
  independentRequire(
    new Set([...p.base, ...p.targets]).size === 4 &&
      [...p.base, ...p.targets].every((c) => !f.preState.values[c]),
    "distinct-base-targets",
  );
  const along = (c: number) => (p.orientation === "row" ? Math.floor(c / 9) : c % 9),
    across = (c: number) => (p.orientation === "row" ? c % 9 : Math.floor(c / 9));
  const at = (r: number, c: number) => (p.orientation === "row" ? 9 * r + c : 9 * c + r);
  const baseLine = along(p.base[0]),
    band = Math.floor(baseLine / 3),
    stack = Math.floor(across(p.base[0]) / 3);
  independentRequire(
    p.base.every((c: number) => along(c) === baseLine && Math.floor(across(c) / 3) === stack),
    "base-box-line",
  );
  const targetRows = p.targets.map(along),
    targetColumns = p.targets.map(across);
  independentRequire(
    targetRows.every((r: number) => Math.floor(r / 3) === band && r !== baseLine) &&
      new Set(targetRows).size === 2 &&
      new Set(targetColumns.map((c: number) => Math.floor(c / 3))).size === 2 &&
      targetColumns.every((c: number) => Math.floor(c / 3) !== stack) &&
      !independentPeer(...(p.targets as [number, number])),
    "targets",
  );
  const companions = p.targets.map((_: number, i: number) =>
    at(targetRows[1 - i], targetColumns[i]),
  );
  independentRequire(
    independentEqual(p.companions, companions) &&
      new Set([...p.base, ...p.targets, ...companions]).size === 6,
    "companions",
  );
  const symbols = [
    ...new Set<number>(p.base.flatMap((c: number) => independentDigits(f.preState.domains[c]))),
  ].sort((a, b) => a - b);
  independentRequire(
    symbols.length >= 3 &&
      symbols.length <= 4 &&
      independentEqual(symbols, p.baseSymbols) &&
      companions.every((c: number) =>
        symbols.every((s) => !independentDigits(f.preState.domains[c]).includes(s)),
      ),
    "base-symbols-or-companions",
  );
  const unused = [stack * 3, stack * 3 + 1, stack * 3 + 2].find(
    (c) => !p.base.includes(at(baseLine, c)),
  )!;
  const crossNames = [unused, ...targetColumns].map(
      (c) => `${p.orientation === "row" ? "column" : "row"}:${c}`,
    ),
    crossLines = crossNames.map(independentHouse);
  independentRequire(independentEqual(p.crossLines, crossNames), "cross-lines");
  const sCells = Array.from({ length: 81 }, (_, c) => c).filter(
    (c) => Math.floor(along(c) / 3) !== band && [unused, ...targetColumns].includes(across(c)),
  );
  independentRequire(
    Array.isArray(p.sCells) &&
      independentEqual(
        [...p.sCells].sort((a, b) => a - b),
        sCells,
      ),
    "S-cells",
  );
  independentRequire(Array.isArray(p.covers) && p.covers.length === symbols.length, "covers");
  const result: IndependentBaseImplication[] = [];
  for (const [i, symbol] of symbols.entries()) {
    const cover = p.covers[i],
      occurrences = sCells.filter((c) => independentDigits(f.preState.domains[c]).includes(symbol));
    independentRequire(
      cover.symbol === symbol &&
        Array.isArray(cover.houses) &&
        cover.houses.length >= 1 &&
        cover.houses.length <= 2 &&
        new Set(cover.houses).size === cover.houses.length,
      "cover-geometry",
    );
    const scopes = cover.houses.map(independentHouse);
    independentRequire(
      independentEqual(occurrences, cover.occurrences) &&
        independentEqual(
          sCells.filter((c) => f.preState.values[c] === symbol),
          cover.assignedOccurrences,
        ),
      "complete-S-occurrences",
    );
    independentRequire(
      occurrences.every((c) => scopes.some((scope: number[]) => scope.includes(c))),
      "S-capacities",
    );
    for (const base of p.base)
      if (independentDigits(f.preState.domains[base]).includes(symbol)) {
        const box = Math.floor(base / 27) * 3 + Math.floor((base % 9) / 3),
          upper = [
            ...scopes,
            independentHouse(`${p.orientation}:${baseLine}`),
            independentHouse(`box:${box}`),
          ];
        for (const targets of cover.houses.length === 1
          ? p.targets.map((c: number) => [c])
          : [[...p.targets]]) {
          // Falsification has a nonempty unary domain product only if every denied
          // target can be other than this symbol. Otherwise domain entailment is an
          // explicitly separate reason, matching the mathematical distinction.
          if (
            targets.some((c: number) =>
              independentEqual(independentDigits(f.preState.domains[c]), [symbol]),
            )
          ) {
            result.push({ base, symbol, targets, kind: "domain", tested: 0 });
            continue;
          }
          const supports = crossLines.map((line) =>
            line.filter(
              (c) =>
                independentDigits(f.preState.domains[c]).includes(symbol) && !targets.includes(c),
            ),
          );
          let tested = 0;
          for (const positions of independentProduct(supports)) {
            tested++;
            // Each lower cover supplies one truth. Every cited upper house has
            // capacity one, including the hypothesized base truth. Testing all three
            // positions preserves overlaps without an incidence formula or multiset axiom.
            const occupied = [base, ...positions];
            independentRequire(
              upper.some((scope: number[]) => occupied.filter((c) => scope.includes(c)).length > 1),
              "surviving-no-target-placement",
            );
          }
          result.push({ base, symbol, targets, kind: "count", tested });
        }
      }
  }
  return result;
}
export function independentExocet(
  f: any,
  parts = f.expectedPattern.components ?? [f.expectedPattern],
) {
  independentRequire(Array.isArray(parts) && parts.length >= 1 && parts.length <= 2, "components");
  independentRequire(
    f.preState.domains.length === 81 &&
      f.preState.values.length === 81 &&
      f.preState.domains.every(
        (m: number, c: number) =>
          Number.isInteger(m) &&
          m > 0 &&
          m <= 511 &&
          (!f.preState.values[c] || m === 2 ** (f.preState.values[c] - 1)),
      ),
    "complete-domains",
  );
  const implications = parts.flatMap((p: any) => independentJunior(f, p));
  if (parts.length === 2) {
    const [a, b] = parts,
      band = (p: any) =>
        Math.floor((p.orientation === "row" ? Math.floor(p.base[0] / 9) : p.base[0] % 9) / 3);
    independentRequire(
      a.orientation === b.orientation &&
        band(a) === band(b) &&
        new Set([...a.base, ...b.base]).size <= 4 &&
        new Set([...a.targets, ...b.targets]).size === 4 &&
        new Set([...a.baseSymbols, ...b.baseSymbols]).size <= 4,
      "double-geometry",
    );
  }
  const cells = [...new Set<number>(parts.flatMap((p: any) => [...p.base, ...p.targets]))].sort(
      (a, b) => a - b,
    ),
    rows: number[][] = [];
  for (const row of independentProduct(
    cells.map((c) => independentDigits(f.preState.domains[c])),
  )) {
    if (
      cells.some((a, i) =>
        cells.slice(i + 1).some((b, j) => independentPeer(a, b) && row[i] === row[i + j + 1]),
      )
    )
      continue;
    if (
      implications.every(
        (p: IndependentBaseImplication) =>
          row[cells.indexOf(p.base)] !== p.symbol ||
          p.targets.some((c) => row[cells.indexOf(c)] === p.symbol),
      )
    )
      rows.push(row);
  }
  return { cells, rows, implications };
}
export function independentCore(f: any, p = f.expectedPattern) {
  const permutations: number[][][] = p.triples.map((cells: number[]) =>
    [
      ...independentProduct(
        cells.map((c) =>
          independentDigits(f.preState.domains[c]).filter((s) => p.coreSymbols.includes(s)),
        ),
      ),
    ].filter((row) => new Set(row).size === 3),
  );
  const cells = p.triples.flat();
  let survivors = 0,
    combinations = 0;
  for (const indices of independentProduct(permutations.map((ps) => ps.map((_, i) => i)))) {
    combinations++;
    const row = indices.flatMap((j, i) => permutations[i][j]);
    if (
      !cells.some((a: number, i: number) =>
        cells
          .slice(i + 1)
          .some((b: number, j: number) => independentPeer(a, b) && row[i] === row[i + j + 1]),
      )
    )
      survivors++;
  }
  const guardians = cells
    .flatMap((cell: number) =>
      independentDigits(f.preState.domains[cell])
        .filter((s) => !p.coreSymbols.includes(s))
        .map((symbol) => ({ cell, symbol })),
    )
    .sort((a: any, b: any) => a.cell - b.cell || a.symbol - b.symbol);
  return { counts: permutations.map((p) => p.length), combinations, survivors, guardians };
}
