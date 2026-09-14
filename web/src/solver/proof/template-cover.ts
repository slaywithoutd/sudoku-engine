import {
  derived,
  domainAssertion,
  requireProof,
  sameValue,
} from "./primitives";
import type {
  CheckContext,
  CheckedInference,
  PrimitiveInput,
  DeductionProposal,
  ProofNode,
} from "./types";
import type { Proposition, ReadView } from "../state/types";

type Mode = "single" | "pair" | "triple" | "incompatibility";
interface Parameters {
  mode: Mode;
  symbols: number[];
  templates: number[][][];
  supported: number[][][];
  tupleTests: number;
  rounds: number[][];
}
const shape = (value: object, keys: string[]) =>
  sameValue(Object.keys(value).sort(), keys.sort());
function scope(kind: number, n: number): number[] {
  return Array.from({ length: 9 }, (_, i) =>
    kind === 0
      ? n * 9 + i
      : kind === 1
        ? i * 9 + n
        : (Math.floor(n / 3) * 3 + Math.floor(i / 3)) * 9 +
          (n % 3) * 3 +
          (i % 3),
  );
}
/** Independent complete cover checker; no index, detector or compiler imports. */
export class TemplateCoverChecker {
  readonly id = "template-cover@1";
  *check(
    input: PrimitiveInput,
    context: CheckContext,
  ): Generator<number, CheckedInference> {
    const p = input.parameters as unknown as Parameters,
      problem = context.view.assembly.problem;
    requireProof(
      p &&
        typeof p === "object" &&
        !Array.isArray(p) &&
        shape(p, [
          "mode",
          "symbols",
          "templates",
          "supported",
          "tupleTests",
          "rounds",
        ]),
      "invalid-template-parameters",
    );
    requireProof(
      problem.cells.length === 81 &&
        problem.symbols.length === 9 &&
        problem.cells.every((c, i) => c === i) &&
        problem.symbols.every((s, i) => s === i + 1),
      "template-out-of-profile",
    );
    requireProof(
      Array.isArray(p.symbols) &&
        p.symbols.length >= 1 &&
        p.symbols.length <= (p.mode === "incompatibility" ? 9 : 3) &&
        p.symbols.every(
          (s, i) =>
            Number.isInteger(s) &&
            s >= 1 &&
            s <= 9 &&
            (!i || s > p.symbols[i - 1]),
        ) &&
        (p.mode === "single"
          ? p.symbols.length === 1
          : p.mode === "pair"
            ? p.symbols.length === 2
            : p.mode === "triple"
              ? p.symbols.length === 3
              : p.mode === "incompatibility" && p.symbols.length >= 2),
      "invalid-template-mode",
    );
    requireProof(
      Array.isArray(p.templates) &&
        p.templates.length === p.symbols.length &&
        Array.isArray(p.supported) &&
        p.supported.length === p.symbols.length &&
        Number.isInteger(p.tupleTests) &&
        p.tupleTests >= 0 &&
        p.tupleTests <= 100000 &&
        Array.isArray(p.rounds) &&
        p.rounds.length <= 140000,
      "invalid-template-lists",
    );
    let count = 0;
    for (const relation of [...p.templates, ...p.supported]) {
      requireProof(
        Array.isArray(relation) && relation.length <= 46,
        "invalid-template-chunks",
      );
      let previous = -1,
        total = 0;
      for (let i = 0; i < relation.length; i++) {
        const chunk = relation[i];
        requireProof(
          Array.isArray(chunk) &&
            chunk.length > 0 &&
            chunk.length <= 1024 &&
            (i === relation.length - 1 || chunk.length === 1024),
          "invalid-template-chunks",
        );
        for (const code of chunk) {
          yield 1;
          requireProof(
            Number.isInteger(code) &&
              code >= 0 &&
              code < 9 ** 9 &&
              code > previous,
            "invalid-template-code-order",
          );
          previous = code;
          total++;
        }
      }
      requireProof(total <= 46656, "template-count-limit");
      count += total;
    }
    // Before flattening or decoding wire lists. Accounts arrays, row cells,
    // masks and both synchronous fixed-point generations conservatively.
    requireProof(
      (context.workspaceRemaining ?? 0) >= 65536 + count * 512,
      "template-workspace-limit",
    );
    const anchors = context.view.state.values.flatMap((symbol, cell) =>
      symbol ? [{ cell, symbol }] : [],
    );
    const coverPacks = Math.ceil(p.symbols.length / 3),
      anchorStart = 4 + coverPacks;
    requireProof(
      input.premises.length === anchorStart + Math.ceil(anchors.length / 27) &&
        new Set(input.premises).size === input.premises.length,
      "invalid-template-sources",
    );
    const sources: Proposition[] = [];
    for (const [pack, id] of input.premises.entries()) {
      const node = context.retained.get(id),
        claim = node?.conclusion;
      const size =
        pack < 4
          ? 27
          : pack < anchorStart
            ? Math.min(27, p.symbols.length * 9 - (pack - 4) * 27)
            : Math.min(27, anchors.length - (pack - anchorStart) * 27);
      requireProof(
        node?.rule === "conjunction@1" &&
          sameValue(node.parameters, {}) &&
          claim?.kind === "and" &&
          claim.terms.length === size &&
          node.premises.length === claim.terms.length,
        "invalid-template-source-pack",
      );
      for (const term of claim.terms) {
        yield 1;
        requireProof(term.kind !== "and", "nested-template-source-pack");
        sources.push(term);
      }
    }
    const domains: number[] = [];
    for (let cell = 0; cell < 81; cell++) {
      const d = domainAssertion(sources[cell]);
      requireProof(
        d &&
          d.cell === cell &&
          Number.isInteger(d.mask) &&
          d.mask === context.view.state.domains[cell],
        "invalid-template-domain",
      );
      domains.push(d.mask);
    }
    for (let kind = 0; kind < 3; kind++)
      for (let n = 0; n < 9; n++)
        requireProof(
          sameValue(sources[81 + kind * 9 + n], {
            kind: "all-different",
            cells: scope(kind, n),
          }),
          "invalid-template-house",
        );
    for (let i = 0; i < p.symbols.length * 9; i++) {
      const expected = {
        kind: "cover",
        symbol: p.symbols[Math.floor(i / 9)],
        cells: scope(0, i % 9),
      };
      requireProof(
        sameValue(sources[108 + i], expected),
        "invalid-template-cover",
      );
    }
    for (let i = 0; i < anchors.length; i++) {
      const { cell, symbol } = anchors[i];
      requireProof(
        sameValue(sources[108 + p.symbols.length * 9 + i], {
          kind: "literal",
          value: { cell, symbol, positive: true },
        }) &&
          domains[cell] === 1 << (symbol - 1) &&
          (!problem.givens[cell] || problem.givens[cell] === symbol),
        "invalid-template-anchor",
      );
    }
    for (let cell = 0; cell < 81; cell++)
      requireProof(
        !problem.givens[cell] ||
          context.view.state.values[cell] === problem.givens[cell],
        "invalid-template-clue",
      );
    const lists = p.templates.map((chunks) => chunks.flat()),
      positions = p.symbols.map(() => 0),
      columns = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    let more = true;
    // Lexicographic full permutations differ from production occupancy DFS.
    while (more) {
      yield 1;
      const boxes = new Set(
        columns.map((c, r) => Math.floor(r / 3) * 3 + Math.floor(c / 3)),
      );
      if (boxes.size === 9)
        for (let s = 0; s < p.symbols.length; s++) {
          yield 1; // At most 81 mask/anchor checks between cooperative boundaries.
          const bit = 1 << (p.symbols[s] - 1);
          let legal = true;
          for (let cell = 0; cell < 81; cell++) {
            const selected = columns[Math.floor(cell / 9)] === cell % 9;
            if (
              selected
                ? !(domains[cell] & bit)
                : context.view.state.values[cell] === p.symbols[s]
            ) {
              legal = false;
              break;
            }
          }
          if (legal) {
            const code = columns.reduce((n, c) => n * 9 + c, 0);
            requireProof(
              lists[s][positions[s]++] === code,
              "incomplete-template-list",
            );
          }
        }
      let i = 7;
      while (i >= 0 && columns[i] >= columns[i + 1]) i--;
      if (i < 0) more = false;
      else {
        let j = 8;
        while (columns[j] <= columns[i]) j--;
        [columns[i], columns[j]] = [columns[j], columns[i]];
        for (let a = i + 1, b = 8; a < b; a++, b--)
          [columns[a], columns[b]] = [columns[b], columns[a]];
      }
    }
    requireProof(
      lists.every((list, i) => list.length === positions[i]),
      "incomplete-template-list",
    );
    const decode = (code: number) => {
      const row = Array<number>(9);
      for (let i = 8; i >= 0; i--) {
        row[i] = code % 9;
        code = Math.floor(code / 9);
      }
      return row;
    };
    const rows: number[][][] = [],
      initial: number[][] = [];
    for (const list of lists) {
      const decoded: number[][] = [],
        members: number[] = [];
      rows.push(decoded);
      initial.push(members);
      for (const code of list) {
        yield 1;
        members.push(decoded.length);
        decoded.push(decode(code));
      }
    }
    let tests = 0;
    const compatible = (a: readonly number[], b: readonly number[]) =>
      a.every((c, r) => c !== b[r]);
    const charge = () => {
      requireProof(tests < 100000, "template-tuple-limit");
      tests++;
    };
    let active = initial;
    const rounds: number[][] = [];
    if (p.mode === "pair" || p.mode === "triple") {
      const support = lists.map((list) => list.map(() => false));
      for (let a = 0; a < rows[0].length; a++)
        for (let b = 0; b < rows[1].length; b++) {
          const third = p.mode === "triple" ? rows[2].length : 1;
          for (let c = 0; c < third; c++) {
            charge();
            yield 1;
            if (
              compatible(rows[0][a], rows[1][b]) &&
              (p.mode !== "triple" ||
                (compatible(rows[0][a], rows[2][c]) &&
                  compatible(rows[1][b], rows[2][c])))
            ) {
              support[0][a] = support[1][b] = true;
              if (p.mode === "triple") support[2][c] = true;
            }
          }
        }
      active = active.map((list, s) => list.filter((i) => support[s][i]));
    } else if (p.mode === "incompatibility") {
      for (;;) {
        const next = active.map(() => [] as number[]);
        for (let s = 0; s < active.length; s++)
          for (const i of active[s]) {
            let keep = true;
            for (let t = 0; t < active.length; t++)
              if (t !== s) {
                let partner = false;
                for (const j of active[t]) {
                  charge();
                  yield 1;
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
        if (removed.every((n) => n === 0)) break;
        rounds.push(removed);
      }
    }
    const supported = active.map((list, s) => list.map((i) => lists[s][i]));
    requireProof(
      sameValue(
        p.supported.map((chunks) => chunks.flat()),
        supported,
      ) &&
        p.tupleTests === tests &&
        sameValue(p.rounds, rounds),
      "incomplete-template-overlay",
    );
    const occurrences = p.symbols.map(() => Array<boolean>(81).fill(false));
    for (let s = 0; s < active.length; s++)
      for (const i of active[s]) {
        yield 1;
        for (let r = 0; r < 9; r++)
          occurrences[s][r * 9 + rows[s][i][r]] = true;
      }
    const terms: Proposition[] = [];
    for (let cell = 0; cell < 81; cell++)
      for (let s = 0; s < p.symbols.length; s++) {
        yield 1;
        const symbol = p.symbols[s],
          bit = 1 << (symbol - 1);
        if (
          !context.view.state.values[cell] &&
          domains[cell] & bit &&
          !occurrences[s][cell]
        )
          terms.push({
            kind: "literal",
            value: { cell, symbol, positive: false },
          });
      }
    requireProof(
      terms.length > 0 && sameValue(input.conclusion, { kind: "and", terms }),
      "invalid-template-projection",
    );
    return derived(input, context);
  }
}

/** Every negative root must be a direct projection of this new full certificate. */
export function checkTemplatePattern(
  proposal: DeductionProposal,
  _view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
): void {
  const p = proposal.pattern as unknown as {
    kind: string;
    alias: string;
    mode: Mode;
    symbols: number[];
    certificate: number;
  };
  requireProof(
    shape(p, ["kind", "alias", "mode", "symbols", "certificate"]) &&
      p.kind === "templates",
    "invalid-template-pattern",
  );
  const aliases =
    p.mode === "single"
      ? ["Per-digit templates"]
      : p.mode === "incompatibility"
        ? ["Template incompatibility"]
        : ["Pattern overlay", "POM"];
  requireProof(aliases.includes(p.alias), "invalid-template-alias");
  const certificates = proposal.proof.nodes.filter(
      (n) => n.rule === "template-cover@1",
    ),
    certificate = certificates[0];
  requireProof(
    certificates.length === 1 &&
      certificate.id === p.certificate &&
      certificate.conclusion.kind === "and" &&
      sameValue(
        (certificate.parameters as unknown as Parameters).symbols,
        p.symbols,
      ) &&
      (certificate.parameters as unknown as Parameters).mode === p.mode,
    "missing-template-certificate",
  );
  const expected = certificate.conclusion.terms.map((term) => {
    requireProof(
      term.kind === "literal" && !term.value.positive,
      "invalid-template-certificate",
    );
    return { kind: "remove", cell: term.value.cell, symbol: term.value.symbol };
  });
  requireProof(
    sameValue(proposal.effects, expected) && expected.length > 0,
    "invalid-template-effects",
  );
  const seen = new Set<number>();
  for (const id of proposal.proof.roots) {
    const root = available.get(id)!;
    if (root.conclusion.kind !== "literal") continue;
    const index = (root.parameters as { index?: number }).index;
    requireProof(
      root.rule === "conjunction@1" &&
        sameValue(root.premises, [certificate.id]) &&
        Number.isInteger(index) &&
        index! >= 0 &&
        index! < expected.length &&
        sameValue(root.parameters, { index }) &&
        sameValue(root.conclusion, certificate.conclusion.terms[index!]),
      "unproved-template-effect-root",
    );
    seen.add(index!);
  }
  requireProof(seen.size === expected.length, "missing-template-effect-root");
}
