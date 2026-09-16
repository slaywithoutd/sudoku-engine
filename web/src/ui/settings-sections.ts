import type { ScreenServices } from "../app/controller";
import {
  COLOR_MODES,
  NOTE_MODIFIERS,
  SHORTCUT_ACTIONS,
  THEMES,
  emptyEditor,
  type Settings,
  type ShortcutAction,
} from "../domain/model";
import { DEFAULT_SHORTCUTS } from "../domain/settings";
import { parsePuzzleString } from "../domain/classic";
import { el, button } from "./dom";
import { comboLabel, segmented, switchField } from "./components";
import { comboFromEvent } from "./input";
import { mountBoard } from "./board";

export type SectionId =
  | "appearance"
  | "accessibility"
  | "board"
  | "keypad"
  | "notes"
  | "timer"
  | "completion"
  | "shortcuts"
  | "solver";
export const SECTION_TITLES: Record<SectionId, string> = {
  appearance: "Appearance",
  accessibility: "Accessibility",
  board: "Board",
  keypad: "Keypad",
  notes: "Notes & warnings",
  timer: "Timer",
  completion: "Completion",
  shortcuts: "Keyboard shortcuts",
  solver: "Solver",
};
export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  toolValue: "Digit tool",
  toolCorner: "Corner note tool",
  toolCenter: "Center note tool",
  toolColor: "Color tool",
  undo: "Undo",
  redo: "Redo",
  erase: "Erase",
  deselect: "Clear selection",
  autofill: "Fill notes",
  copyCell: "Copy cell",
  pasteCell: "Paste cell",
  pause: "Pause / resume timer",
  fullscreen: "Fullscreen",
};

type Refresher = (settings: Settings) => void;
const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

/** A small fixed puzzle exercising clues, both note layers, colors and a
 * colored cell that is also selected (so the selection/annotation hierarchy
 * fix in the board styles stays visible here too). */
function demoPreviewState() {
  const givens = parsePuzzleString(
    "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
  );
  const state = emptyEditor();
  state.selected = 11;
  state.cells[2] = { value: 4, notes: [] };
  state.cells[3] = { value: 0, notes: [2, 6] };
  state.cells[5] = { value: 0, notes: [], center: [2, 4, 8] };
  state.cells[10] = { value: 0, notes: [], color: 1 };
  state.cells[11] = { value: 0, notes: [], color: 5 };
  state.cells[12] = { value: 2, notes: [] };
  return { givens, state };
}
export interface LivePreview {
  update(settings: Settings): void;
  destroy(): void;
}
/**
 * A small live board reflecting board- and note-related settings as they
 * change, so trying a setting never means scrolling away to see its effect.
 * Callers mount it once and keep it updated from their own subscription.
 */
export function mountLivePreview(container: HTMLElement, initial: Settings): LivePreview {
  const wrap = el("div", undefined, "settings-live-preview"),
    boardHost = el("div", undefined, "settings-live-preview-board"),
    label = el("span", "Live preview", "settings-live-preview-label");
  const { givens, state } = demoPreviewState();
  const board = mountBoard(boardHost, {
    context: { mode: "play", givens },
    state,
    display: initial,
    onAction: () => {},
    interactive: false,
    label: "Live settings preview",
  });
  wrap.append(boardHost, label);
  container.prepend(wrap);
  return {
    update: (settings) => board.update(state, settings),
    destroy: () => wrap.remove(),
  };
}

export function updateSetting<K extends keyof Settings>(services: ScreenServices, key: K, value: Settings[K]): void {
  services.controller.update((data) =>
    data.settings[key] === value ? data : { ...data, settings: { ...data.settings, [key]: value } },
  );
}

/** Label + hint + control row used by every non-switch setting. */
function row(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const node = el("div", undefined, "setting-row"),
    text = el("div", undefined, "field-text"),
    labelNode = el("span", label, "field-label");
  labelNode.id = crypto.randomUUID();
  control.setAttribute("aria-labelledby", labelNode.id);
  text.append(labelNode);
  if (hint) text.append(el("span", hint, "field-hint"));
  node.append(text, control);
  return node;
}

