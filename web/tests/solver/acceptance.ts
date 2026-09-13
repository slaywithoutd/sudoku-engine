import { checkProposal, verifyCertificate } from "../../src/solver/proof/checker";
import type { CheckedStep, DeductionProposal, Limits, ProofNode, Proposition } from "../../src/solver/proof/types";
import { retainedProof } from "../../src/solver/state/candidates";
import type { ReadView } from "../../src/solver/state/types";
import { oracle } from "./oracle";
import { normalizeClassic } from "../../src/solver/problem";
import type { Json } from "../../src/solver/problem";
import { assemble } from "../../src/solver/rules/assemble";
import { AllDifferentRule } from "../../src/solver/rules/all-different";
import { initialize, commitChecked } from "../../src/solver/state/candidates";
import { getTechniques } from "../../src/solver/techniques/registry";
import c03 from "./fixtures/C03.json";
import c01 from "./fixtures/C01.json";
import c02 from "./fixtures/C02.json";
import c04 from "./fixtures/C04.json";
import c05 from "./fixtures/C05.json";
import type { OracleInput, OracleResult } from "./oracle";

const defaultLimits: Limits = { timeMs: 20000, workUnits: 1000000, exactNodes: 1000000, stepNodes: 4096,
  runNodes: 65536, proofBytes: 8000000, stepBytes: 2000000, batchBytes: 65536, inFlightBatches: 2, workspaceBytes: 64000000 };

export interface TechniqueFixture {
  id: string; rowId: string; grammar: string; alias: string; givens: string;
  preState: { values: number[]; domains: number[] };
  expectedEffects: { kind: "place" | "remove"; cell: number; symbol: number }[];
  expectedPattern: Json; expectation: "productive" | "reject" | "out-of-profile";
  reachability: "local-state" | "original-clue-path";
}
export const foundationFixtures = [...c01, ...c02, ...c03, ...c04, ...c05] as TechniqueFixture[];
export function fixtureCase(id: string): TechniqueFixture {
  const aliases: Record<string,string> = { "C04-naked-4": "C04-naked-4-row", "C05-triple": "C05-triple-row" };
  const fixture = foundationFixtures.find(f => f.id === (aliases[id] ?? id));
  if (!fixture) throw Error(`unknown-fixture:${id}`);
  return structuredClone(fixture);
}
const prefixCache = new Map<string, ReadView>();
const prefixBundles = new Map<string, readonly DeductionProposal[]>();
/** Build only from original clues and checked direct rule exclusions. */
export function fixtureView(fixture: TechniqueFixture): ReadView {
  const cached = prefixCache.get(fixture.givens);
  if (cached) {
    if (JSON.stringify(cached.state.values) !== JSON.stringify(fixture.preState.values) ||
      JSON.stringify(cached.state.domains) !== JSON.stringify(fixture.preState.domains)) throw Error("independent-prefix-mismatch");
    return cached;
  }
  const result = assemble(normalizeClassic({ kind: "classic", version: 1, width: 9, height: 9,
    givens: [...fixture.givens].map(Number) }), [new AllDifferentRule()]);
  if (!result.ok) throw Error("invalid-fixture-problem");
  let view = initialize(result.value, "primary");
  const bundles: DeductionProposal[] = [];
  for (const rule of view.assembly.problem.constraints) {
    const proposals = [...view.assembly.modules.get(rule.id)!.propagate(view, rule)].filter(e => e.kind === "proposal");
    for (const event of proposals) if (event.kind === "proposal") {
      const terminal = [...checkProposal(event.proposal, { view, retained: retainedProof(view), limits: defaultLimits,
        policy: "unconditional", uniqueEvidenceId: null })].at(-1);
      if (terminal?.kind !== "checked") throw Error(`preamble-rejected:${JSON.stringify(terminal)}`);
      bundles.push(terminal.step.proposal);
      view = commitChecked(view, terminal.step).view;
    }
  }
  if (JSON.stringify(view.state.values) !== JSON.stringify(fixture.preState.values) ||
    JSON.stringify(view.state.domains) !== JSON.stringify(fixture.preState.domains)) throw Error("independent-prefix-mismatch");
  prefixCache.set(fixture.givens, view);
  prefixBundles.set(fixture.givens, Object.freeze(bundles));
  return view;
}
export function fixturePrefix(id: string): readonly DeductionProposal[] {
  const fixture=fixtureCase(id); fixtureView(fixture); return prefixBundles.get(fixture.givens)!;
}
export function discoverFixture(id: string) {
  const fixture = fixtureCase(id), view = fixtureView(fixture);
  const detector = getTechniques("classic-expanded@1").find(d => d.id === `${fixture.rowId.toLowerCase()}@1`)!;
  const events = [...detector.discover(view)];
  const proposals = events.flatMap(e => e.kind === "proposal" && JSON.stringify(e.proposal.pattern) === JSON.stringify(fixture.expectedPattern) ? [e.proposal] : []);
  const p = fixture.expectedPattern as { cells?: number[]; kind?: string };
  const outside = p.cells && (fixture.rowId === "C03" ? p.cells.length < 2 || p.cells.length > 3 :
    fixture.rowId === "C04" ? p.cells.length < 2 || p.cells.length > 4 : fixture.rowId === "C05" ? p.cells.length < 2 || p.cells.length > 3 : false);
  const status = proposals.length ? "productive" as const : outside ? "out-of-profile" as const : events.at(-1)?.kind === "exhausted" ? "reject" as const : "interrupted" as const;
  return { view, proposals, status, get proposal() {
    if (proposals.length !== 1) throw Error(`expected-one-productive-proposal:${id}:${proposals.length}`);
    return proposals[0];
  } };
}

