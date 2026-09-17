import {expect,test,vi} from "vitest";
import {captureConditionalPrefix} from "../../../src/solver/conditional-prefix";
import {IndexWorkspace} from "../../../src/solver/indexes/workspace";
import {uniqueHarness,uniqueLimits} from "../../solver/unique-harness";
import {getTechniques} from "../../../src/solver/techniques/registry";
import {ConditionalOperation} from "../../../src/solver/conditional";
import {initializationReservation} from "../../../src/solver/proof/replay";
import u01 from "../../solver/fixtures/U01.json";

test("accepted prefix projection reserves storage and charges work before copying references", () => {
  const h = uniqueHarness(u01.fixtures[0] as any);
  try {
    const cursor = initializationReservation(h.operation.assembly);
    let next = cursor.next(), initializationWork = 0;
    while (!next.done) {
      if (next.value.kind === "work") initializationWork += next.value.units;
      next = cursor.next();
    }
    initializationWork += next.value.workUnits;
    const prefixLength = h.operation.prefix.length;
    expect(prefixLength).toBeGreaterThan(0);
    for (const resource of ["work", "storage"] as const) {
      const workspace = new IndexWorkspace({ entryLimit: 1_000_000, byteLimit: resource === "storage"
        ? 65536 + next.value.workspaceBytes + next.value.proofBytes + prefixLength * 16 - 1
        : uniqueLimits.workspaceBytes });
      const limits = { ...uniqueLimits, workUnits: resource === "work"
        ? initializationWork + prefixLength - 1 : uniqueLimits.workUnits };
      expect(() => ConditionalOperation.begin(h.parent, h.operation.run, limits, workspace))
        .toThrow(resource === "work" ? "conditional-work-limit" : "workspace-byte-limit");
      expect(workspace.usage).toEqual({ entries: 0, bytes: 0 });
    }
  } finally { h.operation.dispose(); }
}, 30000);

test("prefix limits reserve before capture and unwind partial allocations",async()=>{
 const workspace=new IndexWorkspace({entryLimit:100,byteLimit:150});
 await expect(captureConditionalPrefix([],uniqueLimits,workspace,()=>{},()=>true,true)).rejects.toThrow("workspace-byte-limit");
 expect(workspace.usage).toEqual({entries:0,bytes:0});
});

test("prefix header and node records retain the16KiB wire cap",async()=>{
 const state={problemKey:"test",branch:"primary",revision:0};
 for(const header of [true,false]) {
  const workspace=new IndexWorkspace({entryLimit:1000,byteLimit:1_000_000});
  const proposal:any={technique:"c01@1",state,effects:[],pattern:header?{large:"x".repeat(16384)}:{},
    proof:{state,imports:[],roots:[],nodes:header?[]:[{id:1,rule:"conjunction@1",premises:[],scope:[],parameters:{large:"x".repeat(16384)},conclusion:{kind:"false"}}]}};
  await expect(captureConditionalPrefix([proposal],uniqueLimits,workspace,()=>{},()=>true,true)).rejects.toThrow();
  expect(workspace.usage).toEqual({entries:0,bytes:0});
 }
});

test("asynchronous prefix cancellation releases copied headers and hash buffers",async()=>{
 let cancelled=false;const workspace=new IndexWorkspace({entryLimit:1000,byteLimit:1_000_000,cancelled:()=>cancelled});
 const original=crypto.subtle.digest.bind(crypto.subtle),spy=vi.spyOn(crypto.subtle,"digest").mockImplementation(async(...args)=>{
  const result=await original(...args);cancelled=true;return result;
 });
 try{await expect(captureConditionalPrefix([],uniqueLimits,workspace,()=>{},()=>true,true)).rejects.toThrow("cancelled");}
 finally{spy.mockRestore();}
 expect(workspace.usage).toEqual({entries:0,bytes:0});
});

test("unique discovery cancellation, work, memory and deadline terminals release all leases",()=>{
 const h=uniqueHarness(u01.fixtures[0] as any),descriptor=getTechniques("classic-conditional@1").find(d=>d.id==="u01@1")!;
 try {
  for(const kind of ["cancelled","work-limit","workspace-byte-limit","time-limit"] as const) {
   const workspace=new IndexWorkspace({entryLimit:1_000_000,byteLimit:kind==="workspace-byte-limit"?1:uniqueLimits.workspaceBytes,cancelled:()=>kind==="cancelled"});
   const limits={...uniqueLimits,workUnits:kind==="work-limit"?0:uniqueLimits.workUnits,timeMs:kind==="time-limit"?0:uniqueLimits.timeMs};
   const terminal=[...descriptor.discover(h.operation.view,{workspace,limits,uniqueAuthority:h.operation.authority})].at(-1);
   expect(terminal).toEqual({kind:"interrupted",reason:kind});expect(workspace.usage).toEqual({entries:0,bytes:0});
  }
 }finally{h.operation.dispose();}
},30000);