export function renderSettingsSections(
  container: HTMLElement,
  services: ScreenServices,
  ids: readonly SectionId[],
): () => void {
  const refreshers: Refresher[] = [];
  const settings = () => services.controller.snapshot().settings;
  const choice = <K extends keyof Settings>(key: K, label: string, items: { value: Settings[K] & (string | number); label: string }[], hint?: string) => {
    const control = segmented({ label, items, value: settings()[key] as Settings[K] & (string | number), onChange: (value) => updateSetting(services, key, value as Settings[K]) });
    refreshers.push((s) => control.set(s[key] as Settings[K] & (string | number)));
    return row(label, control.node, hint);
  };
  const toggle = (key: { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings], label: string, hint?: string) => {
    const control = switchField({ label, hint, checked: settings()[key], onChange: (checked) => updateSetting(services, key, checked) });
    refreshers.push((s) => control.set(s[key]));
    return control.node;
  };
  const builders: Record<SectionId, () => HTMLElement[]> = {
    appearance: () => {
      const themes = el("div", undefined, "theme-choices");
      themes.setAttribute("role", "radiogroup");
      const name = `theme-${crypto.randomUUID()}`;
      const radios = THEMES.map((theme) => {
        const option = el("label", undefined, "theme-option"),
          radio = el("input"),
          swatch = el("span", undefined, "theme-swatch");
        radio.type = "radio";
        radio.name = name;
        radio.value = theme;
        radio.addEventListener("change", () => radio.checked && updateSetting(services, "theme", theme));
        option.dataset.theme = theme;
        swatch.setAttribute("aria-hidden", "true");
        option.append(radio, swatch, el("span", capitalize(theme)));
        themes.append(option);
        return radio;
      });
      refreshers.push((s) => radios.forEach((r) => (r.checked = r.value === s.theme)));
      return [
        choice("colorMode", "Mode", COLOR_MODES.map((value) => ({ value, label: capitalize(value) }))),
        row("Color", themes),
      ];
    },
    accessibility: () => {
      const scales = [
        { value: 100, label: "Default" },
        { value: 115, label: "Large" },
        { value: 130, label: "Larger" },
      ] as const;
      return [
        choice("textScale", "Text size", [...scales]),
        choice("digitScale", "Board digit size", [...scales]),
        choice("palette", "Color vision", [
          { value: "default", label: "Default" },
          { value: "colorblind", label: "Color-blind safe" },
        ], "Safe palette for red–green and blue–yellow color blindness"),
        toggle("colorPatterns", "Patterns on cell colors", "Tell colors apart without relying on hue"),
        toggle("boldDigits", "Stronger digits", "Heavier digits with an outline"),
        toggle("highContrast", "High contrast", "Darker lines, text and highlights"),
        toggle("reduceMotion", "Reduce motion"),
      ];
    },
    board: () => [
      toggle("highlightPeers", "Highlight seen cells", "Row, column and box of the selected cell"),
      toggle("highlightSameDigit", "Highlight matching digits"),
      toggle("showLabels", "Row and column labels", "A–I rows, 1–9 columns"),
    ],
    keypad: () => [
      toggle("keypadHidden", "Hide keypad", "A small arrow next to the board still brings it back"),
      toggle("invertKeypad", "Invert keyboard layout", "7 8 9 on top instead of 1 2 3"),
      toggle("markCompletedDigits", "Mark completed digits", "Dim a number once all nine are placed"),
    ],
    notes: () => {
      const modifiers = NOTE_MODIFIERS.map((value) => ({ value, label: value === "Control" ? comboLabel("Ctrl") : value }));
      return [
        toggle("showConflicts", "Warn on conflicting digits", "Mark digits that repeat in a row, column or box"),
        toggle("showNoteConflicts", "Warn on conflicting notes", "Mark notes ruled out by a placed digit"),
        choice("cornerModifier", "Corner note key", modifiers, "Hold with a number"),
        choice("centerModifier", "Center note key", modifiers, "Hold with a number"),
      ];
    },
    timer: () => [
      toggle("showTimer", "Show timer", "Time is tracked even while hidden"),
      choice("timerStart", "Start timer", [
        { value: "immediately", label: "Immediately" },
        { value: "first-move", label: "On first move" },
      ], "For new games"),
    ],
    completion: () => [
      toggle("checkOnFinish", "Check when the grid is full", "Otherwise, check from the game menu"),
      toggle("markCorrectDigits", "Mark correct digits", "Only for puzzles with exactly one solution"),
    ],
    shortcuts: () => shortcutRows(services, refreshers),
    solver: () => [
      toggle("solverCandidates", "Show candidates while explaining"),
      toggle("solverHideBasic", "Hide basic eliminations", "Explain only named techniques"),
      choice("solverAutoplayMs", "Step playback", [
        { value: 0, label: "Manual" },
        { value: 1500, label: "Slow" },
        { value: 800, label: "Normal" },
        { value: 350, label: "Fast" },
      ]),
      choice("solverTimeLimitS", "Time limit", [
        { value: 15, label: "15 s" },
        { value: 60, label: "1 min" },
        { value: 180, label: "3 min" },
      ], "Longer limits help very hard puzzles"),
    ],
  };
  for (const id of ids) {
    // Shortcuts configure input, not the board; set it apart from the
    // gameplay/appearance settings above it instead of blending into them.
    if (id === "shortcuts") container.append(el("p", "Input", "settings-group-label"));
    const section = el("section", undefined, "settings-section");
    section.id = `settings-${id}`;
    const heading = el("h2", SECTION_TITLES[id]);
    heading.id = `${section.id}-title`;
    section.setAttribute("aria-labelledby", heading.id);
    section.append(heading, ...builders[id]());
    container.append(section);
  }
  const refresh = () => refreshers.forEach((r) => r(settings()));
  refresh();
  return services.controller.subscribe(refresh);
}

