import { el, button } from "./dom";
import { icon, type IconName } from "./icons";

/** Icon-only button with an accessible name and a native tooltip. */
export function iconButton(
  name: IconName,
  label: string,
  onClick: (event: MouseEvent) => void,
  className = "",
): HTMLButtonElement {
  const node = button("", onClick, `icon-button ${className}`.trim());
  node.setAttribute("aria-label", label);
  node.title = label;
  node.append(icon(name));
  return node;
}

/** Button with a leading icon and visible text. */
export function labeledButton(
  name: IconName,
  text: string,
  onClick: (event: MouseEvent) => void,
  className = "",
): HTMLButtonElement {
  const node = button("", onClick, `with-icon ${className}`.trim());
  // Compact layouts hide the text visually; the name must survive that.
  node.setAttribute("aria-label", text);
  node.append(icon(name), el("span", text));
  return node;
}

export interface SegmentOption<T> {
  value: T;
  label: string;
  icon?: IconName;
  /** Show only the icon; the label stays the accessible name. */
  iconOnly?: boolean;
  hint?: string;
}
export interface Segmented<T> {
  node: HTMLElement;
  set(value: T): void;
  setDisabled(disabled: boolean): void;
}
/** Single-choice switch (radiogroup) with roving focus and arrow keys. */
export function segmented<T extends string | number>(options: {
  label: string;
  items: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}): Segmented<T> {
  const node = el("div", undefined, `segmented ${options.className ?? ""}`.trim());
  node.setAttribute("role", "radiogroup");
  node.setAttribute("aria-label", options.label);
  let current = options.value;
  const buttons = options.items.map((item) => {
    const b = button("", () => choose(item.value, false), "segment");
    b.setAttribute("role", "radio");
    b.dataset.value = String(item.value);
    if (item.icon) b.append(icon(item.icon));
    if (item.iconOnly) {
      b.setAttribute("aria-label", item.label);
      b.title = item.hint ?? item.label;
    } else {
      b.append(el("span", item.label));
      if (item.hint) b.title = item.hint;
    }
    node.append(b);
    return b;
  });
  const render = () =>
    buttons.forEach((b, i) => {
      const on = options.items[i].value === current;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    });
  const choose = (value: T, focus: boolean) => {
    const changed = value !== current;
    current = value;
    render();
    if (focus) buttons[options.items.findIndex((i) => i.value === value)].focus();
    if (changed) options.onChange(value);
  };
  node.addEventListener("keydown", (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    event.stopPropagation();
    const index = options.items.findIndex((i) => i.value === current),
      next = options.items[(index + step + options.items.length) % options.items.length];
    choose(next.value, true);
  });
  render();
  return {
    node,
    set(value) {
      current = value;
      render();
    },
    setDisabled(disabled) {
      buttons.forEach((b) => (b.disabled = disabled));
    },
  };
}

export interface SwitchField {
  node: HTMLElement;
  input: HTMLInputElement;
  set(checked: boolean): void;
}
/** On/off setting rendered as a switch with an optional one-line hint. */
export function switchField(options: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}): SwitchField {
  const node = el("label", undefined, "switch-field"),
    text = el("span", undefined, "field-text"),
    input = el("input");
  input.type = "checkbox";
  input.setAttribute("role", "switch");
  input.checked = options.checked;
  input.addEventListener("change", () => options.onChange(input.checked));
  text.append(el("span", options.label, "field-label"));
  if (options.hint) text.append(el("span", options.hint, "field-hint"));
  node.append(text, input);
  return { node, input, set: (checked) => (input.checked = checked) };
}

export type MenuEntry =
  | {
      label: string;
      icon?: IconName;
      onSelect: () => void;
      disabled?: boolean;
      danger?: boolean;
      shortcut?: string;
    }
  | "separator";

let openPopover: { close(): void } | undefined;

