# M2 engine contracts

**Approval update:** The user approved this design at `0e98c2b` and authorized implementation under D065/D066. Earlier review-only wording below records the drafting state; benchmarks and runtime acceptance remain required.

Date: 2026-09-12. Status: **complete technical proposal for review; no implementation authorization**. Companion to the [expanded design](2026-09-12-m2-engine-expansion-design.md), [coverage matrix](2026-09-12-m2-technique-coverage.md), [screen/evidence specification](2026-09-12-m2-classic-solver-design.md) and [implementation plan](../plans/2026-09-12-m2-classic-solver.md). Contracts here replace earlier sketches. Numerical choices are proposed, unmeasured profile parameters.

## 1. Boundaries and identity

Inspection baseline is `80471d2` on `docs/m2-solver-design`, with research `24e0d25` preserved. No applicable AGENTS.md was found. `web/src/app/application.ts` owns the persistent controller and mount/dispose lifecycle; create a sibling solver controller once per application. Add it to `ScreenServices`; solver modules receive no `Controller` or `Repository`. `ClassicDefinition`, library, IndexedDB and backup versions remain 1. Preserve D053 English and D058 appearance fields and CSS tokens. `BoardOptions.controlsContainer` serves temporary input; a separate read-only result board avoids changing M1 input permissions.

Pure engine modules depend only on domain value types and each other. Rule modules declare semantics, capabilities and proof primitives; detectors read capabilities and propose proofs; the checker alone issues checked steps; the reducer alone changes candidates; the scheduler controls effort. The exact verifier accepts only the normalized original problem and supported rule modules. No detector, conditional analysis, rollout or UI can supply its starting candidates.

All TypeScript below is interface design to implement after approval. Runtime decoders validate numbers, lengths, IDs, versions, field sets and references before construction. `CellId`/`SymbolId` are dense integers; the initial adapter supports 81 cells and symbols 1–9. Nine-bit `Mask` is an M2 representation limit, not a public promise of custom-size support. Filled cells retain a singleton domain (unlike the old mask-zero sketch); values distinguish assigned cells from unresolved singleton domains. This makes domain facts uniform across rules and preserves monotone elimination.

```ts
type CellId = number;
type SymbolId = number;
type Mask = number;
type Json = null | boolean | number | string | readonly Json[] |
  { readonly [key: string]: Json };
type VersionId = string; // identifier@positive-integer
type ConstraintId = string;
type FactId = number;
type NodeId = number;
type BranchId = string;
type ProblemKey = string; // complete canonical serialization; never hash-only equality
interface ConstraintInstance {
  id: ConstraintId;
  type: VersionId;
  cells: readonly CellId[]; // ordered if the rule's semantics are ordered
  parameters: Json;
}
interface EngineProblem {
  schema: 1;
  cells: readonly CellId[];
  symbols: readonly SymbolId[];
  givens: readonly (SymbolId | 0)[];
  constraints: readonly ConstraintInstance[];
  key: ProblemKey;
}
type SourceRef = { kind: "manual" | "paste" } | {
  kind: "draft" | "puzzle"; id: string; name: string;
  libraryRevision: number; unsaved: boolean;
};
interface SolverSnapshot {
  snapshotId: string; inputRevision: number;
  problem: EngineProblem; source: SourceRef;
}
interface RunKey {
  requestId: string; snapshotId: string; inputRevision: number;
  problemKey: ProblemKey;
  operation: "primary" | "conditional";
  mode: "explain" | "analyze";
  engine: VersionId; profile: VersionId; scheduler: VersionId;
  checker: VersionId; exact: VersionId;
  optionsKey: string;
  parentEvidenceId: string | null; // required for conditional, null for primary
}
interface StateKey {
  problemKey: ProblemKey; branch: BranchId; revision: number;
}
```

Normalize object keys recursively, reject NaN/infinity/undefined and unknown semantic fields, retain ordered arrays, sort set-valued arrays only in a rule's normalizer, sort constraints by stable ID and reject duplicate IDs. Include givens, cells, symbols, rule types/versions, scopes and all parameters in `ProblemKey`; exclude source names and library revisions. Never sort a thermometer path as a set. The classic adapter expands to 27 `all-different@1` instances with stable `row:0`…`box:8` IDs. Canonical registration order must not affect assembly, proofs or enumeration. Compare the full canonical key when a digest is used as a cache index. Deep-copy inputs; freeze ordinary arrays in development; never expose writable typed-array backing stores.

Use a fresh snapshot UUID on source replacement; inputRevision increases on value edit/undo/redo/reset. Selection does not invalidate results. Each Start receives a fresh request UUID even with identical input. Each speculative branch has its own branch ID, fact store and indexes. No cache crosses branch/problem/version boundaries. Conditional runs also bind the accepted independent unique evidence and unconditional prefix digest to `optionsKey`.

## 2. Normalized rules and capability assembly

```ts
interface RuleIssue { code: string; constraintId: ConstraintId; message: string }
interface Assignment { values: readonly (SymbolId | 0)[] }
interface AllDifferent {
  id: string; cells: readonly CellId[]; premise: FactId;
}
interface Cover {
  id: string; symbol: SymbolId; cells: readonly CellId[];
  premise: FactId; // this symbol MUST occur, not merely MAY occur
}
interface Relation {
  id: string; cells: readonly CellId[];
  tuples: readonly (readonly SymbolId[])[];
  premise: FactId; // exhaustive allowed relation, or sound superset with certified provenance
}
interface RuleCapabilities {
  allDifferent: readonly AllDifferent[];
  covers: readonly Cover[];
  relations: readonly Relation[];
  primitiveIds: readonly VersionId[];
}
interface RuleModule {
  type: VersionId;
  normalize(input: ConstraintInstance): ConstraintInstance;
  validate(problem: EngineProblem, rule: ConstraintInstance): readonly RuleIssue[];
  checkComplete(rule: ConstraintInstance, assignment: Assignment): boolean;
  capabilities(rule: ConstraintInstance, context: RuleContext): RuleCapabilities;
  propagate(view: ReadView, rule: ConstraintInstance): Discovery;
  checkPrimitive(input: PrimitiveInput, context: CheckContext): CheckedInference;
}
interface RuleContext { problem: EngineProblem; roots: ReadonlyMap<ConstraintId, FactId> }
interface Assembly {
  problem: EngineProblem;
  modules: ReadonlyMap<ConstraintId, RuleModule>;
  allDifferent: readonly AllDifferent[];
  covers: readonly Cover[];
  relations: readonly Relation[];
  peers: readonly (readonly CellId[])[];
  supportSignature: string;
}
type AssemblyResult = { ok: true; value: Assembly } |
  { ok: false; issues: readonly RuleIssue[] };
assemble(problem: EngineProblem, registry: readonly RuleModule[]): AssemblyResult;
normalizeClassic(input: unknown): EngineProblem;
makeSnapshot(problem: EngineProblem, source: SourceRef,
  snapshotId: string, inputRevision: number): SolverSnapshot;
```

