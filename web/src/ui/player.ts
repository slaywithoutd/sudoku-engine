import type { ScreenServices } from "../app/controller";
import { copyPuzzleToDraft, startPlay } from "../domain/library";
import { reduceEditor, type BoardAction } from "../domain/editor";
import { conflictingCells, effectiveValues, isComplete, toPuzzleString } from "../domain/classic";
import { newTimer, type PlaySession, type ShortcutAction, type TimerState } from "../domain/model";
import { gameExport } from "../domain/puzzle-format";
import { createPlayClock, formatDuration } from "../app/play-clock";
import { uniqueSolution } from "../app/solution";
import { missing } from "./creator";
import { el, button } from "./dom";
import { icon } from "./icons";
import { confirmDialog } from "./dialogs";
import { comboLabel, iconButton, menuButton, switchField } from "./components";
import {
  boardImage,
  copyCell,
  copyText,
  download,
  fileName,
  gameShell,
  hasCopiedCell,
  pasteCellAction,
  toast,
} from "./game";
import { mountPuzzleSurface } from "./puzzle-editor";
import { openQuickSettings } from "./settings";

const PERSIST_EVERY_MS = 10_000;

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
  const givens = puzzle.definition.givens,
    context = { mode: "play" as const, givens };
  const session = () => services.controller.snapshot().sessions[id] as PlaySession | undefined;
  const timerOf = (s = session()): TimerState => s?.timer ?? { ...newTimer("immediately") };
  const settings = () => services.controller.snapshot().settings;
  const complete = () => {
    const s = session();
    return !!s && isComplete(effectiveValues(s.editor, givens));
  };

  const shell = gameShell(container, "play");
  const title = el("h1", puzzle.name, "game-name");
  shell.title.append(title);

  // Timer ------------------------------------------------------------------
  const clock = createPlayClock(
    timerOf().elapsedMs,
    () => {
      const t = timerOf();
      return t.started && !t.paused && !complete();
    },
    {
      now: () => performance.now(),
      pageActive: () => document.visibilityState === "visible" && document.hasFocus(),
    },
  );
  let persisted = timerOf().elapsedMs;
  const writeTimer = (patch: Partial<TimerState> = {}) => {
    clock.sync();
    const elapsedMs = Math.round(clock.elapsed());
    services.controller.update((data) => {
      const s = data.sessions[id];
      if (!s) return data;
      const timer = { ...timerOf(s), elapsedMs, ...patch };
      const before = timerOf(s);
      if (
        timer.elapsedMs === before.elapsedMs &&
        timer.paused === before.paused &&
        timer.started === before.started &&
        s.timer
      )
        return data;
      persisted = timer.elapsedMs;
      return { ...data, sessions: { ...data.sessions, [id]: { ...s, timer } } };
    });
    clock.sync();
  };
  const timerText = el("span", "0:00", "timer-text");
  timerText.setAttribute("role", "timer");
  timerText.setAttribute("aria-label", "Elapsed time");
  const pause = iconButton("pause", "Pause", () => togglePause(), "timer-toggle");
  const timer = el("div", undefined, "timer");
  timer.append(timerText, pause);
  shell.status.append(timer);
  const togglePause = () => {
    if (complete()) return;
    const t = timerOf();
    // Resuming a game that waits for its first move starts it.
    writeTimer(t.paused ? { paused: false, started: true } : { paused: true });
  };
  const renderTime = () => {
    timerText.textContent = formatDuration(clock.elapsed());
  };
  const tick = setInterval(() => {
    clock.sync();
    renderTime();
    if (Math.abs(clock.elapsed() - persisted) >= PERSIST_EVERY_MS) writeTimer();
  }, 500);
  const onActivity = (event: Event) => {
    clock.sync();
    // Persist when leaving so a closed tab keeps its time.
    if (event.type === "pagehide" || document.visibilityState === "hidden") writeTimer();
  };
  document.addEventListener("visibilitychange", onActivity);
  addEventListener("focus", onActivity);
  addEventListener("blur", onActivity);
  addEventListener("pagehide", onActivity);

  // Pause cover and completion ----------------------------------------------
  const cover = el("div", undefined, "pause-cover");
  const resume = button("", () => togglePause(), "primary with-icon");
  resume.append(icon("play"), el("span", "Resume"));
  cover.append(el("p", "Paused", "pause-title"), resume);
  shell.stage.append(cover);

  const completion = el("section", undefined, "completion");
  completion.setAttribute("role", "status");
  completion.hidden = true;
  const completionText = el("p");
  const completionHead = el("div", undefined, "completion-head");
  completionHead.append(
    icon("check"),
    el("h2", "Solved"),
    iconButton(
      "close",
      "Dismiss message",
      () => {
        dismissed = true;
        completion.hidden = true;
      },
      "ghost",
    ),
  );
  completion.append(
    completionHead,
    completionText,
    button("Back to library", () => services.navigate({ screen: "library", tab: "puzzles" })),
  );
  shell.side.prepend(completion);
  let announced = complete(),
    dismissed = false,
    checkRequested = false,
    fullWarned = false;

  // Correct digits (only for unique puzzles) --------------------------------
  let solution: readonly number[] | null | undefined;
  const loadSolution = () => {
    if (solution !== undefined || !settings().markCorrectDigits) return;
    solution = null;
    void uniqueSolution(givens).then((found) => {
      solution = found;
      if (!found) solution = null;
      update();
    });
  };

  // Board -------------------------------------------------------------------
  const apply = (action: BoardAction) => {
    services.controller.update((data) => {
      const s = data.sessions[id];
      if (!s) return data;
      const editor = reduceEditor(context, s.editor, action);
      if (editor === s.editor) return data;
      const edited = editor.past !== s.editor.past;
      const t = timerOf(s);
      const timer = edited && !t.started ? { ...t, started: true } : s.timer;
      return {
        ...data,
        sessions: { ...data.sessions, [id]: { ...s, editor, timer, updatedAt: services.now() } },
      };
    });
    clock.sync();
  };
  const autofill = () => apply({ type: "autofill" });
  const surface = mountPuzzleSurface(shell, services, {
    mode: "play",
    givens,
    state: () => session()!.editor,
    dispatch: apply,
    editable: () => !timerOf().paused || complete(),
    onAutofill: autofill,
    command: (action) => {
      if (action === "pause") {
        togglePause();
        return true;
      }
      if (action === "autofill") {
        autofill();
        return true;
      }
      return false;
    },
  });

  // Top bar actions --------------------------------------------------------
  const quickSettings = iconButton("settings", "Game settings", () => openQuickSettings(services));
  const restart = () => {
    const alsoTimer = switchField({
      label: "Also reset the timer",
      checked: true,
      onChange: () => {},
    });
    confirmDialog({
      title: "Restart this puzzle?",
      message: "All digits, notes and colors are cleared. You can undo this.",
      confirm: "Restart",
      danger: true,
      extra: alsoTimer.node,
      onConfirm: () => {
        apply({ type: "reset" });
        if (alsoTimer.input.checked) {
          clock.reset(0);
          writeTimer({
            elapsedMs: 0,
            paused: false,
            started: settings().timerStart === "immediately",
          });
        }
        announced = false;
        update();
      },
    });
  };
  const checkNow = () => {
    const values = effectiveValues(session()!.editor, givens),
      empty = values.filter((v) => !v).length,
      conflicts = conflictingCells(values).length;
    checkRequested = true;
    if (!empty && !conflicts) update();
    else
      toast(
        conflicts
          ? `Not solved: ${conflicts} cells break a rule.`
          : `No conflicts so far · ${empty} cells left.`,
      );
  };
  const more = menuButton(
    iconButton("more", "More actions", () => {}),
    () => {
      const state = session()!.editor,
        shortcut = (action: ShortcutAction) =>
          comboLabel(settings().shortcuts[action]) || undefined;
      return [
        { label: "Check puzzle", icon: "check", onSelect: checkNow },
        "separator",
        {
          label: "Copy cell",
          icon: "copy",
          disabled: state.selected < 0,
          shortcut: shortcut("copyCell"),
          onSelect: () => copyCell(state, givens) && toast("Cell copied."),
        },
        {
          label: "Paste cell",
          icon: "paste",
          disabled: state.selected < 0 || !hasCopiedCell(),
          shortcut: shortcut("pasteCell"),
          onSelect: () => {
            const paste = pasteCellAction(session()!.editor);
            if (paste) apply(paste);
          },
        },
        {
          label: "Copy puzzle",
          icon: "copy",
          onSelect: async () =>
            toast(
              (await copyText(toPuzzleString(givens)))
                ? "Puzzle copied as 81 characters."
                : "Copying is blocked in this browser.",
            ),
        },
        {
          label: "Export game",
          icon: "download",
          onSelect: () => {
            writeTimer();
            const s = session()!;
            download(
              fileName(puzzle.name, "json"),
              new Blob(
                [
                  gameExport({
                    name: services.controller.snapshot().puzzles[id].name,
                    givens,
                    cells: s.editor.cells,
                    elapsedMs: timerOf(s).elapsedMs,
                  }),
                ],
                { type: "application/json" },
              ),
            );
          },
        },
        {
          label: "Save image",
          icon: "image",
          onSelect: async () =>
            download(fileName(puzzle.name, "png"), await boardImage(givens, session()!.editor)),
        },
        "separator",
        {
          label: "Open in solver",
          icon: "solve",
          onSelect: () => services.navigate({ screen: "solve", source: { kind: "puzzle", id } }),
        },
        {
          label: "Edit a copy",
          icon: "pen",
          onSelect: () => {
            const draftId = services.newId();
            services.controller.update((d) => copyPuzzleToDraft(d, id, draftId, services.now()));
            services.navigate({ screen: "create", id: draftId });
          },
        },
        "separator",
        { label: "Restart puzzle", icon: "reset", danger: true, onSelect: restart },
      ];
    },
  );
  shell.actions.append(quickSettings, more);

  const update = () => {
    const data = services.controller.snapshot(),
      s = data.sessions[id];
    if (!s) return;
    clock.sync();
    const t = timerOf(s),
      done = complete(),
      values = effectiveValues(s.editor, givens),
      full = values.every(Boolean);
    title.textContent = data.puzzles[id].name;
    // Correctness marks: player digits equal to the unique solution.
    if (data.settings.markCorrectDigits) loadSolution();
    const correct =
      data.settings.markCorrectDigits && solution
        ? new Set(values.flatMap((v, i) => (!givens[i] && v && v === solution![i] ? [i] : [])))
        : undefined;
    surface.render({ correct });
    timerText.hidden = !data.settings.showTimer;
    pause.hidden = done;
    const paused = t.paused && !done;
    pause.replaceChildren(icon(paused ? "play" : "pause"));
    pause.setAttribute("aria-label", paused ? "Resume" : "Pause");
    pause.title = paused ? "Resume" : "Pause";
    pause.setAttribute("aria-pressed", String(paused));
    shell.root.classList.toggle("paused", paused);
    cover.hidden = !paused;
    const waiting = !t.started && !done && !paused;
    timer.classList.toggle("waiting", waiting);
    timer.title = waiting ? "The timer starts with your first move" : "";
    timer.classList.toggle("done", done);
    // Completion: stop the clock always; announce when checking is on or requested.
    if (done && (data.settings.checkOnFinish || checkRequested)) {
      if (!announced) {
        announced = true;
        // Persist the final time outside this render pass.
        queueMicrotask(() => writeTimer());
      }
      completionText.textContent = data.settings.showTimer
        ? `Time ${formatDuration(timerOf().elapsedMs)}`
        : "Every row, column and box is complete.";
      completion.hidden = dismissed;
    } else completion.hidden = true;
    if (!done) {
      announced = false;
      // A new complete transition shows the message again.
      dismissed = false;
      checkRequested = checkRequested && full;
    }
    if (full && !done && data.settings.checkOnFinish) {
      if (!fullWarned) toast("The grid is full but something is not right.");
      fullWarned = true;
    } else if (!full) fullWarned = false;
    renderTime();
  };
  update();
  const off = services.controller.subscribe(update);

  return () => {
    writeTimer();
    clearInterval(tick);
    off();
    document.removeEventListener("visibilitychange", onActivity);
    removeEventListener("focus", onActivity);
    removeEventListener("blur", onActivity);
    removeEventListener("pagehide", onActivity);
    surface.destroy();
  };
}
