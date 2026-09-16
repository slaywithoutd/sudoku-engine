import type { ScreenServices } from "../app/controller";
import {
  copyPuzzleToDraft,
  deleteRecord,
  renameRecord,
} from "../domain/library";
import { effectiveValues, isComplete } from "../domain/classic";
import type { Value } from "../domain/model";
import { formatDuration } from "../app/play-clock";
import { el, button } from "./dom";
import { confirmDelete, renameDialog } from "./dialogs";
import { iconButton, labeledButton, menuButton } from "./components";
import { newDraft } from "./home";
import { openImportDialog } from "./import-dialog";
import { importAsDrafts } from "./creator";

/** Tiny clue map so puzzles are recognizable at a glance. */
function thumbnail(givens: readonly Value[]): HTMLElement {
  const node = el("div", undefined, "thumbnail");
  node.setAttribute("aria-hidden", "true");
  givens.forEach((value) => node.append(el("span", undefined, value ? "filled" : "")));
  return node;
}

export function mountLibrary(
  container: HTMLElement,
  services: ScreenServices,
  tab: "drafts" | "puzzles",
): () => void {
  const heading = el("div", undefined, "page-heading"),
    headingActions = el("div", undefined, "actions");
  headingActions.append(
    labeledButton("upload", "Import", () =>
      openImportDialog({
        title: "Import puzzle",
        settings: services.controller.snapshot().settings,
        confirmLabel: "Import as new draft",
        allLabel: (count) => `Import all ${count}`,
        onImport: (puzzles) => {
          const id = importAsDrafts(services, puzzles);
          if (puzzles.length === 1) services.navigate({ screen: "create", id });
          else services.navigate({ screen: "library", tab: "drafts" });
        },
      }),
    ),
    labeledButton("pen", "Create", () => newDraft(services), "primary"),
  );
  heading.append(el("h1", "Library"), headingActions);
  const tabs = el("div", undefined, "segmented tabs");
  tabs.setAttribute("aria-label", "Library sections");
  const counts = new Map<string, HTMLElement>();
  for (const [key, label] of [
    ["puzzles", "Puzzles"],
    ["drafts", "Drafts"],
  ] as const) {
    const b = button("", () => services.navigate({ screen: "library", tab: key }), "segment");
    const count = el("span", undefined, "count");
    counts.set(key, count);
    b.append(el("span", label), count);
    b.setAttribute("aria-pressed", String(tab === key));
    tabs.append(b);
  }
  const list = el("div", undefined, "library-list");
  container.append(heading, tabs, list);
  let previous: unknown[] = [];
  function render() {
    const data = services.controller.snapshot();
    const identity = [data.drafts, data.puzzles, data.sessions];
    if (identity.every((part, i) => part === previous[i])) return;
    previous = identity;
    const drafts = Object.values(data.drafts).filter((d) => !d.finishedPuzzleId),
      puzzles = Object.values(data.puzzles);
    counts.get("puzzles")!.textContent = String(puzzles.length);
    counts.get("drafts")!.textContent = String(drafts.length);
    list.replaceChildren();
    const items = tab === "drafts" ? drafts : puzzles;
    if (!items.length) {
      const empty = el("div", undefined, "empty-state");
      empty.append(
        el("h2", tab === "drafts" ? "No drafts" : "No puzzles yet"),
        el("p", tab === "drafts" ? "Drafts you create or import appear here." : "Finish a draft to add it here."),
        labeledButton("pen", "Create a puzzle", () => newDraft(services), "primary"),
      );
      list.append(empty);
      return;
    }
    const sorted = [...items].sort((a, b) => {
      const time = (r: typeof a) => ("updatedAt" in r ? r.updatedAt : data.sessions[r.id]?.updatedAt ?? r.createdAt);
      return time(b).localeCompare(time(a));
    });
    for (const record of sorted) {
      const row = el("article", undefined, "library-item"),
        info = el("div", undefined, "library-info"),
        meta = el("p", undefined, "library-meta"),
        actions = el("div", undefined, "actions");
      const isPuzzle = tab === "puzzles";
      const givens: readonly Value[] = isPuzzle
        ? data.puzzles[record.id].definition.givens
        : data.drafts[record.id].editor.cells.map((c) => c.value);
      const session = isPuzzle ? data.sessions[record.id] : undefined;
      const status = !isPuzzle
        ? "Draft"
        : !session
          ? "New"
          : isComplete(effectiveValues(session.editor, givens))
            ? "Solved"
            : "In progress";
      const badge = el("span", status, `badge ${status.toLowerCase().replace(" ", "-")}`);
      const title = el("h2", record.name);
      const metaParts = [`${givens.filter(Boolean).length} clues`];
      const played = session?.timer?.elapsedMs ?? 0;
      if (played >= 1000) metaParts.push(formatDuration(played));
      meta.append(badge, el("span", metaParts.join(" · ")));
      info.append(title, meta);
      const kind = isPuzzle ? "puzzle" : "draft";
      const open = button(
        !isPuzzle ? "Edit" : status === "In progress" ? "Continue" : status === "Solved" ? "Review" : "Play",
        () => services.navigate({ screen: isPuzzle ? "play" : "create", id: record.id }),
        "primary",
      );
      open.setAttribute("aria-label", `${open.textContent} ${record.name}`);
      const solve = labeledButton("solve", "Solve", () =>
        services.navigate({ screen: "solve", source: { kind, id: record.id } }),
      );
      solve.setAttribute("aria-label", `Solve ${record.name}`);
      const more = menuButton(iconButton("more", `More actions for ${record.name}`, () => {}), () => [
        {
          label: "Rename",
          icon: "pen",
          onSelect: () =>
            renameDialog(record.name, (name) =>
              services.controller.update((d) => renameRecord(d, kind, record.id, name, services.now())),
            ),
        },
        ...(isPuzzle
          ? [
              {
                label: "Edit a copy",
                icon: "copy" as const,
                onSelect: () => {
                  const id = services.newId();
                  services.controller.update((d) => copyPuzzleToDraft(d, record.id, id, services.now()));
                  services.navigate({ screen: "create", id });
                },
              },
            ]
          : []),
        "separator",
        {
          label: "Delete",
          icon: "close",
          danger: true,
          onSelect: () =>
            confirmDelete(record.name, () => services.controller.update((d) => deleteRecord(d, kind, record.id))),
        },
      ]);
      actions.append(solve, more, open);
      row.append(thumbnail(givens), info, actions);
      list.append(row);
    }
  }
  render();
  return services.controller.subscribe(render);
}
