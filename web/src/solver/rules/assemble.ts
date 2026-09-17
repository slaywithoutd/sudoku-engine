import { canonicalJson, canonicalProblem, ProblemInputError } from "../problem";
import { primitiveRegistry } from "../proof/primitives";
import { defined, unverified, type Unverified } from "../invariants";
import type { CellId, ConstraintId, ConstraintInstance, EngineProblem, Json } from "../problem";
import type {
  AllDifferent,
  AssemblyResult,
  Cover,
  FactId,
  Relation,
  RuleCapabilities,
  RuleIssue,
  RuleModule,
} from "./types";

const VERSION_ID = /^[a-z][a-z0-9-]*@[1-9]\d*$/;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Read-only facade whose private Map can never be reached through a cast. */
class ReadonlyMapView<K, V> implements ReadonlyMap<K, V> {
  readonly #store: Map<K, V>;

  constructor(entries: Iterable<readonly [K, V]>) {
    this.#store = new Map(entries);
    Object.freeze(this);
  }

  get size(): number {
    return this.#store.size;
  }

  get(key: K): V | undefined {
    return this.#store.get(key);
  }

  has(key: K): boolean {
    return this.#store.has(key);
  }

  entries(): MapIterator<[K, V]> {
    return this.#store.entries();
  }

  keys(): MapIterator<K> {
    return this.#store.keys();
  }

  values(): MapIterator<V> {
    return this.#store.values();
  }

  forEach(callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown): void {
    for (const [key, value] of this.#store) callbackfn.call(thisArg, value, key, this);
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries();
  }

  get [Symbol.toStringTag](): string {
    return "ReadonlyMap";
  }
}

function issue(code: string, constraintId: string, message: string): RuleIssue {
  return Object.freeze({ code, constraintId, message });
}

function failure(issues: readonly RuleIssue[]): AssemblyResult {
  return Object.freeze({ ok: false, issues: Object.freeze([...issues]) });
}

function hasRuleMethods(value: object): boolean {
  return [
    "normalize",
    "validate",
    "checkComplete",
    "capabilities",
    "propagate",
    "checkPrimitive",
  ].every((name) => typeof (value as Record<string, unknown>)[name] === "function");
}

/** Resolves rule strategies independently of caller registration order. */
export class RuleRegistry {
  readonly #modules: ReadonlyMapView<string, RuleModule>;
  readonly issues: readonly RuleIssue[];

  constructor(modules: readonly RuleModule[]) {
    const entries = new Map<string, RuleModule>();
    const issues: RuleIssue[] = [];
    for (const module of modules) {
      const claim = unverified(module);
      if (
        claim === null ||
        typeof claim !== "object" ||
        typeof claim.type !== "string" ||
        !VERSION_ID.test(claim.type) ||
        !hasRuleMethods(claim)
      ) {
        issues.push(
          issue("invalid-rule-module", "$registry", "registry contains an incomplete rule module"),
        );
        continue;
      }
      if (entries.has(module.type)) {
        issues.push(
          issue("duplicate-rule-type", "$registry", `duplicate rule type ${module.type}`),
        );
        continue;
      }
      entries.set(module.type, module);
    }
    this.#modules = new ReadonlyMapView(
      [...entries].sort(([left], [right]) => compareText(left, right)),
    );
    this.issues = Object.freeze(issues);
    Object.freeze(this);
  }

  get(type: string): RuleModule | undefined {
    return this.#modules.get(type);
  }
}

function inputIssue(error: unknown): RuleIssue {
  if (error instanceof ProblemInputError) return issue(error.code, "$problem", error.message);
  return issue(
    "invalid-problem",
    "$problem",
    error instanceof Error ? error.message : String(error),
  );
}

function normalizeRules(
  problem: EngineProblem,
  registry: RuleRegistry,
): AssemblyResult | EngineProblem {
  const normalized: ConstraintInstance[] = [];
  const issues: RuleIssue[] = [];
  for (const rule of problem.constraints) {
    const module = registry.get(rule.type);
    if (!module) {
      issues.push(issue("unsupported-rule", rule.id, `unsupported rule type ${rule.type}`));
      continue;
    }
    try {
      const next = module.normalize(rule);
      if (next.id !== rule.id || next.type !== rule.type)
        issues.push(
          issue("invalid-normalization", rule.id, "rule normalization changed its identity"),
        );
      else normalized.push(next);
    } catch (error) {
      issues.push(
        issue(
          "invalid-normalization",
          rule.id,
          error instanceof Error ? error.message : "rule normalization failed",
        ),
      );
    }
  }
  if (issues.length > 0) return failure(issues);
  try {
    return canonicalProblem({
      schema: problem.schema,
      cells: problem.cells,
      symbols: problem.symbols,
      givens: problem.givens,
      constraints: normalized,
    });
  } catch (error) {
    return failure([inputIssue(error)]);
  }
}