/**
 * Independently authored certificate compiler for the explicit fixture contract.
 * It never calls discovery or the production builder. Expected geometry/effects
 * come from the separately authored JSON, not from production output.
 */
export function fixtureCertificate(id: string): DeductionProposal {
  const fixture = fixtureCase(id), view = fixtureView(fixture), pattern = fixture.expectedPattern as Record<string, any>;
  const nodes: ProofNode[] = [], imports = new Set<number>(), roots: number[] = [];
  const prefix = retainedProof(view); let next = Math.max(...prefix.keys())+1;
  const add = (rule: string, premises: number[], conclusion: Proposition) => {
    for (const premise of premises) if (prefix.has(premise)) imports.add(premise);
    const id = next++; nodes.push({id,rule,premises,conclusion,scope:[],parameters:{}}); return id;
  };
  const lit = (cell: number, symbol: number, positive: boolean): Proposition => ({kind:"literal",value:{cell,symbol,positive}});
  const clause = (terms: {cell:number;symbol:number;positive:boolean}[]): Proposition => {
    terms.sort((a,b) => a.cell-b.cell || a.symbol-b.symbol || Number(a.positive)-Number(b.positive));
    const unique = terms.filter((t,i) => !i || JSON.stringify(t) !== JSON.stringify(terms[i-1]));
    return unique.length === 1 ? {kind:"literal",value:unique[0]} : {kind:"clause",alternatives:unique};
  };
  const scopeFact = (kind: "cover" | "all-different", cells: readonly number[], symbol?: number) => {
    const fact = [...view.facts.values()].find(f => f.proposition.kind === kind &&
      JSON.stringify(f.proposition.cells) === JSON.stringify(cells) && (f.proposition.kind !== "cover" || f.proposition.symbol === symbol));
    if (!fact) throw Error("fixture-premise-missing"); return fact.root;
  };
  const proofs = new Map<string,number>();
  const effectRoot = (cell:number,symbol:number,root:number) => { roots.push(root); proofs.set(`${cell}:${symbol}`,root); };
  let positive: number | undefined;
  if (fixture.rowId === "C01") positive = add("cover-clause@1", [view.state.domainFacts[pattern.cell]],lit(pattern.cell,pattern.symbol,true));
  if (fixture.rowId === "C02" || fixture.rowId === "C03") {
    const cover = view.assembly.covers.find(c => c.id === pattern.cover)!;
    const cells = cover.cells.filter(c => Math.floor(view.state.domains[c]/2**(cover.symbol-1))%2 === 1);
    const support = add("support@1", [scopeFact("cover",cover.cells,cover.symbol),...cover.cells.map(c => view.state.domainFacts[c])],
      {kind:"cover",symbol:cover.symbol,cells});
    const exhaustive = add("cover-clause@1",[support],clause(cells.map(cell => ({cell,symbol:cover.symbol,positive:true}))));
    if (fixture.rowId === "C02") positive = exhaustive;
    else {
      const group = view.assembly.allDifferent.find(h => h.id === pattern.group)!;
      for (const effect of fixture.expectedEffects) {
        let current = exhaustive;
        for (let index=0;index<cells.length;index++) {
          const weak = add("weak-link@1",[scopeFact("all-different",group.cells)],clause([
            {cell:cells[index],symbol:effect.symbol,positive:false},{cell:effect.cell,symbol:effect.symbol,positive:false}]));
          current = add("resolution@1",[current,weak],clause([...cells.slice(index+1).map(cell => ({cell,symbol:effect.symbol,positive:true})),
            {cell:effect.cell,symbol:effect.symbol,positive:false}]));
        }
        effectRoot(effect.cell,effect.symbol,current);
      }
    }
  }
  if (positive !== undefined) for (const effect of fixture.expectedEffects) {
    if (effect.kind === "place") effectRoot(effect.cell,effect.symbol,positive);
    else {
      const house = view.assembly.allDifferent.find(h => h.cells.includes(pattern.cell) && h.cells.includes(effect.cell))!;
      const weak = add("weak-link@1",[scopeFact("all-different",house.cells)],clause([
        {cell:pattern.cell,symbol:effect.symbol,positive:false},{cell:effect.cell,symbol:effect.symbol,positive:false}]));
      effectRoot(effect.cell,effect.symbol,add("resolution@1",[weak,positive],lit(effect.cell,effect.symbol,false)));
    }
  }
  if (fixture.rowId === "C04" || fixture.rowId === "C05") {
    for (const houseId of pattern.houses ?? [pattern.house]) {
      const house = view.assembly.allDifferent.find(h => h.id === houseId)!;
      const selected: number[] = pattern.form === "hidden" ? house.cells.filter(c => !pattern.cells.includes(c)) : pattern.cells;
      for (const effect of fixture.expectedEffects) if (house.cells.includes(effect.cell) && !selected.includes(effect.cell)) {
        effectRoot(effect.cell,effect.symbol,add("hall@1",[scopeFact("all-different",house.cells),...selected.map(c => view.state.domainFacts[c])],lit(effect.cell,effect.symbol,false)));
      }
    }
  }
  const domains = new Map<number,{mask:number;root:number}>();
  for (const effect of fixture.expectedEffects) {
    const prior = domains.get(effect.cell) ?? {mask:view.state.domains[effect.cell],root:view.state.domainFacts[effect.cell]};
    const bit = 2**(effect.symbol-1), mask = effect.kind === "place" ? bit : prior.mask-bit;
    domains.set(effect.cell,{mask,root:add("domain-restrict@1",[prior.root,proofs.get(`${effect.cell}:${effect.symbol}`)!],{kind:"domain",cell:effect.cell,mask})});
  }
  roots.push(...[...domains.values()].map(d => d.root));
  return {technique:`${fixture.rowId.toLowerCase()}@1`,state:view.state.key,pattern:fixture.expectedPattern,effects:fixture.expectedEffects,
    proof:{state:view.state.key,nodes,imports:[...imports].sort((a,b)=>a-b),roots}};
}

