import type { ReadView, Literal } from "../state/types";
import type { BranchCertificate, ProofNode, DeductionProposal } from "../proof/types";
import type { Discovery, DiscoveryContext } from "./types";
import {
  HypotheticalSession,
  retainedProof,
  branchScope,
  assertOwnedView,
} from "../state/candidates";
import { IndexInterrupted, type WorkspaceReservation } from "../indexes/workspace";
import { buildImplications, type ImplicationIndex } from "../indexes/implications";
import { ForcingGraph, forcingDescriptor } from "./forcing-runtime";
import { forcingProofFits, ForcingProof, opposite, signedKey, symbols } from "./forcing-proof";
import { NakedSingles, HiddenSingles } from "./singles";
import { LockedCandidates } from "./intersections";
import { Subsets, LockedSubsets } from "./subsets";
import { proposedClause } from "../proof/builder";
import { checkNetPattern } from "./nets-grammar";
import type { NetBranchCertificate } from "./nets";
import { findHouse, symbolMask } from "../state/read";
type Work = { kind: "work"; units: number };
class NetInterrupted extends Error {
  constructor(readonly reason: "time-limit" | "work-limit" | "proof-step-limit") {
    super(reason);
  }
}
function localFailure(code: string): never {
  if (code === "proof-time-limit") throw new NetInterrupted("time-limit");
  if (code === "proof-work-limit") throw new NetInterrupted("work-limit");
  if (code.startsWith("proof-") && code.endsWith("limit"))
    throw new NetInterrupted("proof-step-limit");
  throw Error("net-local-rejected:" + code);
}
const basics = [
  new NakedSingles(),
  new HiddenSingles(),
  new LockedCandidates(),
  new Subsets(),
  new LockedSubsets(),
];

/**
 * Identity-based import compilation: sibling numeric IDs may collide, but node
 * objects cannot. Allowed local rules have no node IDs in parameters; reject
 * nonempty parameters instead of applying an unsafe generic numeric rewrite.
 */
class BranchDAG {
  readonly proof: ForcingProof;
  readonly ids = new Map<ProofNode, number>();
  constructor(
    readonly parent: ReadView,
    lease: WorkspaceReservation,
  ) {
    lease.grow(parent.facts.size, parent.facts.size * 128);
    this.proof = new ForcingProof(parent, lease);
    for (const [id, node] of retainedProof(parent)) this.ids.set(node, id);
  }
  append(view: ReadView, certificate: BranchCertificate): Map<number, number> {
    const source = new Map(retainedProof(view)),
      mapped = new Map<number, number>();
    const id = (n: number) => {
      const node = source.get(n),
        value = node && this.ids.get(node);
      if (value === undefined) throw Error("unmapped-branch-node");
      return value;
    };
    for (const node of certificate.proposal.proof.nodes) {
      if (node.rule === "table-join-filter@1" || node.rule === "cover-count-clause@1")
        throw Error("branch-primitive-out-of-profile");
      if (Object.keys(node.parameters as object).length)
        throw Error("branch-parameter-out-of-profile");
      this.proof.scope = node.scope.map(id);
      const fresh = this.proof.add(
        node.rule,
        node.premises.map(id),
        node.conclusion,
        node.parameters,
      );
      this.ids.set(node, fresh);
      source.set(node.id, node);
      mapped.set(node.id, fresh);
    }
    return mapped;
  }
  node(view: ReadView, id: number): number {
    const node = retainedProof(view).get(id),
      result = node && this.ids.get(node);
    if (result === undefined) throw Error("unmapped-branch-node");
    return result;
  }
}

