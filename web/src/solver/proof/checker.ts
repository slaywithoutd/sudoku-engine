import { canonicalProblem } from "../problem";
import type { Json } from "../problem";
import type { StateKey } from "../snapshot";
import { ImmutableMap, originalFact, originalRootCount, originalPremises } from "../state/facts";
import { assertM2RootAssemblyBounds, PrimitiveRegistry, ProofError, requireProof, sameValue } from "./primitives";
import type { CheckContext, CheckEvent, CheckedInference, CheckedStep, DeductionProposal, ProofNode } from "./types";

const authenticSteps = new WeakSet<object>();
interface CheckedNodeAuthority {
  readonly state: StateKey;
  readonly inference: CheckedInference;
  /** References to the actual immutable nodes checked, not just their wire IDs. */
  readonly premises: readonly ProofNode[];
}
const acceptedNodes = new WeakMap<ProofNode, CheckedNodeAuthority>();
const NODE_BYTES = 16 * 1024;
const HEADER_BYTES = 32 * 1024;
const MAX_ARITY = 64;

/** TypeScript brands do not survive a wire boundary; identity is the authority. */
export function isCheckedStep(value: unknown): value is CheckedStep {
  return typeof value === "object" && value !== null && authenticSteps.has(value);
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
      charge(new TextEncoder().encode(JSON.stringify(value)).length);
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
        charge(new TextEncoder().encode(JSON.stringify(key)).length + 1);
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

function captureProposal(input: DeductionProposal, cap: number, stepNodes: number) {
  envelope(input, ["technique", "state", "effects", "proof", "pattern"]);
  envelope(input.proof, ["state", "nodes", "imports", "roots"]);
  const nodes = input.proof.nodes;
  requireProof(Array.isArray(nodes) && nodes.length <= stepNodes && nodes.length <= 4096, "proof-step-node-limit");
  requireProof(Reflect.ownKeys(nodes).length === nodes.length + 1, "invalid-proof-array");
  const references: ProofNode[] = [];
  for (let index = 0; index < nodes.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(nodes, index);
    requireProof(descriptor?.enumerable && "value" in descriptor, "invalid-proof-array");
    references.push(descriptor.value);
  }
  const header = copyBounded({ ...input, proof: { ...input.proof, nodes: [] } }, Math.min(cap, HEADER_BYTES));
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
  constructor(private readonly registry = new PrimitiveRegistry()) {}

  *checkProposal(input: DeductionProposal, source: CheckContext): Generator<CheckEvent, void, void> {
    try {
      const limits = { ...source.limits };
      for (const value of Object.values(limits))
        requireProof(Number.isSafeInteger(value) && value >= 0, "invalid-proof-limit");
      const deadline = performance.now() + limits.timeMs;
      let work = 0;
      const tick = () => {
        requireProof(performance.now() < deadline, "proof-time-limit");
        requireProof(++work <= limits.workUnits, "proof-work-limit");
      };
      requireProof(source.retained.size <= limits.runNodes, "proof-run-node-limit");
      const retained = new Map(source.retained);
      const firstRoot = retained.get(0);
      const rootCount = firstRoot && originalRootCount(firstRoot);
      requireProof(rootCount !== undefined && rootCount <= retained.size, "missing-original-roots");
      for (let id = 0; id < rootCount; id++) {
        const root = retained.get(id);
        requireProof(root && originalRootCount(root) === rootCount, "missing-original-roots");
      }
      assertM2RootAssemblyBounds(source.view.assembly);
      const problem = canonicalProblem(source.view.assembly.problem);
      const state = copyBounded(source.view.state.key, NODE_BYTES).value;
      requireProof(state.problemKey === problem.key && typeof state.branch === "string" &&
        state.branch.length > 0 && Number.isSafeInteger(state.revision) && state.revision >= 0, "invalid-proof-state");
      requireProof(["unconditional", "discharged", "unique-only"].includes(source.policy) &&
        (source.uniqueEvidenceId === null || typeof source.uniqueEvidenceId === "string"), "invalid-proof-policy");
      const context: CheckContext = { ...source, limits, retained,
        view: { ...source.view, assembly: { ...source.view.assembly, problem },
          state: { ...source.view.state, key: state } } };
      // Capture a bounded header and node references before yielding. Payloads
      // are copied/checked one at a time below; completed private copies never
      // observe later mutations of the external proposal.
      const captured = captureProposal(input, Math.min(limits.stepBytes, limits.workspaceBytes), limits.stepNodes);
      let runBytes = 0;
      let maximumId = -1;
      const inferences = new Map<number, CheckedInference>();
      for (const [id, node] of retained) {
        tick();
        const original = originalFact(node);
        const checked = acceptedNodes.get(node);
        const authority: CheckedNodeAuthority | undefined = original ? {
          state: original.state,
          premises: originalPremises(node)!,
          inference: Object.freeze({
          conclusion: original.proposition, openAssumptions: original.openAssumptions,
          conditional: original.conditional, rules: original.rules,
        }) } : checked;
        requireProof(authority && id === node.id && Number.isSafeInteger(id) && id >= 0 &&
          authority.state.problemKey === state.problemKey && authority.state.branch === state.branch &&
          authority.state.revision <= state.revision, "inauthentic-retained-node");
        for (const [index, premise] of node.premises.entries()) {
          requireProof(premise < id && retained.has(premise), "missing-retained-dependency");
          // Every retained object may be authentic while its assembled prefix
          // is not. This identity check binds the graph to the checked premises
          // and is independent of the retained Map's iteration order.
          requireProof(retained.get(premise) === authority.premises[index], "substituted-retained-dependency");
        }
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
      // Reserved internal certificate only. Named-family grammar registration is
      // added with T07; root certificates never authorize candidate mutations.
      requireProof(proposal.technique === "rule-propagation@1" &&
        sameValue(proposal.pattern, { kind: "roots" }), "unknown-technique");
      requireProof(sameValue(proposal.effects, []), "unexplained-effect");
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
        requireProof(sameValue(node.scope, []), "unsupported-assumption-scope");
        for (const premise of node.premises)
          requireProof(premise < node.id && available.has(premise), "missing-or-forward-premise");
        const checked = this.registry.check(node, { ...context, retained: new ImmutableMap(available) });
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
        if (!retained.has(id)) pending.push(...node.premises);
        yield { kind: "work", units: 1 };
      }
      requireProof([...available.keys()].every(id => reachable.has(id)), "unused-proof-node");
      tick();
      const consequences = Object.freeze(proof.roots.map(id => inferences.get(id)!));
      // This sole private construction path follows all checks. The WeakSet,
      // not this internal type assertion, rejects casts/deserialized lookalikes.
      const checkedProposal = Object.freeze({ ...proposal,
        proof: Object.freeze({ ...proof, nodes: Object.freeze(stagedNodes) }) });
      const step = Object.freeze({ proposal: checkedProposal, consequences, afterRevision: state.revision }) as CheckedStep;
      authenticSteps.add(step);
      for (const node of stagedNodes) acceptedNodes.set(node, {
        state,
        inference: inferences.get(node.id)!,
        premises: Object.freeze(node.premises.map(id => available.get(id)!)),
      });
      yield { kind: "checked", step };
    } catch (error) {
      yield { kind: "rejected", code: error instanceof ProofError ? error.code : "malformed-proof" };
    }
  }
}

export function checkProposal(proposal: DeductionProposal, context: CheckContext): Generator<CheckEvent, void, void> {
  return new ProofChecker().checkProposal(proposal, context);
}
