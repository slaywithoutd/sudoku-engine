import type { ScreenServices } from "../app/controller";
import { el, field, button } from "./dom";
import { downloadBackup } from "./backup";
import { parseBackup, previewRestore } from "../domain/backup";
import { dialog } from "./dialogs";
import { labeledButton, switchField } from "./components";
import {
  mountLivePreview,
  renderSettingsSections,
  SECTION_TITLES,
  type SectionId,
} from "./settings-sections";

/** Board- and gameplay-affecting settings first; input configuration last. */
const PAGE_SECTIONS: SectionId[] = [
  "appearance",
  "accessibility",
  "board",
  "keypad",
  "notes",
  "timer",
  "completion",
  "solver",
  "shortcuts",
];
/** Sections that matter mid-game; the full page keeps the rest. */
const QUICK_SECTIONS: SectionId[] = ["board", "notes", "keypad", "timer", "completion"];

export function openQuickSettings(services: ScreenServices, focus?: SectionId): void {
  const d = dialog("Game settings", { className: "settings-dialog" });
  const off = renderSettingsSections(d.body, services, QUICK_SECTIONS);
  const all = button(
    "All settings",
    () => {
      d.close();
      services.navigate({ screen: "settings" });
    },
    "ghost",
  );
  d.actions.append(all, button("Done", d.close, "primary"));
  d.node.addEventListener("close", () => {
    off();
  });
  if (focus) d.body.querySelector(`#settings-${focus}`)?.scrollIntoView({ block: "start" });
}

export function mountSettings(container: HTMLElement, services: ScreenServices): () => void {
  const page = el("div", undefined, "settings-page"),
    heading = el("div", undefined, "page-heading"),
    nav = el("nav", undefined, "settings-toc"),
    content = el("div", undefined, "settings-content");
  heading.append(el("h1", "Settings"));
  nav.setAttribute("aria-label", "On this page");
  const links = new Map<string, HTMLAnchorElement>();
  nav.append(el("p", "On this page", "settings-toc-label"));
  for (const id of [...PAGE_SECTIONS, "data"] as const) {
    const link = el("a", id === "data" ? "Data & backup" : SECTION_TITLES[id]);
    link.href = `#settings-${id}`;
    link.addEventListener("click", (event) => {
      // Hash routing owns location.hash; scroll without navigating.
      event.preventDefault();
      content.querySelector(`#settings-${id}`)?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });
    links.set(id, link);
    nav.append(link);
  }
  page.append(heading, content, nav);
  container.append(page);
  const preview = mountLivePreview(content, services.controller.snapshot().settings);
  const off = renderSettingsSections(content, services, PAGE_SECTIONS);
  const offPreview = services.controller.subscribe(() =>
    preview.update(services.controller.snapshot().settings),
  );

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
    el(
      "p",
      "Backups contain every draft, puzzle, game, note and setting in this browser.",
      "field-hint",
    ),
    actions,
    error,
  );
  // Visually hidden label keeps the file input reachable by name for assistive tech and tests.
  const fileLabel = field("Import backup file", file);
  fileLabel.className = "sr-only";
  backup.append(fileLabel);
  content.append(backup);

  // Highlights whichever section currently crosses a thin activation line
  // near the top of the viewport, so scrolling always shows which section
  // you are reading. A boolean crossing (rather than comparing intersection
  // ratios, which IntersectionObserver only reports at the chosen
  // thresholds) is what keeps this accurate while continuously scrolling.
  const order = [...links.keys()];
  const crossing = new Set<string>();
  const setActive = () => {
    const current = order.filter((id) => crossing.has(id)).at(-1);
    for (const [id, link] of links)
      if (id === current) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
  };
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).id.replace(/^settings-/, "");
        if (entry.isIntersecting) crossing.add(id);
        else crossing.delete(id);
      }
      setActive();
    },
    { rootMargin: "-20% 0px -79% 0px", threshold: 0 },
  );
  for (const id of links.keys()) {
    const section = content.querySelector(`#settings-${id}`);
    if (section) observer.observe(section);
  }

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
      const restore = switchField({
        label: "Restore settings from backup",
        checked: false,
        onChange: () => refresh(),
      });
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
              notice.textContent =
                "The library changed. Review the updated summary and apply again.";
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
    offPreview();
    preview.destroy();
    observer.disconnect();
  };
}