`assemble` fails closed for absent normalize/validate/complete-check semantics, unknown rule or primitive versions, invalid scopes or duplicate capability IDs. Missing stronger logical propagation is permitted only as an explicit capability limitation: the module must still supply checking and a no-op completed discovery. Production exact search can always enumerate all assignments using complete checks; only sound, separately checked pruning is optional. Unsupported rules never disappear from a full-puzzle claim.

Bootstrap domain-axiom, clue and rule roots before capability assembly; capability premises are derived roots checked from module semantics, not arbitrary fact IDs returned by a module. An all-different group gives pairwise conflicts. It yields digit covers only when its scope size equals the symbol-domain size and all cells share that domain, or a separate existence proof exists. A three-cell cage must not produce nine covers. Hidden subsets, strong house links and fish require covers; naked subsets need only all-different. Classic geometry tags used for named patterns are adapter metadata checked against scopes, not hardcoded unit numbers inside the scheduler.

Mock sum/order modules live in tests only. Exhaustively enumerate small domains to test joint tuple filtering, projection, join and original-rule exact checking; include A+B=10, A<B and row exclusions forcing A=4, B=6, with both rule IDs in the final provenance. Production M2 ships only the classic adapter/all-different module. There is no downloaded plugin execution, variant editor or rule-authoring UI.

## 3. Shared domains, facts and event invalidation

```ts
interface Literal { cell: CellId; symbol: SymbolId; positive: boolean }
type Proposition =
  | { kind: "literal"; value: Literal }
  | { kind: "and"; terms: readonly Proposition[] }
  | { kind: "clause"; alternatives: readonly Literal[] }
  | { kind: "domain"; cell: CellId; mask: Mask }
  | { kind: "rule"; constraintId: ConstraintId }
  | { kind: "all-different"; cells: readonly CellId[] }
  | { kind: "cover"; symbol: SymbolId; cells: readonly CellId[] }
  | { kind: "relation"; cells: readonly CellId[]; tuples: readonly (readonly SymbolId[])[] }
  | { kind: "table"; cells: readonly CellId[]; count: number; definition: NodeId }
  | { kind: "false" };
interface Fact {
  id: FactId; proposition: Proposition; root: NodeId;
  state: StateKey; openAssumptions: readonly NodeId[];
  conditional: boolean; rules: readonly ConstraintId[];
}
interface CandidateState {
  key: StateKey; values: readonly (SymbolId | 0)[];
  domains: readonly Mask[]; domainFacts: readonly FactId[];
}
interface ReadView {
  assembly: Assembly; state: CandidateState;
  facts: ReadonlyMap<FactId, Fact>;
  supports(coverId: string): readonly CellId[];
}
type Watch = { kind: "cell"; cell: CellId } |
  { kind: "cover" | "relation" | "constraint"; id: string } |
  { kind: "graph" | "all" };
interface ChangeSet {
  before: StateKey; after: StateKey;
  removed: readonly Literal[]; placed: readonly Literal[];
  cells: readonly CellId[]; coverIds: readonly string[];
  relationIds: readonly string[]; constraintIds: readonly ConstraintId[];
  graphChanged: boolean;
}
initialize(assembly: Assembly, branch: BranchId): ReadView;
commitChecked(view: ReadView, step: CheckedStep): { view: ReadView; changes: ChangeSet };
invalidate(changes: ChangeSet, ledger: Ledger): Ledger;
```

Initialization begins with full domains and intersects givens only. Worker and controller independently build the same canonical clue/rule root IDs; no domain pruning arrives as an unproved starting mask. Rule propagation then proposes checked exclusions through the normal proof/acceptance path, grouped in the visible initialization preamble. Every missing candidate has a proof dependency. Cached support lists are exhaustive at their tagged revision; they are never trusted as root axioms. Links carry their weak (`not(a and b)`) or strong (`a or b`) premise; XOR requires both. Group literals mean explicit disjunctions, never an invented candidate that can be assigned as a digit. ALS indexes describe all-different n-cell/n+1-symbol sets; restricted common candidates require all cross-occurrences to conflict, with explicit overlap handling.

Applying a placement restricts its domain to the chosen singleton, records assignment, and includes proved peer eliminations in that same atomic step. Propagation under other constraints is a subsequent explained step. Newly exposed singles are not auto-placed. Require a productive removal or previously unresolved placement. The ranking potential `sum(popcount(domain)-1) + unresolvedCells` starts at most 729 and strictly decreases; it bounds productive state-changing steps, not proof nodes or runtime. Proof-only facts may be cached without incrementing candidate revision; they cannot affect canonical discovery order or wake an endless proof-fact loop. Index construction order is fixed and charged as work.

At commit, derive `ChangeSet` centrally from actual differences and incidence maps. Rebuild affected supports/tuple projections before querying them; invalidate all dependent graph/ALS caches transitively. Initial implementation uses conservative whole-graph invalidation for global techniques. Cache keys contain StateKey, primitive/profile versions and watched-input fingerprints. Carry an exhausted/excluded detector result forward only when all its dependency fingerprints are unchanged; stale resumable cursors are discarded and re-enqueued. Missing watches are a correctness bug. Test every edit against a cold rebuild/full rescan. An invalid proposal causes an engine error, never a zero-solution conclusion.

D086 specifies the T14 hypothetical-session authority extension (implemented and independently reviewed through `7f1c374`): caller-budgeted forks copy candidates/index ownership and share exact immutable parent prefix objects. Engine-issued identities and lexical assumption ancestry authorize branch-local checking; a separate BranchCertificate never authorizes ordinary commits or retained primary facts. Ordinary admission rejects even assumption-free hypothetical forks. Branch verification binds the complete exact source prefix; publication rejects all existing node IDs before allocation. Branch facts and domains publish atomically; a checked empty domain ends in contradiction rather than becoming a usable view. Parent replay imports/remaps the full DAG, checks every reference and discharges assumptions. Authenticate views before reading fields, reject sibling/child-to-parent imports, and release leases on every exit. Closed primary index source rules remain unchanged; hypothetical indexes may consume only exact facts in their authentic lexical ancestry. Labels or supplied assumption arrays grant no authority.

## 4. Discovery and ledger

