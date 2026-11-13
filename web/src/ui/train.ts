import type { ScreenServices } from "../app/controller";
import { createPlayClock, formatDuration } from "../app/play-clock";
import type { BoardAction } from "../domain/editor";
import { reduceEditor } from "../domain/editor";
import { emptyEditor, type Digit, type EditorState, type Value } from "../domain/model";
import { loadTrainingPack, digitsOf, type TrainingPosition } from "../domain/training-pack";
import {
  categoryOf,
  isCorrect,
  nextPosition,
  packCategories,
  recordAttempt,
} from "../domain/training";
import { el, button } from "./dom";
import { icon } from "./icons";
import { iconButton } from "./components";
import { gameShell } from "./game";
import { mountPuzzleSurface } from "./puzzle-editor";

const ROWS = "ABCDEFGHI";
export const cellName = (cell: number) => `${ROWS[Math.floor(cell / 9)]}${(cell % 9) + 1}`;
const placements = (list: readonly (readonly [number, number])[]) =>
  list.map(([cell, digit]) => `${cellName(cell)} = ${digit}`).join(", ");

/** One sprint: the positions it has shown (spec §4.2: never twice, except a due miss). */
interface Sprint {
  readonly shown: Set<string>;
  previous?: string;
}
let sprint: Sprint | undefined;
/** Starts a fresh sprint; the run screen continues the current one. */
export function startSprint(): void {
  sprint = { shown: new Set() };
}

function editorFor(position: TrainingPosition): EditorState {
  const editor = emptyEditor();
  editor.cells = digitsOf(position.values).map((value) => ({ value: value as Value, notes: [] }));
  return editor;
}
function candidateDigits(mask: number): Digit[] {
  const result: Digit[] = [];
  for (let d = 1; d <= 9; d++) if (mask & (1 << (d - 1))) result.push(d as Digit);
  return result;
}

type Answer = {
  readonly cell: number;
  readonly digit: number;
  readonly correct: boolean;
  readonly ms: number;
};

/**
 * The Train run screen (spec §4.1, D106): one position, a clock started with
 * it, one answer. A correct digit anywhere ends the attempt as solved; a wrong
 * one ends it as a miss. Nothing is recorded until the answer, so leaving or
 * reloading during an attempt records nothing.
 */