/** A bounded local propagation strategy; it never invokes the human scheduler. */
class NetSearch {
  readonly dag: BranchDAG;
  constructor(
    readonly parent: ReadView,
    readonly context: DiscoveryContext,
    readonly mode: "static" | "dynamic" | "nested",
    lease: WorkspaceReservation,
  ) {
    this.dag = new BranchDAG(parent, lease);
  }
  *graphContradiction(
    session: HypotheticalSession,
    assumption: number,
    original: Literal,
  ): Generator<Work, number | undefined> {
    let index: ImplicationIndex | undefined, lease: WorkspaceReservation | undefined;
    try {
      lease = this.context.workspace.reserve(1, 4000000);
      const view = session.view,
        graph = new ForcingGraph(view, this.context, lease);
      for (const event of buildImplications(view, this.context.workspace)) {
        if (event.kind === "ready") index = event.value;
        else if (event.kind === "interrupted") throw new IndexInterrupted(event.reason);
        else yield event;
      }
      yield* graph.prepare(index!);
      // Previously proved links remain valid. Keep their exact parent-domain
      // sources alongside newly rebuilt links; never silently retarget a cover.
      let originalIndex: ImplicationIndex | undefined;
      try {
        for (const event of buildImplications(this.parent, this.context.workspace)) {
          if (event.kind === "ready") originalIndex = event.value;
          else if (event.kind === "interrupted") throw new IndexInterrupted(event.reason);
          else yield event;
        }
        const originalGraph = new ForcingGraph(this.parent, this.context, lease);
        yield* originalGraph.prepare(originalIndex!);
        for (const [key, arcs] of originalGraph.arcs)
          for (const arc of arcs) {
            yield { kind: "work", units: 1 };
            const list = graph.arcs.get(key) ?? [];
            list.push({ ...arc, reason: { ...arc.reason, origin: "parent" } });
            graph.arcs.set(key, list);
          }
      } finally {
        originalIndex?.dispose();
      }
      const paths = yield* graph.paths(original, false, (link) => {
          if (link.reason.origin === "parent") return false;
          if (link.reason.kind === "cell-cover")
            return (
              view.state.domains[link.reason.cell!] !== this.parent.state.domains[link.reason.cell!]
            );
          if (link.reason.kind !== "house-cover") return false;
          const house = findHouse(view, link.reason.house)!,
            bit = symbolMask(link.reason.symbol!);
          return house.cells.some(
            (c) => (view.state.domains[c] & bit) !== (this.parent.state.domains[c] & bit),
          );
        }),
        path = paths.get(signedKey(opposite(original)));
      if (!path?.length) return;
      const builder = new ForcingProof(view);
      builder.scope = branchScope(view);
      const proof = builder.path(assumption, path, this.parent),
        falseRoot = builder.add("contradiction@1", [assumption, proof.end], { kind: "false" });
      const proposal = builder.bundle("branch-graph@1", {}, [], [falseRoot]);
      for (const event of session.check(proposal, this.context.limits)) {
        if (event.kind === "work") yield event;
        else if (event.kind === "branch-checked")
          return this.dag.append(view, event.certificate).get(falseRoot)!;
        else localFailure(event.code);
      }
    } finally {
      index?.dispose();
      lease?.dispose();
    }
  }
  *dynamicConvergence(
    view: ReadView,
    certificate: BranchCertificate,
    map: Map<number, number>,
  ): Generator<Work, number | undefined> {
    let index: ImplicationIndex | undefined;
    try {
      for (const event of buildImplications(view, this.context.workspace)) {
        if (event.kind === "ready") index = event.value;
        else if (event.kind === "interrupted") throw new IndexInterrupted(event.reason);
        else yield event;
      }
      const negatives = certificate.proposal.proof.roots
        .map((id) => certificate.proposal.proof.nodes.find((n) => n.id === id))
        .filter((n) => n?.conclusion.kind === "literal" && !n.conclusion.value.positive);
      for (const edge of index!.edges) {
        yield { kind: "work", units: 1 };
        if (edge.kind !== "strong" || edge.recipe.kind !== "cell-cover") continue;
        const [left, right] = edge.literals,
          cell = left.cell;
        if (this.parent.state.domains[cell] === view.state.domains[cell]) continue;
        const find = (value: Literal) =>
          negatives.find(
            (n) =>
              n!.conclusion.kind === "literal" &&
              n!.conclusion.value.cell === value.cell &&
              n!.conclusion.value.symbol === value.symbol,
          );
        const a = find(left),
          z = find(right);
        if (!a || !z) continue;
        const b = this.dag.proof;
        b.scope = branchScope(view).map((id) => this.dag.node(view, id));
        const cover = b.add(
          "cover-clause@1",
          [this.dag.node(view, view.state.domainFacts[cell])],
          proposedClause([left, right]),
        );
        const positive = b.add("resolution@1", [map.get(a.id)!, cover], proposedClause([right]));
        return b.add("contradiction@1", [positive, map.get(z.id)!], { kind: "false" });
      }
    } finally {
      index?.dispose();
    }
  }
  *branch(
    parent: ReadView,
    value: Literal,
    depth: number,
  ): Generator<Work, NetBranchCertificate | undefined> {
    const session = new HypotheticalSession(parent, "net", this.context.workspace),
      b = this.dag.proof;
    let assumption = -1,
      localAssumption = -1;
    try {
      const before = session.view;
      for (const e of session.assume(value, this.context.limits)) {
        if (e.kind === "work") yield e;
        else if (e.kind === "branch-checked") {
          localAssumption = e.certificate.proposal.proof.nodes[0].id;
          assumption = this.dag.append(before, e.certificate).get(localAssumption)!;
        } else localFailure(e.code);
      }
      for (let round = 0; round < 810; round++) {
        let selected: DeductionProposal | undefined;
        for (const detector of basics) {
          const cursor = detector.discover(session.view);
          try {
            for (const e of cursor) {
              if (e.kind === "work") yield e;
              else if (e.kind === "proposal") {
                selected = e.proposal;
                break;
              }
            }
          } finally {
            cursor.return();
          }
          if (selected) break;
        }
        if (!selected) break;
        const before = session.view;
        let checked: BranchCertificate | undefined;
        for (const e of session.check(selected, this.context.limits)) {
          if (e.kind === "work") yield e;
          else if (e.kind === "branch-checked") checked = e.certificate;
          else localFailure(e.code);
        }
        if (!checked) return;
        const map = this.dag.append(before, checked);
        const empty = checked.proposal.proof.roots.find((id) => {
          const p = checked!.proposal.proof.nodes.find((n) => n.id === id)?.conclusion;
          return p?.kind === "domain" && p.mask === 0;
        });
        if (empty !== undefined) {
          if (this.mode === "dynamic") {
            const result = yield* this.dynamicConvergence(before, checked, map);
            if (result !== undefined) return { assumption, result, cover: null, children: [] };
          }
          b.scope = branchScope(before).map((id) => this.dag.node(before, id));
          const result = b.add("contradiction@1", [map.get(empty)!], { kind: "false" });
          return { assumption, result, cover: null, children: [] };
        }
        session.publish(checked);
        if (this.mode === "dynamic") {
          const result = yield* this.graphContradiction(session, localAssumption, value);
          if (result !== undefined) return { assumption, result, cover: null, children: [] };
        }
      }
      if (this.mode !== "nested" || depth === 2) return;
      const view = session.view;
      for (const cell of view.assembly.problem.cells)
        if (!view.state.values[cell]) {
          const digits = symbols(view, cell);
          if (digits.length < 2 || digits.length > 9) continue;
          b.scope = branchScope(view).map((id) => this.dag.node(view, id));
          const cover = b.add(
            "cover-clause@1",
            [this.dag.node(view, view.state.domainFacts[cell])],
            proposedClause(digits.map((symbol) => ({ cell, symbol, positive: true }))),
          );
          const children: NetBranchCertificate[] = [];
          for (const symbol of digits) {
            const child = yield* this.branch(view, { cell, symbol, positive: true }, 2);
            if (!child) break;
            children.push(child);
          }
          if (children.length !== digits.length) continue;
          b.scope = branchScope(view).map((id) => this.dag.node(view, id));
          const result = b.add(
            "cases@1",
            [cover, ...children.flatMap((c) => [c.assumption, c.result])],
            { kind: "false" },
          );
          return { assumption, result, cover, children };
        }
    } finally {
      session.dispose();
    }
  }
  *candidate(value: Literal): Generator<Work, DeductionProposal | undefined> {
    const branch = yield* this.branch(this.parent, value, 1);
    if (!branch) return;
    const b = this.dag.proof;
    b.scope = [];
    const root = b.add(
      "discharge@1",
      [branch.assumption, branch.result],
      proposedClause([opposite(value)]),
    );
    const proposal = b.finish(
      "c23@1",
      {
        kind: "net",
        mode: this.mode,
        alias:
          this.mode === "nested"
            ? "Nested forcing"
            : this.mode === "dynamic"
              ? "Dynamic forcing nets"
              : "Static forcing nets",
        branch,
        root,
      },
      { kind: "remove", cell: value.cell, symbol: value.symbol },
      root,
    );
    // Bounds and named convergence are admission requirements, not deductions.
    try {
      checkNetPattern(
        proposal,
        this.parent,
        new Map([
          ...retainedProof(this.parent),
          ...proposal.proof.nodes.map((n) => [n.id, n] as const),
        ]),
      );
    } catch {
      return;
    }
    return proposal;
  }
}

