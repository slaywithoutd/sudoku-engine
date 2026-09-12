import type { Digit } from "../domain/model";
import type { BoardAction } from "../domain/editor";
export function digitFromEvent(event: KeyboardEvent): Digit | null {
  if (/^[1-9]$/.test(event.key)) return Number(event.key) as Digit;
  const match = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
  return match ? (Number(match[1]) as Digit) : null;
}
export function keyboardAction(
  event: KeyboardEvent,
  corner: boolean,
): BoardAction | null {
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    (target.closest("input,textarea,select") || target.isContentEditable)
  )
    return null;
  if (event.altKey) return null;
  if (event.ctrlKey || event.metaKey) {
    if (event.repeat) return null;
    if (event.key.toLowerCase() === "z")
      return { type: event.shiftKey ? "redo" : "undo" };
    if (event.key.toLowerCase() === "y") return { type: "redo" };
    return null;
  }
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
  };
  if (!/^Numpad[1-9]$/.test(event.code) && Object.hasOwn(moves, event.key)) {
    const [dr, dc] = moves[event.key];
    return { type: "move", dr, dc };
  }
  if (
    event.code === "Numpad0" ||
    ["0", "Backspace", "Delete"].includes(event.key)
  )
    return { type: "erase" };
  const digit = digitFromEvent(event);
  if (!digit) return null;
  const notes = event.shiftKey || corner;
  if (event.repeat) return null;
  return { type: "digit", digit, corner: notes };
}
