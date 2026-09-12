import { expect, test } from 'vitest';
import { createDraft, emptyLibrary, finishDraft, startPlay, copyPuzzleToDraft, deleteRecord, renameRecord } from '../../src/domain/library';
import { parsePuzzleString } from '../../src/domain/classic';
import { PUZZLE, NOW } from '../fixtures';
test('finish archives authoring; resume and edit-copy preserve puzzle/session', () => {
  let d=createDraft(emptyLibrary(),'d1',NOW,parsePuzzleString(PUZZLE));
  d=finishDraft(d,'d1','p1',NOW); d=startPlay(d,'p1',NOW);
  const original=structuredClone(d);
  expect(startPlay(d,'p1',NOW)).toBe(d);
  d=copyPuzzleToDraft(d,'p1','d2',NOW);
  expect(d.puzzles).toEqual(original.puzzles); expect(d.sessions).toEqual(original.sessions);
  expect(d.drafts.d2.sourcePuzzleId).toBe('p1'); expect(d.drafts.d2.editor.past).toEqual([]);
  expect(d.drafts.d1.finishedPuzzleId).toBe('p1');
  expect(() => finishDraft(d,'d1','p2',NOW)).toThrow();
  expect(() => renameRecord(d,'draft','d1','changed',NOW)).toThrow();
});
test('conflicts block Finish, empty draft may finish, duplicate IDs reject', () => {
  const d=createDraft(emptyLibrary(),'d',NOW,parsePuzzleString('11'+'0'.repeat(79)));
  expect(() => finishDraft(d,'d','p',NOW)).toThrow();
  expect(() => createDraft(d,'d',NOW)).toThrow();
  expect(Object.keys(finishDraft(createDraft(emptyLibrary(),'d',NOW),'d','p',NOW).puzzles)).toEqual(['p']);
  expect(() => finishDraft(d,'missing','p',NOW)).toThrow();
});
test('delete removes session/archive, drops provenance and preserves active copy clues', () => {
  let d=startPlay(finishDraft(createDraft(emptyLibrary(),'d',NOW,parsePuzzleString(PUZZLE)),'d','p',NOW),'p',NOW);
  d=copyPuzzleToDraft(d,'p','copy',NOW); const cells=structuredClone(d.drafts.copy.editor.cells);
  d=deleteRecord(d,'puzzle','p');
  expect(d.puzzles).toEqual({}); expect(d.sessions).toEqual({}); expect(Object.keys(d.drafts)).toEqual(['copy']);
  expect(d.drafts.copy.sourcePuzzleId).toBeUndefined(); expect(d.drafts.copy.editor.cells).toEqual(cells);
  d=renameRecord(d,'draft','copy','  Novo  ',NOW); expect(d.drafts.copy.name).toBe('Novo');
  d=renameRecord(d,'draft','copy','  ',NOW); expect(d.drafts.copy.name).toBe('Sem título');
  expect(deleteRecord(d,'draft','copy').drafts).toEqual({});
});
