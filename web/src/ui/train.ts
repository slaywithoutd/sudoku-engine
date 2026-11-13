import type { ScreenServices } from "../app/controller";
import { createPlayClock, formatDuration, type PlayClock } from "../app/play-clock";
import type { BoardAction } from "../domain/editor";
import { reduceEditor } from "../domain/editor";
import {
  emptyEditor,
  type EditorState,
  type LibraryData,
  type ShortcutAction,
  type Value,
} from "../domain/model";
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
import { gameShell, type GameShell } from "./game";
import { cellName } from "./solver-copy";
import { mountPuzzleSurface, type PuzzleSurface } from "./puzzle-editor";
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

/** Why a timed run ended. */
type Ending = "time" | "misses" | "exhausted";
const ENDING_TITLES: Readonly<Record<Ending, string>> = {
  time: "Time is up",
  misses: "Three misses",
  exhausted: "No positions left",
};

/** What changes while a run screen runs. */
interface RunState {
  position: TrainingPosition | undefined;
  editor: EditorState;
  answer: Answer | undefined;
  paused: boolean;
  // Timed run state.
  solved: number;
  misses: number;
  ended: Ending | undefined;
  /** The position the key step panel was last built for. */
  explained: TrainingPosition | undefined;
}

/** The elements of the run screen that change while it runs. */
interface RunView {
  readonly timerText: HTMLElement;
  readonly pause: HTMLButtonElement;
  readonly streak: HTMLElement;
  readonly score: HTMLElement;
  readonly cover: HTMLElement;
  readonly result: HTMLElement;
  readonly resultTitle: HTMLElement;
  readonly resultText: HTMLElement;
  readonly intended: HTMLElement;
  readonly next: HTMLButtonElement;
  readonly explanation: HTMLElement;
  readonly kind: HTMLElement;
  readonly done: HTMLElement;
  readonly doneTitle: HTMLElement;
  readonly doneText: HTMLElement;
  readonly flash: HTMLElement;
  readonly summary: HTMLElement;
  readonly summaryTitle: HTMLElement;
  readonly summaryText: HTMLElement;
  readonly summaryBest: HTMLElement;
  readonly again: HTMLButtonElement;
  readonly announce: HTMLElement;
}

/** One mounted run screen: its fixed parts and its state. */
interface RunScreen {
  readonly services: ScreenServices;
  readonly shell: GameShell;
  readonly timed: boolean;
  readonly run: Sprint;
  readonly positions: readonly TrainingPosition[];
  /** The surface and the board read the givens by reference: refilled in place per position. */
  readonly givens: Value[];
  /** Active time of the current attempt only. */
  readonly clock: PlayClock;
  /** The run's own clock: active time of the whole run. */
  readonly runClock: PlayClock;
  readonly view: RunView;
  readonly surface: PuzzleSurface;
  readonly state: RunState;
}

interface RunHandlers {
  readonly togglePause: () => void;
  readonly resume: () => void;
  readonly next: (event: MouseEvent) => void;
  readonly again: (event: MouseEvent) => void;
}

const pageActive = () => document.visibilityState === "visible" && document.hasFocus();
const attemptOpen = (state: RunState) => !!state.position && !state.answer && !state.paused;

function buildStatus(shell: GameShell, timed: boolean, handlers: RunHandlers) {
  const timerText = el("span", "0:00", "timer-text");
  timerText.setAttribute("role", "timer");
  timerText.setAttribute("aria-label", timed ? "Time left" : "Attempt time");
  const pause = iconButton("pause", "Pause", handlers.togglePause, "timer-toggle");
  const timer = el("div", undefined, "timer");
  timer.append(timerText, pause);
  const streak = el("span", undefined, "train-streak");
  streak.dataset.testid = "train-streak";
  const score = el("span", undefined, "train-streak");
  score.dataset.testid = "train-score";
  score.hidden = !timed;
  shell.status.append(streak, score, timer);
  const cover = el("div", undefined, "pause-cover");
  const resume = button("", handlers.resume, "primary with-icon");
  resume.append(icon("play"), el("span", "Resume"));
  cover.append(el("p", "Paused", "pause-title"), resume);
  shell.stage.append(cover);
  return { timerText, pause, streak, score, cover };
}

