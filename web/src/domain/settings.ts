import {
  AUTOPLAY_SPEEDS,
  COLOR_MODES,
  NOTE_MODIFIERS,
  PALETTES,
  SCALES,
  SHORTCUT_ACTIONS,
  SOLVER_TIME_LIMITS,
  THEMES,
  TRAIN_REPEAT_GAPS,
  TIMER_STARTS,
  type Settings,
  type ShortcutAction,
} from "./model";
import {
  compareIds,
  currentPresetId,
  DEFAULT_TECHNIQUE_PRESET,
  TECHNIQUE_PRESET_IDS,
  techniqueRow,
} from "../solver/techniques/technique-sets";
import { TRAIN_CATEGORY_PATTERN } from "./training";

/** The preset value that selects the custom set (`solverTechniquesOff`). */
export const CUSTOM_TECHNIQUE_SET = "custom";

export const DEFAULT_SHORTCUTS: Readonly<Record<ShortcutAction, string>> = Object.freeze({
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
  multiSelect: "M",
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
    sidebarCollapsed: false,
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
    solverCandidates: true,
    solverHideBasic: false,
    solverAutoplayMs: 0,
    solverTimeLimitS: 60,
    solverTechniquePreset: DEFAULT_TECHNIQUE_PRESET,
    solverTechniquesOff: [],
    trainShowClock: true,
    trainCategoriesOff: [],
    trainRepeatGap: 10,
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
  solverAutoplayMs: AUTOPLAY_SPEEDS,
  solverTimeLimitS: SOLVER_TIME_LIMITS,
  trainRepeatGap: TRAIN_REPEAT_GAPS,
};

/** Normalized combo such as "Ctrl+Shift+Z"; the empty string means unbound. */
export const SHORTCUT_PATTERN =
  /^(?:(?:Ctrl\+)?(?:Alt\+)?(?:Shift\+)?[A-Za-z0-9\-=[\];',./`\\]|(?:Ctrl\+)?(?:Alt\+)?(?:Shift\+)?(?:Escape|Delete|Backspace|Enter|Space|Tab|Home|End|PageUp|PageDown|F[1-9]|F1[0-2]))?$/;

/** Settings checked by their own rules below rather than by CHOICES or as booleans. */
const VALIDATED_APART: ReadonlySet<keyof Settings> = new Set<keyof Settings>([
  "language",
  "shortcuts",
  "solverTechniquePreset",
  "solverTechniquesOff",
  "trainCategoriesOff",
]);

/** Train categories switched off (D106): known ids, strictly ascending. */
function trainCategoriesOff(off: unknown, invalid: (message?: string) => never): string[] {
  if (
    !Array.isArray(off) ||
    !off.every(
      (id, i) =>
        typeof id === "string" &&
        TRAIN_CATEGORY_PATTERN.test(id) &&
        (i === 0 || (off[i - 1] as string) < id),
    )
  )
    invalid();
  return [...(off as string[])];
}

/**
 * Missing fields belong to older libraries and take defaults; explicit invalid
 * values are rejected so corrupted backups never import silently. Fields a
 * build no longer knows are dropped: `solverView` (the Analyze/Explain switch,
 * removed by M2.7 S4, D105) is ignored when an older library still has it.
 */
export function normalizeSettings(
  raw: Record<string, unknown>,
  invalid: (message?: string) => never,
): Settings {
  if (typeof raw.showConflicts !== "boolean" || (raw.language !== "pt-BR" && raw.language !== "en"))
    invalid();
  const settings = defaultSettings();
  const target = settings as unknown as Record<string, unknown>;
  for (const key of Object.keys(settings) as (keyof Settings)[]) {
    if (VALIDATED_APART.has(key)) continue;
    const value = raw[key];
    if (value === undefined) continue;
    const choices = CHOICES[key];
    if (choices ? !choices.includes(value) : typeof value !== "boolean") invalid();
    target[key] = value;
  }
  if (raw.shortcuts !== undefined) {
    const shortcuts = raw.shortcuts;
    if (shortcuts === null || typeof shortcuts !== "object" || Array.isArray(shortcuts)) invalid();
    for (const action of SHORTCUT_ACTIONS) {
      const combo = (shortcuts as Record<string, unknown>)[action];
      if (combo === undefined) continue;
      if (typeof combo !== "string" || !SHORTCUT_PATTERN.test(combo)) invalid();
      settings.shortcuts[action] = combo;
    }
  }
  // Technique set (M2.7, D105). A retired preset id follows its name to the
  // current version (item 5); an unknown one is rejected like every other
  // explicit invalid value (item 9).
  if (raw.solverTechniquePreset !== undefined) {
    const preset =
      typeof raw.solverTechniquePreset === "string"
        ? currentPresetId(raw.solverTechniquePreset)
        : undefined;
    if (
      preset === undefined ||
      (preset !== CUSTOM_TECHNIQUE_SET && !TECHNIQUE_PRESET_IDS.includes(preset))
    )
      invalid();
    settings.solverTechniquePreset = preset;
  }
  if (raw.solverTechniquesOff !== undefined) {
    const off = raw.solverTechniquesOff;
    if (
      !Array.isArray(off) ||
      !off.every(
        (id, i) =>
          typeof id === "string" &&
          techniqueRow(id) !== undefined &&
          (i === 0 || compareIds(off[i - 1] as string, id) < 0),
      )
    )
      invalid();
    settings.solverTechniquesOff = [...(off as string[])];
  }
  if (raw.trainCategoriesOff !== undefined)
    settings.trainCategoriesOff = trainCategoriesOff(raw.trainCategoriesOff, invalid);
  return settings;
}
