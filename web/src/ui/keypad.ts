import type { CellColor, Digit, EditorState, Settings, Tool } from "../domain/model";
import type { BoardAction } from "../domain/editor";
import { el, button } from "./dom";
import { iconButton, labeledButton, segmented, comboLabel } from "./components";
import { keepsSelection } from "./board";

export interface KeypadOptions {
  mode: "play" | "create";
  settings: Settings;
  onAction: (action: BoardAction) => void;
  /** Shrinks the panel to its expand-arrow rail (shared by every screen). */
  onCollapse: () => void;
  /** Restores the full panel, also clearing "Hide keypad" if that was set. */
  onExpand: () => void;
  onAutofill?: () => void;
  /** Toggles multi-select mode (plain clicks and arrows add to the selection). */
  onMultiSelect?: () => void;
}
export interface KeypadView {
  node: HTMLElement;
  update(state: EditorState, settings: Settings, completed: ReadonlySet<Digit>): void;
  setDisabled(disabled: boolean): void;
  /** Reflects whether multi-select mode is on. */
  setMultiSelect(active: boolean): void;
  destroy(): void;
}
export const COLOR_NAMES = ["Red", "Orange", "Yellow", "Green", "Blue", "Purple"];

const TOOL_ITEMS = [
  { value: "value", label: "Digit", icon: "pen" },
  { value: "corner", label: "Corner", icon: "corner" },
  { value: "center", label: "Center", icon: "center" },
  { value: "color", label: "Color", icon: "palette" },
] as const;

export function mountKeypad(container: HTMLElement, options: KeypadOptions): KeypadView {
  let settings = options.settings,
    tool: Tool = "value",
    disabled = false,
    multiSelectActive = false;
  const play = options.mode === "play";
  const node = keepsSelection(el("section", undefined, "keypad-panel"));
  node.setAttribute("aria-label", "Keypad");
  const header = el("div", undefined, "keypad-header"),
    body = el("div", undefined, "keypad-body"),
    digits = el("div", undefined, "keypad-digits"),
    colors = el("div", undefined, "keypad-colors"),
    actions = el("div", undefined, "keypad-actions");
  const toolKey = (value: Tool) =>
    comboLabel(settings.shortcuts[value === "value" ? "toolValue" : value === "corner" ? "toolCorner" : value === "center" ? "toolCenter" : "toolColor"]);
  const tools = segmented<Tool>({
    label: "Input tool",
    items: TOOL_ITEMS.map((item) => ({ ...item, hint: `${item.label} (${toolKey(item.value)})` })),
    value: "value",
    onChange: (value) => options.onAction({ type: "tool", tool: value }),
    className: "tool-switch",
  });
  const collapse = iconButton("chevronLeft", "Collapse keypad", options.onCollapse, "ghost keypad-collapse");
  const rail = iconButton("chevronRight", "Show keypad", options.onExpand, "keypad-rail");
  if (play) header.append(tools.node);
  else header.append(el("span", "Clues", "keypad-title"));
  header.append(collapse);

  const digitButtons = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as Digit[]).map((digit) => {
    const key = button(String(digit), (event) =>
      options.onAction({
        type: "digit",
        digit,
        // Mirror the keyboard: modifier-clicks write notes without switching tools.
        tool: event.shiftKey ? "corner" : event.ctrlKey || event.metaKey ? "center" : tool,
      }),
      "digit-key",
    );
    key.dataset.digit = String(digit);
    digits.append(key);
    return key;
  });
  const colorButtons = COLOR_NAMES.map((name, index) => {
    const swatch = button("", () => options.onAction({ type: "color", color: (index + 1) as CellColor }), "color-key");
    swatch.dataset.color = String(index + 1);
    swatch.setAttribute("aria-label", `${name} (${index + 1})`);
    swatch.title = `${name} (${index + 1})`;
    swatch.append(el("span", String(index + 1), "color-index"));
    colors.append(swatch);
    return swatch;
  });
  const clearColor = iconButton("close", "Remove color", () => options.onAction({ type: "color", color: 0 }), "color-key clear");
  colors.append(clearColor);

  const erase = labeledButton("erase", "Erase", () => options.onAction({ type: "erase" })),
    undo = labeledButton("undo", "Undo", () => options.onAction({ type: "undo" })),
    redo = labeledButton("redo", "Redo", () => options.onAction({ type: "redo" }));
  actions.append(erase, undo, redo);
  let autofill: HTMLButtonElement | undefined;
  if (play && options.onAutofill) {
    autofill = labeledButton("wand", "Fill notes", options.onAutofill, "autofill");
    autofill.title = "Fill corner notes from row, column and box constraints";
    actions.append(autofill);
  }
  let multiSelect: HTMLButtonElement | undefined;
  if (options.onMultiSelect) {
    multiSelect = labeledButton("boxSelect", "Multi-select", options.onMultiSelect, "multi-select");
    actions.append(multiSelect);
  }
  const syncMultiSelect = () => {
    if (!multiSelect) return;
    const combo = comboLabel(settings.shortcuts.multiSelect),
      label = `Multi-select mode${multiSelectActive ? " (on)" : ""}`;
    multiSelect.setAttribute("aria-pressed", String(multiSelectActive));
    multiSelect.setAttribute("aria-label", label);
    multiSelect.title = combo ? `${label} — ${combo}, or Ctrl+click a cell` : `${label} — Ctrl+click a cell`;
  };
  body.append(digits, colors, actions);
  node.append(header, body, rail);
  container.append(node);

  const shortcutTitle = (b: HTMLButtonElement, text: string, action: keyof Settings["shortcuts"]) => {
    const combo = comboLabel(settings.shortcuts[action]);
    b.title = combo ? `${text} (${combo})` : text;
  };

  return {
    node,
    update(state, next, completed) {
      settings = next;
      tool = play ? state.tool : "value";
      tools.set(tool);
      // "hidden" still shows the expand rail on touch screens (see CSS): with
      // no physical keyboard, there must always be some way back in.
      node.dataset.state = settings.keypadHidden ? "hidden" : settings.keypadCollapsed ? "rail" : "expanded";
      node.classList.toggle("calculator", settings.invertKeypad);
      node.dataset.tool = tool;
      colors.hidden = tool !== "color";
      digits.hidden = tool === "color";
      digitButtons.forEach((key, index) => {
        const digit = (index + 1) as Digit,
          done = settings.markCompletedDigits && completed.has(digit);
        key.classList.toggle("done", done);
        key.setAttribute("aria-label", `${tool === "corner" ? "Corner note" : tool === "center" ? "Center note" : "Number"} ${digit}${done ? ", all placed" : ""}`);
        key.disabled = disabled;
      });
      colorButtons.forEach((swatch) => (swatch.disabled = disabled));
      undo.disabled = disabled || !state.past.length;
      redo.disabled = disabled || !state.future.length;
      erase.disabled = disabled;
      clearColor.disabled = disabled;
      if (autofill) autofill.disabled = disabled;
      tools.setDisabled(disabled);
      shortcutTitle(undo, "Undo", "undo");
      shortcutTitle(redo, "Redo", "redo");
      shortcutTitle(erase, "Erase", "erase");
      if (autofill) shortcutTitle(autofill, "Fill corner notes from row, column and box constraints", "autofill");
      syncMultiSelect();
    },
    setDisabled(value) {
      disabled = value;
    },
    setMultiSelect(active) {
      multiSelectActive = active;
      syncMultiSelect();
    },
    destroy() {
      node.remove();
    },
  };
}
