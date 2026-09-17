import { conditionalViewAuthority } from "../conditional";
import { canonicalProblem } from "../problem";
import type { BranchId } from "../problem";
import type { Assembly, FactId, NodeId } from "../rules/types";
import type { CheckedInference, CheckedStep, ProofNode } from "../proof/types";
import type { StateKey } from "../snapshot";
import {
  checkedEffectState,
  checkedImportsMatch,
  checkedNodeInference,
  isCheckedStep,
  assertCheckedStepActive,
  checkedStepMatchesSource,
} from "../proof/checker";
import { requireProof, sameValue } from "../proof/primitives";
import { defined } from "../invariants";
import { createRoots, ImmutableMap, rootNode } from "./facts";
import { CandidateIndexes } from "./indexes";
import type { CandidateState, Fact, Literal, ReadView } from "./types";
import type { ChangeSet } from "./events";
import type { IndexWorkspace, WorkspaceReservation } from "../indexes/workspace";
import type { BranchCertificate, BranchEvent, DeductionProposal, Limits } from "../proof/types";
import {
  branchCertificateSource,
  branchNodeInference,
  verifyBranch,
  checkUsage,
} from "../proof/checker";
import { symbolMask } from "./read";

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
  dispose(): void {
    for (const view of this.views) owners.delete(view);
    this.views.clear();
    this.lease.dispose();
  }
}
let branchSequence = 0;

/** Branch-local immutable append layer; accepted prefix objects are shared read-only. */
class BranchAppendMap<K, V> implements ReadonlyMap<K, V> {
  readonly #base: ReadonlyMap<K, V>;
  readonly #added: ImmutableMap<K, V>;
  constructor(base: ReadonlyMap<K, V>, added: ReadonlyMap<K, V>) {
    for (const key of added.keys()) requireProof(!base.has(key), "reused-proof-node");
    this.#base = base;
    this.#added = new ImmutableMap(added);
    Object.freeze(this);
  }
  get size(): number {
    return this.#base.size + this.#added.size;
  }
  get(key: K): V | undefined {
    return this.#added.get(key) ?? this.#base.get(key);
  }
  has(key: K): boolean {
    return this.#added.has(key) || this.#base.has(key);
  }
  *entries(): MapIterator<[K, V]> {
    yield* this.#base;
    yield* this.#added;
  }
  *keys(): MapIterator<K> {
    for (const [key] of this.entries()) yield key;
  }
  *values(): MapIterator<V> {
    for (const [, value] of this.entries()) yield value;
  }
  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries();
  }
  forEach(callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown): void {
    for (const [key, value] of this.entries()) callback.call(thisArg, value, key, this);
  }
}

/** A checked proof node published as its own root fact. */
function rootFact(node: ProofNode, inference: CheckedInference, state: StateKey): Fact {
  return Object.freeze({
    id: node.id,
    root: node.id,
    state,
    proposition: inference.conclusion,
    openAssumptions: inference.openAssumptions,
    conditional: inference.conditional,
    rules: inference.rules,
  });
}

/** The proof root whose domain claim exactly matches the edited domain of `cell`. */
function domainRoot(
  step: CheckedStep,
  facts: ReadonlyMap<FactId, Fact>,
  cell: number,
  mask: number,
): FactId {
  const root = step.proposal.proof.roots.find((id) => {
    const proposition = facts.get(id)?.proposition;
    return proposition?.kind === "domain" && proposition.cell === cell && proposition.mask === mask;
  });
  requireProof(root !== undefined, "missing-domain-fact");
  return root;
}

