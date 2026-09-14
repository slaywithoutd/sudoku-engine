import { uniqueParentDetails, type AcceptedUniqueParent } from "./evidence";
import type { RunKey, SolverSnapshot } from "./snapshot";
import type { Assembly } from "./rules/types";
import type { ReadView } from "./state/types";
import type { CheckEvent, CheckedStep, DeductionProposal, Limits } from "./proof/types";
import { initialize, commitChecked, retainCheckedFacts, retainedProof, hasAcceptedOrigin, acceptedOriginIdentity } from "./state/candidates";
import { checkProposal, checkedHeaderBytes, checkedWorkUnits, captureProofRecord } from "./proof/checker";
import { initializationReservation } from "./proof/replay";
import { requireProof, sameValue } from "./proof/primitives";
import { captureConditionalPrefix, type ConditionalPrefixDescriptor, type CapturedConditionalPrefix } from "./conditional-prefix";
import type { IndexWorkspace, WorkspaceReservation } from "./indexes/workspace";

declare const uniqueAuthorityBrand: unique symbol;
/** An operation-local capability, intentionally carrying no count or solution. */
export interface UniqueAuthority { readonly [uniqueAuthorityBrand]: true; }
interface AuthorityRecord {
  readonly parent?: AcceptedUniqueParent;
  readonly run: Readonly<RunKey>;
  readonly initial: ReadView;
  active: boolean;
  ready: boolean;
}
const constructorKey = Symbol("conditional-owner");
const installedPorts = new WeakSet<MessagePort>();
const operations = new WeakSet<ConditionalOperation>();
/** Read-only owner authentication for replay entry points. */
export function isConditionalOperation(value: unknown): value is ConditionalOperation {
  return typeof value === "object" && value !== null && operations.has(value as ConditionalOperation);
}
const authorities = new WeakMap<UniqueAuthority, AuthorityRecord>();
const originAuthorities = new WeakMap<object, UniqueAuthority>();

/**
 * Lifetime bookkeeping for the actual accepted origin, including after revoke.
 * This lookup never supplies implicit permission to check a unique primitive:
 * that still requires the caller's explicit, prefix-ready capability.
 */
export function conditionalViewAuthority(view: ReadView): UniqueAuthority | undefined {
  const origin = acceptedOriginIdentity(view);
  return origin ? originAuthorities.get(origin) : undefined;
}

/** Read-only authentication against the exact owned origin, never its label alone. */
export function uniqueAuthorityMatches(authority: UniqueAuthority | undefined, view: ReadView): boolean {
  const r = authority && authorities.get(authority);
  return !!r && r.ready && uniqueAuthorityOwns(authority, view);
}

/** Prefix rechecking is lifetime-bound before uniqueness premises become enabled. */
export function uniqueAuthorityOwns(authority: UniqueAuthority | undefined, view: ReadView): boolean {
  const r = authority && authorities.get(authority);
  return !!r && r.active && (!r.parent || !!uniqueParentDetails(r.parent)) &&
    view.state.key.problemKey === r.run.problemKey && view.state.key.branch === `conditional:${r.run.requestId}` &&
    hasAcceptedOrigin(r.initial, view);
}

/** Compatibility metadata is a read-only projection; a matching string grants nothing. */
export function uniqueAuthorityEvidenceId(authority: UniqueAuthority | undefined): string | undefined {
  const r = authority && authorities.get(authority);
  return r?.active && r.ready && (!r.parent || uniqueParentDetails(r.parent)) ? r.run.parentEvidenceId! : undefined;
}

function validateRun(run: RunKey, primary: Readonly<RunKey>): void {
  requireProof(sameValue(Object.keys(run).sort(), Object.keys(primary).sort()), "conditional-run-fields");
  requireProof(run.operation === "conditional" && run.profile === "classic-conditional@1" &&
    typeof run.requestId === "string" && run.requestId.length > 0 && run.requestId.length <= 128 && run.requestId !== primary.requestId &&
    (run.mode === "explain" || run.mode === "analyze") && typeof run.optionsKey === "string" && run.optionsKey.length > 0,
    "conditional-run-binding");
  for (const field of ["snapshotId", "inputRevision", "problemKey", "engine", "scheduler", "checker", "exact"] as const)
    requireProof(run[field] === primary[field], "conditional-run-binding");
}

