import { emptyEditor, type EditorState } from "../../src/domain/model";
import { reduceEditor } from "../../src/domain/editor";
import { defaultSettings } from "../../src/domain/settings";
import type { ScreenServices } from "../../src/app/controller";
import { gameShell } from "../../src/ui/game";
import { mountPuzzleSurface } from "../../src/ui/puzzle-editor";
import "../../src/styles.css";
// Mounts the real shared puzzle surface (board, keypad, keys, selection) in play mode.
const givens = Array(81).fill(0);
givens[80] = 9;
const context = { mode: "play" as const, givens };
let state: EditorState = emptyEditor();
let settings = defaultSettings();
const listeners = new Set<() => void>();
const services = {
  controller: {
    snapshot: () => ({ settings }),
    update: (transform: (d: { settings: typeof settings }) => { settings: typeof settings }) => {
      settings = transform({ settings }).settings;
      listeners.forEach((l) => l());
    },
    subscribe: (listener: () => void) => (listeners.add(listener), () => listeners.delete(listener)),
  },
} as unknown as ScreenServices;
const container = document.querySelector<HTMLElement>("#board")!;
const mount = () => {
  container.replaceChildren();
  const shell = gameShell(container, "play");
  const surface = mountPuzzleSurface(shell, services, {
    mode: "play",
    givens,
    state: () => state,
    dispatch(action) {
      state = reduceEditor(context, state, action);
      surface.render();
    },
  });
  listeners.add(() => surface.render());
  return surface;
};
let view = mount();
document.querySelector("#remount")!.addEventListener("click", () => {
  view.destroy();
  listeners.clear();
  view = mount();
});
