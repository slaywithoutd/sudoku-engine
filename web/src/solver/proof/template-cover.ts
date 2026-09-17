import { derived, domainAssertion, requireProof, sameValue } from "./primitives";
import type {
  CheckContext,
  CheckedInference,
  PrimitiveInput,
  DeductionProposal,
  ProofNode,
} from "./types";
import type { Proposition, ReadView } from "../state/types";
import { symbolMask } from "../state/read";
import { defined, unverified } from "../invariants";

type Mode = "single" | "pair" | "triple" | "incompatibility";
interface Parameters {
  mode: Mode;
  symbols: number[];
  templates: number[][][];
  supported: number[][][];
  tupleTests: number;
  rounds: number[][];
}
const shape = (value: object, keys: string[]) => sameValue(Object.keys(value).sort(), keys.sort());
function scope(kind: number, n: number): number[] {
  return Array.from({ length: 9 }, (_, i) =>
    kind === 0
      ? n * 9 + i
      : kind === 1
        ? i * 9 + n
        : (Math.floor(n / 3) * 3 + Math.floor(i / 3)) * 9 + (n % 3) * 3 + (i % 3),
  );
}
/** Independent complete cover checker; no index, detector or compiler imports. */
export class TemplateCoverChecker {
  readonly id = "template-cover@1";
  *check(input: PrimitiveInput, context: CheckContext): Generator<number, CheckedInference> {
    const parameters = input.parameters as unknown as Parameters | undefined,
      problem = context.view.assembly.problem;
    requireProof(
      parameters &&
        typeof parameters === "object" &&
        !Array.isArray(parameters) &&
        shape(parameters, ["mode", "symbols", "templates", "supported", "tupleTests", "rounds"]),
      "invalid-template-parameters",
    );
    requireProof(
      problem.cells.length === 81 &&
        problem.symbols.length === 9 &&
        problem.cells.every((cell, i) => cell === i) &&
        problem.symbols.every((symbol, i) => symbol === i + 1),
      "template-out-of-profile",
    );
    requireProof(
      Array.isArray(parameters.symbols) &&
        parameters.symbols.length >= 1 &&
        parameters.symbols.length <= (parameters.mode === "incompatibility" ? 9 : 3) &&
        parameters.symbols.every(
          (symbol, i) =>
            Number.isInteger(symbol) &&
            symbol >= 1 &&
            symbol <= 9 &&
            (!i || symbol > parameters.symbols[i - 1]),
        ) &&
        (parameters.mode === "single"
          ? parameters.symbols.length === 1
          : parameters.mode === "pair"
            ? parameters.symbols.length === 2
            : parameters.mode === "triple"
              ? parameters.symbols.length === 3
              : unverified(parameters)?.mode === "incompatibility" &&
                parameters.symbols.length >= 2),
      "invalid-template-mode",
    );
    requireProof(
      Array.isArray(parameters.templates) &&
        parameters.templates.length === parameters.symbols.length &&
        Array.isArray(parameters.supported) &&
        parameters.supported.length === parameters.symbols.length &&
        Number.isInteger(parameters.tupleTests) &&
        parameters.tupleTests >= 0 &&
        parameters.tupleTests <= 100000 &&
        Array.isArray(parameters.rounds) &&
        parameters.rounds.length <= 140000,
      "invalid-template-lists",
    );
    let count = 0;
    for (const relation of [...parameters.templates, ...parameters.supported]) {
      requireProof(Array.isArray(relation) && relation.length <= 46, "invalid-template-chunks");
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
            Number.isInteger(code) && code >= 0 && code < 9 ** 9 && code > previous,
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
    const coverPacks = Math.ceil(parameters.symbols.length / 3),
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
            ? Math.min(27, parameters.symbols.length * 9 - (pack - 4) * 27)
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
      const domain = domainAssertion(sources[cell]);
      requireProof(
        domain &&
          domain.cell === cell &&
          Number.isInteger(domain.mask) &&
          domain.mask === context.view.state.domains[cell],
        "invalid-template-domain",
      );
      domains.push(domain.mask);
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
    for (let i = 0; i < parameters.symbols.length * 9; i++) {
      const expected = {
        kind: "cover",
        symbol: parameters.symbols[Math.floor(i / 9)],
        cells: scope(0, i % 9),
      };
      requireProof(sameValue(sources[108 + i], expected), "invalid-template-cover");
    }
    for (let i = 0; i < anchors.length; i++) {
      const { cell, symbol } = anchors[i];
      requireProof(
        sameValue(sources[108 + parameters.symbols.length * 9 + i], {
          kind: "literal",
          value: { cell, symbol, positive: true },
        }) &&
          domains[cell] === symbolMask(symbol) &&
          (!problem.givens[cell] || problem.givens[cell] === symbol),
        "invalid-template-anchor",
      );
    }
    for (let cell = 0; cell < 81; cell++)
      requireProof(
        !problem.givens[cell] || context.view.state.values[cell] === problem.givens[cell],
        "invalid-template-clue",
      );
    const lists = parameters.templates.map((chunks) => chunks.flat()),
      positions = parameters.symbols.map(() => 0),
      columns = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    let more = true;
    // Lexicographic full permutations differ from production occupancy DFS.
    while (more) {
      yield 1;
      const boxes = new Set(
        columns.map((cell, index) => Math.floor(index / 3) * 3 + Math.floor(cell / 3)),
      );
      if (boxes.size === 9)
        for (let symbolIndex = 0; symbolIndex < parameters.symbols.length; symbolIndex++) {
          yield 1; // At most 81 mask/anchor checks between cooperative boundaries.
          const bit = symbolMask(parameters.symbols[symbolIndex]);
          let legal = true;
          for (let cell = 0; cell < 81; cell++) {
            const selected = columns[Math.floor(cell / 9)] === cell % 9;
            if (
              selected
                ? !(domains[cell] & bit)
                : context.view.state.values[cell] === parameters.symbols[symbolIndex]
            ) {
              legal = false;
              break;
            }
          }
          if (legal) {
            const code = columns.reduce((n, cell) => n * 9 + cell, 0);
            requireProof(
              lists[symbolIndex][positions[symbolIndex]++] === code,
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
        for (let left = i + 1, right = 8; left < right; left++, right--)
          [columns[left], columns[right]] = [columns[right], columns[left]];
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
    const compatible = (left: readonly number[], right: readonly number[]) =>
      left.every((cell, index) => cell !== right[index]);
    const charge = () => {
      requireProof(tests < 100000, "template-tuple-limit");
      tests++;
    };
    let active = initial;
    const rounds: number[][] = [];
    if (parameters.mode === "pair" || parameters.mode === "triple") {
      const support = lists.map((list) => list.map(() => false));
      for (let left = 0; left < rows[0].length; left++)
        for (let right = 0; right < rows[1].length; right++) {
          const third = parameters.mode === "triple" ? rows[2].length : 1;
          for (let cell = 0; cell < third; cell++) {
            charge();
            yield 1;
            if (
              compatible(rows[0][left], rows[1][right]) &&
              (parameters.mode !== "triple" ||
                (compatible(rows[0][left], rows[2][cell]) &&
                  compatible(rows[1][right], rows[2][cell])))
            ) {
              support[0][left] = support[1][right] = true;
              if (parameters.mode === "triple") support[2][cell] = true;
            }
          }
        }
      active = active.map((list, symbolIndex) => list.filter((i) => support[symbolIndex][i]));
    } else if (parameters.mode === "incompatibility") {
      for (;;) {
        const next = active.map(() => [] as number[]);
        for (let symbolIndex = 0; symbolIndex < active.length; symbolIndex++)
          for (const i of active[symbolIndex]) {
            let keep = true;
            for (let other = 0; other < active.length; other++)
              if (other !== symbolIndex) {
                let partner = false;
                for (const j of active[other]) {
                  charge();
                  yield 1;
                  if (compatible(rows[symbolIndex][i], rows[other][j])) {
                    partner = true;
                    break;
                  }
                }
                if (!partner) {
                  keep = false;
                  break;
                }
              }
            if (keep) next[symbolIndex].push(i);
          }
        const removed = active.map((list, symbolIndex) => list.length - next[symbolIndex].length);
        active = next;
        if (removed.every((n) => n === 0)) break;
        rounds.push(removed);
      }
    }
    const supported = active.map((list, symbolIndex) => list.map((i) => lists[symbolIndex][i]));
    requireProof(
      sameValue(
        parameters.supported.map((chunks) => chunks.flat()),
        supported,
      ) &&
        parameters.tupleTests === tests &&
        sameValue(parameters.rounds, rounds),
      "incomplete-template-overlay",
    );
    const occurrences = parameters.symbols.map(() => Array<boolean>(81).fill(false));
    for (let symbolIndex = 0; symbolIndex < active.length; symbolIndex++)
      for (const i of active[symbolIndex]) {
        yield 1;
        for (let row = 0; row < 9; row++)
          occurrences[symbolIndex][row * 9 + rows[symbolIndex][i][row]] = true;
      }
    const terms: Proposition[] = [];
    for (let cell = 0; cell < 81; cell++)
      for (let symbolIndex = 0; symbolIndex < parameters.symbols.length; symbolIndex++) {
        yield 1;
        const symbol = parameters.symbols[symbolIndex],
          bit = symbolMask(symbol);
        if (
          !context.view.state.values[cell] &&
          domains[cell] & bit &&
          !occurrences[symbolIndex][cell]
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
  const pattern = proposal.pattern as unknown as {
    kind: string;
    alias: string;
    mode: Mode;
    symbols: number[];
    certificate: number;
  };
  requireProof(
    shape(pattern, ["kind", "alias", "mode", "symbols", "certificate"]) &&
      pattern.kind === "templates",
    "invalid-template-pattern",
  );
  const aliases =
    pattern.mode === "single"
      ? ["Per-digit templates"]
      : pattern.mode === "incompatibility"
        ? ["Template incompatibility"]
        : ["Pattern overlay", "POM"];
  requireProof(aliases.includes(pattern.alias), "invalid-template-alias");
  const certificates = proposal.proof.nodes.filter((n) => n.rule === "template-cover@1"),
    certificate = certificates[0];
  requireProof(
    certificates.length === 1 &&
      certificate.id === pattern.certificate &&
      certificate.conclusion.kind === "and" &&
      sameValue((certificate.parameters as unknown as Parameters).symbols, pattern.symbols) &&
      (certificate.parameters as unknown as Parameters).mode === pattern.mode,
    "missing-template-certificate",
  );
  const expected = certificate.conclusion.terms.map((term) => {
    requireProof(term.kind === "literal" && !term.value.positive, "invalid-template-certificate");
    return { kind: "remove", cell: term.value.cell, symbol: term.value.symbol };
  });
  requireProof(
    sameValue(proposal.effects, expected) && expected.length > 0,
    "invalid-template-effects",
  );
  const seen = new Set<number>();
  for (const id of proposal.proof.roots) {
    const root = defined(available.get(id), "available");
    if (root.conclusion.kind !== "literal") continue;
    const index = (root.parameters as { index?: number }).index;
    requireProof(
      root.rule === "conjunction@1" &&
        sameValue(root.premises, [certificate.id]) &&
        Number.isInteger(index) &&
        defined(index, "index") >= 0 &&
        defined(index, "index") < expected.length &&
        sameValue(root.parameters, { index }) &&
        sameValue(root.conclusion, certificate.conclusion.terms[defined(index, "index")]),
      "unproved-template-effect-root",
    );
    seen.add(defined(index, "index"));
  }
  requireProof(seen.size === expected.length, "missing-template-effect-root");
}
