import type { ScreenServices } from "../app/controller";
import { emptyEditor, type Value } from "../domain/model";
import { digitsOf, loadTrainingPack, type TrainingPosition } from "../domain/training-pack";
import { categoryLabel, categoryOf } from "../domain/training";
import { el, button } from "./dom";
import { gameShell } from "./game";
import { mountBoard } from "./board";
import { explanationPanel, positionOverlay, stepOverlay } from "./train-explain";
import { cellName } from "./solver-copy";
import { formatSeconds } from "./train-hub";

/**
 * A past position reopened from the history (spec §4.3): no clock, nothing
 * recorded. The intended placements can be revealed.
 */
export function mountTrainStudy(
  container: HTMLElement,
  services: ScreenServices,
  id: string,
): () => void {
  const shell = gameShell(container, "train");
  shell.title.append(el("h1", "Study", "game-name"));
  const note = el("p", "Loading the position…", "empty-note");
  shell.side.append(note);
  let disposed = false,
    teardown = () => {};
  void loadTrainingPack()
    .then((pack) => {
      if (disposed) return;
      const position = pack.positions.find((p) => p.id === id);
      if (!position) {
        note.textContent = "This position is not in the current training pack.";
        shell.side.append(button("Back to Train", () => services.navigate({ screen: "train" })));
        return;
      }
      note.remove();
      teardown = study(position);
    })
    .catch((error: Error) => {
      if (!disposed) note.textContent = error.message;
    });

  function study(position: TrainingPosition): () => void {
    const givens = digitsOf(position.values) as Value[],
      editor = emptyEditor();
    editor.cells = givens.map((value) => ({ value, notes: [] }));
    const host = el("div", undefined, "board-host");
    shell.stage.append(host);
    const settings = services.controller.snapshot().settings;
    const board = mountBoard(host, {
      context: { mode: "play", givens },
      state: editor,
      display: { ...settings, highlightPeers: false, highlightSameDigit: false },
      onAction: () => {},
      interactive: false,
      label: "Study position",
    });
    const record = services.controller.snapshot().training.positions[position.id];
    const panel = el("section", undefined, "train-study");
    const details = el("dl", undefined, "train-overall");
    for (const [term, value] of [
      ["Category", categoryLabel(categoryOf(position))],
      ["Attempts", String(record?.attempts ?? 0)],
      ["Best time", formatSeconds(record?.bestMs ?? null)],
    ] as const) {
      const item = el("div");
      item.append(el("dt", term), el("dd", value));
      details.append(item);
    }
    const intended = el(
      "p",
      `Intended placement: ${position.targets.map(([c, d]) => `${cellName(c)} = ${d}`).join(", ")}.`,
      "train-intended",
    );
    intended.hidden = true;
    const explanation = explanationPanel(position, 2);
    explanation.hidden = true;
    let revealed = false;
    const reveal = button("Show the answer", () => {
      revealed = !revealed;
      render();
    });
    const back = button("Back to Train", () => services.navigate({ screen: "train" }));
    const actions = el("div", undefined, "actions");
    actions.append(reveal, back);
    panel.append(details, intended, explanation, actions);
    shell.side.append(panel);
    const render = () => {
      intended.hidden = !revealed;
      explanation.hidden = !revealed;
      reveal.textContent = revealed ? "Hide the answer" : "Show the answer";
      reveal.setAttribute("aria-pressed", String(revealed));
      board.update(editor, undefined, {
        ...positionOverlay(position),
        ...(revealed ? stepOverlay(position) : {}),
      });
    };
    render();
    return () => board.destroy();
  }

  return () => {
    disposed = true;
    teardown();
  };
}
