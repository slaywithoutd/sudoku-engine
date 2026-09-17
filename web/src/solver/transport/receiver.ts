import type {RunKey} from "../snapshot";
import type {Limits} from "../limits";
import {decodeMessage,type ProofHeader} from "./protocol";
export interface ReceiverContext{readonly key:RunKey;readonly limits:Limits}
export interface Receiver{receive(value:unknown):void;dispose():void}
export function createReceiver(context:ReceiverContext,accept:(step:{readonly header:ProofHeader;readonly chunks:readonly Uint8Array[]})=>number,ack:(batchSeq:number)=>void):Receiver{
  let expected=1,header:ProofHeader|undefined,chunks:Uint8Array[]=[];let done=false;
  const receive=(value:unknown)=>{
    if(done)return;const message=decodeMessage(value);if(JSON.stringify(message.key)!==JSON.stringify(context.key))return;
    if(message.seq<expected)return;if(message.seq!==expected)throw Error("protocol-sequence");expected++;
    if(message.type==="proof-begin"){
      if(header)throw Error("protocol-duplicate-step");header=message.header as ProofHeader;
      if(!header||header.nodeCount<0||header.byteCount<0||header.chunkCount<0||header.chunkCount>context.limits.inFlightBatches*1024||header.byteCount>context.limits.stepBytes)throw Error("protocol-proof-limit");
    } else if(message.type==="proof-chunk"){
      const bytes=message.bytes as Uint8Array,batchSeq=message.batchSeq as number;
      if(!header||message.stepId!==header.stepId||bytes.length>context.limits.batchBytes||chunks.length>=header.chunkCount)throw Error("protocol-chunk-limit");
      chunks.push(bytes);ack(batchSeq);
    } else if(message.type==="proof-end"){
      if(!header||message.stepId!==header.stepId||chunks.length!==header.chunkCount)throw Error("protocol-incomplete-proof");
      if(chunks.reduce((n,chunk)=>n+chunk.byteLength,0)!==header.byteCount)throw Error("protocol-byte-count");
      accept(Object.freeze({header,chunks:Object.freeze(chunks.map(chunk=>chunk.slice()))}));done=true;
    }
  };
  return {receive,dispose:()=>{done=true;header=undefined;chunks=[];}};
}
