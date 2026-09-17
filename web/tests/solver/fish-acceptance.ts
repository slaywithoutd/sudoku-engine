import type { Json } from "../../src/solver/problem";
import type { DeductionProposal, ProofNode, Proposition } from "../../src/solver/proof/types";
import { fixtureView, type TechniqueFixture } from "./acceptance";
import { retainedProof } from "../../src/solver/state/candidates";
import c06 from "./fixtures/C06.json";
import c07 from "./fixtures/C07.json";
import c08 from "./fixtures/C08.json";
import c09 from "./fixtures/C09.json";
import { discoveryContext } from "./discovery-context";
import { getTechniques } from "../../src/solver/techniques/registry";

export const allFishFixtures = [...c06, ...c07, ...c08, ...c09] as unknown as TechniqueFixture[];
export const fishFixtures = allFishFixtures.filter((f) => f.expectation === "productive");
export function fishFixture(id: string) {
  const f = fishFixtures.find((f) => f.id === id);
  if (!f) throw Error(id);
  return structuredClone(f);
}
export function fishKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(fishKey).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([k, v]) =>
          `${k}:${k === "components" ? (v as unknown[]).map(fishKey).sort().join("|") : fishKey(v)}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}
export function findFish(f: TechniqueFixture) {
  const view = fixtureView(f),
    context = discoveryContext();
  let work = 0,
    proposals = 0,
    found: DeductionProposal | undefined;
  const descriptor = getTechniques("classic-expanded@1").find(
    (d) => d.id === f.rowId.toLowerCase() + "@1",
  )!;
  for (const event of descriptor.discover(view, context)) {
    if (event.kind === "work") work += event.units;
    if (event.kind === "proposal") {
      proposals++;
      const actual = event.proposal.pattern as any,
        wanted = f.expectedPattern as any;
      const mixed = (p: any) =>
        [p.bases, p.covers].some(
          (ids) =>
            ids.some((id: string) => id.startsWith("row:")) &&
            ids.some((id: string) => id.startsWith("column:")),
        );
      const fins = (p: any) =>
        p.components
          ? [...new Set(p.components.flatMap((c: any) => c.fins))].length
          : p.fins.length;
      const shape =
        actual.alias === wanted.alias &&
        actual.size === wanted.size &&
        actual.symbol === wanted.symbol &&
        fins(actual) === fins(wanted) &&
        (wanted.alias !== "Mutant fish" || !mixed(wanted) || mixed(actual)) &&
        (!wanted.incidence?.some((v: number) => Math.abs(v) > 1) ||
          actual.incidence?.some((v: number) => Math.abs(v) > 1));
      // Exact original simple geometry also retains dense/equivalent support gates.
      // Complex discovery exercises the declared semantic class; its different
      // geometry is separately checked, never substituted into original fixtures.
      const matches = ["C06", "C07"].includes(f.rowId)
        ? fishKey(actual) === fishKey(wanted)
        : shape;
      if (
        matches &&
        event.proposal.effects.some((e) =>
          f.expectedEffects.some(
            (expected) => e.cell === expected.cell && e.symbol === expected.symbol,
          ),
        )
      ) {
        found = event.proposal;
        break;
      }
    }
    if (event.kind === "interrupted")
      throw Error(`fish-interrupted:${f.id}:${event.reason}:${work}:${proposals}`);
    if (event.kind === "excluded") throw Error(`fish-excluded:${f.id}:${event.reason}`);
  }
  if (found) return { view, proposal: found, work, proposals, usage: context.workspace.usage };
  throw Error(`fish-not-found:${f.id}:${work}:${proposals}`);
}
/** Independent certificate author: full classic sets and seed geometry only.
 * No detector, production compiler, grammar validator or graph index is used.
 */
export function independentFish(f: TechniqueFixture, pool = false): DeductionProposal {
  const view = fixtureView(f),
    retained = retainedProof(view),
    nodes: ProofNode[] = [],
    roots: number[] = [],
    imports = new Set<number>();
  let next = Math.max(...retained.keys()) + 1;
  const add = (
    rule: string,
    premises: number[],
    conclusion: Proposition,
    parameters: Json = {},
    scope: number[] = [],
  ) => {
    premises.filter((id) => retained.has(id)).forEach((id) => imports.add(id));
    const id = next++;
    nodes.push({ id, rule, premises, conclusion, parameters, scope });
    return id;
  };
  const literal = (cell: number, symbol: number, positive: boolean): Proposition => ({
    kind: "literal",
    value: { cell, symbol, positive },
  });
  const house = (id: string) => view.assembly.allDifferent.find((h) => h.id === id)!.cells;
  const source = (id: string, symbol?: number) =>
    [...view.facts.values()].find(
      (f) =>
        (symbol === undefined
          ? f.proposition.kind === "all-different"
          : f.proposition.kind === "cover" && f.proposition.symbol === symbol) &&
        "cells" in f.proposition &&
        JSON.stringify(f.proposition.cells) === JSON.stringify(house(id)),
    )!.id;
  const p = f.expectedPattern as any,
    components = pool
      ? [
          {
            ...p.components[0],
            bases: p.components.flatMap((c: any) => c.bases),
            covers: p.components.flatMap((c: any) => c.covers),
            fins: [...new Set(p.components.flatMap((c: any) => c.fins))],
          },
        ]
      : (p.components ?? [p]);
  for (const part of components) {
    const symbol = part.symbol,
      coefficient = Array(81).fill(0);
    for (const id of part.bases) for (const cell of house(id)) coefficient[cell]--;
    for (const id of part.covers) for (const cell of house(id)) coefficient[cell]++;
    for (const target of f.expectedEffects) {
      if (
        coefficient[target.cell] <= 0 ||
        !part.fins.every(
          (fin: number) =>
            fin !== target.cell &&
            view.assembly.allDifferent.some(
              (h) => h.cells.includes(fin) && h.cells.includes(target.cell),
            ),
        )
      )
        continue;
      const assumption = part.fins.length
          ? add("assume@1", [], literal(target.cell, symbol, true))
          : undefined,
        scope = assumption === undefined ? [] : [assumption];
      const domainIds = new Map<number, number>();
      for (let cell = 0; cell < 81; cell++)
        if (coefficient[cell] < 0) domainIds.set(cell, view.state.domainFacts[cell]);
      for (const fin of part.fins) {
        const h = view.assembly.allDifferent.find(
          (h) => h.cells.includes(fin) && h.cells.includes(target.cell),
        )!;
        const terms = [
          { cell: fin, symbol, positive: false },
          { cell: target.cell, symbol, positive: false },
        ].sort((a, b) => a.cell - b.cell);
        const weak = add(
          "weak-link@1",
          [source(h.id)],
          { kind: "clause", alternatives: terms },
          {},
          scope,
        );
        const negative = add(
          "resolution@1",
          [assumption!, weak],
          literal(fin, symbol, false),
          {},
          scope,
        );
        domainIds.set(
          fin,
          add(
            "domain-restrict@1",
            [view.state.domainFacts[fin], negative],
            { kind: "domain", cell: fin, mask: view.state.domains[fin] & ~(1 << (symbol - 1)) },
            {},
            scope,
          ),
        );
      }
      const weights = (ids: string[], digit?: number) =>
        [...new Set(ids)].map((id) => ({
          premise: source(id, digit),
          coefficient: ids.filter((x) => x === id).length,
        }));
      const covers = weights(part.bases, symbol),
        capacities = weights(part.covers);
      let root = add(
        "cover-count@1",
        [
          ...covers.map((e: any) => e.premise),
          ...capacities.map((e: any) => e.premise),
          ...domainIds.values(),
        ],
        literal(target.cell, symbol, false),
        { symbol, covers, capacities },
        scope,
      );
      if (assumption !== undefined) {
        const contradiction = add(
          "contradiction@1",
          [assumption, root],
          { kind: "false" },
          {},
          scope,
        );
        root = add("discharge@1", [assumption, contradiction], literal(target.cell, symbol, false));
      }
      roots.push(root);
    }
  }
  for (const target of f.expectedEffects) {
    const root = roots.find(
      (id) =>
        JSON.stringify(nodes.find((n) => n.id === id)!.conclusion) ===
        JSON.stringify(literal(target.cell, target.symbol, false)),
    );
    if (root === undefined) throw Error("independent-fish-no-root");
    roots.push(
      add("domain-restrict@1", [view.state.domainFacts[target.cell], root], {
        kind: "domain",
        cell: target.cell,
        mask: view.state.domains[target.cell] & ~(1 << (target.symbol - 1)),
      }),
    );
  }
  return {
    technique: f.rowId.toLowerCase() + "@1",
    pattern: f.expectedPattern,
    effects: f.expectedEffects,
    state: view.state.key,
    proof: { state: view.state.key, nodes, imports: [...imports].sort((a, b) => a - b), roots },
  };
}
