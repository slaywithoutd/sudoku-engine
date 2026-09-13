import { canonicalProblem } from "../problem";
import type { BranchId } from "../problem";
import type { Assembly, FactId, NodeId } from "../rules/types";
import type { CheckContext, ProofNode } from "../proof/types";
import { assertM2RootAssemblyBounds, primitiveRegistry, requireProof } from "../proof/primitives";
import type { Fact, Proposition } from "./types";

/** Encapsulation matters: freezing a Map alone does not prevent set/delete. */
export class ImmutableMap<K, V> implements ReadonlyMap<K, V> {
  readonly #entries: Map<K, V>;

  constructor(entries: Iterable<readonly [K, V]>) {
    this.#entries = new Map(entries);
    Object.freeze(this);
  }

  get size() { return this.#entries.size; }
  get(key: K) { return this.#entries.get(key); }
  has(key: K) { return this.#entries.has(key); }
  keys() { return this.#entries.keys(); }
  values() { return this.#entries.values(); }
  entries() { return this.#entries.entries(); }
  [Symbol.iterator]() { return this.entries(); }
  forEach(fn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown) {
    for (const [key, value] of this.#entries) fn.call(thisArg, value, key, this);
  }
}

const factNodes = new WeakMap<Fact, ProofNode>();
const originalNodes = new WeakMap<ProofNode, Fact>();
const rootPremises = new WeakMap<ProofNode, readonly ProofNode[]>();
const rootCounts = new WeakMap<ProofNode, number>();
/** Returns only the original immutable node behind a factory-issued fact. */
export function rootNode(fact: Fact): ProofNode {
  const node = factNodes.get(fact);
  requireProof(node, "inauthentic-root-fact");
  return node;
}
/** Read-only authority lookup; no public method can mint a retained node. */
export function originalFact(node: ProofNode): Fact | undefined { return originalNodes.get(node); }

/** Size of the complete initialization that issued this node, including capabilities. */
export function originalRootCount(node: ProofNode): number | undefined { return rootCounts.get(node); }

/** Exact original premise identities, so equal numeric handles cannot be substituted. */
export function originalPremises(node: ProofNode): readonly ProofNode[] | undefined {
  return rootPremises.get(node);
}

/**
 * Materializes assembler handles as independently checked original premises.
 * IDs: all cell domains, nonzero clues, canonical constraints, then capabilities.
 * Full domains remain roots even at clue cells; narrowing requires a derivation.
 */
export function createRoots(assembly: Assembly, branch: BranchId = "primary"): ReadonlyMap<FactId, Fact> {
  assertM2RootAssemblyBounds(assembly);
  const problem = canonicalProblem(assembly.problem);
  requireProof(problem.key === assembly.problem.key && typeof branch === "string" && branch.length > 0, "invalid-root-state");
  const state = Object.freeze({ problemKey: problem.key, branch, revision: 0 });
  const facts = new Map<FactId, Fact>();
  const nodes = new Map<NodeId, ProofNode>();
  const context: CheckContext = {
    view: {
      assembly,
      state: { key: state, values: problem.givens, domains: [], domainFacts: [] },
      facts,
      supports: () => [],
    },
    retained: nodes,
    policy: "unconditional",
    uniqueEvidenceId: null,
    // Root primitives do not spend/check budgets themselves. The generator
    // charges every retained initialization node before accepting a proposal.
    limits: {
      timeMs: 0, workUnits: 0, exactNodes: 0, stepNodes: 0, runNodes: 0,
      proofBytes: 0, stepBytes: 0, batchBytes: 0, inFlightBatches: 0, workspaceBytes: 0,
    },
  };
  const add = (
    rule: string,
    conclusion: Proposition,
    premises: readonly number[] = [],
    parameters = {},
  ) => {
    const node: ProofNode = Object.freeze({
      id: facts.size,
      rule,
      conclusion,
      premises: Object.freeze([...premises]),
      parameters: Object.freeze(parameters),
      scope: Object.freeze([]),
    });
    const checked = primitiveRegistry.check(node, context);
    rootPremises.set(node, Object.freeze(node.premises.map(id => nodes.get(id)!)));
    const fact: Fact = Object.freeze({
      id: node.id,
      root: node.id,
      state,
      proposition: checked.conclusion,
      openAssumptions: checked.openAssumptions,
      conditional: checked.conditional,
      rules: checked.rules,
    });
    nodes.set(node.id, node);
    facts.set(fact.id, fact);
    factNodes.set(fact, node);
    originalNodes.set(node, fact);
  };
  for (const cell of problem.cells)
    add("domain-axiom@1", Object.freeze({ kind: "domain", cell, mask: 2 ** problem.symbols.length - 1 }));
  for (const cell of problem.cells) if (problem.givens[cell] !== 0)
    add("given@1", Object.freeze({ kind: "literal", value: Object.freeze({ cell, symbol: problem.givens[cell], positive: true }) }));
  const ruleHandles = new Map<string, number>();
  for (const rule of problem.constraints) {
    ruleHandles.set(rule.id, facts.size);
    add("rule-instance@1", Object.freeze({ kind: "rule", constraintId: rule.id }));
  }
  const constraintFor = (premise: number) => {
    const node = nodes.get(premise);
    requireProof(node?.conclusion.kind === "rule", "invalid-capability-premise");
    requireProof(ruleHandles.get(node.conclusion.constraintId) === premise, "invalid-capability-premise");
    return node.conclusion.constraintId;
  };
  const canonicalCapabilities = <T extends { id: string }>(capabilities: readonly T[]): T[] => {
    requireProof(new Set(capabilities.map(capability => capability.id)).size === capabilities.length,
      "duplicate-capability-id");
    return [...capabilities].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  };
  for (const capability of canonicalCapabilities(assembly.allDifferent)) {
    const constraintId = constraintFor(capability.premise);
    requireProof(capability.id === constraintId, "invalid-capability-id");
    add("all-different@1", Object.freeze({ kind: "all-different", cells: Object.freeze([...capability.cells]) }),
      [capability.premise], { constraintId });
  }
  for (const capability of canonicalCapabilities(assembly.covers)) {
    const constraintId = constraintFor(capability.premise);
    requireProof(capability.id === `${constraintId}:symbol:${capability.symbol}`, "invalid-capability-id");
    add("cover@1", Object.freeze({ kind: "cover", symbol: capability.symbol, cells: Object.freeze([...capability.cells]) }),
      [capability.premise], { constraintId });
  }
  for (const capability of canonicalCapabilities(assembly.relations)) {
    const constraintId = constraintFor(capability.premise);
    requireProof(capability.id === `${constraintId}:relation`, "invalid-capability-id");
    add("relation@1", Object.freeze({ kind: "relation", cells: Object.freeze([...capability.cells]),
      tuples: Object.freeze(capability.tuples.map(tuple => Object.freeze([...tuple]))) }),
      [capability.premise], { constraintId });
  }
  for (const node of nodes.values()) rootCounts.set(node, facts.size);
  return new ImmutableMap(facts);
}

/** Confined branch publication; implemented beside the private candidate owner. */
export { forkView } from "./candidates";