/** Small trusted runtime envelope. Prefix bodies use the separately bounded codec. */
export interface ConditionalBootstrap {
  readonly run: Readonly<RunKey>;
  readonly snapshot: SolverSnapshot;
  readonly prefix: ConditionalPrefixDescriptor;
  readonly nonce: string;
  readonly generation: number;
}
export interface ConditionalReplayDriver {
  /** Must yield a real runtime task, not merely an already-resolved microtask. */
  yieldTask(): Promise<void>;
}
const defaultReplayDriver: ConditionalReplayDriver = Object.freeze({yieldTask:()=>new Promise<void>(resolve=>setTimeout(resolve,0))});
export interface TrustedConditionalBootstrap {
  readonly ready: Promise<ConditionalOperation>;
  /** Called once only after bounded, charged chunk reassembly by the runtime. */
  providePrefix(proposals: readonly DeductionProposal[]): Promise<void>;
  dispose(): void;
}
interface Construction {
  readonly parent?: AcceptedUniqueParent;
  readonly run: RunKey;
  readonly snapshot: SolverSnapshot;
  readonly assembly: Assembly;
  readonly prefixSource:
    | { readonly kind: "accepted"; readonly steps: readonly CheckedStep[] }
    | { readonly kind: "decoded"; readonly proposals: readonly DeductionProposal[] };
  readonly priorWork?: number;
  readonly startedAt?: number;
}

/**
 * Owns original-clue initialization, the rebound/rechecked primary prefix and
 * lifetime of one conditional operation. The parent stays on the controller;
 * its witness is never a logical input or a property of this owner.
 */
export class ConditionalOperation {
  readonly authority: UniqueAuthority;
  readonly initialView: ReadView;
  readonly run: Readonly<RunKey>;
  readonly snapshot: SolverSnapshot;
  readonly assembly: Assembly;
  readonly #prefix: readonly DeductionProposal[];
  readonly #record: AuthorityRecord;
  readonly #lease: WorkspaceReservation;
  readonly #workspace: IndexWorkspace;
  readonly #limits: Limits;
  readonly #deadline: number;
  readonly #startedAt: number;
  #view: ReadView;
  #work = 0;
  #headers = 0;
  #started = false;
  #digest: string | undefined;
  #descriptor: ConditionalPrefixDescriptor | undefined;
  readonly #teardowns: (() => void)[] = [];