```ts
type AssumptionPolicy = "unconditional" | "discharged" | "unique-only";
interface TechniqueBounds {
  maxLength: number; maxBranchDepth: number; maxAlternatives: number;
  maxPatternCells: number; maxSetSize: number;
}
interface TechniqueDescriptor {
  id: VersionId; aliases: readonly string[]; tier: number;
  requires: readonly string[]; assumptionPolicy: AssumptionPolicy;
  watches(view: ReadView): readonly Watch[];
  bounds: TechniqueBounds;
  eligible(view: ReadView): { kind: "yes" } |
    { kind: "excluded"; reason: string; dependencies: readonly Watch[] };
  estimate(view: ReadView): Estimate;
  discover(view: ReadView, context: DiscoveryContext): Discovery;
}
interface DiscoveryContext { workspace: IndexWorkspace; limits: Limits } // D073; one operation
interface Estimate { hit: number; gain: number; cost: number } // bounded integers
type DiscoveryInterruption = "time-limit" | "work-limit" | "proof-step-limit" |
  "cancelled" | "workspace-entry-limit" | "workspace-byte-limit";
type DiscoveryEvent = { kind: "work"; units: number } |
  { kind: "proposal"; proposal: DeductionProposal } |
  { kind: "excluded"; reason: string; dependencies: readonly Watch[] } |
  { kind: "exhausted" } | { kind: "interrupted"; reason: DiscoveryInterruption };
type Discovery = Generator<DiscoveryEvent, void, void>;
type DetectorStatus = "pending" | "in-progress" | "found" |
  "exhausted" | "excluded" | "interrupted";
interface LedgerEntry {
  technique: VersionId; scopeKey: string; state: StateKey;
  status: DetectorStatus; dependencies: readonly Watch[];
  work: number; reason?: string;
}
type Ledger = readonly LedgerEntry[];
```

Discovery is read-only and resumable at explicit bounded loop units. Generator return, cancellation or an empty current result list does not mean exhaustion: require the explicit exhausted event. Use one live job per technique descriptor and one per rule instance, each with a resumable cursor over sorted scopes (cell/house/digit/pattern seed). Do not materialize combinatorial scope jobs. At most 256 ledger jobs are supported by protocol 2; assembly rejects a larger operation explicitly. The classic profile needs fewer than this cap. Declare all structural profile bounds before the run. Reaching the end of a finite length/size profile is `exhausted within profile`; hitting time, work, cache/proof memory or serialization limits is `interrupted`, even if shorter patterns finished. Record individual reasons, bounds, exclusions and disabled conditional families in the result coverage panel.

D080 permits an explicit terminal `excluded` discovery event for an authenticated view missing necessary capabilities, with the same reason and watched dependencies as eligibility. This is distinct from exhausted enumeration. Resolve actual classic scope geometry and proved full-cover sources rather than trusting familiar IDs or an 81-cell count. A partial set of authentic classic sources can support deductions using those sources; requiring all 27 houses or all nine digit covers per house would be an unnecessary filter. Forged/unowned views remain admission errors. Scheduler and transport ledger projections preserve the exclusion reason/dependencies and invalidate them when those sources change.

T14 extends the D080 event contract with explicit `time-limit` interruption when a branch checker exhausts its time allowance, independently of outer work accounting (implemented and independently reviewed through `7f1c374`). Preserve actual local time/work/proof/workspace reasons; a failed allowance never proves candidate impossibility or enumeration exhaustion. A local limit does not by itself establish that the operation's global deadline expired. T19-T23 map the final reviewed event union and retain cancellation/deadline precedence.

Candidates proposed under the same revision are independently checked before selection. Deduplicate equivalent effects using sorted effects then normalized proof key; keep the least-complex checked proof, not the first wall-clock arrival. A proposal is not an accepted step. Primitive labels and aliases cannot bypass the checker or the family grammar. Before each technique-selection window, drain mandatory rule-propagation jobs to a checked fixed point. They use descriptor `rule-propagation@1`, normal proof/effect checking and revisions, and a preamble presentation; they are semantic maintenance, not an extra named matrix technique. They consume the same human/work/proof budgets. Interruption here is incomplete initialization/logic, never a valid unfiltered candidate premise. Initial root construction itself is bounded by M2 cells/rules and checked under the total deadline before starting discovery.

D072 makes index resource ownership explicit: `buildImplications(view, workspace)`, `buildGroups(view, workspace)` and `buildAls(view, workspace)` require a shared `IndexWorkspace`; each returns work events followed by either a complete ready index or an explicit interrupted reason (`cancelled`, `workspace-entry-limit`, `workspace-byte-limit`). Reserve aggregate entries/bytes and scratch before allocation; incomplete iteration releases its lease, while a completed index keeps its lease until disposal. Query work is separately charged. Borrowed entries cannot outlive that lease; retained downstream recipes require their own budget. These are accounted sizes, not measured heap use.

Indexes preserve StateKey/version/watch metadata and exact premise identities. State-only `accepts` answers cache metadata compatibility; `acceptsView` also authenticates published ownership and every referenced fact. An independent equal-key root context cannot authorize imports. Cold rebuild or same-revision retained-prefix growth is reusable only if all referenced inputs are identical. `acceptsView` means existing recipes remain valid; `completeFor` also checks that the index covers the current closed proved-source prefix. Prefix growth can require rebuilding even without a candidate revision change; incomplete index coverage cannot establish absence, prerequisite exclusion or exhaustion. Entries contain explicit bounded proof recipes, not accepted facts. Add the checked `all-different-subset@1` primitive for explicit nonempty subset scope reduction; it preserves assumptions/provenance and cannot create a cover. Local table filtering still requires all cited constraint scopes wholly inside its selected cells.

## 5. Proof graph and checking

```ts
interface PrimitiveInput {
  rule: VersionId; premises: readonly NodeId[]; parameters: Json;
  conclusion: Proposition;
}
interface ProofNode extends PrimitiveInput {
  id: NodeId; scope: readonly NodeId[]; // enclosing assumption-node IDs
}
interface ProofBundle {
  state: StateKey; nodes: readonly ProofNode[];
  imports: readonly NodeId[]; roots: readonly NodeId[];
}
interface Effect { kind: "place" | "remove"; cell: CellId; symbol: SymbolId }
interface DeductionProposal {
  technique: VersionId; state: StateKey;
  effects: readonly Effect[]; proof: ProofBundle;
  pattern: Json; // versioned family-specific certificate decoded by its checker
}
interface CheckContext {
  view: ReadView; retained: ReadonlyMap<NodeId, ProofNode>;
  policy: AssumptionPolicy; uniqueEvidenceId: string | null;
  limits: Limits;
}
interface CheckedInference {
  conclusion: Proposition; openAssumptions: readonly NodeId[];
  conditional: boolean; rules: readonly ConstraintId[];
}
interface CheckedStep {
  proposal: DeductionProposal;
  consequences: readonly CheckedInference[];
  afterRevision: number;
  // Opaque brand: construct only inside checker, never accepted from wire.
}
type CheckEvent = { kind: "work"; units: number } |
  { kind: "checked"; step: CheckedStep } |
  { kind: "rejected"; code: string };
checkProposal(proposal: DeductionProposal, context: CheckContext): Generator<CheckEvent, void, void>;
replay(snapshot: SolverSnapshot, bundles: readonly DeductionProposal[],
  assembly: Assembly, limits: Limits): Generator<CheckEvent, void, void>;
retainCheckedFacts(view: ReadView, step: CheckedStep): ReadView;
interface InitializationReservation {
  nodes: number; proofBytes: number; workUnits: number; workspaceBytes: number;
}
initializationReservation(assembly: Assembly): Generator<CheckEvent, InitializationReservation, void>;
checkedHeaderBytes(step: CheckedStep): number;
checkedWorkUnits(step: CheckedStep): number;
```

