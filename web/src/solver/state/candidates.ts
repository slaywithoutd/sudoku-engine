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
import type { IndexWorkspace, WorkspaceReservation } from "../indexes/workspace";
import type { BranchCertificate, BranchEvent, DeductionProposal, Limits } from "../proof/types";
import { branchCertificateSource, branchNodeInference, verifyBranch } from "../proof/checker";

// Authority belongs to the exact frozen publication, never a state-shaped
// wrapper whose property accessors or Proxy traps can change after admission.
const owners = new WeakMap<ReadView, CandidateOwner>();
interface BranchOwnership {
  readonly parent: CandidateOwner;
  readonly scope: readonly number[];
  readonly resource: BranchResource;
}
class BranchResource {
  readonly views = new Set<ReadView>();
  constructor(readonly lease: WorkspaceReservation) {}
  dispose(): void { for (const view of this.views) owners.delete(view); this.views.clear(); this.lease.dispose(); }
}
let branchSequence = 0;

interface AcceptedLineage {
  readonly anchor: object;
  readonly parent: AcceptedLineage | null;
  readonly step: CheckedStep | null;
  readonly length: number;
}

/**
 * Owns one immutable candidate revision and its exact accepted proof prefix.
 * Publication happens only after local effects, facts and indexes all validate;
 * older views can be retained safely by discovery, transport and the UI.
 */
class CandidateOwner {
  readonly view: ReadView;
  readonly nodes: ReadonlyMap<NodeId, ProofNode>;
  readonly indexes: CandidateIndexes;
  readonly lineage: AcceptedLineage;
  readonly branch?: BranchOwnership;

  constructor(assembly: Assembly, state: CandidateState, facts: ReadonlyMap<FactId, Fact>,
    nodes: ReadonlyMap<NodeId, ProofNode>, previous?: CandidateOwner, cells?: readonly number[], step?: CheckedStep, branch?: BranchOwnership) {
    this.branch = branch;
    this.lineage = Object.freeze(previous && step
      ? { anchor: previous.lineage.anchor, parent: previous.lineage, step, length: previous.lineage.length + 1 }
      : { anchor: Object.freeze({}), parent: null, step: null, length: 0 });
    this.nodes = new ImmutableMap(nodes);
    this.indexes = new CandidateIndexes(assembly, state, previous?.indexes, cells);
    this.view = Object.freeze({ assembly, state, facts: new ImmutableMap(facts),
      supports: (id: string) => this.indexes.supports(id) });
    owners.set(this.view, this);
    branch?.resource.views.add(this.view);
    Object.freeze(this);
  }

  commit(step: CheckedStep): { view: ReadView; changes: ChangeSet } {
    requireProof(!this.branch, "hypothetical-primary-admission");
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
    const next = new CandidateOwner(this.view.assembly, state, facts, nodes, this, edited.cells, step);
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
    requireProof(!this.branch, "hypothetical-primary-admission");
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
    return new CandidateOwner(this.view.assembly, Object.freeze({ ...this.view.state }), facts, nodes, this, [], step).view;
  }
}

function owner(view: ReadView): CandidateOwner {
  const owned = owners.get(view);
  requireProof(owned, "inauthentic-candidate-view");
  return owned;
}

/** Read-only authenticity gate; it cannot register a view or create authority. */
export function assertOwnedView(view: ReadView): void { owner(view); }

/** Exact publication gates; these queries confer no registration authority. */
export function isHypotheticalView(view: ReadView): boolean { return !!owner(view).branch; }
export function branchScope(view: ReadView): readonly number[] {
  const branch = owner(view).branch; requireProof(branch, "not-hypothetical-view"); return branch.scope;
}
export function ownsBranchNode(view: ReadView, node: ProofNode): boolean {
  const owned = owner(view); return !!owned.branch && owned.nodes.get(node.id) === node;
}
export function branchAllowsFact(view: ReadView, fact: Fact): boolean {
  const owned = owner(view);
  return owned.view.facts.get(fact.id) === fact && fact.openAssumptions.every(id => owned.branch?.scope.includes(id));
}