function bootstrapRoots(problem: EngineProblem): ReadonlyMapView<ConstraintId, FactId> {
  // T03 replaces these handles with facts. Reserving domain and clue handles now
  // keeps rule premise identities deterministic without claiming they are checked.
  let next = problem.cells.length + problem.givens.filter((given) => given !== 0).length;
  return new ReadonlyMapView(problem.constraints.map((rule) => [rule.id, next++] as const));
}

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index)) return false;
  return Reflect.ownKeys(value).every((key) => {
    if (key === "length") return true;
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key)) return false;
    const descriptor = defined(Object.getOwnPropertyDescriptor(value, key), "own-property");
    return Number(key) < value.length && descriptor.enumerable && "value" in descriptor;
  });
}

function validCells(cells: unknown, problem: EngineProblem): boolean {
  return (
    isDenseArray(cells) &&
    cells.length > 0 &&
    cells.every(
      (cell) =>
        typeof cell === "number" && Number.isSafeInteger(cell) && problem.cells.includes(cell),
    ) &&
    new Set(cells).size === cells.length
  );
}

function validPremise(premise: unknown, expected: FactId): boolean {
  return Number.isSafeInteger(premise) && premise === expected;
}

function isSymbol(symbol: unknown, problem: EngineProblem): boolean {
  return typeof symbol === "number" && problem.symbols.includes(symbol);
}

function capabilityIssue(rule: ConstraintInstance, message: string): RuleIssue {
  return issue("invalid-capability", rule.id, message);
}

/** Checks each capability list; ids are registered as they are seen so duplicates fail. */
function validateCapabilities(
  rule: ConstraintInstance,
  problem: EngineProblem,
  expectedPremise: FactId,
  capabilities: RuleCapabilities,
  usedIds: Set<string>,
): readonly RuleIssue[] {
  const claimed = unverified(capabilities);
  if (
    claimed === null ||
    typeof claimed !== "object" ||
    !isDenseArray(claimed.allDifferent) ||
    !isDenseArray(claimed.covers) ||
    !isDenseArray(claimed.relations) ||
    !isDenseArray(claimed.primitiveIds)
  )
    return [capabilityIssue(rule, "capability result is incomplete")];

  const registerId = (id: unknown): boolean => {
    if (typeof id !== "string" || id.length === 0 || usedIds.has(id)) return false;
    usedIds.add(id);
    return true;
  };
  const issues: RuleIssue[] = [];
  for (const capability of claimed.allDifferent) {
    if (
      !registerId(capability?.id) ||
      !validCells(capability?.cells, problem) ||
      !validPremise(capability?.premise, expectedPremise)
    )
      issues.push(capabilityIssue(rule, "all-different capability is malformed or duplicated"));
  }
  for (const capability of claimed.covers) {
    if (
      !registerId(capability?.id) ||
      !isSymbol(capability?.symbol, problem) ||
      !validCells(capability?.cells, problem) ||
      !validPremise(capability?.premise, expectedPremise)
    )
      issues.push(capabilityIssue(rule, "cover capability is malformed or duplicated"));
  }
  for (const capability of claimed.relations) {
    if (
      !registerId(capability?.id) ||
      !validCells(capability?.cells, problem) ||
      !validTuples(capability, problem) ||
      !validPremise(capability?.premise, expectedPremise)
    )
      issues.push(capabilityIssue(rule, "relation capability is malformed or duplicated"));
  }
  issues.push(...primitiveIdIssues(rule, capabilities.primitiveIds));
  return issues;
}

/** Every tuple is a dense array of problem symbols, one per relation cell. */
function validTuples(capability: Unverified<Relation>, problem: EngineProblem): boolean {
  return (
    isDenseArray(capability?.tuples) &&
    capability.tuples.every(
      (tuple) =>
        isDenseArray(tuple) &&
        tuple.length === (capability.cells as readonly unknown[]).length &&
        tuple.every((symbol) => isSymbol(symbol, problem)),
    )
  );
}

function primitiveIdIssues(rule: ConstraintInstance, ids: readonly string[]): RuleIssue[] {
  const malformed = ids.some(
    (primitive, index) =>
      typeof primitive !== "string" ||
      !VERSION_ID.test(primitive) ||
      ids.indexOf(primitive) !== index,
  );
  if (malformed)
    return [capabilityIssue(rule, "primitive IDs must be unique versioned identifiers")];
  const unsupported = ids.find((id) => !primitiveRegistry.has(id));
  if (unsupported === undefined) return [];
  return [
    issue(
      "unsupported-primitive",
      rule.id,
      `no checker is registered for primitive ${unsupported}`,
    ),
  ];
}

function freezeAllDifferent(capability: AllDifferent): AllDifferent {
  return Object.freeze({ ...capability, cells: Object.freeze([...capability.cells]) });
}

function freezeCover(capability: Cover): Cover {
  return Object.freeze({ ...capability, cells: Object.freeze([...capability.cells]) });
}