Proofs are DAGs in topological node order with unique monotonically allocated IDs within a run; imports reference already accepted nodes in the same run/prefix. Branch-local imports require compatible scopes. Validate no forward reference, cycle, dangling root, unknown primitive, unsupported parameter, unexplained effect or missing dependency. Derive assumption/rule provenance in the checker; never trust worker metadata. Each node has bounded arity/serialized length; large case tables are trees of bounded nodes. Node limits include initialization, certificates and their referenced table entries; table data is not a way around proof caps.

Primitive registry and checker rules:

| Primitive group | Required reconstruction |
| --- | --- |
| `domain-axiom@1`, `given@1`, `rule-instance@1` | Exact original problem domain, given value or declared constraint; no arbitrary candidate-state axioms. |
| `domain-restrict@1`, `support@1` | Prior domain plus checked removals; cover plus every current domain needed to reconstruct the complete support set, including assigned values. |
| `weak-link@1`, `cover-clause@1` | Same-cell or all-different exclusion; exhaustive alternatives from a proved cover/domain. Relational conflicts use explicit complete table filtering/projection (D075). |
| `resolution@1`, `conjunction@1` | One complementary literal in two explicit clauses; deduplicated resolvent; conjunction contains exactly its checked premises. |
| `assume@1`, `contradiction@1` | Fresh scoped assumption; false from opposing literals, empty domain or falsified proved clause. |
| `discharge@1`, `cases@1` | From A leading to false infer not-A in the parent scope; or prove C under every member of a proved exhaustive clause and infer C. Only those assumptions are removed. |
| `hall@1`, `cover-count@1` | Finite all-different/coverage cardinality inequalities with explicit incidence and complete supports. Overlaps must be counted by coefficients, not assumed disjoint. |
| `table-join-filter@1` (D089; implemented and reviewed) | Two authenticated complete relations/tables plus checked all-different/clause filters entirely within their union. Enumerate compatible pairs and exact filtered count; preserve every premise and existing sixteen-cell/depth-sixty-four/resource limits. No partition union of join definitions. |
| `cover-count-clause@1` (D090; implemented and reviewed) | Reconstruct weighted cover/capacity inequality and exact domains; falsify a canonical signed single-symbol clause and accept only when the minimum compatible incidence sum exceeds the bound. Complete nonzero-incidence/clause-cell evidence, no contradictory fixings, full taint and cooperative accounting. |
| `subset-count@1` (D085; T13 reviewed) | Exact domains of 1…12 counted cells and the target, a scoped positive target assumption, and 1…4 explicit all-different incidences. Reconstruct target restrictions; for each symbol in the original union, cooperatively enumerate every occupancy subset (<=4,096), checking conflicts and the asserted exact maximum including zero. Sum maxima and derive false only below cell count; discharge before applying a removal. Authenticated singleton counted cells are permitted; the target is unresolved. |
| `table-filter@1`, `table-union@1`, `table-join@1`, `table-project@1` | Complete Cartesian enumeration or a referenced proved relation; each rejected tuple has a checked conflict. Bounded filter leaves and disjoint/exhaustive partition unions retain exact source-domain/constraint identities. Joins match shared cells and cite both complete table definitions. Incomplete tables cannot authorize joining or projection. |
| `template-cover@1` | Independently reconstruct all legal per-digit placements through each row/column/box from domains; decision DAG with every outgoing alternative, including rejection reason. |
| `unique-transform@1` | Prior independent unique evidence, a nontrivial alternate assignment transformation, preservation of original givens and every declared rule, and a closed proof that the rejected condition would enable it. Marks all descendants conditional. |

Implementation refinement D068: a large finite table is a checked definition DAG, represented by a table proposition containing cells, exact count and its defining NodeId. The producing node owns the immutable definition; metadata is authenticated by actual node identity. Equal cells/count do not make two table propositions interchangeable. This primitive version bounds table scopes to 16 cells and definition depth to 64; explicit projected relations contain at most 256 distinct rows and must fit the node-byte cap. Filter leaves enumerate at most 256 Cartesian input tuples from explicit proved domain facts and rule/relation premises. A leaf box may be only a partial partition; binary table-union validates matching source identities and disjoint masks differing on exactly one axis before forming their union. Joining or projecting requires complete coverage of the source domains, with inherited assumptions and rule provenance intact. Small explicit relation tuples remain supported: projection independently enumerates and deduplicates the exact requested columns/rows within the per-node byte cap. General table-to-table projection is not part of this primitive version; keep the complete definition and project a bounded relation or proved effect. Heavy tuple/join checking uses a resumable primitive path and charges every tuple/pair; no large row list, compressed payload or lazy uncharged iteration can evade node/work/byte caps. This representation supports bounded local technique certificates; it does not authorize whole-grid completion enumeration as logic.

An effect-free checked bundle may be retained through `retainCheckedFacts(view, step)` without changing candidates or candidate revision. Admission still authenticates the complete current state and exact imported proof prefix. Retained nodes/facts consume the same cumulative proof/workspace budget; replay rechecks them before dependent bundles. Scheduling deduplicates these cache proposals and cannot treat them as productive board progress. Transport requires a separate bundle sequence/acceptance identity because unchanged candidate revision does not imply an unchanged retained proof prefix. A facts-only bundle also requires completed main-thread acceptance before dependent work may use its new retained sources; chunk ACK grants no such authority. Replay validates limits on empty input, reserves startup before initialization and accumulates actual checker work and retained header/framing bytes. `initializationReservation` emits estimator work separately from returned synchronous construction reservation. Its workspace estimate is an accounted-entry model, not measured heap. `checkedHeaderBytes` includes between-node separators; `checkedWorkUnits` includes bookkeeping not emitted as public work events. Avoid charging the same retained node bytes once per bundle; reserve operation-specific cache/ledger/transport memory additionally.

