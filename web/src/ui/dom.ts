export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function button(
  text: string,
  onClick: (event: MouseEvent) => void,
  className = "",
): HTMLButtonElement {
  const node = el("button", text, className);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}
export function field(
  labelText: string,
  input: HTMLInputElement | HTMLTextAreaElement,
): HTMLLabelElement {
  const label = el("label", labelText);
  label.append(input);
  return label;
}
