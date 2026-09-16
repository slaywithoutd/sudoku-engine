import { canonicalProblem } from "../problem";
import { jsonByteLength } from "../utf8";
import { conditionalViewAuthority, uniqueAuthorityMatches, uniqueAuthorityOwns, type UniqueAuthority } from "../conditional";
import { checkTechniqueGrammar,checkTechniqueGrammarSteps } from "../techniques/grammar";
import { assertOwnedView, isHypotheticalView, branchScope, ownsBranchNode, retainedProof } from "../state/candidates";
import type { Json } from "../problem";
import type { StateKey } from "../snapshot";
import { ImmutableMap, originalFact, originalRootCount, originalPremises } from "../state/facts";
import { assertM2RootAssemblyBounds, PrimitiveRegistry, ProofError, requireProof, sameValue } from "./primitives";
import type { CheckContext, CheckEvent, CheckedInference, CheckedStep, DeductionProposal, ProofNode, CertificateEvent, CheckedCertificate, BranchCertificate, BranchEvent } from "./types";
import type { ReadView } from "../state/types";
import { checkScope } from "./assumptions";
import type { TableDefinition } from "./tables";

const branchSources = new WeakMap<BranchCertificate, ReadView>();
const branchNodes = new WeakMap<ProofNode, CheckedNodeAuthority>();
const authenticSteps = new WeakSet<object>();
// Tokens authenticate exact source publications without retaining historical views.
const sourceTokens = new WeakMap<ReadView, object>();
const stepSources = new WeakMap<CheckedStep, object>();
interface Usage { workUnits:number }
const checkMeters = new WeakMap<object, Usage>();
/** Read-only exact-source predicate; a query never creates source authority. */
export function checkedStepMatchesSource(step:CheckedStep,view:ReadView):boolean {
  const token=sourceTokens.get(view);return !!token&&stepSources.get(step)===token;
}
/** Actual cumulative work, including rejection and explicit generator closure. */
export function checkUsage(cursor:object):Readonly<Usage> {
  const usage=checkMeters.get(cursor);requireProof(usage,"unknown-check-cursor");return Object.freeze({...usage});
}
const conditionalSteps = new WeakMap<CheckedStep, UniqueAuthority>();
const authenticCertificates = new WeakSet<object>();
const certificateAuthorities = new WeakMap<ProofNode, CheckedNodeAuthority>();
const certificateImports = new WeakMap<CheckedCertificate, ReadonlyMap<number, ProofNode>>();
const stepImports = new WeakMap<CheckedStep, ReadonlyMap<number, ProofNode>>();
const stepUsage = new WeakMap<CheckedStep, { readonly headerBytes: number; readonly workUnits: number; readonly stepBytes:number }>();
interface CheckedNodeAuthority {
  readonly state: StateKey;
  readonly inference: CheckedInference;
  /** References to the actual immutable nodes checked, not just their wire IDs. */
  readonly premises: readonly ProofNode[];
  readonly scopes?: readonly ProofNode[];
  readonly table?: TableDefinition;
}
const acceptedNodes = new WeakMap<ProofNode, CheckedNodeAuthority>();
const NODE_BYTES = 16 * 1024;
const HEADER_BYTES = 32 * 1024;
const MAX_ARITY = 64;

/** TypeScript brands do not survive a wire boundary; identity is the authority. */
export function isCheckedStep(value: unknown): value is CheckedStep {
  return typeof value === "object" && value !== null && authenticSteps.has(value);
}

/** Publication rechecks lifetime: checking before Cancel does not authorize a later commit. */
export function assertCheckedStepActive(step: CheckedStep, view: ReadView): void {
  const authority = conditionalSteps.get(step);
  const targetAuthority = conditionalViewAuthority(view);
  if (targetAuthority) {
    requireProof(uniqueAuthorityOwns(targetAuthority, view), "revoked-unique-authority");
    requireProof(authority === targetAuthority, "missing-unique-authority");
  }
  if (authority) requireProof(uniqueAuthorityOwns(authority, view), "revoked-unique-authority");
  else requireProof(!step.consequences.some(c => c.conditional), "missing-unique-authority");
}

/** Retention uses checker-issued objects, including exact imported dependencies. */
export function checkedImportsMatch(step: CheckedStep, retained: ReadonlyMap<number, ProofNode>): boolean {
  const imports = stepImports.get(step);
  return imports !== undefined && [...imports].every(([id, node]) => retained.get(id) === node);
}

