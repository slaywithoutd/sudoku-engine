import { checkProposal } from "../../src/solver/proof/checker";
import type { CheckedStep, DeductionProposal, Limits } from "../../src/solver/proof/types";
import { retainedProof } from "../../src/solver/state/candidates";
import type { ReadView } from "../../src/solver/state/types";
import { oracle } from "./oracle";
import type { OracleInput, OracleResult } from "./oracle";

const defaultLimits: Limits = { timeMs: 20000, workUnits: 1000000, exactNodes: 1000000, stepNodes: 4096,
  runNodes: 65536, proofBytes: 8000000, stepBytes: 2000000, batchBytes: 65536, inFlightBatches: 2, workspaceBytes: 64000000 };

/** Match exactly the 27 classic houses before invoking the classic-only oracle. */
function isClassic(view: ReadView): boolean {
  const problem = view.assembly.problem;
  if (problem.cells.length !== 81 || problem.symbols.length !== 9 || problem.constraints.length !== 27) return false;
  const scopes: string[] = [];
  for (let i = 0; i < 9; i++) {
    scopes.push(Array.from({ length: 9 }, (_,j) => i*9+j).join(","));
    scopes.push(Array.from({ length: 9 }, (_,j) => j*9+i).join(","));
    scopes.push(Array.from({ length: 9 }, (_,j) => (Math.floor(i/3)*3+Math.floor(j/3))*9+(i%3)*3+j%3).join(","));
  }
  const actual = problem.constraints.map(rule => rule.type === "all-different@1" && Object.keys(rule.parameters ?? {}).length === 0 ?
    [...rule.cells].sort((a,b) => a-b).join(",") : "unsupported").sort();
  return JSON.stringify(actual) === JSON.stringify(scopes.sort());
}

/** Independent tiny-domain enumeration: no production masks, indexes or rule checkers. */
function finiteOracle(view: ReadView, input: OracleInput): OracleResult {
  const problem = view.assembly.problem, values = Array(problem.cells.length).fill(0) as number[];
  for (const rule of problem.constraints) if (!["all-different@1", "sum@1", "order@1"].includes(rule.type))
    throw Error(`No independent acceptance semantics for ${rule.type}`);
  const choices = problem.cells.map(cell => problem.symbols.filter(symbol =>
    (!input.givens[cell] || input.givens[cell] === symbol) &&
    Math.floor((input.domains?.[cell] ?? 2 ** problem.symbols.length - 1) / 2 ** (symbol-1)) % 2 === 1 &&
    (!input.force || input.force[0] !== cell || input.force[1] === symbol) &&
    (!input.forbid || input.forbid[0] !== cell || input.forbid[1] !== symbol)));
  const witnesses: number[][] = []; let nodes = 0, interrupted = false, capped = false;
  const compatible = () => problem.constraints.every(rule => {
    const assigned = rule.cells.map(cell => values[cell]);
    if (rule.type === "all-different@1") return new Set(assigned.filter(Boolean)).size === assigned.filter(Boolean).length;
    if (rule.type === "order@1") return !assigned[0] || !assigned[1] || assigned[0] < assigned[1];
    const total = (rule.parameters as { total: number }).total;
    const sum = assigned.reduce((a,b) => a+b, 0), missing = rule.cells.filter(cell => !values[cell]);
    return missing.length === 0 ? sum === total :
      sum + missing.reduce((n,cell) => n + Math.min(...choices[cell]), 0) <= total &&
      sum + missing.reduce((n,cell) => n + Math.max(...choices[cell]), 0) >= total;
  });
  const order = [...problem.cells].sort((a,b) => choices[a].length - choices[b].length || a-b);
  const visit = (depth: number): boolean => {
    if (nodes >= input.maxNodes) { interrupted = true; return false; }
    nodes++;
    if (!compatible()) return true;
    if (depth === order.length) {
      witnesses.push([...values]);
      if (witnesses.length === input.limit) { capped = true; return false; }
      return true;
    }
    const cell = order[depth];
    for (const symbol of choices[cell]) { values[cell] = symbol; if (!visit(depth+1)) { values[cell] = 0; return false; } }
    values[cell] = 0; return true;
  };
  const exhausted = visit(0);
  return { witnesses, exhausted: exhausted && !interrupted && !capped, interrupted, nodes };
}

/**
 * Check a hand-authored proposal, establish a witness for its pre-state, then
 * independently refute each effect's negation. An interrupted search is failure.
 */
export function assertSound(view: ReadView, proposal: DeductionProposal,
  options: { oracleMaxNodes?: number; limits?: Limits } = {}): CheckedStep {
  const terminal = [...checkProposal(proposal, { view, retained: retainedProof(view), limits: options.limits ?? defaultLimits,
    policy: "discharged", uniqueEvidenceId: null })].at(-1);
  if (terminal?.kind !== "checked") throw Error(`Proof rejected: ${terminal?.kind === "rejected" ? terminal.code : "incomplete checker"}`);
  if (terminal.step.consequences.some(item => item.conditional || item.openAssumptions.length)) throw Error("Conditional acceptance is unsupported");
  const input: OracleInput = { givens: [...view.state.values], domains: [...view.state.domains],
    limit: 1, maxNodes: options.oracleMaxNodes ?? 1000000 };
  const run = isClassic(view) ? oracle : (query: OracleInput) => finiteOracle(view, query);
  const pre = run(input);
  if (pre.interrupted) throw Error("Acceptance oracle interrupted before establishing satisfiability");
  if (pre.witnesses.length === 0) throw Error("Acceptance pre-state is unsatisfiable");
  for (const effect of proposal.effects) {
    const restriction: [number, number] = [effect.cell, effect.symbol];
    const result = run({ ...input, ...(effect.kind === "remove" ? { force: restriction } : { forbid: restriction }) });
    if (result.interrupted) throw Error("Acceptance counterfactual oracle interrupted");
    if (!result.exhausted || result.witnesses.length !== 0) throw Error("Effect has a counterexample or lacks exhaustive refutation");
  }
  return terminal.step;
}
