import type { ScreenServices } from "../app/controller";
import { startPlay } from "../domain/library";
import { reduceEditor } from "../domain/editor";
import { effectiveValues, isComplete } from "../domain/classic";
import { mountBoard } from "./board";
import { missing } from "./creator";
import { el, button } from "./dom";
export function mountPlayer(
  container: HTMLElement,
  services: ScreenServices,
  id: string,
): () => void {
  const puzzle = Object.hasOwn(services.controller.snapshot().puzzles, id)
    ? services.controller.snapshot().puzzles[id]
    : undefined;
  if (!puzzle) return missing(container, services);
  services.controller.update((d) => startPlay(d, id, services.now()));
  const layout = el("div", undefined, "editor-layout"),
    host = el("div"),
    side = el("aside", undefined, "side-panel"),
    controls = el("div"),
    completion = el("div", undefined, "completion"),
    title = el("h1", puzzle.name);
  completion.setAttribute("role", "status");
  completion.hidden = true;
  completion.append(
    el("h2", "Sudoku complete!"),
    el("p", "Every row, column and box follows the rules of classic Sudoku."),
    button("Dismiss message", () => {
      completion.hidden = true;
    }),
  );
  side.append(
    el("span", "PLAY · CLASSIC 9 × 9", "eyebrow"),
    title,
    el("p", "Solvability and uniqueness have not been checked.", "muted"),
    completion,
    el("hr"),
    controls,
    el("hr"),
    el("h2", "At your own pace"),
    el(
      "p",
      "Arrow keys move the selection. Shift + number toggles a note in its 3 × 3 position. Or turn on Notes.",
    ),
    el(
      "p",
      "Enter the same number again or use Erase to reveal the notes beneath it. Reset clears your progress in one undoable action.",
      "muted",
    ),
  );
  layout.append(host, side);
  container.append(layout);
  const context = { mode: "play" as const, givens: puzzle.definition.givens };
  let wasComplete = false;
  const board = mountBoard(host, {
    controlsContainer: controls,
    context,
    state: services.controller.snapshot().sessions[id].editor,
    showConflicts: services.controller.snapshot().settings.showConflicts,
    onAction(action) {
      services.controller.update((data) => {
        const session = data.sessions[id];
        if (!session) return data;
        const editor = reduceEditor(context, session.editor, action);
        return editor === session.editor
          ? data
          : {
              ...data,
              sessions: {
                ...data.sessions,
                [id]: { ...session, editor, updatedAt: services.now() },
              },
            };
      });
    },
  });
  const update = () => {
    const data = services.controller.snapshot(),
      session = data.sessions[id];
    if (!session) return;
    board.update(session.editor, data.settings.showConflicts);
    title.textContent = data.puzzles[id].name;
    const complete = isComplete(
      effectiveValues(session.editor, context.givens),
    );
    if (complete && !wasComplete) completion.hidden = false;
    if (!complete) completion.hidden = true;
    wasComplete = complete;
  };
  update();
  const off = services.controller.subscribe(update);
  return () => {
    off();
    board.destroy();
  };
}
