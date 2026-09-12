import type {
  CellChange,
  CellState,
  Digit,
  Edit,
  EditorContext,
  EditorState,
  Tool,
} from "./model";
export type BoardAction =
  | { type: "digit"; digit: Digit; corner: boolean }
  | { type: "erase" }
  | { type: "reset" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "select"; index: number }
  | { type: "move"; dr: number; dc: number }
  | { type: "tool"; tool: Tool };
export function sameCell(a: CellState, b: CellState): boolean {
  return (
    a.value === b.value &&
    a.notes.length === b.notes.length &&
    a.notes.every((n, i) => n === b.notes[i])
  );
}
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
export function reduceEditor(
  context: EditorContext,
  state: EditorState,
  action: BoardAction,
): EditorState {
  if (action.type === "select")
    return Number.isInteger(action.index) &&
      action.index >= 0 &&
      action.index < 81 &&
      action.index !== state.selected
      ? { ...state, selected: action.index }
      : state;
  if (action.type === "move") {
    if (
      !Number.isInteger(action.dr) ||
      !Number.isInteger(action.dc) ||
      Math.abs(action.dr) + Math.abs(action.dc) !== 1
    )
      return state;
    return {
      ...state,
      selected:
        ((Math.floor(state.selected / 9) + action.dr + 9) % 9) * 9 +
        (((state.selected % 9) + action.dc + 9) % 9),
    };
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
  const locked = (i: number) =>
    context.mode === "play" && context.givens[i] !== 0;
  if (action.type === "reset") {
    const changes: CellChange[] = [];
    state.cells.forEach((before, index) => {
      if (!locked(index) && (before.value || before.notes.length))
        changes.push({ index, before, after: { value: 0, notes: [] } });
    });
    return applyEdit(state, "reset", changes);
  }
  const index = state.selected,
    before = state.cells[index];
  if (locked(index)) return state;
  let after: CellState, label: Edit["label"];
  if (action.type === "erase") {
    after = before.value ? { ...before, value: 0 } : { ...before, notes: [] };
    label = "erase";
  } else {
    if (!Number.isInteger(action.digit) || action.digit < 1 || action.digit > 9)
      return state;
    if (context.mode === "play" && action.corner) {
      if (before.value) return state;
      after = {
        ...before,
        notes: before.notes.includes(action.digit)
          ? before.notes.filter((n) => n !== action.digit)
          : [...before.notes, action.digit].sort((a, b) => a - b),
      };
      label = "note";
    } else {
      after = { ...before, value: action.digit };
      label = "digit";
    }
  }
  return sameCell(before, after)
    ? state
    : applyEdit(state, label, [{ index, before, after }]);
}
