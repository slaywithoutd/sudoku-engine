import {
  AUTOPLAY_SPEEDS,
  COLOR_MODES,
  NOTE_MODIFIERS,
  PALETTES,
  SCALES,
  SHORTCUT_ACTIONS,
  SOLVER_TIME_LIMITS,
  SOLVER_VIEWS,
  THEMES,
  TIMER_STARTS,
  type Settings,
  type ShortcutAction,
} from "./model";

export const DEFAULT_SHORTCUTS: Readonly<Record<ShortcutAction, string>> =
  Object.freeze({
    toolValue: "Z",
    toolCorner: "X",
    toolCenter: "C",
    toolColor: "V",
    undo: "Ctrl+Z",
    redo: "Ctrl+Y",
    erase: "Delete",
    deselect: "Escape",
    autofill: "",
    copyCell: "Ctrl+C",
    pasteCell: "Ctrl+V",
    pause: "P",
    fullscreen: "F",
  });

export function defaultSettings(): Settings {
  return {
    language: "en",
    colorMode: "light",
    theme: "green",
    showConflicts: false,
    showNoteConflicts: false,
    keypadHidden: false,
    keypadCollapsed: false,
    invertKeypad: false,
    showLabels: false,
    highlightPeers: true,
    highlightSameDigit: true,
    markCompletedDigits: true,
    showTimer: true,
    timerStart: "immediately",
    checkOnFinish: true,
    markCorrectDigits: false,
    cornerModifier: "Shift",
    centerModifier: "Control",
    shortcuts: { ...DEFAULT_SHORTCUTS },
    textScale: 100,
    digitScale: 100,
    palette: "default",
    boldDigits: false,
    highContrast: false,
    colorPatterns: false,
    reduceMotion: false,
    solverView: "explain",
    solverCandidates: true,
    solverHideBasic: false,
    solverAutoplayMs: 0,
    solverTimeLimitS: 60,
  };
}

const CHOICES: { [K in keyof Settings]?: readonly unknown[] } = {
  colorMode: COLOR_MODES,
  theme: THEMES,
  timerStart: TIMER_STARTS,
  cornerModifier: NOTE_MODIFIERS,
  centerModifier: NOTE_MODIFIERS,
  textScale: SCALES,
  digitScale: SCALES,
  palette: PALETTES,
  solverView: SOLVER_VIEWS,
  solverAutoplayMs: AUTOPLAY_SPEEDS,
  solverTimeLimitS: SOLVER_TIME_LIMITS,
};

/** Normalized combo such as "Ctrl+Shift+Z"; the empty string means unbound. */
export const SHORTCUT_PATTERN =
  /^(?:(?:Ctrl\+)?(?:Alt\+)?(?:Shift\+)?[A-Za-z0-9\-=[\];',./`\\]|(?:Ctrl\+)?(?:Alt\+)?(?:Shift\+)?(?:Escape|Delete|Backspace|Enter|Space|Tab|Home|End|PageUp|PageDown|F[1-9]|F1[0-2]))?$/;

/**
 * Missing fields belong to older libraries and take defaults; explicit invalid
 * values are rejected so corrupted backups never import silently.
 */
export function normalizeSettings(
  raw: Record<string, unknown>,
  invalid: (message?: string) => never,
): Settings {
  if (
    typeof raw.showConflicts !== "boolean" ||
    (raw.language !== "pt-BR" && raw.language !== "en")
  )
    invalid();
  const settings = defaultSettings();
  const target = settings as unknown as Record<string, unknown>;
  for (const key of Object.keys(settings) as (keyof Settings)[]) {
    if (key === "language" || key === "shortcuts") continue;
    const value = raw[key];
    if (value === undefined) continue;
    const choices = CHOICES[key];
    if (choices ? !choices.includes(value) : typeof value !== "boolean")
      invalid();
    target[key] = value;
  }
  if (raw.shortcuts !== undefined) {
    const shortcuts = raw.shortcuts;
    if (
      shortcuts === null ||
      typeof shortcuts !== "object" ||
      Array.isArray(shortcuts)
    )
      invalid();
    for (const action of SHORTCUT_ACTIONS) {
      const combo = (shortcuts as Record<string, unknown>)[action];
      if (combo === undefined) continue;
      if (typeof combo !== "string" || !SHORTCUT_PATTERN.test(combo))
        invalid();
      settings.shortcuts[action] = combo;
    }
  }
  return settings;
}
