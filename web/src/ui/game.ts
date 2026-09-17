import type { CellState, EditorState, Settings, ShortcutAction, Value } from "../domain/model";
import type { BoardAction } from "../domain/editor";
import { effectiveValues } from "../domain/classic";
import { el, button } from "./dom";
import { icon } from "./icons";
import { ignoredTarget, keyIntent } from "./input";
import { keepsSelection } from "./board";

export interface GameShell {
  root: HTMLElement;
  /** Title/name area on the left of the top bar. */
  title: HTMLElement;
  /** Timer or status area. */
  status: HTMLElement;
  /** Icon actions on the right of the top bar. */
  actions: HTMLElement;
  /** Board column (board + overlays such as the pause cover). */
  stage: HTMLElement;
  /** Right column: keypad and screen-specific panels. */
  side: HTMLElement;
}
/** Board-first layout shared by Play, Create and Solve. */
export function gameShell(container: HTMLElement, kind: "play" | "create" | "solve"): GameShell {
  const root = el("div", undefined, `game game-${kind}`),
    bar = keepsSelection(el("header", undefined, "game-bar")),
    title = el("div", undefined, "game-title"),
    status = el("div", undefined, "game-status"),
    actions = el("div", undefined, "game-actions"),
    stage = el("div", undefined, "game-stage"),
    side = el("div", undefined, "game-side");
  bar.append(title, status, actions);
  root.append(bar, stage, side);
  container.append(root);
  return { root, title, status, actions, stage, side };
}

/**
 * Screen-level keyboard handling: works wherever focus is on the screen
 * (not only on a cell) but never while typing or inside dialogs and menus.
 */
export function bindGameKeys(options: {
  settings: () => Settings;
  state: () => EditorState;
  dispatch: (action: BoardAction) => void;
  /** Returns false when the command does not apply, letting the browser act. */
  command: (action: ShortcutAction) => boolean;
  enabled?: () => boolean;
  /** True while the multi-select hotkey/toggle is active. */
  isMultiSelectMode?: () => boolean;
}): () => void {
  const listener = (event: KeyboardEvent) => {
    if (event.defaultPrevented || ignoredTarget(event) || options.enabled?.() === false) return;
    const intent = keyIntent(event, options.settings(), options.state().tool);
    if (!intent) return;
    if (intent.kind === "command") {
      if (options.command(intent.action)) event.preventDefault();
      return;
    }
    event.preventDefault();
    if (intent.kind === "move")
      options.dispatch({
        type: "move",
        dr: intent.dr,
        dc: intent.dc,
        extend: intent.extend || options.isMultiSelectMode?.() === true,
      });
    else if (intent.kind === "erase") options.dispatch({ type: "erase" });
    else options.dispatch({ type: "digit", digit: intent.digit, tool: intent.tool });
  };
  document.addEventListener("keydown", listener);
  return () => document.removeEventListener("keydown", listener);
}

/**
 * In-app cell clipboard. A copied cell keeps its displayed digit (a clue is
 * copied as a plain digit), corner and center notes and color — never its
 * clue status. The system clipboard also receives the digit or notes as text.
 */
