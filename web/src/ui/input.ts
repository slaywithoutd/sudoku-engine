import type { Digit, NoteModifier, Settings, ShortcutAction, Tool } from "../domain/model";
import { SHORTCUT_ACTIONS } from "../domain/model";
export function digitFromEvent(event: KeyboardEvent): Digit | null {
  if (/^[1-9]$/.test(event.key)) return Number(event.key) as Digit;
  const match = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
  return match ? (Number(match[1]) as Digit) : null;
}
/** Events typed into form fields or while a modal is open never reach the board. */
export function ignoredTarget(event: Event): boolean {
  const target = event.target;
  if (document.querySelector("dialog[open]")) return true;
  return (
    target instanceof HTMLElement &&
    (!!target.closest("input,textarea,select,[role=listbox],[role=menu]") ||
      target.isContentEditable)
  );
}
const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph", "CapsLock"]);
/** Normalized combo ("Ctrl+Shift+Z") for a key event, or "" for bare modifiers. */
export function comboFromEvent(event: KeyboardEvent): string {
  if (MODIFIER_KEYS.has(event.key)) return "";
  let key: string;
  if (/^Key[A-Z]$/.test(event.code)) key = event.code.slice(3);
  else if (/^(?:Digit|Numpad)[0-9]$/.test(event.code)) key = event.code.at(-1)!;
  else if (event.key === " ") key = "Space";
  else if (event.key.length === 1) key = event.key.toUpperCase();
  else key = event.key;
  const parts = [];
  if (event.ctrlKey || event.metaKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  return [...parts, key].join("+");
}
const held = (event: KeyboardEvent, modifier: NoteModifier) =>
  modifier === "Shift"
    ? event.shiftKey
    : modifier === "Control"
      ? event.ctrlKey || event.metaKey
      : modifier === "Alt"
        ? event.altKey
        : false;
export type KeyIntent =
  | { kind: "digit"; digit: Digit; tool: Tool }
  /** `extend`: Shift+Arrow grows the selection instead of moving it. */
  | { kind: "move"; dr: number; dc: number; extend: boolean }
  | { kind: "erase" }
  | { kind: "command"; action: ShortcutAction };
/**
 * Resolves a key event to a board intent. Configured shortcuts win over
 * digits so remapped combos behave predictably; arrows and 0/Backspace are fixed.
 */
export function keyIntent(
  event: KeyboardEvent,
  settings: Pick<Settings, "shortcuts" | "cornerModifier" | "centerModifier">,
  tool: Tool,
): KeyIntent | null {
  const combo = comboFromEvent(event);
  if (!combo) return null;
  let action = SHORTCUT_ACTIONS.find((a) => settings.shortcuts[a] === combo);
  // Ctrl+Shift+Z stays a redo alias unless the user bound it to something else.
  if (!action && combo === "Ctrl+Shift+Z" && settings.shortcuts.redo) action = "redo";
  if (action) {
    const repeatable = action === "undo" || action === "redo";
    return event.repeat && !repeatable ? null : { kind: "command", action };
  }
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
  };
  const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
  if (plain && !/^Numpad[1-9]$/.test(event.code) && Object.hasOwn(moves, event.key)) {
    const [dr, dc] = moves[event.key];
    return { kind: "move", dr, dc, extend: event.shiftKey };
  }
  if (
    plain &&
    !event.shiftKey &&
    (event.code === "Numpad0" || ["0", "Backspace", "Delete"].includes(event.key))
  )
    return event.repeat ? null : { kind: "erase" };
  const digit = digitFromEvent(event);
  if (!digit || event.repeat) return null;
  const corner = held(event, settings.cornerModifier),
    center = held(event, settings.centerModifier);
  const extra =
    ((event.ctrlKey || event.metaKey) &&
      settings.cornerModifier !== "Control" &&
      settings.centerModifier !== "Control") ||
    (event.altKey && settings.cornerModifier !== "Alt" && settings.centerModifier !== "Alt") ||
    (event.shiftKey && settings.cornerModifier !== "Shift" && settings.centerModifier !== "Shift");
  if (extra || (corner && center)) return null;
  return { kind: "digit", digit, tool: corner ? "corner" : center ? "center" : tool };
}