/** The result panel, shown after the answer, and the position kind above it. */
function buildResult(shell: GameShell, services: ScreenServices, handlers: RunHandlers) {
  const result = el("section", undefined, "train-result");
  result.dataset.testid = "train-result";
  const resultTitle = el("h2"),
    resultText = el("p"),
    intended = el("p", undefined, "train-intended");
  // A keyboard press of Next (click detail 0) keeps keyboard focus on the board;
  // a mouse click leaves focus alone, so clicking the cell it would select still selects it.
  const next = button("", handlers.next, "primary with-icon");
  next.append(el("span", "Next"), icon("send"));
  const back = button("Back to Train", () => services.navigate({ screen: "train" }));
  const actions = el("div", undefined, "actions");
  actions.append(next, back);
  // The key step (spec §4.1 step 5, T5), rebuilt once per answered position.
  const explanation = el("div", undefined, "train-explanation-host");
  result.append(resultTitle, resultText, intended, explanation, actions);
  result.hidden = true;
  const kind = el("p", undefined, "train-kind");
  shell.side.prepend(result);
  shell.side.prepend(kind);
  return { result, resultTitle, resultText, intended, next, explanation, kind };
}

function buildDone(shell: GameShell, services: ScreenServices) {
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
  return { done, doneTitle, doneText };
}

/** Timed run: the last answer, and the summary at the end. */
function buildSummary(shell: GameShell, services: ScreenServices, handlers: RunHandlers) {
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
  const again = button("", handlers.again, "primary with-icon");
  again.append(icon("reset"), el("span", "Run again"));
  const summaryActions = el("div", undefined, "actions");
  summaryActions.append(
    again,
    button("Back to Train", () => services.navigate({ screen: "train" })),
  );
  summary.append(summaryTitle, summaryText, summaryBest, summaryActions);
  shell.side.prepend(flash);
  shell.side.prepend(summary);
  return { flash, summary, summaryTitle, summaryText, summaryBest, again };
}

function buildView(
  shell: GameShell,
  services: ScreenServices,
  timed: boolean,
  handlers: RunHandlers,
): RunView {
  const status = buildStatus(shell, timed, handlers),
    result = buildResult(shell, services, handlers),
    done = buildDone(shell, services),
    summary = buildSummary(shell, services, handlers);
  // Always present, so screen readers announce the result when its text changes.
  const announce = el("p", undefined, "sr-only");
  announce.setAttribute("role", "status");
  shell.side.append(announce);
  return { ...status, ...result, ...done, ...summary, announce };
}

function setPaused(screen: RunScreen, value: boolean) {
  const { state } = screen;
  if (!state.position || state.answer || state.ended) return;
  screen.clock.sync();
  screen.runClock.sync();
  state.paused = value;
  screen.clock.sync();
  screen.runClock.sync();
  render(screen);
}

function finish(screen: RunScreen, reason: Ending) {
  const { state, runClock, view } = screen;
  if (state.ended) return;
  runClock.sync();
  const ms =
    reason === "time" ? TIMED_RUN_MS : Math.min(TIMED_RUN_MS, Math.round(runClock.elapsed()));
  state.ended = reason;
  state.position = undefined;
  state.answer = undefined;
  screen.givens.fill(0);
  state.editor = emptyEditor();
  // Recorded exactly once: `ended` guards every later call. A run that never
  // showed a position (every category off) is not a run.
  const record = { at: screen.services.now(), solved: state.solved, misses: state.misses, ms };
  if (reason !== "exhausted" || screen.run.shown.size > 0)
    screen.services.controller.update((data) => ({
      ...data,
      training: recordRun(data.training, record),
    }));
  view.announce.textContent = `Run over: ${state.solved} solved, ${state.misses} missed.`;
  render(screen);
  setTimeout(() => view.again.isConnected && view.again.focus());
}

function restart(screen: RunScreen, fromKeyboard: boolean) {
  const { state } = screen;
  screen.run.shown.clear();
  screen.run.previous = undefined;
  state.solved = 0;
  state.misses = 0;
  state.ended = undefined;
  screen.view.flash.hidden = true;
  screen.runClock.reset(0);
  advance(screen, fromKeyboard);
}

