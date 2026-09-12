import type { ScreenServices } from "../app/controller";
import { parsePuzzleString, conflictingCells } from "../domain/classic";
import { createDraft, finishDraft, renameRecord } from "../domain/library";
import { reduceEditor } from "../domain/editor";
import { mountBoard } from "./board";
import { el, button, field } from "./dom";
import { dialog } from "./dialogs";
export function missing(
  container: HTMLElement,
  services: ScreenServices,
): () => void {
  container.append(
    el("h1", "Record not found"),
    el("p", "This record is not available in this library."),
    button("Back to library", () =>
      services.navigate({ screen: "library", tab: "puzzles" }),
    ),
  );
  return () => {};
}
export function mountCreator(
  container: HTMLElement,
  services: ScreenServices,
  id: string,
): () => void {
  const initial = Object.hasOwn(services.controller.snapshot().drafts, id)
    ? services.controller.snapshot().drafts[id]
    : undefined;
  if (!initial) return missing(container, services);
  if (initial.finishedPuzzleId) {
    services.navigate({ screen: "play", id: initial.finishedPuzzleId });
    return () => {};
  }
  const layout = el("div", undefined, "editor-layout"),
    boardHost = el("div"),
    side = el("aside", undefined, "side-panel"),
    controls = el("div"),
    name = el("input");
  name.value = initial.name;
  name.addEventListener("input", () =>
    services.controller.update((d) =>
      renameRecord(d, "draft", id, name.value, services.now()),
    ),
  );
  const feedback = el("p", undefined, "feedback");
  feedback.setAttribute("role", "status");
  const finish = button(
    "Finish",
    () => {
      const puzzleId = services.newId();
      services.controller.update((d) =>
        finishDraft(d, id, puzzleId, services.now()),
      );
      const d = dialog("Your puzzle is ready");
      d.body.append(
        el(
          "p",
          "Clues finalized. Solvability and uniqueness have not been checked.",
        ),
      );
      d.actions.append(
        button(
          "Play now",
          () => {
            d.close();
            services.navigate({ screen: "play", id: puzzleId });
          },
          "primary",
        ),
        button("Back to library", () => {
          d.close();
          services.navigate({ screen: "library", tab: "puzzles" });
        }),
      );
      d.node.addEventListener("cancel", () =>
        services.navigate({ screen: "library", tab: "puzzles" }),
      );
    },
    "primary",
  );
  const paste = button("Paste puzzle", () => {
    const d = dialog("Paste puzzle"),
      input = el("textarea"),
      error = el("p", undefined, "error");
    error.setAttribute("role", "alert");
    d.body.append(
      el(
        "p",
        "Use 1–9 for clues and 0 or a dot for empty cells. Importing creates a new draft.",
      ),
      field("81 cells", input),
      error,
    );
    d.actions.append(
      button("Cancel", d.close),
      button(
        "Import puzzle",
        () => {
          try {
            const values = parsePuzzleString(input.value),
              nextId = services.newId();
            services.controller.update((data) =>
              createDraft(data, nextId, services.now(), values),
            );
            d.close();
            services.navigate({ screen: "create", id: nextId });
          } catch (e) {
            error.textContent = (e as Error).message;
          }
        },
        "primary",
      ),
    );
    input.focus();
  });
  side.append(
    el("span", "YOUR DRAFT", "eyebrow"),
    el("h1", "Create a challenge."),
    field("Draft name", name),
    feedback,
    finish,
    paste,
    el("hr"),
    controls,
    el("hr"),
    el("h2", "Start with the clues"),
    el(
      "p",
      "Select a cell and enter 1–9. Enter the same number again to erase it. Drafts with conflicts are saved so you can return later.",
    ),
    el(
      "p",
      "Clues are locked when you finish. To change them later, edit a copy.",
      "muted",
    ),
  );
  layout.append(boardHost, side);
  container.append(layout);
  const context = { mode: "create" as const, givens: Array(81).fill(0) };
  const board = mountBoard(boardHost, {
    controlsContainer: controls,
    context,
    state: initial.editor,
    showConflicts: true,
    onAction(action) {
      services.controller.update((data) => {
        const draft = data.drafts[id];
        if (!draft || draft.finishedPuzzleId) return data;
        const editor = reduceEditor(context, draft.editor, action);
        return editor === draft.editor
          ? data
          : {
              ...data,
              drafts: {
                ...data.drafts,
                [id]: { ...draft, editor, updatedAt: services.now() },
              },
            };
      });
    },
  });
  const update = () => {
    const draft = services.controller.snapshot().drafts[id];
    if (!draft) return;
    board.update(draft.editor, true);
    const conflicts = conflictingCells(draft.editor.cells.map((c) => c.value));
    finish.disabled = !!conflicts.length || !!draft.finishedPuzzleId;
    paste.disabled = !!draft.finishedPuzzleId;
    name.disabled = !!draft.finishedPuzzleId;
    feedback.textContent = conflicts.length
      ? "Resolve the highlighted conflicts before finishing."
      : `${draft.editor.cells.filter((c) => c.value).length} clues · No visible conflicts.`;
    feedback.classList.toggle("error", !!conflicts.length);
    if (document.activeElement !== name) name.value = draft.name;
  };
  update();
  const off = services.controller.subscribe(update);
  return () => {
    off();
    board.destroy();
  };
}