export function* discoverNets(view: ReadView, context: DiscoveryContext): Discovery {
  assertOwnedView(view);
  const deadline = performance.now() + context.limits.timeMs;
  let work = 0;
  const cursors: Generator<Work, DeductionProposal | undefined>[] = [];
  let lease: WorkspaceReservation | undefined;
  try {
    lease = context.workspace.reserve(1, 65536);
    const family = function* (
      mode: "static" | "dynamic" | "nested",
    ): Generator<Work | { kind: "proposal"; proposal: DeductionProposal }> {
      for (const cell of view.assembly.problem.cells)
        if (!view.state.values[cell])
          for (const symbol of symbols(view, cell)) {
            const candidateLease = context.workspace.reserve(1, 65536);
            let cursor: Generator<Work, DeductionProposal | undefined> | undefined;
            try {
              cursor = new NetSearch(view, context, mode, candidateLease).candidate({
                cell,
                symbol,
                positive: true,
              });
              cursors.push(cursor);
              const proposal = yield* cursor;
              if (proposal) yield { kind: "proposal", proposal };
            } finally {
              if (cursor) {
                cursor.return(undefined);
                cursors.splice(cursors.indexOf(cursor), 1);
              }
              candidateLease.dispose();
            }
          }
    };
    const modes = [family("static"), family("dynamic"), family("nested")];
    try {
      while (modes.length)
        for (let i = 0; i < modes.length;) {
          context.workspace.checkpoint();
          if (performance.now() >= deadline) throw new NetInterrupted("time-limit");
          if (++work > context.limits.workUnits) {
            yield { kind: "interrupted", reason: "work-limit" };
            return;
          }
          const next = modes[i].next();
          if (next.done) modes.splice(i, 1);
          else {
            if (
              next.value.kind === "proposal" &&
              !forcingProofFits(next.value.proposal, context.limits)
            ) {
              yield { kind: "interrupted", reason: "proof-step-limit" };
              return;
            }
            yield next.value;
            i++;
          }
        }
    } finally {
      for (const mode of modes) mode.return(undefined);
    }
    yield { kind: "exhausted" };
  } catch (error) {
    if (error instanceof NetInterrupted) yield { kind: "interrupted", reason: error.reason };
    else if (error instanceof IndexInterrupted) yield { kind: "interrupted", reason: error.reason };
    else throw error;
  } finally {
    for (const cursor of cursors) cursor.return(undefined);
    lease?.dispose();
  }
}
export const netTechniques = Object.freeze([forcingDescriptor("C23", discoverNets)]);

