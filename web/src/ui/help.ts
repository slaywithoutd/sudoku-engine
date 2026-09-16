import type { ScreenServices } from "../app/controller";
import { SHORTCUT_ACTIONS } from "../domain/model";
import { IMPORT_FORMATS_SUMMARY } from "../domain/puzzle-format";
import { el, button } from "./dom";
import { comboLabel } from "./components";
import { SHORTCUT_LABELS } from "./settings-sections";

/** All gameplay explanations live here so game screens stay free of instructions. */
export function mountHelp(container: HTMLElement, services: ScreenServices): () => void {
  const page = el("div", undefined, "help-page");
  const heading = el("div", undefined, "page-heading");
  heading.append(el("h1", "How to use"), button("Shortcut settings", () => services.navigate({ screen: "settings" })));
  page.append(heading);
  const section = (title: string, ...children: (HTMLElement | string)[]) => {
    const node = el("section", undefined, "help-section");
    node.append(el("h2", title), ...children.map((c) => (typeof c === "string" ? el("p", c) : c)));
    page.append(node);
  };
  const list = (items: [string, string][]) => {
    const dl = el("dl", undefined, "help-list");
    for (const [term, text] of items) dl.append(el("dt", term), el("dd", text));
    return dl;
  };
  const settings = services.controller.snapshot().settings;
  const modifier = (m: string) => (m === "None" ? "—" : comboLabel(m === "Control" ? "Ctrl" : m));

  section(
    "Entering digits",
    list([
      ["Select", "Click or tap a cell, or use the arrow keys. Click the selected cell again, click outside the board or press Esc to clear the selection."],
      ["Digits", "Type 1–9 or use the keypad. Entering the same digit again removes it."],
      ["Erase", "Delete, Backspace or 0 erases in layers: the digit first, then notes, then the color."],
      ["Undo", "Every edit can be undone, including Restart and Fill notes."],
    ]),
  );
  section(
    "Notes and colors",
    list([
      ["Corner notes", `Hold ${modifier(settings.cornerModifier)} with a digit, or pick the Corner tool. They fill the corners, then the edges.`],
      ["Center notes", `Hold ${modifier(settings.centerModifier)} with a digit, or pick the Center tool.`],
      ["Colors", "Pick the Color tool, then 1–6. Turn on patterns in Settings → Accessibility to tell colors apart without hue."],
      ["Fill notes", "Writes every candidate allowed by the cell's row, column and box. It never uses the solution."],
      ["Copy and paste", "Copying a cell keeps its digit, notes and color. Pasting never changes a clue."],
    ]),
  );
  section(
    "Timer",
    "Only active play counts: paused games, hidden tabs and other windows are excluded. The timer keeps counting while it is hidden. Pausing covers the board.",
  );
  section(
    "Creating and importing",
    "Finishing a draft locks its clues; edit a copy to change them later. Drafts with conflicts are saved so you can return to them.",
    el("p", `Import accepts ${IMPORT_FORMATS_SUMMARY}`),
  );
  section(
    "Solver",
    list([
      ["Analyze", "Result, solution count and statistics for the whole run."],
      ["Explain", "Step through each deduction: highlighted cells show what it reasons about, struck-through candidates show what it removes."],
    ]),
    "Solving happens in the background and does not change your saved puzzles.",
  );
  const table = el("table", undefined, "shortcut-table");
  const body = el("tbody");
  for (const action of SHORTCUT_ACTIONS) {
    const row = el("tr"),
      key = el("td");
    const combo = comboLabel(settings.shortcuts[action]);
    key.append(combo ? el("kbd", combo) : el("span", "Not set", "muted"));
    row.append(el("th", SHORTCUT_LABELS[action]), key);
    body.append(row);
  }
  table.append(body);
  section("Keyboard shortcuts", table);
  container.append(page);
  return () => {};
}
