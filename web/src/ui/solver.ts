import type { ScreenServices } from "../app/controller";
import type { SolveSource } from "../app/router";
import { emptyEditor, type Digit, type EditorState, type Settings, type Value } from "../domain/model";
import { reduceEditor } from "../domain/editor";
import { effectiveValues, isComplete, peersOf, toPuzzleString } from "../domain/classic";
import { createDraft, nextPuzzleName } from "../domain/library";
import { createSolverController, type SolverController } from "../app/solver-controller";
import { startWorker } from "../app/solver-worker";
import { formatDuration } from "../app/play-clock";
import { mountBoard, type BoardOverlay, type BoardView } from "./board";
import { countSummary, logicalSummary, solverStatus, cellName } from "./solver-copy";
import { el, button } from "./dom";
import { icon } from "./icons";
import { iconButton, labeledButton, menuButton, segmented, selectControl, type SelectSection } from "./components";
import { copyText, fullscreenButton, gameShell, toast } from "./game";
import { clueSummary, mountPuzzleSurface, type PuzzleSurface } from "./puzzle-editor";
import { openImportDialog } from "./import-dialog";
import { nameField } from "./creator";
import { renderSettingsSections, updateSetting } from "./settings-sections";

interface Effect {
  readonly kind: "place" | "remove";
  readonly cell: number;
  readonly symbol: number;
}
interface SolveStep {
  readonly index: number;
  readonly name: string;
  readonly effects: readonly Effect[];
  readonly values: readonly number[];
  readonly candidates?: readonly number[];
  readonly cells?: readonly number[];
}
interface SolveResult {
  readonly outcome: string;
  readonly code?: string;
  readonly human: string;
  readonly count: string;
  readonly solution: readonly number[] | null;
  readonly logicalValues: readonly number[];
  readonly steps: number;
}
type SolveEvent =
  | ({ readonly kind: "step" } & SolveStep)
  | { readonly kind: "precount"; readonly solution: readonly number[] }
  | { readonly kind: "progress"; readonly phase: string; readonly workUnits: number };

const editorFrom = (values: readonly number[]): EditorState => ({
  ...emptyEditor(),
  cells: values.map((value) => ({ value: value as Value, notes: [] })),
});
const digitsOf = (mask: number): Digit[] =>
  ([1, 2, 3, 4, 5, 6, 7, 8, 9] as Digit[]).filter((d) => mask & (1 << (d - 1)));

/** Default wiring: the controller owns one real module worker per run. */
export function classicSolverController(services: ScreenServices): SolverController {
  return createSolverController({
    clock: { now: () => Date.now() },
    newId: services.newId,
    workerFactory: {
      start: (request, handlers) => {
        const { requestId, input, options } = request as {
          requestId: string;
          input: { givens: number[] };
          options: { timeLimitMs?: number } | null;
        };
        // Engine Analyze stays disabled (docs/decisions.md D063): every run uses
        // Explain, and the Analyze/Explain switch only changes the presentation.
        return startWorker(
          { kind: "solve-classic", requestId, givens: input.givens, mode: "explain", timeLimitMs: options?.timeLimitMs },
          { onEvent: handlers.onEvent, onError: handlers.onError },
        );
      },
    },
  });
}

/** Human description of one deduction, e.g. "B4 = 5" or "Removes 7 from B3, B4". */
export function describeStep(step: Pick<SolveStep, "effects">): string {
  const placed = step.effects.filter((e) => e.kind === "place"),
    removed = step.effects.filter((e) => e.kind === "remove");
  const parts = placed.map((e) => `${cellName(e.cell)} = ${e.symbol}`);
  const bySymbol = new Map<number, number[]>();
  for (const e of removed) bySymbol.set(e.symbol, [...(bySymbol.get(e.symbol) ?? []), e.cell]);
  for (const [symbol, cells] of bySymbol)
    parts.push(`removes ${symbol} from ${cells.slice(0, 4).map(cellName).join(", ")}${cells.length > 4 ? ` +${cells.length - 4}` : ""}`);
  const text = parts.join("; ") || "No change";
  return text[0].toUpperCase() + text.slice(1);
}

/**
 * Solve screen: the same puzzle surface as Create for input, and a separate
 * solver panel for running, analyzing and explaining. Nothing is persisted
 * unless the user saves the puzzle as a draft.
 */