/** Timed run: no step in between, on to the next position or the end of the run. */
function answerTimed(
  screen: RunScreen,
  position: TrainingPosition,
  [cell, digit]: readonly [number, number],
  correct: boolean,
) {
  const { state, view } = screen;
  if (correct) state.solved++;
  else state.misses++;
  view.flash.hidden = false;
  view.flash.dataset.result = correct ? "correct" : "miss";
  view.flash.textContent = correct
    ? `Correct: ${cellName(cell)} = ${digit}.`
    : `Missed: ${cellName(cell)} = ${digit}. Intended: ${placements(position.targets)}.`;
  view.announce.textContent = view.flash.textContent;
  // No focus handoff: a focused cell is selected, and a click on it would deselect it.
  if (state.misses >= TIMED_RUN_MISSES) finish(screen, "misses");
  else advance(screen);
}

/** What a screen reader hears after a sprint answer. */
function sprintAnnouncement(position: TrainingPosition, answer: Answer): string {
  const placed = `${cellName(answer.cell)} = ${answer.digit}`,
    intended = placements(position.targets);
  const verdict = answer.correct
    ? `Correct: ${placed} in ${(answer.ms / 1000).toFixed(1)} seconds.`
    : `Not this time: ${placed} is wrong. Intended placement: ${intended}.`;
  return `${verdict} Found with ${foundWith(position)}. ${stepText(position)}`;
}

function submit(screen: RunScreen, cell: number, digit: number) {
  const { state, clock, runClock, services } = screen;
  const position = state.position;
  if (!position) return;
  // An answer after the time limit, before the next tick, does not count.
  runClock.sync();
  if (screen.timed && runClock.elapsed() >= TIMED_RUN_MS) {
    finish(screen, "time");
    return;
  }
  clock.sync();
  const ms = Math.round(clock.elapsed()),
    correct = isCorrect(position, cell, digit);
  const answer = { cell, digit, correct, ms };
  state.answer = answer;
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
  if (screen.timed) {
    answerTimed(screen, position, [cell, digit], correct);
    return;
  }
  screen.view.announce.textContent = sprintAnnouncement(position, answer);
  render(screen);
  // After the surface has refocused the cell it dispatched from.
  setTimeout(() => {
    if (state.answer && screen.view.next.isConnected) screen.view.next.focus();
  });
}

function advance(screen: RunScreen, fromKeyboard = false) {
  const { state, services } = screen;
  const data = services.controller.snapshot();
  state.position = nextPosition(screen.positions, data.training, {
    categoriesOff: data.settings.trainCategoriesOff,
    shown: screen.run.shown,
    random: Math.random,
    previous: screen.run.previous,
    repeatGap: data.settings.trainRepeatGap,
  });
  state.answer = undefined;
  state.paused = false;
  if (state.position) {
    screen.run.shown.add(state.position.id);
    screen.run.previous = state.position.id;
    screen.givens.splice(0, 81, ...(digitsOf(state.position.values) as Value[]));
    state.editor = editorFor(state.position);
  } else {
    // The sprint has shown every position: clear the board.
    screen.givens.fill(0);
    state.editor = emptyEditor();
    if (screen.timed && !state.ended) {
      finish(screen, "exhausted");
      return;
    }
  }
  screen.clock.reset(0);
  screen.runClock.sync();
  if (!screen.timed) screen.view.announce.textContent = "";
  render(screen);
  // Mounted or advanced without focus: cover the board, as losing focus would.
  if (state.position && !pageActive()) setPaused(screen, true);
  // Next disappears with the result: keep keyboard focus on the board (its
  // focused cell is selected).
  if (fromKeyboard)
    screen.shell.root
      .querySelector<HTMLElement>('.cell[tabindex="0"]')
      ?.focus({ preventScroll: true });
}

function dispatch(screen: RunScreen, action: BoardAction) {
  const { state } = screen;
  if (!attemptOpen(state)) {
    if (action.type === "select" || action.type === "move")
      state.editor = reduceEditor({ mode: "play", givens: screen.givens }, state.editor, action);
    render(screen);
    return;
  }
  // Only a digit answers; a note modifier (Shift or Ctrl with a digit) does nothing here.
  if (action.type === "digit") {
    if (action.tool !== "value") return;
    const cell = state.editor.selected;
    if (cell >= 0 && !screen.givens[cell]) submit(screen, cell, action.digit);
    return;
  }
  // Selection only: notes are read-only and nothing else edits a training board.
  if (action.type === "select" || action.type === "move")
    state.editor = reduceEditor({ mode: "play", givens: screen.givens }, state.editor, action);
  render(screen);
}