function shortcutRows(services: ScreenServices, refreshers: Refresher[]): HTMLElement[] {
  const list = el("div", undefined, "shortcut-list"),
    message = el("p", undefined, "field-hint shortcut-message");
  message.setAttribute("role", "status");
  let recording: { action: ShortcutAction; stop: () => void } | undefined;
  const buttons = new Map<ShortcutAction, HTMLButtonElement>();
  const write = (action: ShortcutAction, combo: string) => {
    services.controller.update((data) => {
      const shortcuts = { ...data.settings.shortcuts };
      for (const other of SHORTCUT_ACTIONS)
        if (other !== action && combo && shortcuts[other] === combo) {
          shortcuts[other] = "";
          message.textContent = `${comboLabel(combo)} was removed from “${SHORTCUT_LABELS[other]}”.`;
        }
      shortcuts[action] = combo;
      return { ...data, settings: { ...data.settings, shortcuts } };
    });
  };
  for (const action of SHORTCUT_ACTIONS) {
    const item = el("div", undefined, "setting-row shortcut-row"),
      label = el("span", SHORTCUT_LABELS[action], "field-label"),
      record = button("", () => (recording?.action === action ? recording.stop() : start()), "shortcut-key");
    label.id = crypto.randomUUID();
    record.setAttribute("aria-describedby", label.id);
    buttons.set(action, record);
    const start = () => {
      recording?.stop();
      record.textContent = "Press keys…";
      record.classList.add("recording");
      message.textContent = "Press a key combination. Backspace clears it, Escape cancels.";
      const onKey = (event: KeyboardEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Escape") return stop();
        if (event.key === "Backspace") {
          write(action, "");
          return stop();
        }
        const combo = comboFromEvent(event);
        if (!combo) return;
        const bare = !event.ctrlKey && !event.metaKey && !event.altKey;
        if (bare && (/^[0-9]$/.test(combo.replace("Shift+", "")) || event.key.startsWith("Arrow"))) {
          message.textContent = "Numbers and arrow keys are reserved for the board.";
          return;
        }
        message.textContent = "";
        write(action, combo);
        stop();
      };
      const stop = () => {
        removeEventListener("keydown", onKey, true);
        record.classList.remove("recording");
        recording = undefined;
        refreshers.forEach((r) => r(services.controller.snapshot().settings));
      };
      addEventListener("keydown", onKey, true);
      recording = { action, stop };
    };
    item.append(label, record);
    list.append(item);
  }
  refreshers.push((s) => {
    for (const [action, record] of buttons) {
      if (recording?.action === action) continue;
      const combo = comboLabel(s.shortcuts[action]);
      record.replaceChildren(combo ? el("kbd", combo) : el("span", "Not set", "muted"));
      record.setAttribute("aria-label", `${SHORTCUT_LABELS[action]}: ${combo || "not set"}. Change`);
    }
  });
  const reset = button("Restore defaults", () => {
    services.controller.update((data) => ({ ...data, settings: { ...data.settings, shortcuts: { ...DEFAULT_SHORTCUTS } } }));
    message.textContent = "Default shortcuts restored.";
  }, "ghost");
  const footer = el("div", undefined, "shortcut-footer");
  footer.append(message, reset);
  return [list, footer];
}
