export type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type Value = 0 | Digit;
export type Tool = "value" | "corner";
export interface CellState {
  value: Value;
  notes: Digit[];
}
export interface CellChange {
  index: number;
  before: CellState;
  after: CellState;
}
export interface Edit {
  label: "digit" | "note" | "erase" | "reset";
  changes: CellChange[];
}
export interface EditorState {
  cells: CellState[];
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
export interface PlaySession {
  puzzleId: string;
  updatedAt: string;
  editor: EditorState;
}
export const COLOR_MODES = ["light", "dark"] as const;
export const THEMES = ["blue", "green", "pink", "purple", "gray"] as const;
export type ColorMode = (typeof COLOR_MODES)[number];
export type Theme = (typeof THEMES)[number];
export interface Settings {
  showConflicts: boolean;
  language: "en";
  colorMode: ColorMode;
  theme: Theme;
}
export interface LibraryData {
  formatVersion: 1;
  revision: number;
  drafts: Record<string, Draft>;
  puzzles: Record<string, Puzzle>;
  sessions: Record<string, PlaySession>;
  settings: Settings;
}
export function emptyEditor(): EditorState {
  return {
    cells: Array.from({ length: 81 }, () => ({ value: 0, notes: [] })),
    selected: 0,
    tool: "value",
    past: [],
    future: [],
  };
}
