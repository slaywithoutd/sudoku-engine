import type { ScreenServices } from "../app/controller";
import { el, field, button } from "./dom";
import { downloadBackup } from "./backup";
import { parseBackup, previewRestore } from "../domain/backup";
import { dialog } from "./dialogs";
import { COLOR_MODES, THEMES } from "../domain/model";
export function mountSettings(
  container: HTMLElement,
  services: ScreenServices,
): () => void {
  container.append(
    el("h1", "Settings"),
    el("p", "Your way to play, in this browser.", "muted"),
  );
  const appearance = el(
    "section",
    undefined,
    "settings-panel appearance-panel",
  );
  appearance.append(
    el("h2", "Appearance"),
    el(
      "p",
      "Choose a mode and a soft pastel color. Your choices are saved in this browser.",
    ),
  );
  const appearanceInputs: {
    input: HTMLInputElement;
    key: "colorMode" | "theme";
    value: string;
  }[] = [];
  for (const { key, title, values } of [
    { key: "colorMode", title: "Display mode", values: COLOR_MODES },
    { key: "theme", title: "Pastel theme", values: THEMES },
  ] as const) {
    const group = el("fieldset", undefined, "appearance-group");
    const choices = el("div", undefined, "appearance-choices");
    group.append(el("legend", title), choices);
    for (const value of values) {
      const label = el("label", undefined, "appearance-option");
      const radio = el("input");
      radio.type = "radio";
      radio.name = key;
      radio.value = value;
      radio.checked = services.controller.snapshot().settings[key] === value;
      radio.addEventListener("change", () => {
        if (radio.checked)
          services.controller.update((data) => ({
            ...data,
            settings: { ...data.settings, [key]: value },
          }));
      });
      label.append(radio);
      if (key === "theme") {
        label.dataset.theme = value;
        const swatch = el("span", undefined, "theme-swatch");
        swatch.setAttribute("aria-hidden", "true");
        label.append(swatch);
      }
      const check = el("span", "✓", "choice-check");
      check.setAttribute("aria-hidden", "true");
      label.append(el("span", value[0].toUpperCase() + value.slice(1)), check);
      choices.append(label);
      appearanceInputs.push({ input: radio, key, value });
    }
    appearance.append(group);
  }
  container.append(appearance);
  const panel = el("section", undefined, "settings-panel"),
    input = el("input");
  input.type = "checkbox";
  input.checked = services.controller.snapshot().settings.showConflicts;
  input.addEventListener("change", () =>
    services.controller.update((d) => ({
      ...d,
      settings: { ...d.settings, showConflicts: input.checked },
    })),
  );
  panel.append(
    el("h2", "During play"),
    field("Highlight conflicts during play", input),
    el(
      "p",
      "The creator always shows conflicts. This setting only affects play mode.",
      "muted",
    ),
  );
  container.append(panel);
  const backup = el("section", undefined, "settings-panel"),
    file = el("input"),
    error = el("p", undefined, "error");
  file.type = "file";
  file.accept = ".json,application/json";
  error.setAttribute("role", "alert");
  error.hidden = true;
  let active = true;
  backup.append(
    el("h2", "Take your library with you"),
    el(
      "p",
      "Backups include your drafts, puzzles, notes, histories and settings. Different records are preserved as copies when imported.",
    ),
    button("Export backup", () => downloadBackup(services)),
    field("Import backup", file),
    error,
  );
  container.append(backup);
  file.addEventListener("change", async () => {
    const selected = file.files?.[0];
    file.value = "";
    if (!selected) return;
    error.hidden = true;
    try {
      const incoming = parseBackup(await selected.text());
      if (!active) return;
      const d = dialog("Import preview"),
        summary = el("p"),
        restore = el("input"),
        notice = el("p", undefined, "error");
      restore.type = "checkbox";
      let captured = services.controller.snapshot(),
        preview = previewRestore(captured, incoming, services.newId, false);
      const refresh = () => {
        captured = services.controller.snapshot();
        preview = previewRestore(
          captured,
          incoming,
          services.newId,
          restore.checked,
        );
        summary.textContent = `New: ${preview.added} · Copies: ${preview.copied} · Skipped: ${preview.skipped}`;
      };
      d.body.append(
        summary,
        field("Restore settings from backup", restore),
        notice,
      );
      restore.addEventListener("change", refresh);
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
  const off = services.controller.subscribe(() => {
    const settings = services.controller.snapshot().settings;
    input.checked = settings.showConflicts;
    for (const choice of appearanceInputs)
      choice.input.checked = settings[choice.key] === choice.value;
  });
  return () => {
    active = false;
    off();
  };
}
