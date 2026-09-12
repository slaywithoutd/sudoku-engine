import type { ScreenServices } from "../app/controller";
import {
  copyPuzzleToDraft,
  deleteRecord,
  renameRecord,
} from "../domain/library";
import { effectiveValues, isComplete } from "../domain/classic";
import { el, button } from "./dom";
import { confirmDelete, renameDialog } from "./dialogs";
import { newDraft } from "./home";
export function mountLibrary(
  container: HTMLElement,
  services: ScreenServices,
  tab: "drafts" | "puzzles",
): () => void {
  const heading = el("div", undefined, "page-heading");
  heading.append(
    el("h1", "Your library"),
    button("Create", () => newDraft(services), "primary"),
  );
  const tabs = el("div", undefined, "tabs");
  for (const [key, label] of [
    ["puzzles", "Puzzles"],
    ["drafts", "Drafts"],
  ] as const) {
    const b = button(label, () =>
      services.navigate({ screen: "library", tab: key }),
    );
    b.setAttribute("aria-pressed", String(tab === key));
    tabs.append(b);
  }
  const future = button("Explore — coming soon", () => {});
  future.disabled = true;
  tabs.append(future);
  const list = el("div", undefined, "library-list");
  container.append(heading, tabs, list);
  let previous: unknown;
  function render() {
    const data = services.controller.snapshot();
    const records = tab === "drafts" ? data.drafts : data.puzzles;
    const identity = [records, data.sessions];
    if (
      previous &&
      Array.isArray(previous) &&
      previous[0] === records &&
      previous[1] === data.sessions
    )
      return;
    previous = identity;
    list.replaceChildren();
    const items =
      tab === "drafts"
        ? Object.values(data.drafts).filter((d) => !d.finishedPuzzleId)
        : Object.values(data.puzzles);
    if (!items.length) {
      list.append(
        el(
          "div",
          tab === "drafts"
            ? "No drafts yet. Create your first Sudoku."
            : "Your library is ready for its first puzzle. Create and finish a draft to get started.",
          "empty-state",
        ),
      );
      return;
    }
    for (const record of items) {
      const row = el("article", undefined, "library-item"),
        info = el("div"),
        actions = el("div", undefined, "actions");
      let status = "Draft";
      if (tab === "puzzles") {
        const session = data.sessions[record.id];
        status = !session
          ? "Ready"
          : isComplete(
                effectiveValues(
                  session.editor,
                  data.puzzles[record.id].definition.givens,
                ),
              )
            ? "Completed"
            : "In progress";
      }
      info.append(el("span", status, "badge"), el("h2", record.name));
      if (tab === "puzzles")
        info.append(
          el("small", "Solvability and uniqueness have not been checked."),
        );
      const kind = tab === "drafts" ? "draft" : "puzzle";
      actions.append(
        button(
          tab === "drafts"
            ? "Open"
            : data.sessions[record.id]
              ? "Continue"
              : "Play",
          () =>
            services.navigate({
              screen: tab === "drafts" ? "create" : "play",
              id: record.id,
            }),
          "primary",
        ),
      );
      actions.append(
        button("Rename", () =>
          renameDialog(record.name, (name) =>
            services.controller.update((d) =>
              renameRecord(d, kind, record.id, name, services.now()),
            ),
          ),
        ),
      );
      if (tab === "puzzles")
        actions.append(
          button("Edit copy", () => {
            const id = services.newId();
            services.controller.update((d) =>
              copyPuzzleToDraft(d, record.id, id, services.now()),
            );
            services.navigate({ screen: "create", id });
          }),
        );
      actions.append(
        button("Delete", () =>
          confirmDelete(record.name, () =>
            services.controller.update((d) => deleteRecord(d, kind, record.id)),
          ),
        ),
      );
      row.append(info, actions);
      list.append(row);
    }
  }
  render();
  return services.controller.subscribe(render);
}
