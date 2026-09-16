export type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type Value = 0 | Digit;
/** Input tools. "corner" and "center" edit notes; "color" paints the cell background. */
export type Tool = "value" | "corner" | "center" | "color";
export const TOOLS = ["value", "corner", "center", "color"] as const;
/** 0 = no color; 1–6 index the accessible cell palette. */
export type CellColor = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const CELL_COLORS = 6;
/**
 * `notes` are corner notes. Optional layers are omitted when empty so older
 * records, histories and backups keep their exact shape.
 */
export interface CellState {
  value: Value;
  notes: Digit[];
  center?: Digit[];
  color?: Exclude<CellColor, 0>;
}
export interface CellChange {
  index: number;
  before: CellState;
  after: CellState;
}
export const EDIT_LABELS = [
  "digit",
  "note",
  "center",
  "color",
  "erase",
  "reset",
  "paste",
  "autofill",
] as const;
export interface Edit {
  label: (typeof EDIT_LABELS)[number];
  changes: CellChange[];
}
export interface EditorState {
  cells: CellState[];
  /** Selected cell index, or -1 when nothing is selected. */
  selected: number;
  tool: Tool;
  past: Edit[];
  future: Edit[];
}
export interface EditorContext {
  mode: "create" | "play";
  givens: readonly Value[];
}
export interface ClassicDefinition {
  kind: "classic";
  version: 1;
  width: 9;
  height: 9;
  givens: Value[];
}
export interface Draft {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  editor: EditorState;
  sourcePuzzleId?: string;
  finishedPuzzleId?: string;
}
export interface Puzzle {
  id: string;
  name: string;
  createdAt: string;
  definition: ClassicDefinition;
}
/** Active play time. Hidden timers keep counting; inactive pages never do. */
export interface TimerState {
  elapsedMs: number;
  paused: boolean;
  /** False until the first move when the "on first move" start option is used. */
  started: boolean;
}
export interface PlaySession {
  puzzleId: string;
  updatedAt: string;
  editor: EditorState;
  timer?: TimerState;
}
export const COLOR_MODES = ["light", "dark"] as const;
export const THEMES = ["blue", "green", "pink", "purple", "gray"] as const;
export type ColorMode = (typeof COLOR_MODES)[number];
export type Theme = (typeof THEMES)[number];
export const KEYPAD_MODES = ["full", "compact", "hidden"] as const;
export const KEYPAD_LAYOUTS = ["phone", "calculator"] as const;
export const TIMER_STARTS = ["immediately", "first-move"] as const;
export const SCALES = [100, 115, 130] as const;
export const PALETTES = ["default", "colorblind"] as const;
export const SOLVER_VIEWS = ["analyze", "explain"] as const;
export const AUTOPLAY_SPEEDS = [0, 1500, 800, 350] as const;
export const SOLVER_TIME_LIMITS = [15, 60, 180] as const;
export const NOTE_MODIFIERS = ["Shift", "Control", "Alt", "None"] as const;
export type NoteModifier = (typeof NOTE_MODIFIERS)[number];
export const SHORTCUT_ACTIONS = [
  "toolValue",
  "toolCorner",
  "toolCenter",
  "toolColor",
  "undo",
  "redo",
  "erase",
  "deselect",
  "autofill",
  "copyCell",
  "pasteCell",
  "pause",
  "fullscreen",
] as const;
export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];
export interface Settings {
  language: "en";
  colorMode: ColorMode;
  theme: Theme;
  /** Highlight digits that break a row, column or box rule during play. */
  showConflicts: boolean;
  /** Highlight notes already ruled out by a placed digit in the same unit. */
  showNoteConflicts: boolean;
  keypad: (typeof KEYPAD_MODES)[number];
  keypadLayout: (typeof KEYPAD_LAYOUTS)[number];
  showLabels: boolean;
  highlightPeers: boolean;
  highlightSameDigit: boolean;
  markCompletedDigits: boolean;
  showTimer: boolean;
  timerStart: (typeof TIMER_STARTS)[number];
  checkOnFinish: boolean;
  markCorrectDigits: boolean;
  cornerModifier: NoteModifier;
  centerModifier: NoteModifier;
  shortcuts: Record<ShortcutAction, string>;
  textScale: (typeof SCALES)[number];
  digitScale: (typeof SCALES)[number];
  palette: (typeof PALETTES)[number];
  boldDigits: boolean;
  highContrast: boolean;
  colorPatterns: boolean;
  reduceMotion: boolean;
  solverView: (typeof SOLVER_VIEWS)[number];
  solverCandidates: boolean;
  solverAutoplayMs: (typeof AUTOPLAY_SPEEDS)[number];
  solverTimeLimitS: (typeof SOLVER_TIME_LIMITS)[number];
}
export interface LibraryData {
  formatVersion: 2;
  revision: number;
  drafts: Record<string, Draft>;
  puzzles: Record<string, Puzzle>;
  sessions: Record<string, PlaySession>;
  settings: Settings;
}
export function emptyCell(): CellState {
  return { value: 0, notes: [] };
}
export function emptyEditor(): EditorState {
  return {
    cells: Array.from({ length: 81 }, emptyCell),
    selected: -1,
    tool: "value",
    past: [],
    future: [],
  };
}
export function newTimer(start: Settings["timerStart"]): TimerState {
  return { elapsedMs: 0, paused: false, started: start === "immediately" };
}
