import type { Digit, EditorContext, EditorState, Settings } from "../domain/model";
import type { BoardAction } from "../domain/editor";
import {
  conflictingCells,
  effectiveValues,
  noteConflicts,
  peersOf,
} from "../domain/classic";
import { el } from "./dom";

export type BoardDisplay = Pick<
  Settings,
  | "showConflicts"
  | "showNoteConflicts"
  | "highlightPeers"
  | "highlightSameDigit"
  | "showLabels"
>;
/** Presentation-only layers, used by the solver and correctness marks. */
export interface BoardOverlay {
  /** Cells changed by the current deduction. */
  focus?: ReadonlySet<number>;
  /** Cells of the units the deduction reasons about. */
  area?: ReadonlySet<number>;
  /** Candidates to show instead of player notes (null keeps the cell's notes). */
  candidates?: readonly (readonly Digit[] | null)[];
  /** Candidates eliminated by the current deduction, drawn struck through. */
  removed?: ReadonlyMap<number, ReadonlySet<number>>;
  /** Placements made by the current deduction. */
  placed?: ReadonlyMap<number, number>;
  /** Player digits known to match the unique solution. */
  correct?: ReadonlySet<number>;
  /** Cells whose digits come from the solver rather than clues. */
  derived?: ReadonlySet<number>;
}
export interface BoardOptions {
  context: EditorContext;
  state: EditorState;
  display: BoardDisplay;
  onAction: (action: BoardAction) => void;
  /** Read-only boards ignore input and never take focus (previews, results). */
  interactive?: boolean;
  label?: string;
}
export interface BoardView {
  node: HTMLElement;
  update(state: EditorState, display?: BoardDisplay, overlay?: BoardOverlay): void;
  focusSelected(): void;
  destroy(): void;
}
const ROWS = "ABCDEFGHI";
/** Corner notes fill corners, then edge midpoints; the middle belongs to center notes. */
const CORNER_SLOTS = ["tl", "tr", "bl", "br", "tc", "bc", "ml", "mr", "mc"];

/** Marks a region whose clicks keep the board selection (keypad, toolbars…). */
export function keepsSelection(node: HTMLElement): HTMLElement {
  node.dataset.keepsSelection = "";
  return node;
}