/** Bounded candidate strategy, also composed by the catalogue cursor. */
export function* discoverNetCandidate(
  view: ReadView,
  value: Literal,
  mode: "static" | "dynamic" | "nested",
  context: DiscoveryContext,
): Discovery {
  assertOwnedView(view);
  const deadline = performance.now() + context.limits.timeMs;
  let lease: WorkspaceReservation | undefined;
  let cursor: Generator<Work, DeductionProposal | undefined> | undefined;
  let work = 0;
  try {
    lease = context.workspace.reserve(1, 65536);
    cursor = new NetSearch(view, context, mode, lease).candidate(value);
    let next = cursor.next();
    while (!next.done) {
      context.workspace.checkpoint();
      if (performance.now() >= deadline) throw new NetInterrupted("time-limit");
      if (++work > context.limits.workUnits) {
        yield { kind: "interrupted", reason: "work-limit" };
        return;
      }
      yield next.value;
      next = cursor.next();
    }
    if (next.value) {
      if (!forcingProofFits(next.value, context.limits)) {
        yield { kind: "interrupted", reason: "proof-step-limit" };
        return;
      }
      yield { kind: "proposal", proposal: next.value };
    }
    yield { kind: "exhausted" };
  } catch (error) {
    if (error instanceof NetInterrupted) yield { kind: "interrupted", reason: error.reason };
    else if (error instanceof IndexInterrupted) yield { kind: "interrupted", reason: error.reason };
    else throw error;
  } finally {
    cursor?.return(undefined);
    lease?.dispose();
  }
}