D088 restricts the explicitly marked certificate-only forms of C22 and C25-C27 to a complete named negative-target theorem: no effects, exactly one theorem root, every required case/position/source/bound intact, and temporary assumptions discharged. Closed clauses inside that checked proof keep their exact identities and independent derivations; a source clause cannot depend on the later consumer result. There is no cover-only shell, positive-placement cache, C23/C24 cache extension or new trusted issuer. C28 forcing may consume complete signed clauses of two to four alternatives; an inserted OR whip filters for positive candidate alternatives. The clause index authenticates the full fact prefix, so same-revision retention invalidates completeness. These contracts do not equate fact publication with candidate progress.

D075 extends `table-project@1` with a canonical clause containing 2–64 distinct sorted valid literals over source cells. One complete authenticated table/relation and empty parameters are required; every surviving tuple must satisfy the clause, with cooperative work charged per row and literal. This directly proves relation-derived weak clauses after domain filtering without relaxing an unconditional technique's assumption policy. All source provenance, conditionality, completeness, defining-node identity, arity and byte limits remain mandatory. A complete empty source entails the clause vacuously; it cannot establish independent solution-count evidence. Existing false/single-literal forms and the unsupported general table-to-table projection boundary remain unchanged.

D071 separates general mathematical verification from named acceptance: non-applying CheckedCertificate values and their isolated retained certificate sessions cannot enter candidate reducers or quality. Only the closed named grammar plus primitive checking against an authentic published ReadView identity creates CheckedStep. Capture that view once and authenticate membership without reading caller-supplied fields; accessor/proxy wrappers cannot authorize a named alias or proof-cache acceptance. Cold support rebuilds use trusted owned publication and preserve the exact state, facts and accepted lineage. Primitive tests must not regain candidate authority through test flags or injected registries.

Named family checkers validate geometry/grammar/bounds and compile premises into these primitives. A detector must not call its own discovery routine to check its output. Checkers can share immutable types and elementary mask utilities; independent acceptance oracles share neither candidate/index logic nor checking code. Human-readable text comes from validated typed parameters via `textContent`, never worker HTML.

A branch proof may read ancestors, not sibling assumptions. On discharge, retain any other inherited assumptions. Exhaustive alternatives may overlap; they must cover every possible case, and each branch must close or yield the same claimed conclusion. A contradiction in one branch eliminates only that assumption. Uniqueness is a permanent conditional dependency, never dischargeable. An undisclosed exact solution, arbitrary DFS tree, hypothesis-based estimate or table generated from a solved grid is not an allowed proof root.

Conditional analysis starts from a fresh copy of the original problem and rechecked unconditional prefix, imports independent unique evidence as a conditional premise, and uses its own board/trace/run key. No exact solution digits are passed as logical premises. Primary eligibility never depends on conditional discoveries. Perfect requires initially incomplete clues, all rules supported, a complete checked unconditional primary path, no fallback completion, zero open assumptions, and independent unique evidence for exactly this problem. Named discharged contradiction proofs can qualify; conditional traces cannot, even when uniqueness was established first.

## 6. Scheduling, determinism and bounded lookahead

Recommended profile IDs: `classic-expanded@1` and `classic-conditional@1`; coverage rows define tiers and finite bounds. One registry is shared by both modes. Default Explain uses `explain-fair@1`; Analyze uses `analyze-fair@1`. Keep `fixed-scan@1` and `event-fixed@1` as benchmark policies. No family toggle UI in M2; display the full profile and any runtime incomplete rows. Both modes remain human-first.

At each revision, order jobs canonically by tier, technique ID, scope cells, symbols and relation IDs. Fixed work accounting charges a unit for a pattern extension, edge visit, tuple test, proof-node check or exact-node transition, with inner loops split before 256 operations. A quantum is 256 units, independent of wall-clock slice boundaries. In Explain, process the lowest not-exhausted tier; once a checked step is found, finish the current deterministic quantum and choose among checked steps found there. All lower tiers must already be exhausted/soundly excluded at this revision. No need to enumerate all same-tier proofs or promise the globally simplest proof. If a tier is interrupted, do not claim a simpler-tier exhaustion.

Analyze competes across all eligible tiers, collecting up to four checked steps during a fixed 4,096-unit selection window; stop the window early if all jobs exhausted. Choose once the window ends or four steps are available. If a budget interrupts a window, accept a fully checked candidate only if it can still complete controller acceptance before the deadline; label selection budget-limited. A run with no checked candidate and unfinished jobs has incomplete logical coverage, not stall.

Detector estimate inputs are current domain/support counts, bivalue/trivalue counts, graph density, invalidated scopes and already available ALS/tuple counts. No new expensive graph is built solely to estimate its utility. Initial frozen integers are `hit=1`, `gain=1`, `cost=max(1, declared estimated units)`; measured offline tables may replace these with a new scheduler version. Rank by `hit*gain/cost`, comparing integer cross-products; clamp factors to 1…1024. Scores have no correctness meaning.

Fairness is independent of scores: every fourth quantum runs the oldest pending/in-progress eligible job by last-service logical ticket, with canonical tie breaks. Other quanta use estimated priority. Exhausted/excluded jobs leave the queue. At a fixed revision with N jobs and no new progress every eligible job receives a quantum within at most 4N selections, assuming budget remains. Explain fairness applies within the active tier; if it changes the board, revalidate all jobs and begin again. Finite monotone state changes prevent endless useful churn; timeout can still interrupt a tier. A zero score never excludes a job. Safe prefilters prove a necessary premise absent (e.g. fewer than three bivalue cells for XY-Wing) and record watched dependencies. Low estimated payoff is not safe filtering.

Explain step tie key is `(tier, assumptionDepth, branchCount, linkCount, nodeCount, techniqueId, sortedEffects, canonicalProof)`. Analyze uses proposed utility `16*placements + removals + 8*newSingles`, then lower proof complexity and the same canonical tie key. Count distinct removals; newly enabled singles are counted without being silently placed. Domain-log sums are diagnostic only; no probability/entropy assertion. These weights are explicit hypotheses, not established difficulty ratings.

Analyze rollout is an opt-in benchmark flag initially **off in the proposed release default**. Compare at most four already checked candidates in independent copies. After each candidate use only tiers 0–1, at most 16 subsequent checked productive steps, and a total rollout allowance `min(8192, floor(0.10 * remainingWorkUnits))`. Divide that allowance equally among candidates in canonical order; include copying, discovery, checking and scoring. Never use elapsed speed to allocate branch work. No value guesses, exact calls or conditional techniques in rollout. Recheck only the chosen first step on the real revision; discard every rollout board and proof. Cache no speculative facts into the primary run. Benchmark rollout before enabling it by default; deeper beam search is outside this implementation plan.

