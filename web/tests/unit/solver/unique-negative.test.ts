import {expect,test} from "vitest";
import u01 from "../../solver/fixtures/U01.json";
import u04 from "../../solver/fixtures/U04.json";
import u05 from "../../solver/fixtures/U05.json";
import {uniqueHarness,uniqueLimits} from "../../solver/unique-harness";
import {independentNamedUnique,independentUniqueCertificate,independentUniquePlan,type UniqueSeed} from "../../solver/unique-independent";
import {independentTemplates,independentTemplateCertificate} from "../../solver/templates-independent";
import {checkProposal,verifyCertificate} from "../../../src/solver/proof/checker";
import {retainedProof,commitChecked,retainCheckedFacts,initialize} from "../../../src/solver/state/candidates";
import {getTechniques} from "../../../src/solver/techniques/registry";
import {revokeUniqueParent} from "../../../src/solver/evidence";
import {compileUnique} from "../../../src/solver/techniques/unique-compiler";
import {mockRuleRegistry} from "../../solver/mock-rules";
import {oracle} from "../../solver/oracle";
import {IndexWorkspace} from "../../../src/solver/indexes/workspace";
import type {DeductionProposal} from "../../../src/solver/proof/types";
import type {ReadView} from "../../../src/solver/state/types";
import {NakedSingles} from "../../../src/solver/techniques/singles";
const seed=u01.fixtures[0] as UniqueSeed;
const context=(h:ReturnType<typeof uniqueHarness>)=>({view:h.operation.view,retained:retainedProof(h.operation.view),policy:"unique-only" as const,
 uniqueAuthority:h.operation.authority,uniqueEvidenceId:h.parent.evidenceId,limits:uniqueLimits});

function ordinaryTemplate(view: ReadView): DeductionProposal {
  for (let symbol = 1; symbol <= 9; symbol++) {
    const fixture = {
      ...seed,
      preState: { values: [...view.state.values], domains: [...view.state.domains] },
      expectedPattern: { mode: "single", symbols: [symbol] },
      alias: "Per-digit templates",
    };
    if (independentTemplates(fixture as any).effects.length)
      return independentTemplateCertificate(fixture as any, view);
  }
  throw Error("missing-ordinary-template-control");
}

function ordinarySingleCache(view: ReadView): DeductionProposal {
  for (const event of new NakedSingles().discover(view)) {
    if (event.kind !== "proposal") continue;
    const full = event.proposal, node = full.proof.nodes[0];
    return { ...full, effects: [], proof: { ...full.proof, nodes: [node], roots: [node.id], imports: [...node.premises] } };
  }
  throw Error("missing-singleton-cache-control");
}

test("unknown uniqueness kinds cannot bypass the closed named grammar", () => {
  const h = uniqueHarness(seed);
  try {
    const proposal = independentNamedUnique(h.operation.view, seed, h.parent.evidenceId, seed.expectedEffects[0] as any);
    const changed = structuredClone(proposal) as any;
    changed.technique = "u02@1";
    changed.pattern.geometry.row = "U02";
    changed.pattern.geometry.kind = "unregistered-rectangle";
    delete changed.pattern.geometry.alias;
    expect([...checkProposal(changed, context(h))].at(-1)?.kind).toBe("rejected");
    const extra = structuredClone(proposal) as any;
    extra.pattern.geometry.unregistered = true;
    expect([...checkProposal(extra, context(h))].at(-1)?.kind).toBe("rejected");
  } finally { h.operation.dispose(); }
}, 30000);

test.each(["unconditional", "discharged"] as const)(
  "%s checks with omitted authority remain bound to the conditional owner lifetime",
  policy => {
    const h = uniqueHarness(seed), view = h.operation.view;
    try {
      const proposal = ordinaryTemplate(view);
      const omitted = { view, retained: retainedProof(view), policy, uniqueEvidenceId: null, limits: uniqueLimits };
      const terminal = [...checkProposal(proposal, omitted)].at(-1);
      expect(terminal?.kind).toBe("checked");
      const committed = terminal?.kind === "checked" ? commitChecked(view, terminal.step).view : undefined;
      const cache = [...checkProposal(ordinarySingleCache(committed!), {
        ...omitted, view: committed!, retained: retainedProof(committed!),
      })].at(-1);
      expect(cache?.kind).toBe("checked");
      h.operation.dispose();
      const after = [...checkProposal(proposal, omitted)].at(-1);
      expect.soft(after?.kind).toBe("rejected");
      if (after?.kind === "rejected") expect(after.code).toBe("revoked-unique-authority");
      if (terminal?.kind === "checked") {
        expect(terminal.step.consequences.every(c => !c.conditional)).toBe(true);
        expect.soft(() => commitChecked(view, terminal.step)).toThrow("revoked-unique-authority");
        if (cache?.kind === "checked")
          expect.soft(() => retainCheckedFacts(committed!, cache.step)).toThrow("revoked-unique-authority");
      }
    } finally { h.operation.dispose(); }
  },
  30000,
);

