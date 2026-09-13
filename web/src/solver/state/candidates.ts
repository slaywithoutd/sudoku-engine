import { canonicalProblem } from "../problem";
import type { BranchId } from "../problem";
import type { Assembly, FactId, NodeId } from "../rules/types";
import type { CheckedStep, ProofNode } from "../proof/types";
import { checkedEffectState, checkedImportsMatch, checkedNodeInference, isCheckedStep } from "../proof/checker";
import { requireProof, sameValue } from "../proof/primitives";
import { createRoots, ImmutableMap, rootNode } from "./facts";
import { CandidateIndexes } from "./indexes";
import type { CandidateState, Fact, Literal, ReadView } from "./types";
import type { ChangeSet } from "./events";

const owners = new WeakMap<CandidateState, CandidateOwner>();

/**
 * Owns one immutable candidate revision and its exact accepted proof prefix.
 * Publication happens only after local effects, facts and indexes all validate;
 * older views can be retained safely by discovery, transport and the UI.
 */
class CandidateOwner {
  readonly view: ReadView;
  readonly nodes: ReadonlyMap<NodeId, ProofNode>;
  readonly indexes: CandidateIndexes;

  constructor(assembly: Assembly, state: CandidateState, facts: ReadonlyMap<FactId, Fact>,
    nodes: ReadonlyMap<NodeId, ProofNode>, previous?: CandidateOwner, cells?: readonly number[]) {
    this.nodes = new ImmutableMap(nodes);
    this.indexes = new CandidateIndexes(assembly, state, previous?.indexes, cells);
    this.view = Object.freeze({ assembly, state, facts: new ImmutableMap(facts),
      supports: (id: string) => this.indexes.supports(id) });
    owners.set(state, this);
    Object.freeze(this);
  }

  commit(step: CheckedStep): { view: ReadView; changes: ChangeSet } {
    requireProof(isCheckedStep(step), "inauthentic-checked-step");
    const before = this.view.state;
    requireProof(sameValue(before.key, step.proposal.state), "stale-step-state");
    requireProof(step.proposal.effects.length > 0, "unproductive-step");
    requireProof(step.afterRevision === before.key.revision + 1, "invalid-after-revision");
    requireProof(checkedImportsMatch(step, this.nodes), "substituted-step-import");
    const edited = checkedEffectState(this.view, step.proposal, step.consequences);
    const key = Object.freeze({ ...before.key, revision: step.afterRevision });
    const nodes = new Map(this.nodes), facts = new Map(this.view.facts), domainFacts = [...before.domainFacts];
    for (const node of step.proposal.proof.nodes) {
      requireProof(!nodes.has(node.id), "reused-proof-node");
      const inference = checkedNodeInference(node);
      requireProof(inference, "inauthentic-proof-node");
      nodes.set(node.id, node);
      facts.set(node.id, Object.freeze({ id: node.id, root: node.id, state: key,
        proposition: inference.conclusion, openAssumptions: inference.openAssumptions,
        conditional: inference.conditional, rules: inference.rules }));
    }
    for (const cell of edited.cells) {
      const root = step.proposal.proof.roots.find(id => {
        const proposition = facts.get(id)?.proposition;
        return proposition?.kind === "domain" && proposition.cell === cell && proposition.mask === edited.domains[cell];
      });
      requireProof(root !== undefined, "missing-domain-fact");
      domainFacts[cell] = root;
    }
    const state = Object.freeze({ key, values: Object.freeze(edited.values), domains: Object.freeze(edited.domains),
      domainFacts: Object.freeze(domainFacts) });
    const next = new CandidateOwner(this.view.assembly, state, facts, nodes, this, edited.cells);
    const removed: Literal[] = [], placed: Literal[] = [];
    for (const cell of edited.cells) {
      for (const symbol of this.view.assembly.problem.symbols)
        if ((before.domains[cell] & ~state.domains[cell] & (1 << (symbol - 1))) !== 0)
          removed.push(Object.freeze({ cell, symbol, positive: false }));
      if (state.values[cell] !== before.values[cell]) placed.push(Object.freeze({ cell, symbol: state.values[cell], positive: true }));
    }
    const incidence = this.indexes.affected(edited.cells);
    const changes: ChangeSet = Object.freeze({ before: before.key, after: key,
      cells: Object.freeze(edited.cells), removed: Object.freeze(removed), placed: Object.freeze(placed),
      coverIds: incidence.covers, relationIds: incidence.relations, constraintIds: incidence.constraints, graphChanged: true });
    return Object.freeze({ view: next.view, changes });
  }