/** Read-only authority lookup for retaining all intermediate checked facts. */
export function checkedNodeInference(node: ProofNode): CheckedInference | undefined {
  return acceptedNodes.get(node)?.inference;
}

/** Exact non-node bytes: bounded header plus separators between serialized nodes. */
export function checkedHeaderBytes(step: CheckedStep): number {
  requireProof(isCheckedStep(step), "inauthentic-checked-step");
  return stepUsage.get(step)!.headerBytes;
}

/** Exact successful codec size, including header and all node records. */
export function checkedStepBytes(step:CheckedStep):number {requireProof(isCheckedStep(step),"inauthentic-checked-step");return stepUsage.get(step)!.stepBytes;}

/** Includes bookkeeping/duplicate visits which need not emit a public work yield. */
export function checkedWorkUnits(step: CheckedStep): number {
  requireProof(isCheckedStep(step), "inauthentic-checked-step");
  return stepUsage.get(step)!.workUnits;
}

/**
 * Reconstructs the complete candidate transaction from proved literal roots.
 * Placement peers must be explicit effects with their own proofs. Exact domain
 * roots close every edited cell, so calculated masks never manufacture facts.
 */
export function checkedEffectState(view: ReadView, proposal: DeductionProposal,
  consequences: readonly CheckedInference[]) {
  const values = [...view.state.values], domains = [...view.state.domains];
  const effects = proposal.effects, seen = new Set<string>(), cells = new Set<number>();
  requireProof(effects.length > 0, "unproductive-step");
  for (const effect of effects) {
    fields(effect, ["kind", "cell", "symbol"]);
    requireProof((effect.kind === "place" || effect.kind === "remove") &&
      view.assembly.problem.cells.includes(effect.cell) && view.assembly.problem.symbols.includes(effect.symbol), "invalid-effect");
    const identity = `${effect.kind}:${effect.cell}:${effect.symbol}`;
    requireProof(!seen.has(identity), "duplicate-effect"); seen.add(identity);
    const bit = 1 << (effect.symbol - 1);
    requireProof(view.state.values[effect.cell] === 0 && (view.state.domains[effect.cell] & bit) !== 0,
      "given-overwrite-or-unproductive-effect");
    requireProof(consequences.some(item => sameValue(item.conclusion, {
      kind: "literal", value: { cell: effect.cell, symbol: effect.symbol, positive: effect.kind === "place" },
    })), "unexplained-effect");
    if (effect.kind === "place") {
      requireProof(values[effect.cell] === 0 && (domains[effect.cell] & bit) !== 0, "conflicting-effects");
      values[effect.cell] = effect.symbol; domains[effect.cell] = bit;
    } else {
      requireProof(values[effect.cell] === 0, "conflicting-effects");
      domains[effect.cell] &= ~bit;
    }
    cells.add(effect.cell);
  }
  for (const effect of effects) if (effect.kind === "place") {
    // Derive peers from declared capabilities, never trust an external peer list.
    const peers = new Set(view.assembly.allDifferent.filter(scope => scope.cells.includes(effect.cell))
      .flatMap(scope => scope.cells).filter(cell => cell !== effect.cell));
    for (const peer of peers) {
      requireProof(values[peer] !== effect.symbol, "duplicate-placement");
      if ((view.state.domains[peer] & (1 << (effect.symbol - 1))) !== 0)
        requireProof(seen.has(`remove:${peer}:${effect.symbol}`), "missing-peer-effect");
    }
  }
  for (const cell of cells) requireProof(consequences.some(item =>
    sameValue(item.conclusion, { kind: "domain", cell, mask: domains[cell] })), "missing-domain-consequence");
  for (const item of consequences) {
    const p = item.conclusion;
    requireProof((p.kind === "literal" && seen.has(`${p.value.positive ? "place" : "remove"}:${p.value.cell}:${p.value.symbol}`)) ||
      (p.kind === "domain" && cells.has(p.cell) && p.mask === domains[p.cell]), "extraneous-effect-root");
  }
  return { values, domains, cells: [...cells].sort((a, b) => a - b) };
}

function sameState(left: StateKey, right: StateKey): boolean {
  return sameValue(left, right);
}

