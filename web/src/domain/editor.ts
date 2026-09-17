import type {
  CellChange,
  CellColor,
  CellState,
  Digit,
  Edit,
  EditorContext,
  EditorState,
  Tool,
} from "./model";
import { candidatesFor, effectiveValues } from "./classic";
export type BoardAction =
  | { type: "digit"; digit: Digit; tool: Tool }
  | { type: "color"; color: CellColor }
  | { type: "erase" }
  | { type: "reset" }
  | { type: "undo" }
  | { type: "redo" }
  /**
   * index -1 clears the whole selection. "toggle" adds/removes `index` from
   * the selection instead of replacing it (multi-select); default is "replace".
   */
  | { type: "select"; index: number; mode?: "replace" | "toggle" }
  /** `extend` grows the selection to include the new cell instead of replacing it. */
  | { type: "move"; dr: number; dc: number; extend?: boolean }
  | { type: "tool"; tool: Tool }
  | { type: "paste"; cell: CellState }
  | { type: "autofill" };
/** Every selected cell, primary first, or `[]` when nothing is selected. */
export function selectionOf(state: EditorState): number[] {
  return state.selected < 0 ? [] : [state.selected, ...state.extraSelected];
}
const sameDigits = (a: readonly Digit[] = [], b: readonly Digit[] = []) =>
  a.length === b.length && a.every((n, i) => n === b[i]);
export function sameCell(a: CellState, b: CellState): boolean {
  return (
    a.value === b.value &&
    sameDigits(a.notes, b.notes) &&
    sameDigits(a.center, b.center) &&
    (a.color ?? 0) === (b.color ?? 0)
  );
}
/** Builds a cell with empty optional layers omitted. */
export function makeCell(
  value: CellState["value"],
  notes: readonly Digit[],
  center: readonly Digit[] = [],
  color: CellColor = 0,
): CellState {
  const cell: CellState = { value, notes: [...notes] };
  if (center.length) cell.center = [...center];
  if (color) cell.color = color;
  return cell;
}
const toggle = (list: readonly Digit[] = [], digit: Digit): Digit[] =>
  list.includes(digit)
    ? list.filter((n) => n !== digit)
    : [...list, digit].sort((a, b) => a - b);
function applyEdit(
  state: EditorState,
  label: Edit["label"],
  changes: CellChange[],
): EditorState {
  if (!changes.length) return state;
  const cells = state.cells.slice();
  for (const c of changes) cells[c.index] = structuredClone(c.after);
  return {
    ...state,
    cells,
    past: [...state.past, { label, changes: structuredClone(changes) }],
    future: [],
  };
}
const validIndex = (index: number) =>
  Number.isInteger(index) && index >= 0 && index < 81;
