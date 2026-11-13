import type { ScreenServices } from "../app/controller";
import { createPlayClock, formatDuration } from "../app/play-clock";
import type { BoardAction } from "../domain/editor";
import { reduceEditor } from "../domain/editor";
import { emptyEditor, type EditorState, type Value } from "../domain/model";
import { loadTrainingPack, digitsOf, type TrainingPosition } from "../domain/training-pack";
import {
  categoryOf,
  foundWith,
  isCorrect,
  nextPosition,
  packCategories,
  recordAttempt,
  recordRun,
  TIMED_RUN_MISSES,
  TIMED_RUN_MS,
} from "../domain/training";
import { el, button } from "./dom";
import { icon } from "./icons";
import { iconButton } from "./components";
import { gameShell } from "./game";
import { cellName } from "./solver-copy";
import { mountPuzzleSurface } from "./puzzle-editor";
import { explanationPanel, positionOverlay, stepOverlay, stepText } from "./train-explain";

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
 *
 * `timed` (spec §4.2, T6): positions follow one another without the step in
 * between; the run ends after TIMED_RUN_MS of active time or at the
 * TIMED_RUN_MISSES-th miss, and is recorded once. A run left before its end
 * is not recorded (its answered attempts are).
 */
export function mountTrainRun(
  container: HTMLElement,
  services: ScreenServices,
  mode: "sprint" | "timed" = "sprint",
): () => void {
  const settings = () => services.controller.snapshot().settings;
  const timed = mode === "timed";
  const run: Sprint = timed ? { shown: new Set() } : (sprint ??= { shown: new Set() });
  const shell = gameShell(container, "train");
  shell.title.append(el("h1", timed ? "Timed run" : "Train", "game-name"));
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
    // Timed run state.
    let solved = 0,
      misses = 0,
      ended: "time" | "misses" | "exhausted" | undefined;

    // The surface and the board read the givens by reference: refilled in place per position.
    const givens: Value[] = Array<Value>(81).fill(0);
    // Clock: active time of the current attempt only.
    const pageActive = () => document.visibilityState === "visible" && document.hasFocus();
    const clock = createPlayClock(0, () => !!position && !answer && !paused, {
      now: () => performance.now(),
      pageActive,
    });
    // The run's own clock: active time of the whole run.
    const runClock = createPlayClock(0, () => timed && !ended && !!position && !paused, {
      now: () => performance.now(),
      pageActive,
    });
    const timerText = el("span", "0:00", "timer-text");
    timerText.setAttribute("role", "timer");
    timerText.setAttribute("aria-label", timed ? "Time left" : "Attempt time");
    const pause = iconButton("pause", "Pause", () => setPaused(!paused), "timer-toggle");
    const timer = el("div", undefined, "timer");
    timer.append(timerText, pause);
    const streak = el("span", undefined, "train-streak");
    streak.dataset.testid = "train-streak";
    const score = el("span", undefined, "train-streak");
    score.dataset.testid = "train-score";
    score.hidden = !timed;
    shell.status.append(streak, score, timer);

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
    // The key step (spec §4.1 step 5, T5), rebuilt once per answered position.
    const explanation = el("div", undefined, "train-explanation-host");
    let explained: TrainingPosition | undefined;
    result.append(resultTitle, resultText, intended, explanation, actions);
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
    // Timed run: the last answer, and the summary at the end.
    const flash = el("p", undefined, "train-flash");
    flash.dataset.testid = "train-flash";
    flash.hidden = true;
    const summary = el("section", undefined, "train-result");
    summary.dataset.testid = "train-run-summary";
    summary.hidden = true;
    const summaryTitle = el("h2"),
      summaryText = el("p"),
      summaryBest = el("p");
    // As Next: only a keyboard press hands focus to the board.
    const again = button("", (event) => restart(event.detail === 0), "primary with-icon");
    again.append(icon("reset"), el("span", "Run again"));
    const summaryActions = el("div", undefined, "actions");
    summaryActions.append(
      again,
      button("Back to Train", () => services.navigate({ screen: "train" })),
    );
    summary.append(summaryTitle, summaryText, summaryBest, summaryActions);
    shell.side.prepend(flash);
    shell.side.prepend(summary);
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
      // While the key step is shown, only its own highlights (as on the Solve screen).
      display: () => (answer ? { highlightPeers: false, highlightSameDigit: false } : {}),
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
      if (!position || answer || ended) return;
      clock.sync();
      runClock.sync();
      paused = value;
      clock.sync();
      runClock.sync();
      render();
    }
    function finish(reason: NonNullable<typeof ended>) {
      if (ended) return;
      runClock.sync();
      const ms =
        reason === "time" ? TIMED_RUN_MS : Math.min(TIMED_RUN_MS, Math.round(runClock.elapsed()));
      ended = reason;
      position = undefined;
      answer = undefined;
      givens.fill(0);
      editor = emptyEditor();
      // Recorded exactly once: `ended` guards every later call. A run that never
      // showed a position (every category off) is not a run.
      const record = { at: services.now(), solved, misses, ms };
      if (reason !== "exhausted" || run.shown.size > 0)
        services.controller.update((data) => ({
          ...data,
          training: recordRun(data.training, record),
        }));
      announce.textContent = `Run over: ${solved} solved, ${misses} missed.`;
      render();
      setTimeout(() => again.isConnected && again.focus());
    }
    function restart(fromKeyboard: boolean) {
      run.shown.clear();
      run.previous = undefined;
      solved = 0;
      misses = 0;
      ended = undefined;
      flash.hidden = true;
      runClock.reset(0);
      advance(fromKeyboard);
    }
    function submit(cell: number, digit: number) {
      if (!position) return;
      // An answer after the time limit, before the next tick, does not count.
      runClock.sync();
      if (timed && runClock.elapsed() >= TIMED_RUN_MS) {
        finish("time");
        return;
      }
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
      if (timed) {
        // No step in between: on to the next position, or the end of the run.
        if (correct) solved++;
        else misses++;
        flash.hidden = false;
        flash.dataset.result = correct ? "correct" : "miss";
        flash.textContent = correct
          ? `Correct: ${cellName(cell)} = ${digit}.`
          : `Missed: ${cellName(cell)} = ${digit}. Intended: ${placements(position.targets)}.`;
        announce.textContent = flash.textContent;
        // No focus handoff: a focused cell is selected, and a click on it would deselect it.
        if (misses >= TIMED_RUN_MISSES) finish("misses");
        else advance();
        return;
      }
      announce.textContent = `${
        correct
          ? `Correct: ${cellName(cell)} = ${digit} in ${(ms / 1000).toFixed(1)} seconds.`
          : `Not this time: ${cellName(cell)} = ${digit} is wrong. Intended placement: ${placements(position.targets)}.`
      } Found with ${foundWith(position)}. ${stepText(position)}`;
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
        if (timed && !ended) {
          finish("exhausted");
          return;
        }
      }
      clock.reset(0);
      runClock.sync();
      if (!timed) announce.textContent = "";
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
      // A timed run always shows its time left.
      timerText.hidden = !timed && !data.settings.trainShowClock && !answer;
      pause.hidden = !position || !!answer;
      score.textContent = `Solved ${solved} · Misses ${misses}/${TIMED_RUN_MISSES}`;
      summary.hidden = !ended;
      if (ended) {
        const empty = ended === "exhausted" && run.shown.size === 0;
        summaryTitle.textContent = empty
          ? "No category selected"
          : ended === "time"
            ? "Time is up"
            : ended === "misses"
              ? "Three misses"
              : "No positions left";
        summaryText.textContent = empty
          ? "Choose at least one category in Train."
          : `Solved ${solved} · Misses ${misses}`;
        summaryBest.textContent = `Best run: ${data.training.runs.best} solved`;
        flash.hidden = true;
      }
      pause.replaceChildren(icon(paused ? "play" : "pause"));
      pause.setAttribute("aria-label", paused ? "Resume" : "Pause");
      pause.setAttribute("aria-pressed", String(paused));
      shell.root.classList.toggle("paused", paused);
      cover.hidden = !paused;
      done.hidden = !!position || timed;
      if (!position && !timed) {
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
      // A timed run shows no step between positions.
      result.hidden = !answer || timed;
      if (answer && position && !timed) {
        resultTitle.textContent = answer.correct ? "Correct" : "Not this time";
        result.dataset.result = answer.correct ? "correct" : "miss";
        resultText.textContent = answer.correct
          ? `${cellName(answer.cell)} = ${answer.digit} in ${(answer.ms / 1000).toFixed(1)} s.`
          : `${cellName(answer.cell)} = ${answer.digit} is not the solution's digit. The streak starts again.`;
        intended.textContent = `Intended placement: ${placements(position.targets)}.`;
        intended.hidden = answer.correct;
        if (explained !== position) {
          explained = position;
          explanation.replaceChildren(explanationPanel(position));
        }
      }
      if (!position) surface.render(undefined);
      else if (!answer || timed) surface.render(positionOverlay(position));
      else {
        // After the answer: the engine's key step, drawn as the Solve screen draws a step.
        // The player's correct digit is drawn as a placement, never written to the board.
        const step = stepOverlay(
          position,
          answer.correct ? [answer.cell, answer.digit] : undefined,
        );
        surface.render({
          ...positionOverlay(position),
          ...step,
          correct: answer.correct ? new Set([answer.cell]) : undefined,
          focus: new Set([...(step.focus ?? []), answer.cell]),
        });
      }
      timerText.textContent = timed
        ? formatDuration(Math.max(0, TIMED_RUN_MS - runClock.elapsed()))
        : formatDuration(answer ? answer.ms : clock.elapsed());
    };

    const tick = setInterval(() => {
      clock.sync();
      if (timed) {
        runClock.sync();
        if (!ended && runClock.elapsed() >= TIMED_RUN_MS) finish("time");
        else if (!ended)
          timerText.textContent = formatDuration(Math.max(0, TIMED_RUN_MS - runClock.elapsed()));
      } else if (!answer) timerText.textContent = formatDuration(clock.elapsed());
    }, 250);
    // Losing focus or hiding the page pauses: the cover hides the board and the clock stops.
    const onActivity = () => {
      clock.sync();
      runClock.sync();
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