/**
 * Copies only bounded, ordinary JSON data. Walk before serialization so a huge
 * string, sparse array, accessor, cycle, or nested table cannot evade byte caps.
 * Scalar length checks bound temporary escape/UTF-8 allocations too. Charging
 * exact JSON punctuation and UTF-8 keys avoids accepting oversize Unicode nodes
 * or silently narrowing the protocol's header allowance.
 */
function copyBounded<T>(input: T, limit: number): { value: T; bytes: number } {
  let remaining = limit;
  const active = new WeakSet<object>();
  const charge = (bytes: number) => {
    remaining -= bytes;
    requireProof(remaining >= 0, "proof-byte-limit");
  };
  const visit = (value: unknown, depth: number): Json => {
    requireProof(depth <= 32, "proof-depth-limit");
    if (value === null || typeof value === "boolean") {
      charge(value === false ? 5 : 4);
      return value;
    }
    if (typeof value === "number") {
      requireProof(Number.isSafeInteger(value), "invalid-proof-number");
      charge(String(value).length);
      return value;
    }
    if (typeof value === "string") {
      requireProof(value.length <= remaining, "proof-byte-limit");
      charge(jsonByteLength(value));
      return value;
    }
    requireProof(typeof value === "object" && value !== null, "invalid-proof-json");
    requireProof(!active.has(value), "cyclic-proof-json");
    active.add(value);
    const array = Array.isArray(value);
    requireProof(array || Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null, "invalid-proof-json");
    if (array) requireProof(value.length <= 4096, "proof-array-limit");
    const keys = Reflect.ownKeys(value);
    requireProof(keys.length <= (array ? 4097 : 64), "proof-arity-limit");
    charge(2);
    // Dense arrays (own indices plus `length` only) take an index walk with the
    // same charges; anything unusual falls through to the key-validating path.
    if (array && keys.length === value.length + 1) {
      const dense: Json[] = [];
      let valid = true;
      for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, index);
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) { valid = false; break; }
      }
      if (valid) {
        for (let index = 0; index < value.length; index++) {
          if (index > 0) charge(1);
          dense.push(visit((value as unknown[])[index], depth + 1));
        }
        active.delete(value);
        return Object.freeze(dense);
      }
    }
    const result: Record<string, Json> | Json[] = array ? [] : {};
    let entries = 0;
    for (const key of keys) {
      if (array && key === "length") continue;
      requireProof(typeof key === "string", "invalid-proof-json");
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      requireProof(descriptor.enumerable && "value" in descriptor, "invalid-proof-json");
      if (array) requireProof(/^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length, "invalid-proof-array");
      if (entries++ > 0) charge(1);
      if (!array) {
        requireProof(key.length <= remaining, "proof-byte-limit");
        charge(jsonByteLength(key) + 1);
      }
      Object.defineProperty(result, key, { value: visit(descriptor.value, depth + 1), enumerable: true });
    }
    if (array) requireProof(Object.keys(result).length === value.length, "sparse-proof-array");
    active.delete(value);
    return Object.freeze(result);
  };
  const value = visit(input, 0) as T;
  return { value, bytes: limit - remaining };
}

/** Bounded data capture for lifecycle transport. No proof or candidate authority is issued. */
export function captureProofRecord<T>(input: T, limit: number): { readonly value: T; readonly bytes: number } {
  requireProof(Number.isSafeInteger(limit) && limit >= 0 && limit <= HEADER_BYTES, "invalid-capture-limit");
  return copyBounded(input, limit);
}

function fields(value: object, names: readonly string[]): void {
  requireProof(sameValue(Object.keys(value).sort(), [...names].sort()), "invalid-proof-fields");
}

/** Validate envelope descriptors without evaluating getters or walking payloads. */
function envelope(value: object, names: readonly string[]): void {
  requireProof(value !== null && typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null), "invalid-proof-json");
  const keys = Reflect.ownKeys(value);
  requireProof(keys.length === names.length, "invalid-proof-fields");
  for (const key of keys) {
    requireProof(typeof key === "string" && names.includes(key), "invalid-proof-fields");
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    requireProof(descriptor.enumerable && "value" in descriptor, "invalid-proof-json");
  }
}