  private constructor(key: symbol, details: Construction, limits: Limits, workspace: IndexWorkspace) {
    requireProof(key === constructorKey, "inauthentic-unique-constructor");
    const { parent, run } = details;
    this.run = Object.freeze({ ...run }); this.snapshot = details.snapshot; this.assembly = details.assembly;
    this.#limits = Object.freeze({ ...limits }); this.#workspace = workspace;
    this.#work=details.priorWork??0;
    this.#startedAt=details.startedAt??performance.now(); this.#deadline = this.#startedAt + limits.timeMs;
    this.#lease = workspace.reserve(1, 65536);
    try {
      const estimator = initializationReservation(this.assembly);
      let next = estimator.next();
      while (!next.done) { this.charge(next.value.kind === "work" ? next.value.units : 0); next = estimator.next(); }
      this.charge(next.value.workUnits);
      requireProof(next.value.nodes <= limits.runNodes && next.value.proofBytes <= limits.proofBytes, "conditional-initialization-limit");
      this.#lease.grow(next.value.nodes, next.value.workspaceBytes + next.value.proofBytes);
      this.initialView = initialize(this.assembly, `conditional:${run.requestId}`);
      this.#view = this.initialView;
      const source = details.prefixSource;
      const prefixLength = source.kind === "accepted" ? source.steps.length : source.proposals.length;
      requireProof(prefixLength <= limits.runNodes, "conditional-prefix-bundle-limit");
      // Reserve and charge the sole immutable reference-array copy before
      // projecting accepted steps or copying already decoded worker records.
      this.#lease.grow(prefixLength, prefixLength * 16);
      this.charge(prefixLength);
      this.#prefix = Object.freeze(source.kind === "accepted"
        ? source.steps.map(step => step.proposal)
        : source.proposals.map(proposal => proposal));
      this.charge(0);
      this.authority = Object.freeze({}) as UniqueAuthority;
      this.#record = { parent, run: this.run, initial: this.initialView, active: true, ready: false };
      authorities.set(this.authority, this.#record);
      // Keep the identity binding after disposal so omitted context cannot turn
      // a revoked operation's retained views into ordinary primary owners.
      originAuthorities.set(acceptedOriginIdentity(this.initialView)!, this.authority);
      operations.add(this);
    } catch (error) { this.#lease.dispose(); throw error; }
  }

  static begin(parent: AcceptedUniqueParent, run: RunKey, limits: Limits, workspace: IndexWorkspace): ConditionalOperation {
    const details = uniqueParentDetails(parent);
    requireProof(details, "inauthentic-unique-parent");
    validateRun(run, details.run);
    requireProof(run.parentEvidenceId === parent.evidenceId, "conditional-parent-binding");
    return new ConditionalOperation(constructorKey, {
      parent, run, snapshot: details.snapshot, assembly: details.assembly,
      prefixSource: { kind: "accepted", steps: details.prefix },
    }, limits, workspace);
  }
  get view(): ReadView { return this.#view; }
  get prefix(): readonly DeductionProposal[] { return this.#prefix; }
  get active(): boolean { return this.#record.active && (!this.#record.parent || !!uniqueParentDetails(this.#record.parent)); }
  get prefixDigest(): string | undefined { return this.#digest; }
  /** Cumulative constructor/hash/check/commit usage; no scheduler budget reset. */
  get usage(): {readonly workUnits:number;readonly headerBytes:number;readonly elapsedMs:number} {
    return Object.freeze({workUnits:this.#work,headerBytes:this.#headers,elapsedMs:Math.max(0,performance.now()-this.#startedAt)});
  }
  /** Run caps include retained proof; available work/time/bytes exclude prior use. */
  remainingLimits(): Limits {
    requireProof(this.active,"revoked-unique-authority");
    return Object.freeze({...this.#limits,workUnits:Math.max(0,this.#limits.workUnits-this.#work),
      timeMs:Math.max(0,Math.floor(this.#deadline-performance.now())),proofBytes:Math.max(0,this.#limits.proofBytes-this.#headers),
      workspaceBytes:Math.max(0,this.#limits.workspaceBytes-this.#workspace.usage.bytes)});
  }
  charge(units: number): void {
    if(this.#record)requireProof(this.active,"revoked-unique-authority");
    this.#workspace.checkpoint();
    requireProof(Number.isSafeInteger(units) && units >= 0 && (this.#work += units) <= this.#limits.workUnits, "conditional-work-limit");
    requireProof(performance.now() < this.#deadline, "conditional-time-limit");
  }

  /** Bounded per-header/node encoding; temporary buffers release after asynchronous hashing. */
  async digestPrefix(): Promise<string> {
    requireProof(this.active, "revoked-unique-authority");
    if (!this.#descriptor) {
      const captured = await captureConditionalPrefix(this.#prefix, this.#limits, this.#workspace,
        units => this.charge(units), () => this.active, false);
      try { this.#descriptor = captured.descriptor; this.#digest = captured.descriptor.digest; }
      finally { captured.lease.dispose(); }
    }
    return this.#descriptor.digest;
  }

  /**
   * Main-controller boundary: grant only metadata on the exact supplied dedicated
   * port. Caller transfers its peer exactly once, tears down on replacement and
   * checks acceptsResult before accepting any worker output. No witness crosses.
   */
  async grantBootstrap(port: MessagePort, nonce: string, generation: number): Promise<ConditionalBootstrap> {
    requireProof(port instanceof MessagePort && this.active && this.#record.parent && !installedPorts.has(port),
      "conditional-grant-lifecycle");
    MessagePort.prototype.start.call(port);
    requireProof(typeof nonce === "string" && nonce.length >= 16 && nonce.length <= 128 &&
      Number.isSafeInteger(generation) && generation >= 0, "conditional-grant-binding");

    // Claim synchronously before hashing can yield. A failed attempt consumes
    // and closes this endpoint; a retry must supply a new dedicated channel.
    // A duplicate caller fails above and must not close the first caller's port.
    installedPorts.add(port);
    try {
      await this.digestPrefix();
      requireProof(this.active, "revoked-unique-authority");
      const lease = this.#workspace.reserve(1, 32768 * 4);
      try {
        const frame = captureProofRecord({
          kind: "conditional-grant@1",
          envelope: { run: this.run, snapshot: this.snapshot, prefix: this.#descriptor!, nonce, generation },
        }, 32768).value;
        this.charge(32);
        port.postMessage(frame);
        this.#teardowns.push(() => {
          port.postMessage({ kind: "conditional-revoke@1", nonce, generation });
          port.close();
        });
        return frame.envelope;
      } finally { lease.dispose(); }
    } catch (error) {
      port.close();
      throw error;
    }
  }

  /** Main rejects stale/revoked results independently of worker delivery timing. */
  acceptsResult(run: RunKey, prefix: ConditionalPrefixDescriptor): boolean {
    return this.active && this.#record.ready && sameValue(run,this.run) && sameValue(prefix,this.#descriptor);
  }

  /**
   * TRUSTED worker-runtime installation, never dispatched from proof/data frames.
   * A MessagePort identifies the installed endpoint, not hostile same-realm code.
   * No capability is exposed until both its one-use grant and exact complete
   * prefix have passed independent replay. Chunk transport/backpressure belongs
   * to the runtime; this bounded capture charges its own retained copy and hash.
   */
  static installTrustedBootstrap(port: MessagePort, expected: ConditionalBootstrap, assembly: Assembly,
    limits: Limits, workspace: IndexWorkspace, driver: ConditionalReplayDriver = defaultReplayDriver): TrustedConditionalBootstrap {
    requireProof(port instanceof MessagePort && !installedPorts.has(port), "conditional-port-already-installed");
    MessagePort.prototype.start.call(port);
    const metadataLease = workspace.reserve(1,32768*4);
    let envelope: ConditionalBootstrap;
    try {
      envelope = captureProofRecord(expected,32768).value;
      requireProof(sameValue(envelope.snapshot.problem,assembly.problem) && envelope.run.problemKey === assembly.problem.key &&
        envelope.run.snapshotId === envelope.snapshot.snapshotId && envelope.run.inputRevision === envelope.snapshot.inputRevision &&
        envelope.run.operation === "conditional" && envelope.run.profile === "classic-conditional@1" &&
        typeof envelope.run.parentEvidenceId === "string" && envelope.run.parentEvidenceId.length > 0 &&
        typeof envelope.nonce === "string" && envelope.nonce.length >= 16 && envelope.nonce.length <= 128 &&
        Number.isSafeInteger(envelope.generation) && envelope.generation >= 0, "conditional-bootstrap-binding");
    } catch(error) { metadataLease.dispose(); throw error; }
    installedPorts.add(port);
    let active = true, granted = false, supplied = false, completed = false, replaying=false, captured: CapturedConditionalPrefix | undefined;
    let operation: ConditionalOperation | undefined, work = 0;
    const deadline = performance.now()+limits.timeMs;
    let resolve!: (operation: ConditionalOperation) => void, reject!: (error: unknown) => void;
    const ready = new Promise<ConditionalOperation>((yes,no) => { resolve=yes; reject=no; });
    const charge = (units: number) => {
      workspace.checkpoint(); requireProof(active,"conditional-bootstrap-disposed");
      requireProof((work+=units)<=limits.workUnits,"conditional-work-limit");
      requireProof(performance.now()<deadline,"conditional-time-limit");
    };
    const cleanup = () => { port.removeEventListener("message",onMessage); port.close(); captured?.lease.dispose(); metadataLease.dispose(); };
    const fail = (error: unknown) => { if(!active)return; active=false; operation?.dispose(); cleanup(); reject(error); };
    const finish = async () => {
      if(!active || !granted || !captured || completed || replaying)return;
      replaying=true; // Lock before the first task-yield: port events cannot start a second replay.
      let cursor: Generator<CheckEvent,void,void> | undefined;
      try {
        charge(1);
        operation = new ConditionalOperation(constructorKey,{run:envelope.run,snapshot:envelope.snapshot,assembly,prefixSource:{kind:"decoded",proposals:captured.proposals},
          priorWork:work,startedAt:deadline-limits.timeMs},limits,workspace);
        operation.#descriptor=captured.descriptor; operation.#digest=captured.descriptor.digest;
        cursor=operation.rebuildPrefix();let units=0;
        for(;;) {
          const next=cursor.next();if(next.done)break;
          if(next.value.kind==="rejected")throw Error(next.value.code);
          units+=next.value.kind==="work"?next.value.units:1;
          if(units>=256) {
            units=0;await driver.yieldTask();
            requireProof(active&&operation.active,"revoked-unique-authority");
            operation.charge(1);
          }
        }
        requireProof(active&&operation.active,"revoked-unique-authority");operation.charge(1);
        completed=true;
        operation.#teardowns.push(() => { active=false; cleanup(); });
        resolve(operation);
      }catch(error){fail(error);}finally{cursor?.return();}
    };
    function onMessage(event: MessageEvent) {
      try {
        charge(1);
        const frame=captureProofRecord(event.data,32768).value as any;
        if(frame.kind==="conditional-revoke@1" && frame.nonce===envelope.nonce && frame.generation===envelope.generation)
          throw Error("revoked-unique-authority");
        requireProof(!granted && sameValue(Object.keys(frame).sort(),["envelope","kind"]) &&
          frame.kind==="conditional-grant@1" && sameValue(frame.envelope,envelope),"conditional-grant-mismatch");
        granted=true;void finish();
      }catch(error){fail(error);}
    }
    port.addEventListener("message",onMessage); port.start();
    return Object.freeze({ready,
      async providePrefix(proposals: readonly DeductionProposal[]) {
        try {
          requireProof(active && !supplied,"conditional-prefix-already-supplied"); supplied=true;
          captured=await captureConditionalPrefix(proposals,limits,workspace,charge,()=>active,true);
          requireProof(sameValue(captured.descriptor,envelope.prefix),"conditional-prefix-digest-mismatch");void finish();
        }catch(error){fail(error);throw error;}
      },
      dispose() { fail(Error("conditional-bootstrap-disposed")); }
    });
  }

  /** Rebind only state envelopes; every saved inference gets a fresh checker identity. */
  *rebuildPrefix(): Generator<CheckEvent, void, void> {
    requireProof(this.active && !this.#started, "conditional-prefix-lifecycle"); this.#started = true;
    try {
      for (const original of this.#prefix) {
        this.charge(1);
        requireProof(original.state.branch === "primary" && sameValue(original.state, original.proof.state) &&
          original.state.problemKey === this.run.problemKey && original.state.revision === this.#view.state.key.revision,
          "conditional-prefix-state");
        const state = this.#view.state.key;
        const proposal = { ...original, state, proof: { ...original.proof, state } };
        let accepted = false;
        const beforeWork = this.#work;
        for (const event of checkProposal(proposal, { view: this.#view, retained: retainedProof(this.#view), policy: "discharged",
          uniqueEvidenceId: null, uniqueAuthority: this.authority, limits: { ...this.#limits, workUnits: Math.max(0, this.#limits.workUnits - this.#work),
            timeMs: Math.max(0, Math.floor(this.#deadline - performance.now())), proofBytes: this.#limits.proofBytes - this.#headers } })) {
          if (event.kind === "work") { this.charge(event.units); yield event; }
          else if (event.kind === "rejected") { yield event; return; }
          else {
            this.charge(Math.max(0, beforeWork + checkedWorkUnits(event.step) - this.#work)); requireProof(this.active, "revoked-unique-authority");
            requireProof(event.step.consequences.every(c => !c.conditional && c.openAssumptions.length === 0), "conditional-prefix-taint");
            this.#headers += checkedHeaderBytes(event.step);
            this.#lease.grow(event.step.proposal.proof.nodes.length, checkedHeaderBytes(event.step) +
              event.step.proposal.proof.nodes.length * 4096);
            this.#view = event.step.proposal.effects.length ? commitChecked(this.#view, event.step).view : retainCheckedFacts(this.#view, event.step);
            accepted = true; yield event;
          }
        }
        requireProof(accepted, "incomplete-conditional-prefix");
      }
      this.#record.ready = true;
    } finally { if (!this.#record.ready) this.dispose(); }
  }

  /** Checks and publishes one conditional transaction atomically under this lifetime. */
  *checkAndCommit(proposal: DeductionProposal): Generator<CheckEvent, void, void> {
    requireProof(this.active && this.#record.ready,"conditional-not-ready");
    const beforeWork=this.#work;
    for(const event of checkProposal(proposal,{view:this.#view,retained:retainedProof(this.#view),policy:"unique-only",
      uniqueEvidenceId:null,uniqueAuthority:this.authority,limits:{...this.#limits,
        workUnits:Math.max(0,this.#limits.workUnits-this.#work),timeMs:Math.max(0,Math.floor(this.#deadline-performance.now())),
        proofBytes:Math.max(0,this.#limits.proofBytes-this.#headers)}})) {
      if(event.kind==="work"){this.charge(event.units);yield event;}
      else if(event.kind==="rejected"){yield event;return;}
      else {
        this.charge(Math.max(0,beforeWork+checkedWorkUnits(event.step)-this.#work));
        requireProof(this.active,"revoked-unique-authority");
        const bytes=checkedHeaderBytes(event.step);
        this.#lease.grow(event.step.proposal.proof.nodes.length,bytes+event.step.proposal.proof.nodes.length*4096);
        this.#headers+=bytes;
        this.#view=event.step.proposal.effects.length?commitChecked(this.#view,event.step).view:retainCheckedFacts(this.#view,event.step);
        yield event;
      }
    }
  }

  /** Cancellation/replacement revoke immediately on main before transport catches up. */
  dispose(): void {
    if(!this.#record.active)return;
    this.#record.active = false; this.#record.ready = false;
    for(const teardown of this.#teardowns.splice(0))teardown();
    this.#lease.dispose();
  }
}
