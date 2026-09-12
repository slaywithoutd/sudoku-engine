import { el, button, field } from "./dom";
export function dialog(title: string): {
  node: HTMLDialogElement;
  body: HTMLElement;
  actions: HTMLElement;
  close: () => void;
} {
  const node = el("dialog"),
    heading = el("h2", title),
    body = el("div"),
    actions = el("div", undefined, "actions");
  heading.id = crypto.randomUUID();
  node.setAttribute("aria-labelledby", heading.id);
  node.append(heading, body, actions);
  document.body.append(node);
  const previous = document.activeElement;
  const close = () => {
    node.close();
    node.remove();
    if (previous instanceof HTMLElement && previous.isConnected)
      previous.focus();
  };
  node.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  node.showModal();
  return { node, body, actions, close };
}
export function confirmDelete(name: string, apply: () => void): void {
  const d = dialog("Delete this record?");
  d.body.append(
    el(
      "p",
      `“${name}” will be deleted, including any play progress. You will need a backup to recover it.`,
    ),
  );
  d.actions.append(
    button("Cancel", d.close),
    button(
      "Confirm deletion",
      () => {
        apply();
        d.close();
      },
      "danger",
    ),
  );
}
export function renameDialog(
  name: string,
  apply: (name: string) => void,
): void {
  const d = dialog("Rename"),
    input = el("input");
  input.value = name;
  d.body.append(field("New name", input));
  d.actions.append(
    button("Cancel", d.close),
    button(
      "Save name",
      () => {
        apply(input.value);
        d.close();
      },
      "primary",
    ),
  );
  input.focus();
  input.select();
}
