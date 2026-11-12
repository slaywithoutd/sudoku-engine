import type { ReadView } from "../state/types";
import type { CheckedStep, CheckEvent, DeductionProposal } from "../proof/types";
import {
  checkProposal,
  checkUsage,
  checkWorkUnits,
  checkedHeaderBytes,
  checkedStepMatchesSource,
} from "../proof/checker";
import { assertOwnedView, acceptedStepChanges, retainedProof } from "../state/candidates";
import { prepareSources, matchingFacts, SourceIndex } from "../state/source-index";
import {
  IndexInterrupted,
  type IndexWorkspace,
  type WorkspaceReservation,
} from "../indexes/workspace";
import { TemplateOperationContext } from "../indexes/templates";
import type { UniqueAuthority } from "../conditional";
import type { Discovery, DiscoveryEvent, Ledger } from "../techniques/types";
import { defined } from "../invariants";
import { estimatorFor } from "./estimator";
import { SchedulingLedger, type TechniqueJobs, type ScheduledJob } from "./ledger";
import { FairPolicy } from "./policy";
import {
  WorkBudget,
  WorkLimit,
  QUANTUM,
  isRevision3,
  schedulingOptions,
  type SchedulingOptions,
  type WorkClock,
  type WorkHold,
} from "./work";
import { featureWork } from "./features";
import { rolloutCandidates } from "./rollout";

export interface SelectionOptions extends SchedulingOptions {
  readonly workspace: IndexWorkspace;
  readonly clock?: WorkClock;
  readonly budget?: WorkBudget;
  readonly templates?: TemplateOperationContext;
  readonly uniqueAuthority?: UniqueAuthority;
}
export type SelectionEvent =
  | { readonly kind: "work"; readonly units: number }
  | {
      readonly kind: "checked-step";
      readonly step: CheckedStep;
      readonly bundleId: number;
      readonly budgetLimited: boolean;
      /**
       * Every lower job of the run's registry is exhausted or excluded. Under a
       * restricted technique set (M2.7, D105) the registry holds the enabled
       * families only, so the claim is "nothing simpler among the selected
       * techniques"; a consumer that needs the catalogue-wide claim combines
       * it with the step's `setLimited` mark (S1 note §5.2).
       */
      readonly canClaimSimplerExhausted: boolean;
    }
  | {
      readonly kind: "logical-stop";
      readonly complete: boolean;
      readonly reason: string;
      readonly ledger: Ledger;
    };
interface Window {
  used: number;
  /** Units served to the original rules (tier -1) in this selection. */
  rules: number;
}
/** Job statuses that keep a quantum running. */
const ACTIVE: ReadonlySet<string> = new Set(["pending", "in-progress", "found"]);
/** Read after the quantum ran; the generator may have flipped the flag meanwhile. */
function proposedDuring(cursor: Cursor): boolean {
  return cursor.proposed === true;
}
interface Cursor {
  /** True once the current quantum yielded a proposal (decay bookkeeping). */
  proposed?: boolean;
  discovery?: Discovery;
  checking?: Generator<CheckEvent, void, void>;
  lease?: WorkspaceReservation;
  debt: number;
  checked?: CheckedStep;
  accountedCheckWork?: number;
}
interface Buffered {
  step: CheckedStep;
  lease: WorkspaceReservation;
}
/**
 * One operation owner. select() never commits. advance() admits only the actual
 * immediate accepted successor of its pending bundle, including proof-only steps.
 */
