import type { Limits } from "../limits";
import type { VersionId } from "../problem";

export interface Budget { spend(units:number):boolean; remaining():number }
export interface WorkHold {settle(units:number):void;dispose():void}
export interface ReservableBudget extends Budget {reserve(units:number):WorkHold}
export interface WorkClock { now():number }
export const SCHEDULER_VERSION = "scheduler@1";
export const QUANTUM = 256;
export type PolicyId = "explain-fair@1"|"analyze-fair@1"|"fixed-scan@1"|"event-fixed@1";
export class WorkLimit extends Error { constructor(readonly reason="work-limit"){super(reason);} }
function integer(value:number):void {if(!Number.isSafeInteger(value)||value<0)throw Error("invalid-work-units");}
/** Atomic reservations leave no negative balance. Failed work never becomes free credit. */
export class WorkBudget implements Budget {
  #used=0;#held=0;
  constructor(readonly capacity:number){integer(capacity);}
  get used():number{return this.#used;}
  remaining():number{return this.capacity-this.#used-this.#held;}
  spend(units:number):boolean{integer(units);if(units>this.remaining())return false;this.#used+=units;return true;}
  charge(units:number):void{if(!this.spend(units))throw new WorkLimit();}
  /** Hold worst-case capacity; settlement never refunds already consumed work. */
  reserve(units:number):WorkHold {
    integer(units);if(units>this.remaining())throw new WorkLimit();this.#held+=units;let active=true;
    return Object.freeze({settle:(actual:number)=>{if(!active)throw Error("settled-work-reservation");integer(actual);
      if(actual>units)throw Error("work-reservation-overflow");this.#held-=units;this.#used+=actual;active=false;},
      dispose:()=>{if(active){this.#held-=units;active=false;}}});
  }
}
export interface SchedulingOptions {
  readonly mode:"explain"|"analyze";readonly policy:PolicyId;readonly profile:VersionId;
  readonly rollout:boolean;readonly limits:Readonly<Limits>;readonly phaseWorkUnits:number;
  readonly phaseTimeMs:number;
}
/** Logical options only: task slices do not enter deterministic decisions. */
export function schedulingOptions(input: Partial<Omit<SchedulingOptions,"limits">>&{limits:Limits}):SchedulingOptions {
  const mode=input.mode??"explain",policy=input.policy??(mode==="explain"?"explain-fair@1":"analyze-fair@1");
  const options={mode,policy,profile:input.profile??"classic-expanded@1",rollout:input.rollout??false,
    limits:Object.freeze({...input.limits}),phaseWorkUnits:input.phaseWorkUnits??input.limits.workUnits,
    phaseTimeMs:input.phaseTimeMs??input.limits.timeMs};
  if(!["explain","analyze"].includes(mode)||!["explain-fair@1","analyze-fair@1","fixed-scan@1","event-fixed@1"].includes(policy))throw Error("invalid-scheduler-policy");
  if((policy==="explain-fair@1"&&mode!=="explain")||(policy==="analyze-fair@1"&&mode!=="analyze"))throw Error("policy-mode-mismatch");
  if(!["classic-expanded@1","classic-conditional@1"].includes(options.profile))throw Error("unknown-profile");
  if(typeof options.rollout!=="boolean")throw Error("invalid-rollout-option");
  if(options.rollout&&(mode!=="analyze"||options.profile!=="classic-expanded@1"))throw Error("rollout-requires-analyze-primary");
  for(const value of [...Object.values(options.limits),options.phaseWorkUnits,options.phaseTimeMs])integer(value);
  if(options.phaseWorkUnits>options.limits.workUnits||options.phaseTimeMs>options.limits.timeMs)throw Error("invalid-phase-limit");
  return Object.freeze(options);
}
/** One canonical encoder shared with worker/controller identity construction. */
export function canonicalOptionsKey(input:SchedulingOptions):string {
  const options=schedulingOptions(input);
  const order=(value:unknown):unknown=>Array.isArray(value)?value.map(order):value&&typeof value==="object"?
    Object.fromEntries(Object.keys(value).sort().map(k=>[k,order((value as Record<string,unknown>)[k])])):value;
  return JSON.stringify(order(options));
}