export function reduceEditor(
  context: EditorContext,
  state: EditorState,
  action: BoardAction,
): EditorState {
  if (action.type === "select") {
    if (action.mode === "toggle") {
      if (!validIndex(action.index)) return state;
      const index = action.index;
      if (index === state.selected) {
        // Demote the primary cell; the next extra (if any) takes its place
        // so the selection shrinks instead of jumping to a fresh cell.
        const [next, ...rest] = state.extraSelected;
        return { ...state, selected: next ?? -1, extraSelected: rest };
      }
      if (state.extraSelected.includes(index))
        return { ...state, extraSelected: state.extraSelected.filter((i) => i !== index) };
      return state.selected < 0
        ? { ...state, selected: index, extraSelected: [] }
        : { ...state, extraSelected: [...state.extraSelected, index] };
    }
    return (validIndex(action.index) || action.index === -1) &&
      (action.index !== state.selected || state.extraSelected.length > 0)
      ? { ...state, selected: action.index, extraSelected: [] }
      : state;
  }
  if (action.type === "move") {
    if (
      !Number.isInteger(action.dr) ||
      !Number.isInteger(action.dc) ||
      Math.abs(action.dr) + Math.abs(action.dc) !== 1
    )
      return state;
    if (state.selected < 0) return { ...state, selected: 0, extraSelected: [] };
    const next =
      ((Math.floor(state.selected / 9) + action.dr + 9) % 9) * 9 +
      (((state.selected % 9) + action.dc + 9) % 9);
    if (!action.extend) return { ...state, selected: next, extraSelected: [] };
    // Shift+Arrow / multi-select mode: grow the selection instead of moving it,
    // keeping the previous primary cell selected as an extra.
    const extraSelected = state.extraSelected.includes(state.selected)
      ? state.extraSelected
      : [...state.extraSelected, state.selected];
    return { ...state, selected: next, extraSelected: extraSelected.filter((i) => i !== next) };
  }
  if (action.type === "tool")
    return action.tool === state.tool ? state : { ...state, tool: action.tool };
  if (action.type === "undo" || action.type === "redo") {
    const undo = action.type === "undo",
      source = undo ? state.past : state.future,
      edit = source.at(-1);
    if (!edit) return state;
    const cells = state.cells.slice();
    for (const c of edit.changes)
      cells[c.index] = structuredClone(undo ? c.before : c.after);
    return {
      ...state,
      cells,
      past: undo ? state.past.slice(0, -1) : [...state.past, edit],
      future: undo ? [...state.future, edit] : state.future.slice(0, -1),
    };
  }
  const play = context.mode === "play",
    given = (i: number) => play && context.givens[i] !== 0;
  if (action.type === "reset") {
    const changes: CellChange[] = [];
    state.cells.forEach((before, index) => {
      const after = makeCell(0, []);
      if (!sameCell(before, after)) changes.push({ index, before, after });
    });
    return applyEdit(state, "reset", changes);
  }
  if (action.type === "autofill") {
    if (!play) return state;
    const values = effectiveValues(state, context.givens),
      changes: CellChange[] = [];
    state.cells.forEach((before, index) => {
      if (values[index]) return;
      const after = makeCell(
        0,
        candidatesFor(values, index),
        before.center,
        before.color,
      );
      if (!sameCell(before, after)) changes.push({ index, before, after });
    });
    return applyEdit(state, "autofill", changes);
  }
  // Action-level validation (aborts entirely on bad input, same as before
  // multi-select existed); per-cell skips (given clues, already-valued
  // cells) happen inside the loop below so one locked cell in a multi-select
  // doesn't block the edit for the rest of the selection.
  if (action.type === "color" && (!play || !Number.isInteger(action.color) || action.color < 0 || action.color > 6))
    return state;
  let digitMode: Tool | undefined;
  if (action.type === "digit") {
    if (!Number.isInteger(action.digit) || action.digit < 1 || action.digit > 9) return state;
    digitMode = play ? action.tool : "value";
    if (digitMode === "color") {
      if (action.digit > 6) return state;
      return reduceEditor(context, state, { type: "color", color: action.digit as CellColor });
    }
  }
  const selection = selectionOf(state);
  if (!selection.length) return state;
  const changes: CellChange[] = [];
  let label: Edit["label"] | undefined;
  for (const index of selection) {
    if (!validIndex(index)) continue;
    const before = state.cells[index];
    const color = before.color ?? 0;
    let after: CellState;
    if (action.type === "color") {
      after = makeCell(
        before.value,
        before.notes,
        before.center,
        color === action.color ? 0 : action.color,
      );
      label = "color";
    } else if (action.type === "erase") {
      // Layered: value, then notes, then color — each press reveals the next layer.
      if (before.value) after = makeCell(0, before.notes, before.center, color);
      else if (before.notes.length || before.center)
        after = makeCell(0, [], [], color);
      else after = makeCell(0, [], [], 0);
      label = "erase";
    } else if (action.type === "paste") {
      if (given(index)) continue;
      const source = action.cell;
      after = play
        ? makeCell(source.value, source.notes, source.center, source.color ?? 0)
        : makeCell(source.value, []);
      label = "paste";
    } else {
      const { digit } = action;
      if (given(index)) continue;
      if (digitMode === "corner" || digitMode === "center") {
        if (before.value) continue;
        after =
          digitMode === "corner"
            ? makeCell(0, toggle(before.notes, digit), before.center, color)
            : makeCell(0, before.notes, toggle(before.center, digit), color);
        label = digitMode === "corner" ? "note" : "center";
      } else {
        const erase = before.value === digit;
        after = makeCell(erase ? 0 : digit, before.notes, before.center, color);
        label = erase ? "erase" : "digit";
      }
    }
    if (!sameCell(before, after)) changes.push({ index, before, after });
  }
  return label ? applyEdit(state, label, changes) : state;
}
