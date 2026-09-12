import { expect, test, vi } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import {
  openRepository,
  RevisionConflictError,
} from "../../src/storage/repository";
import { emptyLibrary, createDraft } from "../../src/domain/library";
import { reduceEditor } from "../../src/domain/editor";
import { NOW } from "../fixtures";
import {
  exportBackup,
  parseBackup,
  previewRestore,
} from "../../src/domain/backup";
import { finishDraft, startPlay } from "../../src/domain/library";
test("state and history survive reopen; stale revisions cannot overwrite", async () => {
  const factory = new IDBFactory();
  let repo = await openRepository(factory, "test");
  let d = createDraft(emptyLibrary(), "d", NOW);
  d.drafts.d.editor = reduceEditor(
    { mode: "create", givens: Array(81).fill(0) },
    d.drafts.d.editor,
    { type: "digit", digit: 5, corner: false },
  );
  const saved = await repo.commit(d, 0);
  expect(saved.revision).toBe(1);
  await expect(repo.commit(emptyLibrary(), 0)).rejects.toBeInstanceOf(
    RevisionConflictError,
  );
  repo.close();
  repo = await openRepository(factory, "test");
  expect(await repo.load()).toEqual(saved);
  repo.close();
});
test("malformed data and synchronous put failure leave previous aggregate intact", async () => {
  const repo = await openRepository(new IDBFactory(), "test");
  const saved = await repo.commit(createDraft(emptyLibrary(), "d", NOW), 0);
  const bad = structuredClone(saved);
  bad.drafts.d.editor.cells.pop();
  await expect(repo.commit(bad, 1)).rejects.toThrow();
  const spy = vi
    .spyOn(IDBObjectStore.prototype, "put")
    .mockImplementation(() => {
      throw new DOMException("Quota test", "QuotaExceededError");
    });
  await expect(repo.commit(emptyLibrary(), 1)).rejects.toThrow("Quota test");
  spy.mockRestore();
  expect(await repo.load()).toEqual(saved);
  repo.close();
});
test("competing connections retain one winner and report stale loser", async () => {
  const factory = new IDBFactory(),
    a = await openRepository(factory, "test"),
    b = await openRepository(factory, "test");
  const results = await Promise.allSettled([
    a.commit(createDraft(emptyLibrary(), "a", NOW), 0),
    b.commit(createDraft(emptyLibrary(), "b", NOW), 0),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(Object.keys((await a.load()).drafts)).toHaveLength(1);
  a.close();
  b.close();
});
test("restored hidden notes and redo persist atomically; an aborted put never reports saved", async () => {
  const repo = await openRepository(new IDBFactory(), "test");
  const d = startPlay(
    finishDraft(createDraft(emptyLibrary(), "d", NOW), "d", "p", NOW),
    "p",
    NOW,
  );
  const ctx = { mode: "play" as const, givens: d.puzzles.p.definition.givens };
  let s = reduceEditor(ctx, d.sessions.p.editor, {
    type: "digit",
    digit: 2,
    corner: true,
  });
  s = reduceEditor(ctx, s, { type: "digit", digit: 5, corner: false });
  s = reduceEditor(ctx, s, { type: "undo" });
  d.sessions.p.editor = s;
  const restored = previewRestore(
    emptyLibrary(),
    parseBackup(exportBackup(d, NOW)),
    () => "copy",
    true,
  ).data;
  const saved = await repo.commit(restored, 0);
  expect((await repo.load()).sessions.p.editor).toEqual(s);
  const original = IDBObjectStore.prototype.put;
  const spy = vi
    .spyOn(IDBObjectStore.prototype, "put")
    .mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      const req = original.apply(this, args);
      this.transaction.abort();
      return req;
    });
  try {
    await expect(repo.commit(emptyLibrary(), 1)).rejects.toThrow();
  } finally {
    spy.mockRestore();
  }
  expect(await repo.load()).toEqual(saved);
  repo.close();
});
