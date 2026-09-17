import type { VersionId } from "../problem";
import type { ReadView } from "../state/types";
import { invalidate,type ChangeSet,type Watch } from "../state/events";
import type { Discovery,TechniqueDescriptor,DetectorStatus,Ledger,Estimate } from "../techniques/types";

export interface JobKey {readonly technique:VersionId;readonly scopeKey:string}
export interface TechniqueJobs {
  readonly rules:readonly {readonly id:string;readonly scopeKey:string;discover(view:ReadView):Discovery}[];
  readonly techniques:readonly TechniqueDescriptor[];
}
export interface ScheduledJob {
  readonly key:JobKey;readonly tier:number;readonly descriptor?:TechniqueDescriptor;
  readonly rule?:TechniqueJobs["rules"][number];readonly estimate:Estimate;
  status:DetectorStatus;dependencies:readonly Watch[];work:number;lastService:number;reason?:string;
}
export function compareJob(a:ScheduledJob,b:ScheduledJob):number {
  return a.tier-b.tier||compareText(a.key.technique,b.key.technique)||compareText(a.key.scopeKey,b.key.scopeKey);
}
export function compareText(a:string,b:string):number{return a<b?-1:a>b?1:0;}
/** At most 256 whole descriptor/rule records, never combinatorial scope jobs. */
export class SchedulingLedger {
  readonly jobs:readonly ScheduledJob[];
  #view:ReadView;#ticket=0;
  constructor(view:ReadView,registry:TechniqueJobs){
    if(registry.rules.length+registry.techniques.length>256)throw Error("profile-job-limit");
    this.#view=view;
    this.jobs=[...registry.rules.map(rule=>({key:{technique:rule.id,scopeKey:rule.scopeKey},tier:-1,rule,
      estimate:{hit:1,gain:1,cost:1},status:"pending" as DetectorStatus,dependencies:[{kind:"all" as const}],work:0,lastService:0})),
      ...registry.techniques.map(descriptor=>({key:{technique:descriptor.id,scopeKey:""},tier:descriptor.tier,descriptor,
        estimate:descriptor.estimate(view),status:"pending" as DetectorStatus,dependencies:descriptor.watches(view),work:0,lastService:0}))].sort(compareJob);
    if(new Set(this.jobs.map(j=>JSON.stringify(j.key))).size!==this.jobs.length)throw Error("duplicate-scheduler-job");
  }
  get ticket():number{return this.#ticket;}
  get active():readonly ScheduledJob[]{return this.jobs.filter(j=>["pending","in-progress","found"].includes(j.status));}
  get complete():boolean{return this.jobs.every(j=>j.status==="exhausted"||j.status==="excluded");}
  get rows():Ledger{return this.jobs.map(j=>Object.freeze({...j.key,state:this.#view.state.key,status:j.status,
    dependencies:j.dependencies,work:j.work,...(j.reason?{reason:j.reason}:{})}));}
  job(key:JobKey):ScheduledJob{const job=this.jobs.find(j=>j.key.technique===key.technique&&j.key.scopeKey===key.scopeKey);if(!job)throw Error("unknown-scheduler-job");return job;}
  service(key:JobKey):void{this.job(key).lastService=++this.#ticket;}
  status(key:JobKey,status:DetectorStatus,reason?:string,dependencies?:readonly Watch[]):void{
    const job=this.job(key);job.status=status;job.reason=reason;if(dependencies)job.dependencies=dependencies;
  }
  simplerExhausted(tier:number):boolean{return this.jobs.filter(j=>j.tier<tier).every(j=>j.status==="exhausted"||j.status==="excluded");}
  /** Exact accepted ChangeSet required, including same-revision proof additions. */
  advance(view:ReadView,changes:ChangeSet,cold=false):void{
    const rows=invalidate(changes,this.rows);this.#view=view;
    this.jobs.forEach((job,i)=>{job.status=cold?"pending":rows[i].status;job.reason=cold?undefined:rows[i].reason;job.lastService=0;
      if(job.descriptor){
        const carried=!cold&&(job.status==="exhausted"||job.status==="excluded");
        Object.assign(job,{estimate:job.descriptor.estimate(view),dependencies:carried?rows[i].dependencies:job.descriptor.watches(view)});
      }
    });
    this.#ticket=0;
  }
}