  /** Cache closed checked facts without changing any candidate or revision. */
  retain(step: CheckedStep): ReadView {
    requireProof(isCheckedStep(step), "inauthentic-checked-step");
    requireProof(sameValue(this.view.state.key, step.proposal.state) && step.afterRevision === this.view.state.key.revision, "stale-step-state");
    requireProof(step.proposal.effects.length === 0, "effectful-fact-retention");
    requireProof(checkedImportsMatch(step, this.nodes), "substituted-step-import");
    const nodes = new Map(this.nodes), facts = new Map(this.view.facts);
    for (const node of step.proposal.proof.nodes) {
      requireProof(!nodes.has(node.id), "reused-proof-node");
      const inference = checkedNodeInference(node);
      requireProof(inference, "inauthentic-proof-node");
      nodes.set(node.id, node);
      facts.set(node.id, Object.freeze({ id: node.id, root: node.id, state: this.view.state.key,
        proposition: inference.conclusion, openAssumptions: inference.openAssumptions,
        conditional: inference.conditional, rules: inference.rules }));
    }
    return new CandidateOwner(this.view.assembly, Object.freeze({ ...this.view.state }), facts, nodes, this, []).view;
  }
}

function owner(view: ReadView): CandidateOwner {
  const owned = owners.get(view.state);
  requireProof(owned && owned.view.assembly === view.assembly && owned.view.facts === view.facts, "inauthentic-candidate-view");
  return owned;
}

/**
 * Starts with full unresolved domains and given singletons, never peer pruning.
 * Given literals are explicit singleton authority (see domainAssertion). Root
 * allocation is structurally bounded; the run controller charges initialization
 * under its deadline/budget before discovery, and ProofChecker charges retention.
 */
export function initialize(input: Assembly, branch: BranchId): ReadView {
  // Validate original input before copying it, using the root factory's caps.
  const roots = createRoots(input, branch);
  const assembly: Assembly = Object.freeze({ ...input, problem: canonicalProblem(input.problem),
    modules: new ImmutableMap(input.problem.constraints.map(rule => [rule.id, input.modules.get(rule.id)!] as const)),
    allDifferent: Object.freeze(input.allDifferent.map(scope => Object.freeze({ ...scope, cells: Object.freeze([...scope.cells]) }))),
    covers: Object.freeze(input.covers.map(cover => Object.freeze({ ...cover, cells: Object.freeze([...cover.cells]) }))),
    relations: Object.freeze(input.relations.map(relation => Object.freeze({ ...relation,
      cells: Object.freeze([...relation.cells]), tuples: Object.freeze(relation.tuples.map(tuple => Object.freeze([...tuple]))) }))),
    // Reconstruct bounded peer metadata from the capabilities already checked
    // by createRoots; externally supplied lists are not candidate authority.
    peers: Object.freeze(input.problem.cells.map(cell => Object.freeze([...new Set(input.allDifferent
      .filter(scope => scope.cells.includes(cell)).flatMap(scope => scope.cells).filter(peer => peer !== cell))].sort((a, b) => a - b)))) });
  const values = Object.freeze([...assembly.problem.givens]);
  const domainFacts = [...assembly.problem.cells];
  for (const fact of roots.values()) if (fact.proposition.kind === "literal" && fact.proposition.value.positive)
    domainFacts[fact.proposition.value.cell] = fact.id;
  const state: CandidateState = Object.freeze({ key: roots.get(0)!.state, values,
    domains: Object.freeze(values.map(value => value === 0 ? 2 ** assembly.problem.symbols.length - 1 : 1 << (value - 1))),
    domainFacts: Object.freeze(domainFacts) });
  return new CandidateOwner(assembly, state, roots, new Map([...roots.values()].map(fact => [fact.root, rootNode(fact)]))).view;
}

/** Exact immutable prefix to supply as CheckContext.retained on the next check. */
export function retainedProof(view: ReadView): ReadonlyMap<NodeId, ProofNode> { return owner(view).nodes; }

/** Retain exact checked definitions for subsequent proofs, without a state edit. */
export function retainCheckedFacts(view: ReadView, step: CheckedStep): ReadView { return owner(view).retain(step); }

/** Run identity and deadline remain the controller's final pre-commit guard. */
export function commitChecked(view: ReadView, step: CheckedStep): { view: ReadView; changes: ChangeSet } {
  return owner(view).commit(step);
}

export type StateDiagnostic = { readonly kind: "empty-domain"; readonly cell: number }
  | { readonly kind: "missing-cover"; readonly coverId: string }
  | { readonly kind: "duplicate-values"; readonly constraintId: string; readonly symbol: number; readonly cells: readonly number[] };

/** Human-state diagnostics are never independent exact solution-count evidence. */
export function diagnose(view: ReadView): readonly StateDiagnostic[] {
  const result: StateDiagnostic[] = [];
  for (const cell of view.assembly.problem.cells) if (view.state.domains[cell] === 0)
    result.push(Object.freeze({ kind: "empty-domain", cell }));
  for (const scope of view.assembly.allDifferent) for (const symbol of view.assembly.problem.symbols) {
    const cells = scope.cells.filter(cell => view.state.values[cell] === symbol);
    if (cells.length > 1) result.push(Object.freeze({ kind: "duplicate-values", constraintId: scope.id, symbol, cells: Object.freeze(cells) }));
  }
  for (const cover of view.assembly.covers) if (view.supports(cover.id).length === 0)
    result.push(Object.freeze({ kind: "missing-cover", coverId: cover.id }));
  return Object.freeze(result);
}