Reproducibility promise: same problem, options (including work/proof caps), versions and completed deterministic work gives the same path independent of machine timing and task slicing. Wall deadlines may produce different valid prefixes and prevent a later finding. Performance learning is offline/versioned; no online timing/history or persistent model changes Explain ordering.

## 7. Exact verification and evidence

```ts
interface ExactStats { nodes: number; backtracks: number; maxDepth: number }
type CountProof =
  | { kind: "duplicate-givens"; constraintId: ConstraintId;
      symbol: SymbolId; cells: readonly CellId[] }
  | { kind: "root-exhausted"; key: RunKey; method: VersionId;
      stats: ExactStats; frontierEmpty: true };
type ExactEvent = { kind: "work"; units: number; stats: ExactStats } |
  { kind: "witness"; values: readonly SymbolId[];
    decisions: readonly Literal[]; stats: ExactStats } |
  { kind: "exhausted"; stats: ExactStats } |
  { kind: "cap-reached"; stats: ExactStats };
interface ExactInitializationReservation { workUnits: number; workspaceBytes: number }
exactInitializationReservation(problem: EngineProblem, assembly: Assembly): ExactInitializationReservation;
exactSteps(problem: EngineProblem, assembly: Assembly): Generator<ExactEvent, void, void>;
type CountEvidence =
  | { kind: "unknown"; witnesses: readonly (readonly SymbolId[])[]; lowerBound: 0 | 1 }
  | { kind: "zero"; proof: CountProof; evidenceId: string }
  | { kind: "unique"; witness: readonly SymbolId[]; evidenceId: string;
      proof: Extract<CountProof, {kind: "root-exhausted"}>; rootExhausted: true }
  | { kind: "multiple"; witnesses: readonly [readonly SymbolId[], readonly SymbolId[]]; lowerBound: 2 };
type HumanStatus = "not-started" | "solved" | "stalled-within-profile" |
  "incomplete" | "contradiction" | "invalidated";
type Quality = "perfect-verified" | "not-established" | "not-applicable" | "inconsistent";
isWitness(problem: EngineProblem, assembly: Assembly, values: unknown): boolean;
interface QualityContext {
  run: RunKey; assembly: Assembly;
  initialView: ReadView; acceptedView: ReadView;
}
deriveQuality(snapshot: SolverSnapshot, human: HumanStatus,
  accepted: readonly CheckedStep[], count: CountEvidence, usedFallback: boolean,
  context: QualityContext): Quality;
interface EvidenceContext extends QualityContext {
  snapshot: SolverSnapshot; accepted: readonly CheckedStep[]; human: HumanStatus;
  activeExactRun: RunKey | null; phase: "human" | "exact" | "terminal";
}
interface EvidenceMerge { count: CountEvidence; human: HumanStatus; diagnostics: readonly string[] }
mergeEvidence(previous: CountEvidence, incoming: CountEvidence,
  context: EvidenceContext): EvidenceMerge;
isAcceptedPath(initialView: ReadView, acceptedView: ReadView,
  steps: readonly CheckedStep[]): boolean;
```

Implementation refinement D069: quality requires explicit operation identity and authentic accepted-path context. An entirely unconditional prefix replayed in a conditional operation still cannot qualify for Perfect. Candidate ownership validates the exact original-root anchor and accepted step identities, including unchanged-revision proof caches; checking a proposal alone is not acceptance. Keep this validation linear in bundle count without replaying/copying all historical candidate maps. Validate the final board with the assembled complete rules. Evidence merging additionally receives the explicitly active primary exact RunKey/phase; matching problem semantics alone does not authorize exhaustion. Admitted count objects have local private authority; serialized lookalikes must be revalidated during the active exact phase. The caller retains the original registered module instances, authentic root-only initial view and accepted bundle sequence. Store returned human/count state and diagnostics together: historical count objects do not override a later inconsistency.

Runtime `original-dfs@1`: explicit resumable MRV stack, lowest-cell tie and ascending symbol values. Initialize fresh full domains from original clues and declared rules. Classic exact propagation recomputes legal values, naked/hidden singles; use neither human subsets/chains nor human candidate buffers. Additional modules may supply sound pruning, but any pruning must be verified and retain complete search alternatives. Unknown complete-check semantics block assembly. Count only distinct fully checked assignments; a human witness supplies existence but is not pre-seeded into the exact counter.

Exact setup uses `exactInitializationReservation` to bound descriptors/cardinalities before canonical traversal. The caller reserves it before constructing the iterator, checks deadlines before/after finite synchronous setup and charges the first emitted setup work once (nodes=0). The reservation includes one caller preflight and one internal preflight, copies, peers and maximum frontier; additional calls need additional accounting. Subsequent enumeration yields bounded operations. This establishes accounted limits, not measured browser latency or heap usage. T26 must measure setup and evidence validation as well as enumeration.

Zero/unique requires an explicit root-exhausted event, except a checked duplicate-givens contradiction. One witness with an unfinished frontier remains unknown with lower bound one; two distinct valid witnesses prove at least two. Generator termination, deadline, node limit or missing terminal packet never means root exhaustion. A valid full input is directly checked but receives no Perfect badge. Exhaustion is tested process evidence bound to RunKey/method/frontier statistics, not a portable mathematical certificate.

Primary phases are normalize/assemble → human → exact. To avoid broad discovery consuming every opportunity to classify, propose a **70% human ceiling** of total time and deterministic work units; reserve the remaining 30% for exact checking. The human time ceiling includes startup/normalization: at worker start its remaining human allowance is max(0, remainingMs - 0.30*timeMs), rechecked against the main deadline. Proof-check/transport wait also consumes this allowance. Start exact earlier on logical completion, stall or resource interruption. Unused human budget is available to exact; unused exact time does not resume the human pass. If human hits its ceiling, record incomplete coverage and an explicit fallback boundary `logical-budget` before a search-assisted board, never a stall claim. If total deadline already passed, do not start exact. Conditional operations use their own user-selected total budget for logical work only and cannot update count evidence. This phase split is a benchmark hypothesis to compare with 50/50 and sequential-unreserved policies.

Exact counting after a fully checked logical completion does not mark the logical path search-assisted. Otherwise the first compatible exact witness can supply a separately labeled completion after `search-start` with reason `profile-stall`, `logical-budget` or `proof-limit`; summarize successful decision literals and failed-branch totals. Retain the real logical prefix; exact propagation is still search-assisted. A contradictory human path goes to diagnostic quarantine, not a claimed compatible completion.

