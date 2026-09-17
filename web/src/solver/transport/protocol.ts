import type {RunKey,StateKey} from "../snapshot";
import type {Effect} from "../proof/types";
import type {Limits} from "../limits";

export type ProofHeader={readonly stepId:number;readonly state:StateKey;readonly technique:string;readonly effects:readonly Effect[];readonly roots:readonly number[];readonly imports:readonly number[];readonly pattern:unknown;readonly nodeCount:number;readonly byteCount:number;readonly chunkCount:number};
export type WorkerMessage={readonly protocol:2;readonly key:RunKey;readonly seq:number;readonly type:string;readonly [name:string]:unknown};
const runFields=["requestId","snapshotId","inputRevision","problemKey","operation","mode","engine","profile","scheduler","checker","exact","optionsKey","parentEvidenceId"] as const;
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw Error("protocol-object");return value as Record<string,unknown>;}
function validKey(value:unknown):value is RunKey{const v=object(value);return runFields.every(field=>Object.hasOwn(v,field))&&typeof v.requestId==="string"&&typeof v.snapshotId==="string"&&typeof v.problemKey==="string"&&typeof v.optionsKey==="string"&&Number.isSafeInteger(v.inputRevision)&&(v.operation==="primary"||v.operation==="conditional")&&(v.mode==="explain"||v.mode==="analyze");}
export function decodeMessage(value:unknown):WorkerMessage{
  const v=object(value);if(v.protocol!==2||typeof v.seq!=="number"||!Number.isSafeInteger(v.seq)||v.seq<1||typeof v.type!=="string"||!validKey(v.key))throw Error("protocol-envelope");
  if(v.type==="proof-chunk"&&!(v.bytes instanceof Uint8Array))throw Error("protocol-chunk");
  return v as WorkerMessage;
}
export type {Limits};