export function mountBoard(container: HTMLElement, options: BoardOptions): BoardView {
  const interactive = options.interactive ?? true;
  const node = keepsSelection(el("div", undefined, "board"));
  const grid = el("div", undefined, "sudoku-grid");
  grid.setAttribute("role", "grid");
  grid.setAttribute("aria-label", options.label ?? "Sudoku board");
  grid.setAttribute("aria-rowcount", "9");
  grid.setAttribute("aria-colcount", "9");
  if (!interactive) grid.setAttribute("aria-readonly", "true");
  const columnLabels = el("div", undefined, "board-labels columns"),
    rowLabels = el("div", undefined, "board-labels rows");
  for (let i = 0; i < 9; i++) {
    columnLabels.append(el("span", String(i + 1)));
    rowLabels.append(el("span", ROWS[i]));
  }
  columnLabels.setAttribute("aria-hidden", "true");
  rowLabels.setAttribute("aria-hidden", "true");
  node.append(columnLabels, rowLabels, grid);
  const rows = Array.from({ length: 9 }, (_, index) => {
    const row = el("div", undefined, "board-row");
    row.setAttribute("role", "row");
    row.setAttribute("aria-rowindex", String(index + 1));
    grid.append(row);
    return row;
  });
  let state = options.state,
    display = options.display,
    overlay: BoardOverlay = {},
    lastSelected = Math.max(0, state.selected),
    pointerFocus = false;
  const abort = new AbortController(),
    signal = abort.signal;
  const dispatch = (action: BoardAction) => {
    if (interactive) options.onAction(action);
  };
  const cells = Array.from({ length: 81 }, (_, index) => {
    const cell = el("button", undefined, "cell");
    cell.type = "button";
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-colindex", String((index % 9) + 1));
    cell.dataset.cellIndex = String(index);
    const value = el("span", undefined, "cell-value"),
      corner = el("span", undefined, "corner-notes"),
      center = el("span", undefined, "center-notes");
    value.dataset.value = "";
    corner.dataset.notes = "";
    center.dataset.centerNotes = "";
    cell.append(value, corner, center);
    if (interactive) {
      cell.addEventListener("pointerdown", () => (pointerFocus = true), { signal });
      cell.addEventListener(
        "click",
        () => {
          pointerFocus = false;
          // Clicking the selected cell again clears the selection.
          dispatch({ type: "select", index: state.selected === index ? -1 : index });
        },
        { signal },
      );
      // Keyboard focus (Tab into the grid) selects the focused cell.
      cell.addEventListener(
        "focus",
        () => {
          if (!pointerFocus && state.selected !== index) dispatch({ type: "select", index });
        },
        { signal },
      );
    } else cell.tabIndex = -1;
    rows[Math.floor(index / 9)].append(cell);
    return { cell, value, corner, center };
  });
  const lines = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  lines.classList.add("grid-lines");
  lines.setAttribute("viewBox", "0 0 900 900");
  lines.setAttribute("aria-hidden", "true");
  const thin = document.createElementNS(lines.namespaceURI, "g"),
    thick = document.createElementNS(lines.namespaceURI, "g");
  for (let i = 1; i < 9; i++)
    for (const vertical of [false, true]) {
      const line = document.createElementNS(lines.namespaceURI, "line");
      line.setAttribute("x1", String(vertical ? i * 100 : 2));
      line.setAttribute("x2", String(vertical ? i * 100 : 898));
      line.setAttribute("y1", String(vertical ? 2 : i * 100));
      line.setAttribute("y2", String(vertical ? 898 : i * 100));
      line.setAttribute("vector-effect", "non-scaling-stroke");
      if (i % 3 === 0) line.classList.add("box-line");
      (i % 3 === 0 ? thick : thin).append(line);
    }
  lines.append(thin, thick);
  grid.append(lines);
  container.append(node);

  const noteSpans = (target: HTMLElement, digits: readonly number[], slots: boolean, bad?: ReadonlySet<number>, removed?: ReadonlySet<number>) => {
    target.replaceChildren(
      ...digits.map((digit, k) => {
        const span = el("span", String(digit));
        if (slots) span.dataset.slot = digits.length === 9 && !target.nextElementSibling?.childElementCount ? String(digit) : CORNER_SLOTS[k];
        if (bad?.has(digit)) span.classList.add("bad");
        if (removed?.has(digit)) span.classList.add("removed");
        return span;
      }),
    );
  };

  function update(next: EditorState, nextDisplay = display, nextOverlay: BoardOverlay = overlay): void {
    state = next;
    display = nextDisplay;
    overlay = nextOverlay;
    if (state.selected >= 0) lastSelected = state.selected;
    node.classList.toggle("with-labels", display.showLabels);
    const values = effectiveValues(state, options.context.givens),
      conflicts = new Set(display.showConflicts ? conflictingCells(values) : []),
      badNotes = display.showNoteConflicts ? noteConflicts(values, state.cells) : new Map<number, Set<Digit>>(),
      selected = state.selected,
      peers = new Set(selected >= 0 && display.highlightPeers ? peersOf(selected) : []),
      selectedDigit = selected >= 0 ? values[selected] : 0;
    cells.forEach(({ cell, value, corner, center }, i) => {
      const cellState = state.cells[i],
        given = !!options.context.givens[i] && options.context.mode === "play",
        isSelected = i === selected,
        candidates = overlay.candidates?.[i],
        removed = overlay.removed?.get(i),
        placed = overlay.placed?.get(i);
      cell.tabIndex = interactive && i === (selected >= 0 ? selected : lastSelected) ? 0 : -1;
      cell.setAttribute("aria-selected", String(isSelected));
      cell.classList.toggle("given", given);
      cell.classList.toggle("conflict", conflicts.has(i));
      cell.classList.toggle("peer", peers.has(i));
      cell.classList.toggle("same-digit", !!selectedDigit && !isSelected && display.highlightSameDigit && values[i] === selectedDigit);
      cell.classList.toggle("correct", !!overlay.correct?.has(i));
      cell.classList.toggle("focus", !!overlay.focus?.has(i));
      cell.classList.toggle("area", !!overlay.area?.has(i));
      cell.classList.toggle("derived", !!overlay.derived?.has(i));
      cell.classList.toggle("placed", placed !== undefined);
      if (cellState.color) cell.dataset.color = String(cellState.color);
      else delete cell.dataset.color;
      const shown = placed ?? values[i];
      value.textContent = shown ? String(shown) : "";
      const cornerDigits = shown ? [] : candidates ?? cellState.notes,
        centerDigits = shown || candidates ? [] : cellState.center ?? [];
      corner.hidden = !cornerDigits.length;
      center.hidden = !centerDigits.length;
      center.dataset.count = String(centerDigits.length);
      noteSpans(center, centerDigits, false, badNotes.get(i));
      noteSpans(corner, cornerDigits, !candidates, badNotes.get(i), removed);
      // With a full candidate set and no center notes, keep digits in keypad positions.
      if (candidates)
        corner.querySelectorAll<HTMLElement>("span").forEach((span) => (span.dataset.slot = span.textContent!));
      const parts = [`${ROWS[Math.floor(i / 9)]}${(i % 9) + 1}`, shown ? String(shown) : "empty"];
      if (given) parts.push("clue");
      if (conflicts.has(i)) parts.push("conflict");
      if (overlay.correct?.has(i)) parts.push("correct");
      if (placed !== undefined) parts.push("placed by this step");
      if (!shown && cornerDigits.length) parts.push(`${candidates ? "candidates" : "corner notes"} ${cornerDigits.join(" ")}`);
      if (removed?.size) parts.push(`eliminates ${[...removed].join(" ")}`);
      if (!shown && centerDigits.length) parts.push(`center notes ${centerDigits.join(" ")}`);
      if (cellState.color) parts.push(`color ${cellState.color}`);
      cell.setAttribute("aria-label", parts.join(", "));
    });
  }
  update(state, display);
  return {
    node,
    update,
    focusSelected() {
      if (state.selected >= 0) cells[state.selected].cell.focus({ preventScroll: true });
    },
    destroy() {
      abort.abort();
      node.remove();
    },
  };
}

/**
 * Deselects when a pointer goes down outside the board and its controls.
 * Dialogs, menus and regions marked with keepsSelection() are "inside".
 */
export function deselectOnOutsidePointer(onOutside: () => void): () => void {
  const listener = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("[data-keeps-selection], dialog, [popover]")) return;
    onOutside();
  };
  document.addEventListener("pointerdown", listener);
  return () => document.removeEventListener("pointerdown", listener);
}