Evidence merging revalidates witnesses with complete semantics, preserves checked witnesses monotonically and detects conflicts with the accepted logical state. Discard incompatible exhaustion/Perfect claims; keep independently valid witnesses and an engine-inconsistency diagnostic. Never resolve contradictory engines by trusting the higher score. A main-thread checker verifies logical proofs and witnesses; root exhaustion is accepted only from a valid active exact run, not replayed as a logic primitive.

## 8. Bounded worker transport and atomic acceptance

```ts
interface Limits {
  timeMs: number; workUnits: number; exactNodes: number;
  stepNodes: number; runNodes: number; proofBytes: number;
  stepBytes: number; batchBytes: number; inFlightBatches: number;
  workspaceBytes: number;
}
interface Stats { workUnits: number; exactNodes: number; steps: number; elapsedMs: number }
interface ProofHeader {
  stepId: number; state: StateKey; technique: VersionId;
  effects: readonly Effect[]; roots: readonly NodeId[];
  imports: readonly NodeId[]; pattern: Json;
  nodeCount: number; byteCount: number; chunkCount: number;
}
type ToWorker = { type: "start"; protocol: 2; key: RunKey;
  snapshot: SolverSnapshot; limits: Limits; remainingMs: number;
  conditionalPrefix: readonly DeductionProposal[] | null;
  uniqueEvidence: CountEvidence | null } |
  { type: "ack"; protocol: 2; key: RunKey; batchSeq: number } |
  { type: "accepted"; protocol: 2; key: RunKey; stepId: number; revision: number } |
  { type: "stop-human"; protocol: 2; key: RunKey; acceptedRevision: number };
type WorkerBody =
  | { type: "stats"; phase: "validating" | "human" | "exact"; stats: Stats }
  | { type: "proof-begin"; header: ProofHeader }
  | { type: "proof-chunk"; batchSeq: number; stepId: number; chunk: number; bytes: Uint8Array }
  | { type: "proof-end"; stepId: number }
  | { type: "human-stopped"; acceptedRevision: number; reason: "human-limit" }
  | { type: "evidence"; count: CountEvidence; stats: Stats }
  | { type: "ledger-chunk"; ledgerId: number; chunk: number; entries: Ledger }
  | { type: "logical-stop"; human: HumanStatus; ledgerId: number; chunkCount: number }
  | { type: "search"; reason: "profile-stall" | "logical-budget" | "proof-limit";
      witness: readonly SymbolId[] | null; decisions: readonly Literal[]; stats: ExactStats }
  | { type: "terminal"; outcome: "complete" | "timeout" | "resource-limit" | "error";
      code?: string; stats: Stats };
type FromWorker = { protocol: 2; key: RunKey; seq: number } & WorkerBody;
```

One dedicated module worker per active operation; at most one active worker per application, so conditional analysis begins only after the primary run terminalizes. Create with Vite's static `new Worker(new URL('../workers/solver.worker.ts', import.meta.url), { type: 'module' })` in the app adapter. No synchronous UI-thread solver fallback on startup error. See [Vite worker documentation](https://vite.dev/guide/features.html#web-workers).

Primary request carries no conditional prefix/evidence. Conditional request carries only the already accepted, budget-bounded prefix and matching unique evidence; worker rechecks them. Their validation and transport count against its new limit. Runtime checks compare every RunKey field. `optionsKey` includes all limits, phase share, mode, rollout flag and profile parameters. Wrong-key/post-terminal messages are ignored. Active malformed messages cause protocol error and preserve prior accepted evidence.

Wire encoding is deterministic UTF-8 JSON for proof bytes (bounded integer IDs, no cycles or arbitrary objects), split into <=64 KiB chunks transferable as ArrayBuffers. Decode incrementally, maintaining only the incomplete code point/token tail; a single node/header is <=16 KiB. Header counts include pattern data and all newly transmitted nodes. Header/dependency arrays must fit the control-packet cap of 32 KiB; otherwise resource interruption before sending. The 1 MiB step limit includes header plus encoded nodes. Large tables must use bounded tree nodes; no giant synchronous JSON parse/stringify. Worker and controller both charge bytes before allocation. Counts are checked, not trusted preallocation sizes.

One proof step may be pending. Stream node IDs in topological order; imports can reference accepted prefix nodes or earlier nodes in the pending step. `seq` covers every worker message, begins at 1 and must be contiguous. A duplicated old seq is ignored; a gap/out-of-order active message is protocol error (Worker delivery is ordered; no retransmission system needed). `batchSeq` increases over proof chunks; each ACK releases only that batch's transport credit. Maximum two unacknowledged batches. ACK after bounded decode/validation into staging, **not** after the entire step commits, avoiding a deadlock on proofs spanning more than two chunks. Staging is bounded by step bytes/nodes. Reject oversized declarations, excess chunks, duplicate node IDs and cumulative run-budget overflow before growth.

Worker checks a proposal, then sends it and waits for `accepted` before committing its next candidate revision or discovering dependent steps. A `stop-human` control also releases that wait without accepting a staged step; it does not terminate the run. Main checker validates incrementally in <=4 ms target tasks. At `proof-end`, require all declared chunks/nodes/roots and a checked complete effect set. Immediately before acceptance, recheck active key, deadline and beforeRevision; then atomically replace candidate state, append complete proof and derive evidence in one synchronous short commit. Send `accepted` only afterward. No half-step effects or partial proof text enter the accepted trace. Retained immutable nodes may be shared in memory; do not duplicate the whole trace on progress.

For the primary human-phase ceiling, the controller has a separate phase timer and checks the phase deadline before every proof commit. Accepting a natural logical-stop clears that timer; an accepted complete logical board also retains its proved completion status. At the ceiling it freezes the accepted logical prefix, discards pending proof staging, marks human work incomplete and sends `stop-human` with acceptedRevision, keeping the overall request active for exact evidence. All subsequent logical proof packets for that run are ignored (their envelope sequence still advances); they cannot alter the frozen prefix. Worker processes already-sent accepted messages before stop-human because the controller uses the same ordered port, then reconciles acceptedRevision, abandons detector cursors/staged effects and emits `human-stopped`. A mismatch is protocol error. Only after this barrier may it start exact if it was waiting on a proof. If the worker locally reaches its human deadline first, it waits for controller phase reconciliation instead of guessing whether an in-flight proof was accepted. If it already ended the human phase naturally and entered exact, stop-human is an idempotent reconciliation with no effect on exact enumeration. Natural logical-stop messages received after the phase freeze cannot upgrade incomplete to stall/solved unless the accepted prefix itself already proves completion. Total deadline/Cancel still terminalizes immediately without acknowledgement. Conditional operations have no reserved exact phase or stop-human timer.