function command(screen: RunScreen, action: ShortcutAction): boolean {
  if (action === "pause") {
    setPaused(screen, !screen.state.paused);
    return true;
  }
  return action === "undo" || action === "redo" || action === "erase" || action === "autofill";
}

function renderStatus(screen: RunScreen, data: LibraryData) {
  const { state, view } = screen;
  view.streak.textContent = `Streak ${data.training.streak}`;
  // A timed run always shows its time left.
  view.timerText.hidden = !screen.timed && !data.settings.trainShowClock && !state.answer;
  view.pause.hidden = !state.position || !!state.answer;
  view.score.textContent = `Solved ${state.solved} · Misses ${state.misses}/${TIMED_RUN_MISSES}`;
}

function renderSummary(screen: RunScreen, data: LibraryData) {
  const { state, view } = screen;
  view.summary.hidden = !state.ended;
  if (!state.ended) return;
  const empty = state.ended === "exhausted" && screen.run.shown.size === 0;
  view.summaryTitle.textContent = empty ? "No category selected" : ENDING_TITLES[state.ended];
  view.summaryText.textContent = empty
    ? "Choose at least one category in Train."
    : `Solved ${state.solved} · Misses ${state.misses}`;
  view.summaryBest.textContent = `Best run: ${data.training.runs.best} solved`;
  view.flash.hidden = true;
}

function renderPause(screen: RunScreen) {
  const { state, view } = screen;
  view.pause.replaceChildren(icon(state.paused ? "play" : "pause"));
  view.pause.setAttribute("aria-label", state.paused ? "Resume" : "Pause");
  view.pause.setAttribute("aria-pressed", String(state.paused));
  screen.shell.root.classList.toggle("paused", state.paused);
  view.cover.hidden = !state.paused;
}

function renderDone(screen: RunScreen, data: LibraryData) {
  const { state, view } = screen;
  view.done.hidden = !!state.position || screen.timed;
  if (state.position || screen.timed) return;
  const none = packCategories(screen.positions).every((category) =>
    data.settings.trainCategoriesOff.includes(category),
  );
  view.doneTitle.textContent = none ? "No category selected" : "Sprint complete";
  view.doneText.textContent = none
    ? "Choose at least one category in Train."
    : "You have seen every position in the selected categories in this sprint.";
}

function renderKind(screen: RunScreen) {
  const { state, view } = screen;
  view.kind.hidden = !state.position;
  if (state.position)
    view.kind.textContent =
      state.position.kind === "scan"
        ? "Scan: place any digit you can find from the placed digits."
        : "Technique: the notes are the candidates. Place any digit you can find.";
}

function renderResult(screen: RunScreen) {
  const { state, view } = screen;
  // A timed run shows no step between positions.
  view.result.hidden = !state.answer || screen.timed;
  const { answer, position } = state;
  if (!answer || !position || screen.timed) return;
  const placed = `${cellName(answer.cell)} = ${answer.digit}`;
  view.resultTitle.textContent = answer.correct ? "Correct" : "Not this time";
  view.result.dataset.result = answer.correct ? "correct" : "miss";
  view.resultText.textContent = answer.correct
    ? `${placed} in ${(answer.ms / 1000).toFixed(1)} s.`
    : `${placed} is not the solution's digit. The streak starts again.`;
  view.intended.textContent = `Intended placement: ${placements(position.targets)}.`;
  view.intended.hidden = answer.correct;
  if (state.explained !== position) {
    state.explained = position;
    view.explanation.replaceChildren(explanationPanel(position));
  }
}

function renderBoard(screen: RunScreen) {
  const { answer, position } = screen.state;
  if (!position) screen.surface.render(undefined);
  else if (!answer || screen.timed) screen.surface.render(positionOverlay(position));
  else {
    // After the answer: the engine's key step, drawn as the Solve screen draws a step.
    // The player's correct digit is drawn as a placement, never written to the board.
    const step = stepOverlay(position, answer.correct ? [answer.cell, answer.digit] : undefined);
    screen.surface.render({
      ...positionOverlay(position),
      ...step,
      correct: answer.correct ? new Set([answer.cell]) : undefined,
      focus: new Set([...(step.focus ?? []), answer.cell]),
    });
  }
}