function* captureProposal(input: DeductionProposal, cap: number, stepNodes: number,
  tick: () => void): Generator<CheckEvent, { header: ReturnType<typeof copyBounded<DeductionProposal>>; references: ProofNode[] }, void> {
  envelope(input, ["technique", "state", "effects", "proof", "pattern"]);
  envelope(input.proof, ["state", "nodes", "imports", "roots"]);
  const nodes = input.proof.nodes;
  requireProof(Array.isArray(nodes) && nodes.length <= stepNodes && nodes.length <= 16384, "proof-step-node-limit");
  requireProof(Reflect.ownKeys(nodes).length === nodes.length + 1, "invalid-proof-array");
  const count = nodes.length;
  const header = copyBounded({ ...input, proof: { ...input.proof, nodes: [] } }, Math.min(cap, HEADER_BYTES));
  const references: ProofNode[] = [];
  for (let index = 0; index < count; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(nodes, index);
    requireProof(descriptor?.enumerable && "value" in descriptor, "invalid-proof-array");
    references.push(descriptor.value);
    // Larger configured steps remain cooperatively capturable. A batch never
    // traverses payloads, and the initial length/header cannot change mid-check.
    if ((index + 1) % 64 === 0) { tick(); yield { kind: "work", units: 1 }; }
  }
  return { header, references };
}

function ids(values: readonly number[], cap: number): void {
  requireProof(Array.isArray(values) && values.length <= cap &&
    values.every(value => Number.isSafeInteger(value) && value >= 0) &&
    new Set(values).size === values.length, "invalid-node-ids");
}

/**
 * Independent primitive checking and immutable staging. No discovery routines
 * participate. A checked result is not a commit: the controller must still
 * validate its active run/deadline/revision before passing it to the reducer.
 */
export class ProofChecker {
  checkProposal(input: DeductionProposal, source: CheckContext): Generator<CheckEvent, void, void> {
    const meter:Usage={workUnits:0};
    const cursor=(function*():Generator<CheckEvent,void,void>{
      for(const event of verifyGraph(input,source,"named",meter)) {
        if(event.kind==="verified"||event.kind==="branch-checked")throw Error("internal-admission-error");
        yield event;
      }
    })();
    checkMeters.set(cursor,meter);return cursor;
  }
}

