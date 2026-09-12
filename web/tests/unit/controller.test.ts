import { expect, test } from 'vitest';
import { createController } from '../../src/app/controller';
import { createDraft, emptyLibrary } from '../../src/domain/library';
import type { LibraryData } from '../../src/domain/model';
import { RevisionConflictError } from '../../src/storage/repository';
import { NOW } from '../fixtures';
test('live edits are immediate and older commit cannot mark newer work saved',async()=>{
  let stored=emptyLibrary(); const pending:{data:LibraryData;expected:number;resolve:(data:LibraryData)=>void}[]=[];
  const c=createController({load:async()=>stored,close(){},commit:(data,expected)=>new Promise(resolve=>pending.push({data,expected,resolve}))},stored);
  c.update(d=>createDraft(d,'a',NOW)); c.update(d=>createDraft(d,'b',NOW));
  expect(Object.keys(c.snapshot().drafts)).toEqual(['a','b']); expect(c.status().kind).toBe('saving');
  const first=pending.shift()!; stored={...first.data,revision:1}; first.resolve(stored); await Promise.resolve();
  expect(c.status().kind).toBe('saving'); expect(pending[0].expected).toBe(1);
  const last=pending.shift()!;stored={...last.data,revision:2};last.resolve(stored);await c.flush();
  expect(Object.keys(stored.drafts)).toEqual(['a','b']);expect(c.status().kind).toBe('saved');
});
test('failure keeps memory; retry commits; no-op and unsubscribe do not produce work',async()=>{
  let fail=true,writes=0,notifications=0;
  const c=createController({load:async()=>emptyLibrary(),close(){},commit:async(d,r)=>{writes++;if(fail)throw new Error('quota');return {...d,revision:r+1};}},emptyLibrary());
  const off=c.subscribe(()=>notifications++);c.update(d=>d);expect(writes).toBe(0);
  c.update(d=>createDraft(d,'a',NOW));await expect(c.flush()).rejects.toThrow('quota');expect(c.snapshot().drafts.a).toBeDefined();
  off();const before=notifications;fail=false;await c.retry();expect(c.status().kind).toBe('saved');expect(notifications).toBe(before);
});
test('revision conflicts never advance expected revision on retry',async()=>{
  const revisions:number[]=[];
  const c=createController({load:async()=>emptyLibrary(),close(){},commit:async(_,r)=>{revisions.push(r);throw new RevisionConflictError('other tab');}},emptyLibrary());
  c.update(d=>createDraft(d,'a',NOW));await expect(c.flush()).rejects.toThrow();await expect(c.retry()).rejects.toThrow();expect(revisions).toEqual([0,0]);
});