export function mountTrainRun(container: HTMLElement, services: ScreenServices): () => void {
  const settings = () => services.controller.snapshot().settings;
  const run = (sprint ??= { shown: new Set() });
  const shell = gameShell(container, "train");
  shell.title.append(el("h1", "Train", "game-name"));
  const loading = el("p", "Loading positions…", "empty-note");
  shell.stage.append(loading);

  let disposed = false,
    teardown = () => {};
  void loadTrainingPack()
    .then((pack) => {
      if (disposed) return;
      loading.remove();
      teardown = runPositions(pack.positions);
    })
    .catch((error: Error) => {
      if (!disposed) loading.textContent = error.message;
    });

  function runPositions(positions: readonly TrainingPosition[]): () => void {
    let position: TrainingPosition | undefined,
      editor = emptyEditor(),
      answer: Answer | undefined,
      paused = false;

    // The surface and the board read the givens by reference: refilled in place per position.
    const givens: Value[] = Array<Value>(81).fill(0);
    // Clock: active time of the current attempt only.
    const pageActive = () => document.visibilityState === "visible" && document.hasFocus();
    const clock = createPlayClock(0, () => !!position && !answer && !paused, {
      now: () => performance.now(),
      pageActive,
    });
    const timerText = el("span", "0:00", "timer-text");
    timerText.setAttribute("role", "timer");
    timerText.setAttribute("aria-label", "Attempt time");
    const pause = iconButton("pause", "Pause", () => setPaused(!paused), "timer-toggle");
    const timer = el("div", undefined, "timer");
    timer.append(timerText, pause);
    const streak = el("span", undefined, "train-streak");
    streak.dataset.testid = "train-streak";
    shell.status.append(streak, timer);

    const cover = el("div", undefined, "pause-cover");
    const resume = button("", () => setPaused(false), "primary with-icon");
    resume.append(icon("play"), el("span", "Resume"));
    cover.append(el("p", "Paused", "pause-title"), resume);
    shell.stage.append(cover);

    // Result panel, shown after the answer.
    const result = el("section", undefined, "train-result");
    result.dataset.testid = "train-result";
    const resultTitle = el("h2"),
      resultText = el("p"),
      intended = el("p", undefined, "train-intended");
    // A keyboard press of Next (click detail 0) keeps keyboard focus on the board;
    // a mouse click leaves focus alone, so clicking the cell it would select still selects it.
    const next = button("", (event) => advance(event.detail === 0), "primary with-icon");
    next.append(el("span", "Next"), icon("send"));
    const back = button("Back to Train", () => services.navigate({ screen: "train" }));
    const actions = el("div", undefined, "actions");
    actions.append(next, back);
    result.append(resultTitle, resultText, intended, actions);
    result.hidden = true;
    const kind = el("p", undefined, "train-kind");
    shell.side.prepend(result);
    shell.side.prepend(kind);
    const done = el("section", undefined, "train-done");
    done.hidden = true;
    const doneTitle = el("h2"),
      doneText = el("p");
    done.append(
      doneTitle,
      doneText,
      button("Back to Train", () => services.navigate({ screen: "train" }), "primary"),
    );
    shell.side.prepend(done);
    // Always present, so screen readers announce the result when its text changes.
    const announce = el("p", undefined, "sr-only");
    announce.setAttribute("role", "status");
    shell.side.append(announce);

    const dispatch = (action: BoardAction) => {
      if (!position || answer || paused) {
        if (action.type === "select" || action.type === "move")
          editor = reduceEditor({ mode: "play", givens }, editor, action);
        render();
        return;
      }
      // Only a digit answers; a note modifier (Shift or Ctrl with a digit) does nothing here.
      if (action.type === "digit") {
        if (action.tool !== "value") return;
        const cell = editor.selected;
        if (cell >= 0 && !givens[cell]) submit(cell, action.digit);
        return;
      }
      // Selection only: notes are read-only and nothing else edits a training board.
      if (action.type === "select" || action.type === "move")
        editor = reduceEditor({ mode: "play", givens }, editor, action);
      render();
    };
    const surface = mountPuzzleSurface(shell, services, {
      mode: "play",
      givens,
      state: () => editor,
      dispatch,
      editable: () => !!position && !answer && !paused,
      command: (action) => {
        if (action === "pause") {
          setPaused(!paused);
          return true;
        }
        return (
          action === "undo" || action === "redo" || action === "erase" || action === "autofill"
        );
      },
    });
    shell.root.querySelector('[role="grid"]')?.setAttribute("aria-label", "Training position");

    function setPaused(value: boolean) {
      if (!position || answer) return;
      clock.sync();
      paused = value;
      clock.sync();
      render();
    }
    function submit(cell: number, digit: number) {
      if (!position) return;
      clock.sync();
      const ms = Math.round(clock.elapsed()),
        correct = isCorrect(position, cell, digit);
      answer = { cell, digit, correct, ms };
      clock.sync();
      const attempt = {
        position: position.id,
        category: categoryOf(position),
        at: services.now(),
        ms,
        result: correct ? ("correct" as const) : ("miss" as const),
        cell,
        digit,
      };
      services.controller.update((data) => ({
        ...data,
        training: recordAttempt(data.training, attempt, data.settings.trainRepeatGap),
      }));
      if (correct)
        editor = {
          ...editor,
          cells: editor.cells.map((c, i) => (i === cell ? { ...c, value: digit as Value } : c)),
        };
      announce.textContent = correct
        ? `Correct: ${cellName(cell)} = ${digit} in ${(ms / 1000).toFixed(1)} seconds.`
        : `Not this time: ${cellName(cell)} = ${digit} is wrong. Intended placement: ${placements(position.targets)}.`;
      render();
      // After the surface has refocused the cell it dispatched from.
      setTimeout(() => {
        if (answer && next.isConnected) next.focus();
      });
    }
    function advance(fromKeyboard = false) {
      position = nextPosition(positions, services.controller.snapshot().training, {
        categoriesOff: settings().trainCategoriesOff,
        shown: run.shown,
        random: Math.random,
        previous: run.previous,
        repeatGap: settings().trainRepeatGap,
      });
      answer = undefined;
      paused = false;
      if (position) {
        run.shown.add(position.id);
        run.previous = position.id;
        givens.splice(0, 81, ...(digitsOf(position.values) as Value[]));
        editor = editorFor(position);
      } else {
        // The sprint has shown every position: clear the board.
        givens.fill(0);
        editor = emptyEditor();
      }
      clock.reset(0);
      announce.textContent = "";
      render();
      // Mounted or advanced without focus: cover the board, as losing focus would.
      if (position && !pageActive()) setPaused(true);
      // Next disappears with the result: keep keyboard focus on the board (its focused cell is selected).
      if (fromKeyboard)
        shell.root
          .querySelector<HTMLElement>('.cell[tabindex="0"]')
          ?.focus({ preventScroll: true });
    }
    const render = () => {
      clock.sync();
      const data = services.controller.snapshot();
      streak.textContent = `Streak ${data.training.streak}`;
      timerText.hidden = !data.settings.trainShowClock && !answer;
      pause.hidden = !position || !!answer;
      pause.replaceChildren(icon(paused ? "play" : "pause"));
      pause.setAttribute("aria-label", paused ? "Resume" : "Pause");
      pause.setAttribute("aria-pressed", String(paused));
      shell.root.classList.toggle("paused", paused);
      cover.hidden = !paused;
      done.hidden = !!position;
      if (!position) {
        const none = packCategories(positions).every((c) =>
          data.settings.trainCategoriesOff.includes(c),
        );
        doneTitle.textContent = none ? "No category selected" : "Sprint complete";
        doneText.textContent = none
          ? "Choose at least one category in Train."
          : "You have seen every position in the selected categories in this sprint.";
      }
      kind.hidden = !position;
      if (position)
        kind.textContent =
          position.kind === "scan"
            ? "Scan: place any digit you can find from the placed digits."
            : "Technique: the notes are the candidates. Place any digit you can find.";
      result.hidden = !answer;
      if (answer && position) {
        resultTitle.textContent = answer.correct ? "Correct" : "Not this time";
        result.dataset.result = answer.correct ? "correct" : "miss";
        resultText.textContent = answer.correct
          ? `${cellName(answer.cell)} = ${answer.digit} in ${formatDuration(answer.ms)} (${(answer.ms / 1000).toFixed(1)} s).`
          : `${cellName(answer.cell)} = ${answer.digit} is not the solution's digit. The streak starts again.`;
        intended.textContent = `Intended placement: ${placements(position.targets)}.`;
        intended.hidden = answer.correct;
      }
      const shownCandidates = position?.candidates;
      surface.render(
        position
          ? {
              candidates: shownCandidates
                ? digitsOf(position.values).map((v, i) =>
                    v ? null : candidateDigits(shownCandidates[i]),
                  )
                : undefined,
              derived: new Set(
                digitsOf(position.values).flatMap((v, i) =>
                  v && position && position.givens[i] === "0" ? [i] : [],
                ),
              ),
              correct: answer?.correct ? new Set([answer.cell]) : undefined,
              placed:
                answer && !answer.correct
                  ? new Map(position.targets.map(([c, d]) => [c, d]))
                  : undefined,
              focus: answer
                ? new Set([answer.cell, ...position.targets.map(([c]) => c)])
                : undefined,
            }
          : undefined,
      );
      timerText.textContent = formatDuration(answer ? answer.ms : clock.elapsed());
    };

    const tick = setInterval(() => {
      clock.sync();
      if (!answer) timerText.textContent = formatDuration(clock.elapsed());
    }, 250);
    // Losing focus or hiding the page pauses: the cover hides the board and the clock stops.
    const onActivity = () => {
      clock.sync();
      if (!pageActive() && position && !answer && !paused) setPaused(true);
    };
    document.addEventListener("visibilitychange", onActivity);
    addEventListener("blur", onActivity);
    addEventListener("focus", onActivity);
    const off = services.controller.subscribe(render);
    advance();
    return () => {
      clearInterval(tick);
      off();
      document.removeEventListener("visibilitychange", onActivity);
      removeEventListener("blur", onActivity);
      removeEventListener("focus", onActivity);
      surface.destroy();
    };
  }

  return () => {
    disposed = true;
    teardown();
  };
}
