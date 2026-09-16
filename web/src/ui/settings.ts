import type { ScreenServices } from "../app/controller";
import { el, field, button } from "./dom";
import { downloadBackup } from "./backup";
import { parseBackup, previewRestore } from "../domain/backup";
import { dialog } from "./dialogs";
import { labeledButton, switchField } from "./components";
import {
  renderSettingsSections,
  SECTION_TITLES,
  type SectionId,
} from "./settings-sections";

const PAGE_SECTIONS: SectionId[] = [
  "appearance",
  "accessibility",
  "board",
  "keypad",
  "notes",
  "timer",
  "completion",
  "shortcuts",
  "solver",
];
/** Sections that matter mid-game; the full page keeps the rest. */
const QUICK_SECTIONS: SectionId[] = ["board", "notes", "keypad", "timer", "completion"];

export function openQuickSettings(services: ScreenServices, focus?: SectionId): void {
  const d = dialog("Game settings", { className: "settings-dialog" });
  const off = renderSettingsSections(d.body, services, QUICK_SECTIONS);
  const all = button("All settings", () => {
    d.close();
    services.navigate({ screen: "settings" });
  }, "ghost");
  d.actions.append(all, button("Done", d.close, "primary"));
  d.node.addEventListener("close", off);
  if (focus) d.body.querySelector(`#settings-${focus}`)?.scrollIntoView({ block: "start" });
}

export function mountSettings(
  container: HTMLElement,
  services: ScreenServices,
): () => void {
  const page = el("div", undefined, "settings-page"),
    heading = el("div", undefined, "page-heading"),
    nav = el("nav", undefined, "settings-nav"),
    content = el("div", undefined, "settings-content");
  heading.append(el("h1", "Settings"));
  nav.setAttribute("aria-label", "Settings sections");
  for (const id of [...PAGE_SECTIONS, "data"] as const) {
    const link = el("a", id === "data" ? "Data & backup" : SECTION_TITLES[id]);
    link.href = `#settings-${id}`;
    link.addEventListener("click", (event) => {
      // Hash routing owns location.hash; scroll without navigating.
      event.preventDefault();
      content.querySelector(`#settings-${id}`)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    });
    nav.append(link);
  }
  page.append(heading, nav, content);
  container.append(page);
  const off = renderSettingsSections(content, services, PAGE_SECTIONS);

  const backup = el("section", undefined, "settings-section"),
    file = el("input"),
    error = el("p", undefined, "error");
  backup.id = "settings-data";
  file.type = "file";
  file.accept = ".json,application/json";
  file.hidden = true;
  error.setAttribute("role", "alert");
  error.hidden = true;
  const actions = el("div", undefined, "actions start");
  actions.append(
    labeledButton("download", "Export backup", () => downloadBackup(services)),
    labeledButton("upload", "Import backup", () => file.click()),
  );
  backup.append(
    el("h2", "Data & backup"),
    el("p", "Backups contain every draft, puzzle, game, note and setting in this browser.", "field-hint"),
    actions,
    error,
  );
  // Visually hidden label keeps the file input reachable by name for assistive tech and tests.
  const fileLabel = field("Import backup file", file);
  fileLabel.className = "sr-only";
  backup.append(fileLabel);
  content.append(backup);
  let active = true;
  file.addEventListener("change", async () => {
    const selected = file.files?.[0];
    file.value = "";
    if (!selected) return;
    error.hidden = true;
    try {
      const incoming = parseBackup(await selected.text());
      if (!active) return;
      const d = dialog("Import preview"),
        summary = el("p", undefined, "import-summary"),
        notice = el("p", undefined, "error");
      let captured = services.controller.snapshot(),
        preview = previewRestore(captured, incoming, services.newId, false);
      const restore = switchField({ label: "Restore settings from backup", checked: false, onChange: () => refresh() });
      const refresh = () => {
        captured = services.controller.snapshot();
        preview = previewRestore(captured, incoming, services.newId, restore.input.checked);
        summary.textContent = `New: ${preview.added} · Copies: ${preview.copied} · Skipped: ${preview.skipped}`;
      };
      d.body.append(summary, restore.node, notice);
      refresh();
      d.actions.append(
        button("Cancel", d.close),
        button(
          "Apply import",
          () => {
            if (services.controller.snapshot() !== captured) {
              refresh();
              notice.textContent = "The library changed. Review the updated summary and apply again.";
              return;
            }
            services.controller.update(() => preview.data);
            d.close();
          },
          "primary",
        ),
      );
    } catch (e) {
      if (active) {
        error.hidden = false;
        error.textContent = (e as Error).message;
      }
    }
  });
  return () => {
    active = false;
    off();
  };
}
