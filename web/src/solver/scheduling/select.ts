import type { ReadView } from "../state/types";
import type { CheckedStep, CheckEvent } from "../proof/types";
import {
  checkProposal,
  checkUsage,
  checkedHeaderBytes,
  checkedStepMatchesSource,
} from "../proof/checker";
import { assertOwnedView, acceptedStepChanges, retainedProof } from "../state/candidates";
import { prepareSources, matchingFacts, type SourceIndex } from "../state/source-index";
import {
  IndexInterrupted,
  type IndexWorkspace,
  type WorkspaceReservation,
} from "../indexes/workspace";
import { TemplateOperationContext } from "../indexes/templates";
import type { UniqueAuthority } from "../conditional";
import type { Discovery, Ledger } from "../techniques/types";
import { SchedulingLedger, type TechniqueJobs, type ScheduledJob } from "./ledger";
import { FairPolicy } from "./policy";
import {
  WorkBudget,
  WorkLimit,
  QUANTUM,
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
      readonly canClaimSimplerExhausted: boolean;
    }
  | {
      readonly kind: "logical-stop";
      readonly complete: boolean;
      readonly reason: string;
      readonly ledger: Ledger;
    };
interface Cursor {
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
      this.ledger = new SchedulingLedger(view, registry);
      this.#policy = new FairPolicy(this.options.policy, registry.techniques, this.options.mode);
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
  #checkpoint(): void {
    if (this.#disposed) throw Error("disposed-selection");
    this.context.workspace.checkpoint();
    if (this.#clock.now() >= this.#deadline) throw new WorkLimit("time-limit");
  }
  #remaining(): number {
    return Math.min(this.#budget.remaining(), this.context.budget?.remaining() ?? Infinity);
  }
  #charge(units: number): void {
    this.#checkpoint();
    if (units > this.#remaining()) throw new WorkLimit();
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
    const cursor = prepareSources(this.#view, this.context.workspace, {
      reserveWork: (n) => this.#reserveWork(n),
    });
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
      step.consequences.every((c) =>
        matchingFacts(this.#view, c.conclusion).some(
          (f) => f.openAssumptions.length === 0 && f.conditional === c.conditional,
        ),
      )
    );
  }
  /** Advance exactly one bounded producer/checker event. Large work stays as debt. */
  #pump(job: ScheduledJob, cursor: Cursor): void {
    this.#checkpoint();
    this.#sources!.assertActive();
    if (cursor.checking) {
      const before = checkUsage(cursor.checking).workUnits,
        next = cursor.checking.next();
      const actual = checkUsage(cursor.checking).workUnits;
      const units = actual - before;
      this.#charge(units);
      cursor.accountedCheckWork = actual;
      cursor.debt += units;
      if (next.done) {
        cursor.checking = undefined;
        cursor.lease?.dispose();
        cursor.lease = undefined;
        return;
      }
      if (next.value.kind === "checked") {
        const scoring = featureWork(next.value.step);
        this.#charge(scoring);
        cursor.debt += scoring;
        if (this.#isCached(next.value.step)) {
          cursor.checking.return();
          cursor.checking = undefined;
          cursor.lease?.dispose();
          cursor.lease = undefined;
        } else cursor.checked = next.value.step;
      } else if (next.value.kind === "rejected") {
        const code = next.value.code;
        cursor.checking.return();
        cursor.checking = undefined;
        cursor.lease?.dispose();
        cursor.lease = undefined;
        // Checker resource failures are incomplete work, never unsound filters.
        if (/limit|cancel/.test(code)) {
          this.ledger.status(job.key, "interrupted", code);
          throw new WorkLimit(code);
        }
      }
      return;
    }
    if (!cursor.discovery) {
      const eligible = job.descriptor?.eligible(this.#view);
      if (eligible?.kind === "excluded") {
        if (!eligible.reason || !eligible.dependencies.length)
          throw Error("unsound-exclusion-metadata");
        this.ledger.status(job.key, "excluded", eligible.reason, eligible.dependencies);
        return;
      }
      cursor.discovery = job.rule
        ? job.rule.discover(this.#view)
        : job.descriptor!.discover(this.#view, {
            workspace: this.context.workspace,
            limits: { ...this.options.limits, workUnits: this.#budget.remaining() },
            templates: this.#templates,
            uniqueAuthority: this.context.uniqueAuthority,
          });
      this.ledger.status(job.key, "in-progress");
    }
    const next = cursor.discovery.next();
    if (next.done) {
      if (["pending", "in-progress", "found"].includes(job.status))
        this.ledger.status(job.key, "interrupted", "missing-discovery-terminal");
      return;
    }
    const event = next.value;
    switch (event.kind) {
      case "work":
        if (!Number.isSafeInteger(event.units) || event.units <= 0)
          throw Error("invalid-discovery-work");
        this.#charge(event.units);
        cursor.debt += event.units;
        break;
      case "proposal": {
        // Producer stays paused throughout checking; reserve selected storage before any return/advance.
        cursor.lease = this.context.workspace.reserve(
          1,
          this.options.limits.stepBytes * 3 + retainedProof(this.#view).size * 128 + 32768,
        );
        this.#charge(1);
        cursor.debt++;
        cursor.accountedCheckWork = 0;
        cursor.checking = checkProposal(event.proposal, {
          view: this.#view,
          retained: retainedProof(this.#view),
          policy: job.descriptor?.assumptionPolicy ?? "unconditional",
          uniqueEvidenceId: null,
          uniqueAuthority: this.context.uniqueAuthority,
          remainingWork: () =>
            this.#remaining() -
            (checkUsage(cursor.checking!).workUnits - (cursor.accountedCheckWork ?? 0)),
          limits: {
            ...this.options.limits,
            timeMs: Math.max(0, Math.floor(this.#deadline - this.#clock.now())),
            workUnits: this.#budget.remaining(),
            proofBytes: Math.max(0, this.options.limits.proofBytes - this.#headers),
          },
        });
        break;
      }
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
      for (const job of this.ledger.jobs)
        if (job.status === "disabled") {
          const cursor = this.#cursors.get(job);
          if (cursor) this.#closeCursor(cursor);
          this.#cursors.delete(job);
          this.ledger.status(job.key, "pending");
        }
      yield* this.#prepare();
      let window = 0;
      while (this.ledger.active.length) {
        const key = this.#policy.next(this.ledger, this.#view),
          job = this.ledger.job(key);
        // An interrupted rule/cheaper tier cannot authorize later Explain claims.
        if (
          !this.ledger.simplerExhausted(job.tier) &&
          (this.options.mode === "explain" ||
            (job.tier >= 0 &&
              this.ledger.jobs.some((j) => j.tier === -1 && j.status === "interrupted")))
        ) {
          reason = "incomplete-cheaper-tier";
          break;
        }
        this.ledger.service(key);
        let quantum = 0;
        const cursor = this.#cursors.get(job) ?? { debt: 0 };
        this.#cursors.set(job, cursor);
        while (
          quantum < QUANTUM &&
          ["pending", "in-progress", "found"].includes(job.status) &&
          !(this.options.mode === "analyze" && window >= 4096)
        ) {
          if (cursor.debt) {
            this.#checkpoint();
            const units = Math.min(
              cursor.debt,
              QUANTUM - quantum,
              this.options.mode === "analyze" ? 4096 - window : Infinity,
            );
            cursor.debt -= units;
            quantum += units;
            window += units;
            job.work += units;
            yield { kind: "work", units };
          } else if (cursor.checked) {
            this.#buffers.push({ step: cursor.checked, lease: cursor.lease! });
            cursor.checked = undefined;
            cursor.lease = undefined;
            cursor.checking?.return();
            cursor.checking = undefined;
            if (this.options.mode === "explain" && this.#buffers.length > 1)
              this.#discardBuffers(this.#policy.choose(this.#buffers.map((b) => b.step)));
            if (this.options.mode === "analyze" && this.#buffers.length === 4) break;
          } else this.#pump(job, cursor);
        }
        // A checker result paid at the last unit belongs to this quantum.
        if (cursor.checked && !cursor.debt) {
          this.#buffers.push({ step: cursor.checked, lease: cursor.lease! });
          cursor.checked = undefined;
          cursor.lease = undefined;
          cursor.checking?.return();
          cursor.checking = undefined;
        }
        if (
          this.#buffers.length &&
          (job.tier === -1 ||
            this.options.mode === "explain" ||
            this.#buffers.length >= 4 ||
            window >= 4096)
        )
          break;
        if (this.options.mode === "analyze" && window >= 4096) {
          reason = "selection-window";
          break;
        }
      }
    } catch (error) {
      if (error instanceof WorkLimit || error instanceof IndexInterrupted) reason = error.reason;
      else throw error;
    }
    try {
      if (this.#buffers.length) {
        let selected = this.#policy.choose(this.#buffers.map((b) => b.step));
        if (this.options.rollout && !reason && selected.proposal.effects.length > 0) {
          const rolloutCandidatesList = [
            selected,
            ...this.#buffers.filter((b) => b.step !== selected).map((b) => b.step),
          ].filter((step) => step.proposal.effects.length > 0);
          const rollout = rolloutCandidates(this.#view, rolloutCandidatesList, {
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
          // Recheck only the winning first deduction against the actual current source.
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
          const buffer = this.#buffers.find((b) => b.step === selected)!;
          buffer.step = checked;
          selected = checked;
        }
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
        returned = true;
        yield {
          kind: "checked-step",
          step: selected,
          bundleId: ++this.#bundle,
          budgetLimited: !!reason || this.ledger.jobs.some((j) => j.status === "interrupted"),
          canClaimSimplerExhausted: this.ledger.simplerExhausted(
            this.registry.techniques.find((d) => d.id === selected.proposal.technique)?.tier ?? -1,
          ),
        };
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
  advance(next: ReadView): void {
    if (this.#disposed) throw Error("disposed-selection");
    if (this.#active) throw Error("selection-not-drained");
    if (!this.#pending) throw Error("no-pending-step");
    const changes = acceptedStepChanges(this.#view, next, this.#pending);
    this.#templates.advance(next, () => {});
    this.#headers += checkedHeaderBytes(this.#pending);
    this.#clearCursors();
    this.#sources?.dispose();
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