/** Captures a monotone checker stage without copying its entire prefix per node. */
class ProofStage implements ReadonlyMap<number,ProofNode> {
  readonly #map:ReadonlyMap<number,ProofNode>;readonly #cutoff:number;
  constructor(map:ReadonlyMap<number,ProofNode>,cutoff:number){this.#map=map;this.#cutoff=cutoff;Object.freeze(this);}
  get size():number {let n=0;for(const _ of this.keys())n++;return n;}
  get(id:number):ProofNode|undefined{return id<this.#cutoff?this.#map.get(id):undefined;}
  has(id:number):boolean{return id<this.#cutoff&&this.#map.has(id);}
  *entries():MapIterator<[number,ProofNode]>{for(const [id,node] of this.#map)if(id<this.#cutoff)yield [id,node];}
  *keys():MapIterator<number>{for(const [id] of this.entries())yield id;}
  *values():MapIterator<ProofNode>{for(const [,node] of this.entries())yield node;}
  [Symbol.iterator]():MapIterator<[number,ProofNode]>{return this.entries();}
  forEach(callback:(value:ProofNode,key:number,map:ReadonlyMap<number,ProofNode>)=>void,thisArg?:unknown):void{for(const [id,node] of this.entries())callback.call(thisArg,node,id,this);}
}

/** Grammar reads consume live credit, including repeated imported ancestry walks. */
class MeteredProofStage extends ProofStage {
  readonly #charge:(units?:number)=>void;
  constructor(map:ReadonlyMap<number,ProofNode>,cutoff:number,charge:(units?:number)=>void){super(map,cutoff);this.#charge=charge;}
  override get(id:number):ProofNode|undefined{this.#charge();return super.get(id);}
  override has(id:number):boolean{this.#charge();return super.has(id);}
  override *entries():MapIterator<[number,ProofNode]>{for(const entry of super.entries()){this.#charge();yield entry;}}
}

/** Admission mode is private, never a caller parameter or injectable strategy. */
function* verifyGraph(input: DeductionProposal, source: CheckContext, admission: "named" | "certificate" | "branch", meter?:Usage): Generator<CheckEvent | CertificateEvent | BranchEvent, void, void> {
    try {
      // Capture once before authentication: context accessors cannot swap a
      // forged view between the owner gate and later grammar reconstruction.
      const sourceView = source.view;
      if (admission !== "certificate") assertOwnedView(sourceView);
      const suppliedAuthority = source.uniqueAuthority;
      const ownedAuthority = conditionalViewAuthority(sourceView);
      requireProof(!ownedAuthority || !suppliedAuthority || suppliedAuthority === ownedAuthority, "foreign-unique-authority");
      // Bind lifetime from private origin identity even when context omits the
      // capability. Only the explicit capability below may enable uniqueness.
      const lifetimeAuthority = ownedAuthority ?? suppliedAuthority;
      if (lifetimeAuthority)
        requireProof(uniqueAuthorityOwns(lifetimeAuthority, sourceView), "revoked-unique-authority");
      if (admission === "branch") requireProof(isHypotheticalView(sourceView), "not-hypothetical-view");
      else { try { requireProof(!isHypotheticalView(sourceView), "hypothetical-primary-admission"); }
        catch (error) { if (!(error instanceof ProofError) || error.code !== "inauthentic-candidate-view") throw error; } }
      const lexical = admission === "branch" ? branchScope(sourceView) : [];
      const limits = { ...source.limits };
      for (const value of Object.values(limits))
        requireProof(Number.isSafeInteger(value) && value >= 0, "invalid-proof-limit");
      requireProof(limits.stepNodes <= 16384, "invalid-proof-limit");
      const deadline = performance.now() + limits.timeMs;
      let work = 0;
      const remainingWork=source.remainingWork;
      const tick = (units=1) => {
        requireProof(performance.now() < deadline, "proof-time-limit");
        requireProof(work+units <= limits.workUnits && (!remainingWork || units<=remainingWork()), "proof-work-limit");
        work+=units;if(meter)meter.workUnits=work;
      };
      const suppliedRetained = source.retained;
      requireProof(suppliedRetained.size <= limits.runNodes, "proof-run-node-limit");
      const retained = new Map<number,ProofNode>();
      for(const [id,node] of suppliedRetained){tick();retained.set(id,node);yield {kind:"work",units:1};}
      const branchPrefix = admission === "branch" ? retainedProof(sourceView) : undefined;
      if (branchPrefix) {
        // Every source node must participate in the allocation boundary, not
        // only the subset a caller elects to import into this deduction.
        requireProof(retained.size === branchPrefix.size, "branch-prefix-mismatch");
      }
      const firstRoot = retained.get(0);
      const rootCount = firstRoot && originalRootCount(firstRoot);
      requireProof(rootCount !== undefined && rootCount <= retained.size, "missing-original-roots");
      for (let id = 0; id < rootCount; id++) {
        tick();yield {kind:"work",units:1};
        const root = retained.get(id);
        requireProof(root && originalRootCount(root) === rootCount, "missing-original-roots");
      }
      // Owned publications already contain the immutable canonical problem.
      // Standalone certificates still authenticate/capture their external input.
      if(admission==="certificate")assertM2RootAssemblyBounds(sourceView.assembly);
      const problem = admission==="certificate"?canonicalProblem(sourceView.assembly.problem):sourceView.assembly.problem;
      const state = copyBounded(sourceView.state.key, NODE_BYTES).value;
      requireProof(state.problemKey === problem.key && typeof state.branch === "string" &&
        state.branch.length > 0 && Number.isSafeInteger(state.revision) && state.revision >= 0, "invalid-proof-state");
      requireProof(["unconditional", "discharged", "unique-only"].includes(source.policy) &&
        (source.uniqueEvidenceId === null || typeof source.uniqueEvidenceId === "string"), "invalid-proof-policy");
      if (source.policy === "unique-only") requireProof(uniqueAuthorityMatches(suppliedAuthority, sourceView), "missing-unique-authority");
      const context: CheckContext = { limits, retained, policy: source.policy, uniqueEvidenceId: source.uniqueEvidenceId,
        uniqueAuthority: suppliedAuthority, authorityView: sourceView,
        view: { ...sourceView, assembly: { ...sourceView.assembly, problem },
          state: { ...sourceView.state, key: state } } };
      // Freeze the bounded header first, then capture references in batches.
      // Payloads are copied/checked one at a time below; completed private
      // copies never observe later mutations of the external proposal.
      const captured = yield* captureProposal(input, Math.min(limits.stepBytes, limits.workspaceBytes), limits.stepNodes, tick);
      let runBytes = 0;
      let maximumId = -1;
      const inferences = new Map<number, CheckedInference>();
      const registry = new PrimitiveRegistry();
      for (const [id, node] of retained) {
        tick();
        if (branchPrefix) {
          // Equal cardinality plus exact ID/object membership establishes the
          // complete publication prefix without a second unbudgeted traversal.
          requireProof(branchPrefix.get(id) === node, "branch-prefix-mismatch");
        }
        const original = originalFact(node);
        const checked = acceptedNodes.get(node) ?? (admission === "branch" && ownsBranchNode(sourceView, node) ? branchNodes.get(node) : undefined) ?? (admission === "certificate" ? certificateAuthorities.get(node) : undefined);
        const authority: CheckedNodeAuthority | undefined = original ? {
          state: original.state,
          premises: originalPremises(node)!,
          inference: Object.freeze({
          conclusion: original.proposition, openAssumptions: original.openAssumptions,
          conditional: original.conditional, rules: original.rules,
        }) } : checked;
        requireProof(authority && id === node.id && Number.isSafeInteger(id) && id >= 0 &&
          authority.state.problemKey === state.problemKey && (authority.state.branch === state.branch || admission === "branch" && ownsBranchNode(sourceView, node)) &&
          authority.state.revision <= state.revision, "inauthentic-retained-node");
        if (admission === "branch") requireProof(ownsBranchNode(sourceView, node), "foreign-branch-prefix");
        for (const [index, premise] of node.premises.entries()) {
          requireProof(premise < id && retained.has(premise), "missing-retained-dependency");
          // Every retained object may be authentic while its assembled prefix
          // is not. This identity check binds the graph to the checked premises
          // and is independent of the retained Map's iteration order.
          requireProof(retained.get(premise) === authority.premises[index], "substituted-retained-dependency");
        }
        for (const [index, ancestor] of node.scope.entries())
          requireProof(retained.get(ancestor) === authority.scopes?.[index], "substituted-retained-scope");
        if (authority.table) {tick();registry.seedRetainedTable(node,authority.table);yield {kind:"work",units:1};}
        const encoded = copyBounded(node, NODE_BYTES);
        runBytes += encoded.bytes;
        requireProof(runBytes <= limits.proofBytes && runBytes <= limits.workspaceBytes, "proof-byte-limit");
        maximumId = Math.max(maximumId, id);
        inferences.set(id, authority.inference);
        yield { kind: "work", units: 1 };
      }
      tick();
      const header = captured.header.value;
      let stepBytes = captured.header.bytes;
      const chargeStep = () => requireProof(stepBytes <= limits.stepBytes &&
        runBytes + stepBytes <= limits.proofBytes && runBytes + stepBytes <= limits.workspaceBytes, "proof-byte-limit");
      chargeStep();
      const proposal = header;
      fields(proposal, ["technique", "state", "effects", "proof", "pattern"]);
      fields(proposal.proof, ["state", "nodes", "imports", "roots"]);
      requireProof(sameState(proposal.state, state) && sameState(proposal.proof.state, state), "stale-proof-state");
      const effectful = proposal.effects.length > 0;
      const proof = proposal.proof;
      requireProof(retained.size + captured.references.length <= limits.runNodes, "proof-run-node-limit");
      ids(proof.imports, 1024);
      ids(proof.roots, 1024);
      requireProof(proof.roots.length > 0, "missing-proof-root");
      const available = new Map<number, ProofNode>();
      for (const id of proof.imports) {
        requireProof(retained.has(id), "missing-proof-import");
        available.set(id, retained.get(id)!);
      }
      const stagedNodes: ProofNode[] = [];
      for (const reference of captured.references) {
        tick();
        const copied = copyBounded(reference, Math.min(NODE_BYTES, limits.stepBytes - stepBytes,
          limits.proofBytes - runBytes - stepBytes, limits.workspaceBytes - runBytes - stepBytes));
        const node = copied.value;
        stepBytes += copied.bytes + (stagedNodes.length === 0 ? 0 : 1);
        chargeStep();
        fields(node, ["id", "rule", "premises", "parameters", "conclusion", "scope"]);
        requireProof(Number.isSafeInteger(node.id) && node.id > maximumId, "nonmonotone-node-id");
        maximumId = node.id;
        ids(node.premises, MAX_ARITY);
        ids(node.scope, MAX_ARITY);
        for (const premise of node.premises)
          requireProof(premise < node.id && available.has(premise), "missing-or-forward-premise");
        const nodeContext = { ...context, retained: new ProofStage(available,node.id), premiseInferences: inferences, currentNode: node,
          workspaceRemaining: limits.workspaceBytes - runBytes - stepBytes };
        checkScope(node, nodeContext);
        const checking = registry.checkSteps(node, nodeContext);
        let next = checking.next();
        while (!next.done) { tick(); yield { kind: "work", units: next.value }; next = checking.next(); }
        const checked = next.value;
        requireProof(checked.openAssumptions.every(id => node.scope.includes(id) || (node.rule === "assume@1" && id === node.id)), "escaped-assumption");
        available.set(node.id, node);
        inferences.set(node.id, checked);
        stagedNodes.push(node);
        yield { kind: "work", units: 1 };
      }
      for (const root of proof.roots) requireProof(available.has(root), "dangling-proof-root");
      const reachable = new Set<number>();
      const pending = [...proof.roots];
      while (pending.length > 0) {
        tick();
        const id = pending.pop()!;
        if (reachable.has(id)) continue;
        reachable.add(id);
        const node = available.get(id)!;
        if (!retained.has(id)) pending.push(...node.premises, ...node.scope);
        yield { kind: "work", units: 1 };
      }
      requireProof([...available.keys()].every(id => reachable.has(id)), "unused-proof-node");
      tick();
      const consequences = Object.freeze(proof.roots.map(id => inferences.get(id)!));
      const assumption = admission === "branch" && proposal.technique === "branch-assumption@1";
      let resultScope = lexical;
      if (assumption) {
        requireProof(lexical.length < 2 && stagedNodes.length === 2 && stagedNodes[0].rule === "assume@1" &&
          sameValue(stagedNodes[0].scope, lexical) && stagedNodes[1].rule === "domain-restrict@1" &&
          sameValue(stagedNodes[1].scope, [...lexical, stagedNodes[0].id]) && sameValue(proof.roots, [stagedNodes[1].id]) &&
          proposal.effects.length === 0, "invalid-branch-assumption");
        resultScope = [...lexical, stagedNodes[0].id];
      }
      requireProof(consequences.every(item => (admission === "branch" ? item.openAssumptions.every(id => resultScope.includes(id)) : item.openAssumptions.length === 0) &&
        (!item.conditional || context.policy === "unique-only")), "open-proof-root");
      if (effectful) checkedEffectState(context.view, proposal, consequences);
      if(admission==="named"||admission==="branch"&&!assumption&&proposal.technique!=="branch-graph@1"){
        const scopeSlots=sourceView.assembly.allDifferent.reduce((n,h)=>n+h.cells.length,0);
        const preparation=sourceView.assembly.problem.cells.length+4*scopeSlots+
          stagedNodes.length*(proposal.effects.length+4)+Math.ceil(captured.header.bytes/256);
        tick(preparation);yield {kind:"work",units:preparation};
      }
      if (admission === "branch" && !assumption) {
        requireProof(stagedNodes.every(n => sameValue(n.scope, lexical)), "foreign-branch-scope");
        requireProof(["c01@1", "c02@1", "c03@1", "c04@1", "c05@1", "branch-graph@1"].includes(proposal.technique), "branch-technique-out-of-profile");
        if (proposal.technique === "branch-graph@1") requireProof(stagedNodes.every(n =>
          ["support@1", "weak-link@1", "cover-clause@1", "resolution@1", "domain-restrict@1", "contradiction@1"].includes(n.rule)), "branch-graph-rule");
        else checkTechniqueGrammar({ ...proposal, proof: { ...proof, nodes: stagedNodes.map(n => ({...n, scope: []})) } }, sourceView, available);
      }
      if (admission === "named") {
        const grammarSources=new MeteredProofStage(available,maximumId+1,tick);
        for(const units of checkTechniqueGrammarSteps({ ...proposal, proof: { ...proof, nodes: stagedNodes } }, sourceView, grammarSources,tick)){
          for(let i=0;i<units;i++)tick();yield {kind:"work",units};
        }
      }
      // This sole private construction path follows all checks. The WeakSet,
      // not this internal type assertion, rejects casts/deserialized lookalikes.
      const checkedProposal = Object.freeze({ ...proposal,
        proof: Object.freeze({ ...proof, nodes: Object.freeze(stagedNodes) }) });
      if (admission === "branch") {
        const certificate = Object.freeze({ proposal: checkedProposal, consequences, scope: Object.freeze([...resultScope]) }) as BranchCertificate;
        branchSources.set(certificate, sourceView);
        for (const node of stagedNodes) {tick();yield {kind:"work",units:1};branchNodes.set(node, { state, inference: inferences.get(node.id)!,
          premises: Object.freeze(node.premises.map(id => available.get(id)!)), scopes: Object.freeze(node.scope.map(id => available.get(id)!)), table: registry.tableDefinition(node) });}
        yield { kind: "branch-checked", certificate }; return;
      }
      if (admission === "certificate") {
        const certificate = Object.freeze({ proposal: checkedProposal, consequences }) as CheckedCertificate;
        authenticCertificates.add(certificate);
        certificateImports.set(certificate, new ImmutableMap(proof.imports.map(id => [id, retained.get(id)!] as const)));
        for (const node of stagedNodes) certificateAuthorities.set(node, {
          state, inference: inferences.get(node.id)!,
          premises: Object.freeze(node.premises.map(id => available.get(id)!)),
          scopes: Object.freeze(node.scope.map(id => available.get(id)!)), table: registry.tableDefinition(node),
        });
        yield { kind: "verified", certificate };
        return;
      }
      const step = Object.freeze({ proposal: checkedProposal, consequences,
        afterRevision: state.revision + (effectful ? 1 : 0) }) as CheckedStep;
      authenticSteps.add(step);
      let sourceToken=sourceTokens.get(sourceView);
      if(!sourceToken){sourceToken=Object.freeze({});sourceTokens.set(sourceView,sourceToken);}
      stepSources.set(step,sourceToken);
      if (lifetimeAuthority) {
        requireProof(uniqueAuthorityOwns(lifetimeAuthority, sourceView), "revoked-unique-authority");
        conditionalSteps.set(step, lifetimeAuthority);
      }
      tick(proof.imports.length);yield {kind:"work",units:proof.imports.length};
      stepImports.set(step, new ImmutableMap(proof.imports.map(id => [id, retained.get(id)!] as const)));
      for (const node of stagedNodes) {tick();yield {kind:"work",units:1};acceptedNodes.set(node, {
        state,
        inference: inferences.get(node.id)!,
        premises: Object.freeze(node.premises.map(id => available.get(id)!)),
        scopes: Object.freeze(node.scope.map(id => available.get(id)!)),
        table: registry.tableDefinition(node),
      });}
      stepUsage.set(step, Object.freeze({ headerBytes: captured.header.bytes + Math.max(0, stagedNodes.length - 1), workUnits: work,stepBytes }));
      yield { kind: "checked", step };
    } catch (error) {
      yield { kind: "rejected", code: error instanceof ProofError ? error.code : "malformed-proof" };
    }
}

/** Non-applying proof infrastructure: these results cannot become owned facts. */
export function* verifyCertificate(input: DeductionProposal, context: CheckContext): Generator<CertificateEvent, void, void> {
  for (const event of verifyGraph(input, context, "certificate")) {
    if (event.kind === "checked" || event.kind === "branch-checked") throw Error("internal-admission-error");
    yield event;
  }
}
export function isCheckedCertificate(value: unknown): value is CheckedCertificate {
  return typeof value === "object" && value !== null && authenticCertificates.has(value);
}
/** Exact import identities for a non-applying session; never candidate authority. */
export function certificateImportsMatch(certificate: CheckedCertificate, retained: ReadonlyMap<number, ProofNode>): boolean {
  return isCheckedCertificate(certificate) && [...certificateImports.get(certificate)!].every(([id,node]) => retained.get(id) === node);
}

export function checkProposal(proposal: DeductionProposal, context: CheckContext): Generator<CheckEvent, void, void> {
  return new ProofChecker().checkProposal(proposal, context);
}

/** Read-only identities for the confined candidate issuer. */
export function branchCertificateSource(certificate: BranchCertificate): ReadView | undefined { return branchSources.get(certificate); }
export function branchNodeInference(node: ProofNode): CheckedInference | undefined { return branchNodes.get(node)?.inference; }
/** No caller-selected admission mode; this entry always requires an authentic fork. */
export function verifyBranch(proposal: DeductionProposal, context: CheckContext): Generator<BranchEvent> {
  const meter:Usage={workUnits:0};
  const cursor=(function*():Generator<BranchEvent>{for(const event of verifyGraph(proposal,context,"branch",meter)){
    if(event.kind==="checked"||event.kind==="verified")throw Error("internal-admission-error");yield event;
  }})();checkMeters.set(cursor,meter);return cursor;
}