/** Frozen negative literals for every dropped candidate and positive ones for new placements. */
function changedLiterals(
  before: CandidateState,
  after: CandidateState,
  cells: readonly number[],
  symbols: readonly number[],
): { removed: Literal[]; placed: Literal[] } {
  const removed: Literal[] = [],
    placed: Literal[] = [];
  for (const cell of cells) {
    for (const symbol of symbols)
      if ((before.domains[cell] & ~after.domains[cell] & symbolMask(symbol)) !== 0)
        removed.push(Object.freeze({ cell, symbol, positive: false }));
    if (after.values[cell] !== before.values[cell])
      placed.push(Object.freeze({ cell, symbol: after.values[cell], positive: true }));
  }
  return { removed, placed };
}

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

  constructor(
    assembly: Assembly,
    state: CandidateState,
    facts: ReadonlyMap<FactId, Fact>,
    nodes: ReadonlyMap<NodeId, ProofNode>,
    previous?: CandidateOwner,
    cells?: readonly number[],
    step?: CheckedStep,
    branch?: BranchOwnership,
  ) {
    this.branch = branch;
    this.lineage = Object.freeze(
      previous && step
        ? {
            anchor: previous.lineage.anchor,
            parent: previous.lineage,
            step,
            length: previous.lineage.length + 1,
          }
        : { anchor: Object.freeze({}), parent: null, step: null, length: 0 },
    );
    this.nodes =
      nodes instanceof ImmutableMap || nodes instanceof BranchAppendMap
        ? nodes
        : new ImmutableMap(nodes);
    this.indexes =
      previous && cells?.length === 0
        ? previous.indexes
        : new CandidateIndexes(assembly, state, previous?.indexes, cells);
    this.view = Object.freeze({
      assembly,
      state,
      facts:
        facts instanceof ImmutableMap || facts instanceof BranchAppendMap
          ? facts
          : new ImmutableMap(facts),
      supports: (id: string) => this.indexes.supports(id),
    });
    owners.set(this.view, this);
    branch?.resource.views.add(this.view);
    Object.freeze(this);
  }

  commit(step: CheckedStep): { view: ReadView; changes: ChangeSet } {
    requireProof(!this.branch, "hypothetical-primary-admission");
    requireProof(isCheckedStep(step), "inauthentic-checked-step");
    assertCheckedStepActive(step, this.view);
    const before = this.view.state;
    requireProof(sameValue(before.key, step.proposal.state), "stale-step-state");
    requireProof(step.proposal.effects.length > 0, "unproductive-step");
    requireProof(step.afterRevision === before.key.revision + 1, "invalid-after-revision");
    requireProof(checkedImportsMatch(step, this.nodes), "substituted-step-import");
    const edited = checkedEffectState(this.view, step.proposal, step.consequences);
    const key = Object.freeze({ ...before.key, revision: step.afterRevision });
    const nodes = new Map(this.nodes),
      facts = new Map(this.view.facts),
      domainFacts = [...before.domainFacts];
    for (const node of step.proposal.proof.nodes) {
      requireProof(!nodes.has(node.id), "reused-proof-node");
      const inference = checkedNodeInference(node);
      requireProof(inference, "inauthentic-proof-node");
      nodes.set(node.id, node);
      facts.set(node.id, rootFact(node, inference, key));
    }
    for (const cell of edited.cells)
      domainFacts[cell] = domainRoot(step, facts, cell, edited.domains[cell]);
    const state = Object.freeze({
      key,
      values: Object.freeze(edited.values),
      domains: Object.freeze(edited.domains),
      domainFacts: Object.freeze(domainFacts),
    });
    const next = new CandidateOwner(
      this.view.assembly,
      state,
      facts,
      nodes,
      this,
      edited.cells,
      step,
    );
    const { removed, placed } = changedLiterals(
      before,
      state,
      edited.cells,
      this.view.assembly.problem.symbols,
    );
    const incidence = this.indexes.affected(edited.cells);
    const changes: ChangeSet = Object.freeze({
      before: before.key,
      after: key,
      cells: Object.freeze(edited.cells),
      removed: Object.freeze(removed),
      placed: Object.freeze(placed),
      coverIds: incidence.covers,
      relationIds: incidence.relations,
      constraintIds: incidence.constraints,
      graphChanged: true,
    });
    return Object.freeze({ view: next.view, changes });
  }

  /** Cache closed checked facts without changing any candidate or revision. */
  retain(step: CheckedStep): ReadView {
    requireProof(!this.branch, "hypothetical-primary-admission");
    requireProof(isCheckedStep(step), "inauthentic-checked-step");
    assertCheckedStepActive(step, this.view);
    requireProof(
      sameValue(this.view.state.key, step.proposal.state) &&
        step.afterRevision === this.view.state.key.revision,
      "stale-step-state",
    );
    requireProof(step.proposal.effects.length === 0, "effectful-fact-retention");
    requireProof(checkedImportsMatch(step, this.nodes), "substituted-step-import");
    const nodes = new Map(this.nodes),
      facts = new Map(this.view.facts);
    for (const node of step.proposal.proof.nodes) {
      requireProof(!nodes.has(node.id), "reused-proof-node");
      const inference = checkedNodeInference(node);
      requireProof(inference, "inauthentic-proof-node");
      nodes.set(node.id, node);
      facts.set(node.id, rootFact(node, inference, this.view.state.key));
    }
    return new CandidateOwner(
      this.view.assembly,
      Object.freeze({ ...this.view.state }),
      facts,
      nodes,
      this,
      [],
      step,
    ).view;
  }
}