export type FixtureMutation = "wrong-alias" | "missing-node" | "invented-effect" | "undischarged" | "missing-import" | "wrong-domain" | "outside-bound";
/** Mutate a clone of the independent certificate; discovery never participates. */
export function checkFixtureMutation(id: string, mutation: FixtureMutation) {
  const view = fixtureView(fixtureCase(id)), proposal = structuredClone(fixtureCertificate(id));
  const p = proposal as unknown as {pattern:Record<string,unknown>;proof:{nodes:ProofNode[];imports:number[]};effects:{cell:number}[]};
  if (mutation === "wrong-alias") p.pattern.alias = "unregistered-alias";
  if (mutation === "missing-node") p.proof.nodes.pop();
  if (mutation === "invented-effect") p.effects[0].cell = (p.effects[0].cell+1)%81;
  if (mutation === "undischarged") (p.proof.nodes[0] as unknown as {scope:number[]}).scope = [p.proof.nodes[0].id];
  if (mutation === "missing-import") p.proof.imports.pop();
  if (mutation === "wrong-domain") (p.proof.nodes.at(-1)!.conclusion as {mask:number}).mask = 511;
  if (mutation === "outside-bound") {
    if (Array.isArray(p.pattern.cells)) p.pattern.cells = Array.from({length:fixtureCase(id).rowId === "C04" ? 5 : 4},(_,i)=>i);
    else if (p.pattern.kind === "single") p.pattern.symbol = 10;
    else p.pattern.cover = "noncovering-cage";
  }
  return [...checkProposal(proposal,{view,retained:retainedProof(view),limits:defaultLimits,policy:"unconditional",uniqueEvidenceId:null})].at(-1);
}

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
  assertEffectsSound(view, proposal, options.oracleMaxNodes);
  return terminal.step;
}

/** Algebra acceptance does not advertise or issue a production technique step. */
export function assertCertificateSound(view: ReadView, proposal: DeductionProposal,
  options: { oracleMaxNodes?: number; limits?: Limits } = {}) {
  const terminal = [...verifyCertificate(proposal, { view, retained: retainedProof(view), limits: options.limits ?? defaultLimits,
    policy: "discharged", uniqueEvidenceId: null })].at(-1);
  if (terminal?.kind !== "verified") throw Error(`Certificate rejected: ${terminal?.kind === "rejected" ? terminal.code : "incomplete checker"}`);
  assertEffectsSound(view, proposal, options.oracleMaxNodes);
  return terminal.certificate;
}
function assertEffectsSound(view: ReadView, proposal: DeductionProposal, oracleMaxNodes?: number): void {
  const input: OracleInput = { givens: [...view.state.values], domains: [...view.state.domains],
    limit: 1, maxNodes: oracleMaxNodes ?? 1000000 };
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
}
