import type { ReadView, Literal } from "../state/types";
import type { DeductionProposal } from "../proof/types";
import { proposedClause } from "../proof/builder";
import { ForcingProof, bit, type ForcingLink } from "./forcing-proof";
import type { FishComponent } from "./fish-grammar";
export { krakenTechniques } from "./kraken-runtime";

export interface KrakenPlan {
  readonly fish: FishComponent;
  readonly target: { readonly cell:number; readonly symbol:number };
  readonly finBranches: readonly { readonly fin:number; readonly assumption:Literal; readonly path:readonly ForcingLink[] }[];
  readonly incidence: readonly number[];
}
/** Expand every fin path, then the same checked incidence primitive as T10. */
export function compileKraken(view:ReadView,plan:KrakenPlan):DeductionProposal {
  const b=new ForcingProof(view),p=plan.fish,z=p.symbol,target=plan.target;
  const assumption=b.add("assume@1",[],proposedClause([{...target,positive:true}]));b.scope=[assumption];
  const fins=plan.finBranches.map(fin=>{
    const path=b.path(assumption,fin.path);
    const domain=b.add("domain-restrict@1",[view.state.domainFacts[fin.fin],path.end],{kind:"domain",cell:fin.fin,mask:view.state.domains[fin.fin]&~bit(z)});
    return {fin:fin.fin,path,domain};
  });
  const covers=p.bases.map(h=>({premise:b.fact({kind:"cover",cells:b.house(h),symbol:z}),coefficient:1}));
  const capacities=p.covers.map(h=>({premise:b.fact({kind:"all-different",cells:b.house(h)}),coefficient:1}));
  const domains=plan.incidence.flatMap((w,c)=>w<0&&!p.fins.includes(c)?[view.state.domainFacts[c]]:[]);
  const count=b.add("cover-count@1",[...covers.map(c=>c.premise),...capacities.map(c=>c.premise),...domains,...fins.map(f=>f.domain)],
    proposedClause([{...target,positive:false}]),{symbol:z,covers,capacities});
  const contradiction=b.add("contradiction@1",[assumption,count],{kind:"false"});b.scope=[];
  const root=b.add("discharge@1",[assumption,contradiction],proposedClause([{...target,positive:false}]));
  return b.finish("c24@1",{...plan,alias:"Kraken Fish",certificate:{assumption,fins,count,contradiction,root}},{kind:"remove",...target},root);
}
