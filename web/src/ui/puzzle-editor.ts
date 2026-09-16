import type { ScreenServices } from "../app/controller";
import type { EditorState, Settings, ShortcutAction, Value } from "../domain/model";
import type { BoardAction } from "../domain/editor";
import { completedDigits, conflictingCells, effectiveValues } from "../domain/classic";
import { el } from "./dom";
import { deselectOnOutsidePointer, mountBoard, type BoardOverlay, type BoardView } from "./board";
import { mountKeypad, type KeypadView } from "./keypad";
import { bindGameKeys, copyCell, pasteCellAction, toggleFullscreen, type GameShell } from "./game";
import { updateSetting } from "./settings-sections";

export interface PuzzleSurface {
  board: BoardView;
  keypad: KeypadView;
  /** Re-renders board and keypad from the current state and settings. */
  render(overlay?: BoardOverlay): void;
  destroy(): void;
}

/**
 * The single board + keypad + keyboard + selection experience used by Create,
 * Play and Solve. Screens own persistence and top-bar actions only.
 */
export function mountPuzzleSurface(
  shell: GameShell,
  services: ScreenServices,
  options: {
    mode: "create" | "play";
    givens: readonly Value[];
    state: () => EditorState;
    dispatch: (action: BoardAction) => void;
    /** Screen commands (pause, autofill…); return true when handled. */
    command?: (action: ShortcutAction) => boolean;
    /** False while input is blocked (paused game, running solver, results shown). */
    editable?: () => boolean;
    onAutofill?: () => void;
    /** Create always shows conflicts; play follows the setting. */
    display?: (settings: Settings) => Partial<Settings>;
  },
): PuzzleSurface {
  const settings = () => services.controller.snapshot().settings;
  const editable = () => options.editable?.() ?? true;
  const dispatch = (action: BoardAction) => {
    const selecting = action.type === "select" || action.type === "move";
    if (!selecting && !editable()) return;
    options.dispatch(action);
    if (action.type !== "select" || action.index >= 0) board.focusSelected();
  };
  const boardHost = el("div", undefined, "board-host");
  shell.stage.prepend(boardHost);
  const context = { mode: options.mode, givens: options.givens };
  const board = mountBoard(boardHost, {
    context,
    state: options.state(),
    display: settings(),
    onAction: dispatch,
  });
  const keypad = mountKeypad(shell.side, {
    mode: options.mode,
    settings: settings(),
    onAction: dispatch,
    onCollapse: () => updateSetting(services, "keypadCollapsed", true),
    onExpand: () => {
      updateSetting(services, "keypadCollapsed", false);
      if (settings().keypadHidden) updateSetting(services, "keypadHidden", false);
    },
    onAutofill: options.onAutofill,
  });
  const offOutside = deselectOnOutsidePointer(() => {
    if (options.state().selected >= 0) options.dispatch({ type: "select", index: -1 });
  });
  const offKeys = bindGameKeys({
    settings,
    state: options.state,
    dispatch,
    command: (action) => {
      if (options.command?.(action)) return true;
      const state = options.state();
      switch (action) {
        case "undo":
        case "redo":
        case "erase":
          dispatch({ type: action });
          return true;
        case "deselect":
          if (state.selected < 0) return false;
          options.dispatch({ type: "select", index: -1 });
          (document.activeElement as HTMLElement | null)?.blur?.();
          return true;
        case "toolValue":
        case "toolCorner":
        case "toolCenter":
        case "toolColor":
          if (options.mode !== "play") return false;
          dispatch({ type: "tool", tool: action === "toolValue" ? "value" : (action.slice(4).toLowerCase() as "corner") });
          return true;
        case "copyCell":
          // Leave text copying to the browser when no cell is selected.
          return copyCell(state, context.givens);
        case "pasteCell": {
          const paste = pasteCellAction(state);
          if (paste) dispatch(paste);
          return !!paste;
        }
        case "fullscreen":
          toggleFullscreen();
          return true;
        default:
          return false;
      }
    },
  });
  const render = (overlay?: BoardOverlay) => {
    const state = options.state(),
      s = settings(),
      display = { ...s, ...options.display?.(s) };
    board.update(state, display, overlay ?? {});
    keypad.setDisabled(!editable());
    keypad.update(state, s, completedDigits(effectiveValues(state, context.givens)));
    // Lets the board reclaim the keypad's freed grid column when it's
    // minimized, via the same --side-width layout mechanism (see styles.css).
    shell.root.dataset.keypad = s.keypadHidden ? "hidden" : s.keypadCollapsed ? "rail" : "expanded";
  };
  render();
  return {
    board,
    keypad,
    render,
    destroy() {
      offOutside();
      offKeys();
      board.destroy();
      keypad.destroy();
      boardHost.remove();
    },
  };
}

/** "30 clues" or "3 conflicts" chip for Create and Solve. */
export function clueSummary(state: EditorState): { text: string; conflicts: number; clues: number } {
  const values = state.cells.map((c) => c.value),
    conflicts = conflictingCells(values).length,
    clues = values.filter(Boolean).length;
  return {
    clues,
    conflicts,
    text: conflicts ? `${conflicts} cells in conflict` : `${clues} ${clues === 1 ? "clue" : "clues"}`,
  };
}