/** Positions a top-layer popover below (or above) its anchor, inside the viewport. */
function place(popover: HTMLElement, anchor: HTMLElement, matchWidth: boolean) {
  const rect = anchor.getBoundingClientRect(),
    margin = 8;
  if (matchWidth) popover.style.minWidth = `${rect.width}px`;
  const width = popover.offsetWidth,
    height = popover.offsetHeight;
  let left = Math.min(rect.left, innerWidth - width - margin);
  if (!matchWidth && rect.right - width >= margin && rect.left + width > innerWidth - margin)
    left = rect.right - width;
  left = Math.max(margin, left);
  const below = rect.bottom + 6,
    top = below + height > innerHeight - margin && rect.top - height - 6 > margin
      ? rect.top - height - 6
      : Math.max(margin, Math.min(below, innerHeight - height - margin));
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function showPopover(
  popover: HTMLElement,
  anchor: HTMLElement,
  matchWidth: boolean,
  onClose: () => void,
): () => void {
  openPopover?.close();
  popover.setAttribute("popover", "auto");
  // Popovers live beside the anchor so fullscreen and dialogs keep them visible.
  (anchor.closest("dialog") ?? document.body).append(popover);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (popover.matches(":popover-open")) popover.hidePopover();
    popover.remove();
    removeEventListener("resize", close);
    if (openPopover === handle) openPopover = undefined;
    onClose();
  };
  const handle = { close };
  popover.addEventListener("toggle", (event) => {
    if ((event as ToggleEvent).newState === "closed") close();
  });
  popover.showPopover();
  place(popover, anchor, matchWidth);
  addEventListener("resize", close);
  openPopover = handle;
  return close;
}

function rovingKeys(container: HTMLElement, selector: string, event: KeyboardEvent): boolean {
  const items = [...container.querySelectorAll<HTMLElement>(selector)].filter(
    (item) => !(item as HTMLButtonElement).disabled && item.getAttribute("aria-disabled") !== "true",
  );
  if (!items.length) return false;
  const index = items.indexOf(document.activeElement as HTMLElement);
  const target =
    event.key === "ArrowDown"
      ? items[(index + 1) % items.length]
      : event.key === "ArrowUp"
        ? items[(index - 1 + items.length) % items.length]
        : event.key === "Home"
          ? items[0]
          : event.key === "End"
            ? items.at(-1)
            : undefined;
  if (!target) return false;
  event.preventDefault();
  target.focus();
  return true;
}

/** Button that opens an action menu; entries are built on every open. */
export function menuButton(
  trigger: HTMLButtonElement,
  entries: () => MenuEntry[],
): HTMLButtonElement {
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  let close: (() => void) | undefined,
    closedAt = 0;
  trigger.addEventListener("click", () => {
    if (close) return close();
    if (performance.now() - closedAt < 300) return;
    const menu = el("div", undefined, "menu");
    menu.setAttribute("role", "menu");
    for (const entry of entries()) {
      if (entry === "separator") {
        const hr = el("div", undefined, "menu-separator");
        hr.setAttribute("role", "separator");
        menu.append(hr);
        continue;
      }
      const item = button(
        "",
        () => {
          close?.();
          entry.onSelect();
        },
        `menu-item${entry.danger ? " danger" : ""}`,
      );
      item.setAttribute("role", "menuitem");
      item.tabIndex = -1;
      item.disabled = !!entry.disabled;
      item.append(entry.icon ? icon(entry.icon) : el("span", undefined, "icon"), el("span", entry.label));
      if (entry.shortcut) item.append(el("kbd", entry.shortcut));
      menu.append(item);
    }
    menu.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Tab") close?.();
      else rovingKeys(menu, "[role=menuitem]", event);
    });
    trigger.setAttribute("aria-expanded", "true");
    close = showPopover(menu, trigger, false, () => {
      trigger.setAttribute("aria-expanded", "false");
      close = undefined;
      closedAt = performance.now();
      if (menu.contains(document.activeElement) || document.activeElement === document.body)
        trigger.focus({ preventScroll: true });
    });
    menu.querySelector<HTMLElement>("[role=menuitem]:not(:disabled)")?.focus();
  });
  return trigger;
}

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}
export interface SelectSection {
  title?: string;
  options: SelectOption[];
}
export interface SelectControl {
  node: HTMLElement;
  trigger: HTMLButtonElement;
  setSections(sections: SelectSection[]): void;
  setDisabled(disabled: boolean): void;
}
/**
 * Listbox select modelled on HeroUI Select: a labelled trigger, sectioned
 * options with descriptions, arrow keys, typeahead and Escape to close.
 * `value` is only a highlight — "action selects" (load from…) keep the placeholder.
 */
