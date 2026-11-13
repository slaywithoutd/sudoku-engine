import type { ScreenServices } from "../app/controller";
import type { SolveSource } from "../app/router";
import {
  emptyEditor,
  type Digit,
  type EditorState,
  type Settings,
  type Value,
} from "../domain/model";
import { reduceEditor } from "../domain/editor";
import { effectiveValues, isComplete, peersOf, toPuzzleString } from "../domain/classic";
import { lookup } from "../domain/invariants";
import { createDraft, nextPuzzleName } from "../domain/library";
import { createSolverController, type SolverController } from "../app/solver-controller";
import { startWorker } from "../app/solver-worker";
import { formatDuration } from "../app/play-clock";
import { mountBoard, type BoardOverlay, type BoardView } from "./board";
import {
  cellName,
  countSummary,
  countVerification,
  coverageLine,
  logicalSummary,
  logicStop,
  setLimitedSummary,
  solverStatus,
  stepNoteText,
} from "./solver-copy";
import { techniqueSelectionOf, techniqueSetText } from "./technique-selection";
import { el, button } from "./dom";
import { icon } from "./icons";
import {
  iconButton,
  labeledButton,
  menuButton,
  selectControl,
  type SelectSection,
} from "./components";
import { copyText, gameShell, toast } from "./game";
import { clueSummary, mountPuzzleSurface, type PuzzleSurface } from "./puzzle-editor";
import { openImportDialog } from "./import-dialog";
import { nameField } from "./creator";
import { renderSettingsSections } from "./settings-sections";

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
  readonly budgetLimited?: boolean;
  readonly setLimited?: boolean;
}
interface SolveResult {
  readonly outcome: string;
  readonly code?: string;
  readonly human: string;
  readonly count: string;
  readonly solution: readonly number[] | null;
  readonly logicalValues: readonly number[];
  readonly steps: number;
  readonly stopReason?: string;
  readonly countVerifiedMs?: number;
  readonly coverage?: {
    readonly exhausted: readonly string[];
    readonly capped: readonly string[];
    readonly notStarted: readonly string[];
    readonly highestTierTried: number;
  };
  readonly budgetLimitedSteps?: number;
  readonly difficulty?: { readonly maxTier: number; readonly stepsByTier: readonly number[] };
  readonly techniqueSet?: {
    readonly enabled: readonly string[];
    readonly notSelected: readonly string[];
    readonly lowestTierNotSelected: number;
    readonly setLimitedSteps: number;
  };
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
          options: { timeLimitMs?: number; techniqueSelection?: unknown } | null;
        };
        // Engine Analyze stays disabled (docs/decisions.md D063, D105): every run
        // uses Explain, and the Solve screen has one view, the steps with a summary.
        return startWorker(
          {
            kind: "solve-classic",
            requestId,
            givens: input.givens,
            mode: "explain",
            timeLimitMs: options?.timeLimitMs,
            ...(options?.techniqueSelection === undefined
              ? {}
              : { techniqueSelection: options.techniqueSelection }),
          },
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
    parts.push(
      `removes ${symbol} from ${cells.slice(0, 4).map(cellName).join(", ")}${cells.length > 4 ? ` +${cells.length - 4}` : ""}`,
    );
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
  const name = nameField(
    "Puzzle name",
    puzzleName,
    (value) => (puzzleName = value.trim() || nextPuzzleName(services.controller.snapshot())),
  );
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
  const more = menuButton(
    iconButton("more", "More actions", () => {}),
    () => {
      const values = editor.cells.map((c) => c.value);
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
          label: "Save as draft",
          icon: "save",
          disabled: !values.some(Boolean),
          onSelect: () => {
            const id = services.newId();
            services.controller.update((data) =>
              createDraft(data, id, services.now(), values, puzzleName),
            );
            toast(`“${puzzleName}” saved to your drafts.`);
          },
        },
        "separator",
        {
          label: "Clear board",
          icon: "reset",
          danger: true,
          disabled: phase !== "edit" || !values.some(Boolean),
          onSelect: () => {
            // Undoable, like Clear board in Create.
            editor = reduceEditor(inputContext, editor, { type: "reset" });
            render();
          },
        },
      ];
    },
  );
  shell.actions.append(library.node, importButton, more);

  // Solver panel --------------------------------------------------------------
  const panel = el("section", undefined, "solver-panel");
  panel.setAttribute("aria-label", "Solver");
  const solve = labeledButton("play", "Solve", () => run(), "primary solve-button");
  const cancel = labeledButton("stop", "Cancel", () => solver.cancel("user"), "cancel-button");
  const edit = labeledButton("pen", "Edit puzzle", () => backToEdit(), "edit-button");
  // The set of the next run while editing, the set of the shown run afterwards.
  const techniqueSet = el("p", undefined, "technique-set");
  techniqueSet.dataset.testid = "technique-set";
  let runTechniques = "";
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
  // One Solve view (M2.7 S4, D105): the run's summary is a header above the
  // step list, collapsed to one line so the steps stay in view.
  const header = el("details", undefined, "solve-summary");
  header.dataset.testid = "solve-summary";
  const headerLine = el("summary");
  const analysis = el("div", undefined, "solver-analysis");
  analysis.dataset.testid = "solver-verification";
  header.append(headerLine, analysis);
  let showSolution = false;
  const explain = el("div", undefined, "solver-explain");
  const options = el("details", undefined, "solver-options");
  const optionsSummary = el("summary");
  optionsSummary.append(icon("settings"), el("span", "Solver options"));
  options.append(optionsSummary);
  const offOptions = renderSettingsSections(options, services, ["solver"]);
  const controls = el("div", undefined, "solver-actions");
  controls.append(solve, cancel, edit);
  panel.append(controls, techniqueSet, status, progress, feedback, header, explain, options);
  shell.side.append(panel);

  // Step navigator
  const nav = el("div", undefined, "step-nav");
  const first = iconButton("first", "First step", () => go(0)),
    prev = iconButton("chevronLeft", "Previous step", () => go(current - 1)),
    next = iconButton("chevronRight", "Next step", () => go(current + 1)),
    last = iconButton("last", "Last step", () => go(visible().length - 1)),
    play = iconButton("play", "Play steps", () => (autoplay ? stopAutoplay() : startAutoplay()));
  const position = el("span", undefined, "step-position");
  position.setAttribute("aria-live", "polite");
  // Shows the solved grid, or the grid where the logic stopped, instead of
  // the current step. Created once so it keeps focus; aria-pressed carries
  // its state and its label names what it shows (S4 review).
  const solutionToggle = labeledButton(
    "eye",
    "Show solution",
    () => {
      showSolution = !showSolution;
      stopAutoplay();
      render();
    },
    "ghost solution-toggle",
  );
  nav.append(first, prev, position, next, last, play);
  const stepCard = el("div", undefined, "step-card"),
    stepName = el("h3"),
    stepText = el("p");
  const stepNote = el("p", undefined, "step-note");
  stepNote.hidden = true;
  stepCard.append(stepName, stepText, stepNote);
  const stepList = el("ol", undefined, "step-list");
  const legend = el("div", undefined, "legend");
  for (const [cls, label] of [
    ["area", "Reasoning"],
    ["focus", "Changed"],
    ["removed", "Eliminated"],
  ] as const) {
    const item = el("span", undefined, `legend-item ${cls}`);
    item.append(el("i"), el("span", label));
    legend.append(item);
  }
  const explainEmpty = el("p", undefined, "empty-note");
  explain.append(nav, stepCard, solutionToggle, legend, stepList, explainEmpty);

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
    // Conflicting clues run too: the engine proves there is no solution (spec M2.6 §4.5).
    const values = editor.cells.map((c) => c.value);
    clues = values;
    steps = [];
    result = null;
    precount = null;
    current = 0;
    startedAt = performance.now();
    finishedAt = 0;
    lastPhase = "human";
    // Each run's summary starts collapsed, so the steps stay in view (spec §4.2).
    header.open = false;
    solver.replaceInput({ givens: values });
    const selection = techniqueSelectionOf(settings());
    runTechniques = techniqueSetText(settings());
    solver.setOptions({
      timeLimitMs: settings().solverTimeLimitS * 1000,
      ...(selection ? { techniqueSelection: selection } : {}),
    });
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

  // Step navigation
  /** Steps listed; hidden basic eliminations still shape each board state. */
  const visible = () =>
    settings().solverHideBasic ? steps.filter((step) => step.name !== "Basic elimination") : steps;
  let listedFor: SolveStep[] = [];
  const go = (index: number) => {
    const shown = visible();
    if (!shown.length) return;
    current = Math.max(0, Math.min(shown.length - 1, index));
    showSolution = false;
    if (current === shown.length - 1) stopAutoplay();
    render();
    stepList.children.item(current)?.scrollIntoView({ block: "nearest" });
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
    if (
      phase !== "result" ||
      event.target instanceof HTMLInputElement ||
      document.querySelector("dialog[open]")
    )
      return;
    const target = {
      ArrowRight: current + 1,
      ArrowLeft: current - 1,
      Home: 0,
      End: visible().length - 1,
    }[event.key];
    if (target === undefined || event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    go(target);
  };
  document.addEventListener("keydown", onKey);

  // Rendering --------------------------------------------------------------------
  const stat = (list: HTMLElement, label: string, value: string) =>
    list.append(el("dt", label), el("dd", value));
  const renderAnalysis = () => {
    analysis.replaceChildren();
    headerLine.replaceChildren();
    if (phase !== "result" || !result) return;
    // Phrasing content only: the headline sits inside <summary>.
    const headline = el("span", undefined, "result-headline");
    const solved = result.count === "unique";
    headline.classList.toggle("good", solved);
    headline.classList.toggle(
      "bad",
      result.count === "zero" || result.count === "multiple" || !!result.error,
    );
    headline.append(
      icon(solved ? "check" : "flag"),
      el(
        "h2",
        result.error
          ? "Solver error"
          : result.count === "unique"
            ? "Unique solution"
            : result.count === "multiple"
              ? "Multiple solutions"
              : result.count === "zero"
                ? "No solution"
                : "Inconclusive",
      ),
    );
    const detail = el(
      "p",
      result.error ? result.error : countSummary(result.count ?? "unknown"),
      "result-detail",
    );
    const restricted = !!result.techniqueSet;
    const logic = el(
      "p",
      logicalSummary(result.human ?? "", result.steps ?? 0, restricted),
      "result-detail",
    );
    const verification = el(
      "p",
      result.error
        ? ""
        : countVerification(result.count ?? "unknown", result.countVerifiedMs, result.outcome),
      "result-detail",
    );
    verification.dataset.testid = "count-verification";
    const stop = el(
      "p",
      logicStop(result.human ?? "", result.stopReason, result.coverage, restricted),
      "result-detail",
    );
    stop.dataset.testid = "logic-stop";
    const coverage = el(
      "p",
      result.coverage
        ? coverageLine(result.coverage, result.techniqueSet?.notSelected.length ?? 0)
        : "",
      "result-detail",
    );
    coverage.dataset.testid = "technique-coverage";
    const setLimited = el(
      "p",
      setLimitedSummary(result.techniqueSet?.setLimitedSteps ?? 0),
      "result-detail",
    );
    setLimited.dataset.testid = "set-limited-summary";
    const stats = el("dl", undefined, "stats");
    stat(stats, "Clues", String(clues.filter(Boolean).length));
    stat(stats, "Logical steps", String(steps.length));
    // A restricted run says nothing about the full catalogue (S1 note §5.2).
    stat(
      stats,
      restricted ? "Solved with the selected techniques" : "Solved by logic",
      result.human === "solved" ? "Yes" : "No",
    );
    stat(stats, "Time", `${((finishedAt - startedAt) / 1000).toFixed(1)} s`);
    // The collapsed line: the count's verdict and where the logic ended.
    const line = el(
      "span",
      result.error
        ? result.error
        : result.human === "solved"
          ? "Solved by logic"
          : stop.textContent.replace(/^Logic: /, "") ||
            logicalSummary(result.human ?? "", result.steps ?? 0, restricted),
      "summary-line",
    );
    line.title = line.textContent;
    headerLine.append(headline, line);
    const difficulty = result.difficulty;
    const highest = el(
      "p",
      !difficulty || result.error
        ? ""
        : `Highest tier used: ${
            difficulty.maxTier < 0 ? "none, basic eliminations only" : difficulty.maxTier
          }${restricted ? " (with the selected techniques)" : ""}`,
      "result-detail",
    );
    highest.dataset.testid = "highest-tier";
    const perTier = el(
      "p",
      !difficulty || result.error
        ? ""
        : `Steps per tier: ${
            difficulty.stepsByTier
              .flatMap((count, index) =>
                count
                  ? [`${index === 0 ? "Basic elimination" : `tier ${index - 1}`} ${count}`]
                  : [],
              )
              .join(", ") || "none"
          }`,
      "result-detail",
    );
    perTier.dataset.testid = "steps-per-tier";
    const lists = el("dl", undefined, "coverage-lists");
    lists.dataset.testid = "coverage-lists";
    for (const [label, names] of [
      ["Exhausted", result.coverage?.exhausted],
      ["Capped", result.coverage?.capped],
      ["Not started", result.coverage?.notStarted],
      ["Not selected", result.techniqueSet?.notSelected],
    ] as const)
      if (names?.length)
        lists.append(
          el("dt", label),
          el("dd", names.join(", "), label === "Not selected" ? "not-selected" : undefined),
        );
    analysis.append(detail);
    if (verification.textContent) analysis.append(verification);
    if (logic.textContent) analysis.append(logic);
    if (stop.textContent) analysis.append(stop);
    if (coverage.textContent && result.human !== "not-started") analysis.append(coverage);
    if (setLimited.textContent) analysis.append(setLimited);
    if (highest.textContent && steps.length) analysis.append(highest);
    if (perTier.textContent && steps.length) analysis.append(perTier);
    analysis.append(stats);
    if (lists.childElementCount && result.human !== "not-started") analysis.append(lists);
    const capped = new Set(result.coverage?.capped ?? []);
    if (steps.length || capped.size) {
      const counts = new Map<string, number>();
      for (const step of steps) counts.set(step.name, (counts.get(step.name) ?? 0) + 1);
      // Techniques cut by a budget are listed with a badge even without a step.
      for (const technique of capped) if (!counts.has(technique)) counts.set(technique, 0);
      const techniques = el("div", undefined, "technique-list");
      techniques.append(el("h3", "Techniques"));
      const list = el("ul");
      for (const [technique, count] of [...counts].sort((a, b) => b[1] - a[1])) {
        const item = el("li");
        item.append(el("span", technique));
        if (capped.has(technique)) item.append(el("span", "capped", "badge capped"));
        item.append(el("span", `×${count}`, "count"));
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
      explainEmpty.textContent =
        phase === "running"
          ? "Steps appear here as they are found."
          : result?.count === "multiple" || result?.count === "zero"
            ? "There are no logical steps to explain: " + countSummary(result.count).toLowerCase()
            : steps.length
              ? "Only basic eliminations were needed. Turn off “Hide basic eliminations” to see them."
              : "No logical steps were found.";
      return undefined;
    }
    if (listedFor.length !== shown.length || listedFor.some((step, i) => step !== shown[i])) {
      const numbers = new Map(steps.map((step, i) => [step, i + 1] as const));
      const itemOf = (step: SolveStep, i: number) => {
        const item = el("li");
        const entry = button("", () => go(i), "step-item");
        entry.append(
          el("span", String(numbers.get(step)), "step-number"),
          el("span", step.name, "step-name"),
          el("span", describeStep(step), "step-effects"),
        );
        item.append(entry);
        return item;
      };
      // During a run the list only grows: append the new steps instead of
      // rebuilding every item on each one (S4 review).
      const prefix =
        listedFor.length <= shown.length && listedFor.every((step, i) => step === shown[i]);
      if (prefix)
        stepList.append(
          ...shown.slice(listedFor.length).map((step, i) => itemOf(step, listedFor.length + i)),
        );
      else stepList.replaceChildren(...shown.map(itemOf));
      // A copy: `visible()` can return the live `steps` array, which grows while
      // the run is going, so keeping it would hide every later step.
      listedFor = [...shown];
    }
    [...stepList.querySelectorAll(".step-item")].forEach((b, i) =>
      b.setAttribute("aria-current", String(i === current)),
    );
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
    stepNote.textContent = stepNoteText(step);
    stepNote.hidden = !stepNote.textContent;
    // Board shows the grid *before* the step, with its reasoning highlighted.
    const before = order === 0 ? clues : steps[order - 1].values;
    const focus = new Set(step.effects.map((e) => e.cell));
    const area = new Set(step.cells ?? []);
    if (!area.size) for (const cell of focus) for (const peer of peersOf(cell)) area.add(peer);
    const removed = new Map<number, Set<number>>();
    for (const e of step.effects)
      if (e.kind === "remove")
        removed.set(e.cell, new Set([...(removed.get(e.cell) ?? []), e.symbol]));
    const placed = new Map(
      step.effects.filter((e) => e.kind === "place").map((e) => [e.cell, e.symbol]),
    );
    const shownCandidates = settings().solverCandidates ? step.candidates : undefined;
    const candidates = before.map((v, i) =>
      v
        ? null
        : shownCandidates
          ? digitsOf(shownCandidates[i])
          : ([...(removed.get(i) ?? [])].sort() as Digit[]),
    );
    return {
      values: before,
      overlay: {
        focus,
        area,
        removed,
        placed,
        candidates,
        derived: new Set(before.flatMap((v, i) => (v && !clues[i] ? [i] : []))),
      },
    };
  };
  const renderProgress = () => {
    progress.hidden = phase !== "running";
    if (phase !== "running") return;
    progressStats.replaceChildren();
    stat(
      progressStats,
      "Phase",
      lastPhase === "exact" ? "Verifying uniqueness" : "Finding logical steps",
    );
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
          const session = lookup(data.sessions, p.id);
          const state = !session
            ? undefined
            : isComplete(effectiveValues(session.editor, p.definition.givens))
              ? "Solved"
              : "In progress";
          return {
            value: `puzzle:${p.id}`,
            label: p.name,
            description: describe(p.definition.givens, state),
          };
        }),
      },
      {
        title: "Drafts",
        options: Object.values(data.drafts)
          .filter((d) => !d.finishedPuzzleId)
          .map((d) => ({
            value: `draft:${d.id}`,
            label: d.name,
            description: describe(d.editor.cells.map((c) => c.value)),
          })),
      },
    ];
    library.setSections(sections);
  };

  let elapsedTicker: ReturnType<typeof setInterval> | undefined;
  function render() {
    const running = phase === "running",
      s = settings();
    const { text, conflicts } = clueSummary(phase === "edit" ? editor : editorFrom(clues));
    summary.textContent = text;
    summary.classList.toggle("danger", !!conflicts);
    shell.root.dataset.phase = phase;
    solve.hidden = phase !== "edit";
    solve.disabled = !editor.cells.some((c) => c.value);
    solve.title = solve.disabled ? "Enter or import clues first" : "";
    cancel.hidden = !running;
    edit.hidden = phase !== "result";
    library.setDisabled(running);
    importButton.disabled = running;
    name.disabled = running;
    panel.setAttribute("aria-busy", String(running));
    feedback.hidden = phase !== "edit" || !conflicts;
    feedback.textContent = conflicts
      ? "These clues conflict: solving will report that there is no solution."
      : "";
    // Conflicts no longer block solving: a notice, not an error.
    feedback.classList.toggle("error", false);
    status.hidden = phase === "edit";
    techniqueSet.textContent = phase === "edit" ? techniqueSetText(s) : runTechniques;
    renderProgress();
    const explaining = phase !== "edit";
    explain.hidden = !explaining;
    header.hidden = phase !== "result";
    if (phase !== "result") showSolution = false;
    // Offered only when there is a step to come back to.
    solutionToggle.hidden = phase !== "result" || !result || !!result.error || !visible().length;
    solutionToggle.setAttribute("aria-pressed", String(showSolution));
    const solutionLabel = result?.solution ? "Show solution" : "Show where the logic stopped";
    solutionToggle.setAttribute("aria-label", solutionLabel);
    const toggleText = solutionToggle.querySelector("span");
    if (toggleText) toggleText.textContent = solutionLabel;
    renderAnalysis();
    if (surface) surface.render();
    if (display) {
      const explained =
        explaining && phase === "result" && !showSolution ? renderExplain() : undefined;
      if (explained)
        display.update(
          editorFrom(explained.values),
          { ...s, highlightPeers: false, highlightSameDigit: false },
          explained.overlay,
        );
      else {
        if (explaining) renderExplain();
        const shown =
          phase === "running"
            ? (steps.at(-1)?.values ?? precount ?? clues)
            : (result?.solution ?? result?.logicalValues ?? clues);
        display.update(
          editorFrom(shown),
          {
            ...s,
            highlightPeers: false,
            highlightSameDigit: false,
            // A "No solution" from conflicting clues points at the conflict,
            // with the board's conflict style and label (not colour only).
            ...(phase === "result" && result?.count === "zero" ? { showConflicts: true } : {}),
          },
          {
            derived: new Set(shown.flatMap((v, i) => (v && !clues[i] ? [i] : []))),
          },
        );
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
      else lastPhase = event.phase;
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
          result =
            value && typeof value.count === "string"
              ? value
              : {
                  count: "unknown",
                  error: `The solver stopped with an error${value?.error || value?.code ? `: ${value.error ?? value.code}` : ""}.`,
                };
          status.textContent = solverStatus(result.outcome ?? snapshot.outcome);
          current = 0;
          if (settings().solverAutoplayMs) startAutoplay();
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