function render(screen: RunScreen) {
  screen.clock.sync();
  const data = screen.services.controller.snapshot();
  renderStatus(screen, data);
  renderSummary(screen, data);
  renderPause(screen);
  renderDone(screen, data);
  renderKind(screen);
  renderResult(screen);
  renderBoard(screen);
  const { answer } = screen.state;
  screen.view.timerText.textContent = screen.timed
    ? formatDuration(Math.max(0, TIMED_RUN_MS - screen.runClock.elapsed()))
    : formatDuration(answer ? answer.ms : screen.clock.elapsed());
}

function tick(screen: RunScreen) {
  const { state, runClock, view } = screen;
  screen.clock.sync();
  if (screen.timed) {
    runClock.sync();
    if (!state.ended && runClock.elapsed() >= TIMED_RUN_MS) finish(screen, "time");
    else if (!state.ended)
      view.timerText.textContent = formatDuration(Math.max(0, TIMED_RUN_MS - runClock.elapsed()));
  } else if (!state.answer) view.timerText.textContent = formatDuration(screen.clock.elapsed());
}

function initialState(): RunState {
  return {
    position: undefined,
    editor: emptyEditor(),
    answer: undefined,
    paused: false,
    solved: 0,
    misses: 0,
    ended: undefined,
    explained: undefined,
  };
}

/** Losing focus or hiding the page pauses: the cover hides the board and the clock stops. */
function watchActivity(screen: RunScreen): () => void {
  const onActivity = () => {
    screen.clock.sync();
    screen.runClock.sync();
    if (!pageActive() && attemptOpen(screen.state)) setPaused(screen, true);
  };
  document.addEventListener("visibilitychange", onActivity);
  addEventListener("blur", onActivity);
  addEventListener("focus", onActivity);
  return () => {
    document.removeEventListener("visibilitychange", onActivity);
    removeEventListener("blur", onActivity);
    removeEventListener("focus", onActivity);
  };
}

function runPositions(
  shell: GameShell,
  services: ScreenServices,
  timed: boolean,
  run: Sprint,
  positions: readonly TrainingPosition[],
): () => void {
  const state = initialState();
  const givens: Value[] = Array<Value>(81).fill(0);
  const environment = { now: () => performance.now(), pageActive };
  const clock = createPlayClock(0, () => attemptOpen(state), environment);
  const runClock = createPlayClock(
    0,
    () => timed && !state.ended && !!state.position && !state.paused,
    environment,
  );
  const view = buildView(shell, services, timed, {
    togglePause: () => setPaused(screen, !state.paused),
    resume: () => setPaused(screen, false),
    next: (event) => advance(screen, event.detail === 0),
    again: (event) => restart(screen, event.detail === 0),
  });
  const surface = mountPuzzleSurface(shell, services, {
    mode: "play",
    givens,
    state: () => state.editor,
    dispatch: (action) => dispatch(screen, action),
    editable: () => attemptOpen(state),
    // While the key step is shown, only its own highlights (as on the Solve screen).
    display: () => (state.answer ? { highlightPeers: false, highlightSameDigit: false } : {}),
    command: (action) => command(screen, action),
  });
  shell.root.querySelector('[role="grid"]')?.setAttribute("aria-label", "Training position");
  const screen: RunScreen = {
    services,
    shell,
    timed,
    run,
    positions,
    givens,
    clock,
    runClock,
    view,
    surface,
    state,
  };

  const interval = setInterval(() => tick(screen), 250);
  const unwatch = watchActivity(screen);
  const off = services.controller.subscribe(() => render(screen));
  advance(screen);
  return () => {
    clearInterval(interval);
    off();
    unwatch();
    surface.destroy();
  };
}

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
      teardown = runPositions(shell, services, timed, run, pack.positions);
    })
    .catch((error: Error) => {
      if (!disposed) loading.textContent = error.message;
    });

  return () => {
    disposed = true;
    teardown();
  };
}
