import { emptyEditor, type Settings } from "../domain/model";
import {
  IMPORT_EXTENSIONS,
  IMPORT_FORMATS_SUMMARY,
  parsePuzzles,
  type ParsedPuzzle,
} from "../domain/puzzle-format";
import { el, button } from "./dom";
import { dialog } from "./dialogs";
import { labeledButton } from "./components";
import { icon } from "./icons";
import { mountBoard, type BoardView } from "./board";

/**
 * One import experience for Create and Solve: paste or drop text, choose a
 * file, preview the first puzzle and see precise validation errors.
 */
export function openImportDialog(options: {
  title: string;
  settings: Settings;
  /** Label for importing the previewed puzzle. */
  confirmLabel: string;
  /** When set, collections can be imported at once (e.g. as drafts). */
  allLabel?: (count: number) => string;
  onImport: (puzzles: ParsedPuzzle[]) => void;
}): void {
  const d = dialog(options.title, { className: "import-dialog" });
  const layout = el("div", undefined, "import-layout"),
    source = el("div", undefined, "import-source"),
    preview = el("div", undefined, "import-preview"),
    textarea = el("textarea"),
    label = el("label", "Puzzle text", "field-label"),
    drop = el("div", undefined, "drop-zone"),
    file = el("input"),
    status = el("p", undefined, "import-status"),
    hint = el("p", IMPORT_FORMATS_SUMMARY, "field-hint");
  textarea.id = crypto.randomUUID();
  label.htmlFor = textarea.id;
  textarea.spellcheck = false;
  textarea.rows = 5;
  textarea.placeholder = "530070000600195000098000060…";
  textarea.setAttribute("aria-describedby", `${status.id = crypto.randomUUID()}`);
  status.setAttribute("aria-live", "polite");
  file.type = "file";
  file.accept = IMPORT_EXTENSIONS.join(",");
  file.hidden = true;
  const choose = labeledButton("upload", "Choose file", () => file.click(), "secondary");
  drop.append(icon("file"), el("span", "Drop a file here or"), choose, file);
  source.append(label, textarea, hint, drop);
  const boardHost = el("div", undefined, "import-board");
  let board: BoardView | undefined;
  // The board context fixes which cells are clues, so each preview remounts it.
  const showPreview = (puzzle: ParsedPuzzle | undefined) => {
    board?.destroy();
    board = mountBoard(boardHost, {
      context: { mode: "play", givens: puzzle?.givens ?? Array(81).fill(0) },
      state: { ...emptyEditor(), cells: puzzle?.cells ?? emptyEditor().cells },
      display: { ...options.settings, showConflicts: true, highlightPeers: false, highlightSameDigit: false, showLabels: false },
      onAction: () => {},
      interactive: false,
      label: "Import preview",
    });
  };
  preview.append(boardHost, status);
  layout.append(source, preview);
  d.body.append(layout);

  const confirm = button(options.confirmLabel, () => submit(false), "primary"),
    all = button("", () => submit(true));
  all.hidden = true;
  d.actions.append(button("Cancel", d.close), all, confirm);

  let parsed: ParsedPuzzle[] = [];
  const render = () => {
    const result = parsePuzzles(textarea.value);
    parsed = result.puzzles;
    const first = parsed[0];
    preview.classList.toggle("empty", !first);
    showPreview(first);
    status.classList.toggle("error", !!result.error && !!textarea.value.trim());
    status.setAttribute("role", result.error && textarea.value.trim() ? "alert" : "status");
    if (!textarea.value.trim()) status.textContent = "Nothing to preview yet.";
    else if (result.error) status.textContent = result.error;
    else {
      const parts = [`${first.clues} clues`, first.conflicts ? `${first.conflicts} cells in conflict` : "no conflicts"];
      if (first.cells) parts.push("includes progress");
      if (parsed.length > 1) parts.unshift(`${parsed.length} puzzles — showing the first`);
      status.textContent = parts.join(" · ");
      status.classList.toggle("warning", !!first.conflicts);
    }
    confirm.disabled = !first;
    all.hidden = !options.allLabel || parsed.length < 2;
    if (options.allLabel && parsed.length > 1) all.textContent = options.allLabel(parsed.length);
  };
  const submit = (everything: boolean) => {
    if (!parsed.length) return;
    d.close();
    options.onImport(everything ? parsed : [parsed[0]]);
  };
  const loadFile = async (selected: File | undefined) => {
    if (!selected) return;
    if (selected.size > 2_000_000) {
      textarea.value = "";
      render();
      status.textContent = "That file is too large for a puzzle (over 2 MB).";
      status.classList.add("error");
      return;
    }
    textarea.value = await selected.text();
    render();
    confirm.focus();
  };
  textarea.addEventListener("input", render);
  file.addEventListener("change", () => {
    void loadFile(file.files?.[0]);
    file.value = "";
  });
  for (const target of [drop, textarea]) {
    target.addEventListener("dragover", (event) => {
      event.preventDefault();
      drop.classList.add("dragging");
    });
    target.addEventListener("dragleave", () => drop.classList.remove("dragging"));
    target.addEventListener("drop", (event) => {
      event.preventDefault();
      drop.classList.remove("dragging");
      void loadFile((event as DragEvent).dataTransfer?.files[0]);
    });
  }
  render();
  textarea.focus();
}