export function mountSolver(
  container: HTMLElement,
  services: ScreenServices,
  source?: SolveSource,
  solver: SolverController = classicSolverController(services),
): () => void {
  const settings = () => services.controller.snapshot().settings;
  const shell = gameShell(container, "solve");
  let editor = emptyEditor(),
    clues: readonly Value[] = Array(81).fill(0),
    phase: "edit" | "running" | "result" = "edit",
    steps: SolveStep[] = [],
    result: (Partial<SolveResult> & { error?: string }) | null = null,
    precount: readonly number[] | null = null,
    current = 0,
    startedAt = 0,
    finishedAt = 0,
    lastPhase = "human",
    autoplay: ReturnType<typeof setInterval> | undefined;
  let puzzleName = nextPuzzleName(services.controller.snapshot());

  // Top bar ------------------------------------------------------------------
  const name = nameField("Puzzle name", puzzleName, (value) => (puzzleName = value.trim() || nextPuzzleName(services.controller.snapshot())));
  const summary = el("span", undefined, "chip");
  summary.setAttribute("role", "status");
  summary.dataset.testid = "clue-summary";
  shell.title.append(name);
  shell.status.append(summary);

  const library = selectControl({
    label: "Library",
    placeholder: "Load a puzzle",
    icon: "library",
    sections: [],
    emptyText: "Your library is empty.",
    onSelect: (value) => {
      const [kind, ...rest] = value.split(":"),
        id = rest.join(":");
      load({ kind: kind as SolveSource["kind"], id });
    },
  });
  const importButton = labeledButton("upload", "Import", () =>
    openImportDialog({
      title: "Import puzzle",
      settings: settings(),
      confirmLabel: "Load puzzle",
      onImport: ([puzzle]) => {
        loadValues(puzzle.givens);
        if (puzzle.name) setName(puzzle.name);
      },
    }),
  );
  const more = menuButton(iconButton("more", "More actions", () => {}), () => {
    const values = editor.cells.map((c) => c.value);
    return [
      {
        label: "Copy puzzle",
        icon: "copy",
        onSelect: async () => toast((await copyText(toPuzzleString(values))) ? "Puzzle copied as 81 characters." : "Copying is blocked in this browser."),
      },
      {
        label: "Save as draft",
        icon: "save",
        disabled: !values.some(Boolean),
        onSelect: () => {
          const id = services.newId();
          services.controller.update((data) => createDraft(data, id, services.now(), values, puzzleName));
          toast(`“${puzzleName}” saved to your drafts.`);
        },
      },
      "separator",
      { label: "Clear board", icon: "reset", danger: true, disabled: phase !== "edit" || !values.some(Boolean), onSelect: () => {
        // Undoable, like Clear board in Create.
        editor = reduceEditor(inputContext, editor, { type: "reset" });
        render();
      } },
    ];
  });
  shell.actions.append(library.node, importButton, fullscreenButton(), more);

  // Solver panel --------------------------------------------------------------
  const panel = el("section", undefined, "solver-panel");
  panel.setAttribute("aria-label", "Solver");
  const view = segmented<Settings["solverView"]>({
    label: "Solver view",
    items: [
      { value: "analyze", label: "Analyze", icon: "eye" },
      { value: "explain", label: "Explain", icon: "flag" },
    ],
    value: settings().solverView,
    onChange: (value) => {
      updateSetting(services, "solverView", value);
      stopAutoplay();
      render();
    },
    className: "view-switch",
  });
  const solve = labeledButton("play", "Solve", () => run(), "primary solve-button");
  const cancel = labeledButton("stop", "Cancel", () => solver.cancel("user"), "cancel-button");
  const edit = labeledButton("pen", "Edit puzzle", () => backToEdit(), "edit-button");
  const status = el("p", "Ready", "solver-status");
  status.setAttribute("role", "status");
  status.dataset.testid = "solver-status";
  const feedback = el("p", undefined, "solver-feedback");
  const progress = el("div", undefined, "solver-progress");
  const progressBar = el("div", undefined, "progress-track");
  progressBar.setAttribute("role", "progressbar");
  progressBar.setAttribute("aria-label", "Solving");
  progressBar.append(el("span"));
  const progressStats = el("dl", undefined, "stats compact");
  progress.append(progressBar, progressStats);
  const analysis = el("div", undefined, "solver-analysis");
  analysis.dataset.testid = "solver-verification";
  const explain = el("div", undefined, "solver-explain");
  const options = el("details", undefined, "solver-options");
  const optionsSummary = el("summary");
  optionsSummary.append(icon("settings"), el("span", "Solver options"));
  options.append(optionsSummary);
  const offOptions = renderSettingsSections(options, services, ["solver"]);
  const controls = el("div", undefined, "solver-actions");
  controls.append(solve, cancel, edit);
  panel.append(view.node, controls, status, progress, feedback, analysis, explain, options);
  shell.side.append(panel);

  // Explain navigator
  const nav = el("div", undefined, "step-nav");
  const first = iconButton("first", "First step", () => go(0)),
    prev = iconButton("chevronLeft", "Previous step", () => go(current - 1)),
    next = iconButton("chevronRight", "Next step", () => go(current + 1)),
    last = iconButton("last", "Last step", () => go(visible().length - 1)),
    play = iconButton("play", "Play steps", () => (autoplay ? stopAutoplay() : startAutoplay()));
  const position = el("span", undefined, "step-position");
  position.setAttribute("aria-live", "polite");
  nav.append(first, prev, position, next, last, play);
  const stepCard = el("div", undefined, "step-card"),
    stepName = el("h3"),
    stepText = el("p");
  stepCard.append(stepName, stepText);
  const stepList = el("ol", undefined, "step-list");
  const legend = el("div", undefined, "legend");
  for (const [cls, label] of [["area", "Reasoning"], ["focus", "Changed"], ["removed", "Eliminated"]] as const) {
    const item = el("span", undefined, `legend-item ${cls}`);
    item.append(el("i"), el("span", label));
    legend.append(item);
  }
  const explainEmpty = el("p", undefined, "empty-note");
  explain.append(nav, stepCard, legend, stepList, explainEmpty);

  // Board: the shared editing surface while editing, a read-only view otherwise.
  let surface: PuzzleSurface | undefined, display: BoardView | undefined;
  const inputContext = { mode: "create" as const, givens: Array<Value>(81).fill(0) };
  const mountInput = () => {
    display?.destroy();
    display = undefined;
    surface ??= mountPuzzleSurface(shell, services, {
      mode: "create",
      givens: inputContext.givens,
      state: () => editor,
      display: () => ({ showConflicts: true, showNoteConflicts: false }),
      dispatch(action) {
        const nextState = reduceEditor(inputContext, editor, action);
        if (nextState === editor) return;
        editor = nextState;
        render();
      },
    });
    shell.side.prepend(surface.keypad.node);
  };
  const mountDisplay = () => {
    surface?.destroy();
    surface = undefined;
    if (display) return;
    const host = el("div", undefined, "board-host");
    shell.stage.prepend(host);
    display = mountBoard(host, {
      context: { mode: "play", givens: clues },
      state: editorFrom(clues),
      display: settings(),
      onAction: () => {},
      interactive: false,
      label: "Solver board",
    });
    const destroy = display.destroy;
    display.destroy = () => {
      destroy();
      host.remove();
    };
  };

  const setName = (value: string) => {
    puzzleName = value;
    name.value = value;
  };
  const loadValues = (values: readonly Value[]) => {
    solver.cancel("input");
    stopAutoplay();
    editor = editorFrom(values);
    phase = "edit";
    steps = [];
    result = null;
    mountInput();
    render();
  };
  const load = (from: SolveSource) => {
    const data = services.controller.snapshot();
    if (from.kind === "puzzle" && Object.hasOwn(data.puzzles, from.id)) {
      loadValues(data.puzzles[from.id].definition.givens);
      setName(data.puzzles[from.id].name);
    } else if (from.kind === "draft" && Object.hasOwn(data.drafts, from.id)) {
      loadValues(data.drafts[from.id].editor.cells.map((c) => c.value));
      setName(data.drafts[from.id].name);
    } else toast("That puzzle is no longer in your library.");
  };
  const run = () => {
    const values = editor.cells.map((c) => c.value);
    if (clueSummary(editor).conflicts) return;
    clues = values;
    steps = [];
    result = null;
    precount = null;
    current = 0;
    startedAt = performance.now();
    finishedAt = 0;
    lastPhase = "human";
    solver.replaceInput({ givens: values });
    solver.setOptions({ timeLimitMs: settings().solverTimeLimitS * 1000 });
    // Enter the running phase only after resetting input, whose "idle" notice is not a finished run.
    phase = "running";
    mountDisplay();
    solver.start();
    render();
  };
  const backToEdit = () => {
    solver.cancel("edit");
    stopAutoplay();
    phase = "edit";
    mountInput();
    render();
  };

  // Explain navigation
  /** Steps listed in Explain; hidden basic eliminations still shape each board state. */
  const visible = () => (settings().solverHideBasic ? steps.filter((step) => step.name !== "Basic elimination") : steps);
  let listedFor: unknown[] = [];
  const go = (index: number) => {
    const shown = visible();
    if (!shown.length) return;
    current = Math.max(0, Math.min(shown.length - 1, index));
    if (current === shown.length - 1) stopAutoplay();
    render();
    stepList.children[current]?.scrollIntoView({ block: "nearest" });
  };
  const startAutoplay = () => {
    const speed = settings().solverAutoplayMs;
    if (!speed || !visible().length) return;
    if (current >= visible().length - 1) current = 0;
    autoplay = setInterval(() => go(current + 1), speed);
    render();
  };
  function stopAutoplay() {
    if (autoplay) clearInterval(autoplay);
    autoplay = undefined;
  }
  const onKey = (event: KeyboardEvent) => {
    if (phase !== "result" || settings().solverView !== "explain" || event.target instanceof HTMLInputElement || document.querySelector("dialog[open]")) return;
    const target = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: visible().length - 1 }[event.key];
    if (target === undefined || event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    go(target);
  };
  document.addEventListener("keydown", onKey);

  // Rendering --------------------------------------------------------------------
  const stat = (list: HTMLElement, label: string, value: string) => list.append(el("dt", label), el("dd", value));
  const renderAnalysis = () => {
    analysis.replaceChildren();
    if (phase !== "result" || !result) return;
    const headline = el("div", undefined, "result-headline");
    const solved = result.count === "unique";
    headline.classList.toggle("good", solved);
    headline.classList.toggle("bad", result.count === "zero" || result.count === "multiple" || !!result.error);
    headline.append(icon(solved ? "check" : "flag"), el("h2", result.error ? "Solver error" : result.count === "unique" ? "Unique solution" : result.count === "multiple" ? "Multiple solutions" : result.count === "zero" ? "No solution" : "Inconclusive"));
    const detail = el("p", result.error ? result.error : countSummary(result.count ?? "unknown"), "result-detail");
    const logic = el("p", logicalSummary(result.human ?? "", result.steps ?? 0), "result-detail");
    const stats = el("dl", undefined, "stats");
    stat(stats, "Clues", String(clues.filter(Boolean).length));
    stat(stats, "Logical steps", String(steps.length));
    stat(stats, "Solved by logic", result.human === "solved" ? "Yes" : "No");
    stat(stats, "Time", `${((finishedAt - startedAt) / 1000).toFixed(1)} s`);
    analysis.append(headline, detail);
    if (logic.textContent) analysis.append(logic);
    analysis.append(stats);
    if (steps.length) {
      const counts = new Map<string, number>();
      for (const step of steps) counts.set(step.name, (counts.get(step.name) ?? 0) + 1);
      const techniques = el("div", undefined, "technique-list");
      techniques.append(el("h3", "Techniques"));
      const list = el("ul");
      for (const [technique, count] of [...counts].sort((a, b) => b[1] - a[1])) {
        const item = el("li");
        item.append(el("span", technique), el("span", `×${count}`, "count"));
        list.append(item);
      }
      techniques.append(list);
      analysis.append(techniques);
    }
  };
  const renderExplain = (): { overlay: BoardOverlay; values: readonly number[] } | undefined => {
    const shown = visible();
    if (current >= shown.length) current = Math.max(0, shown.length - 1);
    explainEmpty.hidden = !!shown.length;
    nav.hidden = stepCard.hidden = legend.hidden = stepList.hidden = !shown.length;
    if (!shown.length) {
      explainEmpty.textContent = phase === "running"
        ? "Steps appear here as they are found."
        : result?.count === "multiple" || result?.count === "zero"
          ? "There are no logical steps to explain: " + countSummary(result.count).toLowerCase()
          : steps.length
            ? "Only basic eliminations were needed. Turn off “Hide basic eliminations” to see them."
            : "No logical steps were found.";
      return undefined;
    }
    if (listedFor.length !== shown.length || listedFor.some((step, i) => step !== shown[i])) {
      listedFor = shown;
      stepList.replaceChildren(
        ...shown.map((step, i) => {
          const item = el("li");
          const b = button("", () => go(i), "step-item");
          b.append(el("span", String(steps.indexOf(step) + 1), "step-number"), el("span", step.name, "step-name"), el("span", describeStep(step), "step-effects"));
          item.append(b);
          return item;
        }),
      );
    }
    [...stepList.querySelectorAll(".step-item")].forEach((b, i) => b.setAttribute("aria-current", String(i === current)));
    const step = shown[current],
      order = steps.indexOf(step);
    position.textContent = `Step ${current + 1} of ${shown.length}`;
    first.disabled = prev.disabled = current === 0;
    next.disabled = last.disabled = current >= shown.length - 1;
    play.hidden = !settings().solverAutoplayMs;
    play.replaceChildren(icon(autoplay ? "pause" : "play"));
    play.setAttribute("aria-label", autoplay ? "Pause steps" : "Play steps");
    stepName.textContent = step.name;
    stepText.textContent = describeStep(step);
    // Board shows the grid *before* the step, with its reasoning highlighted.
    const before = order === 0 ? clues : steps[order - 1].values;
    const focus = new Set(step.effects.map((e) => e.cell));
    const area = new Set(step.cells ?? []);
    if (!area.size) for (const cell of focus) for (const peer of peersOf(cell)) area.add(peer);
    const removed = new Map<number, Set<number>>();
    for (const e of step.effects) if (e.kind === "remove") removed.set(e.cell, new Set([...(removed.get(e.cell) ?? []), e.symbol]));
    const placed = new Map(step.effects.filter((e) => e.kind === "place").map((e) => [e.cell, e.symbol]));
    const showAll = settings().solverCandidates && step.candidates;
    const candidates = before.map((v, i) =>
      v ? null : showAll ? digitsOf(step.candidates![i]) : removed.has(i) ? ([...removed.get(i)!].sort() as Digit[]) : [],
    );
    return {
      values: before,
      overlay: { focus, area, removed, placed, candidates, derived: new Set(before.flatMap((v, i) => (v && !clues[i] ? [i] : []))) },
    };
  };
  const renderProgress = () => {
    progress.hidden = phase !== "running";
    if (phase !== "running") return;
    progressStats.replaceChildren();
    stat(progressStats, "Phase", lastPhase === "exact" ? "Verifying uniqueness" : "Finding logical steps");
    stat(progressStats, "Steps found", String(steps.length));
    stat(progressStats, "Elapsed", formatDuration(performance.now() - startedAt));
  };

  const fillLibrary = () => {
    const data = services.controller.snapshot();
    const describe = (givens: readonly Value[], extra?: string) =>
      [`${givens.filter(Boolean).length} clues`, extra].filter(Boolean).join(" · ");
    const sections: SelectSection[] = [
      {
        title: "Puzzles",
        options: Object.values(data.puzzles).map((p) => {
          const session = data.sessions[p.id];
          const state = !session ? undefined : isComplete(effectiveValues(session.editor, p.definition.givens)) ? "Solved" : "In progress";
          return { value: `puzzle:${p.id}`, label: p.name, description: describe(p.definition.givens, state) };
        }),
      },
      {
        title: "Drafts",
        options: Object.values(data.drafts)
          .filter((d) => !d.finishedPuzzleId)
          .map((d) => ({ value: `draft:${d.id}`, label: d.name, description: describe(d.editor.cells.map((c) => c.value)) })),
      },
    ];
    library.setSections(sections);
  };

  let elapsedTicker: ReturnType<typeof setInterval> | undefined;
  function render() {
    const running = phase === "running",
      s = settings();
    view.set(s.solverView);
    const { text, conflicts } = clueSummary(phase === "edit" ? editor : editorFrom(clues));
    summary.textContent = text;
    summary.classList.toggle("danger", !!conflicts);
    shell.root.dataset.phase = phase;
    solve.hidden = phase !== "edit";
    solve.disabled = !!conflicts || !editor.cells.some((c) => c.value);
    solve.title = conflicts ? "Resolve the highlighted conflicts first" : solve.disabled ? "Enter or import clues first" : "";
    cancel.hidden = !running;
    edit.hidden = phase !== "result";
    library.setDisabled(running);
    importButton.disabled = running;
    name.disabled = running;
    panel.setAttribute("aria-busy", String(running));
    feedback.hidden = phase !== "edit" || !conflicts;
    feedback.textContent = conflicts ? "Resolve the highlighted conflicts before solving." : "";
    feedback.classList.toggle("error", !!conflicts);
    status.hidden = phase === "edit";
    renderProgress();
    const explaining = s.solverView === "explain" && phase !== "edit";
    explain.hidden = !explaining;
    analysis.hidden = s.solverView !== "analyze" || phase !== "result";
    renderAnalysis();
    if (surface) surface.render();
    if (display) {
      const explained = explaining && phase === "result" ? renderExplain() : undefined;
      if (explained) display.update(editorFrom(explained.values), { ...s, highlightPeers: false, highlightSameDigit: false }, explained.overlay);
      else {
        if (explaining) renderExplain();
        const shown = phase === "running"
          ? steps.at(-1)?.values ?? precount ?? clues
          : result?.solution ?? result?.logicalValues ?? clues;
        display.update(editorFrom(shown), { ...s, highlightPeers: false, highlightSameDigit: false }, {
          derived: new Set(shown.flatMap((v, i) => (v && !clues[i] ? [i] : []))),
        });
      }
    }
    if (running && !elapsedTicker) elapsedTicker = setInterval(renderProgress, 500);
    if (!running && elapsedTicker) {
      clearInterval(elapsedTicker);
      elapsedTicker = undefined;
    }
  }

  let seenEvent: unknown = null,
    seenOutcome = "idle",
    seenRequest = "";
  const onSolver = () => {
    const snapshot = solver.snapshot();
    if (snapshot.requestId !== seenRequest) {
      seenRequest = snapshot.requestId;
      seenEvent = null;
    }
    const event = snapshot.lastEvent as SolveEvent | null;
    if (snapshot.outcome === "running" && event && event !== seenEvent) {
      seenEvent = event;
      if (event.kind === "step") steps.push(event);
      else if (event.kind === "precount") precount = event.solution;
      else if (event.kind === "progress") lastPhase = event.phase;
    }
    if (snapshot.outcome !== seenOutcome) {
      seenOutcome = snapshot.outcome;
      status.textContent = solverStatus(snapshot.outcome);
      if (snapshot.outcome !== "running" && snapshot.outcome !== "idle" && phase === "running") {
        finishedAt = performance.now();
        const value = snapshot.result as (Partial<SolveResult> & { error?: string }) | null;
        if (snapshot.outcome === "cancelled") {
          phase = "edit";
          mountInput();
          status.hidden = false;
        } else {
          phase = "result";
          result = value && typeof value.count === "string"
            ? value
            : { count: "unknown", error: `The solver stopped with an error${value?.error || value?.code ? `: ${value.error ?? value.code}` : ""}.` };
          status.textContent = solverStatus(result.outcome ?? snapshot.outcome);
          current = 0;
          if (settings().solverAutoplayMs && settings().solverView === "explain") startAutoplay();
        }
      }
    }
    render();
    if (snapshot.outcome === "cancelled") status.hidden = false;
  };

  mountInput();
  fillLibrary();
  if (source) load(source);
  render();
  const offSolver = solver.subscribe(onSolver),
    offLibrary = services.controller.subscribe(() => {
      fillLibrary();
      render();
    });
  return () => {
    stopAutoplay();
    if (elapsedTicker) clearInterval(elapsedTicker);
    document.removeEventListener("keydown", onKey);
    offSolver();
    offLibrary();
    offOptions();
    solver.dispose();
    surface?.destroy();
    display?.destroy();
    container.replaceChildren();
  };
}
