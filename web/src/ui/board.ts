import type { EditorContext, EditorState, Digit } from "../domain/model";
import type { BoardAction } from "../domain/editor";
import { conflictingCells, effectiveValues } from "../domain/classic";
import { keyboardAction } from "./input";
import { el, button } from "./dom";
export interface BoardOptions {
  context: EditorContext;
  state: EditorState;
  showConflicts: boolean;
  onAction: (action: BoardAction) => void;
  controlsContainer?: HTMLElement;
}
export interface BoardView {
  update(state: EditorState, showConflicts: boolean): void;
  destroy(): void;
}
export function mountBoard(
  container: HTMLElement,
  options: BoardOptions,
): BoardView {
  const wrapper = el("section", undefined, "board-panel"),
    grid = el("div", undefined, "sudoku-grid"),
    keypad = el("div", undefined, "keypad"),
    toolbar = el("div", undefined, "board-toolbar");
  const controls = el("div", undefined, "board-controls");
  grid.setAttribute("role", "grid");
  grid.setAttribute("aria-label", "Sudoku board");
  grid.setAttribute("aria-rowcount", "9");
  grid.setAttribute("aria-colcount", "9");
  const rows = Array.from({ length: 9 }, (_, index) => {
    const row = el("div", undefined, "board-row");
    row.setAttribute("role", "row");
    row.setAttribute("aria-rowindex", String(index + 1));
    grid.append(row);
    return row;
  });
  let state = options.state;
  const abort = new AbortController();
  const focus = () => cells[state.selected].node.focus({ preventScroll: true });
  const dispatch = (action: BoardAction) => {
    options.onAction(action);
    focus();
  };
  const cells = Array.from({ length: 81 }, (_, index) => {
    const node = el("button", undefined, "cell");
    node.type = "button";
    node.setAttribute("role", "gridcell");
    node.dataset.cellIndex = String(index);
    const value = el("span"),
      notes = el("span");
    value.dataset.value = "";
    notes.dataset.notes = "";
    node.append(value, notes);
    node.addEventListener("click", () => dispatch({ type: "select", index }), {
      signal: abort.signal,
    });
    rows[Math.floor(index / 9)].append(node);
    return { node, value, notes };
  });
  // Whole-board strokes stay continuous across cells, highlights and box crossings.
  const lines = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  lines.classList.add("grid-lines");
  lines.setAttribute("viewBox", "0 0 900 900");
  lines.setAttribute("aria-hidden", "true");
  const thin = document.createElementNS(lines.namespaceURI, "g"),
    thick = document.createElementNS(lines.namespaceURI, "g");
  for (let i = 1; i < 9; i++) {
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
  }
  // SVG paints in document order: every box separator covers every thin line.
  lines.append(thin, thick);
  grid.append(lines);
  for (let n = 1; n <= 9; n++) {
    const key = button(String(n), (event) =>
      dispatch({
        type: "digit",
        digit: n as Digit,
        corner: event.shiftKey || state.tool === "corner",
      }),
    );
    key.setAttribute("aria-label", `Number ${n}`);
    keypad.append(key);
  }
  const notesButton = button("Notes", () =>
    dispatch({
      type: "tool",
      tool: state.tool === "corner" ? "value" : "corner",
    }),
  );
  if (options.context.mode === "play") toolbar.append(notesButton);
  const undo = button("Undo", () => dispatch({ type: "undo" })),
    redo = button("Redo", () => dispatch({ type: "redo" }));
  toolbar.append(
    button("Erase", () => dispatch({ type: "erase" })),
    undo,
    redo,
    button("Reset", () => dispatch({ type: "reset" })),
  );
  wrapper.append(grid);
  controls.append(keypad, toolbar);
  (options.controlsContainer ?? wrapper).append(controls);
  container.append(wrapper);
  const onKey = (event: KeyboardEvent) => {
    const action = keyboardAction(event, state.tool === "corner");
    if (action) {
      event.preventDefault();
      dispatch(action);
    }
  };
  wrapper.addEventListener("keydown", onKey, { signal: abort.signal });
  if (options.controlsContainer)
    controls.addEventListener("keydown", onKey, { signal: abort.signal });
  function update(next: EditorState, showConflicts: boolean): void {
    state = next;
    const values = effectiveValues(state, options.context.givens),
      conflicts = new Set(showConflicts ? conflictingCells(values) : []);
    cells.forEach(({ node, value, notes }, i) => {
      const given =
          options.context.mode === "play" && !!options.context.givens[i],
        selected = i === state.selected;
      node.tabIndex = selected ? 0 : -1;
      node.setAttribute("aria-selected", String(selected));
      node.classList.toggle("given", given);
      node.classList.toggle("conflict", conflicts.has(i));
      node.setAttribute(
        "aria-label",
        `Row ${Math.floor(i / 9) + 1}, column ${(i % 9) + 1}, ${values[i] || "empty"}${given ? ", fixed clue" : ""}${conflicts.has(i) ? ", conflict" : ""}${!values[i] && state.cells[i].notes.length ? ", notes " + state.cells[i].notes.join(", ") : ""}`,
      );
      value.textContent = values[i] ? String(values[i]) : "";
      notes.hidden = !!values[i];
      notes.replaceChildren(
        ...state.cells[i].notes.map((n) => {
          const note = el("span", String(n));
          note.style.gridColumn = String(((n - 1) % 3) + 1);
          note.style.gridRow = String(Math.floor((n - 1) / 3) + 1);
          return note;
        }),
      );
    });
    notesButton.setAttribute("aria-pressed", String(state.tool === "corner"));
    undo.disabled = !state.past.length;
    redo.disabled = !state.future.length;
  }
  update(state, options.showConflicts);
  return {
    update,
    destroy() {
      abort.abort();
      wrapper.remove();
      controls.remove();
    },
  };
}