/** Reserve before allocating a fork. Labels never establish identity. */
export function forkView(parent: ReadView, label: BranchId, workspace: IndexWorkspace): ReadView {
  const previous = owner(parent);
  requireProof(typeof label === "string" && label.length > 0 && label.length <= 128, "invalid-branch-label");
  const lease = workspace.reserve(1, 65536 + parent.facts.size * 128 + parent.state.domains.length * 256);
  const resource = new BranchResource(lease);
  try {
    const state = Object.freeze({ ...parent.state, key: Object.freeze({ ...parent.state.key, branch: `hypothetical:${++branchSequence}:${label}` }),
      values: Object.freeze([...parent.state.values]), domains: Object.freeze([...parent.state.domains]), domainFacts: Object.freeze([...parent.state.domainFacts]) });
    return new CandidateOwner(parent.assembly, state, parent.facts, previous.nodes, undefined, undefined, undefined,
      { parent: previous, scope: previous.branch?.scope ?? Object.freeze([]), resource }).view;
  } catch (error) { resource.dispose(); throw error; }
}
export function disposeFork(view: ReadView): void { const branch = owner(view).branch; requireProof(branch, "not-hypothetical-view"); branch.resource.dispose(); }

/**
 * Confined issuer: only branch-checked exact source publications may edit local
 * domains. A false/empty-domain result remains a certificate, never a usable
 * inconsistent view. Public primary reducers cannot accept its result brand.
 */