export class StepSelection {
  #view: ReadView;
  readonly ledger: SchedulingLedger;
  readonly options: SchedulingOptions;
  readonly #policy: FairPolicy;
  readonly #budget: WorkBudget;
  readonly #clock: WorkClock;
  readonly #deadline: number;
  readonly #cursors = new Map<ScheduledJob, Cursor>();
  readonly #buffers: Buffered[] = [];
  readonly #templates: TemplateOperationContext;
  #sources?: SourceIndex;
  /** The accepted parent's index, extended by the next #prepare (spec M2.6 §4.2). */
  #parentSources?: SourceIndex;
  #lease?: WorkspaceReservation;
  #pending?: CheckedStep;
  #bundle = 0;
  #active = false;
  #disposed = false;
  #headers = 0;
  constructor(
    view: ReadView,
    readonly registry: TechniqueJobs,
    readonly context: SelectionOptions,
  ) {
    assertOwnedView(view);
    this.#view = view;
    this.options = schedulingOptions(context);
    this.#budget = new WorkBudget(
      Math.min(
        this.options.phaseWorkUnits,
        context.budget?.remaining() ?? this.options.limits.workUnits,
      ),
    );
    this.#clock = context.clock ?? { now: () => performance.now() };
    this.#deadline = this.#clock.now() + this.options.phaseTimeMs;
    // Finite metadata allocation is charged/reserved before ledger construction.
    this.#charge(registry.rules.length + registry.techniques.length + 1);
    this.#templates = context.templates ?? new TemplateOperationContext(view);
    this.#templates.advance(view, (n) => this.#charge(n));
    this.#lease = context.workspace.reserve(
      registry.rules.length + registry.techniques.length,
      4096 + (registry.rules.length + registry.techniques.length) * 4096,
    );
    try {
      this.ledger = new SchedulingLedger(view, registry, estimatorFor(this.options.policy));
      this.#policy = new FairPolicy(
        this.options.policy,
        registry.techniques,
        this.options.mode,
        this.options.policyParameters,
      );
    } catch (error) {
      this.#lease.dispose();
      throw error;
    }
  }
  get view(): ReadView {
    return this.#view;
  }
  get usedWork(): number {
    return this.#budget.used;
  }
  /** Units charged and checkpoints passed since the clock was last read. */
  #sinceClock = { units: 0, calls: 0 };
  #checkpoint(): void {
    if (this.#disposed) throw Error("disposed-selection");
    this.context.workspace.checkpoint();
    // Time is a safety stop (spec M2.6 §4.2): read the clock once per quantum
    // of charged work, or every 64 checkpoints, not on every charge.
    const since = this.#sinceClock;
    if (since.units >= QUANTUM || since.calls++ >= 64 || since.calls === 1) {
      since.units = 0;
      since.calls = 1;
      if (this.#clock.now() >= this.#deadline) throw new WorkLimit("time-limit");
    }
  }
  #remaining(): number {
    return Math.min(this.#budget.remaining(), this.context.budget?.remaining() ?? Infinity);
  }
  #charge(units: number): void {
    this.#checkpoint();
    if (units > this.#remaining()) throw new WorkLimit();
    this.#sinceClock.units += units;
    this.#budget.charge(units);
    this.context.budget?.charge(units);
  }
  #reserveWork(maximum: number): WorkHold {
    this.#checkpoint();
    const local = this.#budget.reserve(maximum);
    let shared: WorkHold | undefined;
    try {
      shared = this.context.budget?.reserve(maximum);
    } catch (error) {
      local.dispose();
      throw error;
    }
    return {
      settle: (actual: number) => {
        local.settle(actual);
        shared?.settle(actual);
      },
      dispose: () => {
        local.dispose();
        shared?.dispose();
      },
    };
  }
  *#prepare(): Generator<SelectionEvent, void, void> {
    if (this.#sources) {
      this.#sources.assertActive();
      return;
    }
    const options = { reserveWork: (n: number) => this.#reserveWork(n) };
    const parent = this.#parentSources;
    this.#parentSources = undefined;
    const cursor = parent
      ? SourceIndex.advance(parent, this.#view, this.context.workspace, options)
      : prepareSources(this.#view, this.context.workspace, options);
    try {
      let next = cursor.next();
      while (!next.done) {
        if (!next.value.prepaid) this.#charge(next.value.units);
        yield next.value;
        next = cursor.next();
      }
      this.#sources = next.value;
    } finally {
      cursor.return(undefined as never);
    }
  }
  #closeCursor(cursor: Cursor): void {
    try {
      cursor.checking?.return();
    } finally {
      try {
        cursor.discovery?.return();
      } finally {
        cursor.lease?.dispose();
      }
    }
  }
  #clearCursors(): void {
    let failure: unknown;
    for (const cursor of this.#cursors.values())
      try {
        this.#closeCursor(cursor);
      } catch (error) {
        failure ??= error;
      }
    this.#cursors.clear();
    if (failure) throw failure;
  }
  #discardBuffers(except?: CheckedStep): void {
    for (let i = this.#buffers.length - 1; i >= 0; i--)
      if (this.#buffers[i].step !== except) {
        this.#buffers[i].lease.dispose();
        this.#buffers.splice(i, 1);
      }
  }
  #isCached(step: CheckedStep): boolean {
    return (
      step.proposal.effects.length === 0 &&
      step.consequences.every((consequence) =>
        matchingFacts(this.#view, consequence.conclusion).some(
          (fact) =>
            fact.openAssumptions.length === 0 && fact.conditional === consequence.conditional,
        ),
      )
    );
  }
  /** The cursor's debt before the last event #pump advanced. */
  #owedBeforeLast = 0;
  /** The cursor #pump is draining, and the room it drains into. */
  #draining?: Cursor;
  #drainRoom = 0;
  /**
   * Advances producer/checker events of one cursor while the quantum loop would
   * keep pumping it: its debt stays below `room`, nothing is checked and the
   * job stays active. Each event is charged as it is advanced, exactly as one
   * pump per loop iteration did; only the loop's bookkeeping is saved.
   */
  #pump(job: ScheduledJob, cursor: Cursor, room: number): void {
    // Set before anything here can throw: the caller pays it on a throw.
    this.#owedBeforeLast = cursor.debt;
    this.#checkpoint();
    defined(this.#sources, "source-index").assertActive();
    this.#draining = cursor;
    this.#drainRoom = room;
    try {
      do {
        this.#owedBeforeLast = cursor.debt;
        this.#pumpOne(job, cursor);
      } while (cursor.debt < room && !cursor.checked && ACTIVE.has(job.status));
    } finally {
      this.#draining = undefined;
    }
  }
  /** Advance exactly one bounded producer/checker event. Large work stays as debt. */
  #pumpOne(job: ScheduledJob, cursor: Cursor): void {
    if (cursor.checking) {
      this.#pumpChecker(job, cursor, cursor.checking);
      return;
    }
    if (!cursor.discovery) {
      const discovery = this.#startDiscovery(job);
      if (!discovery) return;
      cursor.discovery = discovery;
    }
    const next = cursor.discovery.next();
    if (next.done) {
      if (["pending", "in-progress", "found"].includes(job.status))
        this.ledger.status(job.key, "interrupted", "missing-discovery-terminal");
      return;
    }
    this.#consumeDiscoveryEvent(job, cursor, next.value);
  }
  /** One checker event, charged by its measured work; a finished or cached
   * result frees the lease. */
  #pumpChecker(
    job: ScheduledJob,
    cursor: Cursor,
    checking: Generator<CheckEvent, void, void>,
  ): void {
    const before = checkWorkUnits(checking),
      next = checking.next();
    const actual = checkWorkUnits(checking);
    const units = actual - before;
    this.#charge(units);
    cursor.accountedCheckWork = actual;
    cursor.debt += units;
    if (next.done) {
      this.#releaseChecker(cursor);
      return;
    }
    if (next.value.kind === "checked") {
      const scoring = featureWork(next.value.step);
      this.#charge(scoring);
      cursor.debt += scoring;
      if (this.#isCached(next.value.step)) this.#releaseChecker(cursor);
      else cursor.checked = next.value.step;
    } else if (next.value.kind === "rejected") {
      const code = next.value.code;
      this.#releaseChecker(cursor);
      // Checker resource failures are incomplete work, never unsound filters.
      if (/limit|cancel/.test(code)) {
        this.ledger.status(job.key, "interrupted", code);
        throw new WorkLimit(code);
      }
    }
  }
  #releaseChecker(cursor: Cursor): void {
    cursor.checking?.return();
    cursor.checking = undefined;
    cursor.lease?.dispose();
    cursor.lease = undefined;
  }
  /** Opens the job's discovery cursor, or records an exclusion and returns nothing. */
  #startDiscovery(job: ScheduledJob): Discovery | undefined {
    const eligible = job.descriptor?.eligible(this.#view);
    if (eligible?.kind === "excluded") {
      if (!eligible.reason || !eligible.dependencies.length)
        throw Error("unsound-exclusion-metadata");
      this.ledger.status(job.key, "excluded", eligible.reason, eligible.dependencies);
      return undefined;
    }
    const discovery = job.rule
      ? job.rule.discover(this.#view)
      : defined(job.descriptor, "job-descriptor").discover(this.#view, {
          workspace: this.context.workspace,
          limits: { ...this.options.limits, workUnits: this.#budget.remaining() },
          templates: this.#templates,
          uniqueAuthority: this.context.uniqueAuthority,
          ...(isRevision3(this.options.policy) ? { revision3: true } : {}),
        });
    this.ledger.status(job.key, "in-progress");
    return discovery;
  }
  #consumeDiscoveryEvent(job: ScheduledJob, cursor: Cursor, event: DiscoveryEvent): void {
    switch (event.kind) {
      case "work":
        if (!Number.isSafeInteger(event.units) || event.units <= 0)
          throw Error("invalid-discovery-work");
        this.#charge(event.units);
        cursor.debt += event.units;
        break;
      case "proposal":
        cursor.proposed = true;
        this.ledger.noteProposal(job.key);
        this.#startChecking(job, cursor, event.proposal);
        break;
      case "excluded":
        if (!event.reason || !event.dependencies.length) throw Error("unsound-exclusion-metadata");
        this.ledger.status(job.key, "excluded", event.reason, event.dependencies);
        this.#closeCursor(cursor);
        break;
      case "disabled":
        this.ledger.status(job.key, "disabled", event.reason);
        this.#closeCursor(cursor);
        break;
      case "interrupted":
        this.ledger.status(job.key, "interrupted", event.reason);
        this.#closeCursor(cursor);
        break;
      case "exhausted":
        this.ledger.status(job.key, "exhausted");
        this.#closeCursor(cursor);
        break;
    }
  }
  /** Producer stays paused throughout checking; reserve selected storage
   * before any return/advance. */
  #startChecking(job: ScheduledJob, cursor: Cursor, proposal: DeductionProposal): void {
    // The fixed part (retained index + frame) is held up front; checker copies
    // are reserved by the checker itself before each allocation (D102),
    // replacing the former fixed 3 x stepBytes worst case per open check.
    const lease = this.context.workspace.reserve(1, retainedProof(this.#view).size * 128 + 32768);
    cursor.lease = lease;
    let leased = 0;
    this.#charge(1);
    cursor.debt++;
    cursor.accountedCheckWork = 0;
    cursor.checking = checkProposal(proposal, {
      view: this.#view,
      retained: retainedProof(this.#view),
      policy: job.descriptor?.assumptionPolicy ?? "unconditional",
      uniqueEvidenceId: null,
      uniqueAuthority: this.context.uniqueAuthority,
      reserveBytes: (bytes) => {
        if (bytes <= leased) return;
        lease.grow(0, bytes - leased);
        leased = bytes;
      },
      remainingWork: () =>
        this.#remaining() -
        (checkWorkUnits(defined(cursor.checking, "checking")) - (cursor.accountedCheckWork ?? 0)),
      // Inside #pump this cursor's one-unit events are consumed back to back
      // until its debt reaches the room the quantum loop left.
      batchUnits: () => (this.#draining === cursor ? this.#drainRoom - cursor.debt : 0),
      limits: {
        ...this.options.limits,
        timeMs: Math.max(0, Math.floor(this.#deadline - this.#clock.now())),
        workUnits: this.#budget.remaining(),
        proofBytes: Math.max(0, this.options.limits.proofBytes - this.#headers),
      },
    });
  }
  *select(): Generator<SelectionEvent, void, void> {
    if (this.#pending) throw Error("awaiting-step-acceptance");
    if (this.#active) throw Error("selection-already-running");
    this.#checkpoint();
    this.#active = true;
    let completed = false;
    try {
      yield* this.#select();
      completed = true;
    } finally {
      this.#active = false;
      if (!completed) this.dispose();
    }
  }
  *#select(): Generator<SelectionEvent, void, void> {
    let returned = false,
      reason: string | undefined;
    try {
      this.#reopenDisabledJobs();
      yield* this.#prepare();
      reason = yield* this.#fillBuffers();
    } catch (error) {
      if (error instanceof WorkLimit || error instanceof IndexInterrupted) reason = error.reason;
      else throw error;
    }
    try {
      if (this.#buffers.length) {
        let selected = this.#policy.choose(this.#buffers.map((buffered) => buffered.step));
        if (this.options.rollout && !reason && selected.proposal.effects.length > 0)
          selected = yield* this.#rolloutWinner(selected);
        const event = this.#publish(selected, reason);
        returned = true;
        yield event;
      } else {
        this.#clearCursors();
        returned = true;
        const event: SelectionEvent = {
          kind: "logical-stop",
          complete: !reason && this.ledger.complete,
          reason: reason ?? (this.ledger.complete ? "profile-stall" : "incomplete-coverage"),
          ledger: this.ledger.rows,
        };
        if (reason) this.dispose();
        yield event;
      }
    } catch (error) {
      if (!(error instanceof WorkLimit) && !(error instanceof IndexInterrupted)) throw error;
      this.dispose();
      returned = true;
      yield {
        kind: "logical-stop",
        complete: false,
        reason: error.reason,
        ledger: this.ledger.rows,
      };
    } finally {
      if (!returned) this.dispose();
    }
  }
  #reopenDisabledJobs(): void {
    for (const job of this.ledger.jobs)
      if (job.status === "disabled") {
        const cursor = this.#cursors.get(job);
        if (cursor) this.#closeCursor(cursor);
        this.#cursors.delete(job);
        this.ledger.status(job.key, "pending");
      }
  }
  /** Services jobs in policy order until a step is buffered or the window closes.
   * Returns the reason the loop stopped early, if any. */
  *#fillBuffers(): Generator<SelectionEvent, string | undefined, void> {
    const window: Window = { used: 0, rules: 0 };
    for (;;) {
      const reason = yield* this.#fillFromActive(window);
      // explain-fair@3: when every job is settled and no step was found, the
      // jobs that stopped on a budget are reopened (spec M2.6 §4.4).
      if (reason !== undefined || this.#buffers.length || !this.#reopenSettled()) return reason;
    }
  }
  /** The per-state tier cap of this selection's policy, if any. */
  get #tierCap() {
    return this.options.tierCap;
  }
  /** Analyze selection window: 4096 units, or under @3 twice the rule pass (spec §4.4). */
  #windowLimit(window: Window): number {
    if (this.options.policy !== "analyze-fair@3") return 4096;
    // Under @3 the window only closes once a candidate is buffered: an empty
    // window would end Analyze before its first checked technique step.
    return this.#buffers.length ? Math.max(4096, 2 * window.rules) : Infinity;
  }
  /**
   * Restarts the jobs from `fromTier` up that were capped on this
   * state, from scratch and with twice their previous cap (iterative deepening:
   * a capped cursor was closed to free its workspace, so a retry must reach
   * further). Returns whether any job was reopened.
   */
  #reopenSettled(): boolean {
    const cap = this.#tierCap;
    if (!cap) return false;
    // Capped jobs only: an interruption (a workspace or proof-size limit)
    // recurs identically on the same state, while a reopened capped job must
    // spend its whole doubled cap before it caps again, so every round
    // consumes budget and the loop ends.
    const reopened = this.ledger.jobs.filter(
      (job) => job.tier >= cap.fromTier && job.status === "capped",
    );
    for (const job of reopened) {
      const cursor = this.#cursors.get(job);
      if (cursor) this.#closeCursor(cursor);
      this.#cursors.delete(job);
      job.stateWork = 0;
      job.capRounds += 1;
      // Its ledger row keeps the tier-work-cap reason while capRounds > 0.
      this.ledger.status(job.key, "pending");
    }
    return reopened.length > 0;
  }
  *#fillFromActive(window: Window): Generator<SelectionEvent, string | undefined, void> {
    while (this.ledger.active.length) {
      const key = this.#policy.next(this.ledger, this.#view),
        job = this.ledger.job(key);
      // An interrupted rule/cheaper tier cannot authorize later Explain claims.
      // Under explain-fair@3 a capped lower job counts as settled.
      if (
        !(this.#tierCap
          ? this.ledger.simplerSettled(job.tier, this.#tierCap.fromTier)
          : this.ledger.simplerExhausted(job.tier)) &&
        (this.options.mode === "explain" ||
          (job.tier >= 0 &&
            this.ledger.jobs.some((j) => j.tier === -1 && j.status === "interrupted")))
      )
        return "incomplete-cheaper-tier";
      this.ledger.service(key);
      const cursor = this.#cursors.get(job) ?? { debt: 0 };
      this.#cursors.set(job, cursor);
      cursor.proposed = false;
      yield* this.#serviceQuantum(job, cursor, window);
      if (job.status === "capped") {
        // A capped cursor would keep its workspace while later tiers need it.
        this.#closeCursor(cursor);
        this.#cursors.delete(job);
      }
      if (!proposedDuring(cursor)) this.ledger.noteEmptyQuantum(key);
      // A checker result paid at the last unit belongs to this quantum.
      if (cursor.checked && !cursor.debt) this.#bufferChecked(cursor);
      if (
        this.#buffers.length &&
        (job.tier === -1 ||
          this.options.mode === "explain" ||
          this.#buffers.length >= 4 ||
          window.used >= this.#windowLimit(window))
      )
        return undefined;
      if (this.options.mode === "analyze" && window.used >= this.#windowLimit(window))
        return "selection-window";
    }
    return undefined;
  }
  /** One quantum of one job: pay debt as work events, buffer checked steps, else pump. */
  *#serviceQuantum(
    job: ScheduledJob,
    cursor: Cursor,
    window: Window,
  ): Generator<SelectionEvent, void, void> {
    const analyze = this.options.mode === "analyze";
    const cap =
      this.#tierCap && job.tier >= this.#tierCap.fromTier
        ? this.#tierCap.unitsPerJobPerState * 2 ** Math.min(job.capRounds, 20)
        : Infinity;
    let quantum = 0;
    const active = () => ACTIVE.has(job.status);
    // The window limit is read live: under analyze-fair@3 it grows with the rule pass.
    const room = () =>
      Math.min(QUANTUM - quantum, analyze ? this.#windowLimit(window) - window.used : Infinity);
    // Debt is paid in one work event once it fills the quantum's room, before a
    // checked step is buffered, and before a pump that ends the job or throws:
    // the same units, quanta and job work as paying after every pump, with
    // far fewer events (spec M2.6 §4.2). As before, a pump that ends the job
    // leaves its own units unpaid.
    const pay = function* (this: StepSelection, units: number, checkpoint = true) {
      // On a throw the debt is paid without a checkpoint, so the original error stays.
      if (checkpoint) this.#checkpoint();
      cursor.debt -= units;
      quantum += units;
      window.used += units;
      if (job.tier === -1) window.rules += units;
      job.work += units;
      job.stateWork += units;
      yield { kind: "work" as const, units };
      // explain-fair@3: the job spent its cap on this state without a step
      // (one with a checked step waiting for its debt is left to finish).
      if (job.stateWork >= cap && active() && !cursor.checked)
        this.ledger.status(job.key, "capped", "tier-work-cap");
    }.bind(this);
    while (
      quantum < QUANTUM &&
      active() &&
      !(analyze && window.used >= this.#windowLimit(window))
    ) {
      if (cursor.debt && (cursor.debt >= room() || cursor.checked)) {
        yield* pay(Math.min(cursor.debt, room()));
        continue;
      }
      if (cursor.checked) {
        this.#bufferChecked(cursor);
        if (this.options.mode === "explain" && this.#buffers.length > 1)
          this.#discardBuffers(this.#policy.choose(this.#buffers.map((buffered) => buffered.step)));
        if (analyze && this.#buffers.length === 4) break;
        continue;
      }
      try {
        this.#pump(job, cursor, room());
      } catch (error) {
        if (this.#owedBeforeLast) yield* pay(this.#owedBeforeLast, false);
        throw error;
      }
      if (this.#owedBeforeLast && !active()) yield* pay(this.#owedBeforeLast);
    }
  }
  /** Moves the cursor's checked step and its lease into the buffer. */
  #bufferChecked(cursor: Cursor): void {
    this.#buffers.push({
      step: defined(cursor.checked, "checked-step"),
      lease: defined(cursor.lease, "cursor-lease"),
    });
    cursor.checked = undefined;
    cursor.lease = undefined;
    cursor.checking?.return();
    cursor.checking = undefined;
  }
  /** Lets rollout pick among effectful buffered steps, then rechecks the winner
   * against the actual current source. */
  *#rolloutWinner(first: CheckedStep): Generator<SelectionEvent, CheckedStep, void> {
    let selected = first;
    const candidates = [
      selected,
      ...this.#buffers
        .filter((buffered) => buffered.step !== selected)
        .map((buffered) => buffered.step),
    ].filter((step) => step.proposal.effects.length > 0);
    const rollout = rolloutCandidates(this.#view, candidates, {
      workspace: this.context.workspace,
      limits: this.options.limits,
      budget: {
        remaining: () => this.#budget.remaining(),
        spend: (units) => {
          this.#charge(units);
          return true;
        },
        reserve: (units) => this.#reserveWork(units),
      },
    });
    try {
      for (const event of rollout) {
        if (event.kind === "work") yield event;
        else selected = event.selected;
      }
    } finally {
      rollout.return();
    }
    const checked = yield* this.#recheck(selected);
    const buffer = defined(
      this.#buffers.find((buffered) => buffered.step === selected),
      "selected-buffer",
    );
    buffer.step = checked;
    return checked;
  }
  /** Recheck only the winning first deduction against the actual current source. */
  *#recheck(selected: CheckedStep): Generator<SelectionEvent, CheckedStep, void> {
    const recheck = checkProposal(selected.proposal, {
      view: this.#view,
      retained: retainedProof(this.#view),
      policy: "discharged",
      uniqueEvidenceId: null,
      limits: {
        ...this.options.limits,
        workUnits: this.#budget.remaining(),
        timeMs: Math.max(0, Math.floor(this.#deadline - this.#clock.now())),
      },
    });
    let checked: CheckedStep | undefined;
    let checkedWork = 0;
    try {
      for (let next = recheck.next(); !next.done;) {
        const used = checkUsage(recheck).workUnits;
        this.#charge(used - checkedWork);
        checkedWork = used;
        if (next.value.kind === "work") yield next.value;
        else if (next.value.kind === "checked") checked = next.value.step;
        else throw new WorkLimit(next.value.code);
        next = recheck.next();
      }
    } finally {
      recheck.return();
    }
    if (!checked) throw Error("rollout-recheck-missing");
    return checked;
  }
  /** Marks the step pending and builds its checked-step event. */
  #publish(selected: CheckedStep, reason: string | undefined): SelectionEvent {
    if (!checkedStepMatchesSource(selected, this.#view)) throw Error("stale-buffered-step");
    // Prepay immediate lineage, bounded cell changes and ledger invalidation
    // before publication so accepted synchronization needs no new credit.
    this.#charge(
      1 +
        this.#view.assembly.problem.cells.length *
          (this.#view.assembly.problem.symbols.length + 1) +
        this.ledger.jobs.reduce((n, j) => n + 2 + j.dependencies.length, 0),
    );
    this.#pending = selected;
    this.#discardBuffers(selected);
    const tier =
      this.registry.techniques.find((descriptor) => descriptor.id === selected.proposal.technique)
        ?.tier ?? -1;
    return {
      kind: "checked-step",
      step: selected,
      bundleId: ++this.#bundle,
      // A capped simpler job means a simpler step may exist (explain-fair@3).
      budgetLimited:
        !!reason ||
        this.ledger.jobs.some(
          (j) => j.status === "interrupted" || (j.status === "capped" && j.tier < tier),
          // (an interrupted job always marked the step, at any tier)
        ),
      canClaimSimplerExhausted: this.ledger.simplerExhausted(tier),
    };
  }
  advance(next: ReadView): void {
    if (this.#disposed) throw Error("disposed-selection");
    if (this.#active) throw Error("selection-not-drained");
    if (!this.#pending) throw Error("no-pending-step");
    const changes = acceptedStepChanges(this.#view, next, this.#pending);
    this.#templates.advance(next, () => {});
    this.#headers += checkedHeaderBytes(this.#pending);
    this.#clearCursors();
    this.#parentSources?.dispose();
    this.#parentSources = this.#sources;
    this.#sources = undefined;
    this.#discardBuffers();
    this.ledger.advance(next, changes, this.options.policy === "fixed-scan@1");
    this.#view = next;
    this.#pending = undefined;
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    try {
      this.#clearCursors();
    } finally {
      this.#discardBuffers();
      this.#sources?.dispose();
      this.#sources = undefined;
      this.#parentSources?.dispose();
      this.#parentSources = undefined;
      this.#lease?.dispose();
      this.#lease = undefined;
    }
  }
}
/** One-shot convenience. Stateful workers keep StepSelection until acceptance. */
export function* selectStep(
  view: ReadView,
  registry: TechniqueJobs,
  options: SelectionOptions,
): Generator<SelectionEvent, void, void> {
  const selection = new StepSelection(view, registry, options);
  try {
    yield* selection.select();
  } finally {
    selection.dispose();
  }
}
