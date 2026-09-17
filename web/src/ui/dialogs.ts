import { el, button, field } from "./dom";
import { iconButton } from "./components";
export function dialog(
  title: string,
  options: { className?: string; description?: string } = {},
): {
  node: HTMLDialogElement;
  body: HTMLElement;
  actions: HTMLElement;
  close: () => void;
} {
  const node = el("dialog", undefined, options.className),
    header = el("header", undefined, "dialog-header"),
    heading = el("h2", title),
    body = el("div", undefined, "dialog-body"),
    actions = el("div", undefined, "actions");
  heading.id = crypto.randomUUID();
  node.setAttribute("aria-labelledby", heading.id);
  header.append(
    heading,
    iconButton("close", "Close", () => close(), "ghost dialog-close"),
  );
  node.append(header);
  if (options.description) {
    const description = el("p", options.description, "dialog-description");
    description.id = crypto.randomUUID();
    node.setAttribute("aria-describedby", description.id);
    node.append(description);
  }
  node.append(body, actions);
  // Dialogs open inside the fullscreen element so they stay visible there.
  (document.fullscreenElement ?? document.body).append(node);
  const previous = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    node.close();
    node.remove();
    if (previous instanceof HTMLElement && previous.isConnected)
      previous.focus({ preventScroll: true });
  };
  node.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  node.showModal();
  return { node, body, actions, close };
}
export function confirmDialog(options: {
  title: string;
  message: string;
  confirm: string;
  danger?: boolean;
  onConfirm: () => void;
  extra?: HTMLElement;
}): void {
  const d = dialog(options.title);
  d.body.append(el("p", options.message));
  if (options.extra) d.body.append(options.extra);
  const confirm = button(
    options.confirm,
    () => {
      d.close();
      options.onConfirm();
    },
    options.danger ? "danger" : "primary",
  );
  d.actions.append(button("Cancel", d.close), confirm);
  confirm.focus();
}
export function confirmDelete(name: string, apply: () => void): void {
  confirmDialog({
    title: "Delete this record?",
    message: `“${name}” will be deleted, including any play progress. You will need a backup to recover it.`,
    confirm: "Delete",
    danger: true,
    onConfirm: apply,
  });
}
export function renameDialog(name: string, apply: (name: string) => void): void {
  const d = dialog("Rename"),
    input = el("input"),
    form = el("form");
  input.value = name;
  input.maxLength = 120;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    apply(input.value);
    d.close();
  });
  form.append(field("Name", input));
  d.body.append(form);
  d.actions.append(
    button("Cancel", d.close),
    button("Save", () => form.requestSubmit(), "primary"),
  );
  input.focus();
  input.select();
}
