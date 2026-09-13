import { clause, derived, domainAssertion, requireProof, sameValue, validLiteral } from "./primitives";
import type { CheckContext, CheckedInference, PrimitiveInput, ProofNode } from "./types";

export interface TableDefinition {
  readonly cells: readonly number[];
  readonly count: number;
  readonly complete: boolean;
  readonly depth: number;
  readonly operation: "filter" | "union" | "join";
  readonly sources: readonly ProofNode[];
  readonly domains: readonly number[];
  readonly box: readonly number[];
  readonly constraints: readonly ProofNode[];
  readonly children: readonly ProofNode[];
}

// A copied wire summary cannot retrieve this authority. Only the checker passes
// its private immutable staged/retained objects to this cooperative strategy.
const ids = ["table-filter@1", "table-union@1", "table-join@1", "table-project@1"];

/**
 * A lazy relational DAG. Rows are recomputed from checked local definitions;
 * they are never retained as an uncharged expansion of a small wire node.
 * Null iterator items charge rejected tuples and graph traversal as work too.
 */
export class TableChecker {
  readonly #definitions: WeakMap<ProofNode, TableDefinition>;
  readonly #definitionNodes = new Map<number, ProofNode>();
  constructor(retained: Iterable<readonly [ProofNode, TableDefinition]> = []) {
    this.#definitions = new WeakMap();
    for (const [node, definition] of retained) {
      this.#definitions.set(node, definition);
      this.#definitionNodes.set(node.id, node);
    }
  }
  /** Read-only definition export; only the outer checker can retain authority. */
  get(node: ProofNode): TableDefinition | undefined { return this.#definitions.get(node); }
  has(id: string): boolean { return ids.includes(id); }
  get ids(): readonly string[] { return ids; }

  private definition(node: ProofNode): TableDefinition {
    requireProof(node.conclusion.kind === "table", "unauthenticated-table-definition");
    const owner = this.#definitionNodes.get(node.conclusion.definition);
    const result = owner && this.#definitions.get(owner);
    // A conjunction/case may copy the exact proposition, but the resolved
    // definition remains the checker-admitted immutable object in this prefix.
    requireProof(owner && result && sameValue(node.conclusion, owner.conclusion), "unauthenticated-table-definition");
    return result;
  }

  private cells(node: ProofNode): readonly number[] {
    return node.conclusion.kind === "relation" ? node.conclusion.cells : this.definition(node).cells;
  }

  private complete(node: ProofNode): void {
    requireProof(node.conclusion.kind === "relation" || this.definition(node).complete, "incomplete-table");
  }

  private *rows(node: ProofNode): Generator<readonly number[] | null> {
    yield null;
    if (node.conclusion.kind === "relation") { yield* node.conclusion.tuples; return; }
    const table = this.definition(node);
    if (table.operation === "union") {
      for (const child of table.children) yield* this.rows(child);
      return;
    }
    if (table.operation === "join") {
      const [left, right] = table.children, a = this.cells(left), b = this.cells(right);
      const shared = a.filter(cell => b.includes(cell));
      for (const l of this.rows(left)) {
        if (l === null) { yield null; continue; }
        for (const r of this.rows(right)) {
          if (r === null) { yield null; continue; }
          if (shared.every(cell => l[a.indexOf(cell)] === r[b.indexOf(cell)]))
            yield table.cells.map(cell => a.includes(cell) ? l[a.indexOf(cell)] : r[b.indexOf(cell)]);
          else yield null;
        }
      }
      return;
    }
    const alternatives = table.box.map(mask => Array.from({ length: 9 }, (_, i) => i + 1).filter(symbol => mask & (1 << (symbol - 1))));
    const indexes = alternatives.map(() => 0);
    if (alternatives.some(values => values.length === 0)) return;
    let done = false;
    while (!done) {
      const row = alternatives.map((values, index) => values[indexes[index]]);
      let valid = true;
      for (const constraint of table.constraints) {
        const p = constraint.conclusion;
        requireProof(p.kind === "relation" || p.kind === "all-different", "invalid-table-constraint");
        const values = p.cells.map(cell => row[table.cells.indexOf(cell)]);
        if (p.kind === "all-different") valid &&= new Set(values).size === values.length;
        else {
          let match = false;
          for (const tuple of p.tuples) { match ||= sameValue(values, tuple); yield null; }
          valid &&= match;
        }
        yield null;
        if (!valid) break;
      }
      yield valid ? row : null;
      for (let index = indexes.length - 1; index >= 0; index--) {
        if (++indexes[index] < alternatives[index].length) break;
        indexes[index] = 0;
        if (index === 0) done = true;
      }
    }
  }

  *check(input: PrimitiveInput, context: CheckContext): Generator<number, CheckedInference, void> {
    const node = context.currentNode;
    requireProof(node, "missing-table-node");
    const sources = input.premises.map(id => context.retained.get(id)!);
    if (input.rule === "table-project@1") {
      requireProof(sources.length === 1 && sameValue(input.parameters, {}), "invalid-table-projection");
      this.complete(sources[0]);
      const claim = input.conclusion;
      // Complete-source clause entailment preserves the relation's exact taint.
      // It cannot turn one partition into an exhaustive weak-link premise.
      if (claim.kind === "clause") {
        const cells = this.cells(sources[0]);
        requireProof(claim.alternatives.length >= 2 && claim.alternatives.length <= 64 &&
          claim.alternatives.every(value => validLiteral(value, context) && cells.includes(value.cell)) &&
          sameValue(claim, clause(claim.alternatives)), "invalid-table-projection");
        for (const row of this.rows(sources[0])) {
          if (row !== null) {
            let satisfied = false;
            for (const value of claim.alternatives) {
              satisfied ||= (row[cells.indexOf(value.cell)] === value.symbol) === value.positive;
              yield 1;
            }
            requireProof(satisfied, "invalid-table-projection");
          }
          yield 1;
        }
        return derived(input, context);
      }
      if (claim.kind === "relation") {
        const originalCells = this.cells(sources[0]);
        requireProof(claim.cells.length > 0 && claim.cells.every((cell,index) => originalCells.includes(cell) &&
          (index === 0 || cell > claim.cells[index-1])) && claim.tuples.length <= 256 &&
          sameValue(claim, { kind: "relation", cells: claim.cells, tuples: claim.tuples }), "invalid-table-projection");
        const workspace = claim.tuples.length * (claim.cells.length * 2 + 1);
        requireProof((context.workspaceRemaining ?? 0) >= workspace, "table-workspace-limit");
        const keys = claim.tuples.map(tuple => tuple.join(","));
        requireProof(new Set(keys).size === keys.length && claim.tuples.every(tuple => tuple.length === claim.cells.length &&
          tuple.every(symbol => context.view.assembly.problem.symbols.includes(symbol))) &&
          keys.every((key,index) => index === 0 || key > keys[index-1]), "invalid-table-projection");
        const seen = new Uint8Array(keys.length);
        for (const row of this.rows(sources[0])) {
          if (row !== null) {
            const key = claim.cells.map(cell => row[originalCells.indexOf(cell)]).join(",");
            const index = keys.indexOf(key);
            requireProof(index !== -1, "invalid-table-projection");
            seen[index] = 1;
          }
          yield 1;
        }
        requireProof(seen.every(value => value === 1), "invalid-table-projection");
        return derived(input, context);
      }
      const cell = claim.kind === "domain" ? claim.cell : claim.kind === "literal" ? claim.value.cell : -1;
      const cells = this.cells(sources[0]);
      requireProof(claim.kind === "false" || cells.includes(cell), "invalid-table-projection");
      let mask = 0, count = 0;
      for (const row of this.rows(sources[0])) {
        if (row !== null) { count++; if (cell !== -1) mask |= 1 << (row[cells.indexOf(cell)] - 1); }
        yield 1;
      }
      requireProof(claim.kind === "false" ? count === 0 && sameValue(claim, { kind: "false" }) : claim.kind === "domain" ? sameValue(claim, { kind: "domain", cell, mask }) :
        claim.kind === "literal" && validLiteral(claim.value, context) && sameValue(claim, { kind: "literal", value: claim.value }) &&
        (claim.value.positive ? mask === 1 << (claim.value.symbol - 1) : (mask & (1 << (claim.value.symbol - 1))) === 0), "invalid-table-projection");
      return derived(input, context);
    }
    let definition: TableDefinition;
    if (input.rule === "table-filter@1") {
      const { cells, box } = input.parameters as unknown as { cells: number[]; box: number[] };
      requireProof(Array.isArray(cells) && cells.length > 0 && cells.length <= 16 &&
        cells.every((cell, index) => context.view.assembly.problem.cells.includes(cell) && (index === 0 || cell > cells[index-1])) &&
        Array.isArray(box) && box.length === cells.length && sameValue(input.parameters, { cells, box }), "invalid-table-box");
      const domainNodes = sources.filter(source => domainAssertion(source.conclusion));
      requireProof(domainNodes.length === cells.length && cells.every(cell => domainNodes.filter(source => domainAssertion(source.conclusion)!.cell === cell).length === 1), "incomplete-domain-evidence");
      const domains = cells.map(cell => domainAssertion(domainNodes.find(source => domainAssertion(source.conclusion)!.cell === cell)!.conclusion)!.mask);
      requireProof(box.every((mask,index) => Number.isSafeInteger(mask) && mask >= 0 && (mask & domains[index]) === mask), "invalid-table-box");
      const volume = box.reduce((total,mask) => total * context.view.assembly.problem.symbols.filter(symbol => mask & (1 << (symbol-1))).length, 1);
      requireProof(volume <= 256, "table-leaf-limit");
      const constraints = sources.filter(source => !domainNodes.includes(source));
      requireProof(constraints.every(source => (source.conclusion.kind === "relation" || source.conclusion.kind === "all-different") &&
        source.conclusion.cells.every(cell => cells.includes(cell))), "invalid-table-constraint");
      definition = { cells, count: 0, complete: sameValue(domains, box), depth: 1, operation: "filter", sources,
        domains, box, constraints, children: [] };
    } else if (input.rule === "table-union@1") {
      requireProof(sources.length === 2 && sameValue(input.parameters, {}), "invalid-table-union");
      const [a,b] = sources.map(source => this.definition(source));
      requireProof(a.operation !== "join" && b.operation !== "join" && sameValue(a.cells, b.cells) &&
        a.sources.length === b.sources.length && a.sources.every((source,index) => source === b.sources[index]), "mismatched-table-sources");
      const changed = a.box.map((mask,index) => mask !== b.box[index] ? index : -1).filter(index => index !== -1);
      requireProof(changed.length === 1 && (a.box[changed[0]] & b.box[changed[0]]) === 0, "invalid-table-partition");
      const box = a.box.map((mask,index) => mask | b.box[index]);
      definition = { ...a, box, count: a.count + b.count, complete: sameValue(box, a.domains),
        operation: "union", children: sources, depth: Math.max(a.depth,b.depth) + 1 };
    } else {
      requireProof(input.rule === "table-join@1" && sources.length === 2 && sameValue(input.parameters, {}), "invalid-table-join");
      sources.forEach(source => this.complete(source));
      const cells = [...new Set(sources.flatMap(source => [...this.cells(source)]))].sort((a,b) => a-b);
      requireProof(cells.length <= 16, "table-cell-limit");
      definition = { cells, count: 0, complete: true, operation: "join", sources, domains: [], box: [], constraints: [],
        children: sources, depth: Math.max(...sources.map(source => source.conclusion.kind === "relation" ? 0 : this.definition(source).depth)) + 1 };
    }
    requireProof(definition.depth <= 64, "table-depth-limit");
    // Register only this exact staged object, not an externally chosen definition ID.
    // No caller can import it until the outer checker authenticates the full step.
    this.#definitions.set(node, definition);
    this.#definitionNodes.set(node.id, node);
    let count = definition.operation === "union" ? definition.count : 0;
    if (definition.operation !== "union") for (const row of this.rows(node)) { if (row !== null) count++; yield 1; }
    requireProof(sameValue(input.conclusion, { kind: "table", cells: definition.cells, count, definition: node.id }), "invalid-table-summary");
    this.#definitions.set(node, Object.freeze({ ...definition, count }));
    return derived(input, context);
  }
}