test("same-label independent and primary owners keep ordinary semantics without borrowing a conditional lifetime", () => {
  const h = uniqueHarness(seed), conditional = h.operation.view;
  try {
    let sibling = initialize(h.operation.assembly, conditional.state.key.branch);
    for (const original of h.operation.prefix) {
      const proposal = { ...original, state: sibling.state.key, proof: { ...original.proof, state: sibling.state.key } };
      const terminal = [...checkProposal(proposal, {
        view: sibling, retained: retainedProof(sibling), policy: "discharged", uniqueEvidenceId: null, limits: uniqueLimits,
      })].at(-1);
      expect(terminal?.kind).toBe("checked");
      if (terminal?.kind === "checked") sibling = commitChecked(sibling, terminal.step).view;
    }
    expect(sibling.state).toEqual(conditional.state);
    const ordinaryCheck = (view: ReadView) => [...checkProposal(ordinaryTemplate(view), {
      view, retained: retainedProof(view), policy: "unconditional", uniqueEvidenceId: null, limits: uniqueLimits,
    })].at(-1);
    const bound = ordinaryCheck(conditional), unbound = ordinaryCheck(sibling);
    const primary = h.context.acceptedView, primaryStep = ordinaryCheck(primary);
    expect(bound?.kind).toBe("checked");
    expect(unbound?.kind).toBe("checked");
    expect(primaryStep?.kind).toBe("checked");
    if (bound?.kind === "checked" && unbound?.kind === "checked" && primaryStep?.kind === "checked") {
      const conditionalAfter = commitChecked(conditional, bound.step).view;
      expect(() => commitChecked(conditional, unbound.step)).toThrow("missing-unique-authority");
      expect(() => retainCheckedFacts(conditionalAfter, unbound.step)).toThrow("missing-unique-authority");
      expect(() => commitChecked(sibling, bound.step)).toThrow("revoked-unique-authority");
      h.operation.dispose();
      for (const [view, step] of [[sibling, unbound.step], [primary, primaryStep.step]] as const) {
        const after = commitChecked(view, step).view;
        const cache = [...checkProposal(ordinarySingleCache(after), {
          view: after, retained: retainedProof(after), policy: "unconditional", uniqueEvidenceId: null, limits: uniqueLimits,
        })].at(-1);
        expect(cache?.kind).toBe("checked");
        if (cache?.kind === "checked") expect(() => retainCheckedFacts(after, cache.step)).not.toThrow();
        expect(ordinaryCheck(view)?.kind).toBe("checked");
      }
    }
  } finally { h.operation.dispose(); }
}, 30000);

test("forged authority, missing complete sources and altered trade geometry reject",()=>{
 const h=uniqueHarness(seed);
 try {
  const proposal=independentNamedUnique(h.operation.view,seed,h.parent.evidenceId,seed.expectedEffects[0] as any);
  const ctx=context(h);
  for(const authority of [undefined,structuredClone(h.operation.authority),{}])
   expect([...checkProposal(proposal,{...ctx,uniqueAuthority:authority as any})].at(-1)?.kind).toBe("rejected");
  expect([...checkProposal(proposal,{...ctx,view:initialize(h.operation.assembly,h.operation.view.state.key.branch)})].at(-1)?.kind).toBe("rejected");
  const mutations:((p:any)=>void)[]=[
   p=>{p.proof.nodes.find((n:any)=>n.rule==="unique-transform@1").conclusion={kind:"false"};},
   p=>{p.proof.nodes.find((n:any)=>n.rule==="unique-transform@1").parameters.coreMasks[0]=511;},
   p=>{p.proof.nodes.find((n:any)=>n.rule==="unique-transform@1").parameters.cells[0]=80;},
   p=>{p.proof.nodes.find((n:any)=>n.rule==="unique-transform@1").parameters.evidenceId="matching-label-is-not-authority";},
   p=>{p.proof.nodes.find((n:any)=>n.rule==="unique-transform@1").premises.pop();},
   p=>{p.pattern.geometry.guardians.pop();},p=>{p.pattern.geometry.alias="invented unique family";},
   p=>{p.proof.roots.pop();},p=>{p.effects[0].symbol=9;},
  ];
  for(const mutate of mutations){const changed=structuredClone(proposal);mutate(changed);expect([...checkProposal(changed,ctx)].at(-1)?.kind).toBe("rejected");}
  const descriptor=getTechniques("classic-conditional@1").find(d=>d.id==="u01@1")!;
  expect([...descriptor.discover(h.operation.view,{workspace:h.workspace,limits:uniqueLimits})]).toEqual([{kind:"disabled",reason:"missing-unique-authority"}]);
 }finally{h.operation.dispose();}
},30000);