export function selectControl(options: {
  label: string;
  placeholder: string;
  sections: SelectSection[];
  emptyText: string;
  onSelect: (value: string) => void;
  icon?: IconName;
}): SelectControl {
  const node = el("div", undefined, "select"),
    trigger = button("", () => toggle(), "select-trigger"),
    labelNode = el("span", options.label, "select-label"),
    valueNode = el("span", options.placeholder, "select-value");
  const labelId = `select-${crypto.randomUUID()}`;
  labelNode.id = labelId;
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", options.label);
  const text = el("span", undefined, "select-text");
  text.append(labelNode, valueNode);
  if (options.icon) trigger.append(icon(options.icon));
  trigger.append(text, icon("chevronDown"));
  node.append(trigger);
  let sections = options.sections,
    close: (() => void) | undefined,
    closedAt = 0,
    typed = "",
    typedAt = 0;
  const toggle = () => {
    if (close) return close();
    if (performance.now() - closedAt < 300) return;
    const list = el("div", undefined, "listbox");
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-labelledby", labelId);
    const all = sections.flatMap((s) => s.options);
    if (!all.length) list.append(el("p", options.emptyText, "listbox-empty"));
    for (const section of sections) {
      if (!section.options.length) continue;
      const group = el("div", undefined, "listbox-section");
      group.setAttribute("role", "group");
      if (section.title) {
        const heading = el("div", section.title, "listbox-heading");
        heading.id = `section-${crypto.randomUUID()}`;
        group.setAttribute("aria-labelledby", heading.id);
        group.append(heading);
      }
      for (const option of section.options) {
        const item = el("div", undefined, "listbox-option");
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", "false");
        item.tabIndex = -1;
        item.dataset.value = option.value;
        item.append(el("span", option.label, "option-label"));
        if (option.description) item.append(el("span", option.description, "option-description"));
        item.addEventListener("click", () => {
          close?.();
          options.onSelect(option.value);
        });
        group.append(item);
      }
      list.append(group);
    }
    list.addEventListener("keydown", (event) => {
      event.stopPropagation();
      const focused = document.activeElement as HTMLElement;
      if (event.key === "Enter" || event.key === " ") {
        if (focused?.getAttribute("role") === "option") {
          event.preventDefault();
          focused.click();
        }
      } else if (event.key === "Tab") close?.();
      else if (!rovingKeys(list, "[role=option]", event) && event.key.length === 1) {
        const now = Date.now();
        typed = now - typedAt > 700 ? event.key.toLowerCase() : typed + event.key.toLowerCase();
        typedAt = now;
        [...list.querySelectorAll<HTMLElement>("[role=option]")]
          .find((o) => o.textContent!.toLowerCase().startsWith(typed))
          ?.focus();
      }
    });
    list.addEventListener("focusin", (event) => {
      list.querySelectorAll("[role=option]").forEach((o) => o.setAttribute("aria-selected", String(o === event.target)));
    });
    trigger.setAttribute("aria-expanded", "true");
    node.classList.add("open");
    close = showPopover(list, trigger, true, () => {
      trigger.setAttribute("aria-expanded", "false");
      node.classList.remove("open");
      close = undefined;
      closedAt = performance.now();
      if (list.contains(document.activeElement) || document.activeElement === document.body)
        trigger.focus({ preventScroll: true });
    });
    (list.querySelector<HTMLElement>("[role=option]") ?? list).focus();
  };
  trigger.addEventListener("keydown", (event) => {
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !close) {
      event.preventDefault();
      toggle();
    }
  });
  return {
    node,
    trigger,
    setSections(next) {
      sections = next;
    },
    setDisabled(disabled) {
      trigger.disabled = disabled;
      if (disabled) close?.();
    },
  };
}

/** Keyboard label for a stored combo, adapted to the platform. */
export function comboLabel(combo: string): string {
  if (!combo) return "";
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  return combo
    .split("+")
    .map((part) =>
      part === "Ctrl" ? (mac ? "⌘" : "Ctrl") : part === "Alt" ? (mac ? "⌥" : "Alt") : part === "Shift" ? (mac ? "⇧" : "Shift") : part === "Delete" ? "Del" : part === "Escape" ? "Esc" : part,
    )
    .join(mac ? "" : "+");
}
