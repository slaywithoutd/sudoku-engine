import type { ReadView } from "../../src/solver/state/types";
import type { DeductionProposal } from "../../src/solver/proof/types";
import { fixtureView, originalCluePrefix, type TechniqueFixture } from "./acceptance";
import { checkProposal } from "../../src/solver/proof/checker";
import { commitChecked, retainedProof } from "../../src/solver/state/candidates";
import { getTechniques } from "../../src/solver/techniques/registry";
import { discoveryContext } from "./discovery-context";

const cache=new Map<string,{view:ReadView;prefix:readonly DeductionProposal[]}>();
/** Independently reconstruct the exact original-given peer domains. Only the
 * explicit C01 prefix may change values; it is admitted through the real checker. */
export function specializedState(f:TechniqueFixture&{requiredPrefixSteps?:readonly {cell:number;symbol:number}[]}) {
 const cached=cache.get(f.id);if(cached)return cached;
 if(!f.requiredPrefixSteps?.length) {
  const result={view:fixtureView(f),prefix:originalCluePrefix(f)};cache.set(f.id,result);return result;
 }
 const values=[...f.givens].map(Number),domains=values.map((v,c)=>v?2**(v-1):Array.from({length:9},(_,i)=>i+1).filter(s=>!values.some((x,q)=>x===s&&q!==c&&(Math.floor(c/9)===Math.floor(q/9)||c%9===q%9||Math.floor(c/27)===Math.floor(q/27)&&Math.floor(c%9/3)===Math.floor(q%9/3)))).reduce((n,s)=>n+2**(s-1),0));
 const before={...f,preState:{values,domains}},prefix=[...originalCluePrefix(before)];let view=fixtureView(before);
 for(const step of f.requiredPrefixSteps) {
  const cursor=getTechniques("classic-expanded@1").find(d=>d.id==="c01@1")!.discover(view,discoveryContext());let proposal;
  try{for(const e of cursor)if(e.kind==="proposal"&&e.proposal.effects.some(x=>x.kind==="place"&&x.cell===step.cell&&x.symbol===step.symbol)){proposal=e.proposal;break;}}finally{cursor.return();}
  if(!proposal)throw Error("missing-independent-singleton-prefix");let checked;
  for(const e of checkProposal(proposal,{view,retained:retainedProof(view),limits:discoveryContext().limits,policy:"unconditional",uniqueEvidenceId:null}))if(e.kind!=="work")checked=e;
  if(checked?.kind!=="checked")throw Error(JSON.stringify(checked));prefix.push(checked.step.proposal);view=commitChecked(view,checked.step).view;
 }
 if(JSON.stringify(view.state.values)!==JSON.stringify(f.preState.values)||JSON.stringify(view.state.domains)!==JSON.stringify(f.preState.domains))throw Error("independent-specialized-prefix-mismatch");
 const result={view,prefix};cache.set(f.id,result);return result;
}