test("checked conditional transactions cannot commit or retain after revocation",()=>{
 const h=uniqueHarness(seed),view=h.operation.view;
 try {
  const proposal=independentNamedUnique(view,seed,h.parent.evidenceId,seed.expectedEffects[0] as any);
  const terminal=[...checkProposal(proposal,context(h))].at(-1);expect(terminal?.kind).toBe("checked");
  revokeUniqueParent(h.parent);
  if(terminal?.kind==="checked") {
   expect(()=>commitChecked(view,terminal.step)).toThrow("revoked-unique-authority");
   expect(()=>retainCheckedFacts(view,terminal.step)).toThrow("revoked-unique-authority");
  }
 }finally{h.operation.dispose();}
},30000);

test("unconditional displayed roots cannot publish an unused conditional intermediate after revocation",()=>{
 const h=uniqueHarness(seed),view=h.operation.view;
 try {
  let ordinary:DeductionProposal|undefined;
  for(let symbol=1;symbol<=9&&!ordinary;symbol++) {
   const fixture={...seed,preState:{values:[...view.state.values],domains:[...view.state.domains]},expectedPattern:{mode:"single",symbols:[symbol]},alias:"Per-digit templates"};
   if(independentTemplates(fixture as any).effects.length)ordinary=independentTemplateCertificate(fixture as any,view);
  }
  expect(ordinary).toBeDefined();
  const unique=independentUniqueCertificate(view,seed,h.parent.evidenceId),offset=ordinary!.proof.nodes.at(-1)!.id+1-unique.proof.nodes[0].id;
  const ids=new Set(unique.proof.nodes.map(n=>n.id));
  const nodes=unique.proof.nodes.map(n=>({...n,id:n.id+offset,premises:n.premises.map(id=>ids.has(id)?id+offset:id)}));
  const proposal={...ordinary!,proof:{...ordinary!.proof,nodes:[...ordinary!.proof.nodes,...nodes],imports:[...new Set([...ordinary!.proof.imports,...unique.proof.imports])].sort((a,b)=>a-b)}};
  expect([...checkProposal(proposal,context(h))].at(-1)).toEqual({kind:"rejected",code:"unused-proof-node"});
  const terminal=[...checkProposal(ordinary!,context(h))].at(-1);
  expect(terminal?.kind,JSON.stringify(terminal)).toBe("checked");
  if(terminal?.kind==="checked") {
   expect(terminal.step.consequences.every(c=>!c.conditional)).toBe(true);
   revokeUniqueParent(h.parent);
   expect(()=>commitChecked(view,terminal.step)).toThrow("revoked-unique-authority");
   expect(()=>retainCheckedFacts(view,terminal.step)).toThrow("revoked-unique-authority");
  }
 }finally{h.operation.dispose();}
},30000);

for(const [raw,alias] of [[u04.fixtures[0],"BUG"],[u05.fixtures[0],"Generalized BUG"]] as const)
 test(`${alias} is an admitted named alias`,()=>{
  const f=raw as UniqueSeed,h=uniqueHarness(f);
  try {const plan=independentUniquePlan(f,f.expectedEffects[0]);(plan.geometry as any).alias=alias;
   const proposal=compileUnique(h.operation.view,plan,f.expectedEffects[0] as any,h.operation.authority);
   expect([...checkProposal(proposal,context(h))].at(-1)?.kind).toBe("checked");
   expect([...checkProposal(proposal,{...context(h),limits:{...uniqueLimits,stepNodes:proposal.proof.nodes.length-1}})].at(-1)?.kind).toBe("rejected");
   const changed=structuredClone(proposal);(changed.pattern as any).geometry.guardians.pop();
   expect([...checkProposal(changed,context(h))].at(-1)?.kind).toBe("rejected");
  }finally{h.operation.dispose();}
 },30000);

test("affected mixed rules reject despite authentic uniqueness; disjoint rules preserve unchanged",()=>{
 const exact=oracle({givens:[...seed.givens].map(Number),limit:2,maxNodes:1_000_000}),values=exact.witnesses[0];
 const core=seed.expectedPattern.cells as number[];
 for(const affected of [true,false]) {
  const first=affected?core[0]:Array.from({length:81},(_,c)=>c).find(c=>!core.includes(c))!;
  const second=Array.from({length:81},(_,c)=>c).find(c=>c!==first&&!core.includes(c)&&values[c]!==values[first])!;
  const cells=values[first]<values[second]?[first,second]:[second,first];
  const h=uniqueHarness(seed,{constraints:[{id:"extra-order:0",type:"order@1",cells,parameters:{}}],modules:mockRuleRegistry});
  try {
   const proposal=independentNamedUnique(h.operation.view,seed,h.parent.evidenceId,seed.expectedEffects[0] as any);
   const terminal=[...checkProposal(proposal,context(h))].at(-1);
   if(affected)expect(terminal).toEqual({kind:"rejected",code:"unique-unsupported-rule-preservation"});
   else expect(terminal?.kind,JSON.stringify(terminal)).toBe("checked");
  }finally{h.operation.dispose();}
 }
},30000);