function owner(view: ReadView): CandidateOwner {
  const owned = owners.get(view);
  requireProof(owned, "inauthentic-candidate-view");
  return owned;
}

/** Read-only authenticity gate; it cannot register a view or create authority. */
export function assertOwnedView(view: ReadView): void {
  owner(view);
}

/**
 * Read-only identity of an authentic accepted origin. The frozen token exposes
 * no owner registration or mutation, and hypothetical publications are excluded.
 */
export function acceptedOriginIdentity(view: ReadView): object | undefined {
  const owned = owners.get(view);
  return owned && !owned.branch ? owned.lineage.anchor : undefined;
}

/** Constant-work origin test for an operation's fresh accepted lineage. */
export function hasAcceptedOrigin(initial: ReadView, view: ReadView): boolean {
  try {
    const start = owner(initial),
      current = owner(view);
    return (
      !start.branch &&
      !current.branch &&
      start.lineage.length === 0 &&
      start.lineage.anchor === current.lineage.anchor
    );
  } catch {
    return false;
  }
}

/** Exact publication gates; these queries confer no registration authority. */
export function isHypotheticalView(view: ReadView): boolean {
  return !!owner(view).branch;
}
export function branchScope(view: ReadView): readonly number[] {
  const branch = owner(view).branch;
  requireProof(branch, "not-hypothetical-view");
  return branch.scope;
}
export function ownsBranchNode(view: ReadView, node: ProofNode): boolean {
  const owned = owner(view);
  return !!owned.branch && owned.nodes.get(node.id) === node;
}
export function branchAllowsFact(view: ReadView, fact: Fact): boolean {
  const owned = owner(view);
  return (
    owned.view.facts.get(fact.id) === fact &&
    fact.openAssumptions.every((id) => owned.branch?.scope.includes(id))
  );
}