function freezeRelation(capability: Relation): Relation {
  return Object.freeze({
    ...capability,
    cells: Object.freeze([...capability.cells]),
    tuples: Object.freeze(capability.tuples.map((tuple) => Object.freeze([...tuple]))),
  });
}

function buildPeers(
  problem: EngineProblem,
  allDifferent: readonly AllDifferent[],
): readonly (readonly CellId[])[] {
  const peers = problem.cells.map(() => new Set<CellId>());
  for (const scope of allDifferent)
    for (const cell of scope.cells)
      for (const peer of scope.cells) if (cell !== peer) peers[cell].add(peer);
  return Object.freeze(
    peers.map((entries) => Object.freeze([...entries].sort((left, right) => left - right))),
  );
}

/** Coordinates normalization, validation, roots and immutable capability views. */
export class CapabilityAssembler {
  constructor(private readonly registry: RuleRegistry) {}

  assemble(input: EngineProblem): AssemblyResult {
    if (this.registry.issues.length > 0) return failure(this.registry.issues);
    const claim = unverified(input);
    if (
      claim === null ||
      typeof claim !== "object" ||
      !Object.hasOwn(claim, "key") ||
      typeof claim.key !== "string"
    )
      return failure([issue("missing-key", "$problem", "engine problem requires a canonical key")]);
    let canonical: EngineProblem;
    try {
      canonical = canonicalProblem(input);
    } catch (error) {
      return failure([inputIssue(error)]);
    }
    const normalized = normalizeRules(canonical, this.registry);
    if (!("schema" in normalized)) return normalized;
    const validationIssues = this.#validateRules(normalized);
    if (validationIssues.length > 0) return failure(validationIssues);
    const collected = this.#collectCapabilities(normalized);
    if (collected.issues.length > 0) return failure(collected.issues);
    const { modules, allDifferent, covers, relations } = collected;
    allDifferent.sort((left, right) => compareText(left.id, right.id));
    covers.sort((left, right) => compareText(left.id, right.id));
    relations.sort((left, right) => compareText(left.id, right.id));
    const moduleTypes = [...new Set(modules.map(([, module]) => module.type))].sort();
    const supportSignature = canonicalJson({
      primitiveIds: primitiveRegistry.ids,
      ruleTypes: moduleTypes,
    } as Json);
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        problem: normalized,
        modules: new ReadonlyMapView(modules),
        allDifferent: Object.freeze(allDifferent),
        covers: Object.freeze(covers),
        relations: Object.freeze(relations),
        peers: buildPeers(normalized, allDifferent),
        supportSignature,
      }),
    });
  }
  /** Every rule module validates its own instances; a throwing module is an issue, not a crash. */
  #validateRules(normalized: EngineProblem): RuleIssue[] {
    const validationIssues: RuleIssue[] = [];
    for (const rule of normalized.constraints) {
      const module = defined(this.registry.get(rule.type), "rule-module");
      try {
        validationIssues.push(...module.validate(normalized, rule));
      } catch (error) {
        validationIssues.push(
          issue(
            "rule-validation-failed",
            rule.id,
            error instanceof Error ? error.message : "rule validation failed",
          ),
        );
      }
    }
    return validationIssues;
  }
  /** Frozen capabilities of every rule, or the issues that reject the assembly. */
  #collectCapabilities(normalized: EngineProblem): CollectedCapabilities {
    const roots = bootstrapRoots(normalized);
    const collected: CollectedCapabilities = {
      modules: [],
      allDifferent: [],
      covers: [],
      relations: [],
      issues: [],
    };
    const usedCapabilityIds = new Set<string>();
    for (const rule of normalized.constraints) {
      const module = defined(this.registry.get(rule.type), "rule-module");
      collected.modules.push([rule.id, module]);
      try {
        const capabilities = module.capabilities(rule, { problem: normalized, roots });
        const issues = validateCapabilities(
          rule,
          normalized,
          defined(roots.get(rule.id), "rule-root"),
          capabilities,
          usedCapabilityIds,
        );
        collected.issues.push(...issues);
        if (issues.length === 0) {
          collected.allDifferent.push(...capabilities.allDifferent.map(freezeAllDifferent));
          collected.covers.push(...capabilities.covers.map(freezeCover));
          collected.relations.push(...capabilities.relations.map(freezeRelation));
        }
      } catch (error) {
        collected.issues.push(
          capabilityIssue(
            rule,
            error instanceof Error ? error.message : "capability assembly failed",
          ),
        );
      }
    }
    return collected;
  }
}

interface CollectedCapabilities {
  readonly modules: [ConstraintId, RuleModule][];
  readonly allDifferent: AllDifferent[];
  readonly covers: Cover[];
  readonly relations: Relation[];
  readonly issues: RuleIssue[];
}

/** Approved functional entry point over the cohesive registry/assembler objects. */
export function assemble(problem: EngineProblem, registry: readonly RuleModule[]): AssemblyResult {
  return new CapabilityAssembler(new RuleRegistry(registry)).assemble(problem);
}
