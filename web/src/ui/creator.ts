import type { ScreenServices } from "../app/controller";
import { toPuzzleString } from "../domain/classic";
import { createDraft, finishDraft, renameRecord } from "../domain/library";
import { reduceEditor } from "../domain/editor";
import type { ParsedPuzzle } from "../domain/puzzle-format";
import { el, button } from "./dom";
import { dialog, confirmDialog } from "./dialogs";
import { iconButton, labeledButton, menuButton } from "./components";
import { gameShell, copyText, toast } from "./game";
import { clueSummary, mountPuzzleSurface } from "./puzzle-editor";
import { openImportDialog } from "./import-dialog";

export function missing(container: HTMLElement, services: ScreenServices): () => void {
  const state = el("div", undefined, "empty-state");
  state.append(
    el("h1", "Puzzle not found"),
    el("p", "It may have been deleted or belongs to another browser."),
    button(
      "Open library",
      () => services.navigate({ screen: "library", tab: "puzzles" }),
      "primary",
    ),
  );
  container.append(state);
  return () => {};
}

/** Imports parsed puzzles as drafts; returns the first new draft id. */
export function importAsDrafts(services: ScreenServices, puzzles: ParsedPuzzle[]): string {
  const ids = puzzles.map(() => services.newId());
  services.controller.update((data) =>
    puzzles.reduce(
      (next, puzzle, i) => createDraft(next, ids[i], services.now(), puzzle.givens, puzzle.name),
      data,
    ),
  );
  if (puzzles.length > 1) toast(`${puzzles.length} drafts added to your library.`);
  return ids[0];
}

/** Editable, heading-styled name field shared by Create and Solve. */
export function nameField(
  label: string,
  value: string,
  onInput: (value: string) => void,
): HTMLInputElement {
  const input = el("input", undefined, "name-input");
  input.value = value;
  input.maxLength = 120;
  input.setAttribute("aria-label", label);
  input.addEventListener("input", () => onInput(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === "Escape") input.blur();
  });
  return input;
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
  const draft = () => services.controller.snapshot().drafts[id];
  const shell = gameShell(container, "create");
  const name = nameField("Puzzle name", initial.name, (value) =>
    services.controller.update((d) => renameRecord(d, "draft", id, value, services.now())),
  );
  const summary = el("span", undefined, "chip");
  summary.setAttribute("role", "status");
  summary.dataset.testid = "clue-summary";
  shell.title.append(name);
  shell.status.append(summary);

  const context = { mode: "create" as const, givens: Array(81).fill(0) };
  const surface = mountPuzzleSurface(shell, services, {
    mode: "create",
    givens: context.givens,
    state: () => draft().editor,
    display: () => ({ showConflicts: true, showNoteConflicts: false }),
    dispatch(action) {
      services.controller.update((data) => {
        const current = data.drafts[id];
        if (!current || current.finishedPuzzleId) return data;
        const editor = reduceEditor(context, current.editor, action);
        return editor === current.editor
          ? data
          : {
              ...data,
              drafts: { ...data.drafts, [id]: { ...current, editor, updatedAt: services.now() } },
            };
      });
    },
  });

  const importButton = labeledButton("upload", "Import", () =>
    openImportDialog({
      title: "Import puzzle",
      settings: services.controller.snapshot().settings,
      confirmLabel: "Import as new draft",
      allLabel: (count) => `Import all ${count}`,
      onImport: (puzzles) =>
        services.navigate({ screen: "create", id: importAsDrafts(services, puzzles) }),
    }),
  );
  const more = menuButton(
    iconButton("more", "More actions", () => {}),
    () => {
      const current = draft();
      const values = current.editor.cells.map((c) => c.value);
      return [
        {
          label: "Copy puzzle",
          icon: "copy",
          onSelect: async () =>
            toast(
              (await copyText(toPuzzleString(values)))
                ? "Puzzle copied as 81 characters."
                : "Copying is blocked in this browser.",
            ),
        },
        {
          label: "Analyze in solver",
          icon: "solve",
          onSelect: () => services.navigate({ screen: "solve", source: { kind: "draft", id } }),
        },
        "separator",
        {
          label: "Clear board",
          icon: "reset",
          danger: true,
          disabled: !values.some(Boolean),
          onSelect: () =>
            services.controller.update((data) => {
              const d = data.drafts[id];
              const editor = reduceEditor(context, d.editor, { type: "reset" });
              return editor === d.editor
                ? data
                : {
                    ...data,
                    drafts: { ...data.drafts, [id]: { ...d, editor, updatedAt: services.now() } },
                  };
            }),
        },
      ];
    },
  );
  const finish = labeledButton(
    "check",
    "Finish",
    () => {
      const current = draft();
      const { clues } = clueSummary(current.editor);
      const complete = () => {
        const puzzleId = services.newId();
        services.controller.update((d) => finishDraft(d, id, puzzleId, services.now()));
        const d = dialog("Puzzle ready", {
          description: "Clues are now locked. Edit a copy to change them later.",
        });
        let playing = false;
        d.actions.append(
          button("Back to library", d.close),
          button(
            "Play now",
            () => {
              playing = true;
              d.close();
            },
            "primary",
          ),
        );
        // Every way of dismissing (Escape, ×, buttons) leaves the locked draft.
        d.node.addEventListener("close", () =>
          services.navigate(
            playing ? { screen: "play", id: puzzleId } : { screen: "library", tab: "puzzles" },
          ),
        );
      };
      if (clues < 17)
        confirmDialog({
          title: "Finish with few clues?",
          message: `This puzzle has ${clues} ${clues === 1 ? "clue" : "clues"}. Classic puzzles need at least 17 to have a single solution.`,
          confirm: "Finish anyway",
          onConfirm: complete,
        });
      else complete();
    },
    "primary",
  );
  shell.actions.append(importButton, more, finish);

  const update = () => {
    const current = draft();
    if (!current) return;
    surface.render();
    const { text, conflicts } = clueSummary(current.editor);
    summary.textContent = text;
    summary.classList.toggle("danger", !!conflicts);
    finish.disabled = !!conflicts || !!current.finishedPuzzleId;
    finish.title = conflicts
      ? "Resolve the highlighted conflicts first"
      : "Lock the clues and add the puzzle to your library";
    if (document.activeElement !== name) name.value = current.name;
  };
  update();
  const off = services.controller.subscribe(update);
  return () => {
    off();
    surface.destroy();
  };
}