/** Reserve before allocating a fork. Labels never establish identity. */
export function forkView(parent: ReadView, label: BranchId, workspace: IndexWorkspace): ReadView {
  const previous = owner(parent);
  requireProof(
    typeof label === "string" && label.length > 0 && label.length <= 128,
    "invalid-branch-label",
  );
  const lease = workspace.reserve(
    1,
    65536 + parent.facts.size * 128 + parent.state.domains.length * 256,
  );
  const resource = new BranchResource(lease);
  try {
    const state = Object.freeze({
      ...parent.state,
      key: Object.freeze({
        ...parent.state.key,
        branch: `hypothetical:${++branchSequence}:${label}`,
      }),
      values: Object.freeze([...parent.state.values]),
      domains: Object.freeze([...parent.state.domains]),
      domainFacts: Object.freeze([...parent.state.domainFacts]),
    });
    return new CandidateOwner(
      parent.assembly,
      state,
      parent.facts,
      previous.nodes,
      previous,
      [],
      undefined,
      { parent: previous, scope: previous.branch?.scope ?? Object.freeze([]), resource },
    ).view;
  } catch (error) {
    resource.dispose();
    throw error;
  }
}
export function disposeFork(view: ReadView): void {
  const branch = owner(view).branch;
  requireProof(branch, "not-hypothetical-view");
  branch.resource.dispose();
}

/**
 * Confined issuer: only branch-checked exact source publications may edit local
 * domains. A false/empty-domain result remains a certificate, never a usable
 * inconsistent view. Public primary reducers cannot accept its result brand.
 */
