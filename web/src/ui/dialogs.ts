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
  const d = dialog("Excluir este registro?");
  d.body.append(
    el(
      "p",
      `“${name}” será excluído. Para um jogo, isso inclui seu progresso. A recuperação depende de um backup.`,
    ),
  );
  d.actions.append(
    button("Cancelar", d.close),
    button(
      "Confirmar exclusão",
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
  const d = dialog("Renomear"),
    input = el("input");
  input.value = name;
  d.body.append(field("Novo nome", input));
  d.actions.append(
    button("Cancelar", d.close),
    button(
      "Salvar nome",
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
