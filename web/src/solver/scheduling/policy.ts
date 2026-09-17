import type { CheckedStep } from "../proof/types";
import type { ReadView } from "../state/types";
import type { TechniqueDescriptor } from "../techniques/types";
import { type SchedulingLedger,type JobKey,compareJob,compareText } from "./ledger";
import { type PolicyId } from "./work";
import { stepFeatures,compareFeatures,type StepFeatures } from "./features";

export interface SchedulerPolicy {next(ledger:SchedulingLedger,view:ReadView):JobKey;choose(checked:readonly CheckedStep[]):CheckedStep}
const clamp=(n:number)=>Math.max(1,Math.min(1024,Number.isFinite(n)?Math.floor(n):1));
/** Frozen integer priorities are engineering hypotheses; tickets guarantee service independently. */
export class FairPolicy implements SchedulerPolicy {
  #view?:ReadView;#features=new WeakMap<CheckedStep,StepFeatures>();readonly #tiers:ReadonlyMap<string,number>;
  constructor(readonly id:PolicyId,techniques:readonly TechniqueDescriptor[],readonly mode:"explain"|"analyze"=id==="analyze-fair@1"?"analyze":"explain"){
    this.#tiers=new Map(techniques.map(d=>[d.id,d.tier]));
  }
  next(ledger:SchedulingLedger,view:ReadView):JobKey{
    if(this.#view!==view)this.#features=new WeakMap();this.#view=view;
    let jobs=[...ledger.active];if(!jobs.length)throw Error("no-pending-job");
    // Original rules drain before every family selection window.
    if(jobs.some(j=>j.tier===-1))jobs=jobs.filter(j=>j.tier===-1);
    else if(this.mode==="explain"){const tier=Math.min(...jobs.map(j=>j.tier));jobs=jobs.filter(j=>j.tier===tier);}
    const baseline=this.id==="fixed-scan@1"||this.id==="event-fixed@1";
    const oldest=!baseline&&(ledger.ticket+1)%4===0;
    jobs.sort((a,b)=>{
      if(oldest)return a.lastService-b.lastService||compareJob(a,b);
      if(baseline)return compareJob(a,b);
      const ae=a.estimate,be=b.estimate;
      return clamp(be.hit)*clamp(be.gain)*clamp(ae.cost)-clamp(ae.hit)*clamp(ae.gain)*clamp(be.cost)||compareJob(a,b);
    });
    return jobs[0].key;
  }
  choose(checked:readonly CheckedStep[]):CheckedStep{
    if(!checked.length||!this.#view)throw Error("no-checked-candidate");
    const scored=checked.map(step=>{let f=this.#features.get(step);if(!f){f=stepFeatures(step,this.#view!);this.#features.set(step,f);}return {step,f};});
    scored.sort((a,b)=>{
      const tier=(this.#tiers.get(a.step.proposal.technique)??-1)-(this.#tiers.get(b.step.proposal.technique)??-1);
      return (this.mode==="analyze"?b.f.utility-a.f.utility||compareFeatures(a.f,b.f):0)||tier||compareFeatures(a.f,b.f)||
        compareText(a.step.proposal.technique,b.step.proposal.technique)||compareText(a.f.effects,b.f.effects)||compareText(a.f.proof,b.f.proof);
    });return scored[0].step;
  }
}