export class HypotheticalSession {
  #view?: ReadView;
  #rollout = false;
  #rolloutSteps = 0;
  constructor(parent: ReadView, label: BranchId, workspace: IndexWorkspace) {
    this.#view = forkView(parent, label, workspace);
  }
  /** Adopt one already named-checked deduction into a fresh, isolated computation. */
  static fromChecked(
    parent: ReadView,
    step: CheckedStep,
    label: BranchId,
    workspace: IndexWorkspace,
    charge: (units: number) => void,
  ): HypotheticalSession {
    const previous = owner(parent);
    HypotheticalSession.#requireRolloutSource(parent, previous, step, charge);
    const edited = checkedEffectState(parent, step.proposal, step.consequences);
    const session = new HypotheticalSession(parent, label, workspace);
    session.#rollout = true;
    try {
      const branch = owner(session.view).branch;
      requireProof(branch, "not-hypothetical-view");
      branch.resource.lease.grow(
        step.proposal.proof.nodes.length,
        65536 + step.proposal.proof.nodes.length * 2048 + parent.facts.size * 128,
      );
      const nodes = new Map<NodeId, ProofNode>(),
        facts = new Map<FactId, Fact>(),
        domainFacts = [...parent.state.domainFacts];
      const key = Object.freeze({ ...session.view.state.key, revision: step.afterRevision });
      for (const node of step.proposal.proof.nodes) {
        const inference = checkedNodeInference(node);
        requireProof(inference && !nodes.has(node.id), "inauthentic-proof-node");
        nodes.set(node.id, node);
        facts.set(node.id, rootFact(node, inference, key));
      }
      const published = new BranchAppendMap(parent.facts, facts);
      for (const cell of edited.cells)
        domainFacts[cell] = domainRoot(step, published, cell, edited.domains[cell]);
      const state = Object.freeze({
        key,
        values: Object.freeze(edited.values),
        domains: Object.freeze(edited.domains),
        domainFacts: Object.freeze(domainFacts),
      });
      session.#view = new CandidateOwner(
        parent.assembly,
        state,
        published,
        new BranchAppendMap(previous.nodes, nodes),
        owner(session.view),
        edited.cells,
        undefined,
        branch,
      ).view;
      return session;
    } catch (error) {
      session.dispose();
      throw error;
    }
  }
  /** Rollout only adopts an unconditional, productive step checked against this exact source. */
  static #requireRolloutSource(
    parent: ReadView,
    previous: CandidateOwner,
    step: CheckedStep,
    charge: (units: number) => void,
  ): void {
    requireProof(
      !previous.branch && !conditionalViewAuthority(parent),
      "rollout-primary-source-required",
    );
    requireProof(
      isCheckedStep(step) && checkedStepMatchesSource(step, parent),
      "rollout-source-mismatch",
    );
    requireProof(step.proposal.effects.length > 0, "rollout-requires-productive-step");
    assertCheckedStepActive(step, parent);
    requireProof(checkedImportsMatch(step, previous.nodes), "substituted-step-import");
    requireProof(
      step.consequences.every(
        (consequence) => !consequence.conditional && !consequence.openAssumptions.length,
      ),
      "rollout-open-or-conditional-root",
    );
    // Charge source validation, bounded changed-cell indexes and cleanup first.
    // Lexically scoped intermediate nodes remain scoped, never promoted to roots.
    charge(
      parent.facts.size +
        step.proposal.proof.nodes.length * 8 +
        parent.state.domains.length * 16 +
        2,
    );
    for (const fact of parent.facts.values())
      requireProof(!fact.conditional, "rollout-conditional-source");
    for (const node of step.proposal.proof.nodes)
      requireProof(!checkedNodeInference(node)?.conditional, "rollout-conditional-source");
  }
  get view(): ReadView {
    requireProof(this.#view, "disposed-hypothetical-session");
    assertOwnedView(this.#view);
    return this.#view;
  }
  *assume(value: Literal, limits: Limits): Generator<BranchEvent> {
    requireProof(!this.#rollout, "rollout-assumptions-forbidden");
    const view = this.view,
      scope = branchScope(view),
      id = Math.max(...view.facts.keys()) + 1;
    requireProof(scope.length < 2, "branch-depth-limit");
    requireProof(
      view.assembly.problem.cells.includes(value.cell) &&
        view.assembly.problem.symbols.includes(value.symbol) &&
        !view.state.values[value.cell] &&
        view.state.domains[value.cell] & symbolMask(value.symbol),
      "nonlive-branch-assumption",
    );
    const bit = symbolMask(value.symbol),
      mask = value.positive
        ? view.state.domains[value.cell] & bit
        : view.state.domains[value.cell] & ~bit;
    const proposal: DeductionProposal = {
      technique: "branch-assumption@1",
      state: view.state.key,
      effects: [],
      pattern: {},
      proof: {
        state: view.state.key,
        imports: [...new Set([view.state.domainFacts[value.cell], ...scope])],
        roots: [id + 1],
        nodes: [
          {
            id,
            rule: "assume@1",
            premises: [],
            conclusion: { kind: "literal", value },
            parameters: {},
            scope,
          },
          {
            id: id + 1,
            rule: "domain-restrict@1",
            premises: [view.state.domainFacts[value.cell], id],
            conclusion: { kind: "domain", cell: value.cell, mask },
            parameters: {},
            scope: [...scope, id],
          },
        ],
      },
    };
    for (const event of verifyBranch(proposal, {
      view,
      retained: retainedProof(view),
      limits,
      policy: "discharged",
      uniqueEvidenceId: null,
    })) {
      if (event.kind === "branch-checked") this.publish(event.certificate);
      yield event;
    }
  }
  *check(proposal: DeductionProposal, limits: Limits): Generator<BranchEvent> {
    if (this.#rollout)
      requireProof(
        ["c01@1", "c02@1", "c03@1", "c04@1", "c05@1"].includes(proposal.technique),
        "rollout-technique-out-of-profile",
      );
    const view = this.view,
      scope = branchScope(view);
    const scoped = {
      ...proposal,
      proof: {
        ...proposal.proof,
        imports: [...new Set([...proposal.proof.imports, ...scope])],
        nodes: proposal.proof.nodes.map((node) => ({ ...node, scope })),
      },
    };
    const cursor = verifyBranch(scoped, {
      view,
      retained: retainedProof(view),
      limits,
      policy: "discharged",
      uniqueEvidenceId: null,
    });
    let emitted = 0;
    try {
      for (const event of cursor) {
        if (event.kind === "work") {
          emitted += event.units;
          yield event;
        } else {
          const hidden = Math.max(0, checkUsage(cursor).workUnits - emitted);
          if (hidden) {
            emitted += hidden;
            yield { kind: "work", units: hidden };
          }
          yield event;
        }
      }
    } finally {
      cursor.return(undefined);
    }
  }
  publish(certificate: BranchCertificate): void {
    const view = this.view;
    const previous = owner(view);
    const branch = previous.branch;
    requireProof(branch, "not-hypothetical-view");
    this.#requirePublishable(certificate, view, previous);
    branch.resource.lease.grow(
      1,
      65536 + certificate.proposal.proof.nodes.length * 2048 + view.facts.size * 128,
    );
    const nodes = new Map<NodeId, ProofNode>();
    const facts = new Map<FactId, Fact>();
    const domains = [...view.state.domains];
    const domainFacts = [...view.state.domainFacts];
    const values = [...view.state.values];
    const key = Object.freeze({ ...view.state.key, revision: view.state.key.revision + 1 });
    for (const node of certificate.proposal.proof.nodes) {
      const inference = branchNodeInference(node);
      requireProof(inference, "inauthentic-proof-node");
      nodes.set(node.id, node);
      facts.set(node.id, rootFact(node, inference, key));
    }
    for (const id of certificate.proposal.proof.roots) {
      const root = nodes.get(id) ?? previous.nodes.get(id);
      requireProof(root, "missing-branch-root");
      const conclusion = root.conclusion;
      if (conclusion.kind === "domain") {
        requireProof(
          (conclusion.mask & view.state.domains[conclusion.cell]) === conclusion.mask,
          "branch-domain-widening",
        );
        domains[conclusion.cell] = conclusion.mask;
        domainFacts[conclusion.cell] = id;
      }
    }
    for (const effect of certificate.proposal.effects) {
      if (effect.kind === "place") {
        values[effect.cell] = effect.symbol;
      }
    }
    const state = Object.freeze({
      key,
      domains: Object.freeze(domains),
      domainFacts: Object.freeze(domainFacts),
      values: Object.freeze(values),
    });
    this.#view = new CandidateOwner(
      view.assembly,
      state,
      this.#rollout ? new BranchAppendMap(view.facts, facts) : new Map([...view.facts, ...facts]),
      this.#rollout
        ? new BranchAppendMap(previous.nodes, nodes)
        : new Map([...previous.nodes, ...nodes]),
      previous,
      view.assembly.problem.cells.filter(
        (cell) =>
          state.values[cell] !== view.state.values[cell] ||
          state.domains[cell] !== view.state.domains[cell],
      ),
      undefined,
      { parent: branch.parent, scope: certificate.scope, resource: branch.resource },
    ).view;
    if (this.#rollout) this.#rolloutSteps++;
  }
  /** Publication independently protects every existing fact binding. Validate
   * the entire bundle before growing the lease or allocating replacement maps. */
  #requirePublishable(certificate: BranchCertificate, view: ReadView, previous: CandidateOwner) {
    if (this.#rollout)
      requireProof(
        this.#rolloutSteps < 16 &&
          certificate.proposal.effects.length > 0 &&
          ["c01@1", "c02@1", "c03@1", "c04@1", "c05@1"].includes(certificate.proposal.technique),
        "rollout-step-limit",
      );
    requireProof(branchCertificateSource(certificate) === view, "foreign-branch-certificate");
    requireProof(
      !certificate.consequences.some(
        (consequence) =>
          consequence.conclusion.kind === "false" ||
          (consequence.conclusion.kind === "domain" && consequence.conclusion.mask === 0),
      ),
      "contradictory-branch-publication",
    );
    for (const node of certificate.proposal.proof.nodes) {
      requireProof(!previous.nodes.has(node.id) && !view.facts.has(node.id), "reused-proof-node");
      requireProof(branchNodeInference(node), "inauthentic-branch-node");
    }
  }
  dispose(): void {
    if (this.#view) {
      disposeFork(this.#view);
      this.#view = undefined;
    }
  }
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
  const rebuilt = Object.freeze({
    assembly,
    state,
    facts,
    supports: (id: string) => indexes.supports(id),
  });
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
  const assembly = frozenAssembly(input);
  const values = Object.freeze([...assembly.problem.givens]);
  const domainFacts = [...assembly.problem.cells];
  for (const fact of roots.values())
    if (fact.proposition.kind === "literal" && fact.proposition.value.positive)
      domainFacts[fact.proposition.value.cell] = fact.id;
  const state: CandidateState = Object.freeze({
    key: defined(roots.get(0), "root-fact").state,
    values,
    domains: Object.freeze(
      values.map((value) =>
        value === 0 ? 2 ** assembly.problem.symbols.length - 1 : symbolMask(value),
      ),
    ),
    domainFacts: Object.freeze(domainFacts),
  });
  return new CandidateOwner(
    assembly,
    state,
    roots,
    new Map([...roots.values()].map((fact) => [fact.root, rootNode(fact)])),
  ).view;
}

/** Deep-frozen copy of the assembly, with peers rebuilt from the checked capabilities. */
function frozenAssembly(input: Assembly): Assembly {
  return Object.freeze({
    ...input,
    problem: canonicalProblem(input.problem),
    modules: new ImmutableMap(
      input.problem.constraints.map(
        (rule) => [rule.id, defined(input.modules.get(rule.id), "rule-module")] as const,
      ),
    ),
    allDifferent: Object.freeze(
      input.allDifferent.map((scope) =>
        Object.freeze({ ...scope, cells: Object.freeze([...scope.cells]) }),
      ),
    ),
    covers: Object.freeze(
      input.covers.map((cover) =>
        Object.freeze({ ...cover, cells: Object.freeze([...cover.cells]) }),
      ),
    ),
    relations: Object.freeze(
      input.relations.map((relation) =>
        Object.freeze({
          ...relation,
          cells: Object.freeze([...relation.cells]),
          tuples: Object.freeze(relation.tuples.map((tuple) => Object.freeze([...tuple]))),
        }),
      ),
    ),
    // Reconstruct bounded peer metadata from the capabilities already checked
    // by createRoots; externally supplied lists are not candidate authority.
    peers: Object.freeze(
      input.problem.cells.map((cell) =>
        Object.freeze(
          [
            ...new Set(
              input.allDifferent
                .filter((scope) => scope.cells.includes(cell))
                .flatMap((scope) => scope.cells)
                .filter((peer) => peer !== cell),
            ),
          ].sort((left, right) => left - right),
        ),
      ),
    ),
  });
}

/** Exact immutable prefix to supply as CheckContext.retained on the next check. */
export function retainedProof(view: ReadView): ReadonlyMap<NodeId, ProofNode> {
  return owner(view).nodes;
}

/**
 * Authenticates the entire committed prefix from the actual root-only view.
 * Lineage retains only step identities and a root anchor, never historical views
 * or full fact maps. Cost is linear in bundle count, including proof-only caches.
 * A cold support-index rebuild keeps the same owned state/facts and is accepted.
 */
export function isAcceptedPath(
  initial: ReadView,
  accepted: ReadView,
  steps: readonly CheckedStep[],
): boolean {
  try {
    const root = owner(initial).lineage;
    let current = owner(accepted).lineage;
    if (
      root.parent !== null ||
      root.step !== null ||
      initial.state.key.revision !== 0 ||
      current.anchor !== root.anchor ||
      !Array.isArray(steps) ||
      steps.length !== current.length
    )
      return false;
    for (let index = steps.length - 1; index >= 0; index--) {
      if (current.step !== steps[index] || !current.parent) return false;
      current = current.parent;
    }
    return current === root;
  } catch {
    return false;
  }
}

/**
 * Read-only operation transition gate. Walk only the accepted-prefix delta;
 * the caller charges each parent traversal and interruption propagates.
 * Cold rebuilds preserve lineage identity; same-assembly siblings do not.
 */
export function isAcceptedDescendant(
  before: ReadView,
  after: ReadView,
  charge: (units: number) => void,
): boolean {
  if (typeof charge !== "function") throw Error("missing-lineage-work-charge");
  let prior: AcceptedLineage, current: AcceptedLineage;
  try {
    prior = owner(before).lineage;
    current = owner(after).lineage;
  } catch {
    return false;
  }
  if (prior.anchor !== current.anchor || current.length < prior.length) return false;
  while (current.length > prior.length) {
    charge(1);
    if (!current.parent) return false;
    current = current.parent;
  }
  return current === prior;
}

/** Exact immediate accepted bundle, including effect-free same-revision publications. */
export function acceptedStepChanges(
  before: ReadView,
  after: ReadView,
  step: CheckedStep,
): ChangeSet {
  const prior = owner(before),
    next = owner(after);
  requireProof(
    !prior.branch &&
      !next.branch &&
      next.lineage.parent === prior.lineage &&
      next.lineage.step === step,
    "unaccepted-scheduler-successor",
  );
  assertCheckedStepActive(step, after);
  const cells = before.assembly.problem.cells.filter(
    (cell) =>
      before.state.values[cell] !== after.state.values[cell] ||
      before.state.domains[cell] !== after.state.domains[cell],
  );
  const removed: Literal[] = [],
    placed: Literal[] = [];
  for (const cell of cells) {
    for (const symbol of before.assembly.problem.symbols)
      if (before.state.domains[cell] & ~after.state.domains[cell] & symbolMask(symbol))
        removed.push({ cell, symbol, positive: false });
    if (before.state.values[cell] !== after.state.values[cell])
      placed.push({ cell, symbol: after.state.values[cell], positive: true });
  }
  const incidence = prior.indexes.affected(cells);
  return Object.freeze({
    before: before.state.key,
    after: after.state.key,
    cells: Object.freeze(cells),
    removed: Object.freeze(removed),
    placed: Object.freeze(placed),
    coverIds: incidence.covers,
    relationIds: incidence.relations,
    constraintIds: incidence.constraints,
    graphChanged: true,
    sourceChanged: true,
  });
}

/** Retain exact checked definitions for subsequent proofs, without a state edit. */
export function retainCheckedFacts(view: ReadView, step: CheckedStep): ReadView {
  return owner(view).retain(step);
}

/** Run identity and deadline remain the controller's final pre-commit guard. */
export function commitChecked(
  view: ReadView,
  step: CheckedStep,
): { view: ReadView; changes: ChangeSet } {
  return owner(view).commit(step);
}

export type StateDiagnostic =
  | { readonly kind: "empty-domain"; readonly cell: number }
  | { readonly kind: "missing-cover"; readonly coverId: string }
  | {
      readonly kind: "duplicate-values";
      readonly constraintId: string;
      readonly symbol: number;
      readonly cells: readonly number[];
    };

/** Human-state diagnostics are never independent exact solution-count evidence. */
export function diagnose(view: ReadView): readonly StateDiagnostic[] {
  const result: StateDiagnostic[] = [];
  for (const cell of view.assembly.problem.cells)
    if (view.state.domains[cell] === 0) result.push(Object.freeze({ kind: "empty-domain", cell }));
  for (const scope of view.assembly.allDifferent)
    for (const symbol of view.assembly.problem.symbols) {
      const cells = scope.cells.filter((cell) => view.state.values[cell] === symbol);
      if (cells.length > 1)
        result.push(
          Object.freeze({
            kind: "duplicate-values",
            constraintId: scope.id,
            symbol,
            cells: Object.freeze(cells),
          }),
        );
    }
  for (const cover of view.assembly.covers)
    if (view.supports(cover.id).length === 0)
      result.push(Object.freeze({ kind: "missing-cover", coverId: cover.id }));
  return Object.freeze(result);
}