Stats are advisory and coalesced: at most one pending stats tick at 100 ms, no unbounded posts while waiting for ACK/acceptance. Evidence milestones have a fixed finite count (maximum two witnesses plus exhaustion), and all control packets are bounded. Ledger reports use `ledger-chunk` messages (at most 16 entries/chunk and 32 KiB encoded), one monotone ledgerId per logical stop, <=256 total entries and <=128 KiB total encoded metadata. `logical-stop` requires all chunks 0 through chunkCount-1 in order; partial ledger delivery cannot establish stall. Store a single pending ledger, discard it on termination, and keep the previous accepted human status. Ledger rows summarize the complete descriptor cursor and scope exhaustion, not a selected subset of searched patterns; summaries cannot substitute for checked steps. Sender cannot evade byte limits by using evidence/search/ledger/control packets; enforce a 32 KiB per control packet cap and bounded aggregate metadata. An unexpectedly oversized active packet fails immediately.

Terminal completion can arrive only with no pending step; controller rejects an early success terminal. At a local worker deadline with a pending step, terminal timeout may discard that step; it cannot certify completion. Main cancellation/watchdog may terminate at any point without worker ACK. On Cancel/navigation/disposal/error/deadline: synchronously mark terminal and detach active identity, discard staging and scheduled checks, keep the last accepted prefix/count, clear timers/listeners, then terminate worker. Any later callback sees inactive identity. Check deadline before accepting every event and again before an atomic proof commit; exact ties favor timeout. Accepted evidence remains valid on subsequent Cancel/timeout. A completed result makes Cancel unavailable.

Main click time defines the total deadline; `remainingMs` subtracts startup/send delay, worker sets a local deadline rather than comparing cross-realm clocks. Worker task slices target <=8 ms, main checking <=4 ms, and all phases include cooperative deadline checks. Termination is the hard responsiveness mechanism; never rely on a worker flush. Browser suspension can delay timers; the first resumed callback checks elapsed time before accepting. These lifecycle semantics follow the [HTML worker termination standard](https://html.spec.whatwg.org/multipage/workers.html#dom-worker-terminate); numeric latency targets require measurement.

## 9. Limits, persistence and benchmark decision gate

Proposed default profile, visible under Advanced limits: total time 10 s (integer 1–120); 2,000,000 work units (10,000–20,000,000); exact-node cap 500,000 (1,000–5,000,000); 4,096 proof nodes/step (256–16,384); 65,536 retained nodes/run (4,096–262,144); 1 MiB/step (64 KiB–2 MiB); 8 MiB retained encoded proof/run (1–32 MiB). Inputs must be integral and finite; step limits cannot exceed run limits. Defaults/ranges are **unmeasured engineering recommendations**. Display configured structural family limits and actual interruption reason. A higher time limit does not silently increase proof/work caps; explain this beside Advanced limits.

Fixed protocol constraints: 64 KiB chunks, two outstanding chunks, 32 KiB control packets, 16 KiB nodes. Proposed engine workspace ceiling is 64 MiB of explicitly accounted buffers/index entries, plus the bounded proof store. This is not a browser heap guarantee: JS objects, structured cloning and rendering cost more than encoded bytes. Require peak heap measurements; use compact representations and accounted entry limits. Evict rebuildable caches by deterministic key order; if necessary non-evictable state cannot fit, stop the detector with `workspace-limit`, keep accepted evidence and use remaining exact budget. No silent proof truncation, lossy retention or emergency IndexedDB spill.

One memory-only workspace retains the input/editor history, primary result, and at most one conditional result. Primary rerun discards old primary/conditional graphs; input edits discard both. Conditional rerun replaces only the previous conditional result, retaining the primary. Navigation cancels active work but retains accepted data. Reload drops all solver state/preferences. Primary and conditional proof caps apply separately, so max retained analysis data is twice the selected per-run caps; shared immutable prefix is accounted once physically and in each operation's logical budget. No settings/library/schema migration, new backup fields, sessionStorage or hidden localStorage. D058 appearance remains durable through existing settings.

Benchmark on production Chromium on the user's PC and separately 4× CPU throttle; record CPU/RAM/OS/browser/Node/power mode, engine/checker/profile commits, corpus hashes and licenses. Use five cold starts and >=30 warm trials per representative case, frozen inputs, randomized policy trial order and identical budgets. Include all coverage families, unique sparse/hard, nonduplicate zero, two-solution, empty/full, dense graph/ALS, long proof, near-limit tables, and adversarial misleading-score cases. Use independently labeled training/calibration and held-out partitions; no fixture migrates across partitions unnoticed. Keep alternate proofs, deliberate clue variants and known transformations of one source puzzle in the same partition. Record source-group IDs as well as normalized input hashes, and report case counts separately from distinct original-puzzle and source-group counts.

Report exact correctness and named discovery coverage first; then logical solves, fallback reasons, count outcomes, p50/p95/max total/first-witness/count latency, detector units, wasted scans, cache hits, scheduler/checker/rollout overhead, graph/proof nodes, encoded and peak heap bytes, main-thread long tasks, cancellation/deadline latency and 100-run cleanup. Retain unfinished trials in outcome and deadline metrics; label completion-conditioned latency separately instead of silently dropping interrupted runs. Compare fixed full scans, event fixed priorities, scored event scheduling, Analyze selection and rollout on/off; compare human time shares 50/70/unreserved. Completed work-limited traces must be deterministic; time-limited prefixes may differ. Never average away wrong eliminations or false uniqueness.

Revised release targets: zero soundness/false evidence failures; >=one independent acceptance example per enabled named bound class; honest incomplete outcomes for deliberate stress cases. Retain proposed foreground Cancel p95 <=100 ms/max <=250 ms, main deadline overshoot <=250 ms and no solver main-thread task >50 ms. Measure easy p95 <=2 s and hard count p95 <=10 s as performance targets, **not a requirement that every advanced family solve every fixture at default limits**. Test coverage fixtures also with deterministic generous caps to separate support from speed. If unmet, record results, tune and rerun affected benchmarks, update defaults/versioned profiles and decisions for review; never reduce the family catalogue or weaken proof checking to pass. No speedup, optimum path or universal logical completeness claim is established by this design.

## 10. Review disposition

No unresolved product question blocks this completed proposal. Approval should cover the bounded coverage matrix, memory-only workspace, separate conditional action, phase reserve, scheduling policies and adjustable resource controls. Remaining empirical questions are the best phase share, cost tables, default budgets and whether rollout earns its overhead. They have explicit benchmark gates and do not justify implementing before design approval. Unbounded generalizations are explicitly outside the finite profile; all requested families retain planned implementation/acceptance tasks.