export class HypotheticalSession {
  #view?: ReadView;
  constructor(parent: ReadView, label: BranchId, workspace: IndexWorkspace) { this.#view = forkView(parent, label, workspace); }
  get view(): ReadView { requireProof(this.#view, "disposed-hypothetical-session"); assertOwnedView(this.#view); return this.#view; }
  *assume(value: Literal, limits: Limits): Generator<BranchEvent> {
    const view = this.view, scope = branchScope(view), id = Math.max(...view.facts.keys()) + 1;
    requireProof(scope.length < 2, "branch-depth-limit");
    requireProof(view.assembly.problem.cells.includes(value.cell) && view.assembly.problem.symbols.includes(value.symbol) && !view.state.values[value.cell] && (view.state.domains[value.cell] & (1 << (value.symbol - 1))), "nonlive-branch-assumption");
    const bit = 1 << (value.symbol - 1), mask = value.positive ? view.state.domains[value.cell] & bit : view.state.domains[value.cell] & ~bit;
    const proposal: DeductionProposal = { technique: "branch-assumption@1", state: view.state.key, effects: [], pattern: {},
      proof: { state: view.state.key, imports: [...new Set([view.state.domainFacts[value.cell], ...scope])], roots: [id + 1], nodes: [
        { id, rule: "assume@1", premises: [], conclusion: { kind: "literal", value }, parameters: {}, scope },
        { id: id + 1, rule: "domain-restrict@1", premises: [view.state.domainFacts[value.cell], id], conclusion: { kind: "domain", cell: value.cell, mask }, parameters: {}, scope: [...scope, id] }] } };
    for (const event of verifyBranch(proposal, { view, retained: retainedProof(view), limits, policy: "discharged", uniqueEvidenceId: null })) {
      if (event.kind === "branch-checked") this.publish(event.certificate);
      yield event;
    }
  }
  *check(proposal: DeductionProposal, limits: Limits): Generator<BranchEvent> {
    const view = this.view, scope = branchScope(view);
    const scoped = { ...proposal, proof: { ...proposal.proof, imports: [...new Set([...proposal.proof.imports, ...scope])], nodes: proposal.proof.nodes.map(node => ({ ...node, scope })) } };
    yield* verifyBranch(scoped, { view, retained: retainedProof(view), limits, policy: "discharged", uniqueEvidenceId: null });
  }
  publish(certificate: BranchCertificate): void {
    const view = this.view;
    const previous = owner(view);
    const branch = previous.branch!;
    requireProof(branchCertificateSource(certificate) === view, "foreign-branch-certificate");
    requireProof(!certificate.consequences.some(c => c.conclusion.kind === "false" || c.conclusion.kind === "domain" && c.conclusion.mask === 0), "contradictory-branch-publication");

    // Publication independently protects every existing fact binding. Validate
    // the entire bundle before growing the lease or allocating replacement maps.
    for (const node of certificate.proposal.proof.nodes) {
      requireProof(!previous.nodes.has(node.id) && !view.facts.has(node.id), "reused-proof-node");
      requireProof(branchNodeInference(node), "inauthentic-branch-node");
    }

    branch.resource.lease.grow(1, 65536 + certificate.proposal.proof.nodes.length * 2048 + view.facts.size * 128);
    const nodes = new Map(previous.nodes);
    const facts = new Map(view.facts);
    const domains = [...view.state.domains];
    const domainFacts = [...view.state.domainFacts];
    const values = [...view.state.values];
    const key = Object.freeze({ ...view.state.key, revision: view.state.key.revision + 1 });
    for (const node of certificate.proposal.proof.nodes) {
      const inference = branchNodeInference(node)!;
      nodes.set(node.id, node);
      facts.set(node.id, Object.freeze({
        id: node.id, root: node.id, state: key, proposition: inference.conclusion,
        openAssumptions: inference.openAssumptions, conditional: inference.conditional, rules: inference.rules,
      }));
    }
    for (const id of certificate.proposal.proof.roots) {
      const p = nodes.get(id)!.conclusion;
      if (p.kind === "domain") {
        requireProof((p.mask & view.state.domains[p.cell]) === p.mask, "branch-domain-widening");
        domains[p.cell] = p.mask;
        domainFacts[p.cell] = id;
      }
    }
    for (const effect of certificate.proposal.effects) {
      if (effect.kind === "place") {
        values[effect.cell] = effect.symbol;
      }
    }
    const state = Object.freeze({ key, domains: Object.freeze(domains), domainFacts: Object.freeze(domainFacts), values: Object.freeze(values) });
    this.#view = new CandidateOwner(view.assembly, state, facts, nodes, undefined, undefined, undefined,
      { parent: branch.parent, scope: certificate.scope, resource: branch.resource }).view;
  }
  dispose(): void { if (this.#view) { disposeFork(this.#view); this.#view = undefined; } }
}

/**
 * Publish a cold index rebuild only from an authenticated publication. The
 * owner chooses every field and preserves the exact proof prefix and lineage;
 * callers cannot register wrappers, replacements or supplied index callbacks.
 */
export function rebuildOwnedIndexes(view: ReadView): ReadView {
  const owned = owner(view);
  const { assembly, state, facts } = owned.view;
  // A borrowed branch can request multiple cold indexes; each allocation stays
  // charged to its revocable session instead of escaping the original fork cap.
  owned.branch?.resource.lease.grow(1, 65536 + state.domains.length * 256);
  const indexes = new CandidateIndexes(assembly, state);
  const rebuilt = Object.freeze({ assembly, state, facts, supports: (id: string) => indexes.supports(id) });
  owners.set(rebuilt, owned);
  owned.branch?.resource.views.add(rebuilt);
  return rebuilt;
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

/**
 * Authenticates the entire committed prefix from the actual root-only view.
 * Lineage retains only step identities and a root anchor, never historical views
 * or full fact maps. Cost is linear in bundle count, including proof-only caches.
 * A cold support-index rebuild keeps the same owned state/facts and is accepted.
 */
export function isAcceptedPath(initial: ReadView, accepted: ReadView, steps: readonly CheckedStep[]): boolean {
  try {
    const root = owner(initial).lineage;
    let current = owner(accepted).lineage;
    if (root.parent !== null || root.step !== null || initial.state.key.revision !== 0 ||
      current.anchor !== root.anchor || !Array.isArray(steps) || steps.length !== current.length) return false;
    for (let index = steps.length - 1; index >= 0; index--) {
      if (current.step !== steps[index] || !current.parent) return false;
      current = current.parent;
    }
    return current === root;
  } catch { return false; }
}

/**
 * Read-only operation transition gate. Walk only the accepted-prefix delta;
 * the caller charges each parent traversal and interruption propagates.
 * Cold rebuilds preserve lineage identity; same-assembly siblings do not.
 */
export function isAcceptedDescendant(before:ReadView,after:ReadView,charge:(units:number)=>void):boolean {
  if(typeof charge!=="function")throw Error("missing-lineage-work-charge");
  let prior:AcceptedLineage,current:AcceptedLineage;
  try{prior=owner(before).lineage;current=owner(after).lineage;}catch{return false;}
  if(prior.anchor!==current.anchor||current.length<prior.length)return false;
  while(current.length>prior.length) {
    charge(1);
    if(!current.parent)return false;current=current.parent;
  }
  return current===prior;
}

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