let copiedCell: CellState | null = null;
export function copyCell(state: EditorState, givens: readonly Value[]): boolean {
  if (state.selected < 0) return false;
  const cell = state.cells[state.selected],
    value = effectiveValues(state, givens)[state.selected];
  copiedCell = structuredClone({ ...cell, value });
  const text = value ? String(value) : [...cell.notes, ...(cell.center ?? [])].join("");
  void navigator.clipboard?.writeText(text).catch(() => {});
  return true;
}
export function pasteCellAction(state: EditorState): BoardAction | null {
  return copiedCell && state.selected >= 0 ? { type: "paste", cell: structuredClone(copiedCell) } : null;
}
export const hasCopiedCell = () => copiedCell !== null;

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Application-wide fullscreen: real browser fullscreen of the whole document
 * where available, the `focus-mode` class everywhere. Navigating between
 * screens never changes it; only the user (control, shortcut or the
 * browser's own exit) does.
 */
export function toggleFullscreen(): void {
  const root = document.documentElement;
  if (root.classList.contains("focus-mode")) {
    root.classList.remove("focus-mode");
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  } else {
    root.classList.add("focus-mode");
    if (document.fullscreenEnabled && !document.fullscreenElement) void root.requestFullscreen().catch(() => {});
  }
  dispatchEvent(new Event("focusmodechange"));
}
/** Labeled toggle that keeps its icon and name in sync with focus mode. */
export function fullscreenButton(className = ""): HTMLButtonElement {
  const node = button("", () => toggleFullscreen(), className);
  const sync = () => {
    const on = isFullscreen(),
      label = on ? "Exit fullscreen" : "Fullscreen";
    node.replaceChildren(icon(on ? "shrink" : "expand"), el("span", label));
    node.setAttribute("aria-label", label);
    node.title = label;
  };
  addEventListener("focusmodechange", sync);
  sync();
  return node;
}
export const isFullscreen = () => document.documentElement.classList.contains("focus-mode");
// Escape or the browser UI can leave fullscreen; keep focus mode in sync.
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && isFullscreen()) {
    document.documentElement.classList.remove("focus-mode");
    dispatchEvent(new Event("focusmodechange"));
  }
});

export function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob),
    link = el("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
export const fileName = (name: string, extension: string) =>
  `${name.trim().replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-").toLowerCase() || "sudoku"}.${extension}`;

/** Renders the board to a PNG with the current theme, independent of screen size. */
export async function boardImage(givens: readonly Value[], state: EditorState): Promise<Blob> {
  const size = 1080,
    pad = 36,
    cell = (size - pad * 2) / 9,
    canvas = el("canvas"),
    ctx = canvas.getContext("2d")!,
    css = getComputedStyle(document.documentElement),
    token = (name: string) => css.getPropertyValue(name).trim();
  canvas.width = canvas.height = size;
  ctx.fillStyle = token("--surface");
  ctx.fillRect(0, 0, size, size);
  const values = effectiveValues(state, givens),
    font = css.fontFamily;
  state.cells.forEach((c, i) => {
    const x = pad + (i % 9) * cell,
      y = pad + Math.floor(i / 9) * cell;
    if (c.color) {
      ctx.fillStyle = token(`--cell-color-${c.color}`);
      ctx.fillRect(x, y, cell, cell);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (values[i]) {
      ctx.fillStyle = givens[i] ? token("--ink") : token("--entry");
      ctx.font = `${givens[i] ? 700 : 400} ${cell * 0.6}px ${font}`;
      ctx.fillText(String(values[i]), x + cell / 2, y + cell / 2 + cell * 0.03);
      return;
    }
    ctx.fillStyle = token("--note");
    ctx.font = `500 ${cell * 0.22}px ${font}`;
    const slots = [[0, 0], [2, 0], [0, 2], [2, 2], [1, 0], [1, 2], [0, 1], [2, 1], [1, 1]];
    c.notes.forEach((n, k) => {
      const [sx, sy] = slots[k];
      ctx.fillText(String(n), x + cell * (0.2 + sx * 0.3), y + cell * (0.2 + sy * 0.3));
    });
    if (c.center?.length) {
      ctx.font = `500 ${cell * (c.center.length > 4 ? 0.17 : 0.24)}px ${font}`;
      ctx.fillText(c.center.join(""), x + cell / 2, y + cell / 2);
    }
  });
  for (let i = 0; i <= 9; i++) {
    ctx.strokeStyle = token(i % 3 === 0 ? "--grid-strong" : "--grid-thin");
    ctx.lineWidth = i % 3 === 0 ? 4 : 1.5;
    ctx.beginPath();
    ctx.moveTo(pad + i * cell, pad);
    ctx.lineTo(pad + i * cell, size - pad);
    ctx.moveTo(pad, pad + i * cell);
    ctx.lineTo(size - pad, pad + i * cell);
    ctx.stroke();
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Image export failed."))), "image/png"),
  );
}

/** Short-lived confirmation near the top bar (copy, export…). */
export function toast(message: string): void {
  document.querySelector(".toast")?.remove();
  const node = el("div", message, "toast");
  node.setAttribute("role", "status");
  (document.fullscreenElement ?? document.body).append(node);
  setTimeout(() => node.remove(), 2600);
}
